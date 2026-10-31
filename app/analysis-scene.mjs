// Optional scene observations. No catalogue identities or confirmed places are inferred.
const str=maxLength=>({type:'string',maxLength});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list=(items,maxItems)=>({type:'array',items,maxItems});
const enumeration=values=>({type:'string',enum:values});
const bilingual=object({hu:str(80),en:str(80)});
export const sceneRegionSchema={anyOf:[{type:'null'},object(Object.fromEntries(['x','y','width','height'].map(k=>[k,{type:'number',minimum:0,maximum:1}])))]};
export const sceneRoles=['penetrating','receiving_penetration','giving_oral','receiving_oral','giving_manual','receiving_manual','other_visible','observer','undetermined','not_applicable'];
export const sceneDetailsSchema=object({
  environment:object({observed_function:bilingual,evidence:str(200),uncertain:{type:'boolean'}}),
  compatible_settings:list(object({label:bilingual,basis:enumeration(['visible_cues','plausible_use']),evidence:str(200),uncertain:{type:'boolean'},location_id:{type:'null'}}),6),
  participants:list(object({id:{type:'string',pattern:'^p[1-8]$'},screen_position:bilingual,region:sceneRegionSchema,character_id:{type:'null'}}),8),
  activities:list(object({id:{type:'string',pattern:'^a[1-8]$'},activity:bilingual,position:bilingual,visibility:enumeration(['visible','partially_visible','unclear']),evidence:str(200),uncertain:{type:'boolean'},roles:list(object({participant_id:{type:'string',pattern:'^p[1-8]$'},role:enumeration(sceneRoles),evidence:str(160),uncertain:{type:'boolean'}}),8)}),8),
  simulation_use:object({suggested_scope:enumeration(['scene_illustration','character_introduction','review_required']),narration_only:{type:'boolean'},evidence:str(200),uncertain:{type:'boolean'},approved:{type:'boolean',enum:[false]}})
});
export const scenePromptSupplement=' Additional scene-analysis contract: scene_details carries proposed observations, never approved canon or catalogue assignments. Describe the functional environment (public washroom, toilet cubicle, domestic bathroom, bedroom, neutral reference backdrop, or undetermined), supported by visible fixtures/layout rather than just tile color. compatible_settings lists up to six non-exclusive plausible uses, such as cafe washroom and petrol-station washroom when both fit. Distinguish visible_cues from plausible_use and explain missing distinguishing evidence. Do not force a specific business/place from generic tiles or invent context. Every location_id is null. For neutral reference backdrops compatible_settings MUST be empty and simulation_use MUST be character_introduction with narration_only=true. Sterile-looking real interiors are not automatically neutral backdrops. Identify visible figures only as p1..p8, with screen position and an optional normalized bounding region; character_id is always null. Do not name, recognize or identify people, or infer persistent sexuality, preferences, dominance, intent, consent or biographies. For existing adult intimate content provide brief factual scene classification: record the visible activity and body position, then each involved figure\'s action-specific role. Distinguish penetrating/receiving_penetration, giving_oral/receiving_oral and giving_manual/receiving_manual. Do not use a global active/passive label: roles can differ across activities. Occluded contact or an unclear act must remain uncertain/undetermined, without inventing hidden anatomy or acts. An observer is not automatically a participant in the act. Use short clinical labels, no erotic narrative or new scenario suggestions. Empty activities/participants are valid when unsupported. Treat face/body reference usefulness separately from scene illustration. simulation_use is only a proposal; approved is always false. All text remains short bilingual labels/evidence as specified.';
function conforms(value,schema){
  if(schema.anyOf)return schema.anyOf.some(s=>conforms(value,s));
  const type=value===null?'null':Array.isArray(value)?'array':typeof value==='number'&&Number.isInteger(value)?'integer':typeof value;
  if(!(Array.isArray(schema.type)?schema.type:[schema.type]).some(t=>t===type||t==='number'&&type==='integer')||schema.enum&&!schema.enum.includes(value))return false;
  if(type==='object')return Object.keys(value).every(k=>Object.hasOwn(schema.properties,k))&&schema.required.every(k=>Object.hasOwn(value,k)&&conforms(value[k],schema.properties[k]));
  if(type==='array')return value.length<=schema.maxItems&&value.every(v=>conforms(v,schema.items));
  if(type==='string')return [...value].length<=(schema.maxLength??Infinity)&&(!schema.pattern||new RegExp(schema.pattern,'u').test(value))&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value);
  if(type==='number'||type==='integer')return Number.isFinite(value)&&value>=(schema.minimum??-Infinity)&&value<=(schema.maximum??Infinity);
  return true;
}
const invalid=()=>{throw Object.assign(Error('Érvénytelen strukturált jelenetmegfigyelés.'),{code:'INVALID_RESULT',status:502});};
export function validateSceneDetails(value,backgroundKind){
  if(!conforms(value,sceneDetailsSchema))invalid();
  const people=new Set();for(const p of value.participants){if(people.has(p.id))invalid();people.add(p.id);if(p.region&&(!p.region.width||!p.region.height||p.region.x+p.region.width>1||p.region.y+p.region.height>1))invalid();}
  const acts=new Set();for(const a of value.activities){if(acts.has(a.id))invalid();acts.add(a.id);const used=new Set();for(const r of a.roles){if(!people.has(r.participant_id)||used.has(r.participant_id))invalid();used.add(r.participant_id);}}
  if(backgroundKind==='neutral'&&(value.compatible_settings.length||value.simulation_use.suggested_scope!=='character_introduction'||!value.simulation_use.narration_only))invalid();
  if(value.simulation_use.suggested_scope==='character_introduction'&&!value.simulation_use.narration_only)invalid();
  return structuredClone(value);
}
export function responseUsage(value){
  if(!value||typeof value!=='object')return null;
  const usage={input_tokens:value.input_tokens,output_tokens:value.output_tokens,total_tokens:value.total_tokens,cached_input_tokens:value.input_tokens_details?.cached_tokens??0,reasoning_output_tokens:value.output_tokens_details?.reasoning_tokens??0};
  if(Object.values(usage).some(n=>!Number.isSafeInteger(n)||n<0)||usage.total_tokens!==usage.input_tokens+usage.output_tokens||usage.cached_input_tokens>usage.input_tokens||usage.reasoning_output_tokens>usage.output_tokens)return null;
  return usage;
}
