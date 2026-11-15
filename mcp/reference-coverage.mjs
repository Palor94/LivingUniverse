// Advisory coverage over explicitly approved reference roles only.
// Face and body are scored separately; unknown angles stay unknown.
export const REQUIRED_REFERENCE_ROLES=['face','body'];
export const OPTIONAL_REFERENCE_ROLES=['detail','general'];
export const REFERENCE_COVERAGE_ROLES=[...REQUIRED_REFERENCE_ROLES,...OPTIONAL_REFERENCE_ROLES];

export function analyzeReferenceCoverage(references=[]){
  const by_role=Object.fromEntries(REFERENCE_COVERAGE_ROLES.map(role=>[role,[]]));
  const unknown_roles=[];
  for(const ref of references){
    const role=REFERENCE_COVERAGE_ROLES.includes(ref.role)?ref.role:null;
    const still=!Object.hasOwn(ref,'media_kind')||ref.media_kind==='image';
    const item={media_id:ref.media_id,still,...(ref.reference_id?{reference_id:ref.reference_id}:{}),...(ref.crop?{has_crop:true}:{has_crop:false}),fingerprint_available:typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/i.test(ref.sha256)};
    if(role)by_role[role].push(item);else unknown_roles.push({media_id:ref.media_id,role:ref.role??null});
  }
  const present_roles=REFERENCE_COVERAGE_ROLES.filter(role=>by_role[role].length);
  const missing_required=REQUIRED_REFERENCE_ROLES.filter(role=>!by_role[role].length);
  const still_present_roles=REFERENCE_COVERAGE_ROLES.filter(role=>by_role[role].some(item=>item.still));
  const still_missing_required=REQUIRED_REFERENCE_ROLES.filter(role=>!by_role[role].some(item=>item.still));
  const non_still_references=references.filter(ref=>Object.hasOwn(ref,'media_kind')&&ref.media_kind!=='image').length;
  const missing_optional=OPTIONAL_REFERENCE_ROLES.filter(role=>!by_role[role].length);
  const recommended_next=still_missing_required.length?still_missing_required.slice(0,1):missing_optional.slice(0,1);
  const stillNote=!non_still_references?'':still_missing_required.length
    ?` ${non_still_references} approved reference${non_still_references===1?' is not a still picture':'s are not still pictures'}. Identity tagging still needs a JPEG or PNG ${still_missing_required.join(' and ')} reference.`
    :` ${non_still_references} approved reference${non_still_references===1?' is not a still picture':'s are not still pictures'}. Identity tagging uses the JPEG or PNG stills.`;
  return {
    total_references:references.length,
    by_role,
    present_roles,
    missing_required_roles:missing_required,
    still_present_roles,
    still_missing_required_roles:still_missing_required,
    non_still_references,
    missing_optional_roles:missing_optional,
    recommended_next_roles:recommended_next,
    unknown_roles,
    face_body_evaluated_separately:true,
    angle_coverage_known:false,
    message:(missing_required.length
      ?`Missing required approved role(s): ${missing_required.join(', ')}. Angle/expression coverage is not inferred.`
      :'Required face and body roles are present. Optional detail/general roles and camera angles remain advisory only.')+stillNote
  };
}
