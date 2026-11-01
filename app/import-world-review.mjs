// Local operator-only import. No server endpoint, provider, credential or inference.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installWorldReview} from './world-review.mjs';
import {reviewDigest} from './world-review-fields.mjs';
import {describeMediaPurpose} from './media-purpose.mjs';
async function batchAvailability(files){
 if(process.platform!=='win32')return new Map(files.map(f=>[f,'local']));
 const states=new Map(),execute=promisify(execFile),script="$ErrorActionPreference='Stop';$paths=ConvertFrom-Json $env:LU_REVIEW_ATTRIBUTE_PATHS; $values=@(foreach($p in $paths){try{[int64][IO.File]::GetAttributes($p)}catch{-1}});ConvertTo-Json -Compress -InputObject $values";
 for(let offset=0;offset<files.length;offset+=48){const chunk=files.slice(offset,offset+48);try{const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,LU_REVIEW_ATTRIBUTE_PATHS:JSON.stringify(chunk)},windowsHide:true,timeout:10000}),flags=JSON.parse(stdout);if(!Array.isArray(flags)||flags.length!==chunk.length)throw Error();chunk.forEach((f,i)=>states.set(f,Number.isInteger(flags[i])&&flags[i]>=0?(flags[i]&0x441000)?'online':'local':'unknown'));}catch{chunk.forEach(f=>states.set(f,'unknown'));}}
 return states;
}

export async function readWorldRun(runDirectory){
 const plan=JSON.parse(await fs.readFile(path.join(runDirectory,'plan.json'),'utf8')),expected=plan.plan_hash,{plan_hash,...rest}=plan;if(reviewDigest(rest)!==expected)throw Error('LIBRARY_PLAN_CHANGED');
 const source=new DatabaseSync(path.join(runDirectory,'catalogue','universe.sqlite'),{readOnly:true});source.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
 try{
  const manifest={kind:'world-v1-local-import',plan_hash,provider:Object.fromEntries(['model','model_revision','reasoning_effort','result_contract','image_detail','max_output_tokens'].map(k=>[k,plan.provider[k]??null])),prompt:plan.disclosure.prompt,output_schema:plan.disclosure.output_schema},manifestId=reviewDigest(manifest),items=new Map(plan.items.map(i=>[i.media_id,i])),records=[];
  const retired=new Set(source.prepare('SELECT media_id FROM library_redactions').all().map(r=>r.media_id));
  for(const row of source.prepare('SELECT * FROM world_assets ORDER BY media_id').all()){
   const item=items.get(row.media_id);if(!item||retired.has(row.media_id)||item.original.sha256!==row.source_sha256)continue;
   records.push({media_id:row.media_id,source_sha256:row.source_sha256,source_path:item.original.relative_path,source_metadata:item.original,raw:JSON.parse(row.result_json),provenance:{model:plan.provider.model,reasoning_effort:plan.provider.reasoning_effort,manifest_id:manifestId,plan_hash,analysis_item_id:row.result_item_id}});
  }
  return {plan_hash,manifest,records};
 }finally{source.close();}
}
export function selectWorldTrial(db){
 const normalize=v=>v.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
 const characters=db.prepare('SELECT id,name FROM characters').all(),palor=new Set(characters.filter(c=>normalize(c.name).includes('palor')).map(c=>c.id)),pakozdi=new Set(characters.filter(c=>normalize(c.name).includes('pakozdi')).map(c=>c.id));
 const rows=db.prepare("SELECT s.* FROM world_review_sources s JOIN active_media m ON m.id=s.media_id WHERE s.rowid=(SELECT max(s2.rowid) FROM world_review_sources s2 WHERE s2.media_id=s.media_id) ORDER BY s.media_id").all().map(r=>{const raw=JSON.parse(r.raw_json),ids=db.prepare('SELECT character_id FROM depictions WHERE media_id=?').all(r.media_id).map(d=>d.character_id);return {id:r.media_id,pair:ids.some(id=>palor.has(id))&&ids.some(id=>pakozdi.has(id))&&raw.scene_details.participants.length>1,single:raw.scene_details.participants.length===1,plan:describeMediaPurpose(r.source_path,raw).kind==='generation_plan',uncertain:raw.scene_details.environment.uncertain};});
 const selected=[],seen=new Set();function take(predicate,n){for(const row of rows.filter(predicate)){if(n<=0||selected.length>=20)break;if(!seen.has(row.id)){selected.push(row);seen.add(row.id);n--;}}}
 take(r=>r.pair,8);take(r=>r.plan,4);take(r=>r.single,4);take(r=>r.uncertain,4);take(()=>true,20);
 return {ids:selected.map(r=>r.id),summary:{total:selected.length,paired_candidates:selected.filter(r=>r.pair).length,planning:selected.filter(r=>r.plan).length,single:selected.filter(r=>r.single).length,uncertain:selected.filter(r=>r.uncertain).length,identity_inferred:false}};
}
async function main(){
 const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i++){const key=args[i];if(['--preview','--apply','--trial'].includes(key))opts[key]=true;else if(['--config','--run','--report','--database'].includes(key)&&args[i+1])opts[key]=args[++i];else throw Error('INVALID_IMPORT_COMMAND');}
 if(!opts['--config']||!opts['--run']||!opts['--report']||!!opts['--preview']===!!opts['--apply'])throw Error('EXPLICIT_IMPORT_MODE_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(opts['--config'],'utf8')),database=path.resolve(opts['--database']||cfg.database),report=path.resolve(opts['--report']);if(report.toLowerCase().includes('onedrive')||!path.isAbsolute(cfg.mediaRoot))throw Error('PRIVATE_LOCAL_REPORT_REQUIRED');await fs.mkdir(path.dirname(report),{recursive:true});
 const data=await readWorldRun(path.resolve(opts['--run']));let db,temporary;
 try{
  if(opts['--preview']){
   const live=new DatabaseSync(database,{readOnly:true});try{temporary=path.join(path.dirname(report),'preview-catalogue-'+randomUUID()+'.sqlite');await backup(live,temporary);}finally{live.close();}db=new DatabaseSync(temporary);
  }else db=new DatabaseSync(database);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  let backupFile=null;if(opts['--apply']){backupFile=path.join(path.dirname(database),'backups','before-world-import-'+randomUUID()+'.sqlite');await fs.mkdir(path.dirname(backupFile),{recursive:true});await backup(db,backupFile);const check=new DatabaseSync(backupFile,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('IMPORT_BACKUP_INVALID');}finally{check.close();}}
  const attributePaths=db.prepare("SELECT relative_path FROM active_media WHERE kind='image'").all().map(r=>path.join(cfg.mediaRoot,...r.relative_path.split(/[\\/]/u))),states=await batchAvailability(attributePaths);
  const service=installWorldReview({db,root:cfg.mediaRoot,availability:async file=>states.get(file)||'unknown'}),preview=await service.previewImport(data.records);
  if(opts['--preview']){await fs.writeFile(report,JSON.stringify({kind:'world-review-import-preview',plan_hash:data.plan_hash,database,prepared_at:new Date().toISOString(),...preview},null,2));console.log(JSON.stringify({mode:'preview',records:data.records.length,summary:preview.summary,preview_hash:preview.preview_hash,live_writes:0,external_calls:0}));}
  else{
   const approved=JSON.parse(await fs.readFile(report,'utf8'));if(approved.kind!=='world-review-import-preview'||approved.plan_hash!==data.plan_hash||approved.database!==database||approved.preview_hash!==preview.preview_hash)throw Error('IMPORT_PREVIEW_CHANGED');
   service.registerManifest(data.manifest);await service.importRecords(data.records,approved.preview_hash);let trial=null;if(opts['--trial']){trial=selectWorldTrial(db);if(trial.ids.length)service.prepareTrial(trial.ids);}
   const verification={mode:'applied',plan_hash:data.plan_hash,summary:preview.summary,trial:trial?.summary||null,backup:backupFile,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreign_key_errors:db.prepare('PRAGMA foreign_key_check').all().length,automatic_acceptances:db.prepare("SELECT count(*) n FROM world_review_facts WHERE state='accepted'").get().n,external_calls:0};await fs.writeFile(report+'.applied.json',JSON.stringify(verification,null,2));console.log(JSON.stringify(verification));
  }
 }finally{db?.close();if(temporary){for(const suffix of ['','-wal','-shm'])await fs.unlink(temporary+suffix).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({code:e.code||e.message&&/^[A-Z_]+$/u.test(e.message)&&e.message||'IMPORT_FAILED'}));process.exitCode=1;});
