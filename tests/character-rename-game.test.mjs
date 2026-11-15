import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';

function png(r,g,b){
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,r,g,b,r,g,b,0,r,g,b,r,g,b]))),chunk('IEND',Buffer.alloc(0))]);
}

test('character rename is final: game text, folders, file names, location tree and all history follow; no undo',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rename-game-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args)=>call('/api/mcp-rename',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const db=app.db,now=new Date().toISOString(),day='2026-11-10';
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),bence=await mk('Bence'),denes=await mk('Dénes');

  // Game text about him: his own rows and other people's rows that mention him.
  const ev=randomUUID();
  db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(ev,day,'meeting','applied','Bence és Dénes edzett','Bence ma sokat nevetett.',JSON.stringify({character_ids:[bence.id,denes.id],memories:[{character_id:denes.id,text:'Bence jól edzett.'}],level_changes:[{source_id:denes.id,target_id:bence.id,delta:1,reason:'Bence segített.'}]}),'test',now);
  const mem=randomUUID();
  db.prepare('INSERT INTO character_memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(mem,denes.id,1,'memory','Bence ma mérges volt.',null,'participants','approved','accurate','teszt',now,now);
  db.prepare('INSERT INTO character_memory_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),mem,1,'memory','Bence ma mérges volt.',null,'participants','approved','accurate','teszt','world_engine',now);
  db.prepare('INSERT INTO world_messages(id,from_character_id,text,world_day,event_id,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),bence.id,'Szia, itt Bence.',day,ev,now);
  const conv=randomUUID();
  db.prepare("INSERT INTO play_conversations(id,character_id,location_id,channel,world_day,slot,status,summary_json,created_at) VALUES(?,?,NULL,'phone',?,'délután','closed',?,?)").run(conv,bence.id,day,JSON.stringify({title:'Bence hív',summary:'Palor és Bence beszélt.'}),now);
  db.prepare('INSERT INTO play_lines(id,conversation_id,speaker,text,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),conv,'palor','Szia Bence!',now);
  db.prepare('INSERT INTO world_level_revisions VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),denes.id,bence.id,2,1,'Bence segített.','world_engine',ev,now);

  // History that used to be kept: earlier canon versions, a generation manifest, the move journal,
  // Szellemprofil history.
  const canonOld=randomUUID();
  db.prepare('INSERT INTO canon(id,character_id,parent_id,appearance,references_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(canonOld,bence.id,null,'Bence magas, szakállas.','[]','Bence első leírása.',now);
  db.prepare('INSERT INTO canon(id,character_id,parent_id,appearance,references_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),bence.id,canonOld,'Bence magas.','[]','Rövidebb.',now);
  const genRun=randomUUID(),manifest=JSON.stringify({prompt:'Bence portré',character:'Bence'});
  db.prepare('INSERT INTO image_generation_runs VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL)').run(genRun,'gen-key-1','x',manifest,(await import('node:crypto')).createHash('sha256').update(manifest).digest('hex'),'expired',now,now);
  const entry=v=>({value:v,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
  db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+bence.id,JSON.stringify({version:2,values:{goals:entry('Bence célja.'),weekly_routine:entry('Rutin.')},history:[{version:1,values:{goals:entry('Bence régi célja.')},actor:'teszt',at:now}],proposals:[]}));

  // A place named after him, in the catalogue and in the location tree (with a room).
  const house=(await call('/api/locations',{name:'Bence háza',kind:'tag'})).data;
  await call('/api/world-engine/places',{character_id:bence.id,location_id:house.id,role:'home'});
  const tn=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
  const canvasFile=path.join(dataDir,'location-canvas.json');
  const hashState=async s=>{const {normalizeCanvas}=await import('../app/public/location-canvas-model.js');const {createHash}=await import('node:crypto');return createHash('sha256').update(JSON.stringify(normalizeCanvas(s))).digest('hex');};
  const state={schema:1,types:[],nodes:[{...tn('world:living-universe','Living Universe',null,null),kind:'world'},tn(house.id,'Bence háza','world:living-universe',house.id),tn('draft:'+randomUUID(),'Bence háza - nappali',house.id,null)]};
  await fs.writeFile(canvasFile,JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',actor:'local-creator',reason:'teszt',created_at:now,catalogue_version:'0'.repeat(64),state_hash:await hashState(state),request_key:randomUUID(),request_hash:'x',state}]}));

  // Game folders keyed by his name: figure, shared scene (file named after his place), backdrop.
  await fs.mkdir(path.join(root,'Szereplő-alakok','Bence'),{recursive:true});await fs.writeFile(path.join(root,'Szereplő-alakok','Bence','alap.png'),png(1,2,3));
  await fs.mkdir(path.join(root,'Közös jelenetek','Bence'),{recursive:true});await fs.writeFile(path.join(root,'Közös jelenetek','Bence','Bence háza - 1.png'),png(4,5,6));
  await fs.mkdir(path.join(root,'Helyszín hátterek','Bence háza'),{recursive:true});await fs.writeFile(path.join(root,'Helyszín hátterek','Bence háza','nappal.png'),png(7,8,9));
  await call('/api/sprites/scan',{});await call('/api/play/scenes/scan',{});await call('/api/backgrounds/scan',{});
  const sceneMedia=db.prepare("SELECT id FROM media WHERE relative_path=?").get(path.join('Közös jelenetek','Bence','Bence háza - 1.png'));
  const bgMedia=db.prepare("SELECT id FROM media WHERE relative_path=?").get(path.join('Helyszín hátterek','Bence háza','nappal.png'));
  assert.ok(sceneMedia&&bgMedia,'pictures registered');
  const oldMove=randomUUID();
  db.prepare('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)').run(oldMove,sceneMedia.id,path.join('Régi','Bence','a.png'),path.join('Új','Bence','a.png'),'moved',null,now);

  // Rename (trusted MCP path applies at once).
  const r=(await mcp('prepare',{request_key:'rename-bence-1',character_id:bence.id,new_name:'Botond'})).data;
  assert.equal(r.status,'applied',JSON.stringify({warning:r.warning,unsure:r.items.filter(i=>i.editable&&['uncertain','other_person'].includes(i.classification)).map(i=>[i.table,i.field,i.reason])}));
  const one=(sql,...a)=>db.prepare(sql).get(...a);
  assert.equal(one('SELECT name FROM characters WHERE id=?',bence.id).name,'Botond');
  const e=one('SELECT title,summary,payload_json FROM world_events WHERE id=?',ev);
  assert.equal(e.title,'Botond és Dénes edzett');assert.equal(e.summary,'Botond ma sokat nevetett.');
  const payload=JSON.parse(e.payload_json);assert.equal(payload.memories[0].text,'Botond jól edzett.');assert.equal(payload.level_changes[0].reason,'Botond segített.');
  assert.equal(one('SELECT text FROM character_memories WHERE id=?',mem).text,'Botond ma mérges volt.','another character’s memory');
  assert.equal(one('SELECT text FROM character_memory_revisions WHERE memory_id=?',mem).text,'Botond ma mérges volt.','memory log');
  assert.equal(one('SELECT text FROM world_messages WHERE from_character_id=?',bence.id).text,'Szia, itt Botond.');
  assert.equal(one('SELECT text FROM play_lines WHERE conversation_id=?',conv).text,'Szia Botond!');
  assert.equal(JSON.parse(one('SELECT summary_json FROM play_conversations WHERE id=?',conv).summary_json).summary,'Palor és Botond beszélt.');
  assert.equal(one('SELECT reason FROM world_level_revisions WHERE event_id=?',ev).reason,'Botond segített.','level log');
  assert.equal(one('SELECT name FROM locations WHERE id=?',house.id).name,'Botond háza');
  // Folders and file names followed, with catalogue paths and figure records.
  await assert.rejects(fs.stat(path.join(root,'Szereplő-alakok','Bence')));
  assert.ok((await fs.stat(path.join(root,'Szereplő-alakok','Botond','alap.png'))).isFile());
  assert.equal(one('SELECT relative_path FROM character_sprites WHERE character_id=?',bence.id).relative_path,path.join('Szereplő-alakok','Botond','alap.png'));
  assert.equal(one('SELECT relative_path FROM media WHERE id=?',sceneMedia.id).relative_path,path.join('Közös jelenetek','Botond','Botond háza - 1.png'));
  assert.equal(one('SELECT relative_path FROM media WHERE id=?',bgMedia.id).relative_path,path.join('Helyszín hátterek','Botond háza','nappal.png'));
  assert.ok(one("SELECT 1 FROM file_moves WHERE media_id=? AND status='character_renamed'",sceneMedia.id),'move journal kept');
  // Location tree: a new approved revision with the place names updated.
  let canvas=JSON.parse(await fs.readFile(canvasFile,'utf8'));
  let nodes=canvas.revisions.find(x=>x.id===canvas.approved_head).state.nodes.filter(n=>n.kind==='place');
  assert.deepEqual(nodes.map(n=>n.name).sort(),['Botond háza','Botond háza - nappali']);
  // The Play tree reads the new names.
  assert.ok((await call('/api/play')).data.nodes.some(n=>n.short_name==='Botond háza'));

  // Final: no undo, and the old name is gone from every record, history included.
  const u=await mcp('undo',{plan_id:r.plan_id,request_key:'undo-bence-1'});
  assert.equal(u.status,409);assert.equal(u.data.code,'IRREVERSIBLE');
  assert.ok(!/bence/i.test(one('SELECT aliases FROM characters WHERE id=?',bence.id).aliases),'old name not kept as alias');
  assert.equal(one('SELECT appearance FROM canon WHERE id=?',canonOld).appearance,'Botond magas, szakállas.','earlier canon version');
  assert.equal(one('SELECT reason FROM canon WHERE id=?',canonOld).reason,'Botond első leírása.');
  const run=one('SELECT manifest_json,manifest_hash FROM image_generation_runs WHERE id=?',genRun);
  assert.match(run.manifest_json,/Botond/);assert.equal(run.manifest_hash,(await import('node:crypto')).createHash('sha256').update(run.manifest_json).digest('hex'),'manifest hash recomputed');
  assert.match(one('SELECT from_path FROM file_moves WHERE id=?',oldMove).from_path,/Botond/,'move journal');
  assert.match(JSON.stringify(JSON.parse(one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+bence.id).value).history),/Botond/,'profile history');
  assert.ok(!app.db.prepare("SELECT 1 FROM application_settings WHERE key LIKE 'rename:v1:%' AND (key LIKE ? OR value LIKE ?)").get('%'+r.plan_id+'%','%'+r.plan_id+'%'),'rename records deleted');
  const left=[];
  for(const {name} of app.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())
    for(const row of app.db.prepare(`SELECT * FROM "${name}"`).all())if(/Bence/.test(JSON.stringify(row)))left.push(name);
  assert.deepEqual([...new Set(left)],[],'no table still holds the old name');
  canvas=JSON.parse(await fs.readFile(canvasFile,'utf8'));assert.ok(!/Bence/.test(JSON.stringify(canvas)),'every tree revision');
  assert.ok(!/Bence/.test(await fs.readFile(path.join(dataDir,'location-canvas.previous.json'),'utf8')),'tree backup copy');
  // The rewritten tree still passes its own integrity checks (Play reads it).
  assert.ok((await call('/api/play')).data.nodes.some(n=>n.short_name==='Botond háza'));
});

test('rename reaches every file and folder name, canon and approved events; bytes, IDs and links stay',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rename-all-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args)=>call('/api/mcp-rename',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const db=app.db,now=new Date().toISOString(),one=(sql,...a)=>db.prepare(sql).get(...a);
  const bence=(await call('/api/characters',{name:'Bence',gender:'férfi'})).data,denes=(await call('/api/characters',{name:'Dénes',gender:'férfi'})).data;

  // Files: his own folder (file + subfolder named after him), the shared library, a removed item,
  // and a file that only mentions someone else (must not move).
  const files={own:['Bence','Bence 1.png'],sub:['Bence','Bence nyaral','strand.png'],shared:['Közös','Bence és Dénes','Bence a parton.png'],removed:['.living-universe-trash','r1','Bence régi.png'],other:['Közös','Dénes.png']};
  const media={};let n=10;
  for(const [k,parts] of Object.entries(files)){
    const rel=path.join(...parts),bytes=png(n++,2,3);await fs.mkdir(path.join(root,path.dirname(rel)),{recursive:true});await fs.writeFile(path.join(root,rel),bytes);
    const id=randomUUID();db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(id,rel,path.dirname(rel),'image',bytes.length,now,now);db.prepare('INSERT INTO depictions VALUES(?,?)').run(id,k==='other'?denes.id:bence.id);
    media[k]={id,rel,bytes};
  }
  db.prepare('INSERT INTO media_hidden VALUES(?,?,?,?)').run(media.removed.id,path.join('Közös','Bence régi.png'),1,now);
  // Canon with a reference (by media ID) and an approved story event.
  const canonId=randomUUID();
  db.prepare('INSERT INTO canon(id,character_id,parent_id,appearance,references_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(canonId,bence.id,null,'Bence magas.',JSON.stringify([{media_id:media.own.id,role:'face',note:'Bence arca'}]),'Bence jóváhagyott képe.',now);
  const ev=randomUUID();
  db.prepare('INSERT INTO story_events VALUES(?,?,?,?,?,?)').run(ev,1,'ev-key-1','x',null,now);
  db.prepare('INSERT INTO story_event_revisions VALUES(?,?,?,?,?,?,?)').run(ev,1,'approved',JSON.stringify({title:'Bence edzése',summary:'Bence futott.',participants:[{character_id:bence.id,role:'főszereplő'}]}),'teszt','teszt',now);
  db.prepare('INSERT INTO story_event_participants VALUES(?,?,?,?)').run(ev,bence.id,'főszereplő',1);

  const r=(await mcp('prepare',{request_key:'rename-all-1',character_id:bence.id,new_name:'Botond'})).data;
  assert.equal(r.status,'applied',JSON.stringify(r).slice(0,800));

  const expect={own:['Botond','Botond 1.png'],sub:['Botond','Botond nyaral','strand.png'],shared:['Közös','Botond és Dénes','Botond a parton.png'],removed:['.living-universe-trash','r1','Botond régi.png'],other:['Közös','Dénes.png']};
  for(const [k,parts] of Object.entries(expect)){
    const rel=path.join(...parts);
    assert.equal(one('SELECT relative_path FROM media WHERE id=?',media[k].id).relative_path,rel,k+' catalogue path');
    assert.deepEqual(await fs.readFile(path.join(root,rel)),media[k].bytes,k+' bytes unchanged at new name');
  }
  await assert.rejects(fs.stat(path.join(root,'Bence')));await assert.rejects(fs.stat(path.join(root,'Közös','Bence és Dénes')));
  assert.equal(one('SELECT original_path FROM media_hidden WHERE media_id=?',media.removed.id).original_path,path.join('Közös','Botond régi.png'),'restore target follows');
  // Canon rewritten in place, reference link kept.
  const c=one('SELECT * FROM canon WHERE id=?',canonId);
  assert.equal(c.appearance,'Botond magas.');assert.equal(c.reason,'Botond jóváhagyott képe.');
  const ref=JSON.parse(c.references_json)[0];assert.equal(ref.media_id,media.own.id);assert.equal(ref.note,'Botond arca');
  // Approved event stays approved.
  const head=one('SELECT version FROM story_events WHERE id=?',ev).version;
  const rev=one('SELECT status,payload_json FROM story_event_revisions WHERE event_id=? AND version=?',ev,head);
  assert.equal(rev.status,'approved');assert.equal(JSON.parse(rev.payload_json).title,'Botond edzése');
  // Nothing in the database still holds the old name; every catalogued file exists.
  const left=[];
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())
    for(const row of db.prepare(`SELECT * FROM "${name}"`).all())if(/Bence/.test(JSON.stringify(row)))left.push(name);
  assert.deepEqual([...new Set(left)],[],'no table still holds the old name');
  for(const m of db.prepare('SELECT relative_path FROM media').all())assert.ok((await fs.stat(path.join(root,m.relative_path))).isFile(),m.relative_path);
});

test('rename text leaves other characters whose names contain the old name',async()=>{
  const {renameText}=await import('../app/rename-play-extras.mjs');
  assert.equal(renameText('Kis Bence és Bence beszélt, Bencével is.','Bence','Botond',['Kis Bence']),'Kis Bence és Botond beszélt, Botonddal is.');
  assert.equal(renameText('Kis Bencének írt Bence.','Bence','Botond',['Kis Bence']),'Kis Bencének írt Botond.');
});
