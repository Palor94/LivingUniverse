import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createGameClock,MAX_STEP_MINUTES} from '../app/game-clock.mjs';
import {createApp} from '../app/server.mjs';

function store(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT)');return {db,one:(s,...a)=>db.prepare(s).get(...a),run:(s,...a)=>db.prepare(s).run(...a)};}

test('game clock: real time runs on, actions add time, waiting and sleeping jump to the right moment',()=>{
  const s=store();let real=new Date(2026,10,12,10,30);
  const c=createGameClock({...s,realNow:()=>real});
  assert.equal(c.now().getTime(),real.getTime(),'starts at real time');
  c.advance(25,'travel');assert.equal(c.now().getTime()-real.getTime(),25*60_000);
  real=new Date(2026,10,12,11,0);assert.equal(c.now().getHours(),11,'real time keeps running');assert.equal(c.now().getMinutes(),25);
  assert.equal(c.toNextSlot(),35,'11:25 → 12:00 (délután)');
  c.advance(c.toNextSlot(),'wait');assert.equal(c.now().getHours(),12);
  c.advance(c.toMorning(),'sleep');assert.equal(c.now().getHours(),7);assert.equal(c.now().getDate(),13);
  // Night: before 06:00 the next part is the morning of the same date.
  real=new Date(2026,10,12,23,0);const n=createGameClock({...store(),realNow:()=>real});
  n.advance(240,'wait');assert.equal(n.now().getHours(),3);assert.equal(n.toNextSlot(),180);
  // Never backwards, never a giant jump; the state survives a restart.
  assert.equal(c.advance(-30).advanced,0);assert.equal(c.advance(99999).advanced,MAX_STEP_MINUTES);
  const again=createGameClock({...s,realNow:()=>real});assert.equal(again.info().offset_minutes,c.info().offset_minutes);
});

test('waiting moves the play clock; the AI cost cap still counts real days',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-clock-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  const real=new Date(2026,10,12,10,0);
  try{
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,worldClock:()=>real});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;};
    await api('/api/characters',{name:'Palor'});
    assert.equal((await api('/api/play')).clock.slot_index,0,'10:00 is morning');
    const w=await api('/api/play/wait',{until:'next_slot'});assert.equal(w.advanced,120);assert.equal(w.clock.slot_index,1);
    const s=await api('/api/play/wait',{until:'morning'});assert.equal(s.clock.slot_index,0);assert.equal(s.clock.day,'2026-11-13');
    assert.equal((await api('/api/play')).clock.day,'2026-11-13','the whole play screen follows the game clock');
    await assert.rejects(api('/api/play/wait',{until:'forever'}),{status:400});
    // Cost is still booked on the real day.
    app.db.prepare("INSERT INTO world_usage(day,calls,input_tokens,output_tokens,cost_usd) VALUES('2026-11-12',1,0,0,0.5)").run();
    assert.equal((await api('/api/world-engine')).spent_today_usd,0.5,'game time is a day ahead; the cap still sees today\'s real spending');
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
