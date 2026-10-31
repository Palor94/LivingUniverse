import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';

async function fixture(t){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-canon-approval-'));
  const root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(database)};
  const app=await createApp({root,dataDir,mcpWrites:config});
  t.after(async()=>{await app.close();assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(route,data)=>{const response=await fetch(base+route,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:response.status,data:await response.json()};};
  const call=async(...args)=>{const response=await request(...args);assert.equal(response.status,200,JSON.stringify(response));return response.data;};
  const cid=randomUUID(),mid=randomUUID(),now=new Date().toISOString();
  const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoaGgAAAMEAYEezv+mAAAAAElFTkSuQmCC','base64');
  await fs.writeFile(path.join(root,'fixture.png'),original);
  app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Canon fixture',now);
  app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'fixture.png','','image',original.length,now,now);
  app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);
  const writeConfig=path.join(dataDir,'mcp-writes.json');await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:base}));
  const writer=await createWriteClient({database,writeConfig});
  return {app,root,temp,mid,cid,original,request,call,writer,route:'/api/characters/'+cid+'/canon'};
}
const approval=(mid,expected_revision_id=null,expected_references=[],role='face')=>({appearance:'Approved appearance',references:[{media_id:mid,role}],reason:'Explicit fixture approval',expected_revision_id,expected_references});

test('canon approvals reject missing or malformed comparison snapshots without a server error or write',async t=>{
  const f=await fixture(t),valid=approval(f.mid),missing={appearance:valid.appearance,references:valid.references};
  for(const data of [missing,{...valid,expected_revision_id:undefined},{...valid,expected_revision_id:42},{...valid,expected_references:undefined},{...valid,expected_references:null},{...valid,expected_references:{}},{...valid,expected_references:[null]},{...valid,expected_references:[{media_id:f.mid,role:'face',sha256:7}]}]){
    const result=await f.request(f.route,data);assert.equal(result.status,400,JSON.stringify(result));assert.match(result.data.error,/expected_revision_id|expected_references/);
    assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
  }
  assert.equal((await f.request(f.route,valid)).status,200);
});

test('canon comparisons reject stale and concurrent reference-only approvals even when the revision ID stays the same',async t=>{
  const f=await fixture(t),first=await f.call(f.route,approval(f.mid)),refs=JSON.parse(first.references_json);
  const changed=await f.call(f.route,approval(f.mid,first.id,refs,'body'));
  assert.equal(changed.id,first.id);assert.equal(changed.appearance,first.appearance);
  assert.equal((await f.request(f.route,approval(f.mid,first.id,refs,'detail'))).status,409);
  assert.equal((await f.request(f.route,{...approval(f.mid),appearance:'Overwrite existing'})).status,409);
  const current=JSON.parse(changed.references_json);
  const concurrent=await Promise.all(['face','detail'].map(role=>f.request(f.route,approval(f.mid,changed.id,current,role))));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,1);
  const saved=f.app.db.prepare('SELECT * FROM canon').get(),appearance=await f.call(f.route,{...approval(f.mid,saved.id,JSON.parse(saved.references_json)),appearance:'New explicitly approved appearance'});
  assert.notEqual(appearance.id,first.id);assert.equal(appearance.parent_id,first.id);
  assert.equal(f.app.db.prepare('SELECT appearance FROM canon WHERE id=?').get(first.id).appearance,first.appearance);
  assert.equal((await f.request(f.route,approval(f.mid,saved.id,JSON.parse(saved.references_json)))).status,409);
});

test('same-revision reference removal scrubs proposal copies and explanations, preserves other characters and survives export/restore',async t=>{
  const f=await fixture(t),first=await f.call(f.route,approval(f.mid)),other=randomUUID(),now=new Date().toISOString();
  f.app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(other,'Other fixture',now);
  f.app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(f.mid,other);
  const otherCanon=await f.call('/api/characters/'+other+'/canon',approval(f.mid));
  const proposal=(await f.writer.call('propose_reference_update',{request_key:randomUUID(),character_id:f.cid,expected_revision_id:first.id,references:[{media_id:f.mid,role:'body'}],reason:'Private reference explanation'})).data;
  const cleared=await f.call(f.route,{...approval(f.mid,first.id,JSON.parse(first.references_json)),references:[]});
  assert.equal(cleared.id,first.id);assert.equal(cleared.appearance,first.appearance);assert.equal(cleared.reason,'Reference data removed by creator');
  const row=f.app.db.prepare('SELECT * FROM mcp_reference_changes WHERE id=?').get(proposal.change_id),payload=JSON.parse(row.payload_json);
  assert.equal(row.status,'conflict');assert.deepEqual(payload.before,[]);assert.deepEqual(payload.after,[]);assert.equal(payload.reason,'');
  await assert.rejects(f.writer.call('apply_approved_reference_change',{change_id:proposal.change_id}));
  assert.deepEqual(f.app.db.prepare('SELECT * FROM canon WHERE id=?').get(otherCanon.id),Object.assign(Object.create(null),otherCanon));
  assert.deepEqual(await fs.readFile(path.join(f.root,'fixture.png')),f.original);
  const backup=await f.call('/api/export'),restored=await createApp({root:f.root,dataDir:path.join(f.temp,'restore')});
  try{
    await new Promise(resolve=>restored.server.listen(0,'127.0.0.1',resolve));
    const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});assert.equal(response.status,200);
    assert.deepEqual(restored.db.prepare('SELECT id,appearance,references_json FROM canon ORDER BY id').all(),f.app.db.prepare('SELECT id,appearance,references_json FROM canon ORDER BY id').all());
    assert.deepEqual(restored.db.prepare('SELECT payload_json,status FROM mcp_reference_changes').all(),f.app.db.prepare('SELECT payload_json,status FROM mcp_reference_changes').all());
    assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await restored.close();}
});
