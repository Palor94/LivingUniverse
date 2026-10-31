import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ensureDesktopCatalogue} from '../app/bootstrap.mjs';
import {preserveRecoveredSorting} from '../app/legacy-sorting.mjs';

test('desktop bootstrap installs a verified portable backup locally and never overwrites existing work',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const seed=path.join(temp,'seed.sqlite'),manifest=path.join(temp,'manifest.json'),dataDir=path.join(temp,'actual-desktop');const names=['characters','media','depictions','canon','reviews','media_notes'];
  try{
    const db=new DatabaseSync(seed);for(const t of names)db.exec(`CREATE TABLE ${t}(id TEXT PRIMARY KEY); INSERT INTO ${t} VALUES('preserved-${t}');`);db.close();const bytes=await fs.readFile(seed);const record={sha256:createHash('sha256').update(bytes).digest('hex'),counts:Object.fromEntries(names.map(t=>[t,1]))};await fs.writeFile(manifest,JSON.stringify(record));
    const first=await ensureDesktopCatalogue({dataDir,seed,manifest});assert.equal(first.created,true);assert.deepEqual(await fs.readFile(first.database),bytes);
    const local=new DatabaseSync(first.database);local.exec("INSERT INTO media_notes VALUES('new-local-note')");local.close();const second=await ensureDesktopCatalogue({dataDir,seed,manifest});assert.equal(second.created,false);assert.equal(second.counts.media_notes,2);
    await fs.writeFile(manifest,JSON.stringify({...record,sha256:'incorrect'}));const badDir=path.join(temp,'bad-checksum');await assert.rejects(ensureDesktopCatalogue({dataDir:badDir,seed,manifest}),/checksum/);await assert.rejects(fs.access(path.join(badDir,'universe.sqlite')));
    const emptyDir=path.join(temp,'empty-existing');await fs.mkdir(emptyDir);const emptyPath=path.join(emptyDir,'universe.sqlite');const empty=new DatabaseSync(emptyPath);for(const t of names)empty.exec('CREATE TABLE '+t+'(id TEXT)');empty.close();const before=await fs.readFile(emptyPath);await assert.rejects(ensureDesktopCatalogue({dataDir:emptyDir,seed,manifest}),/left untouched/);assert.deepEqual(await fs.readFile(emptyPath),before);
  }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});

test('legacy sorting carry-forward is limited to approved old IDs and preserves explicit review choices',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),file=path.join(temp,'universe.sqlite');
  try{const db=new DatabaseSync(file);db.exec(`
    CREATE TABLE media(id TEXT PRIMARY KEY); CREATE TABLE depictions(media_id TEXT,character_id TEXT);
    CREATE TABLE character_ui(character_id TEXT,merged_into TEXT); CREATE TABLE media_hidden(media_id TEXT);
    CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE media_categorization(media_id TEXT PRIMARY KEY,complete INTEGER,updated_at TEXT);
    INSERT INTO media VALUES('old'),('review'),('new'),('archived'),('hidden');
    INSERT INTO depictions VALUES('old','active'),('review','active'),('new','active'),('archived','retired'),('hidden','active');
    INSERT INTO character_ui VALUES('retired','active'); INSERT INTO media_hidden VALUES('hidden');
    INSERT INTO media_categorization VALUES('review',0,'explicit-user-choice');`);db.close();
    assert.equal(preserveRecoveredSorting(file,['old','review','archived','hidden','missing']),1);
    let read=new DatabaseSync(file,{readOnly:true});assert.equal(read.prepare("SELECT complete FROM media_categorization WHERE media_id='old'").get().complete,1);assert.equal(read.prepare("SELECT complete FROM media_categorization WHERE media_id='review'").get().complete,0);assert.equal(read.prepare("SELECT COUNT(*) n FROM media_categorization WHERE media_id IN ('new','archived','hidden')").get().n,0);read.close();
    assert.equal(preserveRecoveredSorting(file,['new']),0);read=new DatabaseSync(file,{readOnly:true});assert.equal(read.prepare("SELECT COUNT(*) n FROM media_categorization WHERE media_id='new'").get().n,0);read.close();
  }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
