import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createDispatcher} from '../mcp/http-gateway.mjs';
import {generateProviderImage,GenerationError} from '../app/image-providers.mjs';
import {planPathMigration,applyPathMigration} from '../app/path-migration.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoaGgAAAMEAYEezv+mAAAAAElFTkSuQmCC','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture({generate,clock}={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-generation-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://laptop.example.ts.net',login:'creator@example.test',approval_mode:'trusted',database_id:databaseIdentity(database)};
  let calls=0;const options={root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login},imageGeneration:{providers:{xai:{enabled:true,model:'grok-imagine-image-2.0',estimated_cost_usd:0.1},openai:{enabled:true,model:'gpt-image-2.5-sunburst'},sogni:{enabled:true,model:'krea-identity-edit'}}},generationTestOptions:{env:{XAI_API_KEY:'fixture-key',OPENAI_API_KEY:'fixture-openai',SOGNI_API_KEY:'fixture-sogni'},availability:async()=> 'local',...(clock?{clock}:{}),generate:async args=>{calls++;return generate?generate(args):{bytes:png,request_id:'fixture_request',usage:{total_tokens:10},revised_prompt:null};}}};
  const app=await createApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port,writeConfig=path.join(dataDir,'mcp-writes.json');await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:base}));const writer=await createWriteClient({database,writeConfig});
  const call=async(name,args)=>(await writer.call(name,args)).data;
  const bindings=[];
  for(let i=0;i<2;i++){const cid=randomUUID(),mid=randomUUID(),revision=randomUUID(),name='adult_'+i+'.png';await fs.writeFile(path.join(root,name),png);app.db.prepare('INSERT INTO characters(id,name,notes,created_at) VALUES(?,?,?,?)').run(cid,'Adult '+i,'PRIVATE ADMIN SECRET',new Date().toISOString());app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,name,'','image',png.length,new Date().toISOString(),new Date().toISOString());app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,cid,null,'Approved adult appearance '+i,JSON.stringify([{media_id:mid,role:i?'body':'face',sha256:sha(png)}]),'Human fixture approval',new Date().toISOString());bindings.push({character_id:cid,revision_id:revision,reference_ids:[mid]});}
  const identity={'Tailscale-User-Login':config.login},session=await (await fetch(remote+'/api/session',{headers:identity})).json();
  const privateCall=async(rid,suffix,body,overrides={})=>{const response=await fetch(remote+'/api/image-generation/'+rid+(suffix?'/'+suffix:''),body===undefined?{headers:identity}:{method:'PUT',headers:{...identity,Origin:config.origin,'X-LU-CSRF':session.csrf,'Content-Type':'application/json',...overrides},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  const prepare=(request_key='generation_fixture_0001',extra={})=>call('prepare_image_generation',{request_key,provider:'xai',prompt:'Both adults reading in the morning.',characters:bindings,...extra});
  const approve=p=>privateCall(p.run_id,'decision',{decision:'approve',manifest_hash:p.manifest_hash,acknowledge_external_upload_and_cost:true});
  return {app,root,dataDir,options,base,remote,config,database,writer,call,bindings,prepare,approve,privateCall,calls:()=>calls,close:async()=>{if(app.db.isOpen)await app.close();await fs.rm(temp,{recursive:true,force:true});}};
}

test('reference-conditioned run: private approval, exact multi-character manifest, async receipt, both MCP transports, rollback and restore',async()=>{
  let release;const gate=new Promise(r=>release=r);const f=await fixture({generate:async()=>{await gate;return {bytes:png,request_id:'fixture_request',usage:{total_tokens:10},revised_prompt:null};}});let reader;
  try{
    const canon=f.app.db.prepare('SELECT * FROM canon').all(),cap=await f.call('get_image_generation_capabilities',{});assert.equal(cap.providers[0].available,true);assert.equal(cap.host_attachment_byte_handoff,'unverified');
    const plan=await f.prepare();assert.equal(plan.status,'pending');assert.equal((await f.prepare()).run_id,plan.run_id);assert.equal(plan.manifest.characters[1].references[0].input_index,2);assert.equal(JSON.stringify(plan).includes('PRIVATE ADMIN SECRET'),false);assert.equal(f.calls(),0);
    await assert.rejects(f.prepare('generation_fixture_0001',{prompt:'Changed request'}),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(f.call('execute_image_generation',{run_id:plan.run_id}),{code:'APPROVAL_REQUIRED'});
    assert.equal((await f.privateCall(plan.run_id,'decision',{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true},{'X-LU-CSRF':'wrong'})).status,403);
    assert.equal((await f.privateCall(plan.run_id,'decision',{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true},{Origin:'https://evil.example'})).status,403);
    assert.equal((await f.privateCall(plan.run_id,'decision',{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true},{'Tailscale-User-Login':'other@example.test'})).status,403);
    assert.equal((await f.privateCall(plan.run_id,'decision',{decision:'approve',manifest_hash:plan.manifest_hash})).value.code,'APPROVAL_REQUIRED');
    assert.equal((await fetch(f.remote+'/image-generation/'+plan.run_id)).status,403);
    assert.equal((await f.approve(plan)).value.status,'approved');
    assert.equal((await f.call('execute_image_generation',{run_id:plan.run_id})).status,'running');assert.equal((await f.call('execute_image_generation',{run_id:plan.run_id})).status,'running');assert.equal(f.calls(),1);
    const refreshed=await createWriteClient({database:f.database,writeConfig:path.join(f.dataDir,'mcp-writes.json')});assert.equal(refreshed.generationAvailable,true);assert.equal((await refreshed.call('get_image_generation',{run_id:plan.run_id})).data.status,'running');
    release();await f.app.imageGeneration.settle();const finished=await f.call('get_image_generation',{run_id:plan.run_id});assert.equal(finished.status,'succeeded');assert.equal(finished.output.sha256,sha(png));assert.equal(finished.output.size,png.length);assert.equal(finished.canon_approved,false);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions WHERE media_id=?').get(finished.output.media_id).n,2);
    await f.call('execute_image_generation',{run_id:plan.run_id});assert.equal(f.calls(),1);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),canon);
    reader=await createCatalogue({database:f.database,mediaRoot:f.root});const dispatch=createDispatcher({catalogue:reader,refreshWriter:async()=>f.writer});const listed=await dispatch({jsonrpc:'2.0',id:1,method:'tools/list'});assert.ok(listed.result.tools.some(t=>t.name==='prepare_image_generation'));assert.ok(listed.result.tools.some(t=>t.name==='list_characters'));const checked=await dispatch({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_image_generation',arguments:{run_id:plan.run_id}}});assert.equal(checked.result.structuredContent.output.media_id,finished.output.media_id);
    const withdrawn=await f.privateCall(plan.run_id,'withdraw',{manifest_hash:plan.manifest_hash});assert.equal(withdrawn.status,200);assert.equal(withdrawn.value.output.active,false);assert.equal(withdrawn.value.status,'withdrawn');assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM image_generation_outputs').get().n,1);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),canon);
    const snapshot=await (await fetch(f.base+'/api/export')).json(),restored=await createApp({root:f.root,dataDir:path.join(f.dataDir,'restore')});try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200,await response.clone().text());for(const table of ['image_generation_runs','image_generation_outputs','image_generation_events'])assert.deepEqual(restored.db.prepare('SELECT * FROM '+table).all(),f.app.db.prepare('SELECT * FROM '+table).all());}finally{await restored.close();}
  }finally{release();reader?.close();await f.close();}
});

test('uncertain generation remains inert across explicitly reviewed path migration and application restart',async()=>{
  const f=await fixture();let restarted;
  try{
    const plan=await f.prepare('uncertain_migration_fixture',{provider:'sogni'});
    f.app.db.prepare("UPDATE image_generation_runs SET status='uncertain',error_code='PROVIDER_REVIEW_REQUIRED' WHERE id=?").run(plan.run_id);
    const at=new Date().toISOString();
    f.app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(randomUUID(),'folder\\extra.png','folder','image',png.length,at,at);
    const run=f.app.db.prepare('SELECT * FROM image_generation_runs WHERE id=?').get(plan.run_id),canon=f.app.db.prepare('SELECT * FROM canon ORDER BY rowid').all();
    assert.ok(planPathMigration(f.app.db,{platform:'linux'}).blockers.some(b=>b.table==='image_generation_runs'));
    const migration=planPathMigration(f.app.db,{platform:'linux',preserveUncertain:true});
    assert.deepEqual(migration.blockers,[]);assert.equal(migration.changes.length,1);
    applyPathMigration(f.app.db,migration);
    assert.deepEqual(f.app.db.prepare('SELECT * FROM image_generation_runs WHERE id=?').get(plan.run_id),run);
    assert.deepEqual(f.app.db.prepare('SELECT * FROM canon ORDER BY rowid').all(),canon);
    assert.equal((await f.app.imageGeneration.execute(plan.run_id)).status,'uncertain');
    await assert.rejects(f.app.imageGeneration.decide(plan.run_id,{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true},f.config.login),{code:'INVALID_STATE'});
    assert.equal(f.calls(),0);
    await f.app.close();restarted=await createApp(f.options);
    assert.equal((await restarted.imageGeneration.execute(plan.run_id)).status,'uncertain');
    assert.deepEqual(restarted.db.prepare('SELECT * FROM image_generation_runs WHERE id=?').get(plan.run_id),run);
    assert.equal(f.calls(),0);
  }finally{if(restarted)await restarted.close();await f.close();}
});

test('Sogni shares private approval, durable job history, stable character links and canon protection',async()=>{
  const f=await fixture({generate:async args=>{assert.equal(args.manifest.provider,'sogni');assert.ok(args.requestKey.startsWith('lu_'));args.onProviderJob('wf_sogni_fixture');return {bytes:png,request_id:'wf_sogni_fixture',usage:null,revised_prompt:null};}});
  try{
    const before=f.app.db.prepare('SELECT * FROM canon').all(),plan=await f.prepare('sogni_generation_001',{provider:'sogni'});
    assert.equal(f.calls(),0);await assert.rejects(f.call('execute_image_generation',{run_id:plan.run_id}),{code:'APPROVAL_REQUIRED'});
    await f.approve(plan);await f.call('execute_image_generation',{run_id:plan.run_id});await f.app.imageGeneration.settle();
    const saved=await f.call('get_image_generation',{run_id:plan.run_id});assert.equal(saved.status,'succeeded');assert.equal(saved.output.receipt.provider_request_id,'wf_sogni_fixture');assert.ok(saved.events.some(e=>e.event==='provider_job_created'&&e.detail==='wf_sogni_fixture'));
    assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions WHERE media_id=?').get(saved.output.media_id).n,2);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),before);assert.equal(saved.canon_approved,false);
    await f.call('execute_image_generation',{run_id:plan.run_id});assert.equal(f.calls(),1);
  }finally{await f.close();}
});

test('desktop Sogni panel scopes history, requires same-origin CSRF and exact private approval, and registers once',async()=>{
  const f=await fixture();
  try{
    const cid=f.bindings[0].character_id,endpoint=f.base+'/api/characters/'+cid+'/generation',context=await (await fetch(endpoint)).json();
    assert.equal(context.providers.find(p=>p.provider==='sogni').available,true);assert.equal(context.canon.revision_id,f.bindings[0].revision_id);assert.equal(context.canon.references.length,1);assert.equal(context.canon.references[0].available,true);assert.deepEqual(context.runs,[]);assert.equal(JSON.stringify(context).includes('fixture-sogni'),false);assert.equal(JSON.stringify(context).includes('PRIVATE ADMIN SECRET'),false);
    const payload={request_key:'desktop_sogni_fixture',prompt:'The fictional adult reads in a cafe.',revision_id:context.canon.revision_id,reference_ids:f.bindings[0].reference_ids,size:'1024x1024'};
    const post=async(suffix,body,headers={})=>{const response=await fetch(endpoint+suffix,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base,'X-LU-Generation-CSRF':context.csrf,...headers},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
    assert.equal((await post('',payload,{'X-LU-Generation-CSRF':''})).status,403);assert.equal((await post('',payload,{Origin:'https://evil.example'})).status,403);assert.equal((await post('',payload,{'X-LU-Generation-CSRF':'é'.repeat(64)})).status,403);
    assert.equal((await post('',{...payload,provider:'xai'})).status,400);
    const prepared=await post('',payload);assert.equal(prepared.status,200);const plan=prepared.value;assert.equal(plan.manifest.provider,'sogni');assert.equal(f.calls(),0);
    assert.equal((await post('',payload)).value.run_id,plan.run_id);
    const other=f.bindings[1].character_id;assert.equal((await fetch(f.base+'/api/characters/'+other+'/generation/'+plan.run_id)).status,404);
    assert.equal((await post('/'+plan.run_id+'/execute',{manifest_hash:plan.manifest_hash})).value.code,'APPROVAL_REQUIRED');
    assert.equal((await post('/'+plan.run_id+'/decision',{decision:'approve',manifest_hash:plan.manifest_hash})).value.code,'APPROVAL_REQUIRED');
    assert.equal((await post('/'+plan.run_id+'/decision',{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true})).value.approved_by,'local-creator');assert.equal(f.calls(),0);
    assert.equal((await post('/'+plan.run_id+'/execute',{manifest_hash:'wrong'})).value.code,'STALE_PLAN');assert.equal(f.calls(),0);
    const canon=f.app.db.prepare('SELECT * FROM canon').all();await post('/'+plan.run_id+'/execute',{manifest_hash:plan.manifest_hash});await f.app.imageGeneration.settle();
    const result=await (await fetch(endpoint+'/'+plan.run_id)).json();assert.equal(result.status,'succeeded');assert.equal(result.canon_approved,false);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),canon);assert.equal((await (await fetch(endpoint)).json()).runs[0].output.media_id,result.output.media_id);
    await post('/'+plan.run_id+'/execute',{manifest_hash:plan.manifest_hash});assert.equal(f.calls(),1);
    const gallery=await(await fetch(f.base+'/api/media?kind=image&character='+cid)).json();assert.equal(gallery.items[0].id,result.output.media_id);
    const queue=await(await fetch(f.base+'/api/media?kind=image&character='+cid+'&ids_only=1')).json();assert.equal(queue.ids[0],result.output.media_id);
    assert.equal((await fetch(f.remote+'/api/characters/'+cid+'/generation',{headers:{'Tailscale-User-Login':f.config.login}})).status,404);
    const mid=f.bindings[0].reference_ids[0],original=f.app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(mid).relative_path;f.app.db.prepare('UPDATE media SET relative_path=? WHERE id=?').run('unsupported.webp',mid);
    const unsupported=(await (await fetch(endpoint)).json()).canon.references[0];assert.equal(unsupported.available,false);assert.match(unsupported.unavailable_reason,/PNG/);f.app.db.prepare('UPDATE media SET relative_path=? WHERE id=?').run(original,mid);
  }finally{await f.close();}
});

test('LoRA changes require a fresh approved immutable plan and preserve the configured strength exactly',async()=>{
  const f=await fixture();try{
    const old=await f.prepare('old_sogni_loras_fixture',{provider:'sogni'});await f.approve(old);
    Object.assign(f.options.imageGeneration.providers.sogni,{loras:['krea2-mystic-x','krea2-realism-engine'],lora_strengths:[1,0.8]});
    await assert.rejects(f.call('execute_image_generation',{run_id:old.run_id}),{code:'PROVIDER_CHANGED'});assert.equal(f.calls(),0);
    const fresh=await f.prepare('new_sogni_loras_fixture',{provider:'sogni'});assert.deepEqual(fresh.manifest.loras,['krea2-mystic-x','krea2-realism-engine']);assert.deepEqual(fresh.manifest.lora_strengths,[1,0.8]);assert.equal(fresh.manifest.model_label,'Krea 2 Identity Edit v1.2');
    assert.deepEqual(f.app.imageGeneration.view(old.run_id).manifest.loras,[]);assert.equal(fresh.status,'pending');await f.approve(fresh);await f.call('execute_image_generation',{run_id:fresh.run_id});await f.app.imageGeneration.settle();assert.equal(f.app.imageGeneration.view(fresh.run_id).status,'succeeded');assert.equal(f.calls(),1);
  }finally{await f.close();}
});

test('changed bytes, stale canon, provider changes and unapproved media block submission without paid calls',async()=>{
  const f=await fixture();try{
    const plan=await f.prepare();await fs.writeFile(path.join(f.root,'adult_0.png'),Buffer.from('changed'));assert.equal((await f.approve(plan)).value.code,'REFERENCE_CHANGED');assert.equal(f.calls(),0);await fs.writeFile(path.join(f.root,'adult_0.png'),png);
    const random=randomUUID();await assert.rejects(f.prepare('unapproved_reference_01',{characters:[{...f.bindings[0],reference_ids:[random]}]}),{code:'REFERENCE_NOT_APPROVED'});
    await f.approve(plan);f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(randomUUID(),f.bindings[0].character_id,f.bindings[0].revision_id,'Changed approved appearance','[]','New human revision',new Date().toISOString());await assert.rejects(f.call('execute_image_generation',{run_id:plan.run_id}),{code:'STALE_CANON'});assert.equal(f.calls(),0);
    await assert.rejects(f.prepare('unsupported_fields_01',{api_key:'not-allowed'}),{code:'INVALID_ARGUMENT'});
  }finally{await f.close();}
});

test('registration failure is recoverable without a second provider call; promoted outputs cannot be withdrawn',async()=>{
  const f=await fixture();try{
    const plan=await f.prepare();await f.approve(plan);f.app.db.exec("CREATE TRIGGER fail_generated BEFORE INSERT ON image_generation_outputs BEGIN SELECT RAISE(ABORT,'fixture'); END;");await f.call('execute_image_generation',{run_id:plan.run_id});await f.app.imageGeneration.settle();assert.equal(f.app.imageGeneration.view(plan.run_id).status,'generated');assert.equal(f.calls(),1);f.app.db.exec('DROP TRIGGER fail_generated');await f.call('execute_image_generation',{run_id:plan.run_id});await f.app.imageGeneration.settle();const result=f.app.imageGeneration.view(plan.run_id);assert.equal(result.status,'succeeded');assert.equal(f.calls(),1);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM imported_media_blobs').get().n,1);
    assert.equal(result.output.receipt.owned_media,true);
    const c=f.bindings[0];f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(randomUUID(),c.character_id,c.revision_id,'Approved output',JSON.stringify([{media_id:result.output.media_id,role:'face',sha256:sha(png)}]),'Explicit human promotion',new Date().toISOString());assert.equal((await f.privateCall(plan.run_id,'withdraw',{manifest_hash:plan.manifest_hash})).value.code,'CANON_REFERENCE_PROTECTED');
  }finally{await f.close();}
});

test('uncertain network attempts are never resubmitted, and startup marks interrupted attempts for reconciliation',async()=>{
  const f=await fixture({generate:async()=>{throw new GenerationError('PROVIDER_OUTCOME_UNKNOWN','fixture',502);}});try{
    const plan=await f.prepare();await f.approve(plan);await f.call('execute_image_generation',{run_id:plan.run_id});await f.app.imageGeneration.settle();assert.equal(f.app.imageGeneration.view(plan.run_id).status,'uncertain');await f.call('execute_image_generation',{run_id:plan.run_id});assert.equal(f.calls(),1);
    f.app.db.prepare("UPDATE image_generation_runs SET status='running' WHERE id=?").run(plan.run_id);await f.app.close();const reopened=await createApp(f.options);try{assert.equal(reopened.imageGeneration.view(plan.run_id).status,'uncertain');assert.equal(reopened.imageGeneration.view(plan.run_id).error_code,'PROCESS_INTERRUPTED');}finally{await reopened.close();}
  }finally{await f.close();}
});

test('image provider adapters use documented JSON references, fixed URLs, bounded bytes, and sanitized receipts',async()=>{
  for(const provider of ['openai','xai']){
    let submitted;const model=provider==='xai'?'grok-imagine-image-2.0':'gpt-image-2.5-sunburst',config={providers:{[provider]:{enabled:true,model}}};
    const manifest={provider,model,provider_prompt:'Fixture reference scene',size:'1024x1024',safety_identifier:'hashed-fixture-user'};
    const run=fetchImpl=>generateProviderImage({manifest,references:[{bytes:png,contentType:'image/png'}],config,env:{OPENAI_API_KEY:'never-return-this',XAI_API_KEY:'never-return-this'},fetchImpl});
    const result=await run(async(url,options)=>{submitted={url,options};return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}],usage:{total_tokens:20,secret:'omit'}}),{headers:{'x-request-id':'req_fixture'}});});
    assert.equal(result.bytes.equals(png),true);assert.equal(submitted.url,provider==='xai'?'https://api.x.ai/v1/images/edits':'https://api.openai.com/v1/images/edits');const body=JSON.parse(submitted.options.body);assert.ok(body.images[0][provider==='xai'?'url':'image_url'].startsWith('data:image/png;base64,'));assert.equal(JSON.stringify(result).includes('never-return-this'),false);assert.deepEqual(result.usage,{total_tokens:20});
    await assert.rejects(run(async()=>new Response(JSON.stringify({data:[{url:'https://internal.example/output'}]}))),{code:'PROVIDER_RESULT_INVALID'});
    await assert.rejects(run(async()=>new Response('secret upstream error',{status:400})),{code:'PROVIDER_REJECTED'});
    await assert.rejects(run(async()=>{throw Error('secret credential');}),{code:'PROVIDER_OUTCOME_UNKNOWN'});
  }
});

test('disabled providers, reference caps, expiry and changed cost configuration fail before external upload',async()=>{
  let time=Date.now();const f=await fixture({clock:()=>time});try{
    const pending=await f.prepare();time+=86400001;assert.equal((await f.approve(pending)).value.code,'PLAN_EXPIRED');assert.equal(f.calls(),0);time-=86400001;
    const second=await f.prepare('changed_price_plan_01');await f.approve(second);f.options.imageGeneration.providers.xai.estimated_cost_usd=0.2;await assert.rejects(f.call('execute_image_generation',{run_id:second.run_id}),{code:'PROVIDER_CHANGED'});assert.equal(f.calls(),0);
    f.options.imageGeneration.providers.xai.enabled=false;await assert.rejects(f.prepare('disabled_provider_001'),{code:'PROVIDER_DISABLED'});assert.equal((await f.call('get_image_generation_capabilities',{})).providers.find(p=>p.provider==='xai').available,false);
  }finally{await f.close();}
});

test('shared deduplicated output remains available when its generation is withdrawn',async()=>{
  const f=await fixture();try{
    const first=await f.prepare('shared_generation_001');await f.approve(first);await f.call('execute_image_generation',{run_id:first.run_id});await f.app.imageGeneration.settle();
    const second=await f.prepare('shared_generation_002');await f.approve(second);await f.call('execute_image_generation',{run_id:second.run_id});await f.app.imageGeneration.settle();const one=f.app.imageGeneration.view(first.run_id),two=f.app.imageGeneration.view(second.run_id);assert.equal(one.output.media_id,two.output.media_id);
    const result=await f.privateCall(first.run_id,'withdraw',{manifest_hash:first.manifest_hash});assert.equal(result.value.status,'withdrawn');assert.equal(result.value.output.active,true);assert.equal(result.value.events.at(-1).event,'withdrawn_shared_media_retained');assert.equal(f.calls(),2);
  }finally{await f.close();}
});
