// S3 (2026-11-22): the once-a-day morning step – inner state on waking and day plans from due plans only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('morning: one call for those with something due; plan only at a known place; once a day; drives where he is',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-morn-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const calls=[];
  const provider=createMockProvider(req=>{if(req.system.includes('reggeli áttekintését')){calls.push(req);
      return {people:[{name:'Teszt Aladár',inner:{mood:'izgatott',intensity:2,reason:'Este jön Palor.',concerns:['a vacsora'],wants_from_palor:'',palor_view:'Várja.'},plan:[{slot:'este',place:'Kocsma',reason:'Palorral beszélték meg.'},{slot:'delutan',place:'Kitalált Hely',reason:'x'}]}]};}
    return {};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-17T08:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const mk=async name=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Élni.')},history:[],proposals:[]}));return c;};
  const a=await mk('Teszt Aladár'),b=await mk('Teszt Béla');
  const home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data.id,pub=(await call('/api/locations',{name:'Kocsma',kind:'tag'})).data.id,bh=(await call('/api/locations',{name:'Béla háza',kind:'tag'})).data.id;
  await call('/api/world-engine/places',{character_id:a.id,location_id:home,role:'home'});await call('/api/world-engine/places',{character_id:a.id,location_id:pub,role:'other'});
  await call('/api/world-engine/places',{character_id:b.id,location_id:bh,role:'home'});
  // Aladár has a plan with Palor due today; Béla has nothing going on.
  app.db.prepare("INSERT INTO world_threads(id,character_id,promised_by,text,due_day,status,conversation_id,noted_at,created_at,updated_at,rewound_at) VALUES(?,?,?,?,?,'open',NULL,NULL,?,?,NULL)").run(randomUUID(),a.id,'palor','Este találkoznak a kocsmában.','2026-11-17',new Date().toISOString(),new Date().toISOString());
  const before=(await call('/api/play/whereabouts')).data;
  assert.equal(before.slots[2].people.find(p=>p.id===a.id).location_id,home,'evening at home by default');
  const r=await app.worldEngine.simulateDay('2026-11-17',{id:'reggel',label:'reggel'});
  assert.equal(calls.length,1);assert.match(calls[0].user,/## Teszt Aladár[\s\S]*MÁRA ESEDÉKES TERVEK:\n- Palor ígérte: Este találkoznak a kocsmában\./);
  assert.doesNotMatch(calls[0].user,/Teszt Béla/,'nothing due: not in the call');
  assert.deepEqual([r.morning.people,r.morning.plans],[1,1],'the invented place is dropped');
  assert.equal(app.worldEngine.internals.inner.current(a.id).mood,'izgatott');
  const after=(await call('/api/play/whereabouts')).data,ev=after.slots[2].people.find(p=>p.id===a.id);
  assert.deepEqual([ev.location_id,ev.reason],[pub,'day_plan']);
  await app.worldEngine.simulateDay('2026-11-17',{id:'delutan',label:'délután'});assert.equal(calls.length,1,'once a day');
  // Rewind takes the plan back.
  const ids=app.worldEngine.internals.morning.rewindAfter('2026-01-01T00:00:00Z',new Date().toISOString());assert.equal(ids.length,1);
  assert.equal((await call('/api/play/whereabouts')).data.slots[2].people.find(p=>p.id===a.id).location_id,home);
});
