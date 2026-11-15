import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

// Owner (2026-11-12): until development is finished the world lives only while he plays.
test('"only while I play": no round without play, a round when the play screen is used, the break is skipped',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-while-playing-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  let real=new Date(2026,10,12,10,0);
  try{
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>real});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;};
    await api('/api/characters',{name:'Palor'});
    const we=app.worldEngine;
    // An earlier session left the clock two days back.
    we.writeSettings({...we.settings(),enabled:false,last_day:'2026-11-10',last_slot:3});
    await api('/api/world-engine/settings',{while_playing:true});
    await assert.rejects(api('/api/world-engine/settings',{while_playing:'yes'}),{status:400});
    // Not playing: the scheduler check does nothing.
    assert.equal(await we.maybeRun(),null);assert.equal(we.settings().last_day,'2026-11-10');
    assert.equal((await api('/api/world-engine')).playing,false);
    // Opening the play screen starts a session: the two missed days are skipped, today's due part runs.
    await api('/api/play');
    await new Promise(r=>setTimeout(r,200));
    const s=we.settings();assert.equal(s.last_day,'2026-11-12');assert.equal(s.resumed.from_day,'2026-11-10');
    assert.equal((await api('/api/world-engine')).playing,true);
    // 30 minutes after the last action it no longer counts as playing.
    real=new Date(2026,10,12,10,31);assert.equal((await api('/api/world-engine')).playing,false);
    real=new Date(2026,10,12,13,0);assert.equal(await we.maybeRun(),null,'the afternoon is due, but nobody plays');
    // Switching the mode off: playing changes nothing.
    await api('/api/world-engine/settings',{while_playing:false});await api('/api/play');assert.equal(await we.maybeRun(),null);
    assert.equal(we.settings().enabled,false,'the engine itself stays off');
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
