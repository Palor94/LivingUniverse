// Gated machine auto-canon decisions. Numeric thresholds stay unset until owner lock-in.
import {isPlanningSource} from './media-purpose.mjs';
export const AUTO_CANON_POLICY_VERSION='2026-11-06';
export const AUTO_CANON_METHOD='openai-gpt-6.1-sol-identity-v1';

/** Local config shape (outside Git). writer_enabled defaults false. */
export function readAutoCanonConfig(config={}){
  const numeric=config.numeric_gates;
  return {
    policy_version:AUTO_CANON_POLICY_VERSION,
    method:AUTO_CANON_METHOD,
    writer_enabled:config.writer_enabled===true,
    require_existing_face_and_body_refs:config.require_existing_face_and_body_refs!==false,
    numeric_gates_locked:numeric?.locked===true&&typeof numeric?.accept_face==='number'&&typeof numeric?.accept_body==='number',
    numeric_gates:numeric&&typeof numeric==='object'?{...numeric}:null,
    max_promotions_per_hour:Number.isInteger(config.max_promotions_per_hour)?config.max_promotions_per_hour:20,
    actor_prefix:typeof config.actor_prefix==='string'&&config.actor_prefix?config.actor_prefix:'machine'
  };
}

/**
 * Decide whether a participant match may become an approved crop reference.
 * Returns {ok:false,abstain_reasons[]} or {ok:true,roles[]}.
 */
export function evaluateAutoCanonCandidate({
  config={},
  participant,
  region=null,
  existingRoles=new Set(),
  overlapping=false,
  genderKnownMale=true,
  relativePath=null
}={}){
  const cfg=readAutoCanonConfig(config);
  const reasons=[];
  if(!cfg.writer_enabled)reasons.push('writer_disabled');
  if(!cfg.numeric_gates_locked)reasons.push('numeric_gates_unset');
  if(!genderKnownMale)reasons.push('owner_character_policy');
  if(relativePath!=null&&isPlanningSource(relativePath))reasons.push('generation_plan_excluded');
  if(!participant||participant.decision!=='match'||!participant.character_id)reasons.push('no_match');
  if(overlapping)reasons.push('region_overlap');
  if(!region||!(region.width>0)||!(region.height>0))reasons.push('missing_clean_crop');
  if(cfg.require_existing_face_and_body_refs&&!(existingRoles.has('face')&&existingRoles.has('body')))reasons.push('bootstrap_refs_required');

  const roles=[];
  if(participant?.crop_roles?.includes('face')&&participant.face?.verdict==='match')roles.push('face');
  else if(participant?.crop_roles?.includes('face'))reasons.push('face_not_matched');
  if(participant?.crop_roles?.includes('body')&&participant.body?.verdict==='match')roles.push('body');
  else if(participant?.crop_roles?.includes('body'))reasons.push('body_not_matched');
  if(participant?.face?.verdict==='match'&&participant?.body?.verdict==='unevaluated'&&participant?.crop_roles?.includes('face')&&!participant?.crop_roles?.includes('body')){
    // Face-only crop may promote face role without body certification.
    if(!roles.includes('face'))roles.push('face');
  }
  if(participant?.face?.verdict==='match'&&participant?.crop_roles?.includes('body')&&participant?.body?.verdict!=='match'){
    // Body role requested but not certified: drop body, keep face if already added.
    const i=roles.indexOf('body');if(i>=0)roles.splice(i,1);
    if(!reasons.includes('body_not_matched'))reasons.push('body_not_matched');
  }
  if(!roles.length)reasons.push('no_promotable_role');

  // Whole-frame promotion is never allowed; region is mandatory above.
  if(reasons.some(r=>['writer_disabled','numeric_gates_unset','owner_character_policy','generation_plan_excluded','no_match','region_overlap','missing_clean_crop','bootstrap_refs_required','no_promotable_role'].includes(r))){
    return {ok:false,roles:[],abstain_reasons:[...new Set(reasons)],config:cfg};
  }
  return {ok:true,roles:[...new Set(roles)],abstain_reasons:[],config:cfg,character_id:participant.character_id,region:{...region}};
}

export function machineActor(config={},method=AUTO_CANON_METHOD){
  const cfg=readAutoCanonConfig(config);
  return `${cfg.actor_prefix}:${method}@${AUTO_CANON_POLICY_VERSION}`;
}
