import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {ideaKindOf} from '../app/idea-box.mjs';
import {backgroundTools,backgroundOperations} from '../mcp/backgrounds.mjs';

test('idea kind comes from the planning subfolder',()=>{
  const base='20_SHARED_MEDIA\\Unassigned\\Generation plans, ideas\\';
  assert.equal(ideaKindOf(base+'Képregény-kivágások\\a.png'),'comic');
  assert.equal(ideaKindOf(base+'Ihletek\\a.png'),'inspiration');
  assert.equal(ideaKindOf(base+'a.png'),'plan');assert.equal(ideaKindOf(base+'Régi\\a.png'),'plan');
  assert.equal(ideaKindOf('20_SHARED_MEDIA\\Unassigned\\a.png'),null);
  const t=backgroundTools.find(x=>x.name==='list_idea_box');assert.ok(t.annotations.readOnlyHint);assert.equal(backgroundOperations.list_idea_box,'ideas');
});

test('Ötletláda: in and out by journaled move, notes, out of the sorting inbox, never overwrites',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-ideas-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
  const un=path.join(root,'20_SHARED_MEDIA','Unassigned');await fs.mkdir(path.join(un,'Képregény'),{recursive:true});
  await fs.writeFile(path.join(un,'Képregény','panel.png'),'p1');await fs.writeFile(path.join(un,'mood.png'),'m1');
  const comicDir=path.join(un,'Generation plans, ideas','Képregény-kivágások');await fs.mkdir(comicDir,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    await call('/api/scan',{});
    // A different file already has the name in the comic folder: the new one gets "(2)".
    await fs.writeFile(path.join(comicDir,'panel.png'),'other');
    const id=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
    const inboxIds=async()=>(await call('/api/workshop/inbox?missing=any&limit=100')).data.items.map(i=>i.media_id);
    assert.ok((await inboxIds()).includes(id['mood.png']));
    assert.equal((await call('/api/workshop/ideas',{media_id:id['mood.png'],kind:'nonsense'})).status,400);
    const comic=(await call('/api/workshop/ideas',{media_id:id['panel.png'],kind:'comic',note:'Palor és Domi ebben a pózban'})).data;
    assert.equal(comic.relative_path,path.join('20_SHARED_MEDIA','Unassigned','Generation plans, ideas','Képregény-kivágások','panel (2).png'));
    assert.equal(await fs.readFile(path.join(comicDir,'panel.png'),'utf8'),'other','never overwritten');
    assert.equal(await fs.readFile(path.join(comicDir,'panel (2).png'),'utf8'),'p1');
    await assert.rejects(fs.stat(path.join(un,'Képregény')),'the emptied old folder is removed');
    await call('/api/workshop/ideas',{media_id:id['mood.png'],kind:'inspiration'});
    let list=(await call('/api/workshop/ideas')).data;
    assert.deepEqual([list.counts.comic,list.counts.inspiration],[1,1]);
    assert.equal(list.items.find(i=>i.media_id===id['panel.png']).note,'Palor és Domi ebben a pózban');
    assert.ok(!(await inboxIds()).includes(id['mood.png']),'ideas leave the sorting inbox');
    assert.equal(app.db.prepare("SELECT count(*) n FROM file_moves WHERE status='complete'").get().n,2);
    // Same media ID throughout; a note can be changed or cleared.
    assert.equal((await call('/api/workshop/ideas/note',{media_id:id['mood.png'],note:'esti hangulat a Városligetben'})).data.note,'esti hangulat a Városligetben');
    assert.equal((await call('/api/workshop/ideas/note',{media_id:id['mood.png'],note:'x'.repeat(1001)})).status,400);
    // Taking it out: back among the unsorted pictures, note kept out of the way.
    const out=(await call('/api/workshop/ideas/remove',{media_id:id['mood.png']})).data;
    assert.equal(out.relative_path,path.join('20_SHARED_MEDIA','Unassigned','mood.png'));
    assert.ok((await inboxIds()).includes(id['mood.png']));
    assert.equal((await call('/api/workshop/ideas/remove',{media_id:id['mood.png']})).status,409);
    list=(await call('/api/workshop/ideas?kind=inspiration')).data;assert.equal(list.total,0);
  }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
