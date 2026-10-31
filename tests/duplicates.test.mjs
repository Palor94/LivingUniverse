import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {differenceHash,visualVersion} from '../app/public/image-hash.js';
import {distance,similarPairs,cloudAvailability} from '../app/duplicates.mjs';

test('local availability probe treats quoted Unicode paths as data',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const file=path.join(temp,"Péter's [local].png");
  try{await fs.writeFile(file,'local bytes');assert.equal(await cloudAvailability(file),'local');assert.equal(await fs.readFile(file,'utf8'),'local bytes');}finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});

test('difference hash measures structure; neighbour search is bounded and excludes exact duplicates',()=>{
  const sample=(reverse=false)=>{const pixels=new Uint8ClampedArray(9*8*4);for(let y=0;y<8;y++)for(let x=0;x<9;x++){const i=(y*9+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=(reverse?8-x:x)*25;pixels[i+3]=255;}return pixels;};
  assert.equal(differenceHash(sample()),'0000000000000000');assert.equal(differenceHash(sample(true)),'ffffffffffffffff');assert.equal(distance(differenceHash(sample()),differenceHash(sample(true))),64);
  const items=[{id:'a',sha256:'same',visual_hash:'0000000000000000'},{id:'b',sha256:'same',visual_hash:'0000000000000000'},{id:'c',sha256:'other',visual_hash:'0000000000000003'},{id:'d',sha256:'far',visual_hash:'ffffffffffffffff'}];
  assert.equal(similarPairs(items,1).pairs.length,0);assert.equal(similarPairs(items,2).pairs.length,2);assert.equal(similarPairs(items,2,1).truncated,true);assert.throws(()=>differenceHash([]));
});

test('optional hashing caches work, skips online originals, preserves identity, invalidates changed content and restores',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  const files={'one.png':'same image bytes','copy.png':'same image bytes','near.png':'different image','offline.mp4':'offline bytes','unknown.png':'availability unknown'};
  for(const [name,bytes] of Object.entries(files))await fs.writeFile(path.join(root,name),bytes);
  let app,base;let offline=true;
  const availability=async file=>path.basename(file)==='offline.mp4'&&offline?'online':path.basename(file)==='unknown.png'?'unknown':'local';
  async function start(dataDir){app=await createApp({root,dataDir,duplicateAvailability:availability});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const res=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
  async function call(...args){const res=await request(...args);assert.ok(res.status<300,JSON.stringify(res));return res.data;}
  await start(path.join(temp,'data'));
  try{
    await call('/api/scan',{});const list=(await call('/api/media?ids_only=1')).ids;assert.ok(list.length===5);assert.equal((await call('/api/duplicates/groups')).cached,0);
    const ids={};for(const name of Object.keys(files))ids[name]=(await call('/api/media?search='+name)).items[0].id;
    const c=await call('/api/characters',{name:'Pákozdi'});await call('/api/media/'+ids['one.png'],{character_ids:[c.id],tags:'body, reference',notes:'Keep notes',categorization_complete:true},'PUT');
    await call('/api/media/'+ids['one.png']+'/review',{character_id:c.id,decision:'approved',rating:5,notes:'Keep review'});
    const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Unchanged identity',references:[{media_id:ids['one.png'],role:'body'}]});const before=await call('/api/media/'+ids['one.png']);
    assert.equal((await call('/api/duplicates/plan')).ids.length,5);const result=await call('/api/duplicates/analyze',{ids:list});assert.equal(result.results.filter(r=>r.status==='hashed').length,3);assert.equal(result.results.filter(r=>r.status==='skipped').length,2);
    let groups=await call('/api/duplicates/groups');assert.equal(groups.total,1);assert.equal(groups.items[0].items.length,2);assert.equal(groups.items[0].items.find(m=>m.id===ids['one.png']).canonical,true);
    assert.equal(groups.items[0].items.find(m=>m.id===ids['one.png']).categorization_complete,true);
    assert.equal(groups.items[0].items.find(m=>m.id===ids['copy.png']).categorization_complete,false);
    assert.equal((await request('/api/media/'+ids['one.png']+'/remove',{mode:'file'})).status,409);
    await call('/api/media/'+ids['copy.png']+'/remove',{mode:'file'});
    assert.equal((await call('/api/duplicates/groups')).total,0);
    assert.equal(await fs.stat(path.join(root,'copy.png')).then(()=>true,()=>false),false);
    assert.equal((await call('/api/removed')).items.find(m=>m.id===ids['copy.png']).physical,1);
    await call('/api/media/'+ids['copy.png']+'/restore-item',{});
    assert.equal(await fs.readFile(path.join(root,'copy.png'),'utf8'),'same image bytes');
    await call('/api/duplicates/analyze',{ids:[ids['copy.png']]});
    assert.equal((await call('/api/duplicates/groups')).total,1);
    const exact=await call('/api/export');const stamps=exact.media_fingerprints.map(m=>m.checked_at);
    for(const r of result.results.filter(r=>r.visual)){const hash=r.id===ids['near.png']?'0000000000000001':'0000000000000000';await call('/api/duplicates/visual',{id:r.id,...r.visual,hash,version:visualVersion,width:100,height:200});}
    const cached=await call('/api/duplicates/analyze',{ids:list});assert.equal(cached.results.filter(r=>r.status==='cached').length,3);assert.deepEqual((await call('/api/export')).media_fingerprints.map(m=>m.checked_at),stamps);
    assert.equal((await call('/api/duplicates/groups?mode=similar&threshold=0')).total,0);assert.equal((await call('/api/duplicates/groups?mode=similar&threshold=1')).total,2);
    assert.equal((await request('/api/duplicates/analyze',{ids:['unknown-id']})).status,404);assert.equal((await request('/api/duplicates/analyze',{ids:list,allow_download:'yes'})).status,400);
    assert.equal((await request('/api/duplicates/visual',{id:ids['near.png'],hash:'bad',version:visualVersion,width:10,height:10})).status,400);
    assert.equal((await request('/api/duplicates/visual',{id:ids['near.png'],signature:'stale',sha256:'bad',hash:'0000000000000000',version:visualVersion,width:10,height:10})).status,409);
    await call('/api/duplicates/analyze',{ids:[ids['offline.mp4']],allow_download:true});assert.equal((await call('/api/duplicates/groups')).cached,4);
    const backup=await call('/api/export');await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/duplicates/groups')).total,1);assert.equal((await call('/api/duplicates/groups?mode=similar&threshold=1')).total,2);
    assert.deepEqual((await call('/api/media/'+ids['one.png'])).reviews,before.reviews);assert.equal((await call('/api/media/'+ids['one.png'])).notes,before.notes);assert.equal((await call('/api/media/'+ids['one.png'])).tags,before.tags);assert.equal((await call('/api/media/'+ids['one.png'])).categorization_complete,true);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
    // Cache invalidation uses actual filesystem metadata, not the last scanner baseline.
    await fs.writeFile(path.join(root,'copy.png'),'changed image bytes');groups=await call('/api/duplicates/groups');assert.equal(groups.total,0);assert.equal(groups.stale,1);await call('/api/duplicates/analyze',{ids:[ids['copy.png']]});assert.equal((await call('/api/duplicates/groups')).total,0);
    await fs.unlink(path.join(root,'near.png'));assert.equal((await call('/api/duplicates/groups?mode=similar')).total,0);
    for(const [name,bytes] of Object.entries(files))if(!['near.png','copy.png'].includes(name))assert.equal(await fs.readFile(path.join(root,name),'utf8'),bytes);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
