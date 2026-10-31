import {runtimeHome} from '../app/runtime-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {launch} from './start-tunnel.mjs';
import {setTimeout} from 'node:timers/promises';
import {supervise} from './supervisor.mjs';

// Diagnostic tail only: no HTTP payload logging, bounded to 64 KiB.
const dir=path.join(runtimeHome(),'mcp-runtime');
mkdirSync(dir,{recursive:true});
let tail='';
function record(value){
  tail=(tail+String(value).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted key]')).slice(-65536);
  writeFileSync(path.join(dir,'startup-task.log'),tail);
}
record(new Date().toISOString()+' TASK_START\n');
try{
  if(process.argv.length!==2)throw Error('Unsupported task option.');
  await supervise({run:()=>launch({unattended:true,onOutput:record}),wait:setTimeout,record});
}
catch(error){record('TASK_START_FAILED: '+error.name+' '+(error.code||'')+' '+error.message+'\n');process.exitCode=1;}
