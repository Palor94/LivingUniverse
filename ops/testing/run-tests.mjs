import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const selected=process.argv.slice(2);
if(selected.some(p=>!/^tests\/[A-Za-z0-9_.-]+\.test\.mjs$/.test(p)))throw Error('Select tests/*.test.mjs files only; manual pilots are never test entries.');
const files=selected.length?selected:(await fs.readdir(path.join(project,'tests'))).filter(p=>p.endsWith('.test.mjs')).sort().map(p=>'tests/'+p);
const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'lu-synthetic-suite-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','PSMODULEPATH'].includes(key.toUpperCase())));
for(const name of ['temp','local','home','xdg-data','xdg-config','xdg-cache'])await fs.mkdir(path.join(sandbox,name));
Object.assign(env,{TEMP:path.join(sandbox,'temp'),TMP:path.join(sandbox,'temp'),TMPDIR:path.join(sandbox,'temp'),HOME:path.join(sandbox,'home'),USERPROFILE:path.join(sandbox,'home'),LOCALAPPDATA:path.join(sandbox,'local'),XDG_DATA_HOME:path.join(sandbox,'xdg-data'),XDG_CONFIG_HOME:path.join(sandbox,'xdg-config'),XDG_CACHE_HOME:path.join(sandbox,'xdg-cache'),LU_IMAGE_DECODER:'portable',NODE_OPTIONS:'--import='+pathToFileURL(path.join(project,'ops','testing','network-guard.mjs')).href});
console.log(JSON.stringify({mode:'synthetic-tests',platform:process.platform,node:process.version,sqlite:process.versions.sqlite,files:files.length,concurrency:1,decoder:env.LU_IMAGE_DECODER,external_network:false,inherited_credentials:false}));
const child=spawn(process.execPath,['--test','--test-concurrency=1',...files],{cwd:project,env,stdio:'inherit',windowsHide:true});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',value=>resolve(value??1));});
// Clean up only this invocation's fresh synthetic directory, never a configured path.
if(path.dirname(sandbox)!==os.tmpdir()||!path.basename(sandbox).startsWith('lu-synthetic-suite-'))throw Error('Unsafe test cleanup boundary.');
await fs.rm(sandbox,{recursive:true,force:true,maxRetries:3,retryDelay:100});
process.exitCode=code;
