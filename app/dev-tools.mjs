// Developer tools (2026-11-12): one place to see what the running program is doing, so
// debugging no longer depends on guessing. Everything here is local (loopback desktop only,
// never the mobile listener) and read-only, except the explicit "restart everything" action.
//
//   GET  /api/dev/doctor[?deep=1]       checks: process, code freshness, database, disks,
//                                       media root, mobile listener, Tailscale, startup tasks
//   GET  /api/dev/log?kind=errors|requests|restart|ai|queries[&limit=n]
//   POST /api/dev/client-error          a browser error, written to errors.log (source: client)
//   POST /api/dev/restart {confirm:true} runs ops/lu-control.ps1 restart outside this process
//
// Privacy: request entries keep method, path, status and duration only (no query strings,
// bodies or headers). Tailscale output is reduced to its state and this machine's name.
import {execFile} from 'node:child_process';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,statSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';

// quick_check, foreign keys and the largest tables, on a worker thread with a read-only
// connection (WAL readers never block the program's writer).
const DEEP_CHECK=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');
let db;try{db=new DatabaseSync(workerData,{readOnly:true});
const integrity=db.prepare('PRAGMA quick_check').all().map(r=>Object.values(r)[0]).join('; ');
let fk=null;try{fk=db.prepare('PRAGMA foreign_key_check').all().length;}catch{}
let tables=null;try{tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>({name,rows:db.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').get().n})).sort((a,b)=>b.rows-a.rows).slice(0,15);}catch{}
parentPort.postMessage({integrity,foreign_key_problems:fk,tables});}catch(e){parentPort.postMessage({integrity:'error: '+e.message,foreign_key_problems:null,tables:null});}finally{db?.close();}`;
export function deepDatabaseCheck(file,{timeout=120_000}={}){
  return new Promise((resolve,reject)=>{
    const w=new Worker(DEEP_CHECK,{eval:true,workerData:file});
    const timer=setTimeout(()=>{w.terminate();reject(Error('The database check took too long.'));},timeout);
    w.once('message',m=>{clearTimeout(timer);resolve(m);w.terminate();});
    w.once('error',e=>{clearTimeout(timer);reject(e);});
  });
}

export const SLOW_MS=2000;
const LOW_DISK=5*1024**3;
const CODE_DIRS=['app','app/play','mcp'];

// The last API requests, newest first. Picture and file responses are left out (a gallery page
// alone fetches hundreds), JSON answers and every failure are kept.
export function createRequestLog({size=300,now=()=>Date.now()}={}){
  const items=[];
  function record({method,route,status,ms,json=true,id=null}){
    if(!String(route).startsWith('/api/'))return;
    if(!json&&status<400)return;
    items.push({at:new Date(now()).toISOString(),method,route:String(route).slice(0,200),status,ms:Math.round(ms),slow:ms>=SLOW_MS,...(id?{id}:{})});
    if(items.length>size)items.shift();
  }
  // Attach to one request: records when the answer has been sent (or the client went away).
  // Headers given to writeHead() are invisible to getHeader(), so the sent header block is read.
  function track(req,res,id=null){
    const started=performance.now(),route=String(req.url||'').split('?')[0];
    res.once('close',()=>record({method:req.method,route,status:res.statusCode,ms:performance.now()-started,id,json:/application\/(x-ndjson|json)/i.test(String(res.getHeader('content-type')||'')+(res._header||''))}));
  }
  const list=({limit=100,filter=null}={})=>items.filter(e=>filter==='slow'?e.slow:filter==='failed'?e.status>=400:true).slice(-limit).reverse();
  return {record,track,list};
}

// AI calls (cycle 2): one entry per Grok/mock call with timing, tokens, how it ended and the
// error code. Never the prompt or the answer (they carry private character data). Kept in
// memory and in <dataDir>/logs/ai-calls.log (capped like errors.log).
export function createAiTrace({dataDir=null,size=100,now=()=>Date.now(),maxBytes=512*1024}={}){
  const items=[],wrapped=new WeakMap();
  const file=dataDir?path.join(dataDir,'logs','ai-calls.log'):null;
  function persist(entry){
    if(!file)return;
    try{
      mkdirSync(path.dirname(file),{recursive:true});
      try{if(statSync(file).size>maxBytes)renameSync(file,file.replace(/\.log$/,'.1.log'));}catch(e){if(e.code!=='ENOENT')throw e;}
      appendFileSync(file,JSON.stringify(entry)+'\n');
    }catch{/* best effort */}
  }
  function record(entry){items.push(entry);if(items.length>size)items.shift();persist(entry);}
  function wrap(provider){
    if(!provider||typeof provider.complete!=='function')return provider;
    if(wrapped.has(provider))return wrapped.get(provider);
    const traced={...provider,complete:async request=>{
      const started=performance.now();let first=null;
      const onDelta=request.onDelta?(...a)=>{if(first===null)first=performance.now()-started;return request.onDelta(...a);}:null;
      const base={at:new Date(now()).toISOString(),provider:provider.name||'?',model:provider.model||null,streamed:!!onDelta,max_tokens:request.maxTokens??null,prompt_chars:String(request.system||'').length+String(request.user||'').length};
      try{
        const result=await provider.complete({...request,...(onDelta?{onDelta}:{})});
        record({...base,ms:Math.round(performance.now()-started),first_text_ms:first===null?null:Math.round(first),usage:result?.usage||null,finish:result?.finish||null,error:null});
        return result;
      }catch(e){
        record({...base,ms:Math.round(performance.now()-started),first_text_ms:first===null?null:Math.round(first),usage:null,finish:null,error:typeof e?.code==='string'?e.code:'AI_FAILED'});
        throw e;
      }
    }};
    wrapped.set(provider,traced);return traced;
  }
  const list=({limit=50}={})=>items.slice(-limit).reverse();
  // Daily statistics per model (debugging package, 2026-11-13) from the saved log: calls, errors,
  // cut-off answers (finish "length"), share of cached prompt tokens, average and p95 time.
  function stats({days=7}={}){
    let entries=items;
    if(file){entries=[];for(const f of [file.replace(/\.log$/,'.1.log'),file]){let text='';try{text=readFileSync(f,'utf8');}catch{continue;}for(const l of text.split('\n')){if(!l)continue;try{entries.push(JSON.parse(l));}catch{}}}}
    // Local calendar days, like the AI cost days (world_usage), not UTC days.
    const localDay=t=>{const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('sv-SE');};
    const since=localDay(now()-days*86400e3),groups=new Map();
    for(const e of entries){
      const day=localDay(e.at||'');if(!day||day<since)continue;
      const key=day+'|'+(e.provider||'?')+'|'+(e.model||'');
      if(!groups.has(key))groups.set(key,{day,provider:e.provider||'?',model:e.model||null,calls:0,errors:0,truncated:0,input:0,cached:0,output:0,ms:[],first:[]});
      const g=groups.get(key);g.calls++;if(e.error)g.errors++;if(e.finish==='length')g.truncated++;
      if(e.usage){g.input+=e.usage.input||0;g.cached+=e.usage.cached||0;g.output+=e.usage.output||0;}
      if(Number.isFinite(e.ms))g.ms.push(e.ms);if(Number.isFinite(e.first_text_ms))g.first.push(e.first_text_ms);
    }
    const p=(v,q)=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.ceil(q*s.length)-1)]);};
    return [...groups.values()].map(({ms,first,...g})=>({...g,cache_share:g.input?+(g.cached/g.input).toFixed(3):null,avg_ms:ms.length?Math.round(ms.reduce((a,b)=>a+b,0)/ms.length):null,p95_ms:p(ms,0.95),avg_first_ms:first.length?Math.round(first.reduce((a,b)=>a+b,0)/first.length):null}))
      .sort((a,b)=>b.day.localeCompare(a.day)||b.calls-a.calls);
  }
  return {wrap,list,record,stats};
}

// Slow database statements (cycle 2): SQL text only (whitespace collapsed, cut at 300
// characters), never the bound values.
export function createQueryLog({thresholdMs=150,size=100,now=()=>Date.now()}={}){
  const items=[];let total=0;
  function time(sql,fn){
    const started=performance.now();
    try{return fn();}
    finally{const ms=performance.now()-started;total++;
      if(ms>=thresholdMs){items.push({at:new Date(now()).toISOString(),ms:Math.round(ms),sql:String(sql).replace(/\s+/g,' ').trim().slice(0,300)});if(items.length>size)items.shift();}}
  }
  const list=({limit=50}={})=>items.slice(-limit).reverse();
  return {time,list,count:()=>total,thresholdMs};
}

// Server code loaded at startup versus the files on disk now. Client files (app/public) are
// read on every request, so a browser reload is enough for them; server modules need a restart.
// Server code folders: app/, every app/ subfolder except the client (public), and mcp/. Read
// each time, so a newly added folder (like app/play/) is not missed.
function codeDirs(projectRoot){
  let subs=[];try{subs=readdirSync(path.join(projectRoot,'app'),{withFileTypes:true}).filter(d=>d.isDirectory()&&!['public','node_modules'].includes(d.name)).map(d=>'app/'+d.name);}catch{}
  return [...new Set([...CODE_DIRS,...subs])];
}
export function codeFreshness({projectRoot,loadedAt,dirs=codeDirs(projectRoot)}){
  const changed=[];
  for(const dir of dirs){
    let names=[];try{names=readdirSync(path.join(projectRoot,dir));}catch{continue;}
    for(const name of names){
      if(!/\.(mjs|js)$/.test(name))continue;
      const rel=path.posix.join(dir,name);
      try{const m=statSync(path.join(projectRoot,dir,name)).mtimeMs;if(m>loadedAt)changed.push({file:rel,changed_at:new Date(m).toISOString(),part:dir==='mcp'?'mcp':'app'});}catch{}
    }
  }
  changed.sort((a,b)=>b.changed_at.localeCompare(a.changed_at));
  return {loaded_at:new Date(loadedAt).toISOString(),restart_needed:changed.length>0,changed:changed.slice(0,20),changed_count:changed.length};
}

export function decodeLog(buf){
  if(buf[0]===0xff&&buf[1]===0xfe)return buf.subarray(2).toString('utf16le').replace(/﻿/g,'');
  if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.subarray(3).toString('utf8');
  let nul=0;const n=Math.min(buf.length,400);for(let i=1;i<n;i+=2)if(buf[i]===0)nul++;
  return (n>1&&nul>n/4?buf.subarray(0,buf.length-buf.length%2).toString('utf16le'):buf.toString('utf8')).replace(/﻿/g,'');
}

const run=(file,args,timeout=6000)=>new Promise(ok=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:4<<20,encoding:'utf8'},(error,stdout,stderr)=>ok({ok:!error,stdout:stdout||'',stderr:stderr||''})));

// Only the state and this machine's name: peers, addresses and keys never leave this function.
export function parseTailscale(text){
  let s;try{s=JSON.parse(text);}catch{return {state:/stopped/i.test(text)?'Stopped':'unknown',name:null};}
  return {state:s.BackendState||'unknown',name:String(s.Self?.DNSName||'').replace(/\.$/,'')||null};
}
export async function readTailscale(platform=process.platform){
  const candidates=platform==='win32'?['tailscale.exe',path.join(process.env.ProgramFiles||'C:\\Program Files','Tailscale','tailscale.exe')]:['tailscale'];
  for(const exe of candidates){
    const r=await run(exe,['status','--json']);
    if(r.stdout||r.stderr)return {installed:true,...parseTailscale(r.stdout||r.stderr)};
  }
  return {installed:false,state:'unknown',name:null};
}

async function freeBytes(dir){try{const s=await fs.statfs(dir);return s.bavail*s.bsize;}catch{return null;}}

// Runs the project's own controller (ops/lu-control.ps1 restart) through WMI so the new process
// is not a child of this one: stopping the "catalogue runtime" task ends this process and its
// job, and a direct child would be ended with it. Output goes to <dataDir>/logs/restart.log.
export function windowsRestartLauncher({projectRoot,dataDir}){
  return async()=>{
    const script=path.join(projectRoot,'ops','lu-control.ps1');
    if(!existsSync(script))throw Object.assign(Error('The controller script is missing.'),{status:409});
    const logs=path.join(dataDir,'logs');await fs.mkdir(logs,{recursive:true});
    const q=s=>s.replaceAll("'","''");
    const inner=`& '${q(script)}' restart *>> '${q(path.join(logs,'restart.log'))}'`;
    const command=`powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "${inner.replaceAll('"','\\"')}"`;
    const ps=`$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${q(command)}';CurrentDirectory='${q(projectRoot)}'};$r.ReturnValue`;
    const r=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],20000);
    if(!r.ok||r.stdout.trim()!=='0')throw Object.assign(Error('The restart could not be started.'),{status:500});
  };
}

export function installDevTools({projectRoot,dataDir,mediaRoot,db,errorLog,requestLog,aiTrace=createAiTrace(),queryLog=createQueryLog(),systemStatus=null,mobile=()=>null,busy=()=>null,restartLauncher=()=>null,tailscale=null,platform=process.platform,loadedAt=Date.now(),now=()=>Date.now(),fail,extraChecks=()=>[]}){
  let lastRestart=0,clientErrors=[];
  // Event-loop delay (cycle 3): a synchronous scan or a huge query freezes every screen at once.
  // The histogram covers the time since the previous doctor call (or start), then starts over.
  // Measured with a 20 ms timer (how late it fires); perf_hooks.monitorEventLoopDelay missed a
  // 300 ms freeze on this Node version (reported 34 ms).
  // The worst freeze also keeps WHEN it started, so it can be matched with the Requests tab
  // (a 21 s freeze on 2026-11-12 could not be traced afterwards without it).
  const TICK=20;let lagSamples=[],lagSince=now(),expected=performance.now()+TICK,worst={ms:0,at:null};
  const lagTimer=setInterval(()=>{const t=performance.now(),late=Math.max(0,t-expected);lagSamples.push(late);if(late>worst.ms)worst={ms:late,at:now()-late};if(lagSamples.length>20000)lagSamples=lagSamples.slice(-10000);expected=t+TICK;},TICK);lagTimer.unref?.();
  function readLag(){
    const sorted=[...lagSamples].sort((a,b)=>a-b),pick=p=>Math.round(sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)]:0);
    const r={p50_ms:pick(50),p99_ms:pick(99),max_ms:Math.round(sorted.at(-1)||0),max_at:worst.at===null?null:new Date(worst.at).toISOString(),since:new Date(lagSince).toISOString()};
    lagSamples=[];lagSince=now();worst={ms:0,at:null};return r;
  }
  const restartLog=path.join(dataDir,'logs','restart.log');
  const check=(id,state,data={})=>({...data,id,state});

  async function doctor({deep=false}={}){
    const checks=[];
    // How long each part of this check took: a slow doctor answer names its own slow step.
    const steps={},timed=async(name,fn)=>{const t=performance.now();try{return await fn();}finally{steps[name]=Math.round(performance.now()-t);}};
    const mem=process.memoryUsage();
    const proc={pid:process.pid,node:process.version,started_at:new Date(loadedAt).toISOString(),uptime_s:Math.round((now()-loadedAt)/1000),rss_mb:Math.round(mem.rss/1048576),heap_mb:Math.round(mem.heapUsed/1048576)};
    const code=codeFreshness({projectRoot,loadedAt});
    checks.push(check('code',code.restart_needed?'warn':'ok',{count:code.changed_count}));

    const dbFile=path.join(dataDir,'universe.sqlite');
    const size=f=>{try{return statSync(f).size;}catch{return 0;}};
    const database={file:dbFile,size_mb:+(size(dbFile)/1048576).toFixed(1),wal_mb:+(size(dbFile+'-wal')/1048576).toFixed(1),integrity:null};
    // The deep check reads the whole database (about 1.5 s on the live catalogue). It runs on a
    // worker thread with its own read-only connection, so the program keeps answering (2026-11-12).
    if(deep)await timed('database',async()=>{
      const result=await deepDatabaseCheck(dbFile).catch(e=>({integrity:'error: '+e.message,foreign_key_problems:null,tables:null}));
      Object.assign(database,result);
    });
    checks.push(check('database',database.integrity&&database.integrity!=='ok'?'bad':database.wal_mb>200?'warn':'ok',{size_mb:database.size_mb,wal_mb:database.wal_mb}));

    const media=existsSync(mediaRoot);
    checks.push(check('media',media?'ok':'bad'));
    const disks=await timed('disks',async()=>({data:await freeBytes(dataDir),media:media?await freeBytes(mediaRoot):null}));
    for(const [id,free] of Object.entries(disks))checks.push(check('disk_'+id,free===null?'unknown':free<LOW_DISK?'warn':'ok',{free_gb:free===null?null:+(free/1024**3).toFixed(1)}));

    const mob=mobile();
    checks.push(check('mobile',!mob?.enabled?'off':mob.listening?'ok':'bad',{port:mob?.port??null,origin:mob?.origin??null}));
    const ts=mob?.enabled?await timed('tailscale',()=>tailscale?tailscale():readTailscale(platform)):null;
    // "backend", not "state": the check's own state (ok/bad) must not be overwritten by Tailscale's.
    if(ts)checks.push(check('tailscale',!ts.installed?'bad':ts.state==='Running'?'ok':'bad',{backend:ts.state,name:ts.name}));

    let system=null;
    if(systemStatus)system=await timed('system',async()=>{try{return await systemStatus.status({fresh:deep});}catch{return null;}});
    if(system){
      for(const t of system.startup||[])checks.push(check('task',t.ok?'ok':'bad',{name:t.name,problems:t.problems||[]}));
      checks.push(check('gateway',system.gateway?'ok':'bad'));
      checks.push(check('tunnel',system.tunnel===true?'ok':'warn',{reason:system.tunnel_status?.reason||null}));
    }
    const errors=errorLog.recent({limit:50});
    checks.push(check('errors',errors.length?'warn':'ok',{count:errors.length}));
    const slow=requestLog.list({filter:'slow',limit:50}).length,failed=requestLog.list({filter:'failed',limit:300}).filter(e=>e.status>=500).length;
    checks.push(check('requests',failed?'warn':'ok',{slow,failed}));
    const calls=aiTrace.list({limit:20}),aiErrors=calls.filter(c=>c.error).length;
    if(calls.length)checks.push(check('ai',aiErrors?'warn':'ok',{calls:calls.length,errors:aiErrors,avg_ms:Math.round(calls.reduce((s,c)=>s+c.ms,0)/calls.length)}));
    // Only the last hour counts: slow statements at startup must not leave a warning for days.
    const hourAgo=now()-3600e3,slowQueries=queryLog.list({limit:100}).filter(e=>Date.parse(e.at)>=hourAgo).length;
    checks.push(check('queries',slowQueries>=20?'warn':'ok',{slow:slowQueries,total:queryLog.count(),threshold_ms:queryLog.thresholdMs}));
    const loop=readLag();
    checks.push(check('lag',loop.max_ms>=2000||loop.p99_ms>=500?'warn':'ok',{p99_ms:loop.p99_ms,max_ms:loop.max_ms,max_at:loop.max_at}));
    const working=busy();
    if(working)checks.push(check('busy','warn',{what:working}));
    // Stuck jobs, unusual AI cost, ongoing outages (job-ledger.mjs).
    try{for(const c of extraChecks())checks.push(check(c.id,c.state,c.data||{}));}catch{}

    const order={bad:0,warn:1,unknown:2,off:3,ok:4};
    const worst=checks.reduce((w,c)=>order[c.state]<order[w]?c.state:w,'ok');
    return {checked_at:new Date(now()).toISOString(),state:worst==='off'||worst==='unknown'?'ok':worst,checks,process:proc,code,database,event_loop:loop,steps_ms:steps,restart:{available:!!restartLauncher(),last_requested_at:lastRestart?new Date(lastRestart).toISOString():null}};
  }

  function readErrors(limit){
    let text='';try{text=readFileSync(errorLog.file,'utf8');}catch{return [];}
    return text.trimEnd().split('\n').slice(-limit).reverse().map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
  }
  // Windows PowerShell 5.1 writes "*>>" redirections as UTF-16LE (with a BOM, or without one when
  // appending): decoded as UTF-8 the text fell apart. Decided per file from the BOM or the NUL bytes.
  function readRestartLog(limit){
    let text='';try{text=decodeLog(readFileSync(restartLog));}catch{return [];}
    return text.replace(/\r/g,'').trimEnd().split('\n').slice(-limit);
  }

  async function handle({p,req,url,body,json}){
    if(!p.startsWith('/api/dev/'))return false;
    if(p==='/api/dev/doctor'&&req.method==='GET'){json(await doctor({deep:url.searchParams.get('deep')==='1'}));return true;}
    if(p==='/api/dev/log'&&req.method==='GET'){
      const kind=url.searchParams.get('kind')||'errors',limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||100));
      if(kind==='errors')json({kind,entries:readErrors(limit)});
      else if(kind==='requests')json({kind,entries:requestLog.list({limit,filter:url.searchParams.get('filter')})});
      else if(kind==='restart')json({kind,lines:readRestartLog(limit)});
      else if(kind==='ai')json({kind,entries:aiTrace.list({limit})});
      else if(kind==='ai-stats')json({kind,days:aiTrace.stats?.({days:Math.min(31,Math.max(1,Number(url.searchParams.get('days'))||7))})||[]});
      else if(kind==='queries')json({kind,entries:queryLog.list({limit}),threshold_ms:queryLog.thresholdMs});
      else throw fail('Unknown log',400);
      return true;
    }
    if(p==='/api/dev/client-error'&&req.method==='POST'){
      // A broken screen in the browser left no trace on the server. At most 30 per 10 minutes.
      const t=now();clientErrors=clientErrors.filter(x=>t-x<600_000);
      if(clientErrors.length>=30){json({logged:false},202);return true;}
      clientErrors.push(t);
      const text=v=>String(v??'').slice(0,2000);
      errorLog.write({message:text(body?.message)||'Unknown browser error',stack:text(body?.stack)},{source:'client',method:null,route:text(body?.where).slice(0,200)||null,
        requestId:/^[0-9a-f]{8}$/.test(body?.request_id||'')?body.request_id:null,steps:Array.isArray(body?.steps)?body.steps.filter(s=>typeof s==='string'):null});
      json({logged:true},202);return true;
    }
    if(p==='/api/dev/restart'&&req.method==='POST'){
      if(body?.confirm!==true)throw fail('Confirm the restart.',400);
      const launchRestart=restartLauncher();
      if(!launchRestart)throw fail('This copy of the program cannot restart itself.',409);
      const working=busy();if(working)throw fail('Work is in progress ('+working+'). Restart when it has finished.',409);
      if(now()-lastRestart<60_000)throw fail('A restart was requested a moment ago.',429);
      lastRestart=now();
      // A launch that failed did not restart anything: the next try must not wait a minute.
      try{await launchRestart();}catch(e){lastRestart=0;throw e;}
      json({started:true,requested_at:new Date(lastRestart).toISOString()},202);
      return true;
    }
    throw fail('Not found',404);
  }
  return {doctor,handle,close:()=>clearInterval(lagTimer)};
}
