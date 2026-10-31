import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const sha=/^[a-f0-9]{64}$/u;
const error=(code,message,status=409)=>Object.assign(Error(message),{code,status});
const stamp=s=>({dev:s.dev,ino:s.ino,size:s.size,mtime:s.mtimeMs,birth:s.birthtimeMs});
const key=id=>'permanent-delete:'+id;
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;

// No startup erasure. A durable journal permits only an explicit retry of the
// same media/version after a filesystem or database failure.
export function installPermanentMediaDelete({db,root,dataDir,one,all,run,transaction,moving,isBusy,unlink=file=>fs.unlink(file),beforeFinalize=()=>{}}){
  const csrf=randomBytes(32).toString('hex');let active=false;
  const receipt=id=>{const r=one('SELECT value FROM application_settings WHERE key=?',key(id));return r?JSON.parse(r.value):null;};
  const store=(id,value)=>run('INSERT INTO application_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key(id),JSON.stringify(value));
  function checked(id){
    if(typeof id!=='string'||!uuid.test(id))throw error('INVALID_ID','Érvénytelen médiaazonosító.',400);
    const m=one('SELECT * FROM media WHERE id=?',id);if(!m)throw error('NOT_FOUND','A kép nem található.',404);
    if(m.kind!=='image')throw error('IMAGE_REQUIRED','Ezzel a gombbal csak kép törölhető.',400);
    return m;
  }
  const version=m=>digest(m);
  const protectedBy=id=>all("SELECT DISTINCT c.character_id FROM canon c,json_each(c.references_json) r WHERE json_extract(r.value,'$.media_id')=?",id).map(r=>r.character_id);
  function details(id){const m=checked(id),protected_for=protectedBy(id),journal=receipt(id);return {media_id:id,version:version(m),csrf,protected:!!protected_for.length,protected_for,incomplete:!!journal&&journal.status!=='complete',permanent:true};}
  function protect(id){if(protectedBy(id).length)throw error('CANON_REFERENCE_PROTECTED','A kép jóváhagyott kanonikus referencia. Előbb külön távolítsd el a karakter jóváhagyott referenciái közül.');}
  async function inspect(base,relative){
    if(typeof relative!=='string'||path.isAbsolute(relative)||path.win32.isAbsolute(relative)||/[\x00-\x1f:]/u.test(relative))throw error('UNSAFE_PATH','Nem biztonságos fájlútvonal.');
    const parts=relative.split(/[\\/]/u);
    if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/u.test(p)||/[<>"|?*]/u.test(p)))throw error('UNSAFE_PATH','Nem biztonságos fájlútvonal.');
    const realBase=await fs.realpath(base);let file=realBase,missing=false,last;
    for(let i=0;i<parts.length;i++){
      file=path.join(file,parts[i]);if(missing)continue;
      try{last=await fs.lstat(file);}catch(e){if(e.code!=='ENOENT')throw e;missing=true;continue;}
      if(last.isSymbolicLink()||(i<parts.length-1?!last.isDirectory():!last.isFile()))throw error('UNSAFE_PATH','Szimbolikus hivatkozás, junction vagy nem szabályos fájl nem törölhető.');
    }
    const rel=path.relative(realBase,file);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw error('UNSAFE_PATH','A fájl a megengedett könyvtáron kívül van.');
    if(!missing&&!samePath(await fs.realpath(file),file))throw error('UNSAFE_PATH','A feloldott fájlútvonal megváltozott.');
    return {file,identity:missing?null:stamp(last)};
  }
  function plan(m){
    const parts=m.relative_path.split(/[\\/]/u);
    if(parts.some(p=>p.startsWith('.'))&&!(parts[0]==='.living-universe-trash'&&parts[1]===m.id)||['app','mcp','tests','docs','backups','node_modules'].includes(parts[0].toLowerCase()))throw error('UNSAFE_PATH','Alkalmazásfájl nem törölhető médiaként.');
    if(one("SELECT 1 FROM file_moves WHERE media_id=? AND status<>'complete' LIMIT 1",m.id))throw error('MOVE_REVIEW_REQUIRED','A képhez befejezetlen fájlművelet tartozik. Előbb rendezd a fájlmozgatási előzményt.');
    const normalized=p=>p.replaceAll('\\','/').toLocaleLowerCase('en');
    if(all('SELECT id,relative_path FROM media WHERE id<>?',m.id).some(o=>normalized(o.relative_path)===normalized(m.relative_path)))throw error('SHARED_PATH','Másik médiarekord is ugyanerre a fájlútvonalra mutat.');
    const artifacts=[];
    const add=(area,relative)=>{if(!artifacts.some(a=>a.area===area&&a.relative===relative))artifacts.push({area,relative});};
    const hashes=new Set(all('SELECT sha256 FROM imported_media_blobs WHERE media_id=? UNION SELECT sha256 FROM media_import_items WHERE media_id=?',m.id,m.id).map(r=>r.sha256));
    for(const hash of hashes){if(!sha.test(hash))throw error('INVALID_STORAGE','Érvénytelen előnézeti azonosító.');if(!one('SELECT 1 FROM media_import_items WHERE sha256=? AND media_id IS NOT NULL AND media_id<>? LIMIT 1',hash,m.id))add('data','import-thumbnails/'+hash+'.jpg');}
    for(const edit of all('SELECT id FROM media_image_edits WHERE media_id=?',m.id)){
      if(!uuid.test(edit.id))throw error('INVALID_STORAGE','Érvénytelen képszerkesztési azonosító.');
      add('data','image-originals/'+edit.id+'.original');add('data','image-edit-staging/'+edit.id+'.image');add('data','image-edit-staging/'+edit.id+'-restore.image');
    }
    for(const output of all('SELECT run_id FROM image_generation_outputs WHERE media_id=?',m.id)){if(!uuid.test(output.run_id))throw error('INVALID_STORAGE','Érvénytelen generálási azonosító.');add('data','generation-results/'+output.run_id+'.json');}
    for(const upload of all('SELECT u.id FROM media_uploads u JOIN media_import_items i ON i.import_id=u.import_id AND i.slot_key=u.slot_key WHERE i.media_id=?',m.id)){
      if(!uuid.test(upload.id))throw error('INVALID_STORAGE','Érvénytelen feltöltési azonosító.');
      for(const chunk of all('SELECT offset FROM media_upload_chunks WHERE upload_id=?',upload.id)){if(!Number.isSafeInteger(chunk.offset)||chunk.offset<0)throw error('INVALID_STORAGE','Érvénytelen feltöltési részlet.');add('data','upload-staging/'+upload.id+'/'+chunk.offset+'.part');}
    }
    // Remove private derived copies first; the selected original is last.
    add('media',m.relative_path);return artifacts.sort((a,b)=>Number(a.area==='media')-Number(b.area==='media')||(a.relative<b.relative?-1:a.relative>b.relative?1:0));
  }
  function cleanDatabase(id){
    const cacheKeys=all('SELECT cache_key FROM media_analysis_items WHERE media_id=? AND cache_key IS NOT NULL',id).map(r=>r.cache_key);
    run('DELETE FROM media_analysis_tag_links WHERE media_id=?',id);run('DELETE FROM media_analysis_place_links WHERE media_id=?',id);
    // Preserve unrelated actions in decisions that reviewed several images.
    for(const decision of all('SELECT id,selection_json,result_json FROM media_analysis_decisions')){
      const selection=JSON.parse(decision.selection_json),kept=selection.actions.filter(a=>a.media_id!==id);if(kept.length===selection.actions.length)continue;
      if(!kept.length){run('DELETE FROM media_analysis_decisions WHERE id=?',decision.id);continue;}
      selection.actions=kept;selection.items=selection.items.filter(i=>i.media_id!==id);const result=JSON.parse(decision.result_json);result.reviewed=kept.length;
      run('UPDATE media_analysis_decisions SET selection_json=?,result_json=? WHERE id=?',JSON.stringify(selection),JSON.stringify(result),decision.id);
    }
    run('DELETE FROM media_analysis_proposals WHERE item_id IN (SELECT id FROM media_analysis_items WHERE media_id=?)',id);
    run('DELETE FROM media_analysis_items WHERE media_id=?',id);
    for(const cacheKey of cacheKeys)if(!one('SELECT 1 FROM media_analysis_items WHERE cache_key=? LIMIT 1',cacheKey))run('DELETE FROM media_analysis_cache WHERE cache_key=?',cacheKey);
    for(const row of all('SELECT id,evidence_json FROM sorting_suggestions WHERE media_id<>?',id))if((JSON.parse(row.evidence_json).references||[]).some(r=>r.media_id===id)){run('DELETE FROM suggestion_feedback WHERE suggestion_id=?',row.id);run('DELETE FROM sorting_suggestions WHERE id=?',row.id);}
    run('DELETE FROM suggestion_feedback WHERE suggestion_id IN (SELECT id FROM sorting_suggestions WHERE media_id=?)',id);
    for(const table of ['sorting_suggestions','note_tag_proposal_changes','note_tag_proposals','note_tag_links','media_analysis_place_links','media_tags','media_locations','media_location_links','depictions','media_notes','reviews','media_hidden','media_scan_state','media_fingerprints','media_categorization','media_roles','character_cover_frames','media_image_edits','file_moves','imported_media_blobs'])run('DELETE FROM '+table+' WHERE media_id=?',id);
    run('UPDATE characters SET cover_id=NULL WHERE cover_id=?',id);
    run("UPDATE character_ui SET cover_crop=NULL WHERE json_valid(cover_crop) AND json_extract(cover_crop,'$.media_id')=?",id);
    for(const row of all('SELECT relative_path,candidate_ids FROM scan_candidates')){const ids=JSON.parse(row.candidate_ids).filter(v=>v!==id);if(ids.length)run('UPDATE scan_candidates SET candidate_ids=? WHERE relative_path=?',JSON.stringify(ids),row.relative_path);else run('DELETE FROM scan_candidates WHERE relative_path=?',row.relative_path);}
    for(const row of all('SELECT id FROM media_uploads WHERE EXISTS(SELECT 1 FROM media_import_items i WHERE i.import_id=media_uploads.import_id AND i.slot_key=media_uploads.slot_key AND i.media_id=?)',id)){run('DELETE FROM media_upload_chunks WHERE upload_id=?',row.id);run("UPDATE media_uploads SET status='erased',error_code='MEDIA_ERASED' WHERE id=?",row.id);}
    run("UPDATE media_import_items SET media_id=NULL,status='erased',error_code='MEDIA_ERASED' WHERE media_id=?",id);
    for(const row of all('SELECT run_id FROM image_generation_outputs WHERE media_id=?',id)){
      run("UPDATE image_generation_runs SET status='withdrawn' WHERE id=?",row.run_id);
      run('INSERT INTO image_generation_events VALUES(?,?,?,?,?,?)',randomUUID(),row.run_id,'output_permanently_deleted','creator',JSON.stringify({media_id:id}),new Date().toISOString());
    }
    run('DELETE FROM image_generation_outputs WHERE media_id=?',id);
    for(const row of all("SELECT id,payload_json FROM mcp_reference_changes WHERE status IN ('pending','approved')")){const p=JSON.parse(row.payload_json);if([...(p.before||[]),...(p.after||[])].some(r=>r.media_id===id))run("UPDATE mcp_reference_changes SET status='conflict' WHERE id=?",row.id);}
    run('DELETE FROM application_settings WHERE key=?','erased_media:'+id);
    run('DELETE FROM media WHERE id=?',id);
    if(all('PRAGMA foreign_key_check').length)throw error('DATABASE_CONFLICT','Az adatbázis kapcsolatainak ellenőrzése sikertelen.');
  }
  function preflightDatabase(id){db.exec('SAVEPOINT permanent_delete_check');try{cleanDatabase(id);}finally{db.exec('ROLLBACK TO permanent_delete_check; RELEASE permanent_delete_check');}}
  async function erase(id,body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='expected_version')||typeof body.expected_version!=='string')throw error('INVALID_ARGUMENT','A kijelölt kép verziója szükséges.',400);
    let journal=receipt(id);if(journal?.status==='complete'&&!one('SELECT 1 FROM media WHERE id=?',id))return {ok:true,complete:true,media_id:id,already_deleted:true,cloud_sync_verified:false};
    const m=checked(id);if(body.expected_version!==version(m))throw error('STALE_MEDIA','A kép adatai megváltoztak. Jelöld ki újra.');protect(id);
    if(active||moving.size||isBusy())throw error('BUSY','Más kép-, importálási vagy elemzési művelet fut. Próbáld újra később.');
    active=true;moving.add(id);
    try{
      const artifacts=plan(m);preflightDatabase(id);
      if(journal){if(journal.schema!==1||journal.version!==version(m)||digest(journal.files?.map(({area,relative})=>({area,relative})))!==digest(artifacts))throw error('DELETE_STATE_CHANGED','A félbemaradt törléshez tartozó fájlállapot megváltozott. Kézi ellenőrzés szükséges.');}
      else{
        const files=[];for(const artifact of artifacts){const {identity}=await inspect(artifact.area==='media'?root:dataDir,artifact.relative);files.push({...artifact,identity,done:false});}
        journal={schema:1,status:'deleting',version:version(m),files,started_at:new Date().toISOString()};store(id,journal);
      }
      // Validate every remaining path before deleting any further file.
      for(const file of journal.files){const current=await inspect(file.area==='media'?root:dataDir,file.relative);if(current.identity&&(file.done||!file.identity||digest(current.identity)!==digest(file.identity)))throw error('FILE_CHANGED','A törlendő fájl megváltozott vagy újra létrejött. Nem töröltük az új fájlt.');}
      for(const file of journal.files){
        if(file.done)continue;
        protect(id);const current=await inspect(file.area==='media'?root:dataDir,file.relative);
        if(current.identity){if(digest(current.identity)!==digest(file.identity))throw error('FILE_CHANGED','A fájl törlés közben megváltozott.');await unlink(current.file);}
        if((await inspect(file.area==='media'?root:dataDir,file.relative)).identity)throw error('FILE_DELETE_FAILED','A fájl a törlési kísérlet után is létezik.');
        file.done=true;store(id,journal);
      }
      journal.status='files_deleted';store(id,journal);await beforeFinalize();
      transaction(()=>{protect(id);if(version(checked(id))!==journal.version)throw error('STALE_MEDIA','A médiarekord törlés közben megváltozott.');cleanDatabase(id);store(id,{schema:1,status:'complete',version:journal.version,completed_at:new Date().toISOString()});});
      return {ok:true,complete:true,media_id:id,original_deleted:true,derived_files_deleted:true,catalogue_deleted:true,cloud_sync_verified:false,onedrive:/[\\/]OneDrive(?:[\\/]| -)/iu.test(root)};
    }catch(e){
      const partial=!!journal?.files?.some(f=>f.done);if(journal&&journal.status!=='complete'){journal.error=e.code||'DELETE_FAILED';store(id,journal);}
      throw Object.assign(error(e.status?e.code:'DELETE_FAILED',e.status?e.message:'A törlés nem fejeződött be. A médiarekord megmaradt; ellenőrizd a fájl elérhetőségét és próbáld újra.',e.status||409),{partial});
    }finally{active=false;moving.delete(id);}
  }
  return {details,erase,isBusy:()=>active,async handle({p,req,body,json}){
    const match=p.match(/^\/api\/media\/([a-f0-9-]{36})\/permanent-delete$/iu);if(!match)return false;
    try{
      if(req.method==='GET'){json(details(match[1]));return true;}
      if(req.method!=='POST')throw error('METHOD_NOT_ALLOWED','Nem támogatott törlési művelet.',405);
      const supplied=req.headers['x-lu-delete-csrf'];if(req.headers.origin!=='http://'+req.headers.host||typeof supplied!=='string'||!/^[a-f0-9]{64}$/u.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(csrf)))throw error('FORBIDDEN','A törlés csak az alkalmazás saját felületéről indítható.',403);
      json(await erase(match[1],body));
    }catch(e){json({ok:false,complete:false,code:e.code||'DELETE_FAILED',partial:e.partial===true,error:e.status?e.message:'A törlés nem fejeződött be.'},e.status||500);}return true;
  }};
}
