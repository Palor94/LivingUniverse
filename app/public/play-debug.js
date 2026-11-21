// Play debug panel (F9, debugging package 2026-11-13): what the Play screen is doing right now,
// without opening the developer tools. Shows the screen's own state (view, place, open talk),
// requests still running, the last API answers with their time and request id, browser errors
// and the last steps. Buttons: layout self-check, copy everything, and "Hiba jelentése" (the
// desktop only: it saves a bug report bundle on this computer, see app/bug-report.mjs).
import {t} from './i18n.js';
import {layoutProblems} from './layout-check.js';

export function installPlayDebug({esc,api,toast,phone=false,trail=window.__luTrail}){
  let box=null,timer=null,checks=null;
  const time=v=>v?String(v).slice(11,19):'';
  const measurementLine=m=>esc(t('ux.result',{clicks:m.clicks,seconds:(m.ms/1000).toFixed(1)}));
  function taskBody(){
    if(!trail?.startTask)return '';
    const active=trail.activeTask(),results=trail.measurements(),last=results.at(-1),pending=results.filter(m=>!m.saved);
    return `<section class="pdbg-task"><h4>${t('ux.title')}</h4>${active?`<p><b>${esc(t('ux.task.'+active.task))}</b> · ${measurementLine(active)}</p><div class="pdbg-task-actions"><button type="button" data-pdbg="task-end">${t('ux.finish')}</button><button type="button" class="subtle" data-pdbg="task-cancel">${t('common.cancel')}</button></div>`:`<p class="muted">${t('ux.lead')}</p><div class="pdbg-task-actions">${['talk','background','other'].map(task=>`<button type="button" class="subtle" data-pdbg="task-${task}">${esc(t('ux.start',{task:t('ux.task.'+task)}))}</button>`).join('')}</div>`}
      ${last?`<p>${t('ux.last')} <b>${esc(t('ux.task.'+last.task))}</b> · ${measurementLine(last)}</p>`:''}
      ${pending.length?`<p><button type="button" data-pdbg="task-save" ${saving?'disabled':''}>${t(saving?'ux.saving':'ux.retry',{count:pending.length})}</button></p>`:last?`<p class="muted">${t('ux.saved')}</p>`:''}</section>`;
  }
  let saving=false;
  async function saveTasks(){
    if(saving)return;saving=true;paint();
    try{for(const {saved,...record} of trail.measurements().filter(m=>!m.saved)){await api('/api/dev/ux-measurements',record);trail.taskSaved(record.id);}}
    catch{toast(t('ux.saveFailed'),true);}
    finally{saving=false;paint();}
  }
  function body(){
    const ctx=trail?.context()||{},calls=trail?.api(10)||[],flight=trail?.inflight()||[],errors=trail?.errors(8)||[],steps=trail?.steps(15)||[];
    const kv=o=>Object.entries(o||{}).filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(typeof v==='object'?JSON.stringify(v):v)}</td></tr>`).join('');
    return `<header class="pdbg-head"><b>${t('pdbg.title')}</b><span class="muted">F9</span><button type="button" class="subtle" data-pdbg="close" aria-label="${esc(t('common.close'))}">✕</button></header>
      ${taskBody()}
      <section><h4>${t('pdbg.state')}</h4><table class="pdbg-table">${kv(ctx.play)}<tr><th>${t('pdbg.window')}</th><td>${innerWidth}×${innerHeight}</td></tr></table></section>
      <section><h4>${t('pdbg.inflight',{count:flight.length})}</h4>${flight.map(r=>`<p class="pdbg-line">${esc(r.method)} <code>${esc(r.route)}</code> · ${r.ms} ms</p>`).join('')||`<p class="muted">–</p>`}</section>
      <section><h4>${t('pdbg.requests')}</h4>${calls.slice().reverse().map(r=>`<p class="pdbg-line ${r.status>=500||r.status===0?'pdbg-bad':r.status>=400||r.ms>=2000?'pdbg-warn':''}">${time(r.at)} ${esc(r.method)} <code>${esc(r.route)}</code> ${r.status||'×'} · ${r.ms} ms${r.request_id?' · #'+esc(r.request_id):''}</p>`).join('')||`<p class="muted">–</p>`}</section>
      <section><h4>${t('pdbg.errors',{count:errors.length})}</h4>${errors.slice().reverse().map(e=>`<p class="pdbg-line pdbg-bad">${time(e.at)} ${esc(e.message)} <small class="muted">${esc(e.where)}</small></p>`).join('')||`<p class="muted">${t('pdbg.noErrors')}</p>`}</section>
      <section><h4>${t('pdbg.steps')}</h4>${steps.slice().reverse().map(s=>`<p class="pdbg-line">${time(s.at)} <small class="muted">${esc(t('pdbg.kind.'+s.kind))}</small> ${esc(s.text)}</p>`).join('')}</section>
      ${checks?`<section><h4>${t('pdbg.layout',{count:checks.length})}</h4>${checks.map(c=>`<p class="pdbg-line pdbg-warn">${esc(t('pdbg.check.'+c.kind))}: <code>${esc(c.where)}</code> <small class="muted">${esc(c.detail)}</small></p>`).join('')||`<p class="muted">${t('pdbg.layoutOk')}</p>`}</section>`:''}
      <div class="pdbg-actions"><button type="button" class="subtle" data-pdbg="check">${t('pdbg.check')}</button><button type="button" class="subtle" data-pdbg="copy">${t('pdbg.copy')}</button>${phone?'':`<button type="button" class="primary" data-pdbg="report">${t('pdbg.report')}</button>`}</div>`;
  }
  function paint(){
    if(!box)return;
    const scroll=box.scrollTop;box.innerHTML=body();box.scrollTop=scroll;
    for(const b of box.querySelectorAll('[data-pdbg]'))b.onclick=()=>actions[b.dataset.pdbg]?.();
  }
  const snapshot=()=>({at:new Date().toISOString(),window:[innerWidth,innerHeight],context:trail?.context()||{},task:trail?.activeTask?.()||null,measurements:trail?.measurements?.()||[],steps:trail?.steps(40)||[],requests:trail?.api(40)||[],inflight:trail?.inflight()||[],errors:trail?.errors(20)||[],layout:layoutProblems(document.body)});
  const actions={
    close:()=>toggle(false),
    check:()=>{checks=layoutProblems(document.body);paint();},
    copy:async()=>{try{await navigator.clipboard.writeText(JSON.stringify(snapshot(),null,1));toast(t('pdbg.copied'));}catch{toast(t('pdbg.copyFailed'),true);}},
    report:()=>reportBug({api,toast,esc,state:snapshot()}),
    'task-talk':()=>{trail.startTask('talk',phone?'phone':'desktop');paint();},
    'task-background':()=>{trail.startTask('background',phone?'phone':'desktop');paint();},
    'task-other':()=>{trail.startTask('other',phone?'phone':'desktop');paint();},
    'task-end':()=>{trail.finishTask();void saveTasks();},
    'task-cancel':()=>{trail.cancelTask();paint();},
    'task-save':()=>saveTasks(),
  };
  function toggle(open=!box){
    if(!open){clearInterval(timer);box?.remove();box=null;checks=null;return;}
    box=document.createElement('aside');box.className='pdbg';box.setAttribute('role','complementary');box.setAttribute('aria-label',t('pdbg.title'));
    document.body.appendChild(box);paint();timer=setInterval(paint,1000);
  }
  document.addEventListener('keydown',e=>{if(e.key==='F9'){e.preventDefault();toggle();}});
  return {toggle,snapshot};
}

// "Hiba jelentése": the owner writes one line about what went wrong; the server saves the bundle
// (this state, its own logs, a database snapshot) and answers with the folder name to send.
export async function reportBug({api,toast,esc,state}){
  const dlg=document.createElement('dialog');dlg.className='pdbg-report';
  dlg.innerHTML=`<form method="dialog"><h3>${t('pdbg.reportTitle')}</h3><p class="muted">${t('pdbg.reportLead')}</p>
    <label>${t('pdbg.reportNote')}<textarea name="note" rows="3" maxlength="2000"></textarea></label>
    <label class="pdbg-check"><input type="checkbox" name="snapshot" checked> ${t('pdbg.reportSnapshot')}</label>
    <p class="pdbg-result" role="status"></p>
    <div class="dialog-footer"><button value="cancel" class="subtle">${t('common.cancel')}</button><button value="send" class="primary" data-send>${t('pdbg.reportSave')}</button></div></form>`;
  document.body.appendChild(dlg);dlg.showModal();
  dlg.addEventListener('close',()=>dlg.remove());
  dlg.querySelector('[data-send]').onclick=async e=>{
    e.preventDefault();const f=dlg.querySelector('form'),btn=e.currentTarget;btn.disabled=true;
    const out=dlg.querySelector('.pdbg-result');out.textContent=t('pdbg.reportSaving');
    try{const r=await api('/api/dev/bug-report',{note:f.note.value,snapshot:f.snapshot.checked,client:state});
      out.innerHTML=`${esc(t('pdbg.reportSaved'))}<br><code>${esc(r.name)}</code>`;btn.hidden=true;
      try{await navigator.clipboard.writeText(r.name);toast(t('pdbg.reportCopied'));}catch{}}
    catch(err){out.textContent=err.message;btn.disabled=false;}
  };
}
