import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

test('bulk sorting is additive and atomic; explicit completion, queue snapshots, and backups preserve identity',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const root=path.join(temp,'resources');await fs.mkdir(root);
  for(let i=0;i<51;i++)await fs.writeFile(path.join(root,String(i).padStart(2,'0')+'.png'),'unchanged image '+i);
  await fs.writeFile(path.join(root,'video.mp4'),'video fixture');let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const res=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,value:await res.json()};}
  async function call(...args){const result=await request(...args);assert.ok(result.status<300,JSON.stringify(result));return result.value;}
  const bulk=(operation,media_ids,extra={})=>call('/api/media/bulk',{operation,media_ids,...extra});
  await start(path.join(temp,'data'));
  try{
    await call('/api/scan',{});const first=await call('/api/media?kind=image');assert.equal(first.items.length,48);const ids=first.items.map(m=>m.id);const a=await call('/api/characters',{name:'Pákozdi'}),b=await call('/api/characters',{name:'Palor'});
    await call('/api/media/'+ids[0],{character_ids:[b.id],tags:'Shirtless, teljes alak',notes:'Preserve this note'},'PUT');
    const canon=await call('/api/characters/'+b.id+'/canon',{appearance:'Approved identity',references:[{media_id:ids[0],role:'body'}]});await call('/api/media/'+ids[0]+'/review',{character_id:b.id,decision:'approved',rating:4,notes:'Saved fidelity review'});
    const snapshot=await call('/api/media/'+ids[0]);const result=await bulk('assign',ids.slice(0,35),{character_ids:[a.id,b.id,a.id]});assert.equal(result.updated,35);assert.equal(result.associations,69);assert.equal((await bulk('assign',ids.slice(0,35),{character_ids:[a.id,b.id]})).updated,0);
    assert.equal((await call('/api/media/'+ids[0])).sorting_status,'multiple');assert.equal((await call('/api/media?inbox=1&kind=image')).total,51);
    await bulk('tags_add',ids.slice(0,35),{tags:'shirtless, smiling, mosolygó'});let updated=await call('/api/media/'+ids[0]);assert.equal(updated.tags,'Shirtless, teljes alak, smiling, mosolygó');assert.equal(updated.notes,snapshot.notes);assert.deepEqual(updated.reviews,snapshot.reviews);assert.deepEqual(updated.canonicalFor,snapshot.canonicalFor);assert.equal((await call('/api/characters/'+b.id)).canon.id,canon.id);
    await bulk('tags_remove',[ids[0]],{tags:'SMILING'});updated=await call('/api/media/'+ids[0]);assert.equal(updated.tags,'Shirtless, teljes alak, mosolygó');assert.equal(updated.notes,'Preserve this note');
    const queue=await call('/api/media?inbox=1&kind=image&ids_only=1');assert.equal(queue.ids.length,51);assert.equal((await call('/api/media?kind=image&offset=48')).items[0].id,queue.ids[48]);
    await bulk('complete',[ids[0],ids[1]]);assert.equal((await call('/api/media?inbox=1&kind=image')).total,49);assert.equal((await call('/api/media?status=complete')).total,2);assert.equal((await call('/api/media/'+queue.ids[1])).sorting_status,'complete');assert.equal((await call('/api/state')).stats.inbox,50);
    await bulk('reopen',[ids[0]]);assert.equal((await call('/api/media/'+ids[0])).sorting_status,'multiple');
    await call('/api/media/'+ids[0],{character_ids:[a.id,b.id],tags:updated.tags,notes:updated.notes,categorization_complete:true},'PUT');assert.equal((await call('/api/media/'+ids[0])).sorting_status,'complete');
    const beforeInvalid=await call('/api/media/'+ids[2]);assert.equal((await request('/api/media/bulk',{operation:'tags_add',media_ids:[ids[2],'not-an-id'],tags:'must not appear'})).status,409);assert.equal((await call('/api/media/'+ids[2])).tags,beforeInvalid.tags);
    assert.equal((await request('/api/media/bulk',{operation:'assign',media_ids:[ids[2]],character_ids:['not-a-character']})).status,400);
    await call('/api/media/'+ids[3],{character_ids:[],tags:'x'.repeat(1999),notes:'Still here'},'PUT');assert.equal((await request('/api/media/bulk',{operation:'tags_add',media_ids:[ids[2],ids[3]],tags:'additional'})).status,400);assert.equal((await call('/api/media/'+ids[2])).tags,beforeInvalid.tags);
    assert.equal((await call('/api/media?kind=video&ids_only=1')).ids.length,1);assert.equal(await fs.readFile(path.join(root,'00.png'),'utf8'),'unchanged image 0');assert.equal((await call('/api/media/'+ids[0])).moves.length,0);
    const backup=await call('/api/export');assert.equal(backup.media_categorization.length,2);await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/media/'+ids[0])).categorization_complete,true);assert.equal((await call('/api/media/'+ids[0])).notes,'Preserve this note');assert.equal((await call('/api/characters/'+b.id)).canon.id,canon.id);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
