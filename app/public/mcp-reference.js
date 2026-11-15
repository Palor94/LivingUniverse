import {t,locale,translateDocument,translateServerMessage} from './i18n.js';
translateDocument();
const $=selector=>document.querySelector(selector),id=location.pathname.split('/').at(-1);
const roles={face:t('refrev.role.face'),body:t('refrev.role.body'),detail:t('refrev.role.detail'),general:t('refrev.role.general')};
const statusName=v=>['pending','approved','rejected','applied','expired','conflict'].includes(v)?t('proposalStatus.'+v):v;
let session,change,busy=false;
async function api(route,body){const r=await fetch(route,{method:body?'PUT':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json','X-LU-CSRF':session.csrf}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error?translateServerMessage(value.error):t('refrev.unavailable'));return value;}
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function references(title,items,side){const section=text('section','');section.className='field';section.append(text('h2',title));if(!items.length){section.append(text('p',t('refrev.none')));$('#comparison').append(section);return;}const grid=text('div','');grid.className='media-grid';for(const ref of items){const card=text('article','');card.className='panel';const img=document.createElement('img');img.src=`/api/mcp-reference-preview/${id}/${ref.media_id}?side=${side}${ref.reference_id?'&reference_id='+encodeURIComponent(ref.reference_id):''}`;img.alt=t('refrev.previewAlt',{role:roles[ref.role]||t('refrev.reference')});img.loading='lazy';img.style.width='100%';img.style.maxHeight='360px';img.style.objectFit='contain';card.append(img,text('strong',roles[ref.role]||t('refrev.reference')),text('small',ref.media_id));grid.append(card);}section.append(grid);$('#comparison').append(section);}
function render(){
  const saved=change.status==='applied',approved=change.status==='approved',root=$('#comparison');
  root.replaceChildren();root.append(text('h2',t('refrev.setTitle',{name:change.character_name})));
  if(change.reason)root.append(text('p',change.reason));
  references(saved?t('refrev.before'):t('refrev.current'),change.original||[],'before');
  references(saved?t('refrev.savedSet'):t('refrev.proposed'),change.proposed||[],'after');
  $('#status').textContent=saved
    ?t('refrev.savedStatus',{count:(change.proposed||[]).length,revision:change.result?.revision_id||''})
    :approved?t('refrev.approvedNotSaved')
    :t('change.status',{status:statusName(change.status),time:new Date(change.expires_at).toLocaleString(locale)});
  $('#decisions').hidden=!['pending','approved'].includes(change.status);
  $('#approve').textContent=approved?t('refrev.saveApproved'):t('refrev.approveSave');
  $('#reject').hidden=approved;
}
async function decide(decision){
  if(busy)return;busy=true;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=true;
  $('#status').textContent=decision==='approve'?t('refrev.saving'):t('refrev.rejecting');
  try{
    change=await api('/api/mcp-reference-changes/'+id,{decision,expected_hash:change.change_hash});render();
    if(decision==='reject')$('#status').textContent=t('refrev.rejected');
  }catch(e){
    try{change=await api('/api/mcp-reference-changes/'+id);render();}catch{}
    if(change?.status!=='applied')$('#status').textContent=(change?.status==='approved'?t('refrev.saveIncomplete'):'')+e.message;
  }finally{busy=false;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=false;}
}
$('#approve').onclick=()=>decide('approve');$('#reject').onclick=()=>decide('reject');
try{session=await api('/api/session');change=await api('/api/mcp-reference-changes/'+id);render();}catch(e){$('#status').textContent=e.message;}
