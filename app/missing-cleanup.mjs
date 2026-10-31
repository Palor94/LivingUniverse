import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';

export function createMissingCleanup({db,root,dataDir,all,one,fail,removeCatalogue,isBusy,setBusy}){
  const previews=new Map(),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
  async function inspect(mid){
    const m=one('SELECT m.*,s.state FROM active_media m LEFT JOIN media_scan_state s ON s.media_id=m.id WHERE m.id=?',mid);
    if(!m)return {id:mid,reason:'Already removed or no longer catalogued.'};
    const blocked=reason=>({id:mid,name:m.relative_path,reason});
    if(m.state!=='missing')return blocked('Not marked missing. Run a fresh file check first.');
    if(one("SELECT 1 FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,'$.media_id')=?)",mid))return blocked('Protected approved identity reference.');
    if(one('SELECT 1 FROM scan_candidates s,json_each(s.candidate_ids) c WHERE c.value=?',mid))return blocked('Possible move/rename: reconcile this record first.');
    const parts=m.relative_path.split(/[\\/]/);if(path.win32.isAbsolute(m.relative_path)||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[\x00:]/.test(p)))return blocked('Unsafe catalogue location.');
    try{
      const realRoot=await fs.realpath(root);await fs.readdir(realRoot);let parent=realRoot;
      for(const part of parts.slice(0,-1)){parent=path.join(parent,part);const stat=await fs.lstat(parent);if(stat.isSymbolicLink()||!stat.isDirectory())return blocked('Parent folder is linked or unavailable.');}
      const entries=await fs.readdir(parent),key=s=>s.normalize('NFC').toLocaleLowerCase('hu');
      if(entries.some(name=>key(name)===key(parts.at(-1))))return blocked('The file exists again, or its name casing changed. Rescan.');
      try{await fs.lstat(path.join(parent,parts.at(-1)));return blocked('The file is available again.');}catch(e){if(e.code!=='ENOENT')return blocked('Cannot verify that the file is absent.');}
      return {id:mid,name:m.relative_path,signature:digest([m.id,m.relative_path,m.size,m.modified_at])};
    }catch{return blocked('Resource or parent folder is unavailable. No removal allowed.');}
  }
  async function preview(body){
    if(isBusy())throw fail('Wait for the current file operation.',409);
    if(!body||Object.keys(body).length!==1||!Array.isArray(body.media_ids)||!body.media_ids.length||body.media_ids.length>1000||body.media_ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw fail('Select 1–1000 catalogue IDs.');
    const eligible=[],blocked=[];for(const id of new Set(body.media_ids)){const item=await inspect(id);(item.signature?eligible:blocked).push(item);}
    for(const[k,v]of previews)if(v.expires<Date.now())previews.delete(k);while(previews.size>=20)previews.delete(previews.keys().next().value);
    const token=randomUUID();previews.set(token,{eligible,expires:Date.now()+600000});return {token,eligible:eligible.map(({signature,...item})=>item),blocked};
  }
  async function confirm(body){
    if(!body||Object.keys(body).length!==1||typeof body.token!=='string')throw fail('Confirm the current preview.');const plan=previews.get(body.token);if(!plan||plan.expires<Date.now())throw fail('Preview expired. Review the selected records again.',409);if(plan.result)return plan.result;if(isBusy())throw fail('Wait for the current file operation.',409);if(!plan.eligible.length)throw fail('No eligible missing records were selected.');
    setBusy(true);
    try{
      const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'before-missing-cleanup-'+randomUUID()+'.sqlite');await backup(db,file);const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw fail('Backup verification failed. No records were removed.',500);}finally{copy.close();}
      const removed=[],skipped=[];for(const item of plan.eligible){const fresh=await inspect(item.id);if(fresh.signature!==item.signature){skipped.push({id:item.id,name:item.name,reason:fresh.reason||'The catalogue changed. Preview again.'});continue;}try{removeCatalogue(item.id);removed.push(item.id);}catch(e){skipped.push({id:item.id,name:item.name,reason:e.status?e.message:'Removal failed; record retained.'});}}
      plan.result={removed,skipped,backup_verified:true,recoverable:true};return plan.result;
    }finally{setBusy(false);}
  }
  return {preview,confirm};
}
