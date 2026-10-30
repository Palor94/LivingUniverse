import {digest} from './character-edit.mjs';

// Explicit user-selected retention exception to immutable reference membership.
// Keep revision IDs/appearance so completed generation manifests stay meaningful.
// Never alter original media provenance or rewrite completed generation receipts.
export function forgetRemovedReferences({all,run,characterId,retainedIds}){
  const retained=new Set(retainedIds),removed=new Set();let revisions=0,proposals=0;
  for(const row of all('SELECT id,references_json FROM canon WHERE character_id=?',characterId)){
    const refs=JSON.parse(row.references_json),kept=refs.filter(ref=>retained.has(ref.media_id));
    for(const ref of refs)if(!retained.has(ref.media_id))removed.add(ref.media_id);
    if(kept.length!==refs.length){
      run('UPDATE canon SET references_json=? WHERE id=?',JSON.stringify(kept),row.id);revisions++;
    }
  }
  if(!removed.size)return {revisions,proposals};
  // Old reviewed proposals are not an alternate archive of removed selections.
  // Invalidate pending approval rather than applying a silently modified payload.
  for(const row of all('SELECT * FROM mcp_reference_changes WHERE character_id=?',characterId)){
    const payload=JSON.parse(row.payload_json);
    if(![...(payload.before||[]),...(payload.after||[])].some(ref=>removed.has(ref.media_id)))continue;
    payload.before=(payload.before||[]).filter(ref=>!removed.has(ref.media_id));
    payload.after=(payload.after||[]).filter(ref=>!removed.has(ref.media_id));payload.reason='';
    const result=row.result_json?JSON.parse(row.result_json):null;
    if(result?.references)result.references=result.references.filter(ref=>!removed.has(ref.media_id));
    run('UPDATE mcp_reference_changes SET payload_json=?,change_hash=?,result_json=?,status=? WHERE id=?',JSON.stringify(payload),digest(payload),result?JSON.stringify(result):null,['pending','approved'].includes(row.status)?'conflict':row.status,row.id);proposals++;
  }
  // Local matching evidence must not retain a removed reference either.
  for(const row of all('SELECT id,evidence_json FROM sorting_suggestions WHERE character_id=?',characterId)){
    const evidence=JSON.parse(row.evidence_json);
    if((evidence.references||[]).some(ref=>removed.has(ref.media_id))){
      run('DELETE FROM suggestion_feedback WHERE suggestion_id=?',row.id);
      run('DELETE FROM sorting_suggestions WHERE id=?',row.id);
    }
  }
  return {revisions,proposals};
}

// Explicit, one-off catalogue-wide cleanup requested by the creator. Caller must
// provide a verified backup and a single transaction. Do not run on startup.
export function cleanExistingReferenceHistory({all,run}){
  const result={profiles:0,reference_revisions:0,reference_proposals:0,explanations:0,proposal_explanations:0};
  for(const character of all('SELECT id FROM characters')){
    result.profiles++;
    const rows=all('SELECT references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',character.id);
    const latest=all('SELECT id FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',character.id)[0];
    const refs=rows.length?JSON.parse(rows[0].references_json):[];
    const cleanup=forgetRemovedReferences({all,run,characterId:character.id,retainedIds:refs.map(ref=>ref.media_id)});
    for(const old of all('SELECT id,references_json FROM canon WHERE character_id=? AND id<>?',character.id,latest?.id||'')){if(old.references_json!=='[]'){run("UPDATE canon SET references_json='[]' WHERE id=?",old.id);cleanup.revisions++;}}
    result.reference_revisions+=cleanup.revisions;result.reference_proposals+=cleanup.proposals;
  }
  // Only obsolete reference-selection commentary: preserve the complete current
  // revision and the rationale of historical appearance changes.
  const eligible=new Set();
  for(const character of all('SELECT id FROM characters')){
    const rows=all('SELECT id,appearance,reason FROM canon WHERE character_id=? ORDER BY rowid',character.id);
    for(let i=0;i<rows.length-1;i++)if(rows[i].appearance===(rows[i-1]?.appearance??'')){
      eligible.add(rows[i].id);
      if(rows[i].reason){run("UPDATE canon SET reason='' WHERE id=?",rows[i].id);result.explanations++;}
    }
  }
  for(const row of all('SELECT * FROM mcp_reference_changes')){
    const receipt=row.result_json?JSON.parse(row.result_json):null;
    // Completed proposals for eligible obsolete reference-only revisions only.
    if(row.status!=='applied'||!eligible.has(receipt?.revision_id))continue;
    const payload=JSON.parse(row.payload_json);if(!payload.reason)continue;
    payload.reason='';
    run('UPDATE mcp_reference_changes SET payload_json=?,change_hash=? WHERE id=?',JSON.stringify(payload),digest(payload),row.id);
    result.proposal_explanations++;
  }
  return result;
}
