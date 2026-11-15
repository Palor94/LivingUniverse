#!/usr/bin/env node
// Local operator-only import of run-vision-tag.mjs trial reports into the world review
// (the same service and checks as import-world-review.mjs: source hash proof, no duplicates,
// tombstones respected, defaults only, nothing accepted or made canon). No external call.
//   --preview: dry run on a temporary copy, writes the preview next to the report.
//   --apply:   needs that unchanged preview; backs up and integrity-checks the catalogue first.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {installWorldReview} from './world-review.mjs';
import {reviewDigest} from './world-review-fields.mjs';
import {VISION_TAG_MODEL,buildTagDisclosure} from './vision-engine.mjs';

export function recordsFromReport(report,relativePath){
  if(report?.kind!=='vision-tag-trial-result'||!Array.isArray(report.results))throw Object.assign(Error('INVALID_REPORT'),{code:'INVALID_REPORT'});
  const manifest={kind:'vision-tag-trial-import',method:report.method,provider:{model:VISION_TAG_MODEL},disclosure:buildTagDisclosure()};
  const manifestId=reviewDigest(manifest);
  const records=report.results.filter(r=>r.status==='ok'&&r.raw&&r.media_id).map(r=>({media_id:r.media_id,source_sha256:r.source_sha256,source_path:relativePath(r.media_id),
    // Usage kept in the stored result, as earlier imports did, so measured costs stay comparable.
    raw:{...r.raw,...(r.usage?{usage:r.usage}:{})},provenance:{model:VISION_TAG_MODEL,method:report.method,manifest_id:manifestId,request_id:r.request_id||null,finished_at:report.finished_at}}));
  return {manifest,records};
}

async function main(){
  const args=process.argv.slice(2),o={};
  for(let i=0;i<args.length;i++){const k=args[i];if(['--preview','--apply'].includes(k))o[k]=true;else if(['--report','--database','--media-root'].includes(k)&&args[i+1])o[k]=args[++i];else throw Error('INVALID_IMPORT_COMMAND');}
  if(!o['--report']||!o['--database']||!o['--media-root']||!!o['--preview']===!!o['--apply'])throw Error('EXPLICIT_IMPORT_MODE_REQUIRED');
  const reportFile=path.resolve(o['--report']),previewFile=reportFile.replace(/\.json$/i,'')+'.import-preview.json',database=path.resolve(o['--database']),root=path.resolve(o['--media-root']);
  const report=JSON.parse(await fs.readFile(reportFile,'utf8'));
  let db,temporary=null;
  try{
    if(o['--preview']){const live=new DatabaseSync(database,{readOnly:true});try{temporary=path.join(path.dirname(reportFile),'preview-'+randomUUID()+'.sqlite');await backup(live,temporary);}finally{live.close();}db=new DatabaseSync(temporary);}
    else db=new DatabaseSync(database);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const rel=id=>db.prepare('SELECT relative_path FROM media WHERE id=?').get(id)?.relative_path||null;
    const {manifest,records}=recordsFromReport(report,rel);
    const service=installWorldReview({db,root,availability:async()=>'local'});
    const preview=await service.previewImport(records);
    if(o['--preview']){
      await fs.writeFile(previewFile,JSON.stringify({kind:'vision-tag-import-preview',report:reportFile,database,preview_hash:preview.preview_hash,summary:preview.summary,prepared_at:new Date().toISOString()},null,2));
      console.log(JSON.stringify({mode:'preview',records:records.length,summary:preview.summary,live_writes:0,external_calls:0}));return;
    }
    const approved=JSON.parse(await fs.readFile(previewFile,'utf8'));
    if(approved.kind!=='vision-tag-import-preview'||approved.database!==database||approved.preview_hash!==preview.preview_hash)throw Error('IMPORT_PREVIEW_CHANGED');
    const backupFile=path.join(path.dirname(database),'backups','before-vision-tag-import-'+randomUUID()+'.sqlite');await fs.mkdir(path.dirname(backupFile),{recursive:true});await backup(db,backupFile);
    const check=new DatabaseSync(backupFile,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');}finally{check.close();}
    service.registerManifest(manifest);await service.importRecords(records,approved.preview_hash);
    console.log(JSON.stringify({mode:'applied',summary:preview.summary,backup:backupFile,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,external_calls:0}));
  }finally{db?.close();if(temporary)for(const s of ['','-wal','-shm'])await fs.unlink(temporary+s).catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({code:e.code||(/^[A-Z_]+$/.test(e.message)?e.message:'IMPORT_FAILED'),message:e.message}));process.exitCode=1;});
