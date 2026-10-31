import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createApp} from '../app/server.mjs';
import {confirmFolders} from './folder-preview-client.mjs';

test('private catalogue: shared media, immutable canon, persistence, restore, and original preservation',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));
  const root=path.join(temp,'resources');await fs.mkdir(path.join(root,'Pákozdi + Attila'),{recursive:true});
  const bytes=Buffer.from('test fixture, not a real photo');const mediaFile=path.join(root,'Pákozdi + Attila','scene.png');await fs.writeFile(mediaFile,bytes);await fs.writeFile(path.join(root,'clip.mp4'),Buffer.alloc(20,4));
  let app;
  async function start(dataDir){app=await createApp({root,dataDir});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+app.server.address().port;}
  const dataDir=path.join(temp,'data');let base=await start(dataDir);
  async function request(route,data,method){const r=await fetch(base+route,{method:method||(data?'POST':'GET'),headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:r.status,value:await r.json()};}
  const call=async(...args)=>{if(['/api/assign-folder','/api/sort-folders'].includes(args[0]))return confirmFolders(call,args[0],args[1]);const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.value;};
  try{
    const storage=await call('/api/storage');assert.equal(storage.database,path.resolve(dataDir,'universe.sqlite'));assert.equal(storage.resource_root,root);assert.equal(storage.characters,0);assert.equal(storage.media,0);
    const scan=await call('/api/scan',{});assert.equal(scan.added,2);assert.equal((await call('/api/scan',{})).added,0);
    const peter=await call('/api/characters',{name:'Pákozdi'});const attila=await call('/api/characters',{name:'Attila'});
    const items=(await call('/api/media')).items;const image=items.find(m=>m.kind==='image');const video=items.find(m=>m.kind==='video');
    await call('/api/media/'+image.id,{character_ids:[peter.id,attila.id],tags:'body, shirtless',notes:'Preserve build'},'PUT');
    assert.equal((await call('/api/media/'+image.id)).characters.length,2);
    const initial=await call('/api/characters/'+peter.id+'/canon',{appearance:'User-approved physique',references:[{media_id:image.id,role:'body'}],reason:'Initial approval'});
    assert.equal(JSON.parse(initial.references_json)[0].sha256.length,64);
    await fs.writeFile(mediaFile,'changed reference bytes');
    assert.equal((await call('/api/characters/'+peter.id+'/integrity',{})).results[0].status,'changed');
    assert.equal((await request('/api/characters/'+peter.id+'/canon',{appearance:'New draft',references:[{media_id:image.id,role:'body'}]})).status,400);
    await fs.writeFile(mediaFile,bytes);
    await call('/api/media/'+image.id+'/review',{character_id:peter.id,decision:'rejected',rating:2,notes:'Eyes are incorrect'});
    await call('/api/characters/'+peter.id,{...peter,name:'Pákozdi Péter',appearance:'Draft with different clothing'},'PUT');
    const profile=await call('/api/characters/'+peter.id);assert.equal(profile.canon.id,initial.id);assert.equal(profile.canon.appearance,'User-approved physique');assert.equal((await call('/api/media?character='+peter.id)).total,1);
    assert.equal((await request('/api/media/'+image.id,{character_ids:[attila.id]},'PUT')).status,400);
    const next=await call('/api/characters/'+peter.id+'/canon',{appearance:initial.appearance,references:[],reason:'Remove reference explicitly'});assert.equal(next.parent_id,initial.id);
    await call('/api/relationships',{source_id:peter.id,target_id:attila.id,description:'Friends'});
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon WHERE character_id=?').get(peter.id).n,2);assert.equal((await call('/api/characters/'+peter.id)).history.length,1); // UI history lists appearance changes only.
    const cleaned=(await call('/api/characters/'+peter.id)).history;assert.ok(cleaned.every(r=>!JSON.parse(r.references_json).some(ref=>ref.media_id===image.id)));assert.equal(cleaned.find(r=>r.id===initial.id).reason,'Reference data removed by creator');
    const range=await fetch(base+'/media/'+video.id,{headers:{Range:'bytes=3-7'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,5);
    assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://example.com'}})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(badHost,403);
    const backup=await call('/api/export');assert.equal(backup.schema_version,1);
    await app.close();base=await start(dataDir);assert.equal((await call('/api/characters/'+peter.id)).canon.id,next.id);
    await fs.rename(mediaFile,mediaFile+'.missing');assert.equal((await fetch(base+'/media/'+image.id)).status,404);await fs.rename(mediaFile+'.missing',mediaFile);
    await app.close();base=await start(path.join(temp,'restored'));await call('/api/restore',backup);
    assert.equal((await call('/api/characters/'+peter.id)).relationships[0].description,'Friends');assert.equal((await call('/api/media/'+image.id)).reviews[0].notes,'Eyes are incorrect');assert.equal((await fetch(base+'/media/'+image.id)).status,200);
    assert.equal((await request('/api/restore',backup)).status,400);
    assert.deepEqual(await fs.readFile(mediaFile),bytes);
    await app.close();base=await start(path.join(temp,'invalid-restore'));
    const invalid=structuredClone(backup);invalid.media[0].relative_path='../../outside.png';assert.equal((await request('/api/restore',invalid)).status,400);assert.equal((await call('/api/state')).characters.length,0);
  }finally{if(app)await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});

test('one-click folder sorting reuses characters, preserves shared assignments, and survives rename/restore',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));
  const root=path.join(temp,'resources');await fs.mkdir(root);
  for(const folder of ['Attila','Dezső']){await fs.mkdir(path.join(root,folder));await fs.writeFile(path.join(root,folder,'portrait.png'),'fixture');await fs.writeFile(path.join(root,folder,'scene.mp4'),'fixture');}
  let app;let base;
  async function start(dataDir){app=await createApp({root,dataDir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function call(route,data,method){if(['/api/assign-folder','/api/sort-folders'].includes(route))return confirmFolders(call,route,data);const r=await fetch(base+route,{method:method||(data?'POST':'GET'),headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
  await start(path.join(temp,'data'));
  try{
    await call('/api/scan',{});const attila=await call('/api/characters',{name:'Attila'});
    const one=(await call('/api/media?folder=Attila')).items[0];const other=await call('/api/characters',{name:'Other character'});
    await call('/api/media/'+one.id,{character_ids:[other.id]},'PUT');
    const result=await call('/api/sort-folders',{folders:['Attila','Dezső']});assert.equal(result.results[0].character_id,attila.id);assert.equal(result.results.reduce((s,r)=>s+r.added,0),4);
    assert.equal((await call('/api/media/'+one.id)).characters.length,2);assert.equal((await call('/api/state')).stats.inbox,4);assert.equal((await call('/api/characters/'+attila.id)).canon,null);
    assert.equal((await call('/api/sort-folders',{folders:['Attila','Dezső']})).results.reduce((s,r)=>s+r.added,0),0);
    await call('/api/characters/'+attila.id,{...attila,name:'Attila renamed'},'PUT');await fs.writeFile(path.join(root,'Attila renamed','new.png'),'new fixture');await call('/api/scan',{});
    const repeated=await call('/api/sort-folders',{folders:['Attila renamed']});assert.equal(repeated.results[0].character_id,attila.id);assert.equal(repeated.results[0].added,1);assert.equal((await call('/api/state')).characters.length,3);
    const backup=await call('/api/export');await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/sort-folders',{folders:['Attila renamed']})).results[0].character_id,attila.id);
    const bad=await fetch(base+'/api/sort-folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folders:['Dezső','not a folder']})});assert.equal(bad.status,409);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});

test('physical moves preserve shared identities and bytes, refuse overwrites, and export their history',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const root=path.join(temp,'resources');await fs.mkdir(root);
  const original=Buffer.from('original image bytes');await fs.writeFile(path.join(root,'shared.png'),original);
  const app=await createApp({root,dataDir:path.join(temp,'data')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  async function request(route,data,method){const r=await fetch(base+route,{method:method||(data?'POST':'GET'),headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:r.status,value:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.value;}
  try{
    await call('/api/scan',{});const m=(await call('/api/media')).items[0];const a=await call('/api/characters',{name:'Attila'});const d=await call('/api/characters',{name:'Dezső'});
    await call('/api/media/'+m.id,{character_ids:[a.id,d.id],notes:'Shared scene',tags:'body'},'PUT');
    const canon=await call('/api/characters/'+a.id+'/canon',{appearance:'Approved body',references:[{media_id:m.id,role:'body'}]});
    const preview=await call('/api/media/'+m.id+'/move/preview',{folder:'Attila'});assert.equal(preview.to,path.join('Attila','shared.png'));assert.deepEqual(await fs.readFile(path.join(root,'shared.png')),original);assert.equal(await fs.stat(path.join(root,'Attila')).then(()=>true,()=>false),false);
    assert.equal((await request('/api/media/'+m.id+'/move',{folder:'Attila',from_path:'stale.png'})).status,409);
    assert.equal((await request('/api/media/'+m.id+'/move/preview',{folder:'../outside'})).status,400);
    await call('/api/media/'+m.id+'/move',{folder:'Attila',from_path:preview.from});
    assert.equal(await fs.stat(path.join(root,'shared.png')).then(()=>true,()=>false),false);assert.deepEqual(await fs.readFile(path.join(root,'Attila','shared.png')),original);
    const updated=await call('/api/media/'+m.id);assert.equal(updated.id,m.id);assert.equal(updated.characters.length,2);assert.equal(updated.notes,'Shared scene');assert.equal(updated.moves[0].status,'complete');assert.equal((await call('/api/characters/'+a.id)).canon.id,canon.id);assert.equal((await call('/api/characters/'+a.id+'/integrity',{})).results[0].status,'unchanged');
    assert.equal((await call('/api/scan',{})).added,0);assert.equal((await call('/api/state')).stats.media,1);
    await fs.mkdir(path.join(root,'Dezső'));await fs.writeFile(path.join(root,'Dezső','shared.png'),'other file');
    assert.equal((await request('/api/media/'+m.id+'/move',{folder:'Dezső',from_path:updated.relative_path})).status,409);assert.deepEqual(await fs.readFile(path.join(root,'Attila','shared.png')),original);assert.equal(await fs.readFile(path.join(root,'Dezső','shared.png'),'utf8'),'other file');
    const backup=await call('/api/export');assert.equal(backup.file_moves[0].status,'complete');
    const restored=await createApp({root,dataDir:path.join(temp,'restore')});await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));try{const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});assert.equal(response.status,200);assert.equal(restored.db.prepare('SELECT to_path FROM file_moves').get().to_path,path.join('Attila','shared.png'));}finally{await restored.close();}
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
