import {renameFixture} from './complete-rename-fixture.mjs';
import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

async function fixture(fn){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  async function assign(folder,cid){const p=await call('/api/folders/preview',{folders:[{folder,character_id:cid}]});await call('/api/folders/confirm',{token:p.token});}
  await start(path.join(temp,'data'));try{await fn({root,temp,call,request,assign,rename:(cid,name)=>renameFixture(app,cid,name),restart:async()=>{await app.close();await start(path.join(temp,'restored'));}});}finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}}

test('complete approved rename changes the owned folder and nested originals without changing identity, sorting, or canon',()=>fixture(async({root,call,assign,restart,rename})=>{
  await fs.mkdir(path.join(root,'Old title','nested'),{recursive:true});await fs.writeFile(path.join(root,'Old title','nested','face.png'),'face bytes');await fs.writeFile(path.join(root,'Old title','notes.txt'),'uncatalogued companion');await call('/api/scan',{});const c=await call('/api/characters',{name:'Old title'});await assign('Old title',c.id);const m=(await call('/api/media')).items[0];
  await call('/api/media/'+m.id,{character_ids:[c.id],tags:'face',notes:'Preserve',categorization_complete:true},'PUT');const canon=await approveCanon(call,c.id,{appearance:'Identity unchanged',references:[{media_id:m.id,role:'face'}]});
  const renamed=await rename(c.id,'Zsolti');assert.equal(renamed.result.folder.status,'complete');assert.equal(await fs.readFile(path.join(root,'Zsolti','nested','face.png'),'utf8'),'face bytes');assert.equal(await fs.readFile(path.join(root,'Zsolti','notes.txt'),'utf8'),'uncatalogued companion');await assert.rejects(fs.stat(path.join(root,'Old title')));
  const after=await call('/api/media/'+m.id);assert.equal(after.relative_path,path.join('Zsolti','nested','face.png'));assert.equal(after.notes,'Preserve');assert.equal(after.categorization_complete,true);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);assert.equal((await call('/api/characters/'+c.id+'/integrity',{})).results[0].status,'unchanged');assert.equal((await call('/api/scan',{})).added,0);
  await call('/api/characters/'+c.id+'/profile-field',{field:'aliases',value:'Other name'});assert.ok(await fs.stat(path.join(root,'Zsolti')));assert.equal((await call('/api/folder-names')).plans.length,0);
  const backup=await call('/api/export');assert.equal(backup.folder_changes[0].status,'complete');await restart();await call('/api/restore',backup);assert.equal((await call('/api/media/'+m.id)).relative_path,after.relative_path);assert.equal((await call('/api/folder-names')).history[0].status,'complete');
}));

test('explicit catch-up merges disjoint folders and keeps all files and media IDs',()=>fixture(async({root,call,assign,rename})=>{
  for(const folder of ['Old','Serge']){await fs.mkdir(path.join(root,folder));await fs.writeFile(path.join(root,folder,folder+'.png'),folder+' bytes');}await call('/api/scan',{});const c=await call('/api/characters',{name:'Serge'});await assign('Old',c.id);await assign('Serge',c.id);const before=(await call('/api/media')).items.map(m=>m.id).sort();const preview=await call('/api/folder-names');assert.equal(preview.plans[0].merge,true);assert.equal(preview.plans[0].blocked,null);assert.ok(await fs.stat(path.join(root,'Old')));
  const result=await call('/api/folder-names/sync',{token:(await call('/api/folder-names')).token});assert.equal(result.completed.length,1);assert.equal(await fs.readFile(path.join(root,'Serge','Old.png'),'utf8'),'Old bytes');assert.equal(await fs.readFile(path.join(root,'Serge','Serge.png'),'utf8'),'Serge bytes');assert.deepEqual((await call('/api/media')).items.map(m=>m.id).sort(),before);await assert.rejects(fs.stat(path.join(root,'Old')));assert.equal((await call('/api/folder-names')).plans.length,0);
}));

test('collisions, other-character destinations, path escapes, and unknown shared folders are preserved',()=>fixture(async({root,call,request,assign})=>{
  for(const folder of ['Old','Target','Shared']){await fs.mkdir(path.join(root,folder));await fs.writeFile(path.join(root,folder,'same.png'),folder+' original');}await call('/api/scan',{});const c=await call('/api/characters',{name:'Old'});await assign('Old',c.id);
  assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'name',value:'Target'})).status,409);assert.equal((await call('/api/characters/'+c.id)).name,'Old');assert.equal(await fs.readFile(path.join(root,'Target','same.png'),'utf8'),'Target original');assert.equal(await fs.readFile(path.join(root,'Old','same.png'),'utf8'),'Old original');
  assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'name',value:'../escape'})).status,400);assert.ok((await call('/api/folder-names')).unmapped.some(f=>f.folder==='Shared'));const other=await call('/api/characters',{name:'Occupied'});await fs.mkdir(path.join(root,'Occupied'));assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'name',value:other.name})).status,409);
}));

test('case-only names and existing alias/suffix provenance synchronize without using aliases as destinations',()=>fixture(async({root,call,assign,rename})=>{
  await fs.mkdir(path.join(root,'Old Label'));await fs.writeFile(path.join(root,'Old Label','x.png'),'x');await call('/api/scan',{});const c=await call('/api/characters',{name:'Kristóf - Old Label'});const m=(await call('/api/media')).items[0];await call('/api/media/'+m.id,{character_ids:[c.id]},'PUT');assert.equal((await call('/api/folder-names')).plans[0].destination,'Kristóf - Old Label');await call('/api/folder-names/sync',{token:(await call('/api/folder-names')).token});await rename(c.id,'kristóf - Old Label');assert.equal((await call('/api/media/'+m.id)).folder,'kristóf - Old Label');assert.equal(await fs.readFile(path.join(root,'kristóf - Old Label','x.png'),'utf8'),'x');
}));

test('catch-up requires a fresh preview and rejects changed folder contents before moving anything',()=>fixture(async({root,call,request,assign})=>{
  await fs.mkdir(path.join(root,'Old'));await fs.writeFile(path.join(root,'Old','x.png'),'original');await call('/api/scan',{});const c=await call('/api/characters',{name:'New'});await assign('Old',c.id);
  assert.equal((await request('/api/folder-names/sync',{})).status,409);const preview=await call('/api/folder-names');await fs.writeFile(path.join(root,'Old','extra.txt'),'added after preview');assert.equal((await request('/api/folder-names/sync',{token:preview.token})).status,409);assert.equal(await fs.readFile(path.join(root,'Old','x.png'),'utf8'),'original');await assert.rejects(fs.stat(path.join(root,'New')));
}));
