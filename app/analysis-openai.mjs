import {analysisError as error} from './analysis-model.mjs';
import {analysisPrompt,analysisOutputSchema} from './analysis-schema.mjs';

export function openAIResponsesRequest(spec,image,goals,{prompt=analysisPrompt,schema=analysisOutputSchema}={}){
  return {model:spec.model,store:false,stream:false,instructions:prompt,input:[{role:'user',content:[{type:'input_text',text:'Selected categories: '+goals.join(', ')},{type:'input_image',image_url:'data:image/jpeg;base64,'+image.bytes.toString('base64'),detail:spec.image_detail||'low'}]}],text:{format:{type:'json_schema',name:'living_universe_analysis',strict:true,schema}},max_output_tokens:spec.max_output_tokens,...(spec.reasoning_effort?{reasoning:{effort:spec.reasoning_effort}}:{})};
}

export function openAIResponsesContent(raw,spec){
  if(raw.status!=='completed'||raw.model!==spec.model_revision||raw.error||raw.incomplete_details||!Array.isArray(raw.output))throw error('INVALID_RESULT','A felhős eredmény hiányos, elutasított vagy eltérő modellből származik.',502);
  const messages=raw.output.filter(v=>v?.type==='message');
  if(messages.length!==1||messages[0].role!=='assistant'||messages[0].status!=='completed'||!Array.isArray(messages[0].content)||messages[0].content.length!==1||messages[0].content[0]?.type!=='output_text'||raw.output.some(v=>!['message','reasoning'].includes(v?.type)))throw error('INVALID_RESULT','Érvénytelen strukturált felhős eredmény.',502);
  return messages[0].content[0].text;
}
