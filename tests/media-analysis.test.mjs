import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {backupBeforeMediaAnalysis} from '../app/media-analysis.mjs';
import {createMockAnalysisProvider,validateAnalysisResult,matchAnalysisResult,analysisDigest} from '../app/analysis-model.mjs';

const jpeg=Buffer.from('ffd8ffc0000b080001000101011100ffd9','hex');
function bitmap(color=40){const b=Buffer.alloc(58,color);b.fill(0,0,54);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(1,18);b.writeInt32LE(1,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);return b;}
function result(overrides={}){return {schema:1,description:{hu:'MOCK leírás',en:'MOCK description'},background:{kind:'scene',hu:'',en:''},observations:[],tags:[{category:'expression',hu:'Mosolygó',en:'smiling',evidence:'MOCK bizonyíték',uncertain:false}],locations:[],...overrides};}
const provider=analyzeImage=>({id:'mock',version:'test-1',model:'fixture',local:true,mock:true,analyzeImage});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(fn,extra={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-analysis-test-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);let app,base,csrf;
  const testOptions={availability:async()=> 'local',decode:async()=>({type:'image',mimeType:'image/jpeg',data:jpeg.toString('base64')}),...extra};
  async function start(dir=dataDir,overrides={}){app=await createApp({root,dataDir:dir,mobile:{enabled:false},mediaAnalysisTestOptions:{...testOptions,...overrides}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;csrf=(await (await fetch(base+'/api/media-analysis')).json()).csrf;}
  async function request(route,body,method=body?'POST':'GET',headers){const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(headers??(body&&route.startsWith('/api/media-analysis')?{Origin:base,'X-LU-Analysis-CSRF':csrf}:{}))},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  async function image(color=40){const id=randomUUID(),name=id+'.bmp';await fs.writeFile(path.join(root,name),bitmap(color));app.db.prepare("INSERT INTO media VALUES(?,?,'','image',58,'now','now')").run(id,name);return id;}
  async function startJob(ids,options={}){const chosen={media_ids:ids,...options},preview=await call('/api/media-analysis/jobs/preview',chosen),body={...chosen,preview_hash:preview.preview_hash,request_key:randomUUID()},job=await call('/api/media-analysis/jobs',body);return {job,preview,body};}
  async function completed(ids,options={}){const run=await startJob(ids,options);await app.mediaAnalysis.settle();return {...run,job:await call('/api/media-analysis/jobs/'+run.job.id)};}
  const review=async(actions,operation='accept')=>{const p=await call('/api/media-analysis/review/preview',{operation,actions});return {preview:p,body:{operation,actions,preview_hash:p.preview_hash,request_key:randomUUID()}};};
  await start();try{await fn({temp,root,dataDir,app:()=>app,call,request,image,startJob,completed,review,base:()=>base,csrf:()=>csrf,restart:async(dir=dataDir,overrides={})=>{await app.close();await start(dir,overrides);}});}finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('lu-analysis-test-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('mock schema is explicit, bounded, bilingual and does not claim real recognition',async()=>{
  const mock=createMockAnalysisProvider(),r=validateAnalysisResult(await mock.analyzeImage({goals:['angle','framing','expression','pose','clothing','lighting','background'],signal:new AbortController().signal}));assert.match(r.description.hu,/MOCK/);assert.equal(r.observations.length,7);
  assert.throws(()=>validateAnalysisResult({...r,character_id:randomUUID()}),{code:'INVALID_RESULT'});assert.throws(()=>validateAnalysisResult({...r,tags:[{...r.tags[0],uncertain:'high'}]}),{code:'INVALID_RESULT'});assert.throws(()=>validateAnalysisResult({...r,description:{hu:'x'.repeat(70000),en:''}}),{code:'INVALID_RESULT'});
  const vocabulary=[{id:'tag',name:'smiling',hu_name:'Mosolygó',en_name:'smiling',group_id:'group-expression',aliases:[],exact_location:0}];
  const matched=matchAnalysisResult(result({tags:[...result().tags,{...result().tags[0],hu:'MOSOLYGÓ'}]}),vocabulary,[]);assert.equal(matched.length,1);assert.equal(matched[0].target_id,'tag');
  const neutral=matchAnalysisResult(result({background:{kind:'neutral',hu:'Semleges háttér',en:'neutral background'},tags:[{category:'background',hu:'Strand',en:'beach',evidence:'contradictory fixture',uncertain:false}]}),[],[]);assert.equal(neutral[0].resolution,'excluded');
  const places=[{id:'a',name:'Strand',english_name:'Beach',breadcrumb:'A / Strand'},{id:'b',name:'Strand',english_name:'Beach',breadcrumb:'B / Strand'}];const p=matchAnalysisResult(result({tags:[],locations:[{hu:'Strand',en:'Beach',evidence:'fixture',uncertain:false}]}),[],places)[0];assert.equal(p.target_id,null);assert.equal(p.uncertain,true);assert.deepEqual(p.candidate_ids,['a','b']);
});

test('job preview is read-only; selected mock jobs persist separate results and never change original data',()=>fixture(async({image,call,startJob,app,root})=>{
  const id=await image(),character=await call('/api/characters',{name:'Fixture'});await call('/api/media/'+id,{character_ids:[character.id],tags:'Original tags',notes:'Original Media Notes',categorization_complete:false},'PUT');const canon=await call('/api/characters/'+character.id+'/canon',{appearance:'Approved',references:[{media_id:id,role:'face'}]});
  const before=await call('/api/export'),p=await call('/api/media-analysis/jobs/preview',{media_ids:[id]});assert.equal(p.mock,true);assert.equal(p.cost,0);assert.equal(p.external_upload,false);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media_analysis_jobs').get().n,0);
  const {job,body}=await startJob([id]);await app().mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+job.id);assert.equal(saved.status,'completed');assert.equal(saved.items[0].status,'succeeded');assert.match(saved.items[0].result.description.hu,/MOCK/);assert.ok(saved.items[0].proposals.some(p=>p.resolution==='unknown'));assert.equal((await call('/api/media-analysis/jobs',body)).id,job.id);
  const after=await call('/api/export');for(const table of ['characters','canon','media','depictions','media_notes','reviews','media_roles','media_categorization','media_tags','media_locations','media_location_links'])assert.deepEqual(after[table],before[table],table+' unchanged');assert.equal(after.canon[0].id,canon.id);assert.equal(await fs.readFile(path.join(root,id+'.bmp')).then(b=>b.equals(bitmap())),true);
}));

test('approval adds selected tag/place links atomically, retries safely and rollbacks preserve notes/canon/sorting',()=>{
  let placeId;return fixture(async({image,call,completed,review,app,request})=>{
    const place=await call('/api/location-editor',{name:'Tesztkert',parent_id:null},'PUT');placeId=place.id;const id=await image();await call('/api/media/'+id,{character_ids:[],notes:'Keep this',tags:'Legacy',categorization_complete:false},'PUT');
    const {job}=await completed([id]),item=job.items[0];assert.equal(item.proposals.length,2);const actions=item.proposals.map(p=>({proposal_id:p.id})),plan=await review(actions),before=await call('/api/export');
    const decision=await call('/api/media-analysis/review/apply',plan.body);assert.equal(decision.added_tags,1);assert.equal(decision.added_locations,1);assert.equal((await call('/api/media-analysis/review/apply',plan.body)).replayed,true);
    const saved=await call('/api/media/'+id);assert.equal(saved.location.id,placeId);assert.equal(saved.location_reference,false);assert.equal(saved.categorization_complete,false);assert.equal(saved.notes,'Keep this');assert.equal(saved.tags,'Legacy');
    const invalid={...plan.body,request_key:randomUUID()};assert.equal((await request('/api/media-analysis/review/apply',invalid)).status,409);
    const rolled=await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id});assert.equal(rolled.removed_tags,1);assert.equal(rolled.removed_locations,1);assert.equal((await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id})).replayed,true);
    const after=await call('/api/export');for(const table of ['media_notes','depictions','canon','media_roles','media_categorization','media_tags','media_locations','media_location_links'])assert.deepEqual(after[table],before[table]);assert.equal(app().db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  },{provider:provider(async input=>{assert.equal(input.notes,undefined);assert.equal(input.path,undefined);assert.ok(Buffer.isBuffer(input.image.bytes));return result({locations:[{location_id:placeId,hu:'Tesztkert',en:'Fixture garden',uncertain:false,evidence:'MOCK exact ID'}]});})});
});

test('uncertain and unknown proposals need explicit acknowledgement/mapping; rejected results never create vocabulary',()=>fixture(async({image,completed,call,request,review})=>{
  const id=await image(),{job}=await completed([id]),pending=job.items[0].proposals,unknown=pending.find(p=>p.resolution==='unknown'&&p.kind==='tag'),known=pending.find(p=>p.resolution==='matched');
  assert.equal((await request('/api/media-analysis/review/preview',{operation:'accept',actions:[{proposal_id:unknown.id}]})).status,400);
  const action={proposal_id:unknown.id,target_id:known.target_id,ack_uncertain:true},plan=await review([action]);await call('/api/media-analysis/review/apply',plan.body);assert.equal((await call('/api/media/'+id)).structured_tags.length,1);
  const reject=await review(pending.filter(p=>p.id!==unknown.id).map(p=>({proposal_id:p.id})),'reject');await call('/api/media-analysis/review/apply',reject.body);assert.equal((await call('/api/taxonomy')).tags.some(t=>t.name==='Tesztöltözet'),false);assert.equal((await call('/api/location-tree')).items.length,0);
}));

test('cache is content/provider/goals bound, and cached results rematch the current bilingual vocabulary',()=>{
  let calls=0;return fixture(async({image,completed,call,root,app,restart})=>{
    const a=await image(),b=await image(),first=await completed([a]),second=await completed([b]);assert.equal(calls,1);assert.equal(first.job.items[0].cache_hit,false);assert.equal(second.job.items[0].cache_hit,true);
    const third=await completed([a],{goals:['expression']});assert.equal(calls,2);assert.equal(third.job.items[0].cache_hit,false);
    await fs.writeFile(path.join(root,a+'.bmp'),bitmap(90));await completed([a]);assert.equal(calls,3);
    const oldJob=second.job,tag=await call('/api/taxonomy/tags',{group_id:'group-expression',name:'Minta'}),info=(await call('/api/taxonomy')).tags.find(t=>t.id===tag.id);await call('/api/taxonomy/language',{tag_id:tag.id,expected_version:info.version,hu_name:'Minta',en_name:'fixture pattern',aliases:[]});
    const planBefore=app().db.prepare('SELECT context_json FROM media_analysis_items WHERE id=?').get(oldJob.items[0].id).context_json;await call('/api/media-analysis/items/'+oldJob.items[0].id+'/rematch',{});assert.equal(calls,3);assert.notEqual(app().db.prepare('SELECT context_json FROM media_analysis_items WHERE id=?').get(oldJob.items[0].id).context_json,planBefore);
    await restart(undefined,{provider:{...provider(async()=>{calls++;return result();}),version:'test-2'}});await completed([b]);assert.equal(calls,4);
  },{provider:provider(async()=>{calls++;return result();})});
});

test('changed notes, source bytes, vocabulary or location tree block stale approval and stale job previews',()=>fixture(async({image,completed,call,request,review,root,startJob,app})=>{
  const id=await image(),{job}=await completed([id]),proposal=job.items[0].proposals.find(p=>p.resolution==='matched'),plan=await review([{proposal_id:proposal.id}]);
  await call('/api/media/'+id,{character_ids:[],notes:'Changed manually'},'PUT');assert.equal((await request('/api/media-analysis/review/apply',plan.body)).status,409);await call('/api/media-analysis/items/'+job.items[0].id+'/rematch',{});
  const current=(await call('/api/media-analysis/jobs/'+job.id)).items[0],newPlan=await review([{proposal_id:current.proposals.find(p=>p.resolution==='matched').id}]);await call('/api/location-editor',{name:'New root',parent_id:null},'PUT');assert.equal((await request('/api/media-analysis/review/apply',newPlan.body)).status,409);
  await call('/api/media-analysis/items/'+job.items[0].id+'/rematch',{});await fs.writeFile(path.join(root,id+'.bmp'),bitmap(200));assert.equal((await request('/api/media-analysis/items/'+job.items[0].id+'/rematch',{})).status,409);
  const preview=await call('/api/media-analysis/jobs/preview',{media_ids:[id]});await call('/api/taxonomy/tags',{group_id:'group-pose',name:'New pose'});assert.equal((await request('/api/media-analysis/jobs',{media_ids:[id],preview_hash:preview.preview_hash,request_key:randomUUID()})).status,409);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media_tags').get().n,0);
}));

test('pause/resume discards late provider results and resumes only unfinished items',()=>{
  const entered=deferred(),late=deferred();let calls=0;return fixture(async({image,startJob,call,app})=>{
    const id=await image(),{job}=await startJob([id]);await entered.promise;await call('/api/media-analysis/jobs/'+job.id+'/pause',{});assert.equal((await call('/api/media-analysis/jobs/'+job.id)).status,'paused');
    await call('/api/media-analysis/jobs/'+job.id+'/resume',{});await app().mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+job.id);assert.equal(saved.status,'completed');assert.equal(saved.items[0].attempts,2);assert.equal(calls,2);
    late.resolve(result({description:{hu:'LATE — must not commit',en:'late'}}));await new Promise(r=>setImmediate(r));assert.equal((await call('/api/media-analysis/jobs/'+job.id)).items[0].result.description.hu,'MOCK leírás');
  },{provider:provider(async()=>{calls++;if(calls===1){entered.resolve();return late.promise;}return result();})});
});

test('cancel prevents late commits, while timeout and invalid provider responses become bounded item failures',()=>{
  const entered=deferred(),late=deferred();return fixture(async({image,startJob,call,request,app})=>{
    const id=await image(),{job}=await startJob([id]);await entered.promise;await call('/api/media-analysis/jobs/'+job.id+'/cancel',{});late.resolve(result());await app().mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+job.id);assert.equal(saved.status,'cancelled');assert.equal(saved.items[0].result,null);assert.equal(saved.items[0].status,'cancelled');assert.equal((await request('/api/media-analysis/jobs/'+job.id+'/resume',{})).status,409);
  },{provider:provider(async()=>{entered.resolve();return late.promise;})});
});

test('provider timeout and invalid JSON schema are sanitized without modifying metadata',()=>fixture(async({image,completed,call,restart})=>{
  const id=await image(),first=await completed([id]);assert.equal(first.job.items[0].error_code,'TIMEOUT');
  await restart(undefined,{provider:provider(async()=>({secret:'not allowed'}))});const invalid=await completed([id]);assert.equal(invalid.job.items[0].error_code,'INVALID_RESULT');assert.equal((await call('/api/media/'+id)).structured_tags.length,0);
},{provider:provider(async()=>new Promise(()=>{})),timeoutMs:15}));

test('restart and restore pause outstanding work; resume is explicit and completed records roundtrip',()=>{
  const entered=deferred(),late=deferred();let calls=0;return fixture(async({image,startJob,app,restart,call,temp})=>{
    const id=await image(),{job}=await startJob([id]);await entered.promise;await restart();assert.equal(calls,1);assert.equal((await call('/api/media-analysis/jobs/'+job.id)).status,'paused');await call('/api/media-analysis/jobs/'+job.id+'/resume',{});await app().mediaAnalysis.settle();assert.equal(calls,2);assert.equal((await call('/api/media-analysis/jobs/'+job.id)).status,'completed');
    const snapshot=await call('/api/export');await restart(path.join(temp,'restored'));await call('/api/restore',snapshot);assert.equal(calls,2);assert.equal((await call('/api/media-analysis/jobs/'+job.id)).items[0].status,'succeeded');late.resolve(result());
  },{provider:provider(async()=>{calls++;if(calls===1){entered.resolve();return late.promise;}return result();})});
});

test('manual adoption and existing links survive selective approval rollback',()=>fixture(async({image,completed,review,call})=>{
  const id=await image(),{job}=await completed([id]),proposal=job.items[0].proposals.find(p=>p.resolution==='matched'),plan=await review([{proposal_id:proposal.id}]),decision=await call('/api/media-analysis/review/apply',plan.body);
  await call('/api/taxonomy/apply',{media_ids:[id],tag_ids:[proposal.target_id],operation:'add'});const rolled=await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id});assert.equal(rolled.removed_tags,0);assert.equal((await call('/api/media/'+id)).structured_tags[0].id,proposal.target_id);
}));

test('authentication boundaries, malformed backups, unsafe/offline media and unsupported providers fail safely',()=>fixture(async({image,call,request,completed,app,temp,restart,root})=>{
  const id=await image();assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id]},'POST',{})).status,403);assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id]},'POST',{Origin:'https://evil.example'})).status,403);assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id],provider_id:'cloud'})).status,403);
  const old=app().db.prepare('SELECT relative_path FROM media WHERE id=?').get(id).relative_path;app().db.prepare("UPDATE media SET relative_path='../outside.bmp' WHERE id=?").run(id);assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id]})).status,403);app().db.prepare('UPDATE media SET relative_path=? WHERE id=?').run(old,id);
  await completed([id]);const snapshot=await call('/api/export');await restart(path.join(temp,'bad'));const incomplete=structuredClone(snapshot);delete incomplete.media_analysis_cache;assert.equal((await request('/api/restore',incomplete)).status,400);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  const invalid=structuredClone(snapshot);invalid.media_analysis_items[0].result_json='{"wrong":true}';assert.equal((await request('/api/restore',invalid)).status,400);await call('/api/restore',snapshot);assert.equal(app().db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  await restart(undefined,{availability:async()=> 'online'});assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id]})).status,409);
}));

test('additive analysis migration makes a verified backup and down preserves original tags and background links',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-analysis-migration-')),db=new DatabaseSync(path.join(temp,'test.sqlite'));try{
    db.exec("PRAGMA foreign_keys=ON;CREATE TABLE characters(id TEXT PRIMARY KEY);CREATE TABLE media(id TEXT PRIMARY KEY);CREATE TABLE structured_tags(id TEXT PRIMARY KEY);CREATE TABLE locations(id TEXT PRIMARY KEY);CREATE TABLE media_tags(media_id TEXT REFERENCES media(id),tag_id TEXT REFERENCES structured_tags(id),PRIMARY KEY(media_id,tag_id));CREATE TABLE media_locations(media_id TEXT PRIMARY KEY REFERENCES media(id),location_id TEXT REFERENCES locations(id));CREATE TABLE media_location_links(media_id TEXT REFERENCES media(id),location_id TEXT REFERENCES locations(id),PRIMARY KEY(media_id,location_id));INSERT INTO media VALUES('stable');INSERT INTO structured_tags VALUES('tag');INSERT INTO locations VALUES('place');INSERT INTO media_tags VALUES('stable','tag');INSERT INTO media_locations VALUES('stable','place');");
    const file=await backupBeforeMediaAnalysis(db,temp);const copy=new DatabaseSync(file,{readOnly:true});try{assert.equal(copy.prepare('SELECT tag_id FROM media_tags').get().tag_id,'tag');}finally{copy.close();}
    const up=await fs.readFile(new URL('../app/migrations/023-media-analysis.up.sql',import.meta.url),'utf8');db.exec(up);db.exec(up);assert.equal(await backupBeforeMediaAnalysis(db,temp),null);
    db.exec(await fs.readFile(new URL('../app/migrations/023-media-analysis.down.sql',import.meta.url),'utf8'));assert.equal(db.prepare('SELECT tag_id FROM media_tags').get().tag_id,'tag');assert.equal(db.prepare('SELECT location_id FROM media_locations').get().location_id,'place');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});

test('only explicitly selected goals produce proposals, even if a provider returns extra categories',()=>fixture(async({image,completed})=>{
  const id=await image(),{job}=await completed([id],{goals:['expression']});
  assert.deepEqual(job.items[0].proposals.map(p=>[p.kind,p.category]),[['tag','expression']]);
},{provider:provider(async()=>result({background:{kind:'scene',hu:'Kert',en:'garden'},tags:[...result().tags,{category:'clothing',hu:'Póló',en:'T-shirt',uncertain:false,evidence:'fixture'}],locations:[{hu:'Kert',en:'garden',uncertain:true,evidence:'fixture'}]}))}));

test('bilingual observations require both labels and an individual failure does not stop the rest of a batch',()=>{
  assert.throws(()=>validateAnalysisResult(result({tags:[{...result().tags[0],hu:''}]})),{code:'INVALID_RESULT'});
  let count=0;return fixture(async({image,completed,call})=>{
    const a=await image(1),b=await image(2),{job}=await completed([a,b]);
    assert.equal(job.status,'completed');assert.equal(job.counts.failed,1);assert.equal(job.counts.succeeded,1);assert.equal(count,2);
    assert.equal((await call('/api/media/'+a)).structured_tags.length,0);assert.equal((await call('/api/media/'+b)).structured_tags.length,0);
  },{provider:provider(async()=>{if(++count===1)throw Error('private diagnostic must not leak');return result();})});
});

test('restore rejects forged rollback ownership over an unrelated manual tag atomically',()=>fixture(async({image,completed,call,review,request,restart,temp,app})=>{
  const id=await image(),manual=(await call('/api/taxonomy')).tags.find(t=>t.en_name==='portrait').id;await call('/api/taxonomy/apply',{media_ids:[id],tag_ids:[manual],operation:'add'});
  const {job}=await completed([id]),proposal=job.items[0].proposals.find(p=>p.kind==='tag'&&p.hu==='Szemből');
  const plan=await review([{proposal_id:proposal.id}]),decision=await call('/api/media-analysis/review/apply',plan.body);
  const before=await call('/api/media/'+id),backup=await call('/api/export'),forged=structuredClone(backup);forged.media_analysis_tag_links[0].tag_id=manual;
  await restart(path.join(temp,'ownership-restore'));
  const invalid=await request('/api/restore',forged);assert.equal(invalid.status,400);assert.match(invalid.data.error,/elemzési/u);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  await call('/api/restore',backup);assert.deepEqual(await call('/api/media/'+id),before);
  await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id});assert.deepEqual((await call('/api/media/'+id)).structured_tags.map(t=>t.id),[manual]);
}));
