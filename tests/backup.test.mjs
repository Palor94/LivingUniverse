import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createBackup,restoreSnapshot,verifySnapshot,safeEntry,sourceFiles} from '../ops/backup/backup.mjs';

test('online WAL backup restores catalogue, sidecars and local originals without touching OneDrive media',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-backup-test-'));let db;t.after(async()=>{db?.close();await fs.rm(base,{recursive:true,force:true});});
  const root=path.join(base,'code'),media=path.join(base,'media'),live=path.join(base,'live');
  for(const dir of [path.join(root,'app'),media,live,path.join(live,'image-originals')])await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(root,'app','example.mjs'),'export const a=1;');await fs.writeFile(path.join(root,'.env'),'SECRET=never-copy');
  await fs.writeFile(path.join(media,'one.png'),'fixture-original');await fs.writeFile(path.join(live,'image-originals','before.png'),'recover-before-crop');
  await fs.writeFile(path.join(live,'location-canvas.json'),'{"schema":1,"head":"fixture"}');
  const database=path.join(live,'universe.sqlite');db=new DatabaseSync(database);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE characters(id TEXT PRIMARY KEY); CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT,size INTEGER); INSERT INTO characters VALUES('stable-id'); INSERT INTO media VALUES('media-id','one.png','image',16);");
  const result=await createBackup({root,mediaRoot:media,database,destination:path.join(base,'backups'),stageParent:path.join(base,'stage'),privateRuntime:false});
  assert.equal(result.database.counts.characters,1);assert.equal(result.media_summary.metadata_visible,1);assert.equal(result.local_asset_files,1);
  assert.equal(await fs.readFile(path.join(media,'one.png'),'utf8'),'fixture-original');
  assert.ok(!(await sourceFiles(root)).some(f=>f.includes('.env')));
  const restored=path.join(base,'new-recovery');await restoreSnapshot(result.snapshot,restored);
  assert.equal(await fs.readFile(path.join(restored,'data','image-originals','before.png'),'utf8'),'recover-before-crop');
  assert.equal(JSON.parse(await fs.readFile(path.join(restored,'data','location-canvas.json'),'utf8')).head,'fixture');
  const check=new DatabaseSync(path.join(restored,'data','universe.sqlite'),{readOnly:true});assert.equal(check.prepare('SELECT id FROM characters').get().id,'stable-id');check.close();
  await assert.rejects(restoreSnapshot(result.snapshot,restored),/NEW directory/);
  await fs.appendFile(path.join(result.snapshot,'source','app','example.mjs'),'tampered');await assert.rejects(verifySnapshot(result.snapshot),/checksum mismatch/);
});

test('manifest paths cannot escape the restore directory',()=>{
  for(const p of ['../live.sqlite','C:\\live.sqlite','/live.sqlite','nested/../live.sqlite','nested:stream','nested//file'])assert.throws(()=>safeEntry('C:/recovery',p),/Unsafe/);
});
