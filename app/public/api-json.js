import {t,translateServerMessage} from './i18n.js';
// Never retry automatically: a write without a response may already have run.
export async function requestJson(route,options={},request=fetch){
  const uncertain=!['GET','HEAD'].includes((options.method||'GET').toUpperCase());let response;
  const transport=kind=>Object.assign(Error(t(uncertain?'api.writeUncertain':kind==='network'?'api.offline':'api.badResponse')),{status:0,httpStatus:response?.status||0,requestId:response?.headers?.get('x-request-id')||null,transport:true,uncertain});
  try{response=await request(route,options);}catch{throw transport('network');}
  let value;try{value=await response.json();}catch{throw transport('json');}
  if(value===null||typeof value!=='object')throw transport('json');
  if(!response.ok){const requestId=response.headers?.get('x-request-id')||value.request_id||null,message=typeof value.error==='string'?translateServerMessage(value.error):t('common.actionFailed');throw Object.assign(Error(message+(response.status>=500&&/^[a-f0-9]{8}$/i.test(requestId||'')?' (#'+requestId+')':'')),{status:response.status,requestId,code:value.code});}
  return value;
}
export function appendStatusRetry(host,check){
  const doc=host?.ownerDocument||globalThis.document;if(!doc?.createElement)return;
  const button=doc.createElement('button');button.type='button';button.className='api-retry';button.textContent=t('api.retry');
  button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{await check();}finally{if(button.isConnected)button.disabled=false;}};host.append(button);
}
