import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
function box(type,...data){const payload=Buffer.concat(data),head=Buffer.alloc(8);head.writeUInt32BE(payload.length+8);head.write(type,4,'ascii');return Buffer.concat([head,payload]);}
const video=()=>box('ftyp',Buffer.from('isom0000isom'));
async function fixture(mode='trusted'){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-import-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),token=randomBytes(32).toString('hex'),config={enabled:true,token,origin:'https://laptop.example.ts.net',login:'fixture@example.test',approval_mode:mode,database_id:databaseIdentity(database)};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login},importTestOptions:{download:async()=>({stream:Readable.from([png]),contentType:'image/png',source:{kind:'url',source_origin:'https://public.example',source_path:'/portrait.png'}})}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port;
  const writeConfig=path.join(dataDir,'mcp-writes.json');await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:base}));
  const writer=await createWriteClient({database,writeConfig});const call=async(name,args)=>(await writer.call(name,args)).data;
  const upload=async(importId,slot,bytes,type='image/png',headers={})=>{const response=await fetch(base+`/api/mcp-imports/${importId}/items/${slot}`,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':type,'X-LU-Filename':'portrait.png','X-LU-SHA256':sha(bytes),...headers},body:bytes});return {status:response.status,value:await response.json()};};
  return {app,root,dataDir,database,base,remote,config,writer,call,upload,close:async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});}};
}
test('same catalogue: idempotent character creation, updates, verified media, provenance and recoverable partial imports',async()=>{
 const f=await fixture();let reader;
 try{
  const proposal=await f.call('propose_character_create',{request_key:'create_character_fixture',fields:{name:'Adult fixture, 35',biography:'Existing text',appearance:'Working appearance'}});
  const saved=await f.call('apply_approved_change',{change_id:proposal.change_id});assert.equal((await f.call('apply_approved_change',{change_id:proposal.change_id})).character_id,saved.character_id);
  assert.equal((await f.call('propose_character_create',{request_key:'create_character_fixture',fields:{name:'Adult fixture, 35',biography:'Existing text',appearance:'Working appearance'}})).change_id,proposal.change_id);
  const character=saved.character_id;f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(randomUUID(),character,null,'Approved fixture','[]','Human approved fixture',new Date().toISOString());
  const canon=f.app.db.prepare('SELECT * FROM canon').all();reader=await createCatalogue({database:f.database,mediaRoot:f.root});const original=(await reader.call('get_character',{character_id:character})).data;
  const update=await f.call('propose_character_update',{request_key:'update_character_fixture',character_id:character,expected_version:original.profile_version,fields:{personality:'A thoughtful adult'}});await f.call('apply_approved_change',{change_id:update.change_id});
  assert.equal(f.app.db.prepare('SELECT biography FROM characters WHERE id=?').get(character).biography,'Existing text');assert.equal(f.app.db.prepare('SELECT appearance FROM characters WHERE id=?').get(character).appearance,'Working appearance');
  const beginArgs={request_key:'fixture_import_0001',character_id:character,provenance:{provider:'user supplied Grok',prompt:'Selected portrait'}};
  const pending=await f.call('begin_media_import',beginArgs);assert.equal((await f.call('begin_media_import',beginArgs)).import_id,pending.import_id);assert.deepEqual(pending.items,[]);
  await assert.rejects(f.call('begin_media_import',{...beginArgs,provenance:{provider:'different'}}),{code:'IDEMPOTENCY_CONFLICT'});
  assert.equal((await f.upload(pending.import_id,'portrait_slot_01',png,'image/png',{Authorization:'Bearer wrong'})).status,403);
  const first=await f.upload(pending.import_id,'portrait_slot_01',png);assert.equal(first.status,200,JSON.stringify(first.value));const receipt=first.value.items[0];assert.equal(receipt.status,'committed');assert.equal(receipt.sha256,sha(png));assert.equal(receipt.size,png.length);assert.equal(receipt.provenance.model,undefined);assert.equal(first.value.canon_approved,false);
  assert.equal((await f.upload(pending.import_id,'portrait_slot_01',png)).value.items[0].media_id,receipt.media_id);
  const bad=await f.upload(pending.import_id,'second_slot_02',Buffer.from('not a real picture'));assert.equal(bad.status,400);const partial=await f.call('get_media_import',{import_id:pending.import_id});assert.equal(partial.items[0].status,'committed');assert.equal(partial.items[1].status,'failed');
  assert.equal((await f.upload(pending.import_id,'second_slot_02',png)).status,200);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);
  const other=await f.call('propose_character_create',{request_key:'second_character_fixture',fields:{name:'Another adult, 40'}});await f.call('apply_approved_change',{change_id:other.change_id});
  const second=await f.call('begin_media_import',{request_key:'fixture_import_0002',character_id:other.proposed?other.character_id:other.character_id});
  const url=await f.call('import_media_url',{import_id:second.import_id,slot_key:'url_portrait_01',url:'https://public.example/portrait.png?signature=never-store-this',filename:'chosen.png',expected_sha256:sha(png)});assert.equal(url.items[0].media_id,receipt.media_id);assert.equal(JSON.stringify(url).includes('never-store-this'),false);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions WHERE media_id=?').get(receipt.media_id).n,2);
  assert.equal((await fs.readFile(path.join(f.root,'Imported media',sha(png)+'.png'))).equals(png),true);
  const oldPath=path.join(f.root,'Imported media',sha(png)+'.png'),movedFolder=path.join(f.root,'Chosen folder');await fs.mkdir(movedFolder);const movedPath=path.join(movedFolder,'selected.png');await fs.rename(oldPath,movedPath);f.app.db.prepare('UPDATE media SET relative_path=?,folder=? WHERE id=?').run(path.join('Chosen folder','selected.png'),'Chosen folder',receipt.media_id);
  const movedImport=await f.call('begin_media_import',{request_key:'moved_original_fixture',character_id:character});const movedRetry=await f.upload(movedImport.import_id,'moved_slot_0001',png);assert.equal(movedRetry.status,200);assert.equal(movedRetry.value.items[0].media_id,receipt.media_id);await assert.rejects(fs.access(oldPath));
  await fs.writeFile(movedPath,Buffer.from('changed fixture bytes'));assert.equal((await f.upload(movedImport.import_id,'moved_slot_0001',png)).status,409);await fs.writeFile(movedPath,png);
  const videoBytes=Buffer.concat([video(),box('moov',box('trak',box('mdia',box('hdlr',Buffer.alloc(8),Buffer.from('vide'))))),box('mdat',Buffer.from('fixture video payload'))]);
  const videoResult=await f.upload(pending.import_id,'video_slot_0001',videoBytes,'video/mp4');assert.equal(videoResult.status,200,JSON.stringify(videoResult.value));assert.equal(videoResult.value.items.at(-1).provenance.validation,'video_container_structure');
  assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),canon);
  const snapshot=await (await fetch(f.base+'/api/export')).json();const restored=await createApp({root:f.root,dataDir:path.join(f.dataDir,'restore-fixture')});
  try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200,await response.clone().text());assert.deepEqual(restored.db.prepare('SELECT * FROM media_import_items ORDER BY rowid').all(),f.app.db.prepare('SELECT * FROM media_import_items ORDER BY rowid').all());assert.deepEqual(restored.db.prepare('SELECT * FROM media_import_events ORDER BY rowid').all(),f.app.db.prepare('SELECT * FROM media_import_events ORDER BY rowid').all());}finally{await restored.close();}
  reader.close();reader=null;
 }finally{reader?.close();await f.close();}
});
test('private upload page enforces identity, Origin and CSRF, including review mode',async()=>{
 const f=await fixture('review');
 try{
  const character=randomUUID();f.app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(character,'Existing adult',new Date().toISOString());
  const pending=await f.call('begin_media_import',{request_key:'private_upload_fixture',character_id:character});
  await assert.rejects(f.call('import_media_url',{import_id:pending.import_id,slot_key:'public_url_001',url:'https://public.example/p.png'}));
  assert.equal((await fetch(f.remote+'/media-import/'+pending.import_id)).status,403);
  const identity={'Tailscale-User-Login':f.config.login};const session=await (await fetch(f.remote+'/api/session',{headers:identity})).json();
  const url=f.remote+`/api/media-imports/${pending.import_id}/items/private_slot_001`;
  const headers={...identity,Origin:f.config.origin,'X-LU-CSRF':session.csrf,'Content-Type':'image/png','X-LU-Filename':'photo.png'};
  assert.equal((await fetch(url,{method:'PUT',headers:{...headers,Origin:'https://evil.example'},body:png})).status,403);
  assert.equal((await fetch(url,{method:'PUT',headers:{...headers,'X-LU-CSRF':'wrong'},body:png})).status,403);
  const uploaded=await fetch(url,{method:'PUT',headers,body:png});assert.equal(uploaded.status,200,await uploaded.clone().text());
 }finally{await f.close();}
});
test('database failure leaves a retryable content-addressed file and never duplicates it',async()=>{
 const f=await fixture();
 try{
  const character=randomUUID();f.app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(character,'Existing adult',new Date().toISOString());const pending=await f.call('begin_media_import',{request_key:'failed_commit_fixture',character_id:character});
  f.app.db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON depictions BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal((await f.upload(pending.import_id,'recover_slot_001',png)).status,503);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  f.app.db.exec('DROP TRIGGER fixture_fail');assert.equal((await f.upload(pending.import_id,'recover_slot_001',png)).status,200);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);assert.equal((await fs.readdir(path.join(f.root,'Imported media'))).length,1);assert.deepEqual(await fs.readdir(path.join(f.dataDir,'import-staging')),[]);
 }finally{await f.close();}
});
