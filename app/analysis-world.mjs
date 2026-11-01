// Additional structured visual coverage for future world/media selection. No identity inference.
const text=maxLength=>({type:'string',maxLength});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const enumeration=values=>({type:'string',enum:values});
const list=(items,maxItems)=>({type:'array',items,maxItems});
const bilingual=object({hu:text(60),en:text(60)});
export const worldDetailsSchema=object({
  camera:object({direction:enumeration(['frontal','three_quarter_front','profile','three_quarter_rear','rear','mixed','undetermined']),elevation:enumeration(['eye_level','high_angle','low_angle','overhead','mixed','undetermined']),framing:enumeration(['face_close_up','head_shoulders','upper_body','three_quarter_body','full_body','detail','wide_scene','mixed','undetermined']),evidence:text(160),uncertain:{type:'boolean'}}),
  reference_coverage:list(object({participant_id:{type:'string',pattern:'^p[1-8]$'},face_visibility:enumeration(['clear','partial','hidden','unclear']),body_coverage:enumeration(['full','partial','hidden','unclear']),occlusion:enumeration(['none','partial','heavy','unclear']),usable_for:list(enumeration(['face_reference','body_reference','pose_reference']),3),limitations:text(160),uncertain:{type:'boolean'}}),8),
  scene_requirements:object({visible_features:list(bilingual,6),incompatible_uses:list(bilingual,4),evidence:text(160),uncertain:{type:'boolean'}}),
  content:object({level:enumeration(['non_intimate','nudity','sexual_activity','unclear']),evidence:text(160),uncertain:{type:'boolean'}})
});
export const worldPromptSupplement=' World-library contract: world_details adds searchable camera enums, per-figure reference coverage, brief visible scene requirements and a non-graphic content class. Keep outputs compact: description is ONE short sentence per language, tags only the five selected categories, observations empty unless essential, normally 1-3 activities and 0-3 compatible settings, never exhaustive synonyms or generic filler. Do not repeat an explanation across fields. camera.direction, elevation and framing are independent; use mixed for incompatible multi-view compositions and undetermined where unsupported. reference_coverage has at most one row per visible p-id. Hidden/unclear faces cannot be face_reference; hidden/unclear bodies cannot be body_reference or pose_reference. Partial body coverage can be useful, but state the missing coverage without inferring unseen proportions. Face/body/pose usefulness is only an observation, not identity recognition or canonical approval. scene_requirements.visible_features lists only up to six visible functional fixtures/props that constrain scene compatibility, not colors, garments, invented history, intentions or an exhaustive object inventory. incompatible_uses is normally empty: add only a visually grounded conflict, never speculative world rules. Empty arrays are better than invented requirements. content.level classifies only visible image content using brief clinical labels; do not infer a person\'s orientation, preferences, age, consent or identity. Neutral reference backdrop still requires narration-only introduction, even if the figure is nude. Distinguish a real sparsely furnished interior from a neutral backdrop. All future world acceptance, exact-place assignment and participant-to-character mapping remain human review decisions.';

function conforms(v,s){
  if(s.type==='object')return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===s.required.length&&s.required.every(k=>Object.hasOwn(v,k)&&conforms(v[k],s.properties[k]));
  if(s.type==='array')return Array.isArray(v)&&v.length<=s.maxItems&&v.every(x=>conforms(x,s.items));
  if(s.type==='string')return typeof v==='string'&&[...v].length<=(s.maxLength??Infinity)&&(!s.enum||s.enum.includes(v))&&(!s.pattern||new RegExp(s.pattern,'u').test(v))&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v);
  return s.type==='boolean'&&typeof v==='boolean';
}
export function validateWorldDetails(value,scene){
  const invalid=()=>{throw Object.assign(Error('Érvénytelen strukturált világmédia-megfigyelés.'),{code:'INVALID_RESULT',status:502});};
  if(!conforms(value,worldDetailsSchema)||!scene)invalid();
  const people=new Set(scene.participants.map(p=>p.id)),seen=new Set();
  for(const coverage of value.reference_coverage){
    if(!people.has(coverage.participant_id)||seen.has(coverage.participant_id)||new Set(coverage.usable_for).size!==coverage.usable_for.length)invalid();seen.add(coverage.participant_id);
    if(['hidden','unclear'].includes(coverage.face_visibility)&&coverage.usable_for.includes('face_reference'))invalid();
    if(['hidden','unclear'].includes(coverage.body_coverage)&&coverage.usable_for.some(x=>['body_reference','pose_reference'].includes(x)))invalid();
  }
  return structuredClone(value);
}
