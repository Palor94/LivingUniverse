import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {safeUpload,safeDownload} from './safe-download.mjs';
import {GenerationError} from './image-providers.mjs';

const api='https://api.sogni.ai';
const endpoint='/v1/creative-agent/workflows';
const jobId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const error=(code,message)=>new GenerationError(code,message,502);

export function sogniWorkflow(manifest,media,{estimate=false}={}){
  const [width,height]=manifest.size.split('x').map(Number),cap=manifest.max_estimated_capacity_units;
  return {input:{title:'Living Universe image',steps:[{id:'image',toolName:manifest.task==='text_to_image'?'generate_image':'edit_image',arguments:{prompt:manifest.provider_prompt,model:manifest.model,...(manifest.task==='text_to_image'?{}:{sourceImageIndex:-1}),numberOfVariations:manifest.n||1,width,height,outputFormat:'png',...(manifest.loras?.length?{loras:manifest.loras,loraStrengths:manifest.lora_strengths}:{})}}]},media_references:media,billing_mode:'auto',token_type:'auto',app_source:'living-universe',safe_content_filter:true,confirm_cost:!estimate,...(estimate?{max_estimated_capacity_units:0}:Number.isFinite(cap)&&cap>0?{max_estimated_capacity_units:cap}:{})};
}

// Only an explicitly authorized reference upload may reach this non-generating probe.
export async function estimateSogniImage({manifest,references,apiKey,fetchImpl=fetch,upload=safeUpload,requestKey,clock=Date.now}){
  const deadline=clock()+120000;
  async function request(route,body){
    let response;try{response=await fetchImpl(api+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(60000,deadline-clock()))),headers:{Authorization:'Bearer '+apiKey,...(body?{'Content-Type':'application/json','Idempotency-Key':requestKey+'_estimate'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw error('ESTIMATE_UNAVAILABLE','The Sogni estimate could not be confirmed. No automatic retry will occur.');}
    let size=0,chunks=[];try{for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error();chunks.push(chunk);}return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}catch{await response.body?.cancel().catch(()=>{});throw error('ESTIMATE_UNAVAILABLE','Sogni did not return a bounded estimate.');}
  }
  const inputId=randomUUID(),media=[];
  for(let i=0;i<references.length;i++){
    const ref=references[i],query=new URLSearchParams({type:'contextImage'+(i+1),jobId:inputId,contentType:ref.contentType}),signed=await request('/v1/image/uploadUrl?'+query);
    if(signed.status!==200||typeof signed.body.data?.uploadUrl!=='string')throw error('ESTIMATE_UNAVAILABLE','Sogni did not provide an estimate upload URL.');
    try{await upload(signed.body.data.uploadUrl,ref.bytes,{contentType:ref.contentType,deadline});}catch{throw error('ESTIMATE_UNAVAILABLE','The authorized estimate upload did not complete. No automatic retry will occur.');}
    const read=await request('/v1/image/downloadUrl?'+query),url=read.body.data?.downloadUrl;
    if(read.status!==200||typeof url!=='string')throw error('ESTIMATE_UNAVAILABLE','Sogni did not provide an estimate reference URL.');
    const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||url.length>8192)throw error('ESTIMATE_UNAVAILABLE','Sogni returned an unsafe estimate reference URL.');media.push({kind:'image',url});
  }
  const result=await request(endpoint,sogniWorkflow(manifest,media,{estimate:true})),raw=result.body.details?.estimatedCapacity,units=typeof raw==='number'?raw:raw?.totalEstimatedCapacityUnits;
  if(result.status!==400||!Number.isFinite(units)||units<=0)throw error('ESTIMATE_UNAVAILABLE','Sogni did not provide a confirmed non-executing cost estimate. Inspect the account before another attempt.');
  // Do not invent a capacity-unit-to-Spark/USD conversion.
  return {source:'sogni',capacity_units:units,token_type:['spark','sogni'].includes(raw?.tokenType)?raw.tokenType:null,spark:null,usd:null,estimated_at:new Date(clock()).toISOString()};
}

// No catalogue access here: callers supply only the exact, approved reference bytes.
export async function generateSogniImage({manifest,references,apiKey,requestKey,onProviderJob=()=>{},fetchImpl=fetch,upload=safeUpload,download=safeDownload,sleep=delay,clock=Date.now,timeoutMs=600000,pollMs=3000}){
  const count=manifest.n??1;if(!Number.isInteger(count)||count<1||count>4)throw error('PROVIDER_RESULT_INVALID','Choose one to four image outputs.');
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
    const started=await json(endpoint,{method:'POST',headers:{'Idempotency-Key':requestKey||'lu_'+randomUUID()},body:sogniWorkflow(manifest,media)});
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
    if(!Array.isArray(steps)||steps.length!==1||!Array.isArray(steps[0].artifacts)||steps[0].artifacts.length!==count||steps[0].artifacts.some(artifact=>typeof artifact.url!=='string'))throw error('PROVIDER_RESULT_INVALID','The exact requested number of Sogni image artifacts is required.');
    const outputs=[];
    for(const artifact of steps[0].artifacts){
    const received=await download(artifact.url,{maxBytes:20*1024*1024,deadline});
    if(!['image/png','image/jpeg'].includes(received.contentType)){received.stream.destroy();throw error('PROVIDER_RESULT_INVALID','Sogni must return PNG/JPEG image bytes.');}
    const chunks=[];let size=0;
    try{for await(const chunk of received.stream){size+=chunk.length;if(size>20*1024*1024)throw Error();chunks.push(chunk);}}
    catch{received.stream.destroy();throw error('PROVIDER_OUTCOME_UNKNOWN','Sogni result download did not complete within its bounds.');}
    if(!size)throw error('PROVIDER_RESULT_INVALID','Sogni returned an empty image.');
    outputs.push({bytes:Buffer.concat(chunks),request_id:workflowId,usage:null,revised_prompt:null});
    }
    return {...outputs[0],...(count>1?{outputs}:{})};
  }catch(e){if(e instanceof GenerationError)throw e;throw error('PROVIDER_OUTCOME_UNKNOWN','The Sogni transfer did not complete. Check the saved workflow and account; no automatic resubmission will occur.');}
}
