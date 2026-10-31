import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {picture} from './character-crops-fixture.mjs';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {dimensions} from '../mcp/images.mjs';
import {referenceCrop} from '../app/reference-crop.mjs';
import {approveCanon} from './canon-client.mjs';
import {DatabaseSync} from 'node:sqlite';

const sha=b=>createHash('sha256').update(b).digest('hex');
const left={x:0,y:0,w:.5,h:1},right={x:.5,y:0,w:.5,h:1};
// One original with two visibly different subjects: red left, blue right.
async function fixture(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-character-crops-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);const database=path.join(dataDir,'universe.sqlite'),original=picture();await fs.writeFile(path.join(root,'shared.png'),original);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://laptop.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(database)};
  const inputs=[],options={root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login},imageGeneration:{providers:{xai:{enabled:true,model:'grok-imagine-image-2.0'}}},generationTestOptions:{env:{XAI_API_KEY:'fixture'},availability:async()=> 'local',generate:async args=>{inputs.push(args);return {bytes:original,request_id:'fixture'};}}};
  let app,base,remote;async function start(){app=await createApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;remote='http://127.0.0.1:'+app.mobileServer.address().port;}
  await start();
  async function request(route,body,method){return fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});}
  async function call(...args){const r=await request(...args),v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;}
  await call('/api/scan',{});const mid=(await call('/api/media')).items[0].id,cids=[];
  for(const name of ['Left subject','Right subject'])cids.push((await call('/api/characters',{name})).id);
  await call('/api/media/'+mid,{character_ids:cids,notes:'Keep shared original'},'PUT');
  for(const cid of cids)await approveCanon(call,cid,{appearance:'Approved fixture',references:[{media_id:mid,role:'face'}]});
  const route=(cid,role='face')=>'/api/media/'+mid+'/character-crops/'+cid+'/'+role;
  const save=async(cid,crop,role='face')=>{const s=await call(route(cid,role));return call(route(cid,role),{crop,source_sha256:s.source_sha256,expected_version:s.version});};
  return {temp,root,dataDir,database,original,mid,cids,route,save,call,request,inputs,config,get app(){return app;},get base(){return base;},get remote(){return remote;},restart:async()=>{await app.close();await start();},close:async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});}};
}
test('normalized regions reject invalid, empty, out-of-bounds and non-finite coordinates',()=>{
  for(const c of [{...left,x:-.1},{...left,w:0},{...right,w:.6},{...left,h:Infinity},{...left,y:NaN},{...left,extra:1},[],{}])assert.throws(()=>referenceCrop(c));assert.deepEqual(referenceCrop(left),left);assert.equal(referenceCrop(null),null);
});
test('first migration takes a verified online backup and does not alter existing approvals',async()=>{
  const f=await fixture();try{const before=f.app.db.prepare('SELECT * FROM canon').all();f.app.db.exec('DROP TABLE character_reference_crops');await f.restart();assert.ok(f.app.characterCropMigrationBackup);const copy=new DatabaseSync(f.app.characterCropMigrationBackup,{readOnly:true});try{assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(copy.prepare('SELECT * FROM canon').all(),before);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),before);}finally{copy.close();}}finally{await f.close();}
});
test('shared-image drafts are scoped by media + character + role, versioned, portable, and never approve or replace originals',async()=>{
  const f=await fixture();try{
    const before=await f.call('/api/export');await f.save(f.cids[0],left);await f.save(f.cids[1],right);await f.save(f.cids[0],{x:.1,y:.1,w:.8,h:.8},'body');
    const after=await f.call('/api/export');assert.equal(after.character_reference_crops.length,3);for(const t of ['media','characters','canon','depictions','reviews','media_notes'])assert.deepEqual(after[t],before[t],t);assert.deepEqual(await fs.readFile(path.join(f.root,'shared.png')),f.original);
    assert.equal((await f.call('/api/media/'+f.mid)).character_crops.length,3);
    const payload={crop:right,source_sha256:sha(f.original),expected_version:0};assert.equal((await f.request(f.route(f.cids[0]),payload)).status,409);assert.equal((await f.request(f.route(randomUUID()),payload)).status,409);assert.equal((await f.request(f.route(f.cids[0],'unknown'),payload)).status,400);assert.equal((await f.request(f.route(f.cids[0]),{...payload,expected_version:1,crop:{...left,x:.9}})).status,400);
    assert.equal((await f.request(f.route(f.cids[0]),{...payload,expected_version:1,source_sha256:'0'.repeat(64)})).status,409);
    const cross=await fetch(f.base+f.route(f.cids[0]),{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(cross.status,403);
    await f.restart();assert.deepEqual((await f.call(f.route(f.cids[1]))).crop,right);
    const restored=await createApp({root:f.root,dataDir:path.join(f.temp,'restored')});try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const r=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(after)});assert.equal(r.status,200,await r.text());assert.deepEqual(restored.db.prepare('SELECT * FROM character_reference_crops').all(),f.app.db.prepare('SELECT * FROM character_reference_crops').all());}finally{await restored.close();}
  }finally{await f.close();}
});
test('approved display and plugin use frozen per-character regions; edits leave approved bytes unchanged and original reads stay exact',async()=>{
  const f=await fixture();let reader;try{
    await f.save(f.cids[0],left);await f.save(f.cids[1],right);
    reader=await createCatalogue({database:f.database,mediaRoot:f.root,availability:async()=> 'local'});
    const read=(cid,quality)=>reader.call('get_approved_references',{character_id:cid,media_id:f.mid,include_image:true,...(quality?{image_quality:quality}:{})});
    assert.deepEqual(Buffer.from((await read(f.cids[0])).image.data,'base64'),f.original,'old full-image approval must not acquire the draft');
    for(let i=0;i<2;i++)await approveCanon(f.call,f.cids[i],{appearance:'Approved fixture',references:[{media_id:f.mid,role:'face',crop:i?right:left}]});
    const a=await read(f.cids[0]),b=await read(f.cids[1]);assert.equal(a.data.image_info.representation,'character_crop');assert.equal(a.data.image_info.source.sha256,sha(f.original));assert.deepEqual(dimensions(Buffer.from(a.image.data,'base64')),{width:50,height:80});assert.notEqual(a.image.data,b.image.data);assert.deepEqual(a.data.references[0].crop,left);
    const preview=await fetch(f.base+'/api/characters/'+f.cids[0]+'/references/'+f.mid+'/image');assert.equal(preview.status,200);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),Buffer.from(a.image.data,'base64'));
    await f.save(f.cids[0],right);assert.equal((await read(f.cids[0])).image.data,a.image.data,'editing draft must not change approved pixels');
    await approveCanon(f.call,f.cids[0],{appearance:'Approved appearance edit',references:[{media_id:f.mid,role:'face'}]});assert.deepEqual((await read(f.cids[0])).data.references[0].crop,left,'appearance-only approval retains region');
    const current=await f.call('/api/characters/'+f.cids[0]),refs=JSON.parse(current.canon.references_json);assert.equal((await f.request('/api/characters/'+f.cids[0]+'/canon',{appearance:current.canon.appearance,references:refs,expected_revision_id:current.canon.id,expected_references:refs.map(r=>({...r,crop:right}))})).status,409,'comparison includes approved crop');
    assert.deepEqual(Buffer.from((await read(f.cids[0],'original')).image.data,'base64'),f.original);
    const media=await reader.call('get_media',{media_id:f.mid});assert.equal(media.data.character_crops.length,2);
    await fs.appendFile(path.join(f.root,'shared.png'),'tampered');await assert.rejects(read(f.cids[0]),{code:'CANON_MISMATCH'});assert.equal((await fetch(f.base+'/api/characters/'+f.cids[0]+'/references/'+f.mid+'/image')).status,409);assert.equal((await f.call(f.route(f.cids[0]))).stale,true);
  }finally{reader?.close();await f.close();}
});
test('unsupported crop formats keep their existing whole-image reference display and approval',async()=>{
  const f=await fixture();try{const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),mid=randomUUID(),cid=f.cids[0],now=new Date().toISOString();await fs.writeFile(path.join(f.root,'legacy.gif'),gif);f.app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'legacy.gif','','image',gif.length,now,now);f.app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);await approveCanon(f.call,cid,{appearance:'Approved fixture',references:[{media_id:mid,role:'general'}]});const draft='/api/media/'+mid+'/character-crops/'+cid+'/general',info=await f.call(draft);assert.equal(info.crop_supported,false);const response=await fetch(f.base+'/api/characters/'+cid+'/references/'+mid+'/image');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/gif');assert.deepEqual(Buffer.from(await response.arrayBuffer()),gif);assert.equal((await f.request(draft,{crop:left,source_sha256:info.source_sha256,expected_version:0})).status,400);assert.equal((await f.request('/api/characters/'+cid+'/canon',{appearance:'Approved fixture',references:[{media_id:mid,role:'general',crop:left}],expected_revision_id:(await f.call('/api/characters/'+cid)).canon.id,expected_references:JSON.parse((await f.call('/api/characters/'+cid)).canon.references_json)})).status,400);}finally{await f.close();}
});
test('generation binds both characters to distinct approved crops and detects a same-revision crop replacement',async()=>{
  const f=await fixture();try{
    for(let i=0;i<2;i++)await approveCanon(f.call,f.cids[i],{appearance:'Approved fixture',references:[{media_id:f.mid,role:'face',crop:i?right:left}]});
    const bindings=await Promise.all(f.cids.map(async cid=>({character_id:cid,revision_id:(await f.call('/api/characters/'+cid)).canon.id,reference_ids:[f.mid]}))),service=f.app.imageGeneration;
    const prepare=key=>service.prepare({request_key:key,provider:'xai',prompt:'Two adult fictional characters reading.',characters:bindings});
    const plan=await prepare('crop_generation_0001');assert.deepEqual(plan.manifest.characters.map(c=>c.references[0].crop),[left,right]);assert.equal(f.inputs.length,0);await assert.rejects(service.execute(plan.run_id),{code:'APPROVAL_REQUIRED'});
    await service.decide(plan.run_id,{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:true},f.config.login);
    await f.save(f.cids[0],right);await service.execute(plan.run_id);await service.settle();assert.equal(service.view(plan.run_id).status,'succeeded');assert.equal(f.inputs.length,1);const inputs=f.inputs[0].references;assert.equal(inputs.length,2);assert.notEqual(sha(inputs[0].bytes),sha(inputs[1].bytes));assert.deepEqual(dimensions(inputs[0].bytes),{width:50,height:80});
    const stale=await prepare('crop_generation_0002');await service.decide(stale.run_id,{decision:'approve',manifest_hash:stale.manifest_hash,acknowledge_external_upload_and_cost:true},f.config.login);
    await approveCanon(f.call,f.cids[0],{appearance:'Approved fixture',references:[{media_id:f.mid,role:'face',crop:right}]});assert.equal((await f.call('/api/characters/'+f.cids[0])).canon.id,bindings[0].revision_id);
    await assert.rejects(service.execute(stale.run_id),{code:'STALE_REFERENCE'});assert.equal(f.inputs.length,1);assert.deepEqual(service.view(plan.run_id).manifest,plan.manifest);
  }finally{await f.close();}
});
test('plugin review hashes and displays the exact proposed region, requires human approval, and preserves the before-region',async()=>{
  const f=await fixture();try{
    const configFile=path.join(f.dataDir,'mcp-writes.json');await fs.writeFile(configFile,JSON.stringify({...f.config,app_url:f.base}));const writer=await createWriteClient({database:f.database,writeConfig:configFile}),cid=f.cids[0],current=await f.call('/api/characters/'+cid),proposal=(await writer.call('propose_reference_update',{request_key:randomUUID(),character_id:cid,expected_revision_id:current.canon.id,references:[{media_id:f.mid,role:'face',crop:left}]})).data;
    await assert.rejects(writer.call('apply_approved_reference_change',{change_id:proposal.change_id}),{code:'APPROVAL_REQUIRED'});
    const identity={'Tailscale-User-Login':f.config.login},session=await(await fetch(f.remote+'/api/session',{headers:identity})).json(),preview=side=>fetch(f.remote+'/api/mcp-reference-preview/'+proposal.change_id+'/'+f.mid+'?side='+side,{headers:identity});
    const before=await preview('before'),after=await preview('after');assert.equal(before.status,200);assert.equal(before.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await before.arrayBuffer()),f.original);assert.deepEqual(dimensions(Buffer.from(await after.arrayBuffer())),{width:50,height:80});
    await f.save(cid,right);const response=await fetch(f.remote+'/api/mcp-reference-changes/'+proposal.change_id,{method:'PUT',headers:{...identity,Origin:f.config.origin,'X-LU-CSRF':session.csrf,'Content-Type':'application/json'},body:JSON.stringify({decision:'approve',expected_hash:proposal.change_hash})});assert.equal(response.status,200,await response.clone().text());assert.deepEqual(JSON.parse((await f.call('/api/characters/'+cid)).canon.references_json)[0].crop,left);
    const invalid=await writer.call('propose_reference_update',{request_key:randomUUID(),character_id:cid,expected_revision_id:current.canon.id,references:[{media_id:f.mid,role:'face',crop:{...left,w:2}}]}).catch(e=>e);assert.equal(invalid.code,'INVALID_CROP');
  }finally{await f.close();}
});
