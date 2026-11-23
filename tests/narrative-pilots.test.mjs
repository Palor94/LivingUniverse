import {test} from 'node:test';
import assert from 'node:assert/strict';
import {livingWorld,entry} from './helpers/living-world.mjs';
import {narrativePilots} from './fixtures/narrative-pilots.mjs';
import {SLOTS} from '../app/world-common.mjs';
import {createApp} from '../app/server.mjs';
import path from 'node:path';

for(const pilot of narrativePilots)for(const choice of pilot.choices)test(pilot.title+' / '+choice.kind,async t=>{
  const w=await livingWorld(t),x=w.app.worldEngine.internals.experiences;
  const opening=await w.call('/api/play/hidden-events',{title:pilot.title,brief:pilot.brief,private:pilot.private,condition:{day_gte:'2026-11-12'},character_ids:[w.a.id],approve:true});
  const callbacks=[];
  for(const c of pilot.choices)callbacks.push(await w.call('/api/play/hidden-events',{title:pilot.id+' '+c.kind,brief:c.callback,private:pilot.private,condition:{all:[{revealed:opening.id,slots_since_gte:4},{dimension:c.dimension,character_id:w.a.id,gte:c.gte}]},character_ids:[w.a.id],approve:true}));
  w.setNow('2026-11-12T10:10:00');
  w.control.reply={...w.control.reply,choices:pilot.choices.map(c=>c.text)};
  const conv=await w.start('in_person',choice.text);
  assert.ok(w.requests.at(-1).user.includes(pilot.brief));
  assert.equal(conv.choices.length,3,'normal free-text talk has three suggestions, no forced A/B route');
  w.control.summary={...w.control.summary,title:pilot.title,summary:choice.text,experiences:[{kind:choice.kind,quote:choice.text}]};
  w.setNow('2026-11-12T10:20:00');await w.end(conv);
  const source=w.event(conv);assert.equal(!!JSON.parse(source.payload_json).private,pilot.private,'owner privacy survives an omitted model flag');
  assert.ok(x.state(w.a.id,w.palor.id).scores[choice.dimension]>=choice.gte);
  assert.ok(!Object.hasOwn(x.state(w.a.id,w.palor.id).scores,'attraction'),'kindness, help and refusal never force attraction');
  assert.deepEqual(x.state(w.palor.id,w.a.id).scores,{},'player feelings are not invented');
  w.setNow('2026-11-13T10:10:00');
  await w.start('in_person','Mi maradt benned a tegnapból?');
  assert.ok(w.requests.at(-1).user.includes(choice.callback),'a later session gets the consequence of the actual free-text action');
  const opened=(await w.call('/api/play/hidden-events')).events.filter(e=>callbacks.some(c=>c.id===e.id)&&e.revealed);
  assert.equal(opened.length,1);assert.equal(opened[0].id,callbacks[pilot.choices.indexOf(choice)].id);
  if(pilot.private){
    await w.call('/api/world-engine/levels',{source_id:w.a.id,target_id:w.b.id,level:1});
    w.control.worldEvents=[{kind:'meeting',title:'Privát történet utáni találkozó',summary:'Aladár és Béla kávéznak.',character_ids:[w.a.id,w.b.id],location_id:w.cafe.id}];
    await w.app.worldEngine.simulateDay('2026-11-13',SLOTS[1]);
    assert.ok(w.app.db.prepare("SELECT 1 FROM world_events WHERE title='Privát történet utáni találkozó' AND status='applied'").get());
    assert.equal(w.app.db.prepare('SELECT count(*) n FROM world_knowledge WHERE event_id=?').get(source.id).n,0);
    await w.start('phone','Szia!',w.b.id);assert.ok(!w.requests.at(-1).user.includes(pilot.brief));
  }
  w.setNow('2026-11-13T12:00:00');
  await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:05:00').toISOString()});
  assert.deepEqual(x.state(w.a.id,w.palor.id).scores,{});
  assert.ok((await w.call('/api/play/hidden-events')).events.every(e=>!e.revealed));
  await w.call('/api/play/rewind/undo',{});
  assert.ok(x.state(w.a.id,w.palor.id).scores[choice.dimension]>=choice.gte);
});

test('full consequence chain: witnessed deed -> world meeting -> relay -> personal reaction -> later scene -> rewind',async t=>{
  const w=await livingWorld(t),engine=w.app.worldEngine,x=engine.internals.experiences;
  // A knows the deed firsthand; B and C have not heard it.
  const conv=await w.start('in_person','*Segítek elpakolni.*');
  w.control.summary={...w.control.summary,title:'Konkrét segítség',summary:'*Segítek elpakolni.*',experiences:[{kind:'help',quote:'*Segítek elpakolni.*'}]};
  w.setNow('2026-11-12T10:10:00');await w.end(conv);const source=w.event(conv);
  assert.equal(engine.internals.social.knownEvents(w.c.id,'2026-11-12').some(e=>e.id===source.id),false);
  const callback=await w.call('/api/play/hidden-events',{title:'A hír visszatér',brief:'HIR-KOVETKEZMENY: Csaba megkérdezi Palort a segítségről, amit hallott; nem állítja, hogy látta.',condition:{all:[{day_gte:'2026-11-13'},{knowledge:source.id,character_id:w.c.id}]},character_ids:[w.c.id],approve:true});
  for(const [a,b] of [[w.a,w.b],[w.b,w.c]])await w.call('/api/world-engine/levels',{source_id:a.id,target_id:b.id,level:1});
  const round=async(day,slot,a,b,title)=>{
    w.control.worldEvents=[{kind:'meeting',title,summary:'Beszélgetnek munka után.',character_ids:[a.id,b.id],location_id:w.cafe.id}];
    const result=await engine.simulateDay(day,slot);assert.ok(result);
  };
  w.setNow('2026-11-12T14:00:00');await round('2026-11-12',SLOTS[1],w.a,w.b,'Műszakvégi egyeztetés');
  let k=w.app.db.prepare('SELECT * FROM world_knowledge WHERE event_id=? AND character_id=?').get(source.id,w.b.id);
  assert.equal(k.via_character_id,w.a.id);
  assert.ok(!w.app.db.prepare('SELECT 1 FROM world_knowledge WHERE event_id=? AND character_id=?').get(source.id,w.c.id));
  w.setNow('2026-11-13T10:00:00');await round('2026-11-13',SLOTS[0],w.b,w.c,'Reggeli szerszámellenőrzés');
  k=w.app.db.prepare('SELECT * FROM world_knowledge WHERE event_id=? AND character_id=?').get(source.id,w.c.id);
  assert.equal(k.via_character_id,w.b.id);assert.equal(k.world_day,'2026-11-13');
  assert.deepEqual(x.state(w.b.id,w.palor.id).scores,{},'hearsay does not change directed trust');
  assert.deepEqual(x.state(w.c.id,w.palor.id).scores,{});
  const b=x.prompt(w.b.id),c=x.prompt(w.c.id);assert.match(b,/önállóságát/);assert.ok(!c.includes('önállóságát'));
  await w.start('in_person','Szia!',w.c.id);
  const prompt=w.requests.at(-1).user;assert.match(prompt,/hallottad Teszt Béla elbeszéléséből, nem saját élmény/);assert.match(prompt,/HIR-KOVETKEZMENY/);
  assert.ok((await w.call('/api/play/hidden-events')).events.find(e=>e.id===callback.id).revealed);
  w.setNow('2026-11-13T12:00:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM world_knowledge WHERE event_id=? AND rewound_at IS NULL').get(source.id).n,0);
  assert.equal(x.prompt(w.c.id),'');assert.equal(x.state(w.a.id,w.palor.id).scores.trust,2,'the earlier firsthand event survives');
  await w.call('/api/play/rewind/undo',{});assert.match(x.prompt(w.c.id),/hallottad Teszt Béla/);
  const snapshot=await w.call('/api/export');
  const fresh=await createApp({...w.opts,dataDir:path.join(w.dataDir,'restore-check')});
  try{
    await new Promise(r=>fresh.server.listen(0,'127.0.0.1',r));
    const restored=await fetch('http://127.0.0.1:'+fresh.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
    assert.equal(restored.status,200,await restored.text());
    assert.deepEqual(fresh.worldEngine.internals.experiences.state(w.a.id,w.palor.id).scores,x.state(w.a.id,w.palor.id).scores);
    assert.match(fresh.worldEngine.internals.experiences.prompt(w.c.id),/hallottad Teszt Béla/);
    assert.equal(fresh.db.prepare('SELECT via_character_id FROM world_knowledge WHERE event_id=? AND character_id=?').get(source.id,w.c.id).via_character_id,w.b.id);
    assert.equal(fresh.worldEngine.internals.hiddenEvents.list().find(e=>e.id===callback.id).revealed.character_id,w.c.id);
  }finally{await fresh.close();}
});
