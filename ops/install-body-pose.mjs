// Explicit operator approval only. Public pinned artifacts; no npm lifecycle scripts.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const plan=JSON.parse(await readFile(new URL('./body-pose-install-plan.json',import.meta.url),'utf8'));
if(!process.argv.includes('--ack-install'))throw Error('EXPLICIT_MODEL_INSTALL_APPROVAL_REQUIRED');
const root=path.resolve(process.env.LOCALAPPDATA,plan.install_subdirectory);
if(!root.toLowerCase().startsWith(path.resolve(process.env.LOCALAPPDATA,'LivingUniverse') .toLowerCase()+path.sep))throw Error('INSTALL_PATH_ESCAPE');
let downloaded=0;
async function download(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('DOWNLOAD_'+r.status);const chunks=[];for await(const chunk of r.body){downloaded+=chunk.length;if(downloaded>plan.maximum_download_bytes)throw Error('DOWNLOAD_BUDGET_EXCEEDED');chunks.push(chunk);}return Buffer.concat(chunks);}
const sdk=await download(plan.sdk.url),integrity='sha512-'+createHash('sha512').update(sdk).digest('base64');if(integrity!==plan.sdk.integrity)throw Error('SDK_INTEGRITY_MISMATCH');
const model=await download(plan.model.url);if(model.length!==plan.model.bytes||createHash('md5').update(model).digest('hex')!==plan.model.md5||createHash('sha256').update(model).digest('hex')!==plan.model.sha256)throw Error('MODEL_INTEGRITY_MISMATCH');
await mkdir(root);const archive=path.join(root,'sdk.tgz');await writeFile(archive,sdk);
const exec=promisify(execFile),{stdout}=await exec('tar',['-tzf',archive],{windowsHide:true});
for(const entry of stdout.trim().split(/\r?\n/)){const s=entry.replaceAll('\\','/');if(!s.startsWith('package/')||s.split('/').includes('..')||s.includes(':'))throw Error('ARCHIVE_PATH_ESCAPE');}
await exec('tar',['-xzf',archive,'-C',root,'--strip-components=1'],{windowsHide:true});
await writeFile(path.join(root,'pose_landmarker_full.task'),model);
await writeFile(path.join(root,'installation.json'),JSON.stringify({plan,installed_at:new Date().toISOString(),downloaded_bytes:downloaded,model_sha256:createHash('sha256').update(model).digest('hex')},null,2));
console.log(JSON.stringify({root,downloaded_bytes:downloaded,paid_usd:0,private_uploads:0}));
