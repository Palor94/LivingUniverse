// Background job ledger (debugging package, 2026-11-13). One place that says what ran in the
// background, for how long, and how it ended: world rounds, scans, folder sync, imports,
// generation, renames, deletes. Before, each part kept its own flag and a cut-off round looked
// "running" for ever; a stopped Tailscale was noticed only when Grok failed.
//
//  - watch(kind, probe): polls a busy flag (every 5 s); each busy stretch becomes one job.
//  - start(kind): explicit jobs (start → done/failed).
//  - stuck(): jobs running longer than their limit, plus a world round whose saved status says
//    "running" while nothing runs (unstick marks it interrupted, nothing else).
//  - connectivity: Tailscale, the Grok gateway and the ChatGPT tunnel sampled every 5 minutes;
//    only changes are written, so outages and their length can be listed later.
//  - cost: today's AI spend and the latest round compared with the usual (median) ones.
// Files (outside OneDrive, capped like errors.log): <dataDir>/logs/jobs.log, connectivity.log.
// Metadata only: kind, times, outcome, error code and message, never prompts or data.
import {appendFileSync,mkdirSync,readFileSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const STUCK_MINUTES={world_round:15,scan:30,import:30,generation:30,default:20};
const MAX_BYTES=512*1024;

function appendCapped(file,entry){
  try{
    mkdirSync(path.dirname(file),{recursive:true});
    try{if(statSync(file).size>MAX_BYTES)renameSync(file,file.replace(/\.log$/,'.1.log'));}catch(e){if(e.code!=='ENOENT')throw e;}
    appendFileSync(file,JSON.stringify(entry)+'\n');
  }catch{/* best effort */}
}
function readLines(file,limit){
  let text='';try{text=readFileSync(file,'utf8');}catch{return [];}
  return text.trimEnd().split('\n').slice(-limit).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
}
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};

// Turns a list of state changes into outages: from the first "bad" state to the next "ok".
export function outagesFrom(changes,{now=Date.now()}={}){
  const out=[],open=new Map();
  for(const c of [...changes].sort((a,b)=>a.at.localeCompare(b.at))){
    if(!c.ok&&!open.has(c.what))open.set(c.what,c);
    if(c.ok&&open.has(c.what)){const s=open.get(c.what);open.delete(c.what);out.push({what:c.what,state:s.state,from:s.at,to:c.at,minutes:Math.round((Date.parse(c.at)-Date.parse(s.at))/60000)});}
  }
  for(const s of open.values())out.push({what:s.what,state:s.state,from:s.at,to:null,minutes:Math.round((now-Date.parse(s.at))/60000)});
  return out.sort((a,b)=>b.from.localeCompare(a.from));
}

// Cost compared with the usual: today against the median of the earlier days, the latest round
// against the median of the earlier rounds. An alert needs both "twice the usual" and a sum
// worth mentioning, so a cheap day after free days does not raise one.
export function costAlert({days=[],runs=[],today,minUsd=0.2}){
  const todayCost=days.find(d=>d.day===today)?.cost_usd||0;
  const usualDay=median(days.filter(d=>d.day!==today).map(d=>d.cost_usd));
  const [latest,...earlier]=runs;
  const usualRun=median(earlier.map(r=>r.cost_usd));
  const dayAlert=usualDay!==null&&todayCost>=minUsd&&todayCost>2*Math.max(usualDay,0.01);
  const runAlert=!!latest&&usualRun!==null&&latest.cost_usd>=minUsd/2&&latest.cost_usd>2*Math.max(usualRun,0.005);
  return {today_usd:+todayCost.toFixed(4),usual_day_usd:usualDay===null?null:+usualDay.toFixed(4),latest_run_usd:latest?+latest.cost_usd.toFixed(4):null,usual_run_usd:usualRun===null?null:+usualRun.toFixed(4),day_alert:dayAlert,run_alert:runAlert};
}

export function createJobLedger({dataDir,now=()=>Date.now(),all=null,worldEngine=null,systemStatus=null,every=5000,sampleEvery=5*60_000}={}){
  const jobsFile=dataDir?path.join(dataDir,'logs','jobs.log'):null;
  const netFile=dataDir?path.join(dataDir,'logs','connectivity.log'):null;
  const running=new Map(),recent=[],timers=[];
  const iso=t=>new Date(t).toISOString();

  function start(kind,detail=null){
    const job={id:randomUUID(),kind,detail:detail?String(detail).slice(0,200):null,started_at:iso(now())};
    running.set(job.id,job);
    const end=(outcome,extra={})=>{
      if(!running.delete(job.id))return null;
      const done={...job,...extra,outcome,finished_at:iso(now()),ms:now()-Date.parse(job.started_at)};
      recent.push(done);if(recent.length>200)recent.shift();
      if(jobsFile)appendCapped(jobsFile,done);
      return done;
    };
    return {id:job.id,done:(extra)=>end('done',extra),failed:(e)=>end('failed',{error:{code:typeof e?.code==='string'?e.code:'FAILED',message:String(e?.message||e||'').slice(0,300)}})};
  }

  // A busy flag (true or a label) polled every few seconds. The label becomes the job's detail.
  function watch(kind,probe){
    let current=null;
    const tick=()=>{let v=null;try{v=probe();}catch{}
      if(v&&!current)current=start(kind,typeof v==='string'?v:null);
      else if(!v&&current){current.done();current=null;}};
    const t=setInterval(tick,every);t.unref?.();timers.push(t);tick();
  }

  let lastNet=new Map();
  async function sample(){
    if(!systemStatus)return;
    let s;try{s=await systemStatus.status({fresh:true});}catch{return;}
    const states=[['gateway',s.gateway?'ok':'down',!!s.gateway],['tunnel',s.tunnel===true?'ok':(s.tunnel_status?.reason||'down'),s.tunnel===true]];
    if(s.tailscale)states.push(['tailscale',s.tailscale.state||'unknown',s.tailscale.state==='Running']);
    for(const [what,state,ok] of states){
      // Still coming up after a start (system-status grace): not an outage.
      if(s.starting?.includes(what))continue;
      if(lastNet.get(what)===state)continue;
      lastNet.set(what,state);
      if(netFile)appendCapped(netFile,{at:iso(now()),what,state,ok});
    }
  }
  function startSampling(){const t=setInterval(sample,sampleEvery);t.unref?.();timers.push(t);sample();}

  function stuck(){
    const out=[];
    for(const j of running.values()){
      const minutes=(now()-Date.parse(j.started_at))/60000,limit=STUCK_MINUTES[j.kind]??STUCK_MINUTES.default;
      if(minutes>limit)out.push({kind:j.kind,detail:j.detail,started_at:j.started_at,minutes:Math.round(minutes),can_unstick:false});
    }
    if(worldEngine){
      const r=worldEngine.roundState();const last=r.last;
      if(last&&!last.finished_at){
        const minutes=(now()-Date.parse(last.started_at))/60000;
        if(!r.running||minutes>STUCK_MINUTES.world_round)out.push({kind:'world_round',detail:last.step,started_at:last.started_at,minutes:Math.round(minutes),can_unstick:!r.running});
      }
    }
    return out;
  }

  function cost(){
    if(!all)return null;
    const days=all('SELECT day,cost_usd FROM world_usage ORDER BY day DESC LIMIT 8');
    const runs=all('SELECT cost_usd,created_at FROM world_runs ORDER BY created_at DESC LIMIT 21');
    const today=iso(now()).slice(0,10);
    return costAlert({days,runs,today});
  }

  function view({limit=50}={}){
    const history=jobsFile?readLines(jobsFile,limit):recent.slice(-limit);
    const changes=netFile?readLines(netFile,500):[];
    return {running:[...running.values()],recent:history.reverse(),stuck:stuck(),
      connectivity:{current:Object.fromEntries([...lastNet]),outages:outagesFrom(changes,{now:now()}).slice(0,30)},cost:cost()};
  }

  function unstick({kind,confirm}={}){
    if(kind!=='world_round'||!worldEngine)throw Object.assign(Error('Unknown job.'),{status:400});
    if(confirm!==true)throw Object.assign(Error('Confirm the repair.'),{status:400});
    const r=worldEngine.clearStuckRound();
    if(jobsFile)appendCapped(jobsFile,{id:r.id,kind:'world_round',detail:'interrupted',started_at:r.started_at,finished_at:r.finished_at,outcome:'interrupted'});
    return {unstuck:true,round:r};
  }

  // Doctor checks: stuck jobs and unusual cost.
  function checks(){
    const out=[],s=stuck(),c=cost();
    out.push({id:'jobs',state:s.length?'warn':'ok',data:{stuck:s.length,running:running.size}});
    if(c)out.push({id:'cost',state:c.day_alert||c.run_alert?'warn':'ok',data:{today:c.today_usd,usual:c.usual_day_usd}});
    const down=outagesFrom(netFile?readLines(netFile,200):[],{now:now()}).filter(o=>!o.to);
    if(down.length)out.push({id:'outage',state:'warn',data:{what:down.map(o=>o.what),minutes:Math.max(...down.map(o=>o.minutes))}});
    return out;
  }

  async function handle({p,req,body,json}){
    if(p==='/api/dev/jobs'&&req.method==='GET'){json(view());return true;}
    if(p==='/api/dev/jobs/unstick'&&req.method==='POST'){json(unstick(body||{}));return true;}
    return false;
  }
  return {start,watch,startSampling,sample,stuck,cost,view,unstick,checks,handle,close:()=>{for(const t of timers)clearInterval(t);}};
}
