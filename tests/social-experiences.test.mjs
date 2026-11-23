import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateExperience,experienceDeltas} from '../app/social-experiences.mjs';
import {appraiseEvent} from '../app/appraisal.mjs';
import {livingWorld,entry} from './helpers/living-world.mjs';
import {evaluate} from '../app/hidden-events.mjs';
import {backupBeforeSocialExperiences} from '../app/social-experiences.mjs';
import {DatabaseSync} from 'node:sqlite';

test('experience proposals abstain on questions, reports, future deeds, wrong speakers and absent evidence',()=>{
  const valid=(kind,quote,speaker='palor')=>validateExperience({kind,quote},[{id:'line',speaker,text:quote}],{name:'Teszt Aladár'});
  for(const q of ['Ügyes vagy?','Szerinte ügyes vagy.','Ha ügyes vagy, szólok.','Nem mondta, hogy ügyes vagy.'])assert.equal(valid('praise',q),null);
  assert.equal(validateExperience({kind:'praise',quote:'Ügyes vagy.'},[{speaker:'palor',text:'Szia.'}]),null);
  assert.equal(valid('help','Majd *segítek elpakolni.*'),null);
  assert.equal(valid('praise','Ügyes vagy.','character'),null);
  assert.equal(valid('attraction','Vonzódom hozzád.'),null,'player attraction is not the NPC’s');
  assert.equal(validateExperience({kind:'attraction',quote:'Vonzódom hozzád.'},[{speaker:'character',speaker_id:'guest:other',text:'Vonzódom hozzád.'}]),null);
  assert.equal(valid('help','Holnap *segítek elpakolni.*'),null);
  assert.equal(valid('praise','Nem igaz, hogy ügyes vagy.'),null);
  assert.ok(valid('help','*Segítek elpakolni.*'));
  assert.ok(valid('attraction','Vonzódom hozzád.','character'));
  assert.equal(valid('invented','Ügyes vagy.'),null);
});

test('unknown dimensions/knowledge abstain even under not; evidence scores saturate without changing canon',async t=>{
  assert.equal(evaluate({not:{dimension:'trust',character_id:'x',gte:1}},{dimensionOf:()=>null}),null);
  assert.equal(evaluate({not:{knowledge:'missing',character_id:'x'}},{knows:()=>null}),null);
  const w=await livingWorld(t),x=w.app.worldEngine.internals.experiences;
  const original=w.app.db.prepare('SELECT description FROM relationships WHERE source_id=?').all(w.a.id);
  for(let i=0;i<7;i++){
    const conv=await w.start('in_person','*Segítek elpakolni.*');
    w.control.summary={...w.control.summary,experiences:[{kind:'help',quote:'*Segítek elpakolni.*'}]};await w.end(conv);
  }
  assert.equal(x.state(w.a.id,w.palor.id).scores.trust,10);
  assert.equal(x.state(w.a.id,w.palor.id).scores.familiarity,7);
  assert.deepEqual(w.app.db.prepare('SELECT description FROM relationships WHERE source_id=?').all(w.a.id),original);
});

test('new migration makes an independently verified local backup of an existing database',async t=>{
  const w=await livingWorld(t);w.app.db.exec('DROP TABLE social_experiences');
  const file=await backupBeforeSocialExperiences(w.app.db,w.dataDir);
  const copy=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('SELECT count(*) n FROM characters').get().n,5);assert.ok(!copy.prepare("SELECT 1 FROM sqlite_master WHERE name='social_experiences'").get());}finally{copy.close();}
});

test('the same praise, criticism, rejection and help get different personal interpretations',()=>{
  const p=values=>({values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,entry(v)]))});
  const sensitive=p({recognition:9,attachment:9,security:9,expressiveness:9}),independent=p({recognition:2,attachment:2,autonomy:9,expressiveness:2});
  for(const kind of ['praise','criticism','rejection','help','boundary_respected'])assert.notEqual(appraiseEvent(sensitive,kind),appraiseEvent(independent,kind));
  assert.equal(experienceDeltas('criticism',sensitive).resentment,2);
  assert.equal(experienceDeltas('criticism',independent).resentment,1);
  assert.ok(!Object.hasOwn(experienceDeltas('praise',sensitive),'attraction'));
});

test('save point persists directed dimensions and provenance, repeats once, rewind/undo and export retain evidence',async t=>{
  const w=await livingWorld(t),x=w.app.worldEngine.internals.experiences;
  w.control.reply={...w.control.reply,reply:'Vonzódom hozzád.'};
  let conv=await w.start('in_person','*Segítek elpakolni.*');
  await w.turn(conv,'Ez hibás.');
  w.control.summary={...w.control.summary,experiences:[{kind:'help',quote:'*Segítek elpakolni.*'},{kind:'criticism',quote:'Ez hibás.'},{kind:'attraction',quote:'Vonzódom hozzád.'}]};
  w.setNow('2026-11-12T10:10:00');await w.end(conv);
  const event=w.event(conv),before=x.state(w.a.id,w.palor.id);
  assert.deepEqual(before.scores,{trust:1,loyalty:1,familiarity:1,resentment:2,attraction:1});
  assert.equal(before.evidence.length,3);assert.ok(before.evidence.every(e=>e.event_id===event.id&&e.memory_id&&e.line_id&&e.method==='social-experience-v1'));
  assert.deepEqual(x.state(w.palor.id,w.a.id).scores,{});
  await w.end(conv);assert.equal(x.state(w.a.id,w.palor.id).evidence.length,3,'idempotent save point');
  conv=await w.start('in_person','Folytassuk.');assert.match(w.requests.at(-1).user,/bizalom \+1.*sérelem \+2.*vonzalom \+1/);
  assert.match(w.requests.at(-1).user,/vonzalom ≠ bizalom vagy beleegyezés/);
  const detail=await w.call('/api/play/relationship/'+w.a.id);assert.deepEqual(detail.dimensions.scores,before.scores);
  const backup=await w.call('/api/export');assert.equal(backup.social_experiences.length,3);
  w.setNow('2026-11-12T10:20:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:05:00').toISOString()});
  assert.deepEqual(x.state(w.a.id,w.palor.id).scores,{});
  await w.call('/api/play/rewind/undo',{});assert.deepEqual(x.state(w.a.id,w.palor.id).scores,before.scores);
});

test('group save point attributes a directed action only to the named recipient',async t=>{
  const w=await livingWorld(t),quote='Teszt Aladár, ügyes vagy.';
  const g=await w.start('group',quote);
  w.control.summary={...w.control.summary,experiences:{'Teszt Aladár':[{kind:'praise',quote}],'Teszt Béla':[{kind:'praise',quote}]}};
  await w.end(g);
  assert.equal(w.app.worldEngine.internals.experiences.state(w.a.id,w.palor.id).evidence.length,1);
  assert.equal(w.app.worldEngine.internals.experiences.state(w.b.id,w.palor.id).evidence.length,0);
});
