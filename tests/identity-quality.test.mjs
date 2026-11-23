import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installIdentityQuality,qualityCrop,qualitySimilarity,BODY_QUALITY_METHOD} from '../app/identity-quality.mjs';
import {bodyBenchmarkPairs} from '../app/run-body-quality-benchmark.mjs';

test('face/body review remains separate, fingerprint/revision bound, attributed and never canon',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'lu-quality-')),db=new DatabaseSync(':memory:');
  t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
  db.exec('CREATE TABLE characters(id TEXT PRIMARY KEY); CREATE TABLE media(id TEXT PRIMARY KEY,kind TEXT); CREATE VIEW active_media AS SELECT * FROM media; CREATE TABLE canon(id TEXT,character_id TEXT,references_json TEXT); CREATE TABLE depictions(media_id TEXT,character_id TEXT)');
  db.prepare("INSERT INTO characters VALUES('c')").run();
  const hash=s=>createHash('sha256').update(s).digest('hex');
  for(const id of ['ref','target']){await writeFile(path.join(dir,id),id);db.prepare("INSERT INTO media VALUES(?,'image')").run(id);db.prepare("INSERT INTO depictions VALUES(?,'c')").run(id);}
  const refs=['face','body'].map(role=>({media_id:'ref',role,reference_id:role,sha256:hash('ref')}));db.prepare('INSERT INTO canon VALUES(?,?,?)').run('v1','c',JSON.stringify(refs));
  let faces=1,refFaces=null;const analyse=async({file,body})=>({faces:path.basename(file)==='ref'&&refFaces!==null?refFaces:faces,face:[1,0],body:body?(path.basename(file)==='target'?[0,1]:[1,0]):null});
  const q=installIdentityQuality({db,one:(s,...a)=>db.prepare(s).get(...a),all:(s,...a)=>db.prepare(s).all(...a),run:(s,...a)=>db.prepare(s).run(...a),safeFile:m=>path.join(dir,m.id),analyse});
  let r=await q.compare({character_id:'c',media_id:'target'});assert.equal(r.body.verdict,'unknown');assert.equal(r.body.scores.length,0);
  r=await q.compare({character_id:'c',media_id:'target',single_person:true,body_visible:true});
  assert.equal(r.face.scores[0].score,1);assert.equal(r.body.scores[0].score,0);assert.equal(r.body.method,BODY_QUALITY_METHOD);
  assert.equal(r.face.verdict,'needs_review');assert.equal(r.body.verdict,'needs_review');
  const saved=await q.review({report_id:r.id,face:'match',body:'mismatch'});assert.equal(saved.canon_changed,false);
  assert.equal(db.prepare('SELECT count(*) n FROM canon').get().n,1);assert.equal(db.prepare('SELECT actor FROM identity_quality_reviews').get().actor,'local-creator');
  await assert.rejects(q.review({report_id:r.id,face:'match',body:'match'}),{status:409});
  r=await q.compare({character_id:'c',media_id:'target',single_person:true,body_visible:true});await writeFile(path.join(dir,'target'),'changed');
  await assert.rejects(q.review({report_id:r.id,face:'match',body:'match'}),{status:409});await writeFile(path.join(dir,'target'),'target');
  r=await q.compare({character_id:'c',media_id:'target'});db.prepare('INSERT INTO canon VALUES(?,?,?)').run('v2','c',JSON.stringify(refs));
  await assert.rejects(q.review({report_id:r.id,face:'match',body:'match'}),{status:409});
  faces=2;r=await q.compare({character_id:'c',media_id:'target',single_person:true,body_visible:true});assert.equal(r.body.scores.length,0);assert.equal(r.face.scores.length,0);
  faces=1;refFaces=2;db.prepare('INSERT INTO canon VALUES(?,?,?)').run('v3','c',JSON.stringify(refs.map(r=>({...r,crop:{x:0,y:0,w:1,h:1}}))));
  r=await q.compare({character_id:'c',media_id:'target',single_person:true,body_visible:true});assert.equal(r.body.verdict,'unknown');assert.equal(r.body.scores.length,0,'an approved crop cannot make a multi-person body score unambiguous');
  await writeFile(path.join(dir,'ref'),'changed');await assert.rejects(q.compare({character_id:'c',media_id:'target'}),{status:409});
});

test('body benchmark excludes the same file and source; invalid regions and vectors abstain',()=>{
  assert.throws(()=>qualityCrop({x:0.9,y:0,w:0.5,h:1}));assert.equal(qualitySimilarity([0,0],[1,1]),null);
  const pairs=bodyBenchmarkPairs([{character_id:'a',media_id:'1',sha256:'x',vector:[1,0]},{character_id:'a',media_id:'2',sha256:'x',vector:[1,0]},{character_id:'a',media_id:'3',sha256:'y',vector:[1,0]},{character_id:'b',media_id:'4',sha256:'z',vector:[0,1]}]);
  assert.equal(pairs.length,5);assert.equal(pairs.filter(p=>p.truth).length,2);assert.ok(pairs.filter(p=>!p.truth).every(p=>p.body===0));
});
