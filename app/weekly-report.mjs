// Weekly health report (debugging package, 2026-11-13): one short summary of the last 7 days
// from the logs the program already keeps: errors grouped by what and where, slow requests
// (since the last start), AI calls (cut-off answers, errors, cache) and cost, background jobs
// that failed or got stuck, outages, and the data audit. Rendszerállapot › Heti jelentés, or
// `npm run doctor -- --weekly` for a Markdown file.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {readMeasurements,measurementSummary} from './ux-measurements.mjs';

function readJsonLines(file){
  const out=[];
  for(const f of [file.replace(/\.log$/,'.1.log'),file]){
    let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
    for(const l of text.split('\n')){if(!l)continue;try{out.push(JSON.parse(l));}catch{}}
  }
  return out;
}

export async function weeklyReport({dataDir,all,requestLog,aiTrace,jobs,audit,now=()=>Date.now(),days=7}){
  const since=new Date(now()-days*86400e3).toISOString();
  const logs=path.join(dataDir,'logs');
  const errors=readJsonLines(path.join(logs,'errors.log')).filter(e=>e.at>=since);
  const groups=new Map();
  for(const e of errors){const key=e.source+'|'+(e.route||'')+'|'+e.message;const g=groups.get(key)||{source:e.source,route:e.route,message:e.message,count:0,last:e.at};g.count++;g.last=e.at;groups.set(key,g);}
  const slow=new Map();
  for(const r of requestLog?.list({limit:300})||[]){if(!r.slow&&r.status<500)continue;const g=slow.get(r.route)||{route:r.route,slow:0,failed:0,max_ms:0};if(r.slow)g.slow++;if(r.status>=500)g.failed++;g.max_ms=Math.max(g.max_ms,r.ms);slow.set(r.route,g);}
  const ai=aiTrace?.stats?.({days})||[];
  const aiTotal=ai.reduce((s,g)=>({calls:s.calls+g.calls,errors:s.errors+g.errors,truncated:s.truncated+g.truncated,input:s.input+g.input,cached:s.cached+g.cached}),{calls:0,errors:0,truncated:0,input:0,cached:0});
  let cost=[];try{cost=all('SELECT day,calls,cost_usd FROM world_usage WHERE day>=? ORDER BY day',since.slice(0,10));}catch{}
  const jobView=jobs?.view({limit:500})||{recent:[],stuck:[],connectivity:{outages:[]}};
  const weekJobs=jobView.recent.filter(j=>(j.started_at||'')>=since);
  let auditResult=null;try{auditResult=audit?await audit():null;}catch{}
  return {
    from:since,to:new Date(now()).toISOString(),
    ux:measurementSummary(readMeasurements(dataDir),{since,to:new Date(now()).toISOString()}),
    errors:{total:errors.length,server:errors.filter(e=>e.source!=='client').length,client:errors.filter(e=>e.source==='client').length,top:[...groups.values()].sort((a,b)=>b.count-a.count).slice(0,10)},
    slow_requests:[...slow.values()].sort((a,b)=>b.slow+b.failed-(a.slow+a.failed)).slice(0,10),
    ai:{...aiTotal,cache_share:aiTotal.input?+(aiTotal.cached/aiTotal.input).toFixed(3):null,by_day:ai},
    cost:{total_usd:+cost.reduce((s,d)=>s+(d.cost_usd||0),0).toFixed(4),days:cost},
    jobs:{total:weekJobs.length,failed:weekJobs.filter(j=>j.outcome==='failed'||j.outcome==='interrupted').map(j=>({kind:j.kind,at:j.started_at,error:j.error?.message||j.outcome})),stuck:jobView.stuck},
    outages:jobView.connectivity.outages.filter(o=>(o.to||'9')>=since),
    audit:auditResult?{problems:auditResult.problems,checks:auditResult.checks.filter(c=>c.count).map(c=>({id:c.id,count:c.count}))}:null,
  };
}

export function weeklyMarkdown(r){
  const line=(label,value)=>`- ${label}: ${value}`;
  return [`# Heti állapotjelentés`,'',`${r.from.slice(0,10)} – ${r.to.slice(0,10)}`,'',
    '## Hibák','',line('összesen',r.errors.total),line('szerver',r.errors.server),line('böngésző',r.errors.client),'',
    ...r.errors.top.map(e=>`- ${e.count}× ${e.source} ${e.route||''}: ${e.message}`),'',
    '## Lassú vagy hibás kérések (indulás óta)','',...(r.slow_requests.length?r.slow_requests.map(s=>`- ${s.route}: ${s.slow} lassú, ${s.failed} hibás, leghosszabb ${s.max_ms} ms`):['Nincs.']),'',
    '## AI','',line('hívások',r.ai.calls),line('hibák',r.ai.errors),line('csonka válaszok',r.ai.truncated),line('gyorsítótár aránya',r.ai.cache_share===null?'–':Math.round(r.ai.cache_share*100)+'%'),line('költség',r.cost.total_usd.toFixed(2)+' USD'),'',
    '## Háttérfeladatok','',line('futott',r.jobs.total),...r.jobs.failed.map(j=>`- hiba: ${j.kind} ${j.at}: ${j.error}`),...r.jobs.stuck.map(j=>`- beragadt: ${j.kind} (${j.minutes} perce)`),'',
    '## Feladatmérések','',...((r.ux||[]).length?r.ux.map(m=>`- ${{talk:'Első mondatig',background:'Háttér beállítása',other:'Egyéb feladat'}[m.task]} (${m.surface==='phone'?'telefon':'laptop'}): ${m.runs} mérés, átlag ${m.avg_clicks} kattintás, ${(m.avg_ms/1000).toFixed(1)} mp`):['Nincs lezárt mérés.']),'',
    '## Kiesések','',...(r.outages.length?r.outages.map(o=>`- ${o.what}: ${o.state}, ${o.from}${o.to?' – '+o.to:' (most is)'} (${o.minutes} perc)`):['Nincs.']),'',
    '## Adatellenőrzés','',r.audit?(r.audit.problems?r.audit.checks.map(c=>`- ${c.id}: ${c.count}`).join('\n'):'Nincs eltérés.'):'Nem futott.',''].join('\n');
}
