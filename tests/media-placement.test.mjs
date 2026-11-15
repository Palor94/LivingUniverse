import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {placementOf} from '../app/media-placement.mjs';

const P={id:'p',name:'Palor'},A={id:'a',name:'Attila'},B={id:'b',name:'Béla'};
const rule=(relative,people,extra={})=>placementOf({relative,people,palorId:'p',isAsset:false,ownFolder:()=>null,...extra});

test('placement rule: one character → his folder, two or more → Scenes\\A + B, the rest stays',()=>{
  assert.equal(rule('20_SHARED_MEDIA\\Scenes\\Régi\\x.png',[A,P]).to,'10_CHARACTERS\\Attila\\x.png','Palor is not counted');
  assert.equal(rule('20_SHARED_MEDIA\\Unassigned\\x.png',[P]).to,'10_CHARACTERS\\Palor\\x.png','Palor alone → Palor');
  assert.equal(rule('20_SHARED_MEDIA\\Locations\\x.png',[B,A,P]).to,'20_SHARED_MEDIA\\Scenes\\Attila + Béla\\x.png','names sorted');
  assert.equal(rule('10_CHARACTERS\\Attila\\Generated\\x.png',[A]),null,'already inside his folder (subfolders too)');
  assert.equal(rule('20_SHARED_MEDIA\\Scenes\\x.png',[A],{ownFolder:()=> '10_CHARACTERS\\Attila (régi)'}).to,'10_CHARACTERS\\Attila (régi)\\x.png','his owned folder wins');
  assert.equal(rule('20_SHARED_MEDIA\\Szereplő-alakok\\x.png',[A]),null,'game folders stay');
  assert.equal(rule('20_SHARED_MEDIA\\Scenes\\x.png',[A],{isAsset:true}),null,'game assets stay');
  assert.equal(rule('20_SHARED_MEDIA\\Unassigned\\Generation plans, ideas\\x.png',[A]),null,'generation plans stay');
  assert.equal(rule('20_SHARED_MEDIA\\Locations\\x.png',[]),null,'nobody recognised stays');
  assert.equal(rule('20_SHARED_MEDIA\\Scenes\\x.png',[{id:'q',name:'Bad:Name'}]),null,'unsafe folder name is skipped');
});

test('placement: the home task moves files with journal, keeps IDs and links, never overwrites',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-place-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
  const old=path.join(root,'20_SHARED_MEDIA','Scenes','Régi');await fs.mkdir(old,{recursive:true});
  await fs.writeFile(path.join(old,'a.png'),'aaa');await fs.writeFile(path.join(old,'ab.png'),'abab');await fs.writeFile(path.join(old,'clash.png'),'new');
  await fs.mkdir(path.join(root,'10_CHARACTERS','Attila'),{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const a=(await call('/api/characters',{name:'Attila'})).data,b=(await call('/api/characters',{name:'Béla'})).data;
    await call('/api/scan',{});
    // A different file already sits at clash.png's destination: it must not be overwritten.
    await fs.writeFile(path.join(root,'10_CHARACTERS','Attila','clash.png'),'old');
    const media=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
    await call('/api/media/bulk',{operation:'assign',media_ids:[media['a.png'],media['clash.png']],character_ids:[a.id]});
    await call('/api/media/bulk',{operation:'assign',media_ids:[media['ab.png']],character_ids:[a.id,b.id]});
    const plan=(await call('/api/media/placement')).data;
    assert.equal(plan.count,3);
    const done=(await call('/api/media/placement/apply',{})).data;
    assert.equal(done.moved,2);assert.deepEqual(done.skipped.map(s=>s.reason),['name taken']);
    assert.equal(await fs.readFile(path.join(root,'10_CHARACTERS','Attila','a.png'),'utf8'),'aaa');
    assert.equal(await fs.readFile(path.join(root,'20_SHARED_MEDIA','Scenes','Attila + Béla','ab.png'),'utf8'),'abab');
    assert.equal(await fs.readFile(path.join(root,'10_CHARACTERS','Attila','clash.png'),'utf8'),'old','never overwritten');
    assert.equal(await fs.readFile(path.join(old,'clash.png'),'utf8'),'new','the skipped source stays');
    const moved=(await call('/api/media/'+media['a.png'])).data;
    assert.equal(moved.relative_path,path.join('10_CHARACTERS','Attila','a.png'),'same ID, new path');
    assert.equal(app.db.prepare("SELECT count(*) n FROM file_moves WHERE status='complete'").get().n,2);
    assert.equal(app.db.prepare('SELECT count(*) n FROM depictions WHERE media_id=?').get(media['ab.png']).n,2,'links kept');
    assert.equal((await call('/api/media/placement')).data.count,1,'only the clash is left');
  }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
