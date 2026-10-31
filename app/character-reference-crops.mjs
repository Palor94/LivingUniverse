import {createHash} from 'node:crypto';
import {readFileSync,promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {digest} from './character-edit.mjs';
import {referenceCrop,referenceKey} from './reference-crop.mjs';
import {referenceImage,MAX_SOURCE_BYTES} from '../mcp/images.mjs';
import {imageInfo} from './image-crops.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const roles=['face','body','detail','general'];
export async function backupBeforeCharacterCrops(db,dataDir){
  const exists=name=>db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name);
  if(exists('character_reference_crops')&&exists('character_crop_approvals')||!exists('media')||!db.prepare('SELECT 1 FROM media LIMIT 1').get())return null;
  const folder=path.join(dataDir,'backups');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'before-character-reference-crops-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Reference crop migration backup failed verification.');}finally{copy.close();}return file;
}
export function installCharacterReferenceCrops({db,one,all,run,transaction,asset,safeFile,fingerprint,isBusy,fail,saveCanon,beforeApprovalCommit=null}){
  db.exec(readFileSync(new URL('./migrations/021-character-reference-crops.up.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/023-character-crop-approvals.up.sql',import.meta.url),'utf8'));
  let adminOrigin=null;
  function assigned(mid,cid,requireAssignment=true){
    if(!uuid.test(mid)||!uuid.test(cid))throw fail('Invalid character or media ID.');
    const m=asset(mid);
    if(m.kind!=='image'||!one('SELECT 1 FROM active_media WHERE id=?',mid)||!one('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid)||requireAssignment&&!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',mid,cid))throw fail('Choose an active image assigned to this character.',409);
    return m;
  }
  function drafts(mid){return all('SELECT character_id,role,crop_json,source_sha256,version,updated_at FROM character_reference_crops WHERE media_id=? AND EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=character_reference_crops.media_id AND d.character_id=character_reference_crops.character_id)',mid).map(({crop_json,...r})=>({...r,crop:referenceCrop(JSON.parse(crop_json))}));}
  async function source(m,cropRequired=true){
    const file=await safeFile(m),stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_SOURCE_BYTES)throw fail('Reference crop sources must be images up to 20 MiB.');
    const bytes=await fs.readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');if(await fingerprint(file)!==sha256)throw fail('The source changed while reading. Reopen the editor.',409);if(bytes.length>MAX_SOURCE_BYTES)throw fail('Image is too large.');
    const mimeType={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.bmp':'image/bmp'}[path.extname(m.relative_path).toLowerCase()];if(!mimeType)throw fail('Unsupported reference image format.');
    let info=null;if(cropRequired){if(!['image/jpeg','image/png'].includes(mimeType))throw fail('Use a still JPEG or PNG reference.');try{info=imageInfo(bytes);}catch{throw fail('This source cannot be opened in the reference crop editor.',409);}if(!['jpeg','png'].includes(info.format)||info.animated)throw fail('Use a still JPEG or PNG reference.');}
    return {bytes,sha256,info,mimeType};
  }
  async function preview(mid,ref){const m=asset(mid),s=await source(m,!!ref.crop);if(!ref.sha256||s.sha256!==ref.sha256)throw fail('The source no longer matches the approved fingerprint. Restore it or review the reference again.',409);if(ref.crop){const image=await referenceImage(s.bytes,referenceCrop(ref.crop));return {bytes:Buffer.from(image.data,'base64'),mimeType:image.mimeType};}return {bytes:s.bytes,mimeType:s.mimeType};}
  async function validateSelection(ref){if(ref.crop){referenceCrop(ref.crop);const s=await source(asset(ref.media_id));if(s.sha256!==ref.sha256)throw fail('The selected crop source changed during approval.',409);}}
  const currentCanon=cid=>one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
  const canonVersion=row=>digest({id:row?.id??null,appearance:row?.appearance??'',references:row?JSON.parse(row.references_json):[]});
  function history(mid,cid,role){return all("SELECT a.id,a.reference_id,a.revision_id,a.operation,a.undo_of,a.actor,a.created_at,EXISTS(SELECT 1 FROM character_crop_approvals u WHERE u.undo_of=a.id) undone FROM character_crop_approvals a WHERE a.media_id=? AND a.character_id=? AND a.role=? ORDER BY a.rowid DESC LIMIT 30",mid,cid,role);}
  async function context(mid,cid,role){
    if(!roles.includes(role))throw fail('Invalid crop role.');const m=assigned(mid,cid,false),s=await source(m),old=one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role),canon=currentCanon(cid);
    return {media_id:mid,character_id:cid,role,crop:old?referenceCrop(JSON.parse(old.crop_json)):null,version:old?.version??0,source_sha256:s.sha256,stale:!!old&&old.source_sha256!==s.sha256,canon_version:canonVersion(canon),history:history(mid,cid,role),approved_references:canon?JSON.parse(canon.references_json):[]};
  }
  function shape(body,keys){if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!keys.includes(k)))throw fail('Invalid crop approval request.');if(!uuid.test(body.request_id))throw fail('Use a stable request ID for this save.');}
  function replay(requestId,requestHash,actor){const row=one('SELECT * FROM character_crop_approvals WHERE id=?',requestId);if(!row)return null;if(row.request_hash!==requestHash||row.actor!==actor)throw fail('This request ID belongs to another save.',409);return receipt(row);}
  function receipt(row){const undone=!!one('SELECT 1 FROM character_crop_approvals WHERE undo_of=?',row.id);return {ok:true,status:row.operation==='approve'&&!undone?'approved':'undone',approval_id:row.id,reference_id:row.reference_id,revision_id:row.revision_id,version:JSON.parse(row.payload_json).draft_version,canon_version:canonVersion(currentCanon(row.character_id)),undone};}
  async function approve(mid,cid,role,body,actor){
    shape(body,['request_id','crop','source_sha256','expected_version','expected_canon_version']);
    const requestHash=digest({mid,cid,role,body}),priorReceipt=replay(body.request_id,requestHash,actor);if(priorReceipt)return priorReceipt;
    if(!actor||!roles.includes(role))throw fail('An authenticated administrator is required.',403);
    if(isBusy())throw fail('A catalogue operation is active. Retry this same save shortly.',409);
    const crop=referenceCrop(body.crop);if(!crop)throw fail('Select the region to approve.');
    if(!Number.isInteger(body.expected_version)||body.expected_version<0)throw fail('Reload this selection before saving.');
    const m=assigned(mid,cid,false),s=await source(m),canon=currentCanon(cid),before=canon?JSON.parse(canon.references_json):[];
    if(body.source_sha256!==s.sha256)throw fail('The image changed. Reopen the crop editor.',409);
    if(body.expected_canon_version!==canonVersion(canon))throw fail('The character references changed elsewhere. Reload before approving.',409);
    const wasAssigned=!!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',mid,cid),old=one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role),created=new Date().toISOString(),referenceId=randomUUID(),reference={media_id:mid,reference_id:referenceId,role,sha256:s.sha256,crop,status:'approved',approved_by:actor,approved_at:created,approval_id:body.request_id};
    await saveCanon({characterId:cid,appearance:canon?.appearance??'',references:[...before,reference],expectedRevisionId:canon?.id??null,expectedReferences:before,expectedFingerprints:{[mid]:s.sha256},assignMedia:[mid],forceRevision:true,preserveReferenceHistory:true,newReference:reference,reason:'Karakterkivágás jóváhagyása · '+role,afterSave:saved=>{
      const latest=one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role);if((latest?.version??0)!==body.expected_version)throw fail('This selection changed elsewhere. Reload before saving.',409);
      const version=(latest?.version??0)+1;run('INSERT INTO character_reference_crops VALUES(?,?,?,?,?,?,?) ON CONFLICT(media_id,character_id,role) DO UPDATE SET crop_json=excluded.crop_json,source_sha256=excluded.source_sha256,version=excluded.version,updated_at=excluded.updated_at',mid,cid,role,JSON.stringify(crop),s.sha256,version,created);
      if(beforeApprovalCommit)beforeApprovalCommit();
      const approved=JSON.parse(saved.references_json).find(r=>r.reference_id===referenceId),payload={reference:approved,draft_before:old??null,draft_version:version,canon_before_id:canon?.id??null,was_assigned:wasAssigned};
      run('INSERT INTO character_crop_approvals VALUES(?,?,?,?,?,?,?,NULL,?,?,?,?)',body.request_id,cid,mid,role,referenceId,saved.id,'approve',requestHash,JSON.stringify(payload),actor,created);
    }});
    return receipt(one('SELECT * FROM character_crop_approvals WHERE id=?',body.request_id));
  }
  async function undo(mid,cid,role,body,actor){
    shape(body,['request_id','approval_id','expected_canon_version']);const requestHash=digest({mid,cid,role,body}),priorReceipt=replay(body.request_id,requestHash,actor);if(priorReceipt)return priorReceipt;
    if(!actor)throw fail('An authenticated administrator is required.',403);if(isBusy())throw fail('A catalogue operation is active. Retry shortly.',409);
    const target=one("SELECT * FROM character_crop_approvals WHERE id=? AND character_id=? AND media_id=? AND role=? AND operation='approve'",body.approval_id,cid,mid,role);if(!target)throw fail('Crop approval not found.',404);if(one('SELECT 1 FROM character_crop_approvals WHERE undo_of=?',target.id))throw fail('This approval has already been undone.',409);
    const canon=currentCanon(cid),before=canon?JSON.parse(canon.references_json):[],payload=JSON.parse(target.payload_json),ref=before.find(r=>r.reference_id===target.reference_id);
    if(body.expected_canon_version!==canonVersion(canon)||!ref||digest(ref)!==digest(payload.reference))throw fail('The reference state changed. Reload its history before undoing.',409);
    const created=new Date().toISOString();await saveCanon({characterId:cid,appearance:canon.appearance,references:before.filter(r=>r.reference_id!==target.reference_id),expectedRevisionId:canon.id,expectedReferences:before,forceRevision:true,preserveReferenceHistory:true,reason:'Karakterkivágás jóváhagyásának visszavonása · '+role,afterSave:saved=>{
      if(one('SELECT 1 FROM character_crop_approvals WHERE undo_of=?',target.id))throw fail('This approval has already been undone.',409);
      const draft=one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role);let version=draft?.version??0;
      if(draft&&draft.version===payload.draft_version){version++;run('UPDATE character_reference_crops SET crop_json=?,source_sha256=?,version=?,updated_at=? WHERE media_id=? AND character_id=? AND role=?',payload.draft_before?.crop_json??'null',payload.draft_before?.source_sha256??ref.sha256,version,created,mid,cid,role);}
      if(beforeApprovalCommit)beforeApprovalCommit();
      run('INSERT INTO character_crop_approvals VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',body.request_id,cid,mid,role,target.reference_id,saved.id,'undo',target.id,requestHash,JSON.stringify({reference:ref,draft_version:version}),actor,created);
    }});return receipt(one('SELECT * FROM character_crop_approvals WHERE id=?',body.request_id));
  }
  async function handle({p,url,body,req,json,res}){
    if(p==='/api/character-crop-admin'&&req.method==='GET'){json({enabled:!!adminOrigin,origin:adminOrigin});return true;}
    const approved=p.match(/^\/api\/characters\/([^/]+)\/references\/([^/]+)\/image$/);
    if(approved&&req.method==='GET'){
      const [,cid,mid]=approved;assigned(mid,cid);const rid=url.searchParams.get('revision_id'),row=rid?one('SELECT * FROM canon WHERE character_id=? AND id=?',cid,rid):one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid),ref=row&&JSON.parse(row.references_json).filter(r=>r.media_id===mid).find(r=>!url.searchParams.has('reference_id')||referenceKey(r)===url.searchParams.get('reference_id'));
      if(!ref)throw fail('Approved reference not found.',404);const output=await preview(mid,ref);res.writeHead(200,{'Content-Type':output.mimeType,'Cache-Control':'no-store'});res.end(output.bytes);return true;
    }
    const route=p.match(/^\/api\/media\/([^/]+)\/character-crops\/([^/]+)\/([^/]+)$/);if(!route)return false;
    const [,mid,cid,role]=route,m=assigned(mid,cid);if(!roles.includes(role))throw fail('Choose face, body, detail or general.');
    const row=()=>one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role);
    const s=await source(m,req.method!=='GET'),old=row();
    if(req.method==='GET'){let info;try{info=imageInfo(s.bytes);}catch{}json({media_id:mid,character_id:cid,role,crop:old?referenceCrop(JSON.parse(old.crop_json)):null,version:old?.version??0,source_sha256:s.sha256,stale:!!old&&old.source_sha256!==s.sha256,crop_supported:!!info&&['jpeg','png'].includes(info.format)&&!info.animated,width:info?.width??null,height:info?.height??null});return true;}
    if(req.method!=='POST')throw fail('Use GET or POST for reference crop drafts.',405);
    if(isBusy())throw fail('Wait until the current file or generation operation finishes.',409);
    if(!body||Object.keys(body).some(k=>!['crop','source_sha256','expected_version'].includes(k))||!Object.hasOwn(body,'crop')||!Number.isInteger(body.expected_version)||body.expected_version<0)throw fail('Reload this crop before saving.');
    const crop=referenceCrop(body.crop);if(body.source_sha256!==s.sha256)throw fail('The source image changed. Reopen the crop editor.',409);
    transaction(()=>{assigned(mid,cid);const latest=row();if((latest?.version??0)!==body.expected_version)throw fail('This character crop changed elsewhere. Reopen it before saving.',409);run('INSERT INTO character_reference_crops VALUES(?,?,?,?,?,?,?) ON CONFLICT(media_id,character_id,role) DO UPDATE SET crop_json=excluded.crop_json,source_sha256=excluded.source_sha256,version=excluded.version,updated_at=excluded.updated_at',mid,cid,role,JSON.stringify(crop),s.sha256,(latest?.version??0)+1,new Date().toISOString());});
    json({ok:true,version:row().version,crop,canon_changed:false});return true;
  }
  function validateRestore(){
    for(const row of all('SELECT * FROM character_reference_crops')){
      referenceCrop(JSON.parse(row.crop_json));if(!/^[a-f0-9]{64}$/.test(row.source_sha256)||!Number.isInteger(row.version)||row.version<1)throw fail('Invalid reference crop in backup.');
    }
    for(const row of all('SELECT references_json FROM canon')){
      const keys=new Set();for(const ref of JSON.parse(row.references_json)){if(Object.hasOwn(ref,'crop'))referenceCrop(ref.crop);const key=referenceKey(ref);if(keys.has(key)||ref.reference_id&&!uuid.test(ref.reference_id))throw fail('Invalid reference identifiers in backup.');keys.add(key);}
    }
    for(const row of all('SELECT * FROM character_crop_approvals')){
      if(!uuid.test(row.id)||!uuid.test(row.reference_id)||!/^[a-f0-9]{64}$/.test(row.request_hash)||!row.actor||!Number.isFinite(Date.parse(row.created_at)))throw fail('Invalid crop approval history in backup.');
      const payload=JSON.parse(row.payload_json);referenceCrop(payload.reference?.crop);if(payload.reference?.reference_id!==row.reference_id||payload.reference?.media_id!==row.media_id||payload.reference?.role!==row.role)throw fail('Crop approval history does not match its reference.');
      if(row.operation==='undo'){const target=one("SELECT * FROM character_crop_approvals WHERE id=? AND operation='approve'",row.undo_of);if(!target||target.character_id!==row.character_id||target.media_id!==row.media_id||target.reference_id!==row.reference_id)throw fail('Invalid crop undo history in backup.');}
    }
  }
  return {handle,drafts,preview,validateRestore,validateSelection,context,approve,undo,adminOrigin:()=>adminOrigin,setAdminOrigin:value=>{adminOrigin=value;}};
}
