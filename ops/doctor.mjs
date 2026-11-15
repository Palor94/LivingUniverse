#!/usr/bin/env node
// Doctor from the command line (2026-11-12): asks the RUNNING program what is wrong, read-only.
//
//   npm run doctor                 summary of every check
//   npm run doctor -- --deep       also SQLite quick_check (takes a few seconds)
//   npm run doctor -- --errors     the latest server errors with their stacks
//   npm run doctor -- --requests   the latest API requests (slow and failed are marked)
//   npm run doctor -- --report     write everything (checks, errors, slow and failed requests, AI calls,
//                                  slow statements, restart log) to one Markdown file and print its path
//   npm run doctor -- --weekly     the weekly health report (errors, slow requests, AI, cost, jobs,
//                                  outages, data audit) as a Markdown file in the diagnostics folder
//   npm run doctor -- --port 4327  ask a sandbox instead of the real program
//
// Exit code: 0 when everything is fine, 1 when something needs attention, 2 when the
// program does not answer.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const flag=name=>process.argv.includes('--'+name);
const origin='http://127.0.0.1:'+Number(arg('port',4317));
const icon={ok:'✓',warn:'!',bad:'✕',unknown:'?',off:'–'};

async function get(route){
  const r=await fetch(origin+route,{signal:AbortSignal.timeout(30000)});
  if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;throw e;}
  return r.json();
}

export function describe(c){
  const extra=Object.entries(c).filter(([k])=>!['id','state'].includes(k)).map(([k,v])=>`${k}=${Array.isArray(v)?v.join(','):v}`).join(' ');
  return `${icon[c.state]||'?'} ${c.id.padEnd(10)} ${extra}`;
}

// One file with everything needed to look into a problem later. Written outside OneDrive, to
// %LOCALAPPDATA%\LivingUniverse\diagnostics. Paths and SQL text may appear; cell values,
// prompts, answers and request bodies are never logged in the first place.
async function report(){
  const [d,errors,requests,ai,queries,restart]=await Promise.all([get('/api/dev/doctor?deep=1'),get('/api/dev/log?kind=errors&limit=30'),get('/api/dev/log?kind=requests&limit=300'),get('/api/dev/log?kind=ai&limit=50'),get('/api/dev/log?kind=queries&limit=50'),get('/api/dev/log?kind=restart&limit=60')]);
  const bad=requests.entries.filter(e=>e.slow||e.status>=400);
  const md=[`# Diagnostics ${d.checked_at}`,'',`State: **${d.state}** · pid ${d.process.pid} · Node ${d.process.node} · up ${Math.round(d.process.uptime_s/60)} min · ${d.process.rss_mb} MB`,'',
    '## Checks','',...d.checks.map(c=>'- '+describe(c)),'',d.steps_ms?'Steps: '+Object.entries(d.steps_ms).map(([k,v])=>`${k} ${v} ms`).join(', ')+'\n':'',
    d.code.changed.length?'## Changed since start\n\n'+d.code.changed.map(f=>'- '+f.file).join('\n')+'\n':'',
    `## Database\n\n${d.database.size_mb} MB, WAL ${d.database.wal_mb} MB, integrity ${d.database.integrity}\n`+(d.database.tables||[]).map(t=>`- ${t.name}: ${t.rows}`).join('\n'),'',
    '## Errors','',...(errors.entries.length?errors.entries.map(e=>`### ${e.at} ${e.method||''} ${e.route||e.source||''}\n\n${e.message}\n\n\`\`\`\n${String(e.stack||'').split('\n').slice(0,10).join('\n')}\n\`\`\``):['None.']),'',
    '## Slow or failed requests','',...(bad.length?bad.map(e=>`- ${e.at} ${e.status} ${e.ms} ms ${e.method} ${e.route}`):['None.']),'',
    '## AI calls','',...(ai.entries.length?ai.entries.map(e=>`- ${e.at} ${e.provider}/${e.model} ${e.ms} ms first ${e.first_text_ms??'–'} ms tokens ${e.usage?e.usage.input+'→'+e.usage.output:'–'} ${e.error||e.finish||''}`):['None.']),'',
    '## Slow statements','',...(queries.entries.length?queries.entries.map(e=>`- ${e.ms} ms \`${e.sql}\``):['None.']),'',
    '## Restart log','','```',...restart.lines,'```',''].join('\n');
  const {promises:fs}=await import('node:fs');const path=(await import('node:path')).default;
  const dir=path.join(process.env.LOCALAPPDATA||'.','LivingUniverse','diagnostics');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'diagnostics-'+d.checked_at.replace(/[:.]/g,'-')+'.md');await fs.writeFile(file,md,{flag:'wx'});
  console.log('Report written: '+file);
  return d.state==='ok'?0:1;
}

const OLD_PROGRAM='The running program has no developer tools yet (restart it to load the new code).';
async function weekly(){
  const r=await get('/api/dev/weekly');
  const {weeklyMarkdown}=await import('../app/weekly-report.mjs');
  const {promises:fs}=await import('node:fs');const path=(await import('node:path')).default;
  const dir=path.join(process.env.LOCALAPPDATA||'.','LivingUniverse','diagnostics');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'heti-jelentes-'+r.to.slice(0,10)+'.md');await fs.writeFile(file,weeklyMarkdown(r));
  console.log('Weekly report written: '+file);
  return r.errors.server||r.jobs.failed.length||r.jobs.stuck.length?1:0;
}

async function main(){
  if(flag('weekly'))return weekly().catch(e=>{if(e.status!==404)throw e;console.log(OLD_PROGRAM);return 1;});
  if(flag('report'))return report().catch(e=>{if(e.status!==404)throw e;console.log(OLD_PROGRAM);return 1;});
  if(flag('errors')){
    const {entries}=await get('/api/dev/log?kind=errors&limit='+Number(arg('limit',10)));
    if(!entries.length)return console.log('No server errors logged.'),0;
    for(const e of entries)console.log(`\n${e.at} ${e.method||''} ${e.route||e.source||''}\n  ${e.message}\n${String(e.stack||'').split('\n').slice(1,8).join('\n')}`);
    return 1;
  }
  if(flag('requests')){
    const {entries}=await get('/api/dev/log?kind=requests&limit='+Number(arg('limit',40))+(arg('filter')?'&filter='+encodeURIComponent(arg('filter')):''));
    for(const e of entries.reverse())console.log(`${e.at.slice(11,19)} ${String(e.status).padEnd(3)} ${String(e.ms).padStart(6)}ms ${e.slow?'SLOW ':''}${e.method} ${e.route}`);
    return 0;
  }
  let d;
  try{d=await get('/api/dev/doctor'+(flag('deep')?'?deep=1':''));}
  catch(e){
    if(e.status!==404)throw e;
    // The running program is older than the developer tools: show the basic status and say so.
    const s=await get('/api/system/status');
    console.log(OLD_PROGRAM);
    console.log(JSON.stringify({ok:s.ok,problems:s.problems,gateway:s.gateway,tunnel:s.tunnel,errors:s.errors?.length||0},null,1));
    return s.ok?0:1;
  }
  console.log(`State: ${d.state.toUpperCase()}   pid ${d.process.pid} · Node ${d.process.node} · up ${Math.round(d.process.uptime_s/60)} min · ${d.process.rss_mb} MB`);
  for(const c of d.checks)console.log('  '+describe(c));
  if(d.code.changed.length)console.log('\nChanged since start (restart needed):\n'+d.code.changed.map(f=>'  '+f.file).join('\n'));
  if(d.database.integrity)console.log('\nDatabase integrity: '+d.database.integrity);
  if(d.steps_ms)console.log('Steps: '+Object.entries(d.steps_ms).map(([k,v])=>`${k} ${v} ms`).join(', '));
  return d.state==='ok'?0:1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(e=>{
    // An answer with an error status is not "does not answer": say what the program said.
    console.error(e.status?`The program at ${origin} answered ${e.message}.`:`The program at ${origin} does not answer (${e.message}).`);process.exitCode=2;});
