import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {livingWorld} from './helpers/living-world.mjs';
const narration=(w,{at='2026-11-12T10:00:00',answer='Leírás, nem tény.',cid=w.a.id}={})=>{const id=randomUUID();w.app.db.prepare('INSERT INTO play_narrations VALUES(?,?,?,?,?,?)').run(id,null,cid,'Írd le.',answer,new Date(at).toISOString());return id;};

test('the actual narrator route stages a proposal while leaving the world unchanged',async t=>{
  const w=await livingWorld(t);
  w.control.narrator={answer:'Ezt csak javaslatként rögzítem.',proposed_facts:[{type:'world_event',title:'Egy megbeszélt esemény',summary:'Javasolt közös program.',character_ids:[w.a.id]}]};
  const before=w.app.db.prepare('SELECT count(*) n FROM world_events').get().n;
  const answer=await w.start('in_person','*Rendszer! Javasolj egy eseményt.*');
  assert.ok(JSON.stringify(answer).includes('javaslatként'));
  const {proposals}=await w.call('/api/play/facts');assert.equal(proposals.length,1);assert.equal(proposals[0].source_type,'narrator');
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM world_events').get().n,before);
});

test('narration only proposes; canon, unknown participants and player feelings never project',async t=>{
  const w=await livingWorld(t),g=w.app.worldEngine.internals.factGate,id=narration(w);
  const before=w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n;
  const staged=g.stage('narrator',id,[{type:'canon',appearance:'TILTOTT'},{type:'memory',character_id:w.outsider.id,text:'Nem volt ott.'},{type:'relationship_delta',source_id:w.palor.id,target_id:w.a.id,delta:1,reason:'Kitalált érzés.'},{type:'memory',character_id:w.a.id,text:'Elhangzott egy kérdés, nem beleegyezés.'}]);
  assert.deepEqual(staged.map(x=>x.status),['abstained','abstained','abstained','proposed']);
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n,before);
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM canon').get().n,0);
  const p=g.list()[0];await assert.rejects(w.call('/api/play/facts/'+p.id+'/approve',{source_hash:'wrong'}));
  const accepted=await w.call('/api/play/facts/'+p.id+'/approve',{source_hash:p.source_hash});assert.equal(accepted.canon_changed,false);
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n,before+1);
  await assert.rejects(w.call('/api/play/facts/'+p.id+'/approve',{source_hash:p.source_hash}));
});

test('changed narration invalidates pending facts; rejection requires no source rewriting',async t=>{
  const w=await livingWorld(t),g=w.app.worldEngine.internals.factGate,id=narration(w);
  g.stage('narrator',id,[{type:'memory',character_id:w.a.id,text:'Egy régi leírás.'}]);const p=g.list()[0];
  w.app.db.prepare('UPDATE play_narrations SET answer=? WHERE id=?').run('Új leírás.',id);
  assert.equal(g.list()[0].stale,true);await assert.rejects(w.call('/api/play/facts/'+p.id+'/approve',{source_hash:p.source_hash}));
  await w.call('/api/play/facts/'+p.id+'/reject',{source_hash:p.source_hash});assert.equal(g.list().length,0);
});

test('simulation gate is atomic, source-bound and idempotent; proposed events cannot apply',async t=>{
  const w=await livingWorld(t),g=w.app.worldEngine.internals.factGate;
  const insert=(status,payload)=>{const id=randomUUID();w.app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'2026-11-12','meeting',status,'Teszt','Teszt',JSON.stringify(payload),'mock',new Date('2026-11-12T10:00:00').toISOString());return id;};
  const payload={character_ids:[w.a.id,w.b.id],memories:[{character_id:w.a.id,text:'Bélával beszéltem.'}],level_changes:[{source_id:w.a.id,target_id:w.b.id,delta:1,reason:'Beszélgetés.'}]};
  assert.throws(()=>g.commitSimulation(insert('proposed',payload),'world_engine'));
  const id=insert('applied',payload),r=g.commitSimulation(id,'world_engine');assert.ok(r.memory_ids[w.a.id]);assert.equal(g.commitSimulation(id,'world_engine').memory_ids[w.a.id],r.memory_ids[w.a.id]);
  const before=w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n;
  assert.throws(()=>g.commitSimulation(insert('applied',{...payload,level_changes:[{...payload.level_changes[0],delta:99}]}),'world_engine'));
  assert.equal(w.app.db.prepare('SELECT count(*) n FROM character_memories').get().n,before,'invalid plan cannot partially write memories');
  w.app.db.prepare('UPDATE world_events SET payload_json=? WHERE id=?').run(JSON.stringify({...payload,memories:[]}),id);assert.throws(()=>g.commitSimulation(id,'world_engine'));
});

test('creator decision after a save point rewinds to pending, undo restores exactly once',async t=>{
  const w=await livingWorld(t),g=w.app.worldEngine.internals.factGate,id=narration(w);
  g.stage('narrator',id,[{type:'memory',character_id:w.a.id,text:'Egy forráshoz kötött emlék.'}]);const p=g.list()[0];
  w.setNow('2026-11-12T10:20:00');await w.call('/api/play/facts/'+p.id+'/approve',{source_hash:p.source_hash});
  w.setNow('2026-11-12T10:30:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});
  assert.equal(g.list().find(x=>x.id===p.id).status,'proposed');
  await w.call('/api/play/rewind/undo',{});assert.equal(g.list().length,0);
  assert.equal(w.app.db.prepare("SELECT count(*) n FROM character_memories WHERE text='Egy forráshoz kötött emlék.' AND status='approved'").get().n,1);
  const exported=await w.call('/api/export');assert.ok(exported.world_fact_commits.length);
  const restored=await createApp({...w.opts,dataDir:path.join(w.dataDir,'restored')});
  try{
    await new Promise(resolve=>restored.server.listen(0,'127.0.0.1',resolve));
    const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(exported)});
    assert.equal(response.status,200,await response.text());
    assert.deepEqual(restored.db.prepare('SELECT * FROM world_fact_commits ORDER BY id').all(),w.app.db.prepare('SELECT * FROM world_fact_commits ORDER BY id').all());
    assert.deepEqual(restored.db.prepare('SELECT * FROM world_fact_proposals ORDER BY id').all(),w.app.db.prepare('SELECT * FROM world_fact_proposals ORDER BY id').all());
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>restored.worldEngine.internals.factGate.approve(p.id,p.source_hash),'restored approvals cannot be applied twice');
  }finally{await restored.close();}
});

test('serious event approved later returns to proposed on rewind and restores on undo',async t=>{
  const w=await livingWorld(t),id=randomUUID();
  w.app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'2026-11-12','serious','proposed','Vita','Vita',JSON.stringify({character_ids:[w.a.id],memories:[{character_id:w.a.id,text:'Vita volt.'}],level_changes:[]}), 'mock',new Date('2026-11-12T10:00:00').toISOString());
  w.setNow('2026-11-12T10:20:00');w.app.worldEngine.decide(id,true);
  w.setNow('2026-11-12T10:30:00');await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});
  assert.equal(w.app.db.prepare('SELECT status FROM world_events WHERE id=?').get(id).status,'proposed');
  await w.call('/api/play/rewind/undo',{});assert.equal(w.app.db.prepare('SELECT status FROM world_events WHERE id=?').get(id).status,'accepted');
});
