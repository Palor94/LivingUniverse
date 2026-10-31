import {renameFixture} from './complete-rename-fixture.mjs';
import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createBackup,verifySnapshot} from '../ops/backup/backup.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(fn){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-layout-test-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
 const database=path.join(dataDir,'universe.sqlite'),config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'fixture@example.test',approval_mode:'trusted',database_id:databaseIdentity(database)};
 const app=await createApp({root,dataDir,mcpWrites:config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const request=async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const call=async(...args)=>{const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;};
 try{await fn({root,dataDir,database,config,app,base,request,call});}finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
}
test('organized scan separates character folders and excludes backups, imports, exports and archives',()=>fixture(async({root,app,call})=>{
 for(const folder of ['10_CHARACTERS/Ádám','10_CHARACTERS/Béla','20_SHARED_MEDIA/Scenes','00_SYSTEM/project','30_IMPORTS/Incoming','40_EXPORTS','90_BACKUPS','99_ARCHIVE']){await fs.mkdir(path.join(root,folder),{recursive:true});await fs.writeFile(path.join(root,folder,'sample.png'),png);}
 const scan=await call('/api/scan',{});assert.equal(scan.added,3);assert.deepEqual(app.db.prepare('SELECT DISTINCT folder FROM media ORDER BY folder').all().map(r=>r.folder).sort(),['10_CHARACTERS','10_CHARACTERS','20_SHARED_MEDIA'].map((n,i)=>path.join(n,['Ádám','Béla','Scenes'][i])).sort());assert.equal((await call('/api/scan',{})).added,0);
}));
test('organized character creation, rename and physical move preserve IDs and canonical hashes',()=>fixture(async({root,app,call,request})=>{
 const id=randomUUID();await app.folderSync.createCharacterWithFolder(id,'Ádám');await fs.writeFile(path.join(root,'10_CHARACTERS','Ádám','face.png'),png);await call('/api/scan',{});const m=app.db.prepare('SELECT * FROM media').get();app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(m.id,id);
 const c=await approveCanon(call,id,{appearance:'Approved fixture',references:[{media_id:m.id,role:'face'}]});await renameFixture(app,id,'Béla');const after=await call('/api/media/'+m.id);assert.equal(after.relative_path,path.join('10_CHARACTERS','Béla','face.png'));assert.equal((await call('/api/characters/'+id)).canon.id,c.id);assert.equal((await call('/api/characters/'+id+'/integrity',{})).results[0].status,'unchanged');
 await fs.mkdir(path.join(root,'20_SHARED_MEDIA','Unassigned'),{recursive:true});await fs.writeFile(path.join(root,'20_SHARED_MEDIA','Unassigned','new.png'),png);await call('/api/scan',{});const fresh=app.db.prepare('SELECT * FROM media WHERE id<>?').get(m.id);const p=await call('/api/media/'+fresh.id+'/move/preview',{folder:'Béla'});assert.equal(p.to,path.join('10_CHARACTERS','Béla','new.png'));await call('/api/media/'+fresh.id+'/move',{folder:'Béla',from_path:p.from});assert.equal((await call('/api/scan',{})).added,0);
 assert.equal((await request('/api/media/'+fresh.id+'/move/preview',{folder:'../00_SYSTEM'})).status,400);
}));
test('shared media remains one source with multiple depictions; Removed files restore across organized paths',()=>fixture(async({root,app,call})=>{
 const first=await call('/api/characters',{name:'One'}),second=await call('/api/characters',{name:'Two'});await fs.mkdir(path.join(root,'20_SHARED_MEDIA','Scenes'),{recursive:true});await fs.writeFile(path.join(root,'20_SHARED_MEDIA','Scenes','scene.png'),png);await call('/api/scan',{});const m=app.db.prepare('SELECT * FROM media').get();await call('/api/media/'+m.id,{character_ids:[first.id,second.id]},'PUT');await call('/api/media/'+m.id+'/remove',{mode:'file'});assert.equal(app.db.prepare('SELECT relative_path FROM media').get().relative_path,path.join('99_ARCHIVE','Removed',m.id,'scene.png'));await call('/api/media/'+m.id+'/restore-item',{});assert.equal((await call('/api/media/'+m.id)).characters.length,2);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);assert.equal((await call('/api/scan',{})).added,0);
 const reader=await createCatalogue({database:path.join(app.dataDir,'universe.sqlite'),mediaRoot:root});try{assert.equal((await reader.call('get_media',{media_id:m.id})).data.characters.length,2);}finally{reader.close();}
}));
test('organized imports commit once into shared storage and retain idempotent multi-character receipts',()=>fixture(async({root,app,call,database,dataDir,config,base})=>{
 const one=await call('/api/characters',{name:'One'}),two=await call('/api/characters',{name:'Two'});const writeConfig=path.join(dataDir,'mcp-writes.json');await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:base}));const writer=await createWriteClient({database,writeConfig});const pending=(await writer.call('begin_media_import',{request_key:'layout_import_fixture',character_ids:[one.id,two.id]})).data;
 const upload=async()=>{const r=await fetch(base+`/api/mcp-imports/${pending.import_id}/items/layout_slot_01`,{method:'PUT',headers:{Authorization:'Bearer '+config.token,'Content-Type':'image/png','X-LU-Filename':'fixture.png','X-LU-SHA256':sha(png)},body:png});assert.equal(r.status,200,await r.clone().text());return r.json();};await upload();await upload();const m=app.db.prepare('SELECT * FROM media').get();assert.equal(m.folder,path.join('20_SHARED_MEDIA','Unassigned'));assert.equal(app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,2);assert.equal(sha(await fs.readFile(path.join(root,m.relative_path))),sha(png));assert.equal((await call('/api/scan',{})).added,0);
}));
test('organized backups use only the reserved backup destination and never enter the media scan',()=>fixture(async({root,database,call})=>{
 const parent=path.dirname(root),source=path.join(parent,'source'),stage=path.join(parent,'stage');await fs.mkdir(source);await fs.writeFile(path.join(source,'package.json'),'{"type":"module"}');
 const backup=await createBackup({root:source,mediaRoot:root,database,destination:path.join(root,'90_BACKUPS'),stageParent:stage,privateRuntime:false});assert.ok((await verifySnapshot(backup.snapshot)).verified_files>0);assert.equal((await call('/api/scan',{})).added,0);await assert.rejects(createBackup({root:source,mediaRoot:root,database,destination:path.join(root,'20_SHARED_MEDIA','unsafe'),stageParent:stage,privateRuntime:false}),/destination must be separate/);
}));
