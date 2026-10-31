import {analysisPrompt,analysisOutputSchema,sceneAnalysisPrompt,sceneAnalysisOutputSchema,worldAnalysisPrompt,worldAnalysisOutputSchema,validateAnalysisWireResult} from './analysis-schema.mjs';
import {responseUsage} from './analysis-scene.mjs';
import {boundedAnalysisPost} from './analysis-http.mjs';
import {ollamaVisionRequest,verifyOllamaModel,ollamaVisionContent} from './analysis-ollama.mjs';
import {openAIResponsesRequest,openAIResponsesContent} from './analysis-openai.mjs';
export {analysisPrompt,analysisOutputSchema} from './analysis-schema.mjs';
import {analysisCategories,analysisVersions,analysisDigest,analysisHash,analysisError as error,createMockAnalysisProvider} from './analysis-model.mjs';

const safeConfigError=()=>error('INVALID_PROVIDER_CONFIG','Hibás vagy hiányos helyi elemzőprovider-konfiguráció.',403);
const bounded=(v,defaultValue,min,max)=>{if(v===undefined)return defaultValue;if(!Number.isInteger(v)||v<min||v>max)throw safeConfigError();return v;};
const label=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(v);
const priceSpec=v=>{
  if(!v||typeof v.basis!=='string'||!v.basis.trim()||v.basis.length>500||typeof v.limitations!=='string'||!v.limitations.trim()||v.limitations.length>1000||![v.input_usd_per_million,v.output_usd_per_million,v.input_tokens_per_image,v.max_total_usd].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))throw safeConfigError();
  return {basis:v.basis,limitations:v.limitations,input_usd_per_million:v.input_usd_per_million,output_usd_per_million:v.output_usd_per_million,input_tokens_per_image:v.input_tokens_per_image,max_total_usd:v.max_total_usd};
};
export function loopbackEndpoint(value){
  let url;try{url=new URL(value);}catch{throw safeConfigError();}
  if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/api/chat')throw safeConfigError();
  return url.href;
}

export function createAnalysisProvider(id,config={}, {env=process.env,fetchImpl=fetch,onReceipt}={}){
  if(id==='mock')return createMockAnalysisProvider();
  if(!['ollama','openai'].includes(id)||config.enabled!==true)throw error('PROVIDER_DISABLED','Ez az elemzőprovider nincs kifejezetten engedélyezve.',403);
  if(!label(config.model)||!label(config.model_revision))throw safeConfigError();
  const cloud=id==='openai',timeoutMs=bounded(config.timeout_ms,30000,10,300000),maxResponseBytes=bounded(config.max_response_bytes,131072,256,1048576),maxOutputTokens=bounded(config.max_output_tokens,4096,128,16384);
  if(config.result_contract!==undefined&&!['standard','scene-v1','world-v1'].includes(config.result_contract)||!cloud&&['scene-v1','world-v1'].includes(config.result_contract)||config.image_detail!==undefined&&(!cloud||!['low','high','auto'].includes(config.image_detail))||config.reasoning_effort!==undefined&&(!cloud||!['none','low','medium','high','xhigh','max'].includes(config.reasoning_effort)))throw safeConfigError();
  const world=config.result_contract==='world-v1',scene=world||config.result_contract==='scene-v1',prompt=world?worldAnalysisPrompt:scene?sceneAnalysisPrompt:analysisPrompt,outputSchema=world?worldAnalysisOutputSchema:scene?sceneAnalysisOutputSchema:analysisOutputSchema;
  let endpoint='https://api.openai.com/v1/responses',cost=null;
  if(!cloud){endpoint=loopbackEndpoint(config.endpoint);if(config.local_only_confirmed!==true||!/^sha256:[a-f0-9]{64}$/u.test(config.model_revision)||!config.model.includes(':')||/(?:^|[:/.-])cloud(?:$|[:/.-])/iu.test(config.model))throw safeConfigError();}
  else{if(config.endpoint!==undefined)throw safeConfigError();cost=priceSpec(config.cost);}
  const spec=Object.freeze({id,version:'http-vision-1',model:config.model,model_revision:config.model_revision,local:!cloud,mock:false,mode:cloud?'cloud':'local',endpoint,timeout_ms:timeoutMs,max_response_bytes:maxResponseBytes,max_output_tokens:maxOutputTokens,...analysisVersions,...(world?{prompt:'media-analysis-world-1',result_contract:'world-v1'}:scene?{prompt:'media-analysis-scene-1',result_contract:'scene-v1'}:{}),prompt_hash:analysisDigest(prompt),output_schema_hash:analysisDigest(outputSchema),...(cloud?{cost,image_detail:config.image_detail||'low',...(config.reasoning_effort?{reasoning_effort:config.reasoning_effort}:{})}: {local_only_confirmed:true})});
  function requestBody({image,goals}){
    if(!image||!Buffer.isBuffer(image.bytes)||image.mime_type!=='image/jpeg'||image.bytes.length>3*1024*1024||image.sha256!==analysisHash(image.bytes)||!Array.isArray(goals)||!goals.length||goals.some(g=>!analysisCategories.includes(g)))throw error('INVALID_INPUT','Érvénytelen ellenőrzött elemzési bemenet.');
    return cloud?openAIResponsesRequest(spec,image,goals,{prompt,schema:outputSchema}):ollamaVisionRequest(spec,image,goals);
  }
  return {...spec,spec,requestBody,disclosure:{prompt,output_schema:outputSchema,...(cloud?{image_detail:spec.image_detail,...(spec.reasoning_effort?{reasoning_effort:spec.reasoning_effort}:{})}:{})},
    async analyzeImage(input){
      const body=requestBody(input);if(cloud&&(!input.authorization||input.authorization.request_sha256!==analysisDigest(body)))throw error('UPLOAD_APPROVAL_REQUIRED','Ehhez a pontos felhős adatátadáshoz külön jóváhagyás szükséges.',403);
      if(cloud&&(typeof env.OPENAI_API_KEY!=='string'||!env.OPENAI_API_KEY.trim()||/[\r\n]/u.test(env.OPENAI_API_KEY)))throw error('CREDENTIAL_REQUIRED','A szerveroldali OpenAI API-kulcs nincs beállítva.',403);
      if(!cloud)await verifyOllamaModel(spec,input.signal,fetchImpl);
      const raw=await boundedAnalysisPost({endpoint,body,headers:cloud?{Authorization:'Bearer '+env.OPENAI_API_KEY}:{},signal:input.signal,timeoutMs,maxResponseBytes,fetchImpl,cloud});
      input.signal?.throwIfAborted();
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw error('INVALID_RESULT','Érvénytelen providerválasz.',502);
      const usage=cloud?responseUsage(raw.usage):null;
      if(cloud&&onReceipt)await onReceipt({request_sha256:analysisDigest(body),model_matches:raw.model===spec.model_revision,status:['completed','incomplete','failed'].includes(raw.status)?raw.status:'unknown',usage});
      const content=cloud?openAIResponsesContent(raw,spec):ollamaVisionContent(raw,spec);
      if(typeof content!=='string'||Buffer.byteLength(content)>65536)throw error('INVALID_RESULT','Érvénytelen vagy túl nagy strukturált eredmény.',502);
      let result;try{result=JSON.parse(content);}catch{throw error('INVALID_RESULT','A strukturált eredmény nem JSON.',502);}const normalized=validateAnalysisWireResult(result,outputSchema);return {...normalized,...(usage?{usage}:{})};
    }
  };
}

export function configuredAnalysisProviders(config={},dependencies={}){
  const providers=[createMockAnalysisProvider()],unavailable=[];
  for(const id of ['ollama','openai']){
    try{providers.push(createAnalysisProvider(id,config?.providers?.[id],dependencies));}
    catch(e){unavailable.push({id,available:false,code:e.code==='PROVIDER_DISABLED'?'PROVIDER_DISABLED':'INVALID_PROVIDER_CONFIG'});}
  }
  return {providers,unavailable};
}
