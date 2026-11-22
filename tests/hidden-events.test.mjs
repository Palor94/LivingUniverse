// N1 (2026-11-22): hidden conditional events – a three-step chain opens in order, one per day part, rewindable.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('hidden events: suspicion → two days later it comes out → confrontation; validation; one per day part; rewind closes it',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-he-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let now=new Date('2026-11-10T09:00:00');
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('Egy beszélgetést foglalsz össze'))return {title:'x',summary:'x',character_memory:'x',level_delta:0,mentioned_places:['Kocsma']};
    if(req.system.includes('Rejtett eseményeket javasolsz'))return {events:[{title:'Levél',brief:'Régi levelet talál.',character_ids:[],condition:{day_gte:'2026-11-20'}},{title:'Rossz',brief:'x',condition:{nope:1}}]};
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
  // Validation: shape, Palor, empty brief.
  assert.equal((await call('/api/play/hidden-events',{title:'x',brief:'y',condition:{foo:1}})).status,400);
  assert.equal((await call('/api/play/hidden-events',{title:'x',brief:'',condition:{day_gte:'2026-11-01'}})).status,400);
  const pal=app.db.prepare("SELECT id FROM characters WHERE name='Palor'").get().id;
  assert.equal((await call('/api/play/hidden-events',{title:'x',brief:'y',condition:{day_gte:'2026-11-01'},character_ids:[pal]})).status,400);
  const A=(await call('/api/play/hidden-events',{title:'Gyanú',brief:'Aladár észrevette, hogy hiányzik pénz a kasszából, és Bélára gyanakszik, de még nem mondja ki.',condition:{all:[{day_gte:'2026-11-10'},{slot_in:['reggel']}]},character_ids:[a.id]})).data;
  assert.equal(A.status,'draft');
  const B=(await call('/api/play/hidden-events',{title:'Kiderül',brief:'Aladár megtudta: Béla vitte el a pénzt, hogy kifizesse az adósságát.',condition:{revealed:A.id,slots_since_gte:8},character_ids:[a.id],approve:true})).data;
  const C=(await call('/api/play/hidden-events',{title:'Konfrontáció',brief:'Béla tudja, hogy Aladár rájött, és mentegetőzik.',condition:{all:[{revealed:B.id},{not:{level:b.id,lte:-3}}]},character_ids:[b.id],approve:true})).data;
  // Drafts never open.
  let talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;assert.doesNotMatch(requests.at(-1).user,/MOST TÖRTÉNIK VELED/);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  await call('/api/play/hidden-events/'+A.id+'/approve',{});
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;
  assert.match(requests.at(-1).user,/MOST TÖRTÉNIK VELED[^\n]*\nAladár észrevette, hogy hiányzik pénz/);
  // The narrator knows what is unfolding in this scene.
  await call('/api/play/talk',{conversation_id:talk.id,text:'*Rendszer: mit csinál most?*'});
  assert.match(requests.at(-1).user,/KIBONTAKOZÓ FORDULAT[^\n]*\nAladár észrevette/);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  // Béla in the same day part: one event per day part, and A is Aladár's.
  let tb=(await call('/api/play/talk',{character_id:b.id,text:'Szia!'})).data;assert.doesNotMatch(requests.at(-1).user,/MOST TÖRTÉNIK VELED/);
  await call(`/api/play/conversations/${tb.id}/end`,{});
  const he=app.worldEngine.internals.hiddenEvents,at=(day,slot,cid)=>he.openFor(cid,{day,weekday:1,slot});
  assert.equal(at('2026-11-11','reggel',a.id),null,'B waits two days');
  assert.equal(at('2026-11-12','reggel',a.id)?.id,B.id);
  assert.equal(at('2026-11-12','delutan',a.id),null,'C belongs to Béla');
  const saved=new Date('2026-11-11T00:00:00Z').toISOString();now=new Date('2026-11-12T13:00:00');
  assert.equal(at('2026-11-12','delutan',b.id)?.id,C.id);
  assert.equal((await call('/api/play/hidden-events')).data.events.find(e=>e.id===C.id).revealed.slot,'delutan');
  // Rewind closes it again; undo reopens.
  const ids=he.rewindAfter(saved,now.toISOString());assert.equal(ids.length,1);
  assert.equal((await call('/api/play/hidden-events')).data.events.find(e=>e.id===C.id).revealed,null);
  he.undoRewind(ids);assert.ok((await call('/api/play/hidden-events')).data.events.find(e=>e.id===C.id).revealed);
  await call('/api/play/hidden-events/'+C.id+'/archive',{});assert.equal((await call('/api/play/hidden-events')).data.events.find(e=>e.id===C.id).status,'archived');
  // The AI planner is off by default; when on, it only makes 'proposed' drafts (invalid ones dropped).
  assert.equal((await call('/api/play/hidden-events/propose',{})).status,409);
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('play:hidden-events:planner','on');
  const pr=(await call('/api/play/hidden-events/propose',{})).data;assert.deepEqual(pr.events.map(e=>[e.title,e.status,e.actor]),[['Levél','proposed','ai-planner']]);
});
