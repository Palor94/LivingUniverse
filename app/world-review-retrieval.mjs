import {effectiveReviewFields,factText,reviewError as error} from './world-review-fields.mjs';
import {describeMediaPurpose} from './media-purpose.mjs';
import {sceneRoles} from './analysis-scene.mjs';
const normalize=v=>v.normalize('NFD').replace(/\p{M}/gu,'').trim().toLocaleLowerCase();
// Uses reviewed per-figure bindings only; catalogue associations remain image-level.
export function retrieveReviewedWorldMedia(db,criteria={}, {activeMediaIds=null}={}){
 const allowed=['purpose','character_ids','query','activities','positions','compatible_settings','reference_uses','camera','accepted_only','participant_role_requirements','limit'];
 if(!criteria||typeof criteria!=='object'||Array.isArray(criteria)||Object.keys(criteria).some(k=>!allowed.includes(k)))throw error('INVALID_CRITERIA','Ismeretlen keresési feltétel.');
 const purpose=criteria.purpose||'scene_illustration';if(!['scene_illustration','character_reference','generation_plan'].includes(purpose))throw error('INVALID_CRITERIA','Érvénytelen felhasználási cél.');
 const requested=criteria.participant_role_requirements||[];if(!Array.isArray(requested)||requested.length>8||requested.some(r=>!r||Object.keys(r).some(k=>!['character_id','role','activity_id'].includes(k))||typeof r.character_id!=='string'||!sceneRoles.includes(r.role)||r.activity_id!==undefined&&typeof r.activity_id!=='string'))throw error('INVALID_CRITERIA','Érvénytelen szereplőszerep-feltétel.');
 const characterIds=criteria.character_ids||[];if(!Array.isArray(characterIds)||characterIds.length>8||characterIds.some(id=>typeof id!=='string'))throw error('INVALID_CRITERIA','Érvénytelen karakterfeltétel.');
 const camera=criteria.camera||{};if(!camera||typeof camera!=='object'||Array.isArray(camera)||Object.keys(camera).some(k=>!['direction','elevation','framing'].includes(k)||typeof camera[k]!=='string'))throw error('INVALID_CRITERIA','Érvénytelen kamerafeltétel.');
 const facets={activities:'activity',positions:'position',compatible_settings:'compatible_setting',reference_uses:'reference'};
 for(const k of Object.keys(facets))if(criteria[k]!==undefined&&(!Array.isArray(criteria[k])||criteria[k].length>8||criteria[k].some(v=>typeof v!=='string'||!v.trim()||v.length>200)))throw error('INVALID_CRITERIA','Érvénytelen címkefeltétel.');
 if(criteria.query!==undefined&&(typeof criteria.query!=='string'||criteria.query.length>200)||criteria.accepted_only!==undefined&&typeof criteria.accepted_only!=='boolean')throw error('INVALID_CRITERIA','Érvénytelen keresés.');
 const query=(criteria.query||'').split(/\s+/u).filter(Boolean).map(normalize),accepted=criteria.accepted_only===true,items=[];let missingBindings=false;
 const rows=db.prepare("SELECT s.*,d.document_json FROM world_review_sources s JOIN active_media m ON m.id=s.media_id JOIN world_review_documents d ON d.source_id=s.id WHERE s.rowid=(SELECT max(s2.rowid) FROM world_review_sources s2 WHERE s2.media_id=s.media_id) AND NOT EXISTS(SELECT 1 FROM world_review_tombstones t WHERE t.media_id=s.media_id) ORDER BY s.media_id").all();
 for(const row of rows){
  if(activeMediaIds!==null&&!activeMediaIds.has(row.media_id))continue;
  const raw=JSON.parse(row.raw_json),doc=JSON.parse(row.document_json),planning=describeMediaPurpose(row.source_path,raw).kind==='generation_plan',allFields=effectiveReviewFields(raw,doc),fields=allFields.filter(f=>f.state!=='rejected'&&(!accepted||f.state==='accepted')),simulation=allFields.find(f=>f.id==='simulation');
  if(purpose==='generation_plan'?!planning:planning)continue;
  if(planning&&accepted&&simulation.state!=='accepted')continue;
  if(purpose==='scene_illustration'&&(simulation.state==='rejected'||simulation.value.scope!=='scene_illustration'||simulation.value.narration_only||accepted&&simulation.state!=='accepted'))continue;
  if(purpose==='character_reference'&&accepted&&!fields.some(f=>f.group==='reference'))continue;
  const characters=db.prepare('SELECT c.id,c.name FROM characters c JOIN depictions d ON d.character_id=c.id WHERE d.media_id=?').all(row.media_id);
  const people=doc.participants.filter(p=>!p.ignored),bound=doc.identity_reviewed?people.filter(p=>p.identity_state==='reviewed'&&p.character_id):[];
  if(characterIds.some(id=>!characters.some(c=>c.id===id)&&!bound.some(p=>p.character_id===id)))continue;
  if(Object.entries(camera).some(([k,v])=>!fields.some(f=>f.id==='camera:'+k&&f.value===v)))continue;
  let mismatch=false;const matches=[];
  for(const [key,group]of Object.entries(facets)){
   const values=criteria[key]||[];if(!values.length)continue;
   const found=fields.filter(f=>f.group===group&&values.some(value=>group==='reference'?f.value.usable_for.includes(value):normalize(factText(f).en)===normalize(value)||normalize(factText(f).hu)===normalize(value)));
   if(!found.length){mismatch=true;break;}matches.push(...found.map(f=>({criterion:group,label:factText(f),state:f.state,uncertain:f.uncertain,evidence:f.evidence})));
  }
  if(mismatch)continue;
  if(requested.some(req=>!allFields.some(f=>f.kind==='role'&&f.state==='accepted'&&f.value.role===req.role&&(!req.activity_id||req.activity_id===f.value.activity_id)&&allFields.some(a=>a.id==='activity:'+f.value.activity_id&&a.state==='accepted')&&bound.some(p=>p.id===f.value.participant_id&&p.character_id===req.character_id)))){missingBindings=true;continue;}
  const haystack=normalize(fields.map(f=>Object.values(factText(f)).join(' ')).join(' ')+(accepted?'':' '+raw.description.hu+' '+raw.description.en));if(query.some(q=>!haystack.includes(q)))continue;
  const warnings=[];if(fields.some(f=>f.state==='pending'))warnings.push('MODEL_PROPOSALS_NOT_HUMAN_ACCEPTED');if(fields.some(f=>f.uncertain))warnings.push('UNCERTAIN_OBSERVATIONS');if(people.some(p=>!bound.some(b=>b.id===p.id)))warnings.push('FIGURES_NOT_MAPPED_TO_CHARACTER_NAMES');
  items.push({media_id:row.media_id,source_id:row.id,source_sha256:row.source_sha256,purpose,characters,label_review_state:allFields.every(f=>f.state==='accepted')?'accepted':'partial_or_proposed',canon_approval:'not_checked',identity_binding:bound.length?'human_reviewed_per_figure':'image_level_assignment_only',participant_bindings:bound.map(p=>({participant_id:p.id,character_id:p.character_id})),matches,warnings,live_membership_checked:true});
 }
 const limit=Math.max(1,Math.min(50,Number.isInteger(criteria.limit)?criteria.limit:5));return {total:items.length,items:items.slice(0,limit),reason:items.length?'MATCHES':missingBindings?'REVIEWED_PARTICIPANT_BINDINGS_REQUIRED':'NO_MATCH',uses_proposed_labels:!accepted};
}
