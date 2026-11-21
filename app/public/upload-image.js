import {t} from './i18n.js';
export function uploadImage({url,file,fields={},headers={},onProgress=()=>{},XHR=globalThis.XMLHttpRequest}){
  if(!file||file.size<=0||file.size>20*1024*1024||!['image/png','image/jpeg'].includes(file.type))return Promise.reject(Error(t('upload.imageOnly')));
  const target=url+'?'+new URLSearchParams(Object.entries(fields).filter(([,value])=>value!==null&&value!==undefined));
  return new Promise((resolve,reject)=>{
    const request=new XHR();request.open('POST',target);request.setRequestHeader('Content-Type',file.type);request.setRequestHeader('X-LU-Filename',encodeURIComponent(file.name));for(const [key,value] of Object.entries(headers))request.setRequestHeader(key,value);
    request.upload.onprogress=event=>onProgress(event.lengthComputable?Math.min(100,100*event.loaded/event.total):null);
    const uncertain=()=>reject(Object.assign(Error(t('api.writeUncertain')),{transport:true,status:0}));request.onerror=uncertain;request.onabort=uncertain;request.ontimeout=uncertain;request.timeout=180000;
    request.onload=()=>{let result;try{result=JSON.parse(request.responseText);}catch{uncertain();return;}if(request.status<200||request.status>=300){reject(Object.assign(Error(result.error||t('common.actionFailed')),{status:request.status}));return;}onProgress(100);resolve(result);};request.send(file);
  });
}
export function uploadProgress(input){
  const box=document.createElement('div'),label=document.createElement('span'),bar=document.createElement('progress');box.className='image-upload-progress';bar.max=100;label.textContent=t('upload.progress');bar.setAttribute('aria-label',t('upload.progress'));box.append(label,bar);input.closest('label')?.after(box);
  return {update(value){if(value===null){bar.removeAttribute('value');label.textContent=t('upload.progress');}else{bar.value=value;label.textContent=t(value===100?'upload.processing':'upload.percent',{percent:Math.floor(value)});}},close(){box.remove();}};
}
