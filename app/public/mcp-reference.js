const $=selector=>document.querySelector(selector),id=location.pathname.split('/').at(-1);
const roles={face:'Face & eyes',body:'Body & proportions',detail:'Distinctive detail',general:'General appearance'};
let session,change,busy=false;
async function api(route,body){const r=await fetch(route,{method:body?'PUT':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json','X-LU-CSRF':session.csrf}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to review this reference selection.');return value;}
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function references(title,items,side){const section=text('section','');section.className='field';section.append(text('h2',title));if(!items.length){section.append(text('p','No approved references.'));$('#comparison').append(section);return;}const grid=text('div','');grid.className='media-grid';for(const ref of items){const card=text('article','');card.className='panel';const img=document.createElement('img');img.src=`/api/mcp-reference-preview/${id}/${ref.media_id}?side=${side}`;img.alt=`${roles[ref.role]||'Reference'} preview`;img.loading='lazy';img.style.width='100%';img.style.maxHeight='360px';img.style.objectFit='contain';card.append(img,text('strong',roles[ref.role]||'Reference'),text('small',ref.media_id));grid.append(card);}section.append(grid);$('#comparison').append(section);}
function render(){
  const saved=change.status==='applied',approved=change.status==='approved',root=$('#comparison');
  root.replaceChildren();root.append(text('h2',change.character_name+' · reference set'));
  if(change.reason)root.append(text('p',change.reason));
  references(saved?'Before this update':'Currently approved',change.original||[],'before');
  references(saved?'Saved reference set':'Proposed selection',change.proposed||[],'after');
  $('#status').textContent=saved
    ?`Saved to catalogue · ${(change.proposed||[]).length} references · Version ${change.result?.revision_id||''}`
    :approved?'Approved, but not saved yet. Use the save button below to finish.'
    :'Proposal status: '+change.status+' · Expires '+new Date(change.expires_at).toLocaleString();
  $('#decisions').hidden=!['pending','approved'].includes(change.status);
  $('#approve').textContent=approved?'Save approved reference set':'Approve and save this reference set';
  $('#reject').hidden=approved;
}
async function decide(decision){
  if(busy)return;busy=true;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=true;
  $('#status').textContent=decision==='approve'?'Verifying images and saving references…':'Rejecting…';
  try{
    change=await api('/api/mcp-reference-changes/'+id,{decision,expected_hash:change.change_hash});render();
    if(decision==='reject')$('#status').textContent='Rejected. The approved identity was not changed.';
  }catch(e){
    try{change=await api('/api/mcp-reference-changes/'+id);render();}catch{}
    if(change?.status!=='applied')$('#status').textContent=(change?.status==='approved'?'Approval recorded, but saving did not finish. Retry with the save button. ':'')+e.message;
  }finally{busy=false;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=false;}
}
$('#approve').onclick=()=>decide('approve');$('#reject').onclick=()=>decide('reject');
try{session=await api('/api/session');change=await api('/api/mcp-reference-changes/'+id);render();}catch(e){$('#status').textContent=e.message;}
