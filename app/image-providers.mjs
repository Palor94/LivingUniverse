import {generateSogniImage} from './sogni-provider.mjs';
// Provider URLs and request shapes are application-owned, never tool arguments.
export const imageProviderSpecs=Object.freeze({
  openai:{endpoint:'https://api.openai.com/v1/images/edits',key:'OPENAI_API_KEY',models:['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2','gpt-image-1.5'],maxReferences:16},
  xai:{endpoint:'https://api.x.ai/v1/images/edits',key:'XAI_API_KEY',models:['grok-imagine-image-2.0'],maxReferences:5},
  sogni:{key:'SOGNI_API_KEY',models:['krea-identity-edit','dark-beast-krea2-identity-edit','qwen','qwen-lightning','flux-3-klein','gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare'],maxReferences:16,referenceLimits:{'krea-identity-edit':2,'dark-beast-krea2-identity-edit':2,qwen:3,'qwen-lightning':3,'flux-3-klein':10}}
});
export class GenerationError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const issue=(code,message,status=400)=>new GenerationError(code,message,status);
export const sogniLoraNames=Object.freeze({'krea2-mystic-x':'Mystic X','krea2-realism-engine':'Realism Engine v3'});
function sogniLoras(chosen={}){
  const loras=chosen.loras??[],strengths=chosen.lora_strengths??[];
  const valid=Array.isArray(loras)&&Array.isArray(strengths)&&loras.length<=2&&loras.length===strengths.length&&new Set(loras).size===loras.length&&loras.every(id=>Object.hasOwn(sogniLoraNames,id))&&strengths.every(s=>typeof s==='number'&&Number.isFinite(s)&&s>=0&&s<=2)&&(!loras.length||['krea-identity-edit','dark-beast-krea2-identity-edit'].includes(chosen.model));
  return {valid,loras:valid?[...loras]:[],lora_strengths:valid?[...strengths]:[]};
}
export function configuredImageProviders(config={},env=process.env){
  return Object.fromEntries(Object.entries(imageProviderSpecs).map(([name,spec])=>{
    const chosen=config.providers?.[name],lora=name==='sogni'?sogniLoras(chosen):null,valid=chosen?.enabled===true&&spec.models.includes(chosen.model)&&(!lora||lora.valid);
    const price=chosen?.estimated_cost_usd;
    return [name,{provider:name,model:valid?chosen.model:null,available:valid&&!!env[spec.key],max_references:spec.referenceLimits?.[chosen?.model]??spec.maxReferences,
      estimated_cost_usd:typeof price==='number'&&Number.isFinite(price)&&price>=0?price:null,
      references:true,regional_binding:false,identity_guaranteed:false,output_count:1,...(lora?{loras:lora.loras,lora_strengths:lora.lora_strengths,model_label:chosen?.model==='krea-identity-edit'?'Krea 2 Identity Edit v1.2':chosen?.model}:{} )}];
  }));
}
export async function generateProviderImage({manifest,references,config,env=process.env,fetchImpl=fetch,requestKey,onProviderJob,sogniOptions={}}){
  const spec=imageProviderSpecs[manifest.provider],current=configuredImageProviders(config,env)[manifest.provider];
  if(!spec||!current?.available||current.model!==manifest.model)throw issue('PROVIDER_DISABLED','This provider/model is not enabled in protected local configuration.',403);
  if(!references.length||references.length>current.max_references)throw issue('REFERENCE_LIMIT','The selected provider cannot accept this reference count.');
  if(manifest.provider==='sogni'&&(JSON.stringify(manifest.loras??[])!==JSON.stringify(current.loras)||JSON.stringify(manifest.lora_strengths??[])!==JSON.stringify(current.lora_strengths)))throw issue('PROVIDER_CHANGED','Sogni LoRA settings changed; prepare a fresh plan for approval.',409);
  if(manifest.provider==='sogni')return generateSogniImage({manifest,references,apiKey:env[spec.key],fetchImpl,requestKey,onProviderJob,...sogniOptions});
  const images=references.map(({bytes,contentType})=>'data:'+contentType+';base64,'+bytes.toString('base64'));
  const payload=manifest.provider==='openai'
    ?{model:manifest.model,prompt:manifest.provider_prompt,images:images.map(image_url=>({image_url})),n:1,output_format:'png',size:manifest.size,safety_identifier:manifest.safety_identifier}
    :{model:manifest.model,prompt:manifest.provider_prompt,images:images.map(url=>({type:'image_url',url})),n:1,response_format:'b64_json',aspect_ratio:{'1024x1024':'1:1','1536x1024':'3:2','1024x1536':'2:3'}[manifest.size]};
  let response;
  try{response=await fetchImpl(spec.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{Authorization:'Bearer '+env[spec.key],'Content-Type':'application/json'},body:JSON.stringify(payload)});}
  catch{throw issue('PROVIDER_OUTCOME_UNKNOWN','The provider connection failed. It may have billed this attempt. This run will not be submitted again.',502);}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw issue('PROVIDER_REJECTED','The provider declined the request (HTTP '+response.status+'). No automatic resubmission will occur.',502);}
  let raw,size=0,chunks=[];
  try{for await(const chunk of response.body){size+=chunk.length;if(size>32*1024*1024)throw Error();chunks.push(chunk);}raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{await response.body?.cancel().catch(()=>{});throw issue('PROVIDER_OUTCOME_UNKNOWN','The result could not be read within its bounds. Check provider usage before preparing another attempt.',502);}
  const item=raw.data?.[0],b64=item?.b64_json;
  if(raw.data?.length!==1||typeof b64!=='string'||!b64.length||b64.length>28*1024*1024||b64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)||Buffer.from(b64,'base64').toString('base64')!==b64)throw issue('PROVIDER_RESULT_INVALID','One bounded base64 image is required; provider URLs and attachment handles are not followed.',502);
  const requestId=response.headers.get('x-request-id');
  const usage=raw.usage&&typeof raw.usage==='object'?Object.fromEntries(['input_tokens','output_tokens','total_tokens'].filter(k=>Number.isSafeInteger(raw.usage[k])&&raw.usage[k]>=0).map(k=>[k,raw.usage[k]])):null;
  return {bytes:Buffer.from(b64,'base64'),request_id:requestId&&/^[A-Za-z0-9_-]{1,200}$/.test(requestId)?requestId:null,usage,revised_prompt:typeof item.revised_prompt==='string'?item.revised_prompt.slice(0,30000):null};
}
