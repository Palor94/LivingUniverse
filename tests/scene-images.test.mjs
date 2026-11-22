import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('shared scene pictures: folder, upload, content marks, prompts and the insert log',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-scenes-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),a=await mk('Teszt Aladár');
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Cél.')},history:[],proposals:[]}));
  const flat=(await call('/api/locations',{name:'Aladár lakása',kind:'tag'})).data;
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n',name:'Aladár lakása',parent_id:null,kind:'place',source_id:flat.id,placed:true,archived:false,order:0}]}}]}));

  // Folder route: the scan creates his folder; a file named after the place is linked to it.
  assert.equal((await call('/api/play/scenes/scan',{})).data.added,0);
  const folder=path.join(root,'Közös jelenetek','Teszt Aladár');
  await fs.writeFile(path.join(folder,'Aladár lakása - 1 hetkoznapi.png'),png);
  assert.equal((await call('/api/play/scenes/scan',{})).data.added,1);
  const m=app.db.prepare("SELECT id FROM media WHERE relative_path LIKE '%Aladár lakása - 1%'").get();
  const who=app.db.prepare('SELECT character_id FROM depictions WHERE media_id=?').all(m.id).map(r=>r.character_id).sort();
  assert.deepEqual(who,[a.id,palor.id].sort(),'both men are linked');
  assert.equal(app.db.prepare('SELECT level FROM play_content WHERE media_id=?').get(m.id).level,'non_intimate','content from the file name');
  // Marked everyday → visible as a shared photo even with adult content off.
  assert.deepEqual((await call('/api/play/shared-photos/'+a.id)).data.photos.map(p=>p.media_id),[m.id]);

  // Upload route: friendly name, identical bytes reused, content marks validated.
  const data_url='data:image/png;base64,'+Buffer.concat([png]).toString('base64');
  const up=(await call('/api/play/scenes/upload',{character_id:a.id,location_id:flat.id,data_url})).data;
  assert.equal(up.duplicate,true,'same bytes as the folder picture');
  assert.equal((await call('/api/play/content',{media_id:m.id,level:'spicy'})).status,400);
  assert.equal((await call('/api/play/content',{media_id:m.id,level:'nudity'})).data.level,'nudity');

  // Prompts: background (3 times of day) and a scene for the two of them.
  const pr=(await call(`/api/play/prompts?character_id=${a.id}&location_id=${flat.id}`)).data;
  assert.match(pr.background.night,/night/);assert.match(pr.scene.prompt,/Palor and Teszt Aladár together/);assert.match(pr.scene.prompt,/everyday friendly moment/);
  assert.equal((await call('/api/play/inserts')).data.inserts.length,1);

  // With an open talk (2026-11-13): the moment, the summary so far and the latest lines go in.
  const db=app.db,ins=(sql,...v)=>db.prepare(sql).run(...v);
  ins("INSERT INTO play_conversations(id,character_id,location_id,channel,world_day,slot,status,created_at,memo_json) VALUES('c1',?,?,'in_person','2026-11-13','este','open','x',?)",a.id,flat.id,JSON.stringify({text:'Palor segített Aladárnak felcipelni a kanapét.',lines:14}));
  ins("INSERT INTO play_lines VALUES('l1','c1','palor','Hozzak egy sört a hűtőből?','x')");
  ins("INSERT INTO play_lines VALUES('l2','c1','character','Hozz kettőt, és ülj le mellém a kanapéra.','x')");
  ins("INSERT INTO play_line_meta(line_id,beat) VALUES('l2','talk')");
  let scene=(await call(`/api/play/prompts?character_id=${a.id}&location_id=${flat.id}&conversation_id=c1`)).data.scene.prompt;
  assert.match(scene,/Moment: talking with each other/);assert.match(scene,/Time of day: warm early-evening light/);
  assert.match(scene,/felcipelni a kanapét/);assert.match(scene,/Teszt Aladár: Hozz kettőt/);assert.match(scene,/Palor: Hozzak egy sört/);
  assert.match(scene,/never write any of this text into the image/);
  // Without the conversation id the open in-person talk is found by itself.
  assert.match((await call(`/api/play/prompts?character_id=${a.id}&location_id=${flat.id}`)).data.scene.prompt,/Hozz kettőt/);
  // A beat beyond what the relationship allows: no explicit moment, no lines, no summary.
  ins("INSERT INTO play_lines VALUES('l3','c1','character','Gyere közelebb.','x')");ins("INSERT INTO play_line_meta(line_id,beat) VALUES('l3','sex')");
  scene=(await call(`/api/play/prompts?character_id=${a.id}&location_id=${flat.id}&conversation_id=c1`)).data.scene.prompt;
  assert.doesNotMatch(scene,/consensual sex|Gyere közelebb|kanapét/);assert.match(scene,/everyday friendly moment/);
});
