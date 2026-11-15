import {t,locale,translateDocument,translateServerMessage} from './i18n.js';
translateDocument();
const $=selector=>document.querySelector(selector),id=location.pathname.split('/').at(-1);
const labels={name:t('profile.name'),aliases:t('profile.aliases'),biography:t('profile.biography'),personality:t('profile.personality'),appearance:t('profile.appearance'),sexuality:t('profile.sexuality'),speech_style:t('profile.speech')};
const statusName=v=>['pending','approved','rejected','applied','expired','conflict'].includes(v)?t('proposalStatus.'+v):v;
let session,change,busy=false;
async function api(route,body){const r=await fetch(route,{method:body?'PUT':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json','X-LU-CSRF':session.csrf}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error?translateServerMessage(value.error):t('change.unavailable'));return value;}
function node(tag,text){const element=document.createElement(tag);element.textContent=text;return element;}
function compare(title,before,after){const section=node('section','');section.className='field';section.append(node('h2',title),node('strong',t('change.current')),node('pre',before===null?t('change.notRecorded'):before||t('change.empty')),node('strong',t('change.proposed')),node('pre',after||t('change.empty')));for(const pre of section.querySelectorAll('pre')){pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';}$('#comparison').append(section);}
function render(){
  $('#comparison').replaceChildren();$('#comparison').append(node('h2',change.operation==='character_create'?t('change.create',{name:change.proposed.name}):change.character_name+(change.target_name?' → '+change.target_name:'')));
  if(change.reason)$('#comparison').append(node('p',change.reason));
  if(change.operation==='relationship_update')compare(t('change.directedRelationship'),change.original,change.proposed);
  else for(const [key,value] of Object.entries(change.proposed))compare(labels[key]||key,change.original?.[key]??null,value);
  $('#status').textContent=t('change.status',{status:statusName(change.status),time:new Date(change.expires_at).toLocaleString(locale)});$('#decisions').hidden=change.status!=='pending';
}
async function decide(decision){if(busy)return;busy=true;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=true;
  try{change=await api('/api/mcp-changes/'+id,{decision,expected_hash:change.change_hash});render();$('#status').textContent=decision==='approve'?t('change.approved'):t('change.rejected');}
  catch(e){$('#status').textContent=e.message;}finally{busy=false;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=false;}}
$('#approve').onclick=()=>decide('approve');$('#reject').onclick=()=>decide('reject');
try{session=await api('/api/session');change=await api('/api/mcp-changes/'+id);render();}catch(e){$('#status').textContent=e.message;}
