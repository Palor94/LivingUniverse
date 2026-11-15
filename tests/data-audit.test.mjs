// Data integrity audit (debugging package, 2026-11-13) on synthetic data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';

test('the audit finds orphans and contradictions, and repairs only with confirmation',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-audit-'));let app;
  try{
    app=await createApp({root:temp,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,imageGeneration:{}});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+app.server.address().port;
    const post=(p,b)=>fetch(origin+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
    const {db}=app,now=new Date().toISOString(),gone=randomUUID(),ghost=randomUUID(),cid=randomUUID(),loc=randomUUID();
    // Orphans arise in tables without foreign keys and from older data: simulated with checks off.
    db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO characters(id,name,aliases,biography,personality,appearance,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(cid,'Teszt Elek','[]','','','','',now);
    db.prepare('INSERT INTO media_notes(media_id,tags,notes) VALUES(?,?,?)').run(gone,'','');
    db.prepare('INSERT INTO media_notes(media_id,tags,notes) VALUES(?,?,?)').run('sprite:'+gone,'','');
    db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),cid,ghost,'régi');
    db.prepare("INSERT INTO play_conversations(id,character_id,location_id,channel,world_day,slot,status,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),ghost,loc,'in_person',1,1,'open',now);
    db.prepare('INSERT INTO application_settings VALUES(?,?)').run('play:room-exits:no-such-node',JSON.stringify({exits:{}}));
    db.exec('PRAGMA foreign_keys=ON');

    const audit=await (await fetch(origin+'/api/dev/audit')).json();
    const count=id=>audit.checks.find(c=>c.id===id).count;
    assert.equal(count('media_rows'),2,'a media row and a sprite row for things that do not exist');
    assert.equal(count('relationships'),1);
    assert.equal(count('conversations'),1);
    assert.equal(count('room_exits'),1);
    assert.equal(count('depictions_media'),0);
    assert.ok(audit.checks.every(c=>!c.error),JSON.stringify(audit.checks.filter(c=>c.error)));

    assert.equal((await post('/api/dev/audit/repair',{check:'media_rows'})).status,400,'needs confirm:true');
    assert.equal((await post('/api/dev/audit/repair',{check:'tree_location',confirm:true})).status,400,'findings-only checks cannot be repaired');
    const fixed=await (await post('/api/dev/audit/repair',{check:'media_rows',confirm:true})).json();
    assert.deepEqual([fixed.found,fixed.changed],[2,2]);
    const closed=await (await post('/api/dev/audit/repair',{check:'conversations',confirm:true})).json();
    assert.equal(closed.changed,1);
    assert.equal(db.prepare("SELECT count(*) n FROM play_conversations WHERE status='open'").get().n,0,'closed, not deleted');
    assert.equal(db.prepare('SELECT count(*) n FROM play_conversations').get().n,1);
    assert.equal((await post('/api/dev/audit/repair',{check:'media_rows',confirm:true})).status,409,'nothing left');
    assert.equal(db.prepare('SELECT count(*) n FROM characters').get().n,1,'characters untouched');
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
