// E2 (2026-11-21): a character's inner state carries from one conversation to the next, fades
// by his profile, reaches his own prompt and is undone by a rewind. Synthetic, mock provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {cleanInner,halfLife,effectiveIntensity} from '../app/inner-state.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('inner state: cleaning, fade speed by profile',()=>{
  assert.equal(cleanInner(null),null);assert.equal(cleanInner({mood:'',concerns:[],wants_from_palor:''}),null);
  const s=cleanInner({mood:' megbántott ',intensity:9,reason:'Palor nem jött el.',concerns:['a','b','c','d'],wants_from_palor:'bocsánatkérés'});
  assert.deepEqual([s.mood,s.intensity,s.concerns.length],['megbántott',3,3]);
  const calm={values:{emotional_stability:entry(10),mood_reactivity:entry(0)}},touchy={values:{emotional_stability:entry(1),mood_reactivity:entry(10)}};
  assert.ok(halfLife(calm)<halfLife({})&&halfLife({})<halfLife(touchy));
  const st={intensity:3,world_day:'2026-11-01'};
  assert.equal(effectiveIntensity(st,'2026-11-01',{}),3);
  assert.ok(effectiveIntensity(st,'2026-11-05',calm)<0.5&&effectiveIntensity(st,'2026-11-05',touchy)>1,'the calm one has let go, the touchy one has not');
});

test('inner state: written at the save point from his side, in his next prompt, rewound and restored',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-inner-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let inner={mood:'megbántott',intensity:3,reason:'Palor elfelejtette a születésnapját.',concerns:['a lakbér miatt aggódik','ki akar békülni az öccsével'],wants_from_palor:'egy őszinte bocsánatkérést'};
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('Egy beszélgetést foglalsz össze'))return {title:'Feszült beszélgetés',summary:'Szóba került a születésnap.',character_memory:'Palor elfelejtette.',level_delta:0,inner};
    return {reply:'Szia.'};});
  let clock=new Date('2026-11-10T09:00:00');
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>clock});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Pékséget nyitni.'),emotional_stability:entry(2)},history:[],proposals:[]}));
  const work=(await call('/api/locations',{name:'Pékség',kind:'tag'})).data;await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-b',name:'Pékség',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-b'});

  // First talk: no state yet, the old day-mood line is used.
  let talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;
  assert.match(requests.at(-1).user,/HANGULATOD MA: /);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  const summaryReq=requests.find(r=>r.system.includes('Egy beszélgetést foglalsz össze'));
  assert.match(summaryReq.system,/"inner":/);assert.doesNotMatch(summaryReq.user,/KORÁBBI BELSŐ ÁLLAPOTA/);
  const st=app.worldEngine.internals.inner.current(a.id);
  assert.deepEqual([st.mood,st.intensity,st.concerns.length,st.wants_from_palor],['megbántott',3,2,'egy őszinte bocsánatkérést']);

  // Second talk: his state is in his own prompt; the day's events are only background.
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia megint!'})).data;let u=requests.at(-1).user;
  assert.match(u,/HANGULATOD: nagyon megbántott \(Palor elfelejtette a születésnapját\.\)/);
  assert.match(u,/AMI MOST FOGLALKOZTAT[^\n]*\n- a lakbér miatt aggódik\n- ki akar békülni az öccsével/);
  assert.match(u,/AMIT PALORTÓL SZERETNÉL: egy őszinte bocsánatkérést/);assert.match(u,/A MAI NAPOD: /);
  // The next summary carries his earlier state so concerns can continue.
  inner={mood:'megkönnyebbült',intensity:1,reason:'Palor bocsánatot kért.',concerns:['a lakbér miatt aggódik'],wants_from_palor:''};
  await call(`/api/play/conversations/${talk.id}/end`,{});
  assert.match(requests.filter(r=>r.system.includes('Egy beszélgetést foglalsz össze')).at(-1).user,/KORÁBBI BELSŐ ÁLLAPOTA \([^)]*\): megbántott/);
  assert.equal(app.worldEngine.internals.inner.current(a.id).mood,'megkönnyebbült');

  // Rewind to the first save point: the second state is undone, the first is current again.
  const points=(await call('/api/play/save-points')).data.points.filter(p=>p.kind==='conversation');
  assert.equal(points.length,2);
  assert.equal((await call('/api/play/rewind',{time:points[1].time,label:'teszt'})).status,200);
  assert.equal(app.worldEngine.internals.inner.current(a.id).mood,'megbántott');
  assert.equal((await call('/api/play/rewind/undo',{})).status,200);
  assert.equal(app.worldEngine.internals.inner.current(a.id).mood,'megkönnyebbült');

  // Fading in his own prompt: a strong mood written on an old day is reported as faded.
  app.db.prepare("UPDATE character_inner_states SET world_day='2026-10-01',intensity=1 WHERE rewound_at IS NULL").run();
  const lines=app.worldEngine.internals.inner.promptLines(a.id,'2026-11-10',{values:{}});
  assert.match(lines.join('\n'),/a korábbi megkönnyebbült hangulatod már elmúlt/);
  assert.doesNotMatch(lines.join('\n'),/FOGLALKOZTAT/,'concerns older than three weeks are dropped');
});
