import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';

test('first meeting with Palor becomes a proposed story event and relationship lines that append to owner text',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  let app,base;
  const start=async()=>{app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;};
  const call=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});return data;};
  try{
    await start();
    const palor=await call('/api/characters',{name:'Palor'}),guest=await call('/api/characters',{name:'Synthetic Guest'});
    const meet=(day,title)=>app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,seen_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),day,'meeting','applied',title,title+' summary',JSON.stringify({character_ids:[guest.id],with_palor:true}),'play',null,new Date().toISOString());
    meet('2026-11-12','Second talk');meet('2026-11-10','First talk');
    app.db.prepare('INSERT INTO relationships(id,source_id,target_id,description) VALUES(?,?,?,?)').run(randomUUID(),guest.id,palor.id,'Owner text stays first.');
    // Run the one-time catch-up again on restart.
    app.db.prepare("DELETE FROM application_settings WHERE key='first-meetings:backfilled'").run();
    await app.close();await start();
    const mine=(await call('/api/characters/'+guest.id+'/relationship-suggestions')).items;
    assert.equal(mine.length,1);assert.match(mine[0].text,/^Első találkozás \(2026-11-10\): First talk summary$/);
    assert.equal((await call('/api/characters/'+palor.id+'/relationship-suggestions')).items.length,1);
    const events=(await call('/api/characters/'+guest.id+'/timeline')).items;
    assert.equal(events.length,1);assert.equal(events[0].status,'proposed');
    // Accept appends, never rewrites; a second restart does not duplicate anything.
    await call('/api/relationship-suggestions/'+mine[0].id+'/decision',{decision:'accept'});
    assert.equal(app.db.prepare('SELECT description FROM relationships WHERE source_id=? AND target_id=?').get(guest.id,palor.id).description,'Owner text stays first.\n\n'+mine[0].text);
    await assert.rejects(call('/api/relationship-suggestions/'+mine[0].id+'/decision',{decision:'accept'}),/already decided/);
    app.db.prepare("DELETE FROM application_settings WHERE key='first-meetings:backfilled'").run();
    await app.close();await start();
    assert.equal((await call('/api/characters/'+guest.id+'/relationship-suggestions')).items.length,0);
    assert.equal((await call('/api/characters/'+guest.id+'/timeline')).items.length,1);
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
