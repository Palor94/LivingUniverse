// Coordinates are fractions of the EXIF-oriented source, independent of display size.
export function referenceCrop(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='h,w,x,y'||!['x','y','w','h'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]))||value.x<0||value.y<0||value.w<.01||value.h<.01||value.x+value.w>1||value.y+value.h>1)throw Object.assign(Error('Choose a crop inside the picture (at least 1% on each side).'),{status:400,code:'INVALID_CROP'});
  return {x:value.x,y:value.y,w:value.w,h:value.h};
}
export const sameCrop=(a,b)=>JSON.stringify(referenceCrop(a))===JSON.stringify(referenceCrop(b));
// Omitted crop preserves an already approved region. Only an explicit value
// (including null for the whole image) requests a different approved selection.
export const referenceKey=ref=>ref.reference_id||ref.media_id;
export function previousReference(ref,previous=[]){return previous.find(r=>referenceKey(r)===referenceKey(ref)&&r.media_id===ref.media_id);}
export function selectedCrop(ref,previous=[]){return referenceCrop(Object.hasOwn(ref,'crop')?ref.crop:previousReference(ref,previous)?.crop);}
export function referenceSnapshot(ref){
  const result={media_id:ref.media_id,role:ref.role,sha256:ref.sha256};
  if(Object.hasOwn(ref,'crop'))result.crop=referenceCrop(ref.crop);
  for(const key of ['reference_id','status','approved_by','approved_at','approval_id'])if(Object.hasOwn(ref,key))result[key]=ref[key];
  return result;
}
