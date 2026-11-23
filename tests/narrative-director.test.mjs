import {test} from 'node:test';
import assert from 'node:assert/strict';
import {livingWorld} from './helpers/living-world.mjs';
const source=id=>{
  const nodes={};for(let i=1;i<=6;i++)nodes['s'+i]={text:'Archivált szöveg '+i,choices:[{key:'A',text:'Első.',to:i===6?'e1':'s'+(i+1)},{key:'B',text:'Második.',to:i===6?'e2':'s'+(i+1)}]};
  nodes.e1={text:'Vége.',ending:'good'};nodes.e2={text:'Másik vége.',ending:'neutral'};
  return {id,title:'Archivált próbatörténet',setting:'kaloz',content:'everyday',start:'s1',nodes};
};
export {source as legacyStoryFixture};

for(const kind of ['konfliktus','titok','közeledés'])test('free narrative '+kind+': arbitrary text, existing IDs, persistence and no forced branch',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/settings',{story_mode:'narrative'});await w.call('/api/play/stories/import',{stories:[source('free-'+kind.normalize('NFD').replace(/\p{M}/gu,''))]});
  const started=await w.call('/api/play/stories/free-'+kind.normalize('NFD').replace(/\p{M}/gu,'')+'/play',{});
  assert.equal(started.story.mode,'narrative');const id=started.run_id;
  let view=await w.call('/api/play/narratives/'+id);assert.ok(view.context.cast.some(c=>c.id===w.a.id));assert.ok(!view.context.cast.some(c=>c.id===w.outsider.id));
  w.control.narrative={narration:'Aladár elgondolkodik.',replies:[{character_id:w.a.id,text:'Beszéljük meg.'},{character_id:'unknown',text:'Kitalált ember.'}],stakes:'Még nincs közös megoldás.',options:['Más megoldást ajánlok.','Időt kérek.','Rákérdezek az okára.'],proposed_facts:[{type:'canon',appearance:'TILTOTT'}]};
  const body={text:'Egy negyedik, teljesen saját megoldást ajánlok a '+kind+' helyzetre.',expected_version:view.version,request_key:'free-turn-'+kind};
  const before=w.requests.length;view=await w.call('/api/play/narratives/'+id+'/turn',body);
  assert.equal(view.version,2);assert.equal(view.state.replies.length,1);assert.equal(view.state.options.length,3);
  assert.ok(w.requests.at(-1).user.includes(body.text));assert.ok(!w.requests.at(-1).user.includes('PALOR-ADMIN-PRIVAT'));
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM canon').get().n,0,'narration cannot change appearance');
  await w.call('/api/play/narratives/'+id+'/turn',body);assert.equal(w.requests.length,before+1,'same request returns saved response without a call');
  w.setNow('2026-11-12T11:00:00');const finished=await w.call('/api/play/narratives/'+id+'/finish',{expected_version:2});assert.equal(finished.status,'finished');
  const log=(await w.call('/api/play/story-runs')).runs.find(r=>r.id===id);assert.equal(log.ending_kind,'narrative');
});

test('uncertain narrative call cannot be retried or resumed with another key',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/settings',{story_mode:'narrative'});await w.call('/api/play/stories/import',{stories:[source('uncertain-story')]});
  const s=await w.call('/api/play/stories/uncertain-story/play',{}),n=w.app.worldEngine.internals.narrative;
  w.control.narrative=Object.assign(Error('timeout'),{code:'AI_UNCERTAIN'});
  const body={text:'Beszéljünk.',expected_version:1,request_key:'uncertain-request'};await assert.rejects(n.turn(s.run_id,body));
  const calls=w.requests.length;await assert.rejects(n.turn(s.run_id,body));await assert.rejects(n.turn(s.run_id,{...body,request_key:'different-request'}));assert.equal(w.requests.length,calls);
  assert.equal(n.view(s.run_id).turns[0].status,'uncertain');
});

test('narrative rewind restores an earlier version and undo restores the finished scene',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/settings',{story_mode:'narrative'});await w.call('/api/play/stories/import',{stories:[source('rewind-story')]});const s=await w.call('/api/play/stories/rewind-story/play',{}),n=w.app.worldEngine.internals.narrative;
  w.control.narrative={narration:'Első lépés.',options:[]};w.setNow('2026-11-12T10:10:00');await n.turn(s.run_id,{text:'Első.',expected_version:1,request_key:'rewind-first'});
  w.setNow('2026-11-12T10:20:00');await n.turn(s.run_id,{text:'Második.',expected_version:2,request_key:'rewind-second'});n.finish(s.run_id,3);
  w.setNow('2026-11-12T11:00:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});
  assert.equal(n.view(s.run_id).version,2);assert.equal(n.view(s.run_id).status,'open');assert.equal(n.view(s.run_id).turns.length,1);
  assert.ok(!(await w.call('/api/play/story-runs')).runs.some(r=>r.id===s.run_id));
  await w.call('/api/play/rewind/undo',{});assert.equal(n.view(s.run_id).version,4);assert.equal(n.view(s.run_id).status,'finished');assert.equal(n.view(s.run_id).turns.length,2);
});

test('written A–D story by default; a free answer continues it as a free-text scene (owner, 2026-11-22)',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/stories/import',{stories:[source('mixed-story')]});
  const started=await w.call('/api/play/stories/mixed-story/play',{});
  assert.notEqual(started.story.mode,'narrative','random stories are the written graph by default');assert.ok(started.story.nodes.s1);
  w.control.narrative={narration:'A jelenet folytatódik.',replies:[],stakes:'',options:['Tovább.','Vissza.','Várok.'],proposed_facts:[]};
  const free=await w.call('/api/play/story-runs/'+started.run_id+'/free',{text:'Saját választ írok.',path:['s1','s2'],request_key:'free-answer-1'});
  assert.equal(free.story.mode,'narrative');assert.deepEqual(free.story.narrative.context.cast,[],'the story scene does not pull in the characters at Palor\'s current place');assert.equal(free.story.opening,'Archivált szöveg 2');assert.equal(free.story.narrative.version,2);
  const user=w.requests.at(-1).user;assert.ok(user.includes('Saját választ írok.'));assert.ok(user.includes('Archivált szöveg 1')&&user.includes('Palor választása: Első.'),'the story so far goes to the scene');
  const again=await w.call('/api/play/story-runs/'+started.run_id+'/free',{text:'Még egy.',path:['s1'],request_key:'free-answer-2'}).catch(e=>e);
  assert.ok(again instanceof Error||again.status>=400||again.error,'a run switches to a free scene only once');
});

test('a free answer that fits the written story returns to the written path; a free scene can lead back too (owner, 2026-11-22)',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/stories/import',{stories:[source('rejoin-story')]});
  const s=await w.call('/api/play/stories/rejoin-story/play',{});
  w.control.narrative={node:'s4',bridge:'Palor a saját útját járja, és ugyanoda jut.'};
  const fit=await w.call('/api/play/story-runs/'+s.run_id+'/free',{text:'Ugyanazt teszem, csak a magam módján.',path:['s1','s2'],request_key:'rejoin-1'});
  assert.equal(fit.rejoin,'s4');assert.equal(fit.bridge,'Palor a saját útját járja, és ugyanoda jut.');
  assert.ok(!w.app.db.prepare('SELECT 1 FROM narrative_runs WHERE id=?').get(s.run_id),'no free scene was opened');
  w.control.narrative={node:'s1',bridge:'vissza',narration:'A jelenet szabadon folytatódik.',replies:[],stakes:'',options:[],proposed_facts:[]};
  const back=await w.call('/api/play/story-runs/'+s.run_id+'/free',{text:'Visszafelé.',path:['s1','s2','s4'],request_key:'rejoin-2'});
  assert.equal(back.story.mode,'narrative','an already visited block is never a rejoin target');
  assert.ok(back.story.narrative.context.story_nodes.some(n=>n.id==='s5'));
  w.control.narrative={narration:'A jelenet visszatér a megírt útra.',replies:[],stakes:'',options:[],rejoin:'s5',proposed_facts:[]};
  const turned=await w.call('/api/play/narratives/'+s.run_id+'/turn',{text:'Továbbmegyek.',expected_version:back.story.narrative.version,request_key:'rejoin-3'});
  assert.equal(turned.state.rejoin,'s5');
  await w.call('/api/play/narratives/'+s.run_id+'/finish',{expected_version:turned.version,resume:true});
  const done=await w.call('/api/play/story-runs/'+s.run_id+'/finish',{path:['s1','s2','s4','s5','s6','e1'],ending:'e1'});
  assert.equal(done.ending,'good','the written story finishes after the free scene');
});
