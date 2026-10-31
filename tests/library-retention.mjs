// One-way retention for the private analysis run. The owning live catalogue is read-only.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {analysisHash} from '../app/analysis-model.mjs';

export function installLibraryRetention(db){db.exec("CREATE TABLE IF NOT EXISTS library_redactions(media_id TEXT PRIMARY KEY,source_sha256 TEXT NOT NULL,detected_at TEXT NOT NULL,copy_deleted INTEGER NOT NULL DEFAULT 0,error_code TEXT)");}
export const libraryItemRetired=(db,id)=>!!db.prepare('SELECT 1 FROM library_redactions WHERE media_id=?').get(id);
export function forgetLibraryObservations(db,item){
  db.exec('BEGIN IMMEDIATE');try{
    db.prepare("INSERT OR IGNORE INTO library_redactions(media_id,source_sha256,detected_at) VALUES(?,?,?)").run(item.media_id,item.original.sha256,new Date().toISOString());
    db.prepare("UPDATE library_items SET status='removed',error_code='REMOVED_FROM_LIVE_LIBRARY' WHERE media_id=?").run(item.media_id);
    for(const table of ['world_labels','world_asset_characters','world_search','world_assets'])db.prepare(`DELETE FROM ${table} WHERE media_id=?`).run(item.media_id);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='world_asset_purposes'").get())db.prepare('DELETE FROM world_asset_purposes WHERE media_id=?').run(item.media_id);
    db.prepare('DELETE FROM media_analysis_proposals WHERE item_id IN (SELECT id FROM media_analysis_items WHERE media_id=?)').run(item.media_id);
    db.prepare("UPDATE media_analysis_items SET status=CASE WHEN status='running' THEN status ELSE 'cancelled' END,result_json=NULL,context_json=NULL,match_hash=NULL,cache_key=NULL,error_code='REMOVED_FROM_LIVE_LIBRARY' WHERE media_id=?").run(item.media_id);
    db.prepare('DELETE FROM media_analysis_cache WHERE source_sha256=?').run(item.original.sha256);
    // Usage receipts and attempt hashes contain no image bytes or visual labels and remain for cost accounting.
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export async function deleteAnalysisCopy(output,item){
  if((await fs.lstat(output)).isSymbolicLink())throw Error('UNSAFE_RETENTION_TARGET');
  const root=await fs.realpath(output),media=path.join(root,'media'),name=item.staging_name;
  if(path.basename(name)!==name||path.win32.basename(name)!==name||!['.jpg','.png','.gif','.bmp'].includes(path.extname(name).toLowerCase())||name!==item.media_id+path.extname(name))throw Error('UNSAFE_RETENTION_TARGET');
  const mediaStat=await fs.lstat(media);if(!mediaStat.isDirectory()||mediaStat.isSymbolicLink())throw Error('UNSAFE_RETENTION_TARGET');
  const actualMedia=await fs.realpath(media),relativeMedia=path.relative(root,actualMedia);if(relativeMedia!=='media')throw Error('UNSAFE_RETENTION_TARGET');
  const file=path.resolve(media,name),relative=path.relative(actualMedia,file);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.dirname(file)!==actualMedia)throw Error('UNSAFE_RETENTION_TARGET');
  const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat)return false;
  if(!stat.isFile()||stat.isSymbolicLink()||await fs.realpath(file)!==file||stat.size>20*1024*1024||analysisHash(await fs.readFile(file))!==item.original.sha256)throw Error('RETENTION_COPY_CHANGED');
  await fs.unlink(file);return true;
}
export async function syncLibraryRetention({output,plan,db,live}){
  // If the owner cannot be read, throw before deleting or sending anything. Missing/offline originals stay active.
  const active=new Set(live.prepare("SELECT id FROM active_media WHERE kind='image'").all().map(r=>r.id)),retired=new Set(db.prepare('SELECT media_id FROM library_redactions').all().map(r=>r.media_id));
  const tracked=[...new Map([...(plan.retained_items||[]),...plan.items].map(item=>[item.media_id,item])).values()];
  const removed=tracked.filter(item=>!active.has(item.media_id)||retired.has(item.media_id));let deleted=0,errors=0;
  for(const item of removed){
    forgetLibraryObservations(db,item);
    try{if(await deleteAnalysisCopy(output,item))deleted++;db.prepare('UPDATE library_redactions SET copy_deleted=1,error_code=NULL WHERE media_id=?').run(item.media_id);}
    catch(error){errors++;db.prepare('UPDATE library_redactions SET error_code=? WHERE media_id=?').run(['UNSAFE_RETENTION_TARGET','RETENTION_COPY_CHANGED'].includes(error.message)?error.message:'RETENTION_DELETE_FAILED',item.media_id);}
  }
  const summary={updated_at:new Date().toISOString(),removed_images:removed.length,newly_deleted_copies:deleted,copy_delete_errors:errors,live_catalogue_writes:0,automatic_resume:false};
  const file=path.join(output,'retention-status.json'),temporary=file+'.'+process.pid+'.tmp';await fs.writeFile(temporary,JSON.stringify(summary,null,2));await fs.rename(temporary,file);return summary;
}
export async function startLibraryRetention(output,plan){
  const live=new DatabaseSync(plan.database,{readOnly:true,allowExtension:false}),db=new DatabaseSync(path.join(output,'catalogue','universe.sqlite'));
  live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=3000;');db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');installLibraryRetention(db);let pending=null,timer;
  const sync=()=>pending||(pending=syncLibraryRetention({output,plan,db,live}).finally(()=>{pending=null;}));
  try{await sync();}catch(error){live.close();db.close();throw error;}
  timer=setInterval(()=>{sync().catch(async()=>{const file=path.join(output,'retention-status.json');await fs.writeFile(file,JSON.stringify({updated_at:new Date().toISOString(),sync_error:'RETENTION_SYNC_FAILED',automatic_resume:false})).catch(()=>{});});},3000);timer.unref();
  return {sync,visible:id=>!!live.prepare("SELECT 1 FROM active_media WHERE id=? AND kind='image'").get(id)&&!libraryItemRetired(db,id),close:async()=>{clearInterval(timer);await pending?.catch(()=>{});live.close();db.close();}};
}
