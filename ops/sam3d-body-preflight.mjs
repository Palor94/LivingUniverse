// Public source audit only. No weights, dependencies, private images or cloud calls.
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import plan from './sam3d-body-plan.mjs';
if(!process.argv.includes('--ack-install'))throw Error('OWNER_APPROVAL_REQUIRED');
const base=path.resolve(process.env.LOCALAPPDATA,'LivingUniverse'),root=path.resolve(process.env.LOCALAPPDATA,plan.install_subdirectory);
if(!root.toLowerCase().startsWith(base.toLowerCase()+path.sep)||root.toLowerCase().includes('onedrive'))throw Error('LOCAL_PATH_REQUIRED');
await mkdir(root,{recursive:true});
const journalPath=path.join(root,'download-ledger.json'),lock=await open(journalPath+'.lock','wx');
try{
  let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  journal??={maximum_download_bytes:plan.maximum_download_bytes,previous_successful_artifact_bytes:plan.previous_successful_artifact_bytes,downloaded_bytes:0,artifacts:[]};
  if(journal.maximum_download_bytes!==plan.maximum_download_bytes)throw Error('BUDGET_CHANGED');
  const save=()=>writeFile(journalPath,JSON.stringify(journal,null,2));
  const url=`https://codeload.github.com/facebookresearch/sam-3d-body/zip/${plan.source_commit}`,zip=path.join(root,'source.zip');
  if(!journal.artifacts.some(x=>x.url===url&&x.status==='complete')){
    const entry={url,status:'downloading',bytes:0};journal.artifacts.push(entry);await save();
    const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
    const chunks=[];try{for await(const chunk of r.body){
      journal.downloaded_bytes+=chunk.length;entry.bytes+=chunk.length;
      if(journal.previous_successful_artifact_bytes+plan.metadata_reserve_bytes+journal.downloaded_bytes>journal.maximum_download_bytes||entry.bytes>25000000)throw Error('DOWNLOAD_CAP_REACHED');
      chunks.push(chunk);
    }}finally{await save();}
    const bytes=Buffer.concat(chunks);await writeFile(zip,bytes,{flag:'wx'});entry.sha256=createHash('sha256').update(bytes).digest('hex');entry.status='complete';await save();
  }
  const source=journal.artifacts.find(x=>x.url===url&&x.status==='complete');
  if(createHash('sha256').update(await readFile(zip)).digest('hex')!==source.sha256)throw Error('SOURCE_HASH_CHANGED');
  const exec=promisify(execFile),prefix='sam-3d-body-'+plan.source_commit;
  const {stdout}=await exec('tar',['-tf',zip],{windowsHide:true,maxBuffer:2000000});
  for(const name of stdout.trim().split(/\r?\n/)){const s=name.replaceAll('\\','/');if(!s.startsWith(prefix+'/')||s.includes(':')||s.split('/').includes('..'))throw Error('SOURCE_PATH_ESCAPE');}
  const detail=await exec('tar',['-tvf',zip],{windowsHide:true,maxBuffer:3000000});
  if(detail.stdout.trim().split(/\r?\n/).some(x=>!/^[-d]/.test(x)))throw Error('SOURCE_LINK_REFUSED');
  const sourceRoot=path.join(root,prefix);try{await readFile(path.join(sourceRoot,'INSTALL.md'));}catch(e){if(e.code!=='ENOENT')throw e;await exec('tar',['-xf',zip,'-C',root],{windowsHide:true});}
  const estimator=await readFile(path.join(sourceRoot,'sam_3d_body','sam_3d_body_estimator.py'),'utf8');
  const report={checked_at:new Date().toISOString(),plan,source_root:sourceRoot,source_sha256:source.sha256,downloaded_bytes:journal.downloaded_bytes,remaining_bytes:plan.maximum_download_bytes-plan.previous_successful_artifact_bytes-plan.metadata_reserve_bytes-journal.downloaded_bytes,cpu_portability_blocker:estimator.includes('recursive_to(batch, "cuda")'),status:'source_audited_weights_not_installed',private_uploads:0,paid_usd:0};
  await writeFile(path.join(root,'preflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await lock.close();const {unlink}=await import('node:fs/promises');await unlink(journalPath+'.lock');}
