import {t,translateDocument,translateServerMessage} from './i18n.js';
translateDocument();
const rid=location.pathname.split('/').at(-1),endpoint='/api/image-generation/'+rid,$=s=>document.querySelector(s);
const roleName=v=>['face','body','detail','general'].includes(v)?t('role.'+v):v;
const statusName=v=>['pending','approved','rejected','running','uncertain','generated','succeeded','committed','withdrawn','expired','failed'].includes(v)?t('genStatus.'+v):v;
let csrf,plan,busy=false,timer;
async function request(url,body){const response=await fetch(url,body===undefined?{}:{method:'PUT',headers:{'Content-Type':'application/json','X-LU-CSRF':csrf},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error?translateServerMessage(value.error):t('gen.failed'));return value;}
function render(value){
  plan=value;$('#status').textContent=t('gen.status',{status:statusName(value.status)})+(value.error_code?' · '+value.error_code:'');
  $('#provider').textContent=t('gen.provider',{provider:value.manifest.provider,model:value.manifest.model});
  if(value.manifest.loras?.length)$('#provider').textContent+=' · LoRA: '+value.manifest.loras.map((id,i)=>id+' @ '+value.manifest.lora_strengths[i]).join(', ');
  $('#cost').textContent=value.manifest.estimated_cost_usd===null?t('gen.costUnknown'):t('gen.costEstimate',{usd:value.manifest.estimated_cost_usd});
  $('#prompt').textContent=value.manifest.provider_prompt;$('#manifest').textContent=JSON.stringify(value.manifest,null,2);
  const list=$('#references');list.replaceChildren();for(const c of value.manifest.characters){const heading=document.createElement('h3');heading.textContent=t('gen.slot',{slot:c.slot,name:c.name});list.append(heading);const grid=document.createElement('div');grid.className='reference-grid';for(const r of c.references){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src='/approved-preview/'+c.character_id+'/'+r.media_id+'?run_id='+encodeURIComponent(value.run_id)+(r.reference_id?'&reference_id='+encodeURIComponent(r.reference_id):'');img.alt=t('gen.refAlt',{role:roleName(r.role),name:c.name});img.loading='lazy';caption.textContent=t('gen.input',{index:r.input_index,role:roleName(r.role),sha:r.sha256});figure.append(img,caption);grid.append(figure);}list.append(grid);}
  $('#approval').hidden=value.status!=='pending';$('#execute').hidden=!['approved','generated'].includes(value.status);$('#execute').textContent=value.status==='generated'?t('gen.retrySave'):t('gen.generate');$('#withdraw').hidden=value.status!=='succeeded';
  const output=$('#output');output.replaceChildren();if(value.output){const text=document.createElement('p');text.textContent=t('gen.output',{id:value.output.media_id,size:value.output.size,sha:value.output.sha256});output.append(text);if(value.output.active){const img=document.createElement('img');img.src='/api/sorting/images/'+value.output.media_id+'/preview';img.alt=t('gen.outputAlt');output.append(img);}}
  clearTimeout(timer);if(value.status==='running')timer=setTimeout(refresh,3000);
}
async function refresh(){if(busy)return;try{render(await request(endpoint));$('#error').textContent='';}catch(error){$('#error').textContent=error.message;}}
async function act(suffix,body){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{render(await request(endpoint+'/'+suffix,body));$('#error').textContent='';}catch(error){$('#error').textContent=error.message;}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;$('#approve').disabled=!$('#ack').checked;}}
$('#ack').addEventListener('change',()=>{$('#approve').disabled=!$('#ack').checked;});
$('#approve').addEventListener('click',()=>act('decision',{decision:'approve',manifest_hash:plan.manifest_hash,acknowledge_external_upload_and_cost:$('#ack').checked}));
$('#reject').addEventListener('click',()=>act('decision',{decision:'reject',manifest_hash:plan.manifest_hash}));
$('#execute').addEventListener('click',()=>act('execute',{}));
$('#withdraw').addEventListener('click',()=>act('withdraw',{manifest_hash:plan.manifest_hash}));
$('#refresh').addEventListener('click',refresh);
try{csrf=(await request('/api/session')).csrf;await refresh();}catch(error){$('#error').textContent=error.message;}
