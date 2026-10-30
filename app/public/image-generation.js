const rid=location.pathname.split('/').at(-1),endpoint='/api/image-generation/'+rid,$=s=>document.querySelector(s);
let csrf,plan,busy=false,timer;
async function request(url,body){const response=await fetch(url,body===undefined?{}:{method:'PUT',headers:{'Content-Type':'application/json','X-LU-CSRF':csrf},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error||'The operation could not finish.');return value;}
function render(value){
  plan=value;$('#status').textContent='Status: '+value.status+(value.error_code?' · '+value.error_code:'');
  $('#provider').textContent='Provider: '+value.manifest.provider+' · Model: '+value.manifest.model+' · One image';
  if(value.manifest.loras?.length)$('#provider').textContent+=' · LoRA: '+value.manifest.loras.map((id,i)=>id+' @ '+value.manifest.lora_strengths[i]).join(', ');
  $('#cost').textContent=value.manifest.estimated_cost_usd===null?'Exact API cost is unknown. Check the provider account before approving.':'Operator estimate: USD '+value.manifest.estimated_cost_usd+'; final provider billing may differ.';
  $('#prompt').textContent=value.manifest.provider_prompt;$('#manifest').textContent=JSON.stringify(value.manifest,null,2);
  const list=$('#references');list.replaceChildren();for(const c of value.manifest.characters){const heading=document.createElement('h3');heading.textContent='Slot '+c.slot+': '+c.name;list.append(heading);const grid=document.createElement('div');grid.className='reference-grid';for(const r of c.references){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src='/approved-preview/'+c.character_id+'/'+r.media_id;img.alt='Approved '+r.role+' reference for '+c.name;img.loading='lazy';caption.textContent='Input '+r.input_index+' · '+r.role+' · SHA-256 '+r.sha256;figure.append(img,caption);grid.append(figure);}list.append(grid);}
  $('#approval').hidden=value.status!=='pending';$('#execute').hidden=!['approved','generated'].includes(value.status);$('#execute').textContent=value.status==='generated'?'Retry saving the existing result':'Generate one image';$('#withdraw').hidden=value.status!=='succeeded';
  const output=$('#output');output.replaceChildren();if(value.output){const text=document.createElement('p');text.textContent='Verified media ID: '+value.output.media_id+' · '+value.output.size+' bytes · SHA-256 '+value.output.sha256;output.append(text);if(value.output.active){const img=document.createElement('img');img.src='/api/sorting/images/'+value.output.media_id+'/preview';img.alt='Generated result, awaiting your appearance review';output.append(img);}}
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
