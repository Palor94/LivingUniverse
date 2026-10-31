const $=selector=>document.querySelector(selector),id=location.pathname.split('/').at(-1);
const labels={name:'Name',aliases:'Aliases',biography:'Biography',personality:'Personality',appearance:'Appearance · working notes',sexuality:'Sexuality',speech_style:'Speech style & dialogue examples'};
let session,change,busy=false;
async function api(route,body){const r=await fetch(route,{method:body?'PUT':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json','X-LU-CSRF':session.csrf}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to review the proposal.');return value;}
function node(tag,text){const element=document.createElement(tag);element.textContent=text;return element;}
function compare(title,before,after){const section=node('section','');section.className='field';section.append(node('h2',title),node('strong','Currently saved'),node('pre',before===null?'(Not recorded)':before||'(Empty)'),node('strong','Proposed'),node('pre',after||'(Empty)'));for(const pre of section.querySelectorAll('pre')){pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';}$('#comparison').append(section);}
function render(){
  $('#comparison').replaceChildren();$('#comparison').append(node('h2',change.operation==='character_create'?'Create '+change.proposed.name:change.character_name+(change.target_name?' → '+change.target_name:'')));
  if(change.reason)$('#comparison').append(node('p',change.reason));
  if(change.operation==='relationship_update')compare('Directed relationship',change.original,change.proposed);
  else for(const [key,value] of Object.entries(change.proposed))compare(labels[key]||key,change.original?.[key]??null,value);
  $('#status').textContent='Proposal status: '+change.status+' · Expires '+new Date(change.expires_at).toLocaleString();$('#decisions').hidden=change.status!=='pending';
}
async function decide(decision){if(busy)return;busy=true;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=true;
  try{change=await api('/api/mcp-changes/'+id,{decision,expected_hash:change.change_hash});render();$('#status').textContent=decision==='approve'?'Approved. Return to ChatGPT and ask it to apply and verify this change.':'Rejected. No character information was changed.';}
  catch(e){$('#status').textContent=e.message;}finally{busy=false;for(const b of $('#decisions').querySelectorAll('button'))b.disabled=false;}}
$('#approve').onclick=()=>decide('approve');$('#reject').onclick=()=>decide('reject');
try{session=await api('/api/session');change=await api('/api/mcp-changes/'+id);render();}catch(e){$('#status').textContent=e.message;}
