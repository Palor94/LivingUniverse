// Existing folder regression scenarios now exercise the mandatory preview flow.
export async function confirmFolders(call,route,data){
  const folders=route==='/api/assign-folder'?[{folder:data.folder,character_id:data.character_id}]:data.folders;
  const preview=await call('/api/folders/preview',{folders});
  return call('/api/folders/confirm',{token:preview.token});
}
