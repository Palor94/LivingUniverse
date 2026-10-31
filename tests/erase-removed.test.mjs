import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

test('permanent erasure is confirmed, limited to removed items, preserves originals and identity history',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  for(const name of ['trash.png','catalogue.png','reference.png'])await fs.writeFile(path.join(root,name),name);
  const app=await createApp({root,dataDir:path.join(temp,'data')});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(route,body,method){const res=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  try{
    assert.equal((await call('/api/removed')).capabilities.permanent_erasure,true);
    await call('/api/scan',{});const media=(await call('/api/media')).items;
    const trash=media.find(m=>m.relative_path==='trash.png'),catalogue=media.find(m=>m.relative_path==='catalogue.png'),reference=media.find(m=>m.relative_path==='reference.png');
    const emptyAfterErasure=await call('/api/characters',{name:'Ázsiai'});
    await call('/api/media/'+trash.id,{character_ids:[emptyAfterErasure.id]},'PUT');
    const erase=(m,extra={})=>request('/api/media/'+m.id+'/erase-item',{confirm:true,expected_path:m.relative_path,...extra});
    assert.equal((await erase(trash)).status,409);
    await call('/api/media/'+trash.id+'/remove',{mode:'file'});
    const removed=(await call('/api/removed')).items.find(m=>m.id===trash.id),trashPath=path.join(root,removed.relative_path);
    assert.equal((await erase(removed,{confirm:false})).status,409);assert.equal(await fs.readFile(trashPath,'utf8'),'trash.png');
    assert.equal((await erase(removed,{expected_path:'another.png'})).status,409);
    assert.equal((await erase(removed)).status,200);
    assert.equal((await call('/api/characters/'+emptyAfterErasure.id)).deletion_block,null);
    await call('/api/characters/'+emptyAfterErasure.id,undefined,'DELETE');
    assert.equal((await request('/api/characters/'+emptyAfterErasure.id)).status,404);
    assert.equal(await fs.stat(trashPath).then(()=>true,()=>false),false);
    assert.equal((await call('/api/removed')).items.some(m=>m.id===trash.id),false);
    assert.equal((await request('/api/media/'+trash.id+'/restore-item',{})).status,409);
    assert.equal((await erase(removed)).status,200);
    await call('/api/media/'+catalogue.id+'/remove',{mode:'catalogue'});
    assert.equal((await erase(catalogue)).status,200);assert.equal(await fs.readFile(path.join(root,'catalogue.png'),'utf8'),'catalogue.png');
    await call('/api/scan',{});assert.equal((await call('/api/media')).items.some(m=>m.id===catalogue.id),false);
    const c=await call('/api/characters',{name:'Protected identity'});
    await call('/api/media/'+reference.id,{character_ids:[c.id]},'PUT');
    const approved=await call('/api/characters/'+c.id+'/canon',{appearance:'Approved',references:[{media_id:reference.id,role:'face'}]});
    assert.equal((await request('/api/media/'+reference.id+'/remove',{mode:'file'})).status,409);
    await call('/api/characters/'+c.id+'/canon',{appearance:'Retired reference',references:[]});
    await call('/api/media/'+reference.id+'/remove',{mode:'file'});
    const protectedItem=(await call('/api/removed')).items.find(m=>m.id===reference.id);
    assert.equal(protectedItem.protected,0); // Explicit retirement scrubs historical reference memberships.
    assert.equal(await fs.readFile(path.join(root,protectedItem.relative_path),'utf8'),'reference.png');
    assert.equal((await erase(protectedItem)).status,200);
    const backup=await call('/api/export');assert.ok(backup.canon.some(r=>r.id===approved.id&&r.appearance==='Approved'&&r.references_json==='[]'));assert.ok(backup.media.some(m=>m.id===trash.id));
    assert.ok(backup.application_settings.some(s=>s.key==='erased_media:'+trash.id));
    const deleted=JSON.parse(backup.application_settings.find(s=>s.key==='deleted_character:'+emptyAfterErasure.id).value);
    assert.equal(deleted.erased_media_links[0].media_id,trash.id);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
