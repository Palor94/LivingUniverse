import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {livingWorld} from './helpers/living-world.mjs';
import {SLOTS} from '../app/world-common.mjs';
import {WORLD_EXPERIENCE_METHOD,validateExperienceText} from '../app/social-experiences.mjs';
import {createApp} from '../app/server.mjs';
import {evaluate} from '../app/hidden-events.mjs';

const interaction=(actor,recipient,kind,quote)=>({actor_id:actor.id,recipient_id:recipient.id,kind,quote});
const line=(actor,recipient,quote)=>`${actor.name}: ${recipient.name}, ${quote}`;
const event=(w,interactions,{kind='meeting',title='Közös feladat',summary}={})=>({kind,title,summary:summary??interactions.map(x=>line([w.a,w.b,w.c,w.palor].find(c=>c.id===x.actor_id),[w.a,w.b,w.c,w.palor].find(c=>c.id===x.recipient_id),x.quote)).join('\n'),character_ids:[w.a.id,w.b.id],memories:[{character_id:w.a.id,text:'Bélával közös feladatot végeztünk.'},{character_id:w.b.id,text:'Aladárral dolgoztunk.'}],interactions});
const prepare=async w=>{await w.call('/api/world-engine/settings',{tempo:'lively'});await w.call('/api/world-engine/levels',{source_id:w.a.id,target_id:w.b.id,level:1});};
const round=async(w,events)=>{w.control.worldEvents=events;w.setNow('2026-11-12T10:10:00');return w.app.worldEngine.simulateDay('2026-11-12',SLOTS[0]);};

test('world round records all six directed dimensions, own prompts, creator evidence and idempotent commits',async t=>{
  const w=await livingWorld(t);await prepare(w);const x=w.app.worldEngine.internals.experiences;
  const entries=[['praise','Ügyes vagy.'],['criticism','Ez hibás.'],['rejection','Nem szeretnék veled találkozni.'],['help','*Segítek elpakolni.*'],['boundary_respected','Tiszteletben tartom a döntésedet.'],['attraction','Vonzódom hozzád.']].map(([kind,quote])=>interaction(w.b,w.a,kind,quote));
  const before=await w.call('/api/play/settings');await round(w,[event(w,entries)]);
  const source=w.app.db.prepare("SELECT * FROM world_events WHERE title='Közös feladat'").get();
  assert.equal(source.status,'applied');
  assert.deepEqual(x.state(w.a.id,w.b.id).scores,{familiarity:2,resentment:3,trust:2,loyalty:1,boundaries:2});
  assert.deepEqual(x.state(w.b.id,w.a.id).scores,{attraction:1});
  assert.ok(x.state(w.a.id,w.b.id).evidence.every(e=>e.event_id===source.id&&e.memory_id&&e.method===WORLD_EXPERIENCE_METHOD&&!e.line_id));
  const count=w.app.db.prepare('SELECT count(*) n FROM social_experiences').get().n;
  const result=w.app.worldEngine.internals.factGate.commitSimulation(source.id,'world_engine');assert.equal(result.experience_ids.length,6);
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM social_experiences').get().n,count);
  assert.equal(w.app.worldEngine.internals.levelOf(w.a.id,w.b.id),1,'dimensions do not invent aggregate level changes');
  const overview=await w.call('/api/world-engine/social');assert.equal(overview.dimensions.length,2);assert.equal(overview.dimension_labels.trust,'bizalom');
  w.control.worldEvents=[];w.setNow('2026-11-12T14:00:00');await w.app.worldEngine.simulateDay('2026-11-12',SLOTS[1]);
  const own=w.requests.findLast(r=>r.system.includes('szimulációjában')&&r.system.includes(w.a.name));
  assert.match(own.user,/SAJÁT IRÁNYÍTOTT.*\nTeszt Béla:.*bizalom \+2/);assert.ok(!own.user.includes('vonzalom +1'),'other NPC’s attraction stays out of own intention prompt');
  const gm=w.requests.findLast(r=>r.system.includes('játékmester'));assert.ok(gm.user.includes('Teszt Aladár saját nézőpontja'));assert.ok(gm.user.includes('Teszt Béla saját nézőpontja'));
  assert.deepEqual(await w.call('/api/play/settings'),before,'written story behavior preserved');
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM canon').get().n,0);
  w.app.db.prepare('UPDATE world_events SET summary=? WHERE id=?').run('Megváltozott forrásszöveg.',source.id);
  assert.throws(()=>w.app.worldEngine.internals.factGate.commitSimulation(source.id,'world_engine'),/megváltozott/);
});

test('serious world interaction stays pending until accepted, refusal applies nothing',async t=>{
  const w=await livingWorld(t);await prepare(w);const x=w.app.worldEngine.internals.experiences;
  await round(w,[event(w,[interaction(w.b,w.a,'boundary_respected','Tiszteletben tartom a döntésedet.')],{kind:'serious',title:'Határ megbeszélése'})]);
  const e=w.app.db.prepare("SELECT * FROM world_events WHERE title='Határ megbeszélése'").get();assert.deepEqual(x.state(w.a.id,w.b.id).scores,{});
  await w.call('/api/world-engine/events/'+e.id,{accept:true});assert.deepEqual(x.state(w.a.id,w.b.id).scores,{trust:1,boundaries:2});
  w.control.worldEvents=[event(w,[interaction(w.b,w.a,'criticism','Ez hibás.')],{kind:'serious',title:'Másik nézeteltérés'})];w.setNow('2026-11-13T10:00:00');await w.app.worldEngine.simulateDay('2026-11-13',SLOTS[0]);
  const refused=w.app.db.prepare("SELECT id FROM world_events WHERE title='Másik nézeteltérés'").get();await w.call('/api/world-engine/events/'+refused.id,{accept:false});
  assert.deepEqual(x.state(w.a.id,w.b.id).scores,{trust:1,boundaries:2});
});

test('unclear acts, absent/forged attribution, nonparticipants, Palor and arbitrary model scores abstain',async t=>{
  assert.equal(validateExperienceText({kind:{toString:'not callable',valueOf:'not callable'},quote:'Ügyes vagy.'}),null);
  const w=await livingWorld(t);await prepare(w);const x=w.app.worldEngine.internals.experiences;
  const cases=[
    interaction(w.b,w.a,'praise','Ügyes vagy?'),interaction(w.b,w.a,'help','Holnap *segítek elpakolni.*'),
    interaction(w.b,w.a,'praise','Szerinte ügyes vagy.'),interaction(w.b,w.a,'trust','Bizalom +99.'),
    interaction(w.b,w.a,'praise','Ügyes vagy.'),interaction(w.b,w.c,'help','*Segítek elpakolni.*')
  ];
  await round(w,[event(w,cases,{summary:cases.slice(0,4).map(v=>line(w.b,w.a,v.quote)).join('\n')+'\n'+line(w.a,w.b,'Ügyes vagy.')})]);
  assert.deepEqual(x.state(w.a.id,w.b.id).scores,{});assert.deepEqual(x.state(w.c.id,w.b.id).scores,{});
  const id=randomUUID(),p={character_ids:[w.palor.id,w.a.id],interactions:[interaction(w.palor,w.a,'help','*Segítek elpakolni.*')],memories:[],level_changes:[],deltas:{trust:999}};
  w.app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'2026-11-12','meeting','applied','Tiltott irány',line(w.palor,w.a,'*Segítek elpakolni.*'),JSON.stringify(p),'mock',new Date('2026-11-12T10:10:00').toISOString());
  w.app.worldEngine.internals.factGate.commitSimulation(id,'world_engine');assert.deepEqual(x.state(w.a.id,w.palor.id).scores,{});
});

test('NPC evidence survives export/restore and rewind/undo; heard news never changes the listener’s dimensions',async t=>{
  const w=await livingWorld(t);await prepare(w);const x=w.app.worldEngine.internals.experiences;
  await round(w,[event(w,[interaction(w.b,w.a,'help','*Segítek elpakolni.*')])]);
  const original=x.state(w.a.id,w.b.id),source=original.evidence[0].event_id;
  await w.call('/api/world-engine/levels',{source_id:w.a.id,target_id:w.c.id,level:1});
  w.control.worldEvents=[{kind:'meeting',title:'Másnapi kávészünet',summary:'Aladár és Csaba beszélgettek.',character_ids:[w.a.id,w.c.id]}];
  w.setNow('2026-11-13T10:00:00');await w.app.worldEngine.simulateDay('2026-11-13',SLOTS[0]);
  assert.ok(w.app.db.prepare('SELECT 1 FROM world_knowledge WHERE event_id=? AND character_id=?').get(source,w.c.id));
  assert.deepEqual(x.state(w.c.id,w.b.id).scores,{});
  const s={dimensionOf:(cid,key,target)=>x.state(cid,target).scores[key]??null};
  assert.equal(evaluate({dimension:'trust',character_id:w.a.id,target_id:w.b.id,gte:2},s),true);
  assert.equal(evaluate({not:{dimension:'trust',character_id:w.c.id,target_id:w.b.id,gte:1}},s),null);
  const snapshot=await w.call('/api/export'),restored=await createApp({...w.opts,dataDir:path.join(w.dataDir,'npc-restore')});
  try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200,await response.text());assert.deepEqual(restored.worldEngine.internals.experiences.state(w.a.id,w.b.id),original);assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{await restored.close();}
  w.setNow('2026-11-13T11:00:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:05:00').toISOString()});assert.deepEqual(x.state(w.a.id,w.b.id).scores,{});
  await w.call('/api/play/rewind/undo',{});assert.deepEqual(x.state(w.a.id,w.b.id),original);
});

test('a failed NPC projection rolls back memories, dimensions and commit receipt together',async t=>{
  const w=await livingWorld(t),g=w.app.worldEngine.internals.factGate,x=w.app.worldEngine.internals.experiences,id=randomUUID();
  const raw=event(w,[interaction(w.b,w.a,'help','*Segítek elpakolni.*')]),payload={character_ids:raw.character_ids,memories:raw.memories,level_changes:[],interactions:raw.interactions};
  w.app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'2026-11-12','meeting','applied',raw.title,raw.summary,JSON.stringify(payload),'mock',new Date('2026-11-12T10:10:00').toISOString());
  const prior=w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n,original=x.recordWorldEvent;
  x.recordWorldEvent=(...args)=>{original(...args);throw Error('synthetic projection failure');};
  try{assert.throws(()=>g.commitSimulation(id,'world_engine'),/synthetic projection failure/);}finally{x.recordWorldEvent=original;}
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n,prior);assert.deepEqual(x.state(w.a.id,w.b.id).scores,{});
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM world_fact_commits WHERE event_id=?').get(id).n,0);
  g.commitSimulation(id,'world_engine');assert.deepEqual(x.state(w.a.id,w.b.id).scores,{trust:2,loyalty:1,familiarity:1});
});
