// Read-only candidate retrieval. Proposed labels may guide search without becoming canon.
import {searchWorldIndex,worldConceptKey} from './analysis-world-index.mjs';
export function retrieveWorldMedia(db,criteria={}, {activeMediaIds=null}={}){
  const allowed=['purpose','character_ids','query','activities','positions','compatible_settings','reference_uses','camera','accepted_only','participant_role_requirements','limit'];
  if(!criteria||typeof criteria!=='object'||Array.isArray(criteria)||Object.keys(criteria).some(k=>!allowed.includes(k)))throw Error('Unsupported retrieval criteria');
  const purpose=criteria.purpose||'scene_illustration';if(!['scene_illustration','character_reference','generation_plan'].includes(purpose))throw Error('Unsupported retrieval purpose');
  if(criteria.participant_role_requirements?.length)return {total:0,items:[],reason:'REVIEWED_PARTICIPANT_BINDINGS_REQUIRED',uses_proposed_labels:criteria.accepted_only!==true};
  const facets={};for(const [field,facet]of [['activities','activity'],['positions','position'],['compatible_settings','compatible_setting'],['reference_uses','reference_use']])if(criteria[field]?.length)facets[facet]=criteria[field];
  const camera=criteria.camera||{};if(!camera||typeof camera!=='object'||Array.isArray(camera)||Object.keys(camera).some(k=>!['direction','elevation','framing'].includes(k)))throw Error('Invalid camera criteria');
  const found=searchWorldIndex(db,{query:criteria.query||'',scope:purpose==='character_reference'?'':purpose,excludePlanning:purpose!=='generation_plan',character_ids:criteria.character_ids||[],facets,...camera,includeUnreviewed:criteria.accepted_only!==true,active_media_ids:activeMediaIds,limit:criteria.limit||5});
  const items=found.items.map(row=>{
    const result=JSON.parse(row.result_json),labels=db.prepare('SELECT facet,concept_key,hu,en,evidence,uncertain,basis FROM world_labels WHERE media_id=?').all(row.media_id),warnings=[];
    if(row.review_state!=='accepted')warnings.push('MODEL_PROPOSALS_NOT_HUMAN_ACCEPTED');
    if(labels.some(l=>l.uncertain)||result.world_details.camera.uncertain)warnings.push('UNCERTAIN_OBSERVATIONS');
    const people=result.scene_details.participants||[],characters=db.prepare('SELECT character_id,name FROM world_asset_characters WHERE media_id=? ORDER BY character_id').all(row.media_id);
    if(people.length>1)warnings.push('FIGURES_NOT_MAPPED_TO_CHARACTER_NAMES');
    const matches=[];for(const [facet,values]of Object.entries(facets)){const keys=new Set(values.map(v=>worldConceptKey(facet,v)));for(const label of labels.filter(l=>l.facet===facet&&keys.has(l.concept_key)))matches.push({criterion:facet,label:{hu:label.hu,en:label.en},evidence:label.evidence,uncertain:!!label.uncertain,basis:label.basis});}
    for(const [field,value]of Object.entries(camera))matches.push({criterion:'camera.'+field,value,uncertain:!!result.world_details.camera.uncertain});
    for(const id of criteria.character_ids||[])matches.push({criterion:'character_id',value:id,basis:'existing_image_level_catalogue_assignment'});
    return {media_id:row.media_id,purpose,characters,label_review_state:row.review_state,canon_approval:'not_checked',identity_binding:'image_level_assignment_only',matches,warnings,live_membership_checked:activeMediaIds!==null};
  });
  return {total:found.total,items,reason:found.total?'MATCHES':'NO_MATCH',uses_proposed_labels:criteria.accepted_only!==true};
}
