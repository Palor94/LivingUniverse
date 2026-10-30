import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {safeUpload,safeDownload} from './safe-download.mjs';
import {GenerationError} from './image-providers.mjs';

const api='https://api.sogni.ai';
const endpoint='/v1/creative-agent/workflows';
const jobId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const error=(code,message)=>new GenerationError(code,message,502);

// No catalogue access here: callers supply only the exact, approved reference bytes.
export async function generateSogniImage({manifest,references,apiKey,requestKey,onProviderJob=()=>{},fetchImpl=fetch,upload=safeUpload,download=safeDownload,sleep=delay,clock=Date.now,timeoutMs=600000,pollMs=3000}){
  const deadline=clock()+timeoutMs;
  async function json(route,{method='GET',body,headers={}}={}){
    const remaining=deadline-clock();if(remaining<=0)throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni timed out. Check the saved workflow ID; do not submit another attempt.');
    let res;
    try{res=await fetchImpl(api+route,{method,redirect:'error',signal:AbortSignal.timeout(Math.min(60000,remaining)),headers:{Authorization:'Bearer '+apiKey,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
    catch{throw error('PROVIDER_OUTCOME_UNKNOWN','The Sogni connection failed. Check the account before another attempt.');}
    if(!res.ok){await res.body?.cancel().catch(()=>{});throw error(method==='POST'&&res.status>=400&&res.status<500?'PROVIDER_REJECTED':'PROVIDER_OUTCOME_UNKNOWN','Sogni returned HTTP '+res.status+'. No automatic submission will occur.');}
    let size=0,chunks=[];
    try{for await(const chunk of res.body){size+=chunk.length;if(size>2*1024*1024)throw Error();chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{await res.body?.cancel().catch(()=>{});throw error('PROVIDER_OUTCOME_UNKNOWN','The bounded Sogni status response could not be read.');}
  }
  try{
    const inputId=randomUUID(),media=[];
    for(let i=0;i<references.length;i++){
      const ref=references[i],query=new URLSearchParams({type:'contextImage'+(i+1),jobId:inputId,contentType:ref.contentType});
      const signed=await json('/v1/image/uploadUrl?'+query);
      if(typeof signed.data?.uploadUrl!=='string')throw error('PROVIDER_RESULT_INVALID','Sogni did not provide a reference upload URL.');
      // Storage receives only bytes and MIME, never the Sogni bearer credential.
      await upload(signed.data.uploadUrl,ref.bytes,{contentType:ref.contentType,deadline});
      const read=await json('/v1/image/downloadUrl?'+query);
      if(typeof read.data?.downloadUrl!=='string')throw error('PROVIDER_RESULT_INVALID','Sogni did not provide a reference read URL.');
      // Keep the provider's signed reference URL intact; never expose it in receipts.
      const u=new URL(read.data.downloadUrl);
      if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||u.href.length>8192)throw error('PROVIDER_RESULT_INVALID','Sogni returned an unsafe reference URL.');
      media.push({kind:'image',url:read.data.downloadUrl});
    }
    const [width,height]=manifest.size.split('x').map(Number);
    const started=await json(endpoint,{method:'POST',headers:{'Idempotency-Key':requestKey||'lu_'+randomUUID()},body:{
      input:{title:'Living Universe image',steps:[{id:'image',toolName:'edit_image',arguments:{prompt:manifest.provider_prompt,model:manifest.model,sourceImageIndex:-1,numberOfVariations:1,width,height,outputFormat:'png',...(manifest.loras?.length?{loras:manifest.loras,loraStrengths:manifest.lora_strengths}:{})}}]},
      media_references:media,billing_mode:'auto',token_type:'auto',app_source:'living-universe',safe_content_filter:true,confirm_cost:true
    }});
    let workflow=started.data?.workflow;
    if(!jobId(workflow?.workflowId))throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni did not return a valid workflow ID. Check the account before another attempt.');
    const workflowId=workflow.workflowId;onProviderJob(workflowId);
    while(workflow.status!=='completed'){
      if(workflow.status==='waiting_for_user')throw error('PROVIDER_REVIEW_REQUIRED','Sogni is waiting for account review. No image has been returned; inspect the saved workflow.');
      if(['failed','partial_failure','cancelled'].includes(workflow.status))throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni stopped or needs account action. Inspect the saved workflow; it will not be resumed or submitted automatically.');
      if(!['queued','running'].includes(workflow.status)||clock()>=deadline)throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni has not completed. Inspect the saved workflow before another attempt.');
      await sleep(Math.min(pollMs,Math.max(1,deadline-clock())));
      const status=await json(endpoint+'/'+encodeURIComponent(workflowId));workflow=status.data?.workflow;
      if(workflow?.workflowId!==workflowId)throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni returned a mismatched workflow.');
    }
    const steps=workflow.steps;
    if(!Array.isArray(steps)||steps.length!==1||!Array.isArray(steps[0].artifacts)||steps[0].artifacts.length!==1||typeof steps[0].artifacts[0].url!=='string')throw error('PROVIDER_RESULT_INVALID','One Sogni image artifact is required.');
    const received=await download(steps[0].artifacts[0].url,{maxBytes:20*1024*1024,deadline});
    if(!['image/png','image/jpeg'].includes(received.contentType)){received.stream.destroy();throw error('PROVIDER_RESULT_INVALID','Sogni must return PNG/JPEG image bytes.');}
    const chunks=[];let size=0;
    try{for await(const chunk of received.stream){size+=chunk.length;if(size>20*1024*1024)throw Error();chunks.push(chunk);}}
    catch{received.stream.destroy();throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni result download did not complete within its bounds.');}
    if(!size)throw error('PROVIDER_RESULT_INVALID','Sogni returned an empty image.');
    return {bytes:Buffer.concat(chunks),request_id:workflowId,usage:null,revised_prompt:null};
  }catch(e){if(e instanceof GenerationError)throw e;throw error('PROVIDER_OUTCOME_UNKNOWN','The Sogni transfer did not complete. Check the saved workflow and account; no automatic resubmission will occur.');}
}
