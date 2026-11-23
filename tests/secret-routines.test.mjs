// 2026-11-22: secret routines – Palor catches him there once; the discovery is remembered, shown, rewindable.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('secret routine: caught the first time Palor finds him there, then Palor knows; others unaffected; rewind undoes it',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sec-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let now=new Date('2026-11-10T09:00:00');
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('Egy beszélgetést foglalsz össze'))return {title:'x',summary:'x',character_memory:'x',level_delta:0,mentioned_places:['Kocsma']};
    return {reply:'Szia!'};});
  // This fixture injects logical game days; real-time break capping is tested separately.
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,clockBreakCap:false,worldClock:()=>now});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const mk=async name=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));return c;};
  const a=await mk('Teszt Aladár'),b=await mk('Teszt Béla');
  const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data,home=(await call('/api/locations',{name:'Béla háza',kind:'tag'})).data;await call('/api/locations',{name:'Kocsma',kind:'tag'});
  await call('/api/world-engine/places',{character_id:a.id,location_id:cafe.id,role:'work'});await call('/api/world-engine/places',{character_id:b.id,location_id:cafe.id,role:'work'});await call('/api/world-engine/places',{character_id:b.id,location_id:home.id,role:'home'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-c',name:'Kávézó',parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-c'});
  // 2026-11-10 is a Tuesday (2), 09:00 = reggel. Aladár's secret Tuesday-morning routine is at the café.
  await call('/api/play/schedules/'+a.id,{grid:{'2|reggel':{location_id:cafe.id,activity:'egy nős férfival találkozik titokban',privacy:'secret'}}});
  let wh=(await call('/api/play/whereabouts')).data.slots[0].people.find(p=>p.id===a.id);
  assert.deepEqual([wh.location_id,wh.activity,wh.privacy],[cafe.id,'egy nős férfival találkozik titokban','secret']);
  const shown=()=>app.db.prepare('SELECT 1').get()&&call('/api/play/place/n-c');
  assert.doesNotMatch(JSON.stringify((await shown()).data),/nős férfival/,'a secret is not on the screen before Palor knows');
  let talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;let u=requests.at(-1).user;
  assert.match(u,/RAJTAKAPOTT: Palor most itt talált, ennél: „egy nős férfival találkozik titokban”/);
  assert.match(u,/Ez a titkod/);
  assert.match(JSON.stringify((await shown()).data),/nős férfival/,'now shown to the player (until today\'s meeting record takes over)');
  talk=(await call('/api/play/talk',{conversation_id:talk.id,text:'Ki ez?'})).data;assert.match(requests.at(-1).user,/RAJTAKAPOTT/,'the whole scene knows it');
  await call(`/api/play/conversations/${talk.id}/end`,{});
  assert.equal(app.db.prepare('SELECT count(*) n FROM secret_discoveries').get().n,1);
  assert.ok(app.db.prepare("SELECT 1 FROM character_memories WHERE character_id=? AND text='Palor rajtakapott: egy nős férfival találkozik titokban'").get(a.id));
  // Béla's talk carries nothing of it.
  const tb=(await call('/api/play/talk',{character_id:b.id,text:'Szia!'})).data;assert.doesNotMatch(requests.at(-1).user,/RAJTAKAPOTT|PALOR TUDJA/);
  await call(`/api/play/conversations/${tb.id}/end`,{});
  // Next Tuesday morning: Palor already knows – no second discovery.
  now=new Date('2026-11-17T09:00:00');
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Megint itt?'})).data;u=requests.at(-1).user;
  assert.doesNotMatch(u,/RAJTAKAPOTT/);assert.match(u,/PALOR TUDJA RÓLAD \(korábban rajtakapott\): egy nős férfival találkozik titokban/);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  assert.equal(app.db.prepare('SELECT count(*) n FROM secret_discoveries').get().n,1);
  // Rewind takes the discovery back.
  const ids=app.worldEngine.internals.secretDiscoveries.rewindAfter('2026-01-01T00:00:00Z',new Date().toISOString());assert.equal(ids.length,1);
  now=new Date('2026-11-24T09:00:00');
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;assert.match(requests.at(-1).user,/RAJTAKAPOTT/,'caught again after rewind');
});
