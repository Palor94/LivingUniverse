// System status (2026-11-11): after a Windows restart nothing came back because the startup
// tasks still pointed to the project's old folder, and nobody noticed until Grok failed. This
// module only READS: the three "Living Universe" scheduled tasks (does each program, script and
// working directory exist?), whether the Grok gateway answers on loopback, whether the ChatGPT
// tunnel client is running, and whether the API keys are present (never their values).
// The home screen shows a warning with the exact fix; nothing is changed from here.
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const TASKS=[['Living Universe catalogue runtime','app\\start-existing.mjs'],['Living Universe Grok Gateway','mcp\\grok-task-runner.mjs'],['Living Universe Private MCP Tunnel','mcp\\task-runner.mjs']];
const run=(file,args,timeout=8000)=>new Promise(ok=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:1<<20,encoding:'utf8'},(error,stdout)=>ok(error?null:stdout)));

// A live/ready daemon can still fail every cloud poll. Never return last_error:
// provider diagnostics may contain credential fragments or private identifiers.
export function tunnelHealth(health,metrics,now=Date.now()){
  const control=health?.components?.['control-plane']?.details;
  const code=control?.http_status;
  const match=String(metrics).match(/^commands_poll_last_successful_timestamp_seconds(?:\{[^\n]*\})?\s+([\d.eE+-]+)\s*$/m);
  const timestamp=match?Number(match[1])*1000:0;
  const recent=Number.isFinite(timestamp)&&timestamp>0&&timestamp<=now+5000&&now-timestamp<120_000;
  const authenticated=code!==401&&code!==403;
  const connected=health?.live===true&&health?.ready===true&&recent&&authenticated;
  return {running:health?.live===true,connected,reason:connected?null:!authenticated?'authentication_failed':'not_connected',http_status:Number.isInteger(code)?code:null};
}

export async function readTunnelHealth({file,fetcher=fetch,now=Date.now()}){
  // The URL is written by this installation's daemon, outside synchronized storage.
  const address=(await readFile(file,'utf8')).trim();
  if(!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/?$/.test(address))throw Error('Invalid local tunnel health address.');
  const base=new URL(address);
  const [health,metrics]=await Promise.all(['/health?details=true','/metrics'].map(async route=>{
    const response=await fetcher(new URL(route,base),{redirect:'error',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Error('Tunnel health unavailable.');
    const text=await response.text();if(text.length>1<<20)throw Error('Tunnel health exceeds bound.');return text;
  }));
  return tunnelHealth(JSON.parse(health),metrics,now);
}

export function checkTask(task,projectRoot,script){
  if(!task)return {ok:false,problem:'missing'};
  const exe=task.exe||'',args=task.args||'',dir=task.dir||'';
  const scriptPath=(args.match(/"([^"]+\.mjs)"/)||args.match(/(\S+\.mjs)/)||[])[1]||null;
  const problems=[];
  if(!exe||!existsSync(exe))problems.push('program');
  if(dir&&!existsSync(dir))problems.push('folder');
  if(!scriptPath||!existsSync(scriptPath))problems.push('script');
  else if(path.resolve(scriptPath).toLowerCase()!==path.resolve(projectRoot,script).toLowerCase())problems.push('other_copy');
  return {ok:!problems.length,problems,program:exe,script:scriptPath,folder:dir||null,expected:{program:process.execPath,script:path.join(projectRoot,script),folder:projectRoot}};
}

// tailscale (2026-11-13): async () => {installed,state}; Grok, ChatGPT and the phone all depend on
// it and it stopped twice in one day. freshness: () => {restart_needed,changed_count}.
// Start-up grace (2026-11-13): the three tasks start together at log-on; the first status check
// ran a second after this program started, before the tunnel and gateway were up, and the home
// screen said "the tunnel is not running" after every start. During the first startGraceMs a
// gateway or tunnel that is not ready yet is reported as "starting", not as a problem, and the
// result is cached only briefly so the next look shows the real state.
export function installSystemStatus({projectRoot,recentErrors=()=>[],gatewayPort=4320,platform=process.platform,readTasks=null,probe=null,tunnelRunning=null,tunnelHealthFile=path.join(process.env.LOCALAPPDATA||'','LivingUniverse','mcp-runtime','health.url'),tailscale=null,freshness=null,startedAt=Date.now(),startGraceMs=0,now=()=>Date.now()}){
  let cache=null,cachedAt=0;
  async function tasks(){
    if(readTasks)return readTasks();
    if(platform!=='win32')return null;
    const ps=`[Console]::OutputEncoding=[Text.Encoding]::UTF8;@(Get-ScheduledTask -TaskName 'Living Universe*' -ErrorAction SilentlyContinue|ForEach-Object{$a=$_.Actions[0];[pscustomobject]@{name=$_.TaskName;exe=$a.Execute;args=$a.Arguments;dir=$a.WorkingDirectory}})|ConvertTo-Json -Compress`;
    const out=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],15000);if(out===null)return null;
    try{const v=JSON.parse(out.trim()||'[]');return Array.isArray(v)?v:[v];}catch{return null;}
  }
  const gateway=()=>probe?probe():new Promise(ok=>{const req=http.get({host:'127.0.0.1',port:gatewayPort,path:'/.well-known/oauth-authorization-server',timeout:3000},res=>{res.resume();ok(res.statusCode===200);});req.on('error',()=>ok(false));req.on('timeout',()=>{req.destroy();ok(false);});});
  async function tunnel(){
    if(tunnelRunning){const value=await tunnelRunning();return typeof value==='boolean'?{running:value,connected:value,reason:value?null:'stopped'}:value;}
    if(platform!=='win32')return {running:null,connected:null,reason:'unverified'};
    try{return await readTunnelHealth({file:tunnelHealthFile});}catch{}
    const out=await run('tasklist.exe',['/FI','IMAGENAME eq tunnel-client.exe','/FO','CSV','/NH']);return out===null?null:/tunnel-client\.exe/i.test(out);
  }
  async function status({fresh=false}={}){
    if(!fresh&&cache&&Date.now()-cachedAt<(cache.starting?.length?10_000:60_000))return cache;
    const inGrace=now()-startedAt<startGraceMs;
    const [list,gw,tunnelResult,ts]=await Promise.all([tasks(),gateway(),tunnel(),tailscale?tailscale().catch(()=>null):null]);
    const tailscaleState=ts?.installed?ts.state:null;let code=null;try{code=freshness?.()||null;}catch{}
    const detail=typeof tunnelResult==='boolean'?{running:tunnelResult,connected:false,reason:tunnelResult?'unverified':'stopped'}:tunnelResult;
    const tn=detail?.connected??null;
    const startup=list===null?null:TASKS.map(([name,script])=>({name,...checkTask(list.find(t=>t.name===name),projectRoot,script)}));
    const keys={openai:!!process.env.OPENAI_API_KEY,xai:!!process.env.XAI_API_KEY};
    // Unexpected server errors of the last 24 hours (error-log.mjs): what and where, no stacks.
    let errors=[];try{errors=recentErrors()||[];}catch{}
    const starting=inGrace?[...(gw?[]:['gateway']),...(tn===true||detail?.reason==='authentication_failed'?[]:['tunnel'])]:[];
    if(starting.includes('tunnel'))Object.assign(detail||{},{reason:'starting'});
    const problems=[...(startup||[]).filter(t=>!t.ok).map(t=>'task:'+t.name),...(gw||starting.includes('gateway')?[]:['gateway']),...(tn===true||starting.includes('tunnel')?[]:['tunnel']),...(errors.length?['errors']:[]),...(tailscaleState&&tailscaleState!=='Running'?['tailscale']:[]),...(code?.restart_needed?['restart']:[])];
    cache={checked_at:new Date().toISOString(),ok:!problems.length,problems,starting,startup,gateway:gw,tunnel:tn,tunnel_status:detail||{running:null,connected:null,reason:'unverified'},keys,errors,tailscale:tailscaleState,restart_needed:!!code?.restart_needed,changed_count:code?.changed_count||0};cachedAt=Date.now();return cache;
  }
  async function handle({p,req,url,json}){
    if(p==='/api/system/status'&&req.method==='GET'){json(await status({fresh:url?.searchParams.get('fresh')==='1'}));return true;}
    return false;
  }
  return {status,handle};
}
