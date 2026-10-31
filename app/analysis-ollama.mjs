import {analysisError as error} from './analysis-model.mjs';
import {analysisPrompt,analysisOutputSchema} from './analysis-schema.mjs';
import {boundedAnalysisPost} from './analysis-http.mjs';

export function ollamaVisionRequest(spec,image,goals){
  return {model:spec.model,stream:false,messages:[{role:'system',content:analysisPrompt},{role:'user',content:'Selected categories: '+goals.join(', ')+'\nJSON schema:\n'+JSON.stringify(analysisOutputSchema),images:[image.bytes.toString('base64')]}],format:analysisOutputSchema,options:{temperature:0,num_predict:spec.max_output_tokens}};
}

export async function verifyOllamaModel(spec,signal,fetchImpl){
  const inventory=await boundedAnalysisPost({endpoint:new URL('/api/tags',spec.endpoint).href,method:'GET',signal,timeoutMs:spec.timeout_ms,maxResponseBytes:spec.max_response_bytes,fetchImpl});
  const matches=Array.isArray(inventory?.models)?inventory.models.filter(v=>v?.name===spec.model):null,actual=matches?.[0]?.digest;
  if(!Array.isArray(matches)||matches.length!==1||typeof actual!=='string'||!(/^(?:sha256:)?[a-f0-9]{64}$/u.test(actual))||actual.replace(/^sha256:/u,'')!==spec.model_revision.slice(7)||matches[0].remote_host||matches[0].remote_model)throw error('MODEL_CHANGED','A helyi modell nem a rögzített, kizárólag helyi példány. Képet nem küldtünk.',409);
}

export function ollamaVisionContent(raw,spec){
  if(raw.done!==true||raw.done_reason!=='stop'||raw.model!==spec.model||raw.message?.role!=='assistant'||raw.message.tool_calls?.length)throw error('INVALID_RESULT','Hiányos vagy eltérő modellből származó helyi eredmény.',502);
  return raw.message.content;
}
