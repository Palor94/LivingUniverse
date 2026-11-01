import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {cloudAvailability} from './duplicates.mjs';
import {describeMediaPurpose} from './media-purpose.mjs';
import {reviewDigest as digest,reviewError as error,reviewRaw,reviewFields,defaultReview,validateReviewDocument,effectiveReviewFields,factText,cameraOptions} from './world-review-fields.mjs';
import {sceneRoles} from './analysis-scene.mjs';
import {retrieveReviewedWorldMedia} from './world-review-retrieval.mjs';

export const worldReviewTables={
 world_review_manifests:['id','manifest_json','created_at'],
 world_review_sources:['id','media_id','source_sha256','source_path','source_json','provenance_json','raw_json','result_hash','created_at'],
 world_review_documents:['source_id','version','document_json','updated_at'],
 world_review_changes:['id','source_id','version','request_key','request_hash','operation','before_json','after_json','created_at'],
 world_review_tombstones:['media_id','reason','created_at'],
 world_review_trial:['media_id','ordinal']
};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const key=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{8,100}$/u.test(v))throw error('INVALID_REVIEW','Hiányzó vagy érvénytelen mentési azonosító.');return v;};
const parse=v=>JSON.parse(v);
const now=()=>new Date().toISOString();
export async function backupBeforeWorldReview(db,dataDir){
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='world_review_schema'").get()||!db.prepare('SELECT 1 FROM media LIMIT 1').get())return null;
 const directory=path.join(dataDir,'backups');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'before-world-review-'+randomUUID()+'.sqlite');await backup(db,file);
 const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw error('BACKUP_FAILED','Az ellenőrzőfelület előtti mentés nem ellenőrizhető.',500);}finally{copy.close();}return file;
}
export function installWorldReview({db,root,isBusy=()=>false,availability=cloudAvailability}){
 const one=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}
 transaction(()=>{db.exec(readFileSync(new URL('./migrations/024-world-review.up.sql',import.meta.url),'utf8'));if(one('SELECT version FROM world_review_schema WHERE id=1')?.version!==1)throw error('SCHEMA_UNSUPPORTED','Ismeretlen ellenőrzési adatséma.',409);});
 const csrf=randomBytes(32).toString('hex');
 const characterExists=id=>!!one('SELECT 1 FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',id);
 const active=id=>one("SELECT * FROM active_media WHERE id=? AND kind='image'",id);
 const tombstoned=id=>!!one('SELECT 1 FROM world_review_tombstones WHERE media_id=?',id);
 function source(id){const row=one('SELECT * FROM world_review_sources WHERE id=?',id);if(!row||!active(row.media_id)||tombstoned(row.media_id))throw error('NOT_FOUND','Az aktív kép elemzése nem található.',404);return row;}
 function document(row){return parse(one('SELECT document_json FROM world_review_documents WHERE source_id=?',row.id).document_json);}
 function checkedDocument(row,value){return validateReviewDocument(parse(row.raw_json),value,{characterExists,planning:describeMediaPurpose(row.source_path,parse(row.raw_json)).kind==='generation_plan'});}
 async function proof(mediaId,expected,attempt=0){
  const m=active(mediaId);if(!m||tombstoned(mediaId))throw error('NOT_FOUND','A kép már nem aktív.',404);
  if(path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||m.relative_path.split(/[\\/]/u).some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||/[\x00:]/u.test(m.relative_path))throw error('UNSAFE_IMAGE','Nem biztonságos képútvonal.',403);
  const realRoot=await fs.realpath(root);let file=realRoot;
  for(const part of m.relative_path.split(/[\\/]/u)){file=path.join(file,part);const stat=await fs.lstat(file).catch(()=>null);if(!stat||stat.isSymbolicLink())throw error('IMAGE_UNAVAILABLE','A kép helyben nem érhető el.',409);}
  const real=await fs.realpath(file),relative=path.relative(realRoot,real);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw error('UNSAFE_IMAGE','A kép a médiatár gyökerén kívül van.',403);
  if(await availability(real)!=='local')throw error('IMAGE_OFFLINE','A képet előbb tedd helyben elérhetővé.',409);
  const handle=await fs.open(real,'r');let before,after,hash;
  try{before=await handle.stat();if(!before.isFile()||before.size<1||before.size>20*1024*1024)throw error('IMAGE_LIMIT','A kép nem ellenőrizhető ebben a mérettartományban.',409);const h=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))h.update(chunk);after=await handle.stat();hash=h.digest('hex');}finally{await handle.close();}
  const unstable=before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs;
  if(unstable&&attempt<1)return proof(mediaId,expected,attempt+1);
  if(unstable||expected&&hash!==expected)throw error('SOURCE_CHANGED','A kép tartalma megváltozott vagy olvasás közben nem stabil. A régi döntést nem alkalmazzuk.',409);
  return {media_id:mediaId,relative_path:m.relative_path,sha256:hash,size:after.size,mtime_ms:after.mtimeMs,ctime_ms:after.ctimeMs};
 }
 function project(row,doc){
  run('DELETE FROM world_review_facts WHERE source_id=?',row.id);
  for(const field of effectiveReviewFields(parse(row.raw_json),doc)){const t=factText(field);run('INSERT INTO world_review_facts VALUES(?,?,?,?,?,?,?,?,?)',row.id,field.id,field.group,t.hu,t.en,field.state,field.uncertain?1:0,field.kind==='role'?field.value.participant_id:field.participant_id||'',field.kind==='role'?field.value.activity_id:field.activity_id||'');}
 }
 function rebuild(){transaction(()=>{run('DELETE FROM world_review_facts');for(const row of all('SELECT * FROM world_review_sources'))project(row,document(row));});}
 function validateRestored(){
  for(const manifest of all('SELECT * FROM world_review_manifests'))if(!sha(manifest.id)||digest(parse(manifest.manifest_json))!==manifest.id)throw error('INVALID_BACKUP','Érvénytelen elemzési futásleírás.');
  for(const row of all('SELECT * FROM world_review_sources')){
   if(!sha(row.id)||!sha(row.source_sha256)||!sha(row.result_hash)||digest(parse(row.raw_json))!==row.result_hash||path.isAbsolute(row.source_path)||path.win32.isAbsolute(row.source_path)||row.source_path.split(/[\\/]/u).some(p=>!p||p==='.'||p==='..')||!parse(row.provenance_json)||!parse(row.source_json))throw error('INVALID_BACKUP','Érvénytelen elemzési eredet a mentésben.');
   reviewRaw(parse(row.raw_json));if(!active(row.media_id)||tombstoned(row.media_id))throw error('INVALID_BACKUP','Törölt kép elemzése nem állítható vissza aktívként.');
   const d=one('SELECT * FROM world_review_documents WHERE source_id=?',row.id);if(!d||!Number.isInteger(d.version)||d.version<0)throw error('INVALID_BACKUP','Hiányzó ellenőrzési dokumentum.');checkedDocument(row,parse(d.document_json));
   for(const c of all('SELECT * FROM world_review_changes WHERE source_id=? ORDER BY version',row.id)){if(!sha(c.request_hash)||!Number.isInteger(c.version)||c.version<1||c.version>d.version)throw error('INVALID_BACKUP','Érvénytelen döntési változat.');key(c.request_key);checkedDocument(row,parse(c.before_json));checkedDocument(row,parse(c.after_json));}
  }
 }
 function exportData(){return Object.fromEntries(Object.keys(worldReviewTables).map(t=>[t,all('SELECT * FROM '+t)]));}
 function restore(body){
  const tables=Object.keys(worldReviewTables),present=tables.some(t=>body[t]!==undefined);if(!present)return;
  if(body.world_review_schema_version!==1||tables.some(t=>!Array.isArray(body[t])))throw error('INVALID_BACKUP','Hiányos ellenőrzési mentés.');
  // Called inside the owning catalogue restore transaction.
  for(const t of [...tables].reverse())run('DELETE FROM '+t);run('DELETE FROM world_review_facts');
  for(const [table,columns]of Object.entries(worldReviewTables))for(const row of body[table])run(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...columns.map(c=>row[c]??null));
  validateRestored();for(const row of all('SELECT * FROM world_review_sources'))project(row,document(row));
 }
 async function view(id){
  const row=source(id),raw=parse(row.raw_json),d=one('SELECT * FROM world_review_documents WHERE source_id=?',id);let stale=null;
  try{await proof(row.media_id,row.source_sha256);}catch(e){stale=e.code||'IMAGE_UNAVAILABLE';}
  const doc=document(row),characters=all('SELECT c.id,c.name,CASE WHEN d.media_id IS NOT NULL THEN 1 ELSE 0 END assigned FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id LEFT JOIN depictions d ON d.character_id=c.id AND d.media_id=? WHERE u.merged_into IS NULL ORDER BY c.name',row.media_id);
  return {source_id:id,media_id:row.media_id,filename:path.win32.basename(active(row.media_id).relative_path),source_sha256:row.source_sha256,version:d.version,document:doc,fields:reviewFields(raw,doc),description:raw.description,background:raw.background,purpose:describeMediaPurpose(row.source_path,raw),provenance:parse(row.provenance_json),characters,stale,csrf,camera_options:cameraOptions,role_options:sceneRoles,changes:all('SELECT id,version,operation,created_at FROM world_review_changes WHERE source_id=? ORDER BY version DESC LIMIT 10',id)};
 }
 function list({character_id='',multiple=false,uncertain=false,state='',purpose='',trial=false,query='',offset=0,limit=24}={}){
  if(!['','pending','accepted','rejected','partial'].includes(state)||!['','catalogue_media','generation_plan','character_introduction','scene_illustration','review_required'].includes(purpose)||typeof query!=='string'||query.length>200||!Number.isInteger(offset)||offset<0||offset>20000)throw error('INVALID_ARGUMENT','Érvénytelen szűrő.');
  const rows=all("SELECT s.*,d.version,d.document_json,m.relative_path FROM world_review_sources s JOIN active_media m ON m.id=s.media_id JOIN world_review_documents d ON d.source_id=s.id WHERE s.rowid=(SELECT max(s2.rowid) FROM world_review_sources s2 WHERE s2.media_id=s.media_id) AND NOT EXISTS(SELECT 1 FROM world_review_tombstones t WHERE t.media_id=s.media_id) ORDER BY s.media_id");
  const found=[];
  for(const row of rows){
   if(trial&&!one('SELECT 1 FROM world_review_trial WHERE media_id=?',row.media_id))continue;
   const raw=parse(row.raw_json),doc=parse(row.document_json),fields=effectiveReviewFields(raw,doc),people=doc.participants.filter(p=>!p.ignored),kind=describeMediaPurpose(row.source_path,raw).kind;
   if(character_id&&!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',row.media_id,character_id)&&!people.some(p=>doc.identity_reviewed&&p.identity_state==='reviewed'&&p.character_id===character_id)||multiple&&people.length<2||uncertain&&!fields.some(f=>f.uncertain))continue;
   const counts={pending:0,accepted:0,rejected:0};fields.forEach(f=>counts[f.state]++);const status=counts.pending===fields.length?'pending':counts.accepted===fields.length?'accepted':counts.rejected===fields.length?'rejected':'partial';
   const usage=fields.find(f=>f.id==='simulation'),effectiveScope=usage.value.scope;if(state&&state!==status||purpose&&purpose!==(kind==='generation_plan'?kind:purpose==='catalogue_media'?kind:effectiveScope))continue;
   const haystack=[row.relative_path,raw.description.hu,raw.description.en,...fields.filter(f=>f.state!=='rejected').flatMap(f=>Object.values(factText(f)))].join(' ').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
   if(query.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase().split(/\s+/u).filter(Boolean).some(q=>!haystack.includes(q)))continue;
   found.push({source_id:row.id,media_id:row.media_id,filename:path.win32.basename(row.relative_path),description:raw.description.hu,participants:people.length,identity_reviewed:doc.identity_reviewed,state:status,counts,purpose:kind,scope:effectiveScope,version:row.version,characters:all('SELECT c.id,c.name FROM characters c JOIN depictions d ON d.character_id=c.id WHERE d.media_id=?',row.media_id)});
  }
  const n=Math.max(1,Math.min(50,limit));return {total:found.length,items:found.slice(offset,offset+n),next_offset:offset+n<found.length?offset+n:null,csrf};
 }
 async function save(body,{undo=false}={}){
  if(isBusy())throw error('BUSY','Más katalógusművelet fut. Próbáld újra később.',409);
  if(!body||Object.keys(body).some(k=>!['source_id','source_sha256','expected_version','document','request_key','change_id'].includes(k))||!sha(body.source_id)||!sha(body.source_sha256)||!Number.isInteger(body.expected_version)||body.expected_version<0)throw error('INVALID_REVIEW','Érvénytelen mentési kérés.');
  key(body.request_key);const requestHash=digest({undo,...body}),prior=one('SELECT * FROM world_review_changes WHERE request_key=?',body.request_key);
  if(prior){if(prior.request_hash!==requestHash)throw error('CONFLICT','Ez a mentési azonosító más változtatáshoz tartozik.',409);source(prior.source_id);return {source_id:prior.source_id,version:prior.version,replayed:true};}
  const row=source(body.source_id);if(row.source_sha256!==body.source_sha256)throw error('SOURCE_CHANGED','Az elemzett kép megváltozott.',409);await proof(row.media_id,row.source_sha256);
  let target=body.document;
  if(undo){const change=one('SELECT * FROM world_review_changes WHERE id=? AND source_id=?',body.change_id,row.id);if(!change||change.version!==body.expected_version||change.operation==='undo')throw error('CONFLICT','Csak a legutóbbi mentés vonható vissza.',409);target=parse(change.before_json);}
  const checked=checkedDocument(row,target);
  return transaction(()=>{
   if(isBusy()||!active(row.media_id)||tombstoned(row.media_id))throw error('CONFLICT','A kép már nem szerkeszthető.',409);
   const current=one('SELECT * FROM world_review_documents WHERE source_id=?',row.id);if(current.version!==body.expected_version)throw error('CONFLICT','Másik ablakban már módosult. Töltsd újra; a saját változtatásodat őrizd meg.',409);
   if(current.document_json===JSON.stringify(checked))return {source_id:row.id,version:current.version,unchanged:true,replayed:false};
   const version=current.version+1,at=now();run('INSERT INTO world_review_changes VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),row.id,version,body.request_key,requestHash,undo?'undo':'save',current.document_json,JSON.stringify(checked),at);
   run('UPDATE world_review_documents SET version=?,document_json=?,updated_at=? WHERE source_id=?',version,JSON.stringify(checked),at,row.id);project(row,checked);return {source_id:row.id,version,replayed:false};
  });
 }
 async function previewImport(records){
  if(!Array.isArray(records)||records.length>20000)throw error('INVALID_IMPORT','Érvénytelen importállomány.');const entries=[],seen=new Set();
  for(const record of records){
   if(!record||typeof record.media_id!=='string'||seen.has(record.media_id)||!sha(record.source_sha256))throw error('INVALID_IMPORT','Ismétlődő vagy érvénytelen képazonosító.');seen.add(record.media_id);
   const row={media_id:record.media_id,code:'eligible'};
   if(tombstoned(record.media_id))row.code='retired';else if(!active(record.media_id))row.code='not_active';else try{
    const raw=reviewRaw(record.raw),result_hash=digest(raw),id=digest([record.media_id,record.source_sha256,result_hash]);row.id=id;row.result_hash=result_hash;
    if(one('SELECT 1 FROM world_review_sources WHERE id=?',id))row.code='already_imported';else{row.proof=await proof(record.media_id,record.source_sha256);}
   }catch(e){row.code=e.code||'IMAGE_UNAVAILABLE';if(e.code==='SOURCE_CHANGED'){row.code='stale_source';row.proof={...(record.source_metadata||{}),media_id:record.media_id,sha256:record.source_sha256,stale_at_import:true};}}
   entries.push(row);
  }
  const summary=Object.fromEntries([...new Set(entries.map(r=>r.code))].map(code=>[code,entries.filter(r=>r.code===code).length]));return {entries,summary,preview_hash:digest(entries.map(({proof,...entry})=>({...entry,proof:proof?{media_id:proof.media_id,sha256:proof.sha256,size:proof.size||null,stale_at_import:proof.stale_at_import||false}:null})))};
 }
 async function importRecords(records,previewHash){
  if(isBusy())throw error('BUSY','Más katalógusművelet fut.',409);const preview=await previewImport(records);if(preview.preview_hash!==previewHash)throw error('STALE_PREVIEW','Az import előnézete megváltozott.',409);
  transaction(()=>{for(const entry of preview.entries){if(!['eligible','stale_source'].includes(entry.code))continue;const record=records.find(r=>r.media_id===entry.media_id);if(!active(record.media_id)||tombstoned(record.media_id))throw error('STALE_PREVIEW','Az import közben törölték a képet.',409);const raw=reviewRaw(record.raw),at=now(),sourcePath=record.source_path||entry.proof.relative_path,provenance=record.provenance||{};
   if(path.isAbsolute(sourcePath)||path.win32.isAbsolute(sourcePath)||sourcePath.split(/[\\/]/u).some(p=>!p||p==='.'||p==='..')||Buffer.byteLength(JSON.stringify(provenance))>32768)throw error('INVALID_IMPORT','Érvénytelen eredetleírás.');
   run('INSERT INTO world_review_sources VALUES(?,?,?,?,?,?,?,?,?)',entry.id,record.media_id,record.source_sha256,sourcePath,JSON.stringify(entry.proof),JSON.stringify(provenance),JSON.stringify(raw),entry.result_hash,at);
   const row=source(entry.id),doc=defaultReview(raw);run('INSERT INTO world_review_documents VALUES(?,0,?,?)',entry.id,JSON.stringify(doc),at);project(row,doc);
  }});return preview;
 }
 function prepareTrial(ids){if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!active(id)||tombstoned(id)||!one('SELECT 1 FROM world_review_sources WHERE media_id=?',id)))throw error('INVALID_TRIAL','Válassz 1–20 aktív, elemzett képet.');transaction(()=>{run('DELETE FROM world_review_trial');ids.forEach((id,i)=>run('INSERT INTO world_review_trial VALUES(?,?)',id,i));});return {count:ids.length};}
 function guard(req){const candidate=req.headers['x-world-review-csrf'];if(req.headers['content-type']?.split(';')[0]!=='application/json'||typeof candidate!=='string'||candidate.length!==csrf.length||!timingSafeEqual(Buffer.from(candidate),Buffer.from(csrf)))throw error('FORBIDDEN','A mentés csak a helyi ellenőrzőfelületről engedélyezett.',403);}
 async function search(criteria){const result=retrieveReviewedWorldMedia(db,{...criteria,limit:50}),items=[];for(const item of result.items)try{await proof(item.media_id,item.source_sha256);items.push(item);}catch{}return {...result,total:items.length,items:items.slice(0,Math.min(criteria.limit||5,50)),reason:items.length?'MATCHES':result.items.length?'NO_VERIFIED_MATCH':result.reason};}
 function registerManifest(manifest){if(!manifest||Buffer.byteLength(JSON.stringify(manifest))>262144)throw error('INVALID_IMPORT','Érvénytelen futásleírás.');const id=digest(manifest);run('INSERT OR IGNORE INTO world_review_manifests VALUES(?,?,?)',id,JSON.stringify(manifest),now());return id;}
 async function handle({p,body,req,url,json}){
  if(!p.startsWith('/api/world-review'))return false;
  try{
   if(req.method==='GET'){
    if(p==='/api/world-review'){const q=url.searchParams;json(list({query:q.get('q')||'',character_id:q.get('character_id')||'',state:q.get('state')||'',purpose:q.get('purpose')||'',multiple:q.get('multiple')==='1',uncertain:q.get('uncertain')==='1',trial:q.get('trial')==='1',offset:Number(q.get('offset')||0)}));return true;}
    const summary=p.match(/^\/api\/world-review\/media\/([^/]+)\/summary$/u);if(summary){const mid=decodeURIComponent(summary[1]);json({available:!!active(mid)&&!tombstoned(mid)&&!!one('SELECT 1 FROM world_review_sources WHERE media_id=?',mid)});return true;}
    const media=p.match(/^\/api\/world-review\/media\/([^/]+)$/u);if(media){const row=one('SELECT id FROM world_review_sources WHERE media_id=? ORDER BY rowid DESC LIMIT 1',decodeURIComponent(media[1]));if(!row)throw error('NOT_FOUND','Ehhez a képhez nincs mentett world-v1 elemzés.',404);json(await view(row.id));return true;}
    const item=p.match(/^\/api\/world-review\/sources\/([a-f0-9]{64})$/u);if(item){json(await view(item[1]));return true;}
   }
   if(req.method!=='POST')throw error('METHOD_NOT_ALLOWED','Nem támogatott művelet.',405);guard(req);
   if(p==='/api/world-review/save'){json(await save(body));return true;}
   if(p==='/api/world-review/undo'){json(await save(body,{undo:true}));return true;}
   if(p==='/api/world-review/search'){json(await search(body));return true;}
   throw error('NOT_FOUND','Az ellenőrzési művelet nem található.',404);
  }catch(e){json({code:e.code||'WORLD_REVIEW_FAILED',error:e.status?e.message:'Az ellenőrzési művelet sikertelen. Az eredeti képet nem módosítottuk.'},e.status||500);return true;}
 }
 return {handle,list,view,save,proof,search,previewImport,importRecords,registerManifest,prepareTrial,exportData,restore,validateRestored,rebuild,csrf};
}
