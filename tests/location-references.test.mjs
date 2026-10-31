import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';

test('location references leave the sorting queue without people or completion and round-trip through backups',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  await start(path.join(temp,'data'));
  try{
    await fs.writeFile(path.join(root,'cafe.png'),'original cafe');await fs.writeFile(path.join(root,'scene.png'),'original scene');await call('/api/scan',{});const items=(await call('/api/media')).items,place=items.find(m=>m.relative_path==='cafe.png'),scene=items.find(m=>m.relative_path==='scene.png');
    assert.equal((await call('/api/state')).stats.inbox,2);
    await call('/api/media/'+place.id,{character_ids:[],tags:'meeting place',notes:'Possible meetup only',location_reference:true},'PUT');const location=await call('/api/media/'+place.id);assert.equal(location.location_reference,true);assert.equal(location.sorting_status,'location');assert.equal(location.categorization_complete,false);assert.equal(location.characters.length,0);
    assert.equal((await call('/api/state')).stats.inbox,1);assert.deepEqual((await call('/api/media?inbox=1&ids_only=1')).ids,[scene.id]);assert.equal((await call('/api/media?role=location')).total,1);assert.equal((await call('/api/media?role=character')).total,1);
    const c=await call('/api/characters',{name:'Palor'});await call('/api/media/'+scene.id,{character_ids:[c.id],notes:'Keep scene',tags:'body'},'PUT');const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Preserved',references:[{media_id:scene.id,role:'body'}]});
    assert.equal((await request('/api/media/bulk',{operation:'location',media_ids:[scene.id,'missing']})).status,409);assert.equal((await call('/api/media/'+scene.id)).location_reference,false);
    await call('/api/media/bulk',{operation:'location',media_ids:[scene.id]});assert.equal((await call('/api/state')).stats.inbox,0);assert.equal((await call('/api/media/'+scene.id)).characters[0].id,c.id);assert.equal((await call('/api/media/'+scene.id)).notes,'Keep scene');assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
    const backup=await call('/api/export');await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/media?role=location')).total,2);assert.equal((await call('/api/state')).stats.inbox,0);
    await call('/api/media/bulk',{operation:'unlocation',media_ids:[place.id]});assert.equal((await call('/api/state')).stats.inbox,1);assert.equal((await call('/api/media/'+place.id)).notes,'Possible meetup only');assert.equal((await call('/api/media/'+place.id)).categorization_complete,false);assert.equal(await fs.readFile(path.join(root,'cafe.png'),'utf8'),'original cafe');
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});

test('specific locations add structured labels and move originals only after an explicit preview/confirmation',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  await start(path.join(temp,'data'));
  try{
    await fs.writeFile(path.join(root,'meeting.png'),'unchanged meeting');await fs.writeFile(path.join(root,'other.png'),'unchanged other');await call('/api/scan',{});const m=(await call('/api/media?search=meeting.png')).items[0],other=(await call('/api/media?search=other.png')).items[0];const c=await call('/api/characters',{name:'Palor'});
    await call('/api/media/'+m.id,{character_ids:[c.id],tags:'original words',notes:'Keep note'},'PUT');const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Unchanged',references:[{media_id:m.id,role:'face'}]});
    const tagPlace=await call('/api/locations',{name:'M7 truckstop',kind:'tag'});assert.equal(tagPlace.folder,null);const place=await call('/api/locations',{name:'M7 truckstop',kind:'folder'});assert.equal(place.id,tagPlace.id);assert.equal(place.folder,path.join('Helyszín','M7 truckstop'));assert.ok(await fs.stat(path.join(root,place.folder)));assert.equal(await fs.readFile(path.join(root,'meeting.png'),'utf8'),'unchanged meeting');
    await call('/api/media/'+m.id,{character_ids:[c.id],tags:'original words',notes:'Keep note',structured_tag_ids:[],location_reference:true,location_id:place.id,categorization_complete:true},'PUT');const saved=await call('/api/media/'+m.id);assert.equal(saved.location.id,place.id);assert.equal(saved.location_reference,true);assert.ok(saved.structured_tags.some(t=>t.id===place.tag_id));assert.equal((await call('/api/media?location_id='+place.id)).total,1);assert.equal((await call('/api/state')).stats.inbox,1);
    assert.equal((await request('/api/media/'+m.id,{character_ids:[c.id],location_reference:true,location_id:'invalid',notes:'must roll back'},'PUT')).status,400);assert.equal((await call('/api/media/'+m.id)).notes,'Keep note');
    const preview=await call('/api/locations/move/preview',{media_id:m.id});assert.equal(await fs.readFile(path.join(root,'meeting.png'),'utf8'),'unchanged meeting');await call('/api/locations/move/confirm',{token:preview.token});assert.equal((await call('/api/media/'+m.id)).relative_path,path.join(place.folder,'meeting.png'));assert.equal(await fs.readFile(path.join(root,place.folder,'meeting.png'),'utf8'),'unchanged meeting');assert.equal((await call('/api/characters/'+c.id+'/integrity',{})).results[0].status,'unchanged');assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
    await call('/api/locations/assign',{media_ids:[other.id],location_id:'tag:'+place.tag_id});assert.equal((await call('/api/media/'+other.id)).location.id,place.id);await fs.writeFile(path.join(root,place.folder,'other.png'),'existing target');const conflict=await call('/api/locations/move/preview',{media_id:other.id});assert.equal((await request('/api/locations/move/confirm',{token:conflict.token})).status,409);assert.equal(await fs.readFile(path.join(root,'other.png'),'utf8'),'unchanged other');assert.equal(await fs.readFile(path.join(root,place.folder,'other.png'),'utf8'),'existing target');assert.equal((await request('/api/locations',{name:'Bad',kind:'folder',folder:'../escape'})).status,400);
    const backup=await call('/api/export');await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/media/'+m.id)).location.id,place.id);assert.equal((await call('/api/media?location_id='+place.id)).total,2);
    await call('/api/media/bulk',{operation:'unlocation',media_ids:[other.id]});assert.equal((await call('/api/media/'+other.id)).location.id,place.id);assert.equal((await call('/api/media/'+other.id)).location_reference,false);assert.equal((await call('/api/media/'+m.id)).characters[0].id,c.id);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
