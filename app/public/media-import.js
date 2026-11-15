import {t,translateDocument,translateServerMessage} from './i18n.js';
translateDocument();
const id=location.pathname.split('/').at(-1),files=document.querySelector('#files'),button=document.querySelector('#save'),status=document.querySelector('#status');let csrf,expired=false,uploading=false;
const hex=buffer=>[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');
function base64(bytes){let text='';for(let p=0;p<bytes.length;p+=8192)text+=String.fromCharCode(...bytes.subarray(p,p+8192));return btoa(text);}
async function response(request){const r=await request,value=await r.json();if(!r.ok)throw Error(value.error?translateServerMessage(value.error):t('import.failed'));return value;}
const operation=(operation,args)=>response(fetch('/api/media-imports/'+id+'/uploads',{method:'PUT',headers:{'Content-Type':'application/json','X-LU-CSRF':csrf},body:JSON.stringify({operation,arguments:args})}));
function render(value){
  document.querySelector('#character').textContent=t('import.characters',{names:(value.characters||[{name:value.character_name}]).map(c=>c.name).join(', ')});
  const list=document.querySelector('#receipts');list.replaceChildren();
  for(const item of value.items){const li=document.createElement('li');li.textContent=item.status==='committed'?t('import.receipt',{file:item.filename,size:item.size,sha:item.sha256,links:(item.associations||[]).filter(a=>a.linked).length}):t('import.retry',{slot:item.slot_key,state:item.error_code||item.status});list.append(li);}
  expired=value.expired||value.status==='cancelled';button.disabled=expired||uploading;if(expired)status.textContent=value.status==='cancelled'?t('import.cancelled'):t('import.expired');
}
try{csrf=(await response(fetch('/api/session'))).csrf;render(await response(fetch('/api/media-imports/'+id)));}catch(error){status.textContent=error.message;}
button.addEventListener('click',async()=>{
  if(uploading)return;const selected=[...files.files];if(!selected.length){status.textContent=t('import.chooseFile');return;}uploading=true;button.disabled=true;let saved=0;const errors=[];
  for(const file of selected){
    try{
      const image=file.type.startsWith('image/')||/\.(png|jpe?g)$/i.test(file.name),max=image?20*1024*1024:100*1024*1024;
      if(file.size>max)throw Error(t('import.tooLarge'));
      const bytes=new Uint8Array(await file.arrayBuffer()),hash=hex(await crypto.subtle.digest('SHA-256',bytes)),slot='file_'+hash;
      if(image){
        const type=file.type||(/\.png$/i.test(file.name)?'image/png':'image/jpeg');
        let upload=await operation('begin',{slot_key:slot,filename:file.name,content_type:type,size_bytes:file.size,sha256:hash});
        while(upload.status!=='committed'&&upload.received_bytes<file.size){status.textContent=t('import.progress',{file:file.name,percent:Math.floor(100*upload.received_bytes/file.size)});upload=await operation('chunk',{upload_id:upload.upload_id,offset:upload.received_bytes,data_base64:base64(bytes.subarray(upload.received_bytes,upload.received_bytes+upload.chunk_bytes))});}
        const result=await operation('finalize',{upload_id:upload.upload_id});if(result.status!=='committed'||!result.receipt?.media_id)throw Error(t('import.noReceipt'));
      }else{
        const result=await response(fetch('/api/media-imports/'+id+'/items/'+slot,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream','X-LU-CSRF':csrf,'X-LU-Filename':encodeURIComponent(file.name),'X-LU-SHA256':hash},body:file}));
        if(!result.items.some(i=>i.slot_key===slot&&i.status==='committed'))throw Error(t('import.noReceipt'));
      }
      saved++;
    }catch(error){errors.push(file.name+': '+error.message);}
    try{render(await response(fetch('/api/media-imports/'+id)));}catch{}
  }
  status.textContent=t('import.done',{saved,total:selected.length})+(errors.length?' '+errors.join(' · ')+'. '+t('import.resume'):' '+t('import.receiptsReady'));uploading=false;button.disabled=expired;
});
