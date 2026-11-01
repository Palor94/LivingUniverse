import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {planPathMigration,applyPathMigration} from '../app/path-migration.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT UNIQUE,folder TEXT);
 CREATE TABLE mcp_changes(id TEXT PRIMARY KEY,status TEXT,expires_at TEXT,payload TEXT);
 CREATE TABLE mcp_reference_changes(id TEXT PRIMARY KEY,status TEXT,expires_at TEXT,payload TEXT);
 CREATE TABLE image_generation_runs(id TEXT PRIMARY KEY,status TEXT,expires_at TEXT,manifest_json TEXT);
 CREATE TABLE canon(id TEXT PRIMARY KEY,references_json TEXT);`);
 db.prepare('INSERT INTO media VALUES(?,?,?)').run('source','folder\\image.png','folder');
 db.prepare('INSERT INTO canon VALUES(?,?)').run('synthetic-canon','[]');
 return db;
}

test('offline migration preserves expired approval evidence without treating it as an executable grant',()=>{
 const db=fixture();try{
  for(const table of ['mcp_changes','mcp_reference_changes','image_generation_runs']){
   for(const status of ['pending','approved'])db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`).run(table+'-'+status,status,'2000-01-01T00:00:00.000Z','immutable historical payload');
  }
  const before=Object.fromEntries(['mcp_changes','mcp_reference_changes','image_generation_runs','canon'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const plan=planPathMigration(db,{platform:'linux'});
  assert.deepEqual(plan.blockers,[]);
  assert.equal(plan.changes.length,1);
  applyPathMigration(db,plan);
  assert.equal(db.prepare('SELECT relative_path FROM media').get().relative_path,'folder/image.png');
  for(const [table,rows] of Object.entries(before))assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),rows);
 }finally{db.close();}
});

test('unexpired and malformed approvals and uncertain outcomes still block path conversion without writes',()=>{
 for(const [table,status,expiry] of [
  ['mcp_changes','pending','2999-01-01T00:00:00.000Z'],
  ['mcp_reference_changes','approved','2999-01-01T00:00:00.000Z'],
  ['image_generation_runs','approved','2999-01-01T00:00:00.000Z'],
  ['mcp_changes','pending',null],
  ['image_generation_runs','pending','invalid-expiry'],
  ['image_generation_runs','uncertain','2000-01-01T00:00:00.000Z'],
  ['image_generation_runs','running','2000-01-01T00:00:00.000Z'],
  ['image_generation_runs','generated','2000-01-01T00:00:00.000Z']
 ]){
  const db=fixture();try{
   db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`).run('blocked',status,expiry,'protected evidence');
   const plan=planPathMigration(db,{platform:'linux'});
   assert.deepEqual(plan.blockers,[{table,count:1,code:'RECONCILE_BEFORE_PATH_MIGRATION'}]);
   assert.throws(()=>applyPathMigration(db,plan),/blocked/);
   assert.equal(db.prepare('SELECT relative_path FROM media').get().relative_path,'folder\\image.png');
  }finally{db.close();}
 }
});

test('explicit terminal-outcome preservation is hash-bound and retains uncertain evidence without unlocking other work',()=>{
 const db=fixture();try{
  db.prepare('INSERT INTO image_generation_runs VALUES(?,?,?,?)').run('synthetic-uncertain','uncertain','2000-01-01T00:00:00.000Z','immutable unknown-outcome receipt');
  const before=db.prepare('SELECT * FROM image_generation_runs').all();
  assert.equal(planPathMigration(db,{platform:'linux'}).blockers.length,1);
  const plan=planPathMigration(db,{platform:'linux',preserveUncertain:true});
  assert.deepEqual(plan.blockers,[]);
  assert.equal(plan.preserved_uncertain_outcomes.length,1);
  assert.throws(()=>applyPathMigration(db,{...plan,preserve_terminal_uncertain:false}),/Stale/);
  db.prepare('INSERT INTO mcp_changes VALUES(?,?,?,?)').run('still-live','approved','2999-01-01T00:00:00.000Z','not approved by migration');
  assert.equal(planPathMigration(db,{platform:'linux',preserveUncertain:true}).blockers.length,1);
  db.prepare('DELETE FROM mcp_changes WHERE id=?').run('still-live');
  applyPathMigration(db,plan);
  assert.deepEqual(db.prepare('SELECT * FROM image_generation_runs').all(),before);
  assert.equal(db.prepare('SELECT relative_path FROM media').get().relative_path,'folder/image.png');
 }finally{db.close();}
});
