import {installGhostProfile} from './ghost-profile.js';
const $=(s,root=document)=>root.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=$('#review-status');let csrf;
async function api(url,body,method=body?'POST':'GET'){
  const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json','X-LU-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw Error(result.error||'A művelet nem sikerült.');return result;
}
const action=fn=>async event=>{try{await fn(event);}catch(error){status.textContent=error.message;status.scrollIntoView({block:'nearest'});}};
try{
  const id=location.pathname.split('/').at(-1);csrf=(await api('/api/session')).csrf;
  const c=await api('/api/characters/'+id);
  await installGhostProfile({$,esc,api,action,toast:message=>{status.textContent=message;}}).render(c,new URLSearchParams(location.search).get('proposal'));
  status.textContent=c.name+' · a javaslatok csak a kijelölt mezők külön jóváhagyásával kerülnek a profilba.';
}catch(error){status.textContent=error.message;}
