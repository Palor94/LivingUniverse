// Rendszerállapot (developer tools, 2026-11-12): checks, recent errors with details, the last
// API requests and the explicit "restart everything" action. Server side: app/dev-tools.mjs.
import {t} from './i18n.js';

export function installDevToolsUI({$,$$,esc,api,toast,heading}){
  let tab='checks',deep=false,waiting=null;
  const when=v=>v?new Date(v).toLocaleString('hu-HU'):'';
  const mark={ok:'✓',warn:'!',bad:'✕',unknown:'?',off:'–'};

  function detail(c){
    if(c.id==='code')return c.count?t('dev.d.code',{count:c.count}):'';
    if(c.id==='database')return t('dev.d.database',{size:c.size_mb,wal:c.wal_mb});
    if(c.id.startsWith('disk_'))return c.free_gb===null?'':t('dev.d.disk',{free:c.free_gb});
    if(c.id==='mobile')return c.state==='off'?t('dev.d.mobileOff'):t('dev.d.mobile',{port:c.port,origin:c.origin||''});
    if(c.id==='tailscale')return t('dev.d.tailscale',{state:c.backend,name:c.name||''});
    if(c.id==='task')return c.name+(c.problems?.length?' ('+c.problems.map(p=>t('sys.part.'+p)).join(', ')+')':'');
    if(c.id==='tunnel')return c.reason?t('dev.d.tunnel.'+c.reason):'';
    if(c.id==='errors')return c.count?t('dev.d.errors',{count:c.count}):'';
    if(c.id==='requests')return t('dev.d.requests',{slow:c.slow,failed:c.failed});
    if(c.id==='busy')return c.what;
    if(c.id==='lag')return t('dev.d.lag',{p99:c.p99_ms,max:c.max_ms})+(c.max_at&&c.max_ms>=500?t('dev.d.lagAt',{at:new Date(c.max_at).toLocaleTimeString('hu-HU')}):'');
    if(c.id==='ai')return t('dev.d.ai',{calls:c.calls,errors:c.errors,ms:c.avg_ms});
    if(c.id==='queries')return t('dev.d.queries',{slow:c.slow,total:c.total,ms:c.threshold_ms});
    if(c.id==='jobs')return t('dev.d.jobs',{stuck:c.stuck,running:c.running});
    if(c.id==='cost')return t('dev.d.cost',{today:(c.today??0).toFixed(2),usual:c.usual===null||c.usual===undefined?'–':c.usual.toFixed(2)});
    if(c.id==='outage')return t('dev.d.outage',{what:(c.what||[]).join(', '),minutes:c.minutes});
    return '';
  }
  const row=c=>`<li class="dev-check dev-${c.state}"><span class="dev-mark" aria-hidden="true">${mark[c.state]||'?'}</span><div><b>${esc(t('dev.check.'+c.id))}</b> <small class="muted">${esc(detail(c))}</small>${c.state==='bad'||c.state==='warn'?`<br><small>${esc(t('dev.fix.'+c.id))}</small>`:''}</div></li>`;

  async function paintChecks(box){
    const d=await api('/api/dev/doctor'+(deep?'?deep=1':''));
    const order={bad:0,warn:1,unknown:2,off:3,ok:4};
    const checks=[...d.checks].sort((a,b)=>order[a.state]-order[b.state]);
    const changed=d.code.changed.length?`<details class="dev-more"><summary>${esc(t('dev.changedFiles',{count:d.code.changed_count}))}</summary><ul>${d.code.changed.map(f=>`<li><code>${esc(f.file)}</code> <small class="muted">${esc(when(f.changed_at))}</small></li>`).join('')}</ul></details>`:'';
    box.innerHTML=`<p class="dev-summary dev-${d.state}">${esc(t('dev.state.'+d.state))} <small class="muted">${esc(t('dev.checkedAt',{at:when(d.checked_at)}))}</small></p>
      <ul class="dev-checks">${checks.map(row).join('')}</ul>${changed}
      ${d.database.tables?`<details class="dev-more"><summary>${t('dev.tables')}</summary><table class="dev-table">${d.database.tables.map(x=>`<tr><td><code>${esc(x.name)}</code></td><td>${x.rows}</td></tr>`).join('')}</table></details>`:''}
      <p class="muted"><small>${esc(t('dev.process',{pid:d.process.pid,node:d.process.node,started:when(d.process.started_at),rss:d.process.rss_mb}))}${d.database.integrity?' · '+esc(t('dev.integrity',{result:d.database.integrity})):''}${d.steps_ms&&Object.keys(d.steps_ms).length?'<br>'+esc(t('dev.steps',{steps:Object.entries(d.steps_ms).map(([k,v])=>k+' '+v+' ms').join(', ')})):''}</small></p>
      <div class="we-row"><button id="dev-deep" class="subtle">${t('dev.deep')}</button><button id="dev-restart" class="primary"${d.restart.available?'':' disabled'}>${t('dev.restart')}</button>${d.restart.available?'':`<small class="muted">${t('dev.restartUnavailable')}</small>`}</div>`;
    $('#dev-deep').onclick=()=>{deep=true;paint();};
    $('#dev-restart').onclick=restart;
  }

  async function paintErrors(box){
    const {entries}=await api('/api/dev/log?kind=errors&limit=50');
    box.innerHTML=entries.length?`<ul class="dev-log">${entries.map(e=>`<li><details><summary><small class="muted">${esc(when(e.at))}</small> ${esc(e.method||'')} <code>${esc(e.route||e.source||'')}</code>: ${esc(e.message)}${e.request_id?` <small class="muted">#${esc(e.request_id)}</small>`:''}</summary><pre>${esc(e.stack||'')}${e.steps?.length?'\n\n'+esc(t('dev.stepsBefore'))+'\n'+esc(e.steps.join('\n')):''}</pre></details></li>`).join('')}</ul>`:`<p class="muted">${t('dev.noErrors')}</p>`;
  }

  let filter='';
  async function paintRequests(box){
    const {entries}=await api('/api/dev/log?kind=requests&limit=300'+(filter?'&filter='+filter:''));
    box.innerHTML=`<div class="we-row">${['','slow','failed'].map(f=>`<button class="${f===filter?'primary':'subtle'}" data-dev-filter="${f}">${t('dev.filter.'+(f||'all'))}</button>`).join('')}</div>
      ${entries.length?`<table class="dev-table"><thead><tr><th>${t('dev.col.time')}</th><th>${t('dev.col.request')}</th><th>${t('dev.col.status')}</th><th>${t('dev.col.ms')}</th></tr></thead><tbody>${entries.map(e=>`<tr class="${e.status>=500?'dev-bad':e.status>=400||e.slow?'dev-warn':''}"><td>${esc(new Date(e.at).toLocaleTimeString('hu-HU'))}</td><td>${esc(e.method)} <code>${esc(e.route)}</code></td><td>${e.status}</td><td>${e.ms}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.noRequests')}</p>`}`;
    for(const b of $$('[data-dev-filter]',box))b.onclick=()=>{filter=b.dataset.devFilter;paint();};
  }

  async function paintRestartLog(box){
    const {lines}=await api('/api/dev/log?kind=restart&limit=80');
    box.innerHTML=lines.length?`<pre class="dev-pre">${esc(lines.join('\n'))}</pre>`:`<p class="muted">${t('dev.noRestartLog')}</p>`;
  }

  async function paintAi(box){
    const [{entries},{days}]=await Promise.all([api('/api/dev/log?kind=ai&limit=100'),api('/api/dev/log?kind=ai-stats&days=7')]);
    const pct=v=>v===null||v===undefined?'–':Math.round(v*100)+'%';
    const stats=days.length?`<h3>${t('dev.aiStats')}</h3><table class="dev-table"><thead><tr><th>${t('dev.col.day')}</th><th>${t('dev.col.model')}</th><th>${t('dev.col.calls')}</th><th>${t('dev.col.errors')}</th><th>${t('dev.col.truncated')}</th><th>${t('dev.col.cache')}</th><th>${t('dev.col.ms')}</th><th>p95</th></tr></thead><tbody>${days.map(d=>`<tr class="${d.errors?'dev-bad':d.truncated?'dev-warn':''}"><td>${esc(d.day)}</td><td>${esc(d.provider)} <small class="muted">${esc(d.model||'')}</small></td><td>${d.calls}</td><td>${d.errors}</td><td>${d.truncated}</td><td>${pct(d.cache_share)}</td><td>${d.avg_ms??'–'}</td><td>${d.p95_ms??'–'}</td></tr>`).join('')}</tbody></table><h3>${t('dev.aiLast')}</h3>`:'';
    box.innerHTML=stats+(entries.length?`<p class="muted"><small>${t('dev.aiNote')}</small></p><table class="dev-table"><thead><tr><th>${t('dev.col.time')}</th><th>${t('dev.col.model')}</th><th>${t('dev.col.ms')}</th><th>${t('dev.col.first')}</th><th>${t('dev.col.tokens')}</th><th>${t('dev.col.result')}</th></tr></thead><tbody>${entries.map(e=>`<tr class="${e.error?'dev-bad':e.finish==='length'?'dev-warn':''}"><td>${esc(new Date(e.at).toLocaleTimeString('hu-HU'))}</td><td>${esc(e.provider)} <small class="muted">${esc(e.model||'')}</small></td><td>${e.ms}</td><td>${e.first_text_ms??'–'}</td><td>${e.usage?`${e.usage.input}${e.usage.cached?' ('+e.usage.cached+')':''} → ${e.usage.output}`:'–'}</td><td>${esc(e.error||e.finish||'')}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.noAi')}</p>`);
  }

  // ---- debugging package (2026-11-13): jobs, data audit, connector, weekly report, bug reports ----
  const time=v=>v?new Date(v).toLocaleTimeString('hu-HU'):'';
  async function paintJobs(box){
    const j=await api('/api/dev/jobs');
    const money=v=>v===null||v===undefined?'–':v.toFixed(2)+' $';
    const c=j.cost;
    box.innerHTML=`${j.stuck.length?`<div class="dev-alert">${j.stuck.map(s=>`<p>⚠ ${esc(t('dev.job.'+s.kind,{}))} ${esc(t('dev.jobStuck',{minutes:s.minutes}))}${s.detail?` <small class="muted">(${esc(s.detail)})</small>`:''} ${s.can_unstick?`<button class="primary" data-unstick="${esc(s.kind)}">${t('dev.unstick')}</button>`:''}</p>`).join('')}</div>`:''}
      ${c?`<p class="${c.day_alert||c.run_alert?'dev-warn':''}">${esc(t('dev.costLine',{today:money(c.today_usd),usual:money(c.usual_day_usd),run:money(c.latest_run_usd),usualRun:money(c.usual_run_usd)}))}${c.day_alert?' · '+esc(t('dev.costDayAlert')):''}${c.run_alert?' · '+esc(t('dev.costRunAlert')):''}</p>`:''}
      <h3>${t('dev.jobsRunning',{count:j.running.length})}</h3>${j.running.length?`<ul class="dev-log">${j.running.map(r=>`<li>${esc(t('dev.job.'+r.kind))} ${r.detail?`<small class="muted">${esc(r.detail)}</small>`:''} · ${esc(t('dev.since',{at:time(r.started_at)}))}</li>`).join('')}</ul>`:`<p class="muted">${t('dev.none')}</p>`}
      <h3>${t('dev.jobsRecent')}</h3>${j.recent.length?`<table class="dev-table"><thead><tr><th>${t('dev.col.time')}</th><th>${t('dev.col.job')}</th><th>${t('dev.col.ms')}</th><th>${t('dev.col.result')}</th></tr></thead><tbody>${j.recent.map(r=>`<tr class="${r.outcome==='done'?'':'dev-bad'}"><td>${esc(when(r.started_at))}</td><td>${esc(t('dev.job.'+r.kind))} <small class="muted">${esc(r.detail||'')}</small></td><td>${r.ms??'–'}</td><td>${esc(t('dev.outcome.'+r.outcome))}${r.error?': '+esc(r.error.message):''}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.none')}</p>`}
      <h3>${t('dev.outages')}</h3>${j.connectivity.outages.length?`<ul class="dev-log">${j.connectivity.outages.map(o=>`<li class="${o.to?'':'dev-bad'}">${esc(t('dev.net.'+o.what))}: ${esc(o.state)} · ${esc(when(o.from))}${o.to?' – '+esc(time(o.to)):' – '+esc(t('dev.now'))} (${o.minutes} ${t('dev.minutes')})</li>`).join('')}</ul>`:`<p class="muted">${t('dev.noOutages')}</p>`}`;
    for(const b of $$('[data-unstick]',box))b.onclick=async()=>{if(!confirm(t('dev.unstickConfirm')))return;try{await api('/api/dev/jobs/unstick',{kind:b.dataset.unstick,confirm:true});toast(t('dev.unstuck'));paint();}catch(e){toast(e.message,true);}};
  }

  async function paintAudit(box){
    box.innerHTML=`<p class="muted">${t('dev.loading')}</p>`;
    const a=await api('/api/dev/audit');
    const groups=['orphans','tree','conflicts'];
    box.innerHTML=`<p class="dev-summary ${a.problems?'dev-warn':'dev-ok'}">${esc(a.problems?t('dev.auditProblems',{count:a.problems}):t('dev.auditOk'))} <small class="muted">${esc(t('dev.checkedAt',{at:when(a.checked_at)}))} · ${a.ms} ms</small></p><p class="muted"><small>${t('dev.auditLead')}</small></p>
      ${groups.map(g=>`<h3>${t('dev.auditGroup.'+g)}</h3><ul class="dev-checks">${a.checks.filter(c=>c.group===g).map(c=>`<li class="dev-check dev-${c.error?'bad':c.count?'warn':'ok'}"><span class="dev-mark" aria-hidden="true">${c.error?'✕':c.count?'!':'✓'}</span><div><b>${esc(t('dev.audit.'+c.id))}</b> <small class="muted">${c.error?esc(c.error):c.count?esc(t('dev.auditCount',{count:c.count})):''}</small>
        ${c.count?`<br><small>${esc(t('dev.auditFix.'+c.id))}</small><details class="dev-more"><summary>${t('dev.auditExamples')}</summary><ul>${c.sample.map(s=>`<li><code>${esc(s.text)}</code></li>`).join('')}</ul></details>${c.repairable?`<button class="subtle" data-repair="${esc(c.id)}">${t('dev.repair')}</button>`:''}`:''}</div></li>`).join('')}</ul>`).join('')}`;
    for(const b of $$('[data-repair]',box))b.onclick=async()=>{const c=a.checks.find(x=>x.id===b.dataset.repair);if(!confirm(t('dev.repairConfirm',{what:t('dev.audit.'+c.id),count:c.count})))return;
      try{const r=await api('/api/dev/audit/repair',{check:c.id,confirm:true});toast(t('dev.repaired',{count:r.changed}));paint();}catch(e){toast(e.message,true);}};
  }

  async function paintConnector(box){
    const c=await api('/api/dev/connector');
    const problems=c.problems.map(p=>`<p class="dev-warn">⚠ ${esc(t('dev.conn.problem.'+p))}</p>`).join('');
    box.innerHTML=`${problems||`<p class="dev-summary dev-ok">${t('dev.conn.ok')}</p>`}
      <p class="muted"><small>${esc(t('dev.conn.version',{version:c.code_version,count:c.tool_count}))}</small></p>
      <h3>${t('dev.conn.clients')}</h3>${c.clients.length?`<table class="dev-table"><thead><tr><th>${t('dev.col.client')}</th><th>${t('dev.col.last')}</th><th>${t('dev.col.list')}</th><th>${t('dev.col.calls')}</th><th>${t('dev.col.errors')}</th><th>${t('dev.col.code')}</th></tr></thead><tbody>${c.clients.map(x=>`<tr class="${x.old_code||x.stale_calls?'dev-warn':''}"><td>${esc(t('dev.conn.client.'+x.client))}</td><td>${esc(when(x.last_at))}</td><td>${x.last_list?esc(when(x.last_list))+' ('+x.listed+')':'–'}</td><td>${x.calls}</td><td>${x.errors}${x.stale_calls?' · '+esc(t('dev.conn.staleCalls',{count:x.stale_calls})):''}</td><td>${x.old_code?esc(t('dev.conn.oldCode')):'✓'}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.conn.noCalls')}</p>`}
      ${c.schema_errors.length?`<h3>${t('dev.conn.schemaErrors')}</h3><ul class="dev-log">${c.schema_errors.map(e=>`<li class="dev-bad"><code>${esc(e)}</code></li>`).join('')}</ul>`:''}
      <h3>${t('dev.conn.calls')}</h3>${c.calls.length?`<table class="dev-table"><thead><tr><th>${t('dev.col.time')}</th><th>${t('dev.col.client')}</th><th>${t('dev.col.tool')}</th><th>${t('dev.col.result')}</th><th>${t('dev.col.ms')}</th></tr></thead><tbody>${c.calls.map(x=>`<tr class="${x.ok?'':'dev-bad'}"><td>${esc(when(x.at))}</td><td>${esc(t('dev.conn.client.'+x.client))}</td><td><code>${esc(x.tool)}</code></td><td>${x.ok?'✓':esc(x.code||'')}</td><td>${x.ms??''}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.conn.noCalls')}</p>`}
      <details class="dev-more"><summary>${esc(t('dev.conn.tools',{count:c.tool_count}))}</summary><ul>${c.tools.map(x=>`<li><code>${esc(x.name)}</code> <small class="muted">${esc(t('dev.conn.group.'+x.group))}${x.issues.length?' · '+esc(x.issues.join('; ')):''}</small></li>`).join('')}</ul></details>`;
  }

  async function paintWeekly(box){
    box.innerHTML=`<p class="muted">${t('dev.loading')}</p>`;
    const r=await api('/api/dev/weekly');
    const li=(cls,text)=>`<li class="${cls}">${esc(text)}</li>`;
    box.innerHTML=`<p class="muted">${esc(t('dev.weekRange',{from:r.from.slice(0,10),to:r.to.slice(0,10)}))}</p>
      <h3>${t('dev.weekErrors',{total:r.errors.total,server:r.errors.server,client:r.errors.client})}</h3><ul class="dev-log">${r.errors.top.map(e=>li(e.source==='client'?'dev-warn':'dev-bad',`${e.count}× ${e.route||''}: ${e.message}`)).join('')||`<li class="muted">${t('dev.none')}</li>`}</ul>
      <h3>${t('dev.weekSlow')}</h3><ul class="dev-log">${r.slow_requests.map(s=>li('dev-warn',t('dev.weekSlowLine',{route:s.route,slow:s.slow,failed:s.failed,ms:s.max_ms}))).join('')||`<li class="muted">${t('dev.none')}</li>`}</ul>
      <h3>${t('dev.weekAi')}</h3><p>${esc(t('dev.weekAiLine',{calls:r.ai.calls,errors:r.ai.errors,truncated:r.ai.truncated,cache:r.ai.cache_share===null?'–':Math.round(r.ai.cache_share*100)+'%',cost:r.cost.total_usd.toFixed(2)}))}</p>
      <h3>${t('dev.weekJobs',{total:r.jobs.total})}</h3><ul class="dev-log">${[...r.jobs.failed.map(j=>li('dev-bad',`${t('dev.job.'+j.kind)} · ${when(j.at)}: ${j.error}`)),...r.jobs.stuck.map(j=>li('dev-warn',`${t('dev.job.'+j.kind)} ${t('dev.jobStuck',{minutes:j.minutes})}`))].join('')||`<li class="muted">${t('dev.none')}</li>`}</ul>
      <h3>${t('dev.outages')}</h3><ul class="dev-log">${r.outages.map(o=>li(o.to?'':'dev-bad',`${t('dev.net.'+o.what)}: ${o.state} · ${when(o.from)} (${o.minutes} ${t('dev.minutes')})`)).join('')||`<li class="muted">${t('dev.noOutages')}</li>`}</ul>
      <h3>${t('dev.tab.audit')}</h3><p>${r.audit?(r.audit.problems?r.audit.checks.map(c=>esc(t('dev.audit.'+c.id))+': '+c.count).join(' · '):esc(t('dev.auditOk'))):'–'}</p>`;
  }

  async function paintReports(box){
    const r=await api('/api/dev/bug-reports');
    box.innerHTML=`<p class="muted"><small>${esc(t('dev.reportsLead',{folder:r.folder}))}</small></p>
      <div class="we-row"><button id="dev-report-new" class="primary">${t('pdbg.report')}</button></div>
      ${r.reports.length?`<table class="dev-table"><thead><tr><th>${t('dev.col.report')}</th><th>${t('dev.col.note')}</th><th></th></tr></thead><tbody>${r.reports.map(x=>`<tr><td><code>${esc(x.name)}</code></td><td>${esc(x.note||'')}</td><td>${x.snapshot?`<button class="subtle" data-replay="${esc(x.name)}">${t('dev.replay')}</button>`:`<small class="muted">${t('dev.noSnapshot')}</small>`}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.noReports')}</p>`}`;
    $('#dev-report-new').onclick=async()=>{const {reportBug}=await import('./play-debug.js');const trail=window.__luTrail;
      reportBug({api,toast,esc,state:{at:new Date().toISOString(),window:[innerWidth,innerHeight],screen:'Rendszerállapot',steps:trail?.steps(40)||[],requests:trail?.api(40)||[],errors:trail?.errors(20)||[]}});};
    for(const b of $$('[data-replay]',box))b.onclick=async()=>{if(!confirm(t('dev.replayConfirm')))return;
      try{const s=await api('/api/dev/bug-reports/'+encodeURIComponent(b.dataset.replay)+'/sandbox',{confirm:true});toast(t('dev.replayStarted',{url:s.url}));setTimeout(()=>window.open(s.url,'_blank','noopener'),4000);}catch(e){toast(e.message,true);}};
  }
  async function paintQueries(box){
    const {entries,threshold_ms}=await api('/api/dev/log?kind=queries&limit=100');
    box.innerHTML=entries.length?`<p class="muted"><small>${t('dev.queriesNote',{ms:threshold_ms})}</small></p><table class="dev-table"><thead><tr><th>${t('dev.col.time')}</th><th>${t('dev.col.ms')}</th><th>SQL</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(new Date(e.at).toLocaleTimeString('hu-HU'))}</td><td>${e.ms}</td><td><code>${esc(e.sql)}</code></td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('dev.noQueries',{ms:threshold_ms})}</p>`;
  }

  async function restart(){    if(!confirm(t('dev.restartConfirm')))return;
    try{await api('/api/dev/restart',{confirm:true});}catch(e){toast(e.message,true);return;}
    toast(t('dev.restarting'));
    // The program goes away and comes back; reload when it answers again (at most 3 minutes).
    const started=Date.now();let seenDown=false;
    clearInterval(waiting);
    waiting=setInterval(async()=>{
      let up=false;try{up=(await fetch('/api/dev/doctor',{cache:'no-store'})).ok;}catch{}
      if(!up)seenDown=true;
      if(up&&(seenDown||Date.now()-started>45_000)){clearInterval(waiting);location.reload();}
      if(Date.now()-started>180_000){clearInterval(waiting);toast(t('dev.restartSlow'),true);}
    },2000);
  }

  let host=null;
  async function paint(){
    if(!host)return;
    host.innerHTML=heading(t('dev.kicker'),t('dev.title'),t('dev.lead'),`<button id="dev-refresh" class="subtle">${t('dev.refresh')}</button>`)
      +`<div class="we-row dev-tabs">${['checks','errors','requests','ai','queries','jobs','audit','connector','weekly','reports','restart'].map(x=>`<button class="${x===tab?'primary':'subtle'}" data-dev-tab="${x}">${t('dev.tab.'+x)}</button>`).join('')}</div><section id="dev-body"><p class="muted">${t('dev.loading')}</p></section>`;
    $('#dev-refresh').onclick=()=>paint();
    for(const b of $$('[data-dev-tab]'))b.onclick=()=>{tab=b.dataset.devTab;paint();};
    const box=$('#dev-body');
    try{await ({checks:paintChecks,errors:paintErrors,requests:paintRequests,ai:paintAi,queries:paintQueries,jobs:paintJobs,audit:paintAudit,connector:paintConnector,weekly:paintWeekly,reports:paintReports,restart:paintRestartLog}[tab])(box);}
    catch(e){box.innerHTML=`<p class="qt-error">${esc(e.message)}</p>`;}
    deep=false;
  }
  return {render:async el=>{host=el;await paint();},leave:()=>{host=null;}};
}
