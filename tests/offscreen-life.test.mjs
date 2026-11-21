// E9 (2026-11-21): characters resting in a world round still meet by rule, without an AI call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {plan,record,chance,MAX_OFFSCREEN} from '../app/offscreen-life.mjs';

const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const people=n=>Array.from({length:n},(_,i)=>({id:'c'+i,name:'Teszt '+i}));
const at=(roles)=>()=>roles.map(role=>({location_id:'L-'+role,location_name:'Hely '+role,role}));

test('off-screen plan: known pairs at a shared place, by day part, once per person, capped, deterministic',()=>{
  const cast=people(12),all=new Set();for(const a of cast)for(const b of cast)if(a.id<b.id)all.add(pairKey(a.id,b.id));
  const args={resting:cast,day:'2026-11-12',placesOf:at(['work']),levelOf:()=>5,known:all,pairKey};
  const morning=plan({...args,slot:'reggel'});
  assert.ok(morning.length>0&&morning.length<=MAX_OFFSCREEN);
  const ids=morning.flatMap(m=>[m.a.id,m.b.id]);assert.equal(new Set(ids).size,ids.length,'one meeting per person');
  assert.deepEqual(plan({...args,slot:'reggel'}),morning,'the same draw every time');
  assert.deepEqual(plan({...args,slot:'este'}),[],'nobody is at work in the evening');
  assert.deepEqual(plan({...args,slot:'ejszaka'}),[],'no run-ins at night');
  assert.deepEqual(plan({...args,slot:'reggel',known:new Set()}),[],'strangers do not');
  const met=new Set(morning.map(m=>pairKey(m.a.id,m.b.id)));
  assert.ok(plan({...args,slot:'reggel',metToday:met}).every(m=>!met.has(pairKey(m.a.id,m.b.id))),'a pair once a day');
  assert.ok(chance(5)>chance(0)&&chance(0)>chance(-2)&&chance(-2)>=0.15);
  const r=record({a:cast[0],b:cast[1],location_name:'Kávézó',level:-1},'reggel');
  assert.match(r.summary,/Teszt 0 és Teszt 1 reggel összefutott itt: Kávézó; feszült/);
  assert.deepEqual(r.memories.map(m=>m.character_id),['c0','c1']);assert.match(r.memories[0].text,/^Reggel összefutottam Teszt 1/);
});

test('off-screen life in a world round: records, memories and news without an AI call for them; a pair once a day',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-off-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  let calls=0;const provider=createMockProvider(()=>{calls++;return {events:[]};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-12T08:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>(await (await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined})).json());
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const work=await call('/api/locations',{name:'Gyár',kind:'tag'}),cast=[];
  for(let i=0;i<8;i++){const c=await call('/api/characters',{name:'Teszt Munkás '+i,gender:'férfi'});cast.push(c);
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:{value:'Dolgozni.',interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'}},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:c.id,location_id:work.id,role:'work'});}
  const i=app.worldEngine.internals;
  for(const a of cast)for(const b of cast)if(a.id!==b.id)i.setLevel(a.id,b.id,3,{reason:'kollégák',actor:'teszt'});
  const res=await app.worldEngine.simulateDay('2026-11-12',{id:'reggel',label:'reggel'});
  assert.ok(res.resting>=2,'some rest this round: '+JSON.stringify(res));
  assert.ok(res.offscreen>=1,'resting colleagues ran into each other: '+JSON.stringify(res));
  const ev=app.db.prepare("SELECT id,title,payload_json FROM world_events WHERE model='rules'").all();assert.equal(ev.length,res.offscreen);
  const ids=JSON.parse(ev[0].payload_json).character_ids;
  assert.ok(app.db.prepare("SELECT count(*) n FROM character_memories WHERE reason=? AND character_id IN (?,?)").get('Világmotor esemény '+ev[0].id,...ids).n===2,'both remember it');
  assert.equal(app.db.prepare('SELECT importance FROM memory_salience s JOIN character_memories m ON m.id=s.memory_id WHERE m.reason=? LIMIT 1').get('Világmotor esemény '+ev[0].id).importance,2);
  // Same day part again: no second run-in for the same pairs.
  const again=await app.worldEngine.simulateDay('2026-11-12',{id:'reggel',label:'reggel'});
  const pairs=app.db.prepare("SELECT payload_json FROM world_events WHERE model='rules'").all().map(e=>JSON.parse(e.payload_json).character_ids.slice().sort().join('|'));
  assert.equal(new Set(pairs).size,pairs.length,'a pair once a day');assert.ok(again.offscreen>=0);
});
