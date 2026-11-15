import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {installAutoSnapshots,KEEP} from '../app/auto-snapshots.mjs';

test('automatic snapshots: checked copies, only the newest few automatic ones are kept',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-snap-'));
  const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'));db.exec("CREATE TABLE t(x);INSERT INTO t VALUES('synthetic')");
  let day=0;const snaps=installAutoSnapshots({db,dataDir,fail:m=>Error(m),now:()=>new Date(Date.UTC(2026,10,1+day))});
  await fs.mkdir(snaps.dir,{recursive:true});await fs.writeFile(path.join(snaps.dir,'my-own-backup.sqlite'),'keep me');
  for(;day<KEEP+2;day++)await snaps.take();
  const names=(await snaps.list()).map(s=>s.name);
  assert.equal(names.length,KEEP);assert.equal(names[0],'auto-2026-11-09T00-00-00.sqlite');
  assert.equal(await fs.readFile(path.join(snaps.dir,'my-own-backup.sqlite'),'utf8'),'keep me','files it did not make are never removed');
  const copy=new DatabaseSync(path.join(snaps.dir,names[0]),{readOnly:true});assert.equal(copy.prepare('SELECT x FROM t').get().x,'synthetic');copy.close();
  db.close();await fs.rm(dataDir,{recursive:true,force:true});
});

test('automatic snapshots of a WAL catalogue leave no -wal/-shm side files; old empty leftovers are tidied',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-snap2-'));
  const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'));db.exec("PRAGMA journal_mode=WAL;CREATE TABLE t(x);INSERT INTO t VALUES('synthetic')");
  const snaps=installAutoSnapshots({db,dataDir,fail:m=>Error(m),now:()=>new Date(Date.UTC(2026,10,12))});
  await fs.mkdir(snaps.dir,{recursive:true});
  const old='auto-2026-11-10T18-59-39.sqlite';
  for(const s of ['.partial-shm','.partial-wal','-shm'])await fs.writeFile(path.join(snaps.dir,old+s),'');
  await fs.writeFile(path.join(snaps.dir,'auto-2026-11-09T10-00-00.sqlite-wal'),'pages');await fs.writeFile(path.join(snaps.dir,'auto-2026-11-09T10-00-00.sqlite-shm'),'');
  const {name}=await snaps.take();
  const files=(await fs.readdir(snaps.dir)).sort();
  assert.deepEqual(files,[name,'auto-2026-11-09T10-00-00.sqlite-shm','auto-2026-11-09T10-00-00.sqlite-wal'].sort(),'a non-empty -wal and its -shm stay');
  const copy=new DatabaseSync(path.join(snaps.dir,name),{readOnly:true});assert.equal(copy.prepare('PRAGMA journal_mode').get().journal_mode,'delete');assert.equal(copy.prepare('SELECT x FROM t').get().x,'synthetic');copy.close();
  db.close();await fs.rm(dataDir,{recursive:true,force:true});
});
