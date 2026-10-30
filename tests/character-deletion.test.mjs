import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

test('empty characters can be deleted; assigned media and canonical history are protected',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));
  const root=path.join(temp,'resources');await fs.mkdir(root);await fs.writeFile(path.join(root,'keep.png'),'unchanged original');
  const app=await createApp({root,dataDir:path.join(temp,'data')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(route,body,method){const res=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  try{
    const empty=await call('/api/characters',{name:'Empty character'}),other=await call('/api/characters',{name:'Keep character'});
    await call('/api/characters/'+empty.id,{...empty,name:empty.name,notes:'Preserve deletion snapshot'},'PUT');
    await call('/api/relationships',{source_id:other.id,target_id:empty.id,description:'Known relationship'});
    assert.equal((await call('/api/characters/'+empty.id)).deletion_block,null);
    await call('/api/characters/'+empty.id,undefined,'DELETE');
    assert.equal((await request('/api/characters/'+empty.id)).status,404);
    assert.equal((await call('/api/characters/'+other.id)).relationships.length,0);
    const snapshot=(await call('/api/export')).application_settings.find(r=>r.key==='deleted_character:'+empty.id);
    assert.equal(JSON.parse(snapshot.value).character.notes,'Preserve deletion snapshot');
    assert.equal(JSON.parse(snapshot.value).relationships.length,1);
    await call('/api/scan',{});const media=(await call('/api/media')).items[0];
    await call('/api/media/'+media.id,{character_ids:[other.id]},'PUT');
    assert.equal((await request('/api/characters/'+other.id,undefined,'DELETE')).status,409);
    await call('/api/media/'+media.id+'/remove',{mode:'catalogue'});
    assert.equal((await request('/api/characters/'+other.id,undefined,'DELETE')).status,409);
    const canonCharacter=await call('/api/characters',{name:'Canonical identity'});
    const canon=await approveCanon(call,canonCharacter.id,{appearance:'Approved description',references:[]});
    assert.equal((await request('/api/characters/'+canonCharacter.id,undefined,'DELETE')).status,409);
    assert.equal((await call('/api/characters/'+canonCharacter.id)).canon.id,canon.id);
    assert.equal(await fs.readFile(path.join(root,'keep.png'),'utf8'),'unchanged original');
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
