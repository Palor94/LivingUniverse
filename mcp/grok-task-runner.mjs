import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {supervise} from './supervisor.mjs';

const mcp=JSON.parse(readFileSync(process.env.LU_MCP_CONFIG||path.join(process.env.LOCALAPPDATA,'LivingUniverse','mcp-config.json'),'utf8'));
const dir=path.join(path.dirname(mcp.database),'grok-runtime');mkdirSync(dir,{recursive:true});let tail='';
const record=value=>{tail=(tail+String(value).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]')).slice(-16384);writeFileSync(path.join(dir,'gateway.log'),tail);};
record(new Date().toISOString()+' GATEWAY_SUPERVISOR_START\n');
await supervise({record,wait:setTimeout,run:()=>new Promise(resolve=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('./http-gateway.mjs',import.meta.url))],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',record);child.stderr.on('data',record);child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??1));
})});
