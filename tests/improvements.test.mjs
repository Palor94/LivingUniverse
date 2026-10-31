import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {confirmFolders} from './folder-preview-client.mjs';

async function fixture(fn){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const root=path.join(temp,'resources');await fs.mkdir(root);let app;let base;
  async function start(dir=path.join(temp,'data')){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,data,method){const res=await fetch(base+route,{method:method||(data?'POST':'GET'),headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:res.status,value:await res.json()};}
  async function call(...args){if(['/api/assign-folder','/api/sort-folders'].includes(args[0]))return confirmFolders(call,args[0],args[1]);const result=await request(...args);assert.ok(result.status<300,JSON.stringify(result));return result.value;}
  try{await start();await fn({root,temp,call,request,get app(){return app;},restart:async dir=>{await app.close();await start(dir);}});}finally{if(app)await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}}

test('field autosave, cover regions, rename, reference protection, reversible removal, and portable backups',()=>fixture(async({root,temp,call,request,restart})=>{
  await fs.writeFile(path.join(root,'scene.png'),'picture fixture');await call('/api/scan',{});const m=(await call('/api/media')).items[0];const c=await call('/api/characters',{name:'Character'});
  await call('/api/media/'+m.id,{character_ids:[c.id],tags:'shared trucker, Palor',notes:'Unknown extra'},'PUT');
  await Promise.all([call('/api/characters/'+c.id+'/profile-field',{field:'biography',value:'Magyar életrajz őű'}),call('/api/characters/'+c.id+'/profile-field',{field:'personality',value:'Reserved'})]);
  let profile=await call('/api/characters/'+c.id);assert.equal(profile.biography,'Magyar életrajz őű');assert.equal(profile.personality,'Reserved');
  assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'id',value:'replacement'})).status,400);
  await call('/api/characters/'+c.id+'/cover-crop',{media_id:m.id,crop:{x:.1,y:.2,w:.3,h:.4}});profile=await call('/api/characters/'+c.id);assert.equal(profile.cover_id,m.id);assert.equal(JSON.parse(profile.cover_crop).x,.1);
  assert.equal((await request('/api/characters/'+c.id+'/cover-crop',{media_id:m.id,crop:{x:.9,y:.2,w:.3,h:.4}})).status,400);
  await approveCanon(call,c.id,{references:[{media_id:m.id,role:'face'}],appearance:'User approved'});
  await call('/api/media/'+m.id+'/rename',{filename:'új név.png'});assert.equal((await call('/api/characters/'+c.id+'/integrity',{})).results[0].status,'unchanged');assert.equal(await fs.readFile(path.join(root,'új név.png'),'utf8'),'picture fixture');
  assert.equal((await request('/api/media/'+m.id+'/rename',{filename:'../escape.png'})).status,400);assert.equal((await request('/api/media/'+m.id+'/rename',{filename:'changed.mp4'})).status,400);
  assert.equal((await request('/api/media/'+m.id+'/remove',{mode:'file'})).status,409);
  await approveCanon(call,c.id,{references:[],appearance:'User approved',reason:'Retired reference explicitly'});
  await call('/api/media/'+m.id+'/remove',{mode:'catalogue'});await call('/api/scan',{});assert.equal((await call('/api/media')).total,0);assert.equal(await fs.readFile(path.join(root,'új név.png'),'utf8'),'picture fixture');
  await call('/api/media/'+m.id+'/restore-item',{});assert.equal((await call('/api/media')).total,1);
  await call('/api/media/'+m.id+'/remove',{mode:'file'});assert.equal(await fs.stat(path.join(root,'új név.png')).then(()=>true,()=>false),false);assert.equal((await call('/api/removed')).items[0].physical,1);
  const backup=await call('/api/export');await restart(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/removed')).items.length,1);assert.equal(JSON.parse((await call('/api/characters/'+c.id)).cover_crop).w,.3);
  await fs.writeFile(path.join(root,'új név.png'),'collision');assert.equal((await request('/api/media/'+m.id+'/restore-item',{})).status,409);await fs.unlink(path.join(root,'új név.png'));await call('/api/media/'+m.id+'/restore-item',{});assert.equal(await fs.readFile(path.join(root,'új név.png'),'utf8'),'picture fixture');
}));

test('Palor merge keeps stable identities and canon history, relationships, shared media, and conflicts',()=>fixture(async({root,call,app})=>{
  await fs.mkdir(path.join(root,'Tibor'));await fs.mkdir(path.join(root,'Palor'));await fs.writeFile(path.join(root,'Tibor','scene.png'),'Tibor bytes');await fs.writeFile(path.join(root,'Palor','scene.png'),'Palor bytes');await call('/api/scan',{});
  const p=await call('/api/characters',{name:'Palor'}),t=await call('/api/characters',{name:'Tibor'}),other=await call('/api/characters',{name:'Dezső'});
  await call('/api/assign-folder',{character_id:t.id,folder:'Tibor'});const m=(await call('/api/media?folder=Tibor')).items[0];const identity=await approveCanon(call,t.id,{appearance:'Approved Tibor appearance',references:[{media_id:m.id,role:'face'}]});
  await call('/api/relationships',{source_id:other.id,target_id:t.id,description:'Knows Tibor'});await call('/api/characters/'+t.id+'/profile-field',{field:'biography',value:'Existing biography'});
  const merge=await call('/api/palor-merge',{});assert.equal(merge.target.id,p.id);assert.equal(merge.errors.length,0);assert.equal(merge.moved,1);assert.equal((await call('/api/state')).characters.length,2);assert.equal((await call('/api/protagonist')).character.id,p.id);
  assert.equal((await call('/api/characters/'+t.id)).canon.id,identity.id);assert.equal((await call('/api/characters/'+p.id)).canon,null);assert.equal((await call('/api/characters/'+p.id)).biography,'Existing biography');assert.equal((await call('/api/characters/'+other.id)).relationships.find(r=>r.target_id===p.id).description,'Knows Tibor');
  const moved=await call('/api/media/'+m.id);assert.equal(moved.characters[0].id,p.id);assert.equal(await fs.readFile(path.join(root,moved.relative_path),'utf8'),'Tibor bytes');assert.equal(await fs.readFile(path.join(root,'Palor','scene.png'),'utf8'),'Palor bytes');assert.ok(moved.relative_path.includes(m.id.slice(0,8)));assert.equal((await call('/api/characters/'+t.id+'/integrity',{})).results[0].status,'unchanged');
  await call('/api/media/'+m.id,{character_ids:[p.id],notes:'Still linked'},'PUT');assert.equal((await call('/api/media/'+m.id)).canonicalFor[0],t.id);assert.ok((await fs.stat(merge.backupPath)).size>0);
  const again=await call('/api/palor-merge',{});assert.equal(again.merged,0);assert.equal(again.moved,0);
}));
