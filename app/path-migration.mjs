import {createHash} from 'node:crypto';
import {portablePath,relativeParts} from './media-paths.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const specs=[['media','id',['relative_path','folder']],['media_hidden','media_id',['original_path']],['sorted_folders','folder',['folder']],['locations','id',['folder']],['scan_candidates','relative_path',['relative_path','folder']]];
const tables=db=>new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
export function planPathMigration(db,{platform=process.platform,preserveUncertain=false}={}){
  if(!['linux','darwin','win32'].includes(platform))throw Error('Unsupported destination platform.');
  if(typeof preserveUncertain!=='boolean')throw Error('Explicit terminal-outcome preservation choice required.');
  const available=tables(db),changes=[],blockers=[],snapshots=[],preservedUncertain=[],at=Date.now();
  for(const [table,key,columns]of specs){
    if(!available.has(table))continue;
    const rows=db.prepare(`SELECT * FROM ${table} ORDER BY ${key}`).all();snapshots.push([table,rows]);
    const seen=new Map();
    for(const row of rows){
      const next={};let valid=true;
      for(const column of columns){
        const value=row[column];if(value===null)continue;
        try{const normalized=relativeParts(value,{empty:column==='folder'}).join(platform==='win32'?'\\':'/');if(value!==normalized)next[column]=normalized;}
        catch{valid=false;blockers.push({table,key:row[key],column,code:'UNSAFE_PATH'});}
      }
      const location=next[key]??row[key],collisionColumn=table==='media'?'relative_path':table==='locations'?'folder':key;
      const candidate=next[collisionColumn]??row[collisionColumn];
      if(valid&&candidate&&['media','sorted_folders','scan_candidates','locations'].includes(table)){
        const canonical=portablePath(candidate).normalize('NFC'),identity=platform==='win32'?canonical.toLocaleLowerCase('hu'):canonical;
        if(seen.has(identity))blockers.push({table,key:row[key],code:'PATH_COLLISION'});else seen.set(identity,location);
      }
      if(Object.keys(next).length)changes.push({table,keyColumn:key,key:row[key],before:Object.fromEntries(columns.map(c=>[c,row[c]])),after:next});
    }
  }
  // Existing executable grants and incomplete filesystem work must be reconciled
  // by their own workflows. Never rewrite hash-bound plans or historic evidence.
  for(const [table,where]of [
    ['file_moves',"status NOT IN ('complete','relinked_external','folder_renamed','layout_migrated','layout_path_updated_missing')"],
    ['folder_changes',"status NOT IN ('complete','complete_source_directory_retained','failed_rolled_back')"],
    ['mcp_changes',"status IN ('pending','approved')"],['mcp_reference_changes',"status IN ('pending','approved')"],
    ['image_generation_runs',"status IN ('pending','approved','running','generated','uncertain')"],
    ['media_analysis_jobs',"status IN ('queued','running','paused')"],['media_image_edits',"status IN ('preparing','restoring','needs_review')"]
  ])if(available.has(table)){
    const n=db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all().filter(row=>{
      // An operator may explicitly retain terminal uncertain runs as evidence.
      // execute() and decide() cannot resume these runs, even after restart.
      // No status, payload, provider receipt or approval is rewritten here.
      if(table==='image_generation_runs'&&row.status==='uncertain'&&preserveUncertain){preservedUncertain.push({id:row.id,status:row.status,manifest_hash:row.manifest_hash??null});return false;}
      // Existing decision/execution endpoints reject expired pending/approved
      // grants. Preserve their immutable evidence and status without treating
      // those dead capabilities as active work. Missing/invalid expiry fails
      // closed; uncertain/running/generated outcomes still require reconciliation.
      if(!['mcp_changes','mcp_reference_changes','image_generation_runs'].includes(table)||!['pending','approved'].includes(row.status))return true;
      const expiry=typeof row.expires_at==='string'?Date.parse(row.expires_at):NaN;
      return !Number.isFinite(expiry)||expiry>at;
    }).length;
    if(n)blockers.push({table,count:n,code:'RECONCILE_BEFORE_PATH_MIGRATION'});
    snapshots.push([table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]);
  }
  if(available.has('application_settings')){
    const plans=db.prepare("SELECT * FROM application_settings WHERE key LIKE 'rename:v1:plan:%' ORDER BY key").all();snapshots.push(['rename_plans',plans]);
    if(plans.some(p=>['pending','approved'].includes(JSON.parse(p.value).status)))blockers.push({table:'application_settings',code:'RECONCILE_RENAME_APPROVALS'});
  }
  const plan={kind:'catalogue-path-migration',version:1,platform,preserve_terminal_uncertain:preserveUncertain,preserved_uncertain_outcomes:preservedUncertain,source_hash:hash(snapshots),changes,blockers};
  return {...plan,plan_hash:hash(plan)};
}
export function applyPathMigration(db,expectedPlan){
  db.exec('BEGIN IMMEDIATE');
  try{
    const current=planPathMigration(db,{platform:expectedPlan.platform,preserveUncertain:expectedPlan.preserve_terminal_uncertain===true});
    if(current.plan_hash!==expectedPlan.plan_hash)throw Error('Stale path migration plan.');
    if(current.blockers.length)throw Error('Path migration blocked; reconcile conflicts first.');
    for(const change of current.changes){
      const columns=Object.keys(change.after);
      db.prepare(`UPDATE ${change.table} SET ${columns.map(c=>c+'=?').join(',')} WHERE ${change.keyColumn}=?`).run(...columns.map(c=>change.after[c]),change.key);
    }
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key verification failed.');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integrity verification failed.');
    db.exec('COMMIT');return {changed:current.changes.length,plan_hash:current.plan_hash,platform:current.platform};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function assertNativeCataloguePaths(db,platform=process.platform){
  if(platform==='win32')return;
  for(const [table,,columns]of specs){if(!tables(db).has(table))continue;for(const c of columns)if(db.prepare(`SELECT 1 FROM ${table} WHERE instr(${c},char(92))>0 LIMIT 1`).get())throw Error('Windows catalogue paths require an explicit offline path migration on this copy.');}
}
