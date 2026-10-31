import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {analysisHash} from '../app/analysis-model.mjs';
import {installWorldIndex} from '../app/analysis-world-index.mjs';
import {installLibraryRetention,syncLibraryRetention,deleteAnalysisCopy} from './library-retention.mjs';

async function fixture(fn){
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'lu-retention-')),media=path.join(output,'media');await fs.mkdir(media);
  const app=await createApp({root:media,dataDir:path.join(output,'catalogue'),mobile:{enabled:false}}),db=app.db,live=new DatabaseSync(':memory:');
  live.exec("CREATE TABLE media(id TEXT PRIMARY KEY,kind TEXT);CREATE TABLE media_hidden(media_id TEXT PRIMARY KEY);CREATE VIEW active_media AS SELECT * FROM media WHERE id NOT IN (SELECT media_id FROM media_hidden)");
  db.exec("CREATE TABLE library_items(media_id TEXT PRIMARY KEY,status TEXT,error_code TEXT,cost_usd REAL);CREATE TABLE library_attempts(media_id TEXT PRIMARY KEY,cost_usd REAL,receipt_json TEXT)");installWorldIndex(db);installLibraryRetention(db);
  const bytes=Buffer.from('synthetic private copy, no actual image'),item={media_id:randomUUID(),original:{sha256:analysisHash(bytes)}};item.staging_name=item.media_id+'.jpg';await fs.writeFile(path.join(media,item.staging_name),bytes);db.prepare("INSERT INTO media VALUES(?,?,'','image',?,'now','now')").run(item.media_id,item.staging_name,bytes.length);db.prepare("INSERT INTO library_items VALUES(?,'queued',NULL,0)").run(item.media_id);live.prepare("INSERT INTO media VALUES(?,'image')").run(item.media_id);const plan={items:[item]};
  try{await fn({output,db,live,item,plan,bytes});}finally{await app.close();live.close();assert.equal(path.dirname(path.resolve(output)),path.resolve(os.tmpdir()));assert.ok(path.basename(output).startsWith('lu-retention-'));await fs.rm(output,{recursive:true,force:true});}
}
test('removed originals purge private copy, visual results, proposals, cache and index but retain cost accounting and immutable plan',()=>fixture(async({output,db,live,item,plan})=>{
  const at='now',job=randomUUID(),analysisItem=randomUUID();db.prepare("INSERT INTO media_analysis_jobs VALUES(?,?,?,'{}','[]','completed',0,'',?,?)").run(job,randomUUID(),'hash',at,at);
  db.prepare("INSERT INTO media_analysis_items(id,job_id,media_id,ordinal,status,source_json,result_json) VALUES(?,?,?,0,'succeeded','{}','{\"private_visual_label\":\"fixture\"}')").run(analysisItem,job,item.media_id);
  db.prepare("INSERT INTO media_analysis_proposals VALUES(?,?,?,0,'{}','pending')").run(randomUUID(),analysisItem,'hash');db.prepare("INSERT INTO media_analysis_cache VALUES(?,'{}',?,'hash','{}','now')").run('key',item.original.sha256);
  db.prepare("INSERT INTO world_assets VALUES(?,?,?,'non_intimate','scene_illustration',0,'frontal','eye_level','full_body','proposed','{}')").run(item.media_id,item.original.sha256,analysisItem);db.prepare('INSERT INTO world_search VALUES(?,?,?)').run(item.media_id,'privát','private');db.prepare("INSERT INTO library_attempts VALUES(?,0.02,'{\"usage\":123}')").run(item.media_id);
  const before=JSON.stringify(plan);live.prepare('INSERT INTO media_hidden VALUES(?)').run(item.media_id);let result=await syncLibraryRetention({output,plan,db,live});assert.equal(result.newly_deleted_copies,1);assert.equal(result.removed_images,1);assert.equal(await fs.access(path.join(output,'media',item.staging_name)).then(()=>true,()=>false),false);
  assert.equal(db.prepare('SELECT status FROM library_items').get().status,'removed');assert.equal(db.prepare('SELECT result_json FROM media_analysis_items').get().result_json,null);for(const table of ['media_analysis_proposals','media_analysis_cache','world_assets','world_search'])assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0);assert.equal(db.prepare('SELECT cost_usd FROM library_attempts').get().cost_usd,.02);assert.equal(JSON.stringify(plan),before);assert.equal(live.prepare('SELECT count(*) n FROM media').get().n,1);
  // Restoring a live item does not recreate the deleted run copy or silently send it again.
  live.prepare('DELETE FROM media_hidden').run();result=await syncLibraryRetention({output,plan,db,live});assert.equal(result.newly_deleted_copies,0);assert.equal(result.removed_images,1);
  // A late result cannot resurrect the removed observation.
  db.prepare("UPDATE media_analysis_items SET status='succeeded',result_json='{}'").run();await syncLibraryRetention({output,plan,db,live});assert.equal(db.prepare('SELECT result_json FROM media_analysis_items').get().result_json,null);
}));
test('active items are preserved and an unreadable owner fails before destructive actions',()=>fixture(async({output,db,live,item,plan})=>{
  const result=await syncLibraryRetention({output,plan,db,live});assert.equal(result.removed_images,0);assert.equal(db.prepare('SELECT status FROM library_items').get().status,'queued');assert.ok(await fs.stat(path.join(output,'media',item.staging_name)));
  await assert.rejects(syncLibraryRetention({output,plan,db,live:{prepare(){throw Error('owner unavailable');}}}));assert.ok(await fs.stat(path.join(output,'media',item.staging_name)));
}));
test('historical copies remain under deletion retention after removal from an expanded active scope',()=>fixture(async({output,db,live,item})=>{
  live.prepare('INSERT INTO media_hidden VALUES(?)').run(item.media_id);const result=await syncLibraryRetention({output,db,live,plan:{items:[],retained_items:[item]}});assert.equal(result.removed_images,1);assert.equal(result.newly_deleted_copies,1);assert.equal(db.prepare('SELECT status FROM library_items').get().status,'removed');
}));
test('copy deletion refuses traversal and changed files',()=>fixture(async({output,item})=>{
  await assert.rejects(deleteAnalysisCopy(output,{...item,staging_name:'../outside.jpg'}));await fs.writeFile(path.join(output,'media',item.staging_name),'changed');await assert.rejects(deleteAnalysisCopy(output,item),/RETENTION_COPY_CHANGED/);assert.equal(await fs.readFile(path.join(output,'media',item.staging_name),'utf8'),'changed');
}));
