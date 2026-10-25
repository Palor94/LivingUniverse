export function mediaFormValues(data,complete){
  const location=data.get('location_id');
  return {character_ids:data.getAll('character'),tags:data.get('tags')||'',notes:data.get('notes')||'',structured_tag_ids:data.getAll('structured_tag'),location_reference:data.has('location_id')?Boolean(location):data.has('location_reference'),...(data.has('location_id')?{location_id:location&&location!=='__unspecified__'?location:null}:{}),...(typeof complete==='boolean'?{categorization_complete:complete}:{})};
}

export async function mediaFormPayload(form,complete){
  const seen=new Set();
  for(;;){const pending=[form._pendingTagCreation,form._pendingLocationCreation,form._pendingCharacterCreation].filter(p=>p&&!seen.has(p));if(!pending.length)break;for(const p of pending)seen.add(p);if((await Promise.all(pending)).some(result=>result===false))throw Error('The new tag, location, or character could not be created. Check the inline message and retry.');}
  return mediaFormValues(new FormData(form),complete);
}
