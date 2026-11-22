// 2026-11-22: whispers (owner-planted thoughts) and known places.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('a whisper becomes his own thought (prompt + memory), only his, withdrawable, fades after a week; known places listed and learned',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-wh-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let now=new Date('2026-11-10T09:00:00');
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('Egy beszélgetést foglalsz össze'))return {title:'x',summary:'x',character_memory:'x',level_delta:0,mentioned_places:['Kocsma']};
    return {reply:'Szia!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>now});
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
  assert.equal((await call('/api/play/characters/'+a.id+'/whispers',{text:''})).status,400);
  const wr=(await call('/api/play/characters/'+a.id+'/whispers',{text:'Gyanítja, hogy Béla hazudott neki a hétvégéről.'})).data;assert.equal(wr.whispers.length,1);
  const mem=app.db.prepare("SELECT m.text,s.importance FROM character_memories m JOIN memory_salience s ON s.memory_id=m.id WHERE m.character_id=? AND m.reason='Suttogás (tulajdonos)'").get(a.id);
  assert.deepEqual([mem.text,mem.importance],['Gondolat: Gyanítja, hogy Béla hazudott neki a hétvégéről.',4]);
  let talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;let u=requests.at(-1).user;
  assert.match(u,/EZ JÁR A FEJEDBEN[^\n]*\n- Gyanítja, hogy Béla hazudott/);
  assert.match(u,/HELYEK, AMIKET ISMERSZ[^\n]*: Kávézó$/m);assert.doesNotMatch(u,/Béla háza/,'not someone else\'s home');
  await call(`/api/play/conversations/${talk.id}/end`,{});
  const tb=(await call('/api/play/talk',{character_id:b.id,text:'Szia!'})).data;assert.doesNotMatch(requests.at(-1).user,/Gyanítja/,'only his');
  await call(`/api/play/conversations/${tb.id}/end`,{});
  // He heard of the pub in that talk: now he knows it.
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Megint szia!'})).data;u=requests.at(-1).user;
  assert.match(u,/HELYEK, AMIKET ISMERSZ[^\n]*Kocsma/);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  // A week later it is no longer on his mind (the memory stays).
  now=new Date('2026-11-18T09:00:00');
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Rég láttalak!'})).data;assert.doesNotMatch(requests.at(-1).user,/EZ JÁR A FEJEDBEN/);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  // Withdrawn: the memory is withdrawn too.
  await call('/api/play/whispers/'+wr.whispers[0].id+'/withdraw',{});
  assert.equal(app.db.prepare("SELECT status FROM character_memories WHERE reason='Suttogás (tulajdonos)'").get().status,'withdrawn');
  assert.equal((await call('/api/play/characters/'+a.id+'/whispers')).data.whispers.length,0);
});
