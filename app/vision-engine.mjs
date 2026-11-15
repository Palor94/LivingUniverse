// Operator vision tagging: OpenAI gpt-6.1-sol → world-v1 JSON. No canon writes.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewRaw,reviewDigest} from './world-review-fields.mjs';
import {responseUsage} from './analysis-scene.mjs';

export const VISION_TAG_METHOD='openai-gpt-6.1-sol-world-v1';
export const VISION_TAG_PROVIDER='openai';
export const VISION_TAG_MODEL='gpt-6.1-sol';
export const VISION_TAG_ENDPOINT='https://api.openai.com/v1/responses';
export const VISION_TAG_KEY='OPENAI_API_KEY';

const contract=JSON.parse(readFileSync(new URL('./world-v1-contract.json',import.meta.url),'utf8'));
export const worldV1Contract=Object.freeze(contract);
export const visionTagDefaults=Object.freeze({
  model:VISION_TAG_MODEL,
  model_revision:contract.provider?.model_revision||VISION_TAG_MODEL,
  result_contract:'world-v1',
  image_detail:'high',
  reasoning_effort:'medium',
  max_output_tokens:8192,
  timeout_ms:180000,
  max_response_bytes:262144,
  cost:{
    input_usd_per_million:2,
    output_usd_per_million:10,
    input_tokens_per_image:10000,
    basis:'OpenAI Standard short-context gpt-6.1-sol prices; image allowance is an estimate including prompt/schema.',
    limitations:'Not a provider billing cap. Taxes, retries, long-context multipliers and account adjustments excluded.'
  }
});

export class VisionError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const issue=(code,message,status=400)=>new VisionError(code,message,status);

export function estimateTagCostUsd(imageCount,{alreadySpentUsd=0,maxTotalUsd=null}={}){
  if(!Number.isInteger(imageCount)||imageCount<0)throw issue('INVALID_COUNT','Image count must be a non-negative integer.');
  const c=visionTagDefaults.cost;
  const perImage=((c.input_tokens_per_image/1e6)*c.input_usd_per_million)+((visionTagDefaults.max_output_tokens/1e6)*c.output_usd_per_million);
  const estimated_additional_usd=Number((perImage*imageCount).toFixed(6));
  const estimated_total_usd=Number((alreadySpentUsd+estimated_additional_usd).toFixed(6));
  return {
    method:VISION_TAG_METHOD,model:VISION_TAG_MODEL,image_count:imageCount,per_image_usd_estimate:Number(perImage.toFixed(6)),
    already_spent_usd:alreadySpentUsd,estimated_additional_usd,estimated_total_usd,max_total_usd:maxTotalUsd,
    within_budget:maxTotalUsd==null||estimated_total_usd<=maxTotalUsd,cost:c
  };
}

export function buildTagDisclosure(){
  return {prompt:contract.prompt,output_schema:contract.output_schema};
}

export function buildTagPlanFields(extra={}){
  const disclosure=buildTagDisclosure();
  return {
    provider:{
      enabled:true,
      model:visionTagDefaults.model,
      model_revision:visionTagDefaults.model_revision,
      result_contract:visionTagDefaults.result_contract,
      image_detail:visionTagDefaults.image_detail,
      reasoning_effort:visionTagDefaults.reasoning_effort,
      timeout_ms:visionTagDefaults.timeout_ms,
      max_response_bytes:visionTagDefaults.max_response_bytes,
      max_output_tokens:visionTagDefaults.max_output_tokens,
      cost:visionTagDefaults.cost
    },
    disclosure,
    ...extra
  };
}

function dataUrl(bytes,contentType){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024)throw issue('IMAGE_TOO_LARGE','Keep each uploaded analysis image at or under 20 MiB.');
  if(!['image/jpeg','image/png'].includes(contentType))throw issue('UNSUPPORTED_IMAGE','Vision tagging accepts JPEG or PNG only.');
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

function extractOutputText(raw){
  if(typeof raw?.output_text==='string'&&raw.output_text.trim())return raw.output_text;
  const chunks=[];
  for(const item of raw?.output||[]){
    if(item?.type==='message')for(const part of item.content||[])if(part?.type==='output_text'&&typeof part.text==='string')chunks.push(part.text);
  }
  const text=chunks.join('').trim();
  if(!text)throw issue('PROVIDER_RESULT_INVALID','The model returned no JSON text.',502);
  return text;
}

export async function analyzeWorldImage({bytes,contentType='image/jpeg',apiKey,fetchImpl=fetch,signal}={}){
  if(!apiKey||typeof apiKey!=='string')throw issue('MISSING_API_KEY','Set OPENAI_API_KEY in the app process environment.',403);
  const disclosure=buildTagDisclosure();
  const body={
    model:visionTagDefaults.model,
    store:false,
    reasoning:{effort:visionTagDefaults.reasoning_effort},
    max_output_tokens:visionTagDefaults.max_output_tokens,
    text:{format:{type:'json_schema',name:'world_v1',strict:true,schema:disclosure.output_schema}},
    input:[{role:'user',content:[
      {type:'input_image',image_url:dataUrl(bytes,contentType),detail:visionTagDefaults.image_detail},
      {type:'input_text',text:disclosure.prompt}
    ]}]
  };
  let response;
  try{
    response=await fetchImpl(VISION_TAG_ENDPOINT,{
      method:'POST',redirect:'error',
      signal:signal||AbortSignal.timeout(visionTagDefaults.timeout_ms),
      headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
  }catch{
    throw issue('PROVIDER_OUTCOME_UNKNOWN','The vision connection failed. It may have billed this attempt. Do not retry automatically.',502);
  }
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw issue('PROVIDER_REJECTED','Vision provider declined the request (HTTP '+response.status+').',502);}
  let size=0,chunks=[];
  try{
    for await(const chunk of response.body){size+=chunk.length;if(size>visionTagDefaults.max_response_bytes)throw Error();chunks.push(chunk);}
  }catch{await response.body?.cancel().catch(()=>{});throw issue('PROVIDER_OUTCOME_UNKNOWN','Vision result exceeded local bounds. Check provider usage before another attempt.',502);}
  let raw;
  try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw issue('PROVIDER_RESULT_INVALID','Vision response was not JSON.',502);}
  let parsed;
  try{parsed=JSON.parse(extractOutputText(raw));}
  catch{throw issue('PROVIDER_RESULT_INVALID','Vision output text was not JSON.',502);}
  const validated=reviewRaw(parsed);
  const usage=responseUsage(raw.usage)||null;
  const requestId=typeof raw.id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(raw.id)?raw.id:(response.headers.get('x-request-id')||null);
  return {
    method:VISION_TAG_METHOD,
    model:visionTagDefaults.model,
    model_revision:visionTagDefaults.model_revision,
    reasoning_effort:visionTagDefaults.reasoning_effort,
    image_detail:visionTagDefaults.image_detail,
    result_contract:'world-v1',
    raw:validated,
    usage,
    request_id:requestId,
    prompt_hash:reviewDigest(disclosure.prompt),
    schema_hash:reviewDigest(disclosure.output_schema),
    source_sha256:createHash('sha256').update(bytes).digest('hex')
  };
}
