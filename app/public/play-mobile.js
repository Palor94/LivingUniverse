import {notify} from './interactions.js';
import './app-install.js';
// "Játék" on the phone (NEXT_GEN_PLAN 4.8): the same play screen as on the desktop, served by
// the restricted mobile listener behind Tailscale. Every change carries the mobile session's
// CSRF token; the mobile listener forwards only play routes to the desktop application.
import {t,translateServerMessage} from './i18n.js';
import {installPlayUI} from './play.js';
import {installTrail} from './debug-trail.js';
installTrail();

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf='',toastTimer=null;
const csrfHeaders=()=>({'X-LU-CSRF':csrf});

function toast(message,error=false,retry=null){if(error)try{window.__luTrail?.error(message,'üzenet');}catch{}return notify(message,error,retry);}

async function api(route,data,method){
  const m=method||(data?'POST':'GET');
  const r=await fetch(route,{method:m,headers:{...(data?{'Content-Type':'application/json'}:{}),...(m!=='GET'?csrfHeaders():{})},body:data?JSON.stringify(data):undefined});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(Error(result.error?translateServerMessage(result.error):t('common.actionFailed')),{status:r.status});
  return result;
}

const ui=installPlayUI({$,$$,esc,api,toast,exit:()=>{location.href='/';},requestHeaders:csrfHeaders,phone:true});
try{
  csrf=(await api('/api/session')).csrf;
  await ui.render($('#content'));
}catch(e){$('#content').textContent=e.message||t('common.actionFailed');}
