import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
// Legacy marker fixture; origin is now declared by collection membership, not these bytes.
const generatedPng=(()=>{const td=Buffer.concat([Buffer.from('tEXt'),Buffer.from('c2pa\0jumb\0trainedAlgorithmicMedia','latin1')]),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(td.length-4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([png.subarray(0,png.length-12),len,td,crc,png.subarray(png.length-12)]);})();
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('character figures: folder per cast member, picked up, served, kept out of the catalogue, moods in talks',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sprites-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);return {reply:'Szia!',mood:'mosoly'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),a=await mk('Teszt Aladár'),other=await mk('Teszt Béla');
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Hétköznap munka.')},history:[],proposals:[]}));
  const work=(await call('/api/locations',{name:'Kórház',kind:'tag'})).data;
  await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-work',name:'Kórház',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));

  // Folders for the cast (Aladár + Palor), not for characters without a Szellemprofil.
  let scan=(await call('/api/sprites/scan',{})).data;
  assert.equal(scan.folders_created,2);
  const folder=path.join(root,'Szereplő-alakok','Teszt Aladár');
  assert.ok((await fs.stat(folder)).isDirectory());
  await assert.rejects(fs.stat(path.join(root,'Szereplő-alakok','Teszt Béla')));
  await fs.writeFile(path.join(folder,'alap.png'),png);await fs.writeFile(path.join(folder,'Mosoly.png'),png);await fs.writeFile(path.join(folder,'leiras.txt'),'x');
  scan=(await call('/api/sprites/scan',{})).data;assert.equal(scan.added,2);
  assert.equal((await call('/api/sprites/scan',{})).data.added,0,'unchanged files are not re-read');

  // The catalogue scan skips the figures folder entirely.
  await call('/api/scan',{});
  assert.equal(app.db.prepare("SELECT count(*) n FROM media WHERE relative_path LIKE '%Szereplő-alakok%'").get().n,0);

  const place=(await call('/api/play/travel',{node_id:'n-work'})).data;
  const figures=place.people.find(p=>p.id===a.id).sprites;
  assert.deepEqual(figures.map(s=>s.expression),['alap','mosoly'],'base pose first');
  const served=await call('/api/sprites/'+figures[0].id);assert.equal(served.status,200);assert.deepEqual(served.data,png);
  assert.equal((await call('/api/sprites/00000000-0000-4000-8000-000000000000')).status,404);

  // The reply may choose one of the saved expressions.
  const talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;
  assert.equal(talk.mood,'mosoly');assert.ok(requests.at(-1).system.includes('"mood":"alap|mosoly"'));
  // Consistent figure prompt: from approved data only, green screen, one outfit for all.
  // No approved collection reference yet: text only, no reference input.
  let prompt=(await call('/api/sprites/prompt/'+a.id)).data;
  assert.equal(prompt.reference_policy,'text_only');assert.match(prompt.base,/do not use or imitate a photograph/);
  // Approve an assigned collection image; legacy metadata is irrelevant to eligibility.
  await fs.mkdir(path.join(root,'Refs'),{recursive:true});await fs.writeFile(path.join(root,'Refs','gen.png'),generatedPng);await call('/api/scan',{});
  const ref=app.db.prepare('SELECT id FROM media WHERE relative_path=?').get(path.join('Refs','gen.png'));
  app.db.prepare('INSERT OR IGNORE INTO depictions VALUES(?,?)').run(ref.id,a.id);
  app.db.prepare('INSERT INTO canon(id,character_id,parent_id,appearance,references_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),a.id,null,'',JSON.stringify([{media_id:ref.id,role:'face'}]),'teszt',new Date().toISOString());
  prompt=(await call('/api/sprites/prompt/'+a.id)).data;assert.equal(prompt.reference_count,1);
  assert.match(prompt.base,/chroma-key green/);assert.match(prompt.base,/match the attached approved reference photos of Teszt Aladár/);
  assert.match(prompt.variants,/mosoly\.png/);assert.deepEqual(prompt.existing,['alap','mosoly']);
  // Removing a file hides the figure; nothing else changes.
  await fs.unlink(path.join(folder,'Mosoly.png'));
  assert.equal((await call('/api/sprites/scan',{})).data.missing,1);
  assert.deepEqual((await call('/api/play/place/n-work')).data.people[0].sprites.map(s=>s.expression),['alap']);
  assert.equal(other.name,'Teszt Béla');assert.ok(palor.id);

  // Shirtless set: same names in a "felmeztelen" subfolder. Kept apart from the dressed figures
  // (never offered as a mood), sent separately so the play screen can switch at undressing.
  await fs.mkdir(path.join(folder,'felmeztelen'));
  await fs.writeFile(path.join(folder,'felmeztelen','alap.png'),png);await fs.writeFile(path.join(folder,'felmeztelen','mosoly-2.png'),png);
  // Waist-up intimate set (2026-11-12): the "intim" subfolder, sent as its own list.
  await fs.mkdir(path.join(folder,'intim'));await fs.writeFile(path.join(folder,'intim','alap.png'),png);
  assert.equal((await call('/api/sprites/scan',{})).data.added,3);
  assert.equal((await call('/api/play/place/n-work')).data.people[0].height_cm,null,'no recorded height: the stage uses an average');
  app.db.prepare("UPDATE characters SET appearance='Magas, kb. 178–183 cm, sportos.' WHERE id=?").run(a.id);
  const person=(await call('/api/play/place/n-work')).data.people[0];
  assert.equal(person.height_cm,181,'a height range counts as its middle');
  assert.deepEqual(person.sprites.map(s=>s.expression),['alap'],'dressed list unchanged');
  assert.deepEqual(person.sprites_shirtless.map(s=>s.expression),['alap','mosoly']);
  assert.ok(person.sprites_shirtless.every(s=>s.outfit==='shirtless'));
  assert.deepEqual(person.sprites_intimate.map(s=>[s.expression,s.outfit]),[['alap','intimate']]);
  const again=(await call('/api/play/talk',{conversation_id:talk.id,text:'Hogy vagy?'})).data;
  assert.ok(!requests.at(-1).system.includes('"mood"'),'shirtless files never become moods (one dressed figure: no mood choice)');
  assert.deepEqual(again.character.sprites_shirtless.map(s=>s.expression),['alap','mosoly']);
});
