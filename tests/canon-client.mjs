// Successful fixture approvals follow the same compare-before-save flow as the UI.
// Conflict and malformed-request regressions use the raw API instead.
export async function approveCanon(call,characterId,data){
  const response=await call('/api/characters/'+characterId);
  const character=response.value??response.data??response;
  return call('/api/characters/'+characterId+'/canon',{
    expected_revision_id:character.canon?.id??null,
    expected_references:character.canon?JSON.parse(character.canon.references_json):[],
    ...data,
  });
}
