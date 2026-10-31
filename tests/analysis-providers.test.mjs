import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {referenceImage} from '../mcp/images.mjs';
import {createAnalysisProvider,configuredAnalysisProviders,analysisOutputSchema,analysisPrompt} from '../app/analysis-providers.mjs';
import {analysisHash,analysisDigest,matchAnalysisResult} from '../app/analysis-model.mjs';
import {validateAnalysisWireResult} from '../app/analysis-schema.mjs';

const model='fixture-vision:v1',revision='sha256:'+'a'.repeat(64);
const jpeg=Buffer.from('ffd8ffc0000b080001000101011100ffd9','hex');
const image={bytes:jpeg,mime_type:'image/jpeg',sha256:analysisHash(jpeg),width:1,height:1};
const wire=()=>({schema:1,description:{hu:'Szintetikus teszt',en:'Synthetic fixture'},background:{kind:'scene',hu:'Strand',en:'beach'},observations:[],tags:[{category:'expression',hu:'Mosolygó',en:'smiling',evidence:'Rögzített válasz, nem felismerés',uncertain:false,region:null,tag_id:null}],locations:[]});
const ollama=result=>({model,done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(result??wire())}});
const openai=result=>({id:'fixture-response',model:'fixture-openai-v1',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(result??wire())}]}]});
const localConfig=endpoint=>({enabled:true,model,model_revision:revision,endpoint,local_only_confirmed:true});
const cloudConfig=()=>({enabled:true,model:'fixture-openai-v1',model_revision:'fixture-openai-v1',cost:{input_usd_per_million:1,output_usd_per_million:2,input_tokens_per_image:2000,max_total_usd:1,basis:'Synthetic rates only; not a current price quote',limitations:'Unmeasured image tokens; not a billing cap'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const input=()=>({image,goals:['expression','background'],source_sha256:'b'.repeat(64),signal:new AbortController().signal});
function cloudProvider(fetchImpl,config=cloudConfig(),env={OPENAI_API_KEY:'fixture-only-no-real-credential'}){return createAnalysisProvider('openai',config,{env,fetchImpl});}
const authorized=(p,base=input())=>({...base,authorization:{request_sha256:analysisDigest(p.requestBody(base))}});

async function loopback(fn,handler){
  const seen=[],server=http.createServer(async(req,res)=>{
    let chunks=[];for await(const chunk of req)chunks.push(chunk);const text=Buffer.concat(chunks).toString();const body=text?JSON.parse(text):null;seen.push({url:req.url,method:req.method,body,headers:req.headers});
    if(req.url==='/api/tags'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:[{name:model,digest:revision.slice(7)}]}));return;}
    if(handler)return handler(req,res,body);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(ollama()));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await fn({endpoint:'http://127.0.0.1:'+server.address().port+'/api/chat',seen,server});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}

test('real providers are off by default; invalid configuration cannot enable remote Ollama or cloud fallback',()=>{
  assert.deepEqual(configuredAnalysisProviders().providers.map(p=>p.id),['mock']);
  for(const endpoint of ['https://ollama.com/api/chat','http://localhost:11434/api/chat','http://127.0.0.2/api/chat','http://127.0.0.1@external.example/api/chat','http://127.0.0.1/api/chat?key=x','http://127.0.0.1/api/chat#x','http://127.0.0.1/redirect','file:///api/chat'])assert.throws(()=>createAnalysisProvider('ollama',localConfig(endpoint)),{code:'INVALID_PROVIDER_CONFIG'});
  for(const changes of [{model:'vision:cloud'},{model:'untagged'},{model_revision:'unknown'},{local_only_confirmed:false},{timeout_ms:0},{max_response_bytes:1},{enabled:false}])assert.throws(()=>createAnalysisProvider('ollama',{...localConfig('http://127.0.0.1:1/api/chat'),...changes}));
  assert.throws(()=>createAnalysisProvider('openai',{...cloudConfig(),endpoint:'http://127.0.0.1:1'}),{code:'INVALID_PROVIDER_CONFIG'});
  assert.throws(()=>createAnalysisProvider('openai',{...cloudConfig(),cost:{}}),{code:'INVALID_PROVIDER_CONFIG'});
  const mixed=configuredAnalysisProviders({providers:{ollama:{enabled:true},openai:{enabled:false}}});assert.equal(mixed.providers.length,1);assert.deepEqual(mixed.unavailable.map(v=>v.code),['INVALID_PROVIDER_CONFIG','PROVIDER_DISABLED']);
});

test('Ollama loopback sends only verified base64 derivatives, fixed prompt, selected goals and strict schema',()=>loopback(async({endpoint,seen})=>{
  const p=createAnalysisProvider('ollama',localConfig(endpoint)),r=await p.analyzeImage({...input(),notes:'must not leak',admin_notes:'never send',dossier:'excluded',path:'private-path'});
  assert.equal(r.tags[0].hu,'Mosolygó');assert.equal(r.tags[0].tag_id,undefined);assert.deepEqual(seen.map(v=>[v.method,v.url]),[['GET','/api/tags'],['POST','/api/chat']]);
  const body=seen[1].body;assert.equal(body.model,model);assert.equal(body.stream,false);assert.deepEqual(body.messages[1].images,[jpeg.toString('base64')]);assert.equal(body.messages[0].content,analysisPrompt);assert.ok(body.messages[1].content.endsWith(JSON.stringify(analysisOutputSchema)));assert.deepEqual(body.format,analysisOutputSchema);assert.equal(body.options.temperature,0);assert.equal(seen[1].headers.authorization,undefined);
  assert.doesNotMatch(JSON.stringify(body),/must not leak|never send|private-path|source_sha256/);assert.match(body.messages[0].content,/untrusted data/);assert.equal(p.spec.mode,'local');
}));

test('Ollama verifies the pinned local digest before sending image bytes',async()=>{
  for(const inventory of [{models:[]},{models:[{name:model,digest:'sha256:'+'c'.repeat(64)}]},{models:[{name:model,digest:revision,remote_host:'ollama.com'}]},null]){
    const calls=[],p=createAnalysisProvider('ollama',localConfig('http://127.0.0.1:1/api/chat'),{fetchImpl:async(url)=>{calls.push(url);return Response.json(inventory);}});
    await assert.rejects(p.analyzeImage(input()),{code:'MODEL_CHANGED'});assert.equal(calls.length,1);assert.match(calls[0],/\/api\/tags$/);
  }
});

for(const [label,reply]of [
  ['invalid JSON','not-json'],['null envelope',null],['incomplete',{...ollama(),done:false}],['truncated',{...ollama(),done_reason:'length'}],['wrong model',{...ollama(),model:'other'}],['tool output',{...ollama(),message:{...ollama().message,tool_calls:[{}]}}],['missing bilingual field',ollama({...wire(),description:{hu:'only'}})],['unknown property',ollama({...wire(),execute:'delete'})],['missing wire field',ollama({...wire(),tags:[{...wire().tags[0],region:undefined}]})],['invalid region',ollama({...wire(),tags:[{...wire().tags[0],region:{x:.9,y:0,width:.5,height:1}}]})],['oversized normalized text',ollama({...wire(),description:{hu:'x'.repeat(4001),en:'x'}})]
])test('Ollama rejects '+label,()=>loopback(async({endpoint})=>{await assert.rejects(createAnalysisProvider('ollama',localConfig(endpoint)).analyzeImage(input()),{code:'INVALID_RESULT'});},(_req,res)=>{res.end(typeof reply==='string'?reply:JSON.stringify(reply));}));

test('HTTP transport bounds declared and chunked response sizes, rejects redirects and redacts server errors',async()=>{
  for(const handler of [(_req,res)=>{res.writeHead(200,{'Content-Length':'9999999'});res.end();},(_req,res)=>{res.writeHead(200,{'Transfer-Encoding':'chunked'});res.write('x'.repeat(1500));res.end('x'.repeat(1500));}])await loopback(async({endpoint})=>{await assert.rejects(createAnalysisProvider('ollama',{...localConfig(endpoint),max_response_bytes:1024}).analyzeImage(input()),{code:'RESPONSE_LIMIT'});},handler);
  await loopback(async({endpoint,seen})=>{await assert.rejects(createAnalysisProvider('ollama',localConfig(endpoint)).analyzeImage(input()),{code:'PROVIDER_UNAVAILABLE'});assert.equal(seen.length,2);},(_req,res)=>{res.writeHead(302,{Location:'https://example.com/never-follow'});res.end();});
  await loopback(async({endpoint})=>{await assert.rejects(createAnalysisProvider('ollama',localConfig(endpoint)).analyzeImage(input()),e=>e.code==='PROVIDER_REJECTED'&&!e.message.includes('private diagnostic'));},(_req,res)=>{res.writeHead(500);res.end('private diagnostic');});
});

test('deadline covers headers and body; abort cancels HTTP and pre-aborted work sends nothing',async()=>{
  for(const bodyStarted of [false,true])await loopback(async({endpoint})=>{await assert.rejects(createAnalysisProvider('ollama',{...localConfig(endpoint),timeout_ms:30}).analyzeImage(input()),{code:'TIMEOUT'});},(_req,res)=>{if(bodyStarted){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');}});
  const entered=deferred();await loopback(async({endpoint,seen})=>{const controller=new AbortController(),p=createAnalysisProvider('ollama',localConfig(endpoint)),pending=p.analyzeImage({...input(),signal:controller.signal});await entered.promise;controller.abort();await assert.rejects(pending,{code:'INTERRUPTED'});assert.equal(seen.length,2);},()=>entered.resolve());
  let calls=0;const p=cloudProvider(async()=>{calls++;return Response.json(openai());}),controller=new AbortController();controller.abort();await assert.rejects(p.analyzeImage(authorized(p,{...input(),signal:controller.signal})));assert.equal(calls,0);
});

test('OpenAI Responses fixture uses fixed URL, stateless image input, strict text.format and no tools',async()=>{
  const calls=[],p=cloudProvider(async(url,init)=>{calls.push({url,init});return Response.json(openai());}),r=await p.analyzeImage(authorized(p));
  assert.equal(r.description.hu,'Szintetikus teszt');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/responses');const body=JSON.parse(calls[0].init.body);assert.equal(body.store,false);assert.equal(body.stream,false);assert.equal(body.tools,undefined);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.type,'json_schema');assert.deepEqual(body.text.format.schema,analysisOutputSchema);assert.equal(body.input[0].content[1].image_url,'data:image/jpeg;base64,'+jpeg.toString('base64'));assert.equal(body.input[0].content[1].detail,'low');assert.equal(calls[0].init.redirect,'error');assert.equal(p.local,false);
});

test('OpenAI upload authorization and server credential are separate gates; fixture never needs a real key',async()=>{
  let calls=0;const transport=async()=>{calls++;return Response.json(openai());},p=cloudProvider(transport);
  await assert.rejects(p.analyzeImage(input()),{code:'UPLOAD_APPROVAL_REQUIRED'});await assert.rejects(p.analyzeImage({...input(),authorization:{request_sha256:'wrong'}}),{code:'UPLOAD_APPROVAL_REQUIRED'});
  const noKey=cloudProvider(transport,cloudConfig(),{});await assert.rejects(noKey.analyzeImage(authorized(noKey)),{code:'CREDENTIAL_REQUIRED'});assert.equal(calls,0);
});

for(const [label,reply]of [['incomplete',{...openai(),status:'incomplete'}],['wrong model',{...openai(),model:'other'}],['refusal',{...openai(),output:[{type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'fixture'}]}]}],['tool call',{...openai(),output:[{type:'function_call',name:'delete'}]}],['missing fields',openai({schema:1})],['invalid content',{...openai(),output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{'}]}]}]])test('OpenAI fixture rejects '+label,async()=>{const p=cloudProvider(async()=>Response.json(reply));await assert.rejects(p.analyzeImage(authorized(p)),{code:'INVALID_RESULT'});});

test('uncertain cloud network failure or ignored-abort timeout has a terminal sanitized outcome and no retry',async()=>{
  for(const transport of [async()=>{throw Error('fixture credential private diagnostic');},async()=>new Promise(()=>{})]){
    let calls=0;const p=cloudProvider(async(...args)=>{calls++;return transport(...args);},{...cloudConfig(),timeout_ms:20});await assert.rejects(p.analyzeImage(authorized(p)),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&!e.message.includes('private diagnostic'));assert.equal(calls,1);
  }
});

function bitmap(color=40){const b=Buffer.alloc(58,color);b.fill(0,0,54);b.write('BM');b.writeUInt32LE(58,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(1,18);b.writeInt32LE(1,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);return b;}
async function catalogue(fn,{providers,decode=async bytes=>{const derived=Buffer.from(jpeg);derived[derived.length-3]=bytes[54];return {type:'image',mimeType:'image/jpeg',data:derived.toString('base64')};}}={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-provider-fixture-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);let app,base,csrf;
  async function start(dir=dataDir,ps=providers){app=await createApp({root,dataDir:dir,mobile:{enabled:false},mediaAnalysisTestOptions:{providers:ps,availability:async()=> 'local',decode}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;csrf=(await (await fetch(base+'/api/media-analysis')).json()).csrf;}
  async function request(route,body,method=body?'POST':'GET'){const r=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json',Origin:base,'X-LU-Analysis-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  async function add(color=40){const id=randomUUID();await fs.writeFile(path.join(root,id+'.bmp'),bitmap(color));app.db.prepare("INSERT INTO media VALUES(?,?,'','image',58,'now','now')").run(id,id+'.bmp');return id;}
  async function preview(ids,provider_id='ollama',goals=['expression','background']){const chosen={media_ids:ids,provider_id,goals},plan=await call('/api/media-analysis/jobs/preview',chosen);return {chosen,plan,body:{...chosen,preview_hash:plan.preview_hash,request_key:randomUUID()}};}
  async function job(ids,provider_id='ollama',approve=false){const p=await preview(ids,provider_id);if(approve)p.body.transfer_approval={preview_hash:p.plan.preview_hash,ack_upload:true,ack_cost:true};const j=await call('/api/media-analysis/jobs',p.body);await app.mediaAnalysis.settle();return {...p,job:await call('/api/media-analysis/jobs/'+j.id)};}
  await start();try{await fn({app:()=>app,add,call,request,preview,job,root,temp,restart:async(dir=dataDir,ps=providers)=>{await app.close();await start(dir,ps);}});}finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('lu-provider-fixture-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('real Ollama HTTP shares proposal approval/undo and preserves original notes, canon, assignments and sorting',()=>loopback(async({endpoint,seen})=>{
  await catalogue(async({add,call,job,app,root})=>{
    const id=await add(),character=await call('/api/characters',{name:'Synthetic'});await call('/api/media/'+id,{character_ids:[character.id],notes:'Private admin instruction: do not send',tags:'Legacy',categorization_complete:false},'PUT');await call('/api/characters/'+character.id+'/canon',{appearance:'Approved fixture',references:[{media_id:id,role:'face'}]});const before=await call('/api/export'),first=await job([id]);assert.equal(first.job.items[0].status,'succeeded');
    const proposal=first.job.items[0].proposals.find(p=>p.resolution==='matched'),actions=[{proposal_id:proposal.id}],plan=await call('/api/media-analysis/review/preview',{operation:'accept',actions}),decision=await call('/api/media-analysis/review/apply',{operation:'accept',actions,preview_hash:plan.preview_hash,request_key:randomUUID()});assert.equal(decision.added_tags,1);await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id});const after=await call('/api/export');
    for(const table of ['media','media_notes','characters','canon','depictions','reviews','media_roles','media_categorization','media_tags','media_locations','media_location_links'])assert.deepEqual(after[table],before[table],table);
    assert.deepEqual(await fs.readFile(path.join(root,id+'.bmp')),bitmap());assert.equal(app().db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.doesNotMatch(JSON.stringify(seen),/Private admin instruction/);
  },{providers:[createAnalysisProvider('ollama',localConfig(endpoint))]});
}));

test('cloud preview is transport-free and approval binds selected source/derivative/request hashes and cost assumptions',async()=>{
  let calls=0;const p=cloudProvider(async()=>{calls++;return Response.json(openai());});await catalogue(async({add,preview,request,call,app})=>{
    const id=await add(),v=await preview([id],'openai');assert.equal(calls,0);assert.equal(v.plan.external_upload,true);assert.equal(v.plan.cost.hard_billing_cap,false);assert.ok(v.plan.items[0].request_sha256);assert.match(v.plan.transfer.cost.basis,/Synthetic/);assert.equal(v.plan.transfer.prompt,analysisPrompt);assert.deepEqual(v.plan.transfer.output_schema,analysisOutputSchema);assert.equal(v.plan.transfer.image_detail,'low');
    assert.equal((await request('/api/media-analysis/jobs',v.body)).data.code,'UPLOAD_APPROVAL_REQUIRED');v.body.transfer_approval={preview_hash:v.plan.preview_hash,ack_upload:true,ack_cost:false};assert.equal((await request('/api/media-analysis/jobs',v.body)).status,403);v.body.transfer_approval.ack_cost=true;
    const job=await call('/api/media-analysis/jobs',v.body);await app().mediaAnalysis.settle();assert.equal(calls,1);const saved=await call('/api/media-analysis/jobs/'+job.id);assert.equal(saved.items[0].status,'succeeded');assert.equal(saved.provider.transfer_approval.actor,'local-creator');assert.equal(saved.provider.transfer_approval.items[0].source_sha256,v.plan.items[0].source.sha256);assert.equal((await call('/api/media-analysis/jobs',v.body)).id,job.id);assert.equal(calls,1);
  },{providers:[p]});
});

test('cloud estimate limit rejects before transport; source/derivative changes invalidate approved preview',async()=>{
  let calls=0,variant=false;const p=cloudProvider(async()=>{calls++;return Response.json(openai());});await catalogue(async({add,preview,request,call})=>{
    const id=await add(),v=await preview([id],'openai');v.body.transfer_approval={preview_hash:v.plan.preview_hash,ack_upload:true,ack_cost:true};variant=true;assert.equal((await request('/api/media-analysis/jobs',v.body)).data.code,'STALE_PREVIEW');assert.equal(calls,0);
  },{providers:[p],decode:async()=>{const bytes=Buffer.from(jpeg);if(variant)bytes[bytes.length-3]=1;return {type:'image',mimeType:'image/jpeg',data:bytes.toString('base64')};}});
  const expensive=cloudProvider(async()=>{calls++;return Response.json(openai());},{...cloudConfig(),cost:{...cloudConfig().cost,max_total_usd:.000001}});await catalogue(async({add,request})=>{const id=await add();assert.equal((await request('/api/media-analysis/jobs/preview',{media_ids:[id],provider_id:'openai'})).data.code,'COST_LIMIT');assert.equal(calls,0);},{providers:[expensive]});
});

test('HTTP cache includes actual derivative, goals and provider configuration; catalogue vocabulary only rematches',()=>loopback(async({endpoint,seen})=>{
  let variant=false;const p=createAnalysisProvider('ollama',localConfig(endpoint));await catalogue(async({add,job,call,restart,preview,app})=>{
    const a=await add(),b=await add();await job([a]);assert.equal((await job([b])).job.items[0].cache_hit,true);assert.equal(seen.length,2);
    await call('/api/taxonomy/tags',{group_id:'group-expression',name:'New fixture tag'});assert.equal((await job([b])).job.items[0].cache_hit,true);assert.equal(seen.length,2);
    variant=true;assert.equal((await job([b])).job.items[0].cache_hit,false);assert.equal(seen.length,4);
    const v=await preview([b],'ollama',['expression']),j=await call('/api/media-analysis/jobs',v.body);await app().mediaAnalysis.settle();assert.equal((await call('/api/media-analysis/jobs/'+j.id)).items[0].cache_hit,false);assert.equal(seen.length,6);
    await restart(undefined,[createAnalysisProvider('ollama',{...localConfig(endpoint),max_output_tokens:2048})]);assert.equal((await job([b])).job.items[0].cache_hit,false);assert.equal(seen.length,8);
  },{providers:[p],decode:async()=>{const bytes=Buffer.from(jpeg);if(variant)bytes[bytes.length-3]=1;return {type:'image',mimeType:'image/jpeg',data:bytes.toString('base64')};}});
}));

test('a cloud pause makes the active attempt uncertain; resume processes only untouched items and ignores late output',async()=>{
  const entered=deferred(),late=deferred();let calls=0;const p=cloudProvider(async()=>{calls++;if(calls===1){entered.resolve();return late.promise;}return Response.json(openai());});await catalogue(async({add,preview,call,app})=>{
    const ids=[await add(20),await add(40)],v=await preview(ids,'openai');v.body.transfer_approval={preview_hash:v.plan.preview_hash,ack_upload:true,ack_cost:true};const j=await call('/api/media-analysis/jobs',v.body);await entered.promise;await call('/api/media-analysis/jobs/'+j.id+'/pause',{});await app().mediaAnalysis.settle();await call('/api/media-analysis/jobs/'+j.id+'/resume',{});await app().mediaAnalysis.settle();let saved=await call('/api/media-analysis/jobs/'+j.id);assert.equal(calls,2);assert.equal(saved.counts.failed,1);assert.equal(saved.counts.succeeded,1);assert.equal(saved.items.find(i=>i.status==='failed').error_code,'PROVIDER_OUTCOME_UNKNOWN');late.resolve(Response.json(openai()));await new Promise(r=>setImmediate(r));saved=await call('/api/media-analysis/jobs/'+j.id);assert.equal(saved.counts.succeeded,1);assert.equal((await call('/api/media-analysis/jobs',v.body)).id,j.id);assert.equal(calls,2);
  },{providers:[p]});
});

test('cloud shutdown/restart and restore preserve uncertain attempts without automatic resubmission',async()=>{
  const entered=deferred();let calls=0;const p=cloudProvider(async()=>{calls++;entered.resolve();return new Promise(()=>{});});await catalogue(async({add,preview,call,app,restart,temp})=>{
    const id=await add(),v=await preview([id],'openai');v.body.transfer_approval={preview_hash:v.plan.preview_hash,ack_upload:true,ack_cost:true};const j=await call('/api/media-analysis/jobs',v.body);await entered.promise;await restart();let saved=await call('/api/media-analysis/jobs/'+j.id);assert.equal(saved.status,'paused');assert.equal(saved.items[0].error_code,'PROVIDER_OUTCOME_UNKNOWN');await call('/api/media-analysis/jobs/'+j.id+'/resume',{});await app().mediaAnalysis.settle();assert.equal(calls,1);
    // Simulate an abrupt crash captured by a portable snapshot, not just clean shutdown.
    const backup=await call('/api/export');backup.media_analysis_jobs[0].status='running';backup.media_analysis_items[0].status='running';backup.media_analysis_items[0].error_code=null;await restart(path.join(temp,'restore'));await call('/api/restore',backup);saved=await call('/api/media-analysis/jobs/'+j.id);assert.equal(saved.status,'paused');assert.equal(saved.items[0].error_code,'PROVIDER_OUTCOME_UNKNOWN');await call('/api/media-analysis/jobs/'+j.id+'/resume',{});await app().mediaAnalysis.settle();assert.equal(calls,1);
  },{providers:[p]});
});

test('a failed HTTP item does not stop its batch; changed provider pauses old queued work',()=>{let calls=0;return loopback(async({endpoint})=>{
  const p=createAnalysisProvider('ollama',localConfig(endpoint));await catalogue(async({add,job,app,call,restart})=>{
    const ids=[await add(20),await add(30)],v=await job(ids);assert.equal(v.job.status,'completed');assert.equal(v.job.counts.failed,1);assert.equal(v.job.counts.succeeded,1);assert.equal(v.job.items.find(i=>i.status==='failed').error_code,'INVALID_RESULT');
    app().db.prepare("UPDATE media_analysis_jobs SET status='paused' WHERE id=?").run(v.job.id);await restart(undefined,[createAnalysisProvider('ollama',{...localConfig(endpoint),max_output_tokens:2048})]);assert.equal((await (async()=>{try{await call('/api/media-analysis/jobs/'+v.job.id+'/resume',{});}catch(e){return e.message;}})()).includes('PROVIDER_CHANGED'),true);
  },{providers:[p]});
},(_req,res)=>{res.end(JSON.stringify(++calls===1?{done:false}:ollama()));});});

test('existing bilingual alias wins over an unknown suggested ID; generic beach never selects a world place',()=>{
  const result=wire();result.tags[0].tag_id='invented';const matched=matchAnalysisResult(result,[{id:'stable-tag',name:'Smile',hu_name:'Mosolygó',en_name:'smiling',group_id:'group-expression',aliases:[{alias:'happy'}],exact_location:0}],[]);assert.equal(matched[0].target_id,'stable-tag');
  result.tags=[];result.locations=[{hu:'Strand',en:'beach',evidence:'generic',uncertain:false}];const places=[{id:randomUUID(),name:'Strand',breadcrumb:'A / Strand'},{id:randomUUID(),name:'Strand',breadcrumb:'B / Strand'}],place=matchAnalysisResult(result,[],places).find(v=>v.kind==='location');assert.equal(place.target_id,null);assert.equal(place.uncertain,true);assert.equal(place.candidate_ids.length,2);
});

test('the real Windows derivative decoder feeds only a synthetic JPEG to the loopback adapter',()=>loopback(async({endpoint,seen})=>{
  await catalogue(async({add,job})=>{const id=await add(),v=await job([id]);assert.equal(v.job.items[0].status,'succeeded');const sent=Buffer.from(seen[1].body.messages[1].images[0],'base64');assert.equal(sent[0],255);assert.equal(sent[1],216);assert.notDeepEqual(sent,bitmap());assert.equal(v.plan.items[0].derivative.sha256,analysisHash(sent));},{providers:[createAnalysisProvider('ollama',localConfig(endpoint))],decode:referenceImage});
}));

test('cloud cancellation keeps an uncertain receipt and no late result or cache entry can be committed',async()=>{
  const entered=deferred(),late=deferred();let calls=0;const p=cloudProvider(async()=>{calls++;entered.resolve();return late.promise;});await catalogue(async({add,preview,call,app})=>{
    const id=await add(),v=await preview([id],'openai');v.body.transfer_approval={preview_hash:v.plan.preview_hash,ack_upload:true,ack_cost:true};const j=await call('/api/media-analysis/jobs',v.body);await entered.promise;await call('/api/media-analysis/jobs/'+j.id+'/cancel',{});late.resolve(Response.json(openai()));await app().mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+j.id);assert.equal(saved.status,'cancelled');assert.equal(saved.items[0].status,'failed');assert.equal(saved.items[0].error_code,'PROVIDER_OUTCOME_UNKNOWN');assert.equal(saved.items[0].result,null);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media_analysis_cache').get().n,0);assert.equal(calls,1);
  },{providers:[p]});
});

test('restore rejects a corrupted cloud approval binding atomically',async()=>{
  const p=cloudProvider(async()=>Response.json(openai()));await catalogue(async({add,job,call,request,restart,temp,app})=>{
    const id=await add();await job([id],'openai',true);const backup=await call('/api/export'),spec=JSON.parse(backup.media_analysis_jobs[0].provider_json);spec.transfer_approval.items[0].source_sha256='c'.repeat(64);backup.media_analysis_jobs[0].provider_json=JSON.stringify(spec);await restart(path.join(temp,'bad-approval'));assert.equal((await request('/api/restore',backup)).status,400);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  },{providers:[p]});
});

test('duplicate selected images cannot implicitly repeat an uncertain cloud request inside a batch',async()=>{
  let calls=0;const p=cloudProvider(async()=>{calls++;throw Error('synthetic network failure');});await catalogue(async({add,job})=>{
    const ids=[await add(40),await add(40)],v=await job(ids,'openai',true);assert.equal(calls,1);assert.equal(v.job.counts.failed,2);assert.ok(v.job.items.every(i=>i.error_code==='PROVIDER_OUTCOME_UNKNOWN'));
  },{providers:[p]});
});

test('real adapter wire schema forbids invented catalogue IDs and exact places without approved context',()=>{
  assert.equal(validateAnalysisWireResult(wire()).description.en,'Synthetic fixture');
  assert.throws(()=>validateAnalysisWireResult({...wire(),tags:[{...wire().tags[0],tag_id:'background'}]}),{code:'INVALID_RESULT'});
  assert.throws(()=>validateAnalysisWireResult({...wire(),locations:[{hu:'Strand',en:'Beach',evidence:'generic illustration',uncertain:false,region:null,location_id:randomUUID()}]}),{code:'INVALID_RESULT'});
  assert.throws(()=>validateAnalysisWireResult({...wire(),tags:[{...wire().tags[0],evidence:'x'.repeat(161)}]}),{code:'INVALID_RESULT'});
  assert.throws(()=>validateAnalysisWireResult({...wire(),tags:Array.from({length:11},()=>wire().tags[0])}),{code:'INVALID_RESULT'});
});
