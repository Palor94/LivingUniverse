import {readProfileTemplate} from '../app/profile-template.mjs';
import {defaultTemplate} from '../app/ghost-profile.mjs';
import {DatabaseSync} from 'node:sqlite';
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {cloudAvailability} from '../app/duplicates.mjs';
import {thumbnail,referenceImage,MAX_SOURCE_BYTES,dimensions,MAX_IMAGE_BYTES,MAX_REFERENCE_BYTES,MAX_REFERENCE_EDGE} from './images.mjs';
import {originalInfo,verifyOriginal,MAX_INLINE_IMAGE_BYTES,IMAGE_READ_CHUNK_BYTES,digest} from './original-images.mjs';
import {profileVersion} from '../app/character-edit.mjs';
import {createEventReader} from '../app/story-events.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles=['face','body','detail','general'];
const blocked=new Set(['app','tests','docs','backups','node_modules']);
export class CatalogueError extends Error{constructor(code,message,recoverable=false){super(message);this.code=code;this.recoverable=recoverable;}}
const fail=(code,message,recoverable=false)=>{throw new CatalogueError(code,message,recoverable);};
const identifier=value=>{if(typeof value!=='string'||!UUID.test(value))fail('INVALID_ID','Use a stable catalogue UUID, never a filename or path.');return value;};
function integer(value,fallback,max){if(value===undefined)return fallback;if(!Number.isInteger(value)||value<0||value>max)fail('INVALID_ARGUMENT','Pagination is outside the allowed range.');return value;}
function query(value){if(value===undefined)return '';if(typeof value!=='string'||value.length>120)fail('INVALID_ARGUMENT','Search text must be at most 120 characters.');return value;}
function flag(value){if(value!==undefined&&typeof value!=='boolean')fail('INVALID_ARGUMENT','Expected a boolean.');return value===true;}
function shape(args,keys){if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!keys.includes(key)))fail('INVALID_ARGUMENT','Unknown arguments are not permitted.');}
export async function openReadOnlyDatabase(file){
  try{if(!(await fs.stat(file)).isFile())throw Error();}catch{fail('CATALOGUE_UNAVAILABLE','The configured existing catalogue is unavailable. No replacement was created.',true);}
  let db;try{db=new DatabaseSync(file,{readOnly:true,allowExtension:false,timeout:1500});db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');return db;}catch{db?.close();fail('CATALOGUE_UNAVAILABLE','The catalogue could not be opened read-only.',true);}
}
export async function createCatalogue({database,mediaRoot,allowAdminNotes=false,availability=cloudAvailability,makeThumbnail=thumbnail,maxInlineImageBytes=MAX_INLINE_IMAGE_BYTES}){
  if(!Number.isInteger(maxInlineImageBytes)||maxInlineImageBytes<0||maxInlineImageBytes>MAX_SOURCE_BYTES)fail('CONFIG_INVALID','Invalid local image output limit.');
  let root;try{root=await fs.realpath(mediaRoot);if(!(await fs.stat(root)).isDirectory())throw Error();}catch{fail('MEDIA_ROOT_UNAVAILABLE','The configured media root is unavailable. Reconnect OneDrive and retry.',true);}
  const db=await openReadOnlyDatabase(database),tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all().map(t=>t.name));
  for(const table of ['characters','media','depictions','media_notes','relationships','canon'])if(!tables.has(table)){db.close();fail('SCHEMA_UNSUPPORTED','The configured file is not the existing Living Universe catalogue.');}
  const all=(sql,...args)=>db.prepare(sql).all(...args),one=(sql,...args)=>db.prepare(sql).get(...args);
  const events=createEventReader(db,{creator:allowAdminNotes});
  const active=tables.has('media_hidden')?'NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id)':'1';
  const redact=value=>String(value??'').split(root).join('[private location]').split(mediaRoot).join('[private location]').split(database).join('[private location]').replace(/[A-Za-z]:[\\/][^\r\n"<>]*/g,'[private location]').replace(/\\\\[^\r\n"<>]*/g,'[private location]').replace(/(^|[\s("'=])\/[^\s"'<>]+/g,'$1[private location]');
  function character(cid){identifier(cid);const c=one('SELECT id,name,aliases,biography,personality,appearance,notes,created_at FROM characters WHERE id=?',cid);if(c){const columns=new Set(all('PRAGMA table_info(characters)').map(column=>column.name));for(const field of ['sexuality','speech_style'])c[field]=columns.has(field)?one(`SELECT ${field} value FROM characters WHERE id=?`,cid).value:'';}if(!c)fail('NOT_FOUND','No character has that catalogue ID.');return c;}
  function relative(m){const rel=m.relative_path;if(typeof rel!=='string'||path.isAbsolute(rel)||path.win32.isAbsolute(rel)||/[\x00:]/.test(rel))fail('UNSAFE_MEDIA','This catalogue entry has an unsafe location.');const parts=rel.split(/[\\/]/);if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||blocked.has(parts[0].toLowerCase()))fail('UNSAFE_MEDIA','This catalogue entry is outside allowed media storage.');return parts;}
  function media(mid){identifier(mid);const m=one('SELECT m.* FROM media m WHERE m.id=? AND '+active,mid);if(!m)fail('NOT_FOUND','No active media has that catalogue ID.');relative(m);return m;}
  function metadata(m){
    const parts=relative(m),notes=one('SELECT tags,notes FROM media_notes WHERE media_id=?',m.id)||{};
    const people=all('SELECT c.id,c.name FROM characters c JOIN depictions d ON d.character_id=c.id WHERE d.media_id=? ORDER BY c.id LIMIT 51',m.id);
    const tags=tables.has('media_tags')?all('SELECT t.id,t.name,g.id group_id,g.name group_name FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id JOIN tag_groups g ON g.id=t.group_id WHERE mt.media_id=? ORDER BY t.id LIMIT 51',m.id):[];
    const review=tables.has('reviews')?all('SELECT id,character_id,decision,rating,substr(notes,1,2000) notes,length(notes)>2000 notes_truncated,created_at FROM reviews WHERE media_id=? ORDER BY rowid DESC LIMIT 21',m.id):[];
    const imports=tables.has('media_import_items')?all("SELECT import_id,sha256,size,provenance_json FROM media_import_items WHERE media_id=? AND status='committed' ORDER BY rowid LIMIT 4",m.id):[];
    const provenance=imports.slice(0,3).map(({provenance_json,...receipt})=>{const p=JSON.parse(provenance_json);return {...receipt,...Object.fromEntries(Object.entries(p).filter(([k])=>k!=='prompt'&&k!=='source_path')), ...(p.prompt!==undefined?{prompt:redact(p.prompt).slice(0,4096),prompt_truncated:p.prompt.length>4096}:{})};});
    return {id:m.id,display_name:parts.at(-1),kind:m.kind,size_bytes:m.size,modified_at:m.modified_at,characters:people.slice(0,50),tags:notes.tags||'',notes:notes.notes||'',structured_tags:tags.slice(0,50),reviews:review.slice(0,20),sorting_complete:tables.has('media_categorization')?!!one('SELECT 1 FROM media_categorization WHERE media_id=? AND complete=1',m.id):null,more_characters:people.length>50,more_tags:tags.length>50,more_reviews:review.length>20,...(provenance.length?{provenance,more_provenance:imports.length>3}:{})};
  }
  function revision(cid,rid){character(cid);const r=rid===undefined?one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid):one('SELECT * FROM canon WHERE character_id=? AND id=?',cid,identifier(rid));if(!r&&rid!==undefined)fail('NOT_FOUND','That approved revision does not belong to this character.');return r;}
  function canon(r){if(!r)return null;let refs;try{refs=JSON.parse(r.references_json);}catch{fail('CANON_INVALID','The approved reference record needs local review.');}if(!Array.isArray(refs))fail('CANON_INVALID','The approved reference record needs local review.');return {id:r.id,character_id:r.character_id,parent_id:r.parent_id,appearance:r.appearance,reason:r.reason,created_at:r.created_at,references:refs.map(ref=>({media_id:identifier(ref.media_id),role:roles.includes(ref.role)?ref.role:'unknown',sha256:ref.sha256??null}))};}
  async function source(m){
    const parts=relative(m),file=path.join(root,...parts),contained=p=>{const rel=path.relative(root,p);return rel&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
    if(!contained(file))fail('UNSAFE_MEDIA','The media location escapes the resource root.');
    const check=async()=>{let current=root;for(const part of parts){current=path.join(current,part);const stat=await fs.lstat(current);if(stat.isSymbolicLink())fail('UNSAFE_MEDIA','Symbolic links and junctions are not permitted for media access.');}const real=await fs.realpath(file);if(!contained(real)||path.relative(file,real)!=='')fail('UNSAFE_MEDIA','The resolved media location is not safe.');};
    let handle;
    try{
      await check();const available=await availability(file);if(available!=='local')fail('MEDIA_OFFLINE','Make this OneDrive file available on the laptop, then retry. No download was requested.',true);
      handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const before=await handle.stat();if(!before.isFile()||before.size>MAX_SOURCE_BYTES)fail('SOURCE_TOO_LARGE','This media exceeds the bounded image-read limit.',true);
      const bytes=Buffer.alloc(before.size);let pos=0;while(pos<bytes.length){const {bytesRead}=await handle.read(bytes,pos,bytes.length-pos,pos);if(!bytesRead)break;pos+=bytesRead;}
      const after=await handle.stat();await check();const current=await fs.stat(file),fresh=one('SELECT relative_path FROM media WHERE id=?',m.id);
      if(pos!==bytes.length||before.dev!==current.dev||before.ino!==current.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||fresh?.relative_path!==m.relative_path)fail('MEDIA_CHANGED','The media changed while being read. Retry after local organization finishes.',true);
      return bytes;
    }catch(err){if(err instanceof CatalogueError)throw err;fail('MEDIA_UNAVAILABLE','The media is missing or temporarily unavailable. Make it available locally and retry.',true);}finally{await handle?.close();}
  }
  const validatedImages=new Map();
  const referenceImages=new Map();
  async function original(m,expectedHash){
    if(m.kind!=='image')fail('IMAGE_UNAVAILABLE','Request a selected cached still for videos instead.');const bytes=await source(m);
    const hash=digest(bytes);
    if(expectedHash&&hash!==expectedHash.toLowerCase())fail('CANON_MISMATCH','The original no longer matches the approved reference fingerprint. Review it locally; canon was not changed.',true);
    let info=validatedImages.get(hash);
    if(!info)try{info=await verifyOriginal(bytes,makeThumbnail);if(validatedImages.size>=32)validatedImages.delete(validatedImages.keys().next().value);validatedImages.set(hash,info);}catch{fail('IMAGE_UNAVAILABLE','The original image format or decoded pixels could not be verified. No thumbnail was substituted.',true);}
    return {bytes,info:{...info}};
  }
  async function imageResult(m,{bytes,info},quality='reference'){
    if(!['reference','original'].includes(quality))fail('INVALID_ARGUMENT','image_quality must be reference or original.');
    if(quality==='reference'&&(bytes.length>MAX_REFERENCE_BYTES||Math.max(info.width,info.height)>MAX_REFERENCE_EDGE||!['image/jpeg','image/png'].includes(info.mime_type))){
      let image=referenceImages.get(info.sha256);
      if(!image){try{image=await referenceImage(bytes);}catch{fail('IMAGE_UNAVAILABLE','A bounded high-quality reference could not be prepared. Request image_quality:original instead.',true);}if(referenceImages.size>=4)referenceImages.delete(referenceImages.keys().next().value);referenceImages.set(info.sha256,image);}
      const returned=originalInfo(Buffer.from(image.data,'base64'));
      return {image,info:{...returned,representation:'reference',delivery:'inline',source:{...info},transformation:{max_edge:MAX_REFERENCE_EDGE,jpeg_quality_min:85,jpeg_quality_max:90,orientation_normalized:true,alpha_background:'white',...(info.mime_type==='image/gif'?{frame:'first'}:{})},message:'High-quality reference derived from the verified source. The original file is unchanged and can be requested with image_quality:original. Native generator file handoff depends on the client.'}};
    }
    if(bytes.length<=maxInlineImageBytes)return {image:{type:'image',mimeType:info.mime_type,data:bytes.toString('base64')},info:{...info,delivery:'inline'}};
    return {info:{...info,delivery:'chunks_required',transfer:{tool:'get_media_image_chunk',media_id:m.id,expected_sha256:info.sha256,offset:0,chunk_bytes:IMAGE_READ_CHUNK_BYTES},message:'Original exceeds the inline transport budget. Retrieve every original byte chunk and verify the final SHA-256, or use the private original download. No image has been delivered yet; no thumbnail was substituted.'}};
  }
  async function call(name,args={}){
    let data,imageContent;
    if(name==='get_profile_template'){
      const row=tables.has('application_settings')?one('SELECT value FROM application_settings WHERE key=?','ghost:template'):null;
      try{data=readProfileTemplate(row?JSON.parse(row.value):defaultTemplate,args);}catch(e){if(e.status)throw new CatalogueError(e.code||'INVALID_ARGUMENT',e.message,e.status===409);throw e;}
    }else if(name==='get_ghost_profile'){
      shape(args,['character_id','include_admin_notes']);const c=character(args.character_id),include=flag(args.include_admin_notes);if(include&&!allowAdminNotes)fail('ADMIN_NOTES_DISABLED','Private profile values require local configuration opt-in.');
      const setting=key=>tables.has('application_settings')?one('SELECT value FROM application_settings WHERE key=?',key):null;
      const row=setting('ghost:character:'+c.id),stored=row?JSON.parse(row.value):{version:0,values:{}},t=setting('ghost:template');
      data={character_id:c.id,version:stored.version,profile_version:profileVersion(one('SELECT * FROM characters WHERE id=?',c.id)),template:t?JSON.parse(t.value):defaultTemplate,values:Object.fromEntries(Object.entries(stored.values).filter(([,e])=>include||(e.visibility==='public'&&e.kind==='fact')))};
    }else if(name==='list_characters'){
      shape(args,['search','limit','offset']);const q=query(args.search),limit=integer(args.limit,25,50),offset=integer(args.offset,0,100000);if(!limit)fail('INVALID_ARGUMENT','Limit must be positive.');
      const where=tables.has('character_ui')?'NOT EXISTS(SELECT 1 FROM character_ui u WHERE u.character_id=c.id AND u.merged_into IS NOT NULL)':'1';
      const rows=all('SELECT c.id,c.name,c.aliases,(SELECT COUNT(*) FROM depictions d JOIN media m ON m.id=d.media_id WHERE d.character_id=c.id AND '+active+') media_count FROM characters c WHERE '+where+" AND (c.name LIKE ? ESCAPE '\\' OR c.aliases LIKE ? ESCAPE '\\') ORDER BY c.name,c.id LIMIT ? OFFSET ?",...Array(2).fill('%'+q.replace(/[\\%_]/g,'\\$&')+'%'),limit+1,offset);
      data={characters:rows.slice(0,limit),next_offset:rows.length>limit?offset+limit:null};
    }else if(name==='get_character'){
      shape(args,['character_id','include_admin_notes','history_limit','history_offset']);const c=character(args.character_id),include=flag(args.include_admin_notes);if(include&&!allowAdminNotes)fail('ADMIN_NOTES_DISABLED','Private administrator notes require local configuration opt-in.');if(!include)delete c.notes;
      const limit=integer(args.history_limit,10,20),offset=integer(args.history_offset,0,100000);if(!limit)fail('INVALID_ARGUMENT','History limit must be positive.');
      const history=all('SELECT id,character_id,parent_id,reason,created_at FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?',c.id,limit+1,offset),relations=all('SELECT r.id,r.source_id,r.target_id,c.name target_name,r.description FROM relationships r JOIN characters c ON c.id=r.target_id WHERE r.source_id=? ORDER BY r.id LIMIT 51',c.id);
      let structured_profile=null;
      if(tables.has('application_settings')){const row=one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+c.id);if(row){const stored=JSON.parse(row.value);structured_profile={version:stored.version,values:Object.fromEntries(Object.entries(stored.values).filter(([,e])=>include||(e.visibility==='public'&&e.kind==='fact')))};}}
      const latest=revision(c.id);data={...c,structured_profile,profile_version:profileVersion(one('SELECT * FROM characters WHERE id=?',c.id)),administrator_notes_included:include,relationships:relations.slice(0,50),more_relationships:relations.length>50,approved_canon:latest?{id:latest.id,parent_id:latest.parent_id,appearance:latest.appearance,reason:latest.reason,created_at:latest.created_at}:null,canon_history:history.slice(0,limit),next_history_offset:history.length>limit?offset+limit:null};
    }else if(name==='search_media'){
      shape(args,['search','character_id','kind','limit','offset']);const q=query(args.search),limit=integer(args.limit,20,50),offset=integer(args.offset,0,100000);if(!limit)fail('INVALID_ARGUMENT','Limit must be positive.');
      const where=[active],params=[];if(args.character_id){character(args.character_id);where.push('EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id AND d.character_id=?)');params.push(args.character_id);}if(args.kind!==undefined){if(!['image','video'].includes(args.kind))fail('INVALID_ARGUMENT','Kind must be image or video.');where.push('m.kind=?');params.push(args.kind);}
      if(q){let clause="m.relative_path LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM media_notes n WHERE n.media_id=m.id AND (n.notes LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\'))";params.push(...Array(3).fill('%'+q.replace(/[\\%_]/g,'\\$&')+'%'));if(tables.has('media_import_metadata')){clause+=" OR EXISTS(SELECT 1 FROM media_import_items i JOIN media_import_metadata d ON d.import_id=i.import_id WHERE i.media_id=m.id AND i.status='committed' AND (d.title LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\'))";params.push(...Array(2).fill('%'+q.replace(/[\\%_]/g,'\\$&')+'%'));}if(tables.has('media_tags')){clause+=" OR EXISTS(SELECT 1 FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id WHERE mt.media_id=m.id AND t.name LIKE ? ESCAPE '\\')";params.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}where.push('('+clause+')');}
      const rows=all('SELECT m.* FROM media m WHERE '+where.join(' AND ')+' ORDER BY m.id LIMIT ? OFFSET ?',...params,limit+1,offset);data={media:rows.slice(0,limit).map(m=>({id:m.id,kind:m.kind,display_name:relative(m).at(-1),size_bytes:m.size,modified_at:m.modified_at})),next_offset:rows.length>limit?offset+limit:null};
    }else if(name==='get_media_image_chunk'){
      shape(args,['media_id','offset','expected_sha256','character_id','revision_id']);
      if(typeof args.expected_sha256!=='string'||!(/^[a-f0-9]{64}$/i).test(args.expected_sha256))fail('INVALID_ARGUMENT','Use the SHA-256 returned with the original image metadata.');
      if(!Number.isSafeInteger(args.offset)||args.offset<0)fail('INVALID_ARGUMENT','Use a nonnegative byte offset.');
      const m=media(args.media_id);let approved=false;
      if(args.revision_id!==undefined&&args.character_id===undefined)fail('INVALID_ARGUMENT','A canon revision requires its character ID.');
      if(args.character_id!==undefined){const ref=canon(revision(args.character_id,args.revision_id))?.references.find(r=>r.media_id===m.id);if(!ref)fail('NOT_APPROVED','That media is not approved in the selected revision.');if(!ref.sha256||ref.sha256.toLowerCase()!==args.expected_sha256.toLowerCase())fail('CANON_MISMATCH','The requested fingerprint does not match the selected approved reference.');approved=true;}
      const result=await original(m);
      if(result.info.sha256!==args.expected_sha256.toLowerCase())fail('MEDIA_CHANGED','Original bytes changed. Discard previous chunks and retrieve fresh metadata.',true);
      if(args.offset>=result.bytes.length)fail('INVALID_ARGUMENT','Offset must be inside the original file.');
      const part=result.bytes.subarray(args.offset,args.offset+IMAGE_READ_CHUNK_BYTES),next=args.offset+part.length;
      data={media_id:m.id,...result.info,...(approved?{approved_original_fingerprint_verified:true}:{}),offset:args.offset,chunk_bytes:part.length,chunk_sha256:digest(part),data_base64:part.toString('base64'),next_offset:next<result.bytes.length?next:null};
    }else if(name==='get_media'){
      shape(args,['media_id','include_image','image_quality','frame_character_id']);const m=media(args.media_id);data=metadata(m);
      if(flag(args.include_image)){
        if(m.kind==='image'){if(args.frame_character_id!==undefined)fail('INVALID_ARGUMENT','Frame selection applies only to videos.');const output=await imageResult(m,await original(m),args.image_quality);imageContent=output.image;data.image_info=output.info;}
        else{identifier(args.frame_character_id);const frame=tables.has('character_cover_frames')?one('SELECT f.* FROM character_cover_frames f JOIN depictions d ON d.media_id=f.media_id AND d.character_id=f.character_id WHERE f.media_id=? AND f.character_id=?',m.id,args.frame_character_id):null;if(!frame)fail('STILL_UNAVAILABLE','No selected cached still exists for that character and video. Capture one in the desktop app first.',true);
          if(frame.source_size!==m.size||new Date(frame.source_mtime).getTime()!==new Date(m.modified_at).getTime())fail('STILL_STALE','The cached still no longer matches the catalogue video version.',true);
          const bytes=Buffer.from(String(frame.data_url).replace(/^data:image\/jpeg;base64,/,''),'base64');if(bytes.length>300000)fail('STILL_UNAVAILABLE','The cached still exceeds its allowed size.');try{imageContent=await makeThumbnail(bytes);}catch{fail('STILL_UNAVAILABLE','The cached still could not be rendered.',true);}data.selected_still={character_id:frame.character_id,time_seconds:frame.time_seconds,captured_at:frame.captured_at,canonical_reference:false};
        }
      }
      if(m.kind==='video'){data.video_download_available=false;data.cached_stills=tables.has('character_cover_frames')?all('SELECT character_id,time_seconds,captured_at FROM character_cover_frames WHERE media_id=? ORDER BY character_id LIMIT 20',m.id):[];}
    }else if(name==='get_approved_references'){
      shape(args,['character_id','revision_id','media_id','role','include_image','image_quality','limit','offset']);if(args.role!==undefined&&!roles.includes(args.role))fail('INVALID_ARGUMENT','Unknown canonical reference role.');const limit=integer(args.limit,20,20),offset=integer(args.offset,0,100000);if(!limit)fail('INVALID_ARGUMENT','Limit must be positive.');const r=canon(revision(args.character_id,args.revision_id));let refs=r?.references||[];
      if(args.media_id){identifier(args.media_id);refs=refs.filter(ref=>ref.media_id===args.media_id);}if(args.role)refs=refs.filter(ref=>ref.role===args.role);
      let info;
      if(flag(args.include_image)){if(!args.media_id)fail('INVALID_ARGUMENT','Select one approved media_id before requesting image content.');if(!refs.length)fail('NOT_APPROVED','That media is not an approved reference in the selected revision.');if(!refs[0].sha256)fail('CANON_FINGERPRINT_UNAVAILABLE','This legacy approved reference has no stored fingerprint. Review it locally before requesting verified imagery.',true);if(!/^[a-f0-9]{64}$/i.test(refs[0].sha256))fail('CANON_INVALID','The approved reference fingerprint is invalid.');const m=media(args.media_id),output=await imageResult(m,await original(m,refs[0].sha256),args.image_quality);imageContent=output.image;info={...output.info,approved_original_fingerprint_verified:true};if(info.transfer)info.transfer={...info.transfer,character_id:args.character_id,revision_id:r.id};}
      data={character_id:args.character_id,revision:r?{id:r.id,parent_id:r.parent_id,appearance:r.appearance,reason:r.reason,created_at:r.created_at}:null,references:refs.slice(offset,offset+limit),next_offset:refs.length>offset+limit?offset+limit:null,...(info?{image_info:info}:{})};
    }else if(['search_events','get_character_timeline','get_event'].includes(name)){
      try{
        if(name==='get_event'){shape(args,['event_id','creator','perspective_character_id']);data=events.get(args.event_id,{creator:args.creator,perspective_character_id:args.perspective_character_id});}
        else{if(name==='get_character_timeline'){identifier(args.character_id);character(args.character_id);}data=events.list(args);}
      }catch(e){fail(e.status===404?'NOT_FOUND':e.status===403?'FORBIDDEN':'INVALID_ARGUMENT',e.message);}
    }else fail('UNKNOWN_TOOL','Unknown read-only catalogue tool.');
    // Whitelist data fields above; also redact absolute paths embedded in user-authored text.
    const clean=value=>typeof value==='string'?redact(value):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,clean(v)])):value;
    // Binary chunks are base64, not user-authored text: path redaction would
    // corrupt e.g. JPEG /9j prefixes. Sanitize metadata separately.
    const chunk=data.data_base64;if(chunk!==undefined)delete data.data_base64;data=clean(data);if(Buffer.byteLength(JSON.stringify(data))>262144)fail('RESULT_LIMIT','This result is too large. Request a smaller page.');if(chunk!==undefined)data.data_base64=chunk;
    if(imageContent){try{const b=Buffer.from(imageContent.data,'base64');if(data.image_info?.representation==='original'){const i=originalInfo(b);if(b.length>maxInlineImageBytes||i.sha256!==data.image_info.sha256||i.mime_type!==imageContent.mimeType)throw Error();}else if(data.image_info?.representation==='reference'){const i=originalInfo(b);if(i.sha256!==data.image_info.sha256||b.length>MAX_REFERENCE_BYTES||Math.max(i.width,i.height)>MAX_REFERENCE_EDGE||imageContent.mimeType!=='image/jpeg')throw Error();}else{const d=dimensions(b);if(!d.width||!d.height||b[0]!==255||b[1]!==216||b.length>MAX_IMAGE_BYTES||d.width>768||d.height>768||imageContent.mimeType!=='image/jpeg')throw Error();}}catch{fail('IMAGE_UNAVAILABLE','Image output failed byte verification.',true);}}
    return {data,image:imageContent};
  }
  return {call,close:()=>db.close()};
}
