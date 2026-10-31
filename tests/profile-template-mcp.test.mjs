import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {serve} from '../mcp/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {buildProfileGenerationPackage} from '../app/public/ghost-profile.js';

async function fixture(mode='trusted'){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-template-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
 const database=path.join(dataDir,'universe.sqlite'),writeConfig=path.join(dataDir,'mcp-writes.json'),config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'fixture@example.test',approval_mode:mode,database_id:databaseIdentity(database)};
 const f={temp,root,dataDir,database,config,writeConfig};
 f.boot=async()=>{f.app=await createApp({root,dataDir,mcpWrites:config});await new Promise(r=>f.app.server.listen(0,'127.0.0.1',r));f.base='http://127.0.0.1:'+f.app.server.address().port;await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:f.base}));f.reader=await createCatalogue({database,mediaRoot:root});f.writer=await createWriteClient({database,writeConfig});};
 f.stop=async()=>{f.reader?.close();await f.app?.close();};f.close=async()=>{await f.stop();await fs.rm(temp,{recursive:true,force:true});};
 await f.boot();f.characters=[randomUUID(),randomUUID()];for(const cid of f.characters){f.app.db.prepare('INSERT INTO characters(id,name,biography,notes,created_at) VALUES(?,?,?,?,?)').run(cid,'Synthetic adult','Preserve biography','PRIVATE ADMIN',new Date().toISOString());f.app.db.prepare('INSERT INTO application_settings VALUES(?,?)').run('ghost:character:'+cid,JSON.stringify({version:1,values:{personality:{value:'PRIVATE VALUE',kind:'hypothesis',visibility:'creator',source:'Fixture',interpretation:''}},history:[],proposals:[]}));}
 f.app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),...f.characters,'Preserved directed relationship');f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(randomUUID(),f.characters[0],null,'Preserved appearance','[]','Preserved approval',new Date().toISOString());
 f.read=async args=>(await f.reader.call('get_profile_template',args??{})).data;
 f.update=async args=>(await f.writer.call('update_profile_template',args)).data;
 f.protected=()=>JSON.stringify({characters:f.app.db.prepare('SELECT * FROM characters ORDER BY id').all(),relationships:f.app.db.prepare('SELECT * FROM relationships ORDER BY id').all(),canon:f.app.db.prepare('SELECT * FROM canon ORDER BY id').all(),media:f.app.db.prepare('SELECT * FROM media ORDER BY id').all(),ghost:f.app.db.prepare("SELECT * FROM application_settings WHERE key LIKE 'ghost:character:%' ORDER BY key").all()});
 return f;
}

test('shared template read is bounded, character-independent and excludes private profile data',async()=>{
 const f=await fixture();try{
  const first=await f.read({limit:7});assert.equal(first.fields.length,7);assert.equal(first.next_offset,7);assert.equal(first.field_index.length,first.field_count);assert.ok(first.field_count>20);
  const next=await f.read({limit:7,offset:7});assert.ok(next.fields.every(n=>!first.fields.some(o=>o.id===n.id)));
  const selected=await f.read({field_ids:['anatomy','appearance_detail']});assert.equal(selected.fields.length,2);assert.ok(selected.fields.every(p=>p.guidance.length>500));
  assert.equal(JSON.stringify(first).includes('PRIVATE'),false);assert.equal(first.scope,'shared_all_characters');
  for(const args of [{limit:21},{offset:-1},{field_ids:['missing_field']},{field_ids:['identity','identity']},{character_id:f.characters[0]},{field_ids:['__proto__']}])await assert.rejects(f.read(args));
 }finally{await f.close();}
});

test('trusted field patches, additions and order reuse shared history, preserve every character and flow into generation packages',async()=>{
 const f=await fixture();try{
  const before=f.protected(),current=await f.read({field_ids:['anatomy','appearance_detail']}),ids=current.field_index.map(f=>f.id),untouched=current.fields.find(f=>f.id==='appearance_detail');
  const args={request_key:'shared_template_001',expected_version:current.template_version,field_updates:[{id:'anatomy',label:'Updated anatomy label',group:'Creator detail',guidance:'Only explicitly supplied details or marked adult-fiction proposals.'}],add_fields:[{id:'custom_motivation',label:'Custom motivation',group:'Motivation',type:'text',guidance:'Leave unknown details empty.'}],field_order:['custom_motivation',...ids]};
  const receipt=await f.update(args);assert.equal(receipt.template_version,current.template_version+1);assert.equal(receipt.character_values_unchanged,true);assert.equal(receipt.canon_unchanged,true);assert.equal(receipt.reordered,true);
  const after=await f.read({field_ids:['anatomy','appearance_detail','custom_motivation']});assert.equal(after.field_index[0].id,'custom_motivation');assert.deepEqual(after.fields.find(f=>f.id==='appearance_detail'),untouched);
  assert.deepEqual(await f.update(args),receipt);assert.equal(f.protected(),before);
  const history=JSON.parse(f.app.db.prepare('SELECT value FROM application_settings WHERE key=?').get('ghost:template-history:'+receipt.template_version).value);assert.equal(history.actor,'mcp-trusted');assert.equal(history.previous.version,current.template_version);
  for(const cid of f.characters){const ghost=await (await fetch(f.base+'/api/characters/'+cid+'/ghost')).json();assert.equal(ghost.template.version,receipt.template_version);assert.equal(ghost.values.custom_motivation,undefined);const pkg=buildProfileGenerationPackage({id:cid},ghost);assert.equal(pkg.template.fields.find(f=>f.id==='anatomy').guidance,args.field_updates[0].guidance);assert.equal(pkg.appearance_supplement.fields.anatomy.template_guidance,args.field_updates[0].guidance);}
  await f.stop();await f.boot();assert.deepEqual(await f.update(args),receipt);assert.equal((await f.read()).template_version,receipt.template_version);
  const snapshot=await (await fetch(f.base+'/api/export')).json(),restored=await createApp({root:f.root,dataDir:path.join(f.temp,'restore')});
  try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200);assert.deepEqual(restored.db.prepare("SELECT * FROM application_settings WHERE key LIKE 'ghost:template%' ORDER BY key").all(),f.app.db.prepare("SELECT * FROM application_settings WHERE key LIKE 'ghost:template%' ORDER BY key").all());}finally{await restored.close();}
 }finally{await f.close();}
});

test('stale or conflicting retries, invalid edits and concurrent changes cannot overwrite the shared template',async()=>{
 const f=await fixture();try{
  const t=await f.read(),args={request_key:'template_validation',expected_version:t.template_version,field_updates:[{id:'identity',label:'New label'}]};
  const original=await f.read({field_ids:['identity']});
  const invalid=[{field_updates:[{id:'identity',label:'New label'},{id:'missing_field',guidance:'x'}]}, {field_updates:[{id:'identity',type:'scale'}]}, {field_updates:[{id:'identity',source:'personality'}]}, {field_updates:[{id:'identity',label:''}]}, {field_updates:[{id:'identity',guidance:'x'.repeat(20001)}]}, {field_updates:[{id:'identity',group:null}]}, {add_fields:[{id:'identity',label:'Duplicate',group:'x',type:'text'}]}, {add_fields:[{id:'invalid_scale',label:'Invalid',group:'x',type:'scale',max:100}]}, {add_fields:[{id:'invalid_text',label:'Invalid',group:'x',type:'text',max:10}]}, {field_order:['identity']}, {remove_fields:['identity']}, {character_id:f.characters[0]}, {approved:true}];
  for(const patch of invalid){await assert.rejects(f.update({...args,...patch}));assert.deepEqual(await f.read({field_ids:['identity']}),original);}
  await assert.rejects(f.update({request_key:'oversize_template',expected_version:t.template_version,field_updates:Array.from({length:11},(_,i)=>({id:t.field_index[i].id,guidance:'x'.repeat(20000)}))}),{code:'TEMPLATE_LIMIT'});
  const concurrent=await Promise.allSettled([f.update(args),f.update({...args,request_key:'concurrent_template',field_updates:[{id:'identity',label:'Other label'}]})]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.find(r=>r.status==='rejected').reason.code,'STALE_TEMPLATE');
  const successful=concurrent[0].status==='fulfilled'?args:{...args,request_key:'concurrent_template',field_updates:[{id:'identity',label:'Other label'}]};
  await assert.rejects(f.update({...successful,field_updates:[{id:'identity',label:'Conflicting retry'}]}),{code:'IDEMPOTENCY_CONFLICT'});
  const latest=await f.read({field_ids:['identity']});const noop=await f.update({request_key:'no_change_template',expected_version:latest.template_version,field_updates:[{id:'identity',label:latest.fields[0].label}]});assert.equal(noop.changed,false);assert.equal(noop.template_version,latest.template_version);
 }finally{await f.close();}
});

test('authentication and review mode remain mandatory; old character proposals become stale after a shared edit',async()=>{
 const f=await fixture('review');try{
  const t=await f.read(),args={request_key:'review_template_edit',expected_version:t.template_version,field_updates:[{id:'identity',label:'Must not save'}]},body={operation:'template_update',arguments:args};
  assert.equal((await fetch(f.base+'/api/mcp-ghost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
  assert.equal((await fetch(f.base+'/api/mcp-ghost',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer wrong'},body:JSON.stringify(body)})).status,403);
  await assert.rejects(f.update(args),{code:'TEMPLATE_REVIEW_REQUIRED'});assert.equal((await f.read()).template_version,t.template_version);
  const c=f.characters[0],ghost=(await f.reader.call('get_ghost_profile',{character_id:c})).data,values={extraversion:{value:4,kind:'hypothesis',visibility:'creator',source:'Synthetic',interpretation:''}};
  const proposal=(await f.writer.call('propose_ghost_profile',{character_id:c,expected_version:ghost.version,template_version:ghost.template.version,profile_version:ghost.profile_version,model:'Test model',values})).data;
  const full=await (await fetch(f.base+'/api/ghost-template')).json();assert.equal((await fetch(f.base+'/api/ghost-template',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:full.version,fields:full.fields.map(f=>f.id==='identity'?{...f,label:'Creator approved label'}:f)})})).status,200);
  assert.equal((await fetch(f.base+'/api/characters/'+c+'/ghost/proposals/'+proposal.id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'accept',expected_version:ghost.version,values})})).status,409);
 }finally{await f.close();}
});

test('ChatGPT stdio discovers and applies the shared edit; old backends do not advertise unsupported writes',async()=>{
 const f=await fixture();try{
  const t=await f.read();async function rpc(writer,requests){const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);const done=serve({catalogue:f.reader,writer,input,output});input.end([{method:'initialize'},...requests].map((r,i)=>JSON.stringify({jsonrpc:'2.0',id:i+1,...r})).join('\n')+'\n');await done;return wire.trim().split('\n').map(JSON.parse);}
  const results=await rpc(f.writer,[{method:'tools/list'},{method:'tools/call',params:{name:'update_profile_template',arguments:{request_key:'stdio_template_edit',expected_version:t.template_version,field_updates:[{id:'goals',guidance:'Describe explicit goals; keep unknowns empty.'}]}}},{method:'tools/call',params:{name:'get_profile_template',arguments:{field_ids:['goals']}}}]);
  assert.ok(results[1].result.tools.some(t=>t.name==='get_profile_template'));assert.ok(results[1].result.tools.some(t=>t.name==='update_profile_template'));assert.equal(results[2].result.structuredContent.applied,true);assert.match(results[3].result.structuredContent.fields[0].guidance,/explicit goals/);
  const old=await rpc({...f.writer,templateEditingAvailable:false},[{method:'tools/list'}]);assert.ok(!old[1].result.tools.some(t=>t.name==='update_profile_template'));
  const readOnly=await rpc(null,[{method:'tools/list'}]);assert.ok(readOnly[1].result.tools.some(t=>t.name==='get_profile_template'));assert.ok(!readOnly[1].result.tools.some(t=>t.name==='update_profile_template'));
 }finally{await f.close();}
});
