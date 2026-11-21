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
  const requests=[];let opinions=[{about:'Béla',text:'Béla irigy rá, amióta megnyílt a pékség.'},{about:'pénz',text:'A pénz miatt örökké aggódni kell.'},{about:'Palor',text:'NEM-IDE'}],delta=-1,inner={mood:'megbántott',intensity:3,reason:'Palor elfelejtette a születésnapját.',concerns:['a lakbér miatt aggódik','ki akar békülni az öccsével'],wants_from_palor:'egy őszinte bocsánatkérést',palor_view:'Haragszik rá, mert elfelejtette a születésnapját.'};
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('Egy beszélgetést foglalsz össze'))return {title:'Feszült beszélgetés',summary:'Szóba került a születésnap.',character_memory:'Palor elfelejtette.',level_delta:delta,reason:'Palor elfelejtette a születésnapját.',inner,opinions};
    if(req.user.includes('Palor: Mennem kell?'))return {reply:'Most mennem kell, bocs.',leaving:'dolga van a pékségben'};
    return {reply:'Szia.'};});
  let clock=new Date('2026-11-10T09:00:00');
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>clock});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data;
  const b=(await call('/api/characters',{name:'Teszt Béla',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+b.id,JSON.stringify({version:1,values:{goals:entry('Bosszú.')},history:[],proposals:[]}));
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Pékséget nyitni.'),emotional_stability:entry(2)},history:[],proposals:[]}));
  const work=(await call('/api/locations',{name:'Pékség',kind:'tag'})).data;await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-b',name:'Pékség',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-b'});

  // First talk: no state yet, the old day-mood line is used.
  let talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;
  assert.match(requests.at(-1).user,/HANGULATOD MA: /);
  await call(`/api/play/conversations/${talk.id}/end`,{});
  const summaryReq=requests.find(r=>r.system.includes('Egy beszélgetést foglalsz össze'));
  assert.match(summaryReq.system,/"inner":/);assert.match(summaryReq.system,/Ténykezelés: kérés, ígéret/);assert.match(summaryReq.system,/"palor_view"/);assert.doesNotMatch(summaryReq.user,/KORÁBBI BELSŐ ÁLLAPOTA/);
  const st=app.worldEngine.internals.inner.current(a.id);
  assert.deepEqual([st.mood,st.intensity,st.concerns.length,st.wants_from_palor],['megbántott',3,2,'egy őszinte bocsánatkérést']);

  // E8: a self-view from an earlier reflection reaches his prompt.
  app.db.prepare("INSERT INTO world_beliefs(id,character_id,about_id,about_name,text,memory_ids_json,world_day,model,created_at,rewound_at) VALUES('sv',?,?,'önmaga','Túl sokat vállalok magamra.','[\"m\"]','2026-11-09','mock','2026-11-09T10:00:00Z',NULL)").run(a.id,a.id);
  // Second talk: his state is in his own prompt; the day's events are only background.
  talk=(await call('/api/play/talk',{character_id:a.id,text:'Szia megint!'})).data;let u=requests.at(-1).user;
  assert.match(u,/HANGULATOD: nagyon megbántott \(Palor elfelejtette a születésnapját\.\)/);
  assert.match(u,/AMI MOST FOGLALKOZTAT[^\n]*\n- a lakbér miatt aggódik\n- ki akar békülni az öccsével/);
  assert.match(u,/AMIT PALORTÓL SZERETNÉL: egy őszinte bocsánatkérést/);assert.match(u,/A MAI NAPOD: /);
  assert.match(u,/AHOGY MOSTANÁBAN MAGADAT LÁTOD[^:]*: Túl sokat vállalok magamra\./);
  // E12: his opinions from the last talk – about Béla (matched by first name) and about money.
  assert.match(u,/A VÉLEMÉNYED[^\n]*\n(- [^\n]*\n)*- Teszt Béla: Béla irigy rá/);assert.match(u,/- pénz: A pénz miatt örökké aggódni kell\./);
  assert.doesNotMatch(u,/NEM-IDE/,'no opinion about Palor here (his view of Palor is palor_view)');
  assert.equal(app.db.prepare("SELECT count(*) n FROM world_beliefs WHERE model='play-opinion' AND about_id=?").get(b.id).n,1);
  // E6: where they stand as he sees it, and why the relationship changed.
  assert.match(u,/AHOGY TE LÁTOD, HOL TARTOTOK PALORRAL: Haragszik rá, mert elfelejtette a születésnapját\./);
  assert.match(u,/MIÉRT VÁLTOZOTT LEGUTÓBB A VISZONYOTOK[^\n]*\n- távolabb: Palor elfelejtette a születésnapját\./);
  // E4: his own aim, early in the talk he brings it up himself; the reply may say he is leaving.
  assert.match(u,/A SAJÁT CÉLOD EBBEN A BESZÉLGETÉSBEN: egy őszinte bocsánatkérést\. Magadtól hozd szóba/);
  assert.match(requests.at(-1).system,/"leaving":/);assert.equal(talk.leaving,undefined);
  const leave=(await call('/api/play/talk',{conversation_id:talk.id,text:'Mennem kell?'})).data;
  assert.equal(leave.leaving,'dolga van a pékségben');assert.equal(leave.lines.at(-1).text,'Most mennem kell, bocs.');
  // The next summary carries his earlier state so concerns can continue.
  delta=0;opinions=[];inner={mood:'megkönnyebbült',intensity:1,reason:'Palor bocsánatot kért.',concerns:['a lakbér miatt aggódik'],wants_from_palor:''};
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

test('inner state: an older table without palor_view gets the column, nothing lost',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE characters(id TEXT PRIMARY KEY)');db.exec("INSERT INTO characters VALUES('c1')");
  db.exec(`CREATE TABLE character_inner_states(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),mood TEXT NOT NULL,intensity INTEGER NOT NULL CHECK(intensity BETWEEN 0 AND 3),reason TEXT NOT NULL,concerns_json TEXT NOT NULL,wants_from_palor TEXT NOT NULL,world_day TEXT NOT NULL,event_id TEXT,conversation_id TEXT,created_at TEXT NOT NULL,rewound_at TEXT)`);
  db.exec("INSERT INTO character_inner_states VALUES('s1','c1','nyugodt',1,'','[]','','2026-11-01',NULL,NULL,'2026-11-01T00:00:00Z',NULL)");
  const {installInnerState}=await import('../app/inner-state.mjs');
  const one=(q,...a)=>db.prepare(q).get(...a),all=(q,...a)=>db.prepare(q).all(...a),run=(q,...a)=>db.prepare(q).run(...a);
  const inner=installInnerState({db,one,all,run});
  assert.equal(inner.current('c1').mood,'nyugodt');assert.equal(inner.current('c1').palor_view,'');
  inner.record('c1',{mood:'vidám',intensity:2,palor_view:'Jóban vannak.'},{day:'2026-11-02'});
  assert.equal(inner.current('c1').palor_view,'Jóban vannak.');
});
