// Reuse the actual input across a results redraw. Capture at the last moment so
// typing or selection changes during an outstanding request are retained too.
export function retainMediaSearch(input){
  if(!input)return ()=>{};
  const focused=input.ownerDocument.activeElement===input;
  const start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;
  return replacement=>{
    if(!replacement)return;
    replacement.replaceWith(input);
    if(focused){input.focus({preventScroll:true});input.setSelectionRange(start,end,direction);}
  };
}

export function mediaFormValues(data,complete){
  const location=data.get('location_id');
  if(data.has('location_multi')){const places=data.getAll('location_ids');return {character_ids:data.getAll('character'),tags:data.get('tags')||'',notes:data.get('notes')||'',structured_tag_ids:data.getAll('structured_tag'),location_reference:data.has('location_reference'),location_ids:places,location_id:places[0]||null,...(typeof complete==='boolean'?{categorization_complete:complete}:{})};}
  return {character_ids:data.getAll('character'),tags:data.get('tags')||'',notes:data.get('notes')||'',structured_tag_ids:data.getAll('structured_tag'),location_reference:data.has('location_reference')||location==='__unspecified__',...(data.has('location_id')?{location_id:location&&location!=='__unspecified__'?location:null}:{}),...(typeof complete==='boolean'?{categorization_complete:complete}:{})};
}

export async function mediaFormPayload(form,complete){
  const seen=new Set();
  for(;;){const pending=[form._pendingTagCreation,form._pendingLocationCreation,form._pendingCharacterCreation].filter(p=>p&&!seen.has(p));if(!pending.length)break;for(const p of pending)seen.add(p);if((await Promise.all(pending)).some(result=>result===false))throw Error('The new tag, location, or character could not be created. Check the inline message and retry.');}
  return mediaFormValues(new FormData(form),complete);
}

// Refresh assignment-dependent controls without rebuilding the viewer or
// discarding an in-progress appearance review. Saving is never canon approval.
export function refreshMediaReviewControls(root,media){
  const characters=media.characters||[],select=root.querySelector('#review-form select[name="character_id"]');
  if(select){const previous=select.value;select.replaceChildren();for(const c of characters){const option=select.ownerDocument.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option);}if(characters.some(c=>c.id===previous))select.value=previous;}
  const review=root.querySelector('#review-form button');if(review)review.disabled=!characters.length;
  for(const [id,allowed]of [['reference-button',characters.length>0],['cover-button',media.kind==='image'&&characters.length>0],['compare-button',media.kind==='image'&&characters.length>0]]){const button=root.querySelector('#'+id);if(button)button.disabled=!allowed;}
}
