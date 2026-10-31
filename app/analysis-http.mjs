import {analysisError as error} from './analysis-model.mjs';

// A single attempt, with a deadline covering headers AND the streaming body.
// Race even transports that ignore abort; never expose upstream bodies/errors.
export async function boundedAnalysisPost({endpoint,body,headers={},signal,timeoutMs,maxResponseBytes,fetchImpl=fetch,cloud=false,method='POST'}){
  signal?.throwIfAborted();const controller=new AbortController();let timer,onAbort;
  const request=(async()=>{
    let response;try{
      response=await fetchImpl(endpoint,{method,redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
      if(controller.signal.aborted){await response.body?.cancel().catch(()=>{});throw error('INTERRUPTED','Az elemzés megszakadt.',409);}
      if(!response.ok){await response.body?.cancel().catch(()=>{});throw error('PROVIDER_REJECTED','A provider elutasította a kérést. Nincs automatikus újraküldés.',502);}
      const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>maxResponseBytes))throw error('RESPONSE_LIMIT','A providerválasz túl nagy.',502);
      const chunks=[];let size=0;for await(const chunk of response.body){if(controller.signal.aborted)throw error('INTERRUPTED','Az elemzés megszakadt.',409);size+=chunk.length;if(size>maxResponseBytes)throw error('RESPONSE_LIMIT','A providerválasz túl nagy.',502);chunks.push(chunk);}
      if(controller.signal.aborted)throw error('INTERRUPTED','Az elemzés megszakadt.',409);
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw error('INVALID_RESULT','A provider nem érvényes JSON-t adott.',502);}
    }catch(e){await response?.body?.cancel().catch(()=>{});if(e?.code&&['PROVIDER_REJECTED','RESPONSE_LIMIT','INVALID_RESULT','INTERRUPTED'].includes(e.code))throw e;throw error(cloud?'PROVIDER_OUTCOME_UNKNOWN':'PROVIDER_UNAVAILABLE','A provider válasza nem ellenőrizhető. Nincs automatikus újraküldés.',502);}
  })();
  try{return await Promise.race([request,new Promise((_,reject)=>{
    onAbort=()=>{controller.abort();reject(error(cloud?'PROVIDER_OUTCOME_UNKNOWN':'INTERRUPTED','A feldolgozás megszakadt; a kérés kimenetele bizonytalan lehet.',409));};
    signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)return onAbort();
    timer=setTimeout(()=>{controller.abort();reject(error(cloud?'PROVIDER_OUTCOME_UNKNOWN':'TIMEOUT','A provider nem válaszolt időben. Nincs automatikus újraküldés.',409));},timeoutMs);
  })]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();}
}
