import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {readName} from '../app/new-images.mjs';

const chars=[{id:'p',name:'Palor'},{id:'a',name:'Attila'},{id:'b',name:'Béla'},{id:'x1',name:'Zoli'},{id:'x2',name:'zoli'},{id:'d',name:'Dávid - ikea mellizmos srác'},{id:'g1',name:'Gábor - rendőr'},{id:'g2',name:'Gábor - pék'}];
const places=[{id:'k',names:['Kávézó','Budapest - Kávézó']}];
const read=(file,folders=[])=>readName({file,folders,characters:chars,places});

test('file names: people, place and content are read; typos are reported, not guessed',()=>{
  const one=read('Attila - Kavezo - hetkoznapi - 1.png');
  assert.deepEqual(one.people.map(p=>p.id),['a']);assert.equal(one.location_id,'k');assert.equal(one.content,'non_intimate');assert.equal(one.problem,null);
  assert.deepEqual(read('Palor + Béla - szex.png').people.map(p=>p.id),['p','b'],'accents and "+"');
  assert.deepEqual(read('BELA & attila - 3 (2).png').people.map(p=>p.id),['b','a'],'case, "&", copy suffix');
  assert.deepEqual(read('valami.png',['Attila + Béla']).people.map(p=>p.id),['a','b'],'sub-folder gives the people');
  const nested=read('ChatGPT Image 12.png',['Attila','hetkoznapi']);assert.deepEqual([nested.people[0].id,nested.content],['a','non_intimate'],'folder levels: people, then content');
  assert.equal(read('Atila + Béla - 1.png').problem.code,'unknown','a typo inside a people list');
  assert.deepEqual(read('Atila + Béla - 1.png').problem.names,['Atila']);
  assert.equal(read('ChatGPT Image Nov 12.png').problem.code,'no_people');
  assert.equal(read('Zoli - 1.png').problem.code,'ambiguous','two characters share the name');
  const long=read('Palor + Dávid - ikea mellizmos srác - Kávézó - 1.png');
  assert.deepEqual(long.people.map(p=>p.id),['p','d'],'a full name containing " - "');assert.equal(long.location_id,'k');
  assert.deepEqual(read('Dávid - meztelen.png').people.map(p=>p.id),['d'],'short form of a long name');
  assert.equal(read('Attila - felmeztelen - 1.png').content,'shirtless','félmeztelen is its own level');
  assert.equal(read('Attila - Félmeztelen - 1.png').content,'shirtless','accents and case do not matter');
  assert.equal(read('Attila - meztelen - 1.png').content,'nudity');
  assert.equal(read('kep.png',['Attila','felmeztelen']).content,'shirtless','a félmeztelen folder marks its pictures');
  assert.equal(read('Gábor - 1.png').problem.code,'ambiguous','a short form two characters share is reported, not guessed');
  assert.deepEqual(read('Gábor - rendőr - 1.png').people.map(p=>p.id),['g1']);
});

test('Új képek: one click links people and moves files by the placement rule, never overwrites',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-new-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
  const inbox=path.join(root,'20_SHARED_MEDIA','Új képek');
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const a=(await call('/api/characters',{name:'Attila'})).data,b=(await call('/api/characters',{name:'Béla'})).data,p=(await call('/api/characters',{name:'Palor'})).data;
    assert.equal((await call('/api/new-images')).data.count,0,'the folder is created empty');
    await fs.writeFile(path.join(inbox,'Attila - 1.png'),'one');
    await fs.writeFile(path.join(inbox,'Palor + Attila - 2.png'),'withpalor');
    await fs.mkdir(path.join(inbox,'Attila + Béla'));await fs.writeFile(path.join(inbox,'Attila + Béla','x.png'),'pair');
    await fs.writeFile(path.join(inbox,'Ismeretlen - 1.png'),'nobody');
    // A file already sits at the first destination: the new one gets "(2)", nothing is overwritten.
    await fs.mkdir(path.join(root,'10_CHARACTERS','Attila'),{recursive:true});await fs.writeFile(path.join(root,'10_CHARACTERS','Attila','Attila - 1.png'),'old');
    const plan=(await call('/api/new-images')).data;
    assert.equal(plan.count,4);assert.equal(plan.ready,3);
    const done=(await call('/api/new-images/apply',{})).data;
    assert.equal(done.moved,3);assert.deepEqual(done.skipped.map(s=>s.reason),['no_people']);
    assert.equal(await fs.readFile(path.join(root,'10_CHARACTERS','Attila','Attila - 1.png'),'utf8'),'old');
    assert.equal(await fs.readFile(path.join(root,'10_CHARACTERS','Attila','Attila - 1 (2).png'),'utf8'),'one');
    assert.equal(await fs.readFile(path.join(root,'10_CHARACTERS','Attila','Palor + Attila - 2.png'),'utf8'),'withpalor','Palor is not counted');
    assert.equal(await fs.readFile(path.join(root,'20_SHARED_MEDIA','Scenes','Attila + Béla','x.png'),'utf8'),'pair');
    assert.equal(await fs.readFile(path.join(inbox,'Ismeretlen - 1.png'),'utf8'),'nobody','unreadable names stay');
    await assert.rejects(fs.stat(path.join(inbox,'Attila + Béla')),'emptied sub-folder removed');
    const links=id=>app.db.prepare('SELECT d.character_id FROM depictions d JOIN media m ON m.id=d.media_id WHERE m.relative_path=? ORDER BY d.character_id').all(id).map(r=>r.character_id);
    assert.deepEqual(links(path.join('10_CHARACTERS','Attila','Palor + Attila - 2.png')),[a.id,p.id].sort());
    assert.deepEqual(links(path.join('20_SHARED_MEDIA','Scenes','Attila + Béla','x.png')),[a.id,b.id].sort());
    assert.equal(app.db.prepare("SELECT count(*) n FROM file_moves WHERE status='complete'").get().n,3);
    assert.equal((await call('/api/new-images')).data.count,1);
  }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});

test('ChatGPT "picture" target: saved into Új képek under a readable name, then sorted by the intake',async t=>{
  const zlib=await import('node:zlib'),{randomBytes}=await import('node:crypto'),{databaseIdentity}=await import('../app/character-edit.mjs');
  const png=()=>{const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc]);};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,9,9,9,9,9,9,0,9,9,9,9,9,9]))),chunk('IEND',Buffer.alloc(0))]);};
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-pic-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.mkdir(dataDir);await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const assetDownload=async()=>({stream:(async function*(){yield png();})()});
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,assetDownload});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args)=>call('/api/mcp-backgrounds',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const palor=(await call('/api/characters',{name:'Palor'})).data,norbi=(await call('/api/characters',{name:'Norbi'})).data,peter=(await call('/api/characters',{name:'Péter'})).data;
  const image={download_url:'https://files.example/x.png',file_id:'f1'};
  const one=(await mcp('place_asset',{image,target:'picture',character_ids:[norbi.id,palor.id]})).data;
  assert.equal(one.file,'Palor + Norbi - hetkoznapi - '+new Date().toISOString().slice(0,10)+'-1.png','Palor first, everyday by default');
  assert.equal((await mcp('place_asset',{image,target:'picture',character_ids:[norbi.id,peter.id]})).status,200);
  const labelled=(await mcp('place_asset',{image,target:'picture',character_ids:[norbi.id,peter.id],label:'strand'})).data;
  assert.match(labelled.file,/^Norbi \+ Péter - strand - hetkoznapi - /,'label goes into the name');
  for(const label of ['Norbi','szex','felmeztelen','bad/label'])assert.equal((await mcp('place_asset',{image,target:'picture',character_ids:[norbi.id],label})).status,400,'label "'+label+'" refused');
  assert.equal((await mcp('place_asset',{image,target:'picture',character_ids:[norbi.id],content:'nudity'})).status,403,'no collection media: everyday only');
  assert.equal((await mcp('place_asset',{image,target:'picture',character_ids:[]})).status,400);
  const plan=(await call('/api/new-images')).data;assert.equal(plan.ready,3);
  const done=(await call('/api/new-images/apply',{})).data;assert.equal(done.moved,3);
  const files=await fs.readdir(path.join(root,'10_CHARACTERS','Norbi'));assert.ok(files.some(f=>f.startsWith('Palor + Norbi')),'Palor + Norbi → Norbi');
  assert.equal((await fs.readdir(path.join(root,'20_SHARED_MEDIA','Scenes','Norbi + Péter'))).length,2);
  assert.equal(app.db.prepare("SELECT count(*) n FROM play_inserts WHERE kind='scene' AND source='Új képek' AND character_id=?").get(norbi.id).n,1,'counts as a shared scene');
  assert.equal(app.db.prepare("SELECT level FROM play_content").all().every(r=>r.level==='non_intimate'),true);
});
