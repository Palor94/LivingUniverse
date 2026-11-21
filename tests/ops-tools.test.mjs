import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOnlyGuard,sandboxStatusGuard} from '../ops/sandbox.mjs';
import {allowedShotRequest} from '../ops/ui-shots.mjs';
import {relatedTests} from '../ops/test.mjs';
import {describe} from '../ops/doctor.mjs';

test('T0 accepts only loopback sandbox reads, never time, travel, AI or outside requests',()=>{
  assert.equal(allowedShotRequest('http://127.0.0.1:4327/api/state','GET'),true);
  for(const route of ['/api/play/wait','/api/play/travel','/api/play/talk','/api/quick-tag/sync'])
    assert.equal(allowedShotRequest('http://127.0.0.1:4327'+route,'POST'),false);
  for(const url of ['http://127.0.0.1:4317/api/state','https://example.com/a','http://127.0.0.1:4327.example.com/a'])
    assert.equal(allowedShotRequest(url,'GET'),false);
});

test('sandbox marker identifies only the sandbox wrapper and preserves other routes',()=>{
  let passed=0,status,body;
  const handler=sandboxStatusGuard(()=>passed++);
  const res={writeHead(value){status=value;},end(value){body=JSON.parse(value);}};
  handler({method:'GET',url:'/api/dev/sandbox-status'},res);
  assert.equal(status,200);assert.deepEqual(body,{sandbox:true,ai:'mock'});assert.equal(passed,0);
  handler({method:'GET',url:'/api/state'},res);assert.equal(passed,1);
});

test('sandbox read-only guard lets reads and database-only writes through',()=>{
  const seen=[];const handler=(req)=>seen.push(req.method+' '+req.url);
  const guard=readOnlyGuard(handler);
  const res=()=>({status:0,body:'',writeHead(s){this.status=s;},end(b){this.body=b;}});
  for(const [method,url,passes] of [['GET','/api/state',true],['POST','/api/play/talk',true],['POST','/api/dev/restart',true],['POST','/api/dev-tasks',true],['POST','/api/dev-tasks/unrelated',false],['POST','/api/characters',false],['POST','/api/media/placement/apply',false],['DELETE','/api/characters/x',false],['POST','/api/workshop/ideas',false]]){
    const r=res();guard({method,url,resume(){}},r);
    assert.equal(r.status===403,!passes,method+' '+url);
  }
  assert.deepEqual(seen,['GET /api/state','POST /api/play/talk','POST /api/dev/restart','POST /api/dev-tasks']);
});

test('changed files pick their tests',()=>{
  const tests=['play-mode.test.mjs','play-stream.test.mjs','play-scenes.test.mjs','character-sprites.test.mjs','dev-tools.test.mjs','idea-box.test.mjs'];
  assert.deepEqual(relatedTests(['app/idea-box.mjs'],tests),['idea-box.test.mjs']);
  assert.deepEqual(relatedTests(['app/play/scenes.mjs'],tests),['play-mode.test.mjs','play-scenes.test.mjs','play-stream.test.mjs']);
  assert.deepEqual(relatedTests(['tests/dev-tools.test.mjs','docs/x.md'],tests),['dev-tools.test.mjs']);
  assert.equal(relatedTests(['app/server.mjs'],tests).length,tests.length,'shared modules run everything');
  assert.deepEqual(relatedTests(['ops/sandbox.mjs'],[...tests,'ops-tools.test.mjs']),['ops-tools.test.mjs'],'ops/ tools have their own test');
});

test('sandbox cleanup only deletes inside a sandbox folder',async()=>{
  const {removeCopy}=await import('../ops/sandbox.mjs');
  await assert.rejects(removeCopy('C:/Users/someone/Documents'),/Not a sandbox copy/);
  const os=await import('node:os'),{promises:fs}=await import('node:fs'),path=(await import('node:path')).default;
  const dir=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'lu-sb-')),'sandbox','2026-11-12T10-00-00-000Z');
  await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'universe.sqlite'),'');
  assert.equal(await removeCopy(dir),true);assert.equal(await fs.stat(dir).catch(()=>null),null);
  await fs.rm(path.dirname(path.dirname(dir)),{recursive:true,force:true});
});

test('database diff: a new column does not mark every row as changed',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {diffDatabases}=await import('../ops/db-diff.mjs');
  const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');
  a.exec("CREATE TABLE t(id TEXT PRIMARY KEY,x TEXT,old TEXT);INSERT INTO t VALUES('1','a','o'),('2','b','o')");
  b.exec("CREATE TABLE t(id TEXT PRIMARY KEY,x TEXT,y TEXT);INSERT INTO t VALUES('1','a',NULL),('2','c',NULL)");
  const [d]=diffDatabases(a,b);
  assert.equal(d.changed,1);assert.deepEqual(d.columns,['x']);assert.deepEqual(d.new_columns,['y']);assert.deepEqual(d.dropped_columns,['old']);
});

test('doctor line shows state and details',()=>{
  assert.equal(describe({id:'mobile',state:'bad',port:4318}),'✕ mobile     port=4318');
});

test('database diff reports counts, columns and keys, never values',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {diffDatabases}=await import('../ops/db-diff.mjs');
  const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');
  for(const db of [a,b]){db.exec("CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT,notes TEXT);CREATE TABLE log(x TEXT)");db.exec("INSERT INTO characters VALUES('c1','Aladár','titok'),('c2','Béla','x');INSERT INTO log VALUES('a')");}
  b.exec("UPDATE characters SET notes='új titok' WHERE id='c1';DELETE FROM characters WHERE id='c2';INSERT INTO characters VALUES('c3','Csaba','');INSERT INTO log VALUES('b');CREATE TABLE extra(id INTEGER PRIMARY KEY);INSERT INTO extra VALUES(1)");
  const d=diffDatabases(a,b);
  const ch=d.find(x=>x.table==='characters');
  assert.deepEqual([ch.added,ch.removed,ch.changed],[1,1,1]);assert.deepEqual(ch.columns,['notes']);
  assert.deepEqual(ch.samples,{added:['["c3"]'],removed:['["c2"]'],changed:['["c1"]']});
  assert.equal(d.find(x=>x.table==='log').added,1);assert.deepEqual(d.find(x=>x.table==='extra'),{table:'extra',created:true,added:1});
  assert.ok(!JSON.stringify(d).includes('titok'),'no cell values');
  assert.deepEqual(diffDatabases(a,a),[]);
});
