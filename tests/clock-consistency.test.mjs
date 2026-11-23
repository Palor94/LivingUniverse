import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {livingWorld} from './helpers/living-world.mjs';
import {createGameClock} from '../app/game-clock.mjs';
import {createApp} from '../app/server.mjs';

test('clock reads committed state after rollback and refuses corrupt persisted data',()=>{
  const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT)');const real=new Date('2026-11-23T10:00:00Z'),c=createGameClock({one:(s,...a)=>db.prepare(s).get(...a),run:(s,...a)=>db.prepare(s).run(...a),realNow:()=>real});
    db.exec('BEGIN');c.advance(60,'test');assert.equal(c.now().getTime(),real.getTime()+3600_000);db.exec('ROLLBACK');assert.equal(c.now().getTime(),real.getTime());
    for(const raw of ['bad-json','null','{"offset_ms":"100"}','{"offset_ms":1e300}']){db.prepare('INSERT OR REPLACE INTO application_settings VALUES(?,?)').run('world:clock',raw);assert.throws(()=>c.now(),{code:'CLOCK_STATE_INVALID'});assert.equal(db.prepare('SELECT value FROM application_settings').get().value,raw);}
  }finally{db.close();}
});

test('rewind moves the actual clock, undo restores it, and earlier-timestamp branch writes block undo',async t=>{
  const w=await livingWorld(t);w.setNow('2026-11-12T10:30:00');
  await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});assert.equal((await w.call('/api/play')).clock.time,'10:15');
  w.setNow('2026-11-12T10:30:16');await w.call('/api/play');
  await w.call('/api/play/rewind/undo',{});assert.equal((await w.call('/api/play')).clock.time,'10:30');
  await w.call('/api/play/rewind',{time:new Date('2026-11-12T10:15:00').toISOString()});w.setNow('2026-11-12T10:31:16');assert.equal((await w.call('/api/play')).clock.time,'10:16');
  w.app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),'2026-11-12','everyday','applied','Új ág','Új esemény','{"character_ids":[]}','mock',new Date('2026-11-12T10:16:00').toISOString());
  await assert.rejects(w.call('/api/play/rewind/undo',{}));
});

test('restoring after a clock read immediately uses the imported clock, without restarting',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/wait',{until:'minutes',minutes:60});const snapshot=await w.call('/api/export'),restored=await createApp({...w.opts,dataDir:path.join(w.dataDir,'clock-restore')});
  try{await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+restored.server.address().port;
    assert.equal((await fetch(origin+'/api/play').then(r=>r.json())).clock.time,'10:00');
    const response=await fetch(origin+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200,await response.text());assert.equal((await fetch(origin+'/api/play').then(r=>r.json())).clock.time,'11:00');
  }finally{await restored.close();}
});

test('creator schedule and whereabouts requests do not resume play or wake world rounds',async t=>{
  const w=await livingWorld(t);await w.call('/api/play/wait',{until:'minutes',minutes:15});let activity=0;w.app.worldEngine.notePlay=()=>{activity++;return false;};
  const clockValue=()=>w.app.db.prepare("SELECT value FROM application_settings WHERE key='world:clock'").get()?.value;
  const before=clockValue();w.setNow('2026-11-12T10:30:00');
  await w.call('/api/play/whereabouts');await w.call('/api/play/schedules/'+w.a.id);await w.call('/api/play/schedules/'+w.a.id,{grid:{},flexible:true});
  assert.equal(activity,0);assert.equal(clockValue(),before);
  await w.call('/api/play');assert.equal(activity,1,'actual Play still records activity');assert.notEqual(clockValue(),before);
});
