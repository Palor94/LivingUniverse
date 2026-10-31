import {promises as fs,constants,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {digest} from './character-edit.mjs';
import {safeDownload,ImportError} from './safe-download.mjs';
import {dimensions,thumbnail} from '../mcp/images.mjs';
import {cloudAvailability} from './duplicates.mjs';
import {installMediaUploads,UPLOAD_IMAGE_BYTES} from './media-uploads.mjs';
import {installImportManagement} from './media-import-management.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const key=/^[A-Za-z0-9_-]{8,128}$/;
const validKey=value=>typeof value==='string'&&key.test(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
const problem=(code,message,status=400)=>new ImportError(code,message,status);
function shape(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw problem('INVALID_ARGUMENT','Unknown or invalid import fields.');}
function text(value,max,label){if(typeof value!=='string'||value.length>max)throw problem('INVALID_ARGUMENT',label+' must be text of at most '+max+' characters.');return value;}
function provenance(value={}){shape(value,['provider','model','prompt','generation_id']);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,text(v,k==='prompt'?30000:500,k)]));}
const filename=value=>text(value,200,'filename').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'')||'selected media';

function videoContainer(bytes){
  let hasFtyp=false,hasData=false,hasMovie=false,hasVideo=false,quickTime=false;
  function boxes(start,end,depth=0){
    if(depth>6)throw problem('INVALID_MEDIA','Video container nesting is too deep.');
    let p=start;
    while(p<end){
      if(p+8>end)throw problem('INVALID_MEDIA','Truncated video container.');
      let n=bytes.readUInt32BE(p),header=8;const type=bytes.toString('ascii',p+4,p+8);
      if(n===1){if(p+16>end)throw problem('INVALID_MEDIA','Truncated video box.');const wide=bytes.readBigUInt64BE(p+8);if(wide>BigInt(Number.MAX_SAFE_INTEGER))throw problem('INVALID_MEDIA','Invalid video box size.');n=Number(wide);header=16;}
      if(n===0)n=end-p;if(n<header||p+n>end)throw problem('INVALID_MEDIA','Invalid video box size.');
      if(depth===0&&type==='ftyp'){if(n<header+8)throw problem('INVALID_MEDIA','Invalid video type.');const brand=bytes.toString('ascii',p+header,p+header+4);if(!/^(isom|iso[2-9]|mp4[12]|avc1|M4V |qt  |MSNV)$/.test(brand))throw problem('INVALID_MEDIA','Only MP4 and MOV video containers are supported.');hasFtyp=true;quickTime=brand==='qt  ';}
      if(depth===0&&type==='mdat'&&n>header)hasData=true;
      if(type==='hdlr'&&n>=header+12&&bytes.toString('ascii',p+header+8,p+header+12)==='vide')hasVideo=true;
      if(['moov','trak','mdia'].includes(type)){if(type==='moov')hasMovie=true;boxes(p+header,p+n,depth+1);}
      p+=n;
    }
  }
  boxes(0,bytes.length);
  if(!hasFtyp||!hasData||!hasMovie||!hasVideo)throw problem('INVALID_MEDIA','A complete MP4/MOV container with a video track is required.');
  return {kind:'video',contentType:quickTime?'video/quicktime':'video/mp4',extension:quickTime?'mov':'mp4',validation:'video_container_structure'};
}
export async function validateMedia(bytes,{decodeImage=thumbnail}={}){
  if(!bytes.length)throw problem('INVALID_MEDIA','The selected file is empty.');
  let contentType,extension;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){contentType='image/png';extension='png';if(bytes.length<45||bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND')throw problem('INVALID_MEDIA','The PNG is incomplete.');}
  else if(bytes[0]===255&&bytes[1]===216){contentType='image/jpeg';extension='jpg';if(bytes.at(-2)!==255||bytes.at(-1)!==217)throw problem('INVALID_MEDIA','The JPEG is incomplete.');}
  if(contentType){
    if(bytes.length>20*1024*1024)throw problem('MEDIA_LIMIT','Images must be at most 20 MiB.',413);
    let d,preview;try{d=dimensions(bytes);if(!d.width||!d.height||d.width*d.height>40000000)throw Error();preview=await decodeImage(bytes);}catch{throw problem('INVALID_MEDIA','The image could not be decoded safely; JPEG or PNG up to 40 megapixels is required.');}
    return {kind:'image',contentType,extension,width:d.width,height:d.height,validation:'decoded_image',preview};
  }
  return videoContainer(bytes);
}

export function installMediaImports({db,root,dataDir,one,all,run,transaction,config,isBusy=()=>false,clock=()=>Date.now(),download=safeDownload,decodeImage=thumbnail}){
  db.exec(readFileSync(new URL('./migrations/014-media-imports.up.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/019-media-uploads.up.sql',import.meta.url),'utf8'));
  let processing=false;
  const limit=100*1024*1024,totalLimit=250*1024*1024;
  const now=()=>new Date(clock()).toISOString();
  function enabled(){if(config?.enabled!==true)throw problem('IMPORTS_DISABLED','Media imports require the existing authenticated write service.',403);}
  function character(cid){if(!uuid.test(cid))throw problem('INVALID_ID','Use an existing character UUID.');const c=one('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid);if(!c)throw problem('NOT_FOUND','The character is missing or merged.',404);return c;}
  function targets(s){const rows=all('SELECT character_id FROM media_import_targets WHERE import_id=? ORDER BY character_id',s.id);return (rows.length?rows.map(r=>r.character_id):[s.character_id]).map(character);}
  function load(id){enabled();if(typeof id!=='string'||!uuid.test(id))throw problem('INVALID_ID','Use the import UUID.');const s=one('SELECT * FROM media_imports WHERE id=?',id);if(!s)throw problem('NOT_FOUND','Import not found.',404);return s;}
  function session(id,forUpload=false){const s=load(id);if(forUpload){if(management.cancelled(id))throw problem('IMPORT_CANCELLED','This import was cancelled. Committed media remain; use a new request key for a new import.',410);targets(s);if(Date.parse(s.expires_at)<=clock())throw problem('IMPORT_EXPIRED','This upload page expired. Begin a new import for the same characters.',410);}return s;}
  function view(id){const s=session(id),people=(all('SELECT character_id FROM media_import_targets WHERE import_id=? ORDER BY character_id',id).map(r=>r.character_id)),details=one('SELECT title,description,reference_candidate FROM media_import_metadata WHERE import_id=?',id);const listed=(people.length?people:[s.character_id]).map(id=>({id,name:one('SELECT name FROM characters WHERE id=?',id)?.name??null})),cancelledAt=management.cancelled(id);return {import_id:s.id,status:cancelledAt?'cancelled':Date.parse(s.expires_at)<=clock()?'expired':'open',cancelled_at:cancelledAt,character_id:s.character_id,character_name:one('SELECT name FROM characters WHERE id=?',s.character_id)?.name??null,characters:listed,character_ids:listed.map(c=>c.id),...(details?{...details,reference_candidate:!!details.reference_candidate}:{}),created_at:s.created_at,expires_at:s.expires_at,expired:Date.parse(s.expires_at)<=clock(),upload_url:config.origin+'/media-import/'+s.id,provenance:JSON.parse(s.provenance_json),items:all('SELECT slot_key,status,sha256,media_id,filename,content_type,size,provenance_json,error_code,created_at FROM media_import_items WHERE import_id=? ORDER BY rowid',s.id).map(({provenance_json,...item})=>({...item,provenance:provenance_json?JSON.parse(provenance_json):null,...(item.status==='committed'?{associations:listed.map(c=>({character_id:c.id,linked:!!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',item.media_id,c.id)})),canon_approved:false}:{})})),limits:{image_bytes:20*1024*1024,video_bytes:limit,import_bytes:totalLimit,files:20,characters:50,chunk_bytes:256*1024},canon_approved:false};}
  function begin(args){
    enabled();shape(args,['request_key','character_id','character_ids','provenance','title','description','reference_candidate']);if(!validKey(args.request_key))throw problem('INVALID_ARGUMENT','Reuse an 8–128 character request key for the same import.');
    if(args.character_ids!==undefined&&args.character_id!==undefined)throw problem('INVALID_ARGUMENT','Use character_ids, or the legacy character_id, not both.');
    const ids=args.character_ids??[args.character_id];if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'))throw problem('INVALID_ARGUMENT','Select 1–50 existing character IDs.');const selected=[...new Set(ids)].sort();selected.forEach(character);
    const p=provenance(args.provenance),details={title:text(args.title??'',200,'title'),description:text(args.description??'',2000,'description'),reference_candidate:args.reference_candidate??false};if(typeof details.reference_candidate!=='boolean')throw problem('INVALID_ARGUMENT','reference_candidate must be a boolean; it never approves canon.');
    const legacy=args.character_ids===undefined&&args.title===undefined&&args.description===undefined&&args.reference_candidate===undefined;
    const hash=digest(legacy?{character_id:args.character_id,provenance:p}:{character_ids:selected,provenance:p,...details});
    return transaction(()=>{const existing=one('SELECT * FROM media_imports WHERE request_key=?',args.request_key);if(existing){if(existing.request_hash!==hash)throw problem('IDEMPOTENCY_CONFLICT','This request key belongs to another import.',409);return view(existing.id);}if(management.capacity().active_imports>=50)throw problem('IMPORT_LIMIT','Too many active imports. Use list_media_imports and cancel_media_import to release unwanted imports.',429);const id=randomUUID();run('INSERT INTO media_imports VALUES(?,?,?,?,?,?,?)',id,args.request_key,hash,selected[0],JSON.stringify(p),now(),new Date(clock()+24*60*60*1000).toISOString());for(const cid of selected)run('INSERT INTO media_import_targets VALUES(?,?)',id,cid);run('INSERT INTO media_import_metadata VALUES(?,?,?,?)',id,details.title,details.description,details.reference_candidate?1:0);return view(id);});
  }
  function slotAllowed(id,slot){if(!one('SELECT 1 FROM media_import_items WHERE import_id=? AND slot_key=?',id,slot)&&!one('SELECT 1 FROM media_uploads WHERE import_id=? AND slot_key=?',id,slot)&&one('SELECT COUNT(*) n FROM (SELECT slot_key FROM media_import_items WHERE import_id=? UNION SELECT slot_key FROM media_uploads WHERE import_id=?)',id,id).n>=20)throw problem('IMPORT_LIMIT','An import accepts at most 20 file slots.',413);}
  function failed(id,slot,error){try{slotAllowed(id,slot);}catch{return;}const existing=one('SELECT status FROM media_import_items WHERE import_id=? AND slot_key=?',id,slot);run('INSERT INTO media_import_events VALUES(?,?,?,?,?,?)',randomUUID(),id,slot,'failed',error.code||'IMPORT_FAILED',now());if(existing?.status==='committed')return;run("INSERT INTO media_import_items(id,import_id,slot_key,status,error_code,created_at) VALUES(?,?,?,'failed',?,?) ON CONFLICT(import_id,slot_key) DO UPDATE SET status='failed',error_code=excluded.error_code",randomUUID(),id,slot,error.code||'IMPORT_FAILED',now());}
  async function ordinaryDirectory(dir){await fs.mkdir(dir,{recursive:true});const info=await fs.lstat(dir);if(info.isSymbolicLink()||!info.isDirectory())throw problem('UNSAFE_STORAGE','The import directory must be an ordinary local directory.',409);const real=await fs.realpath(dir);if(path.resolve(real).toLowerCase()!==path.resolve(dir).toLowerCase())throw problem('UNSAFE_STORAGE','Junctions are not permitted in import storage.',409);return real;}
  async function verifyExisting(mediaId,fingerprint){
    const m=one('SELECT * FROM media WHERE id=?',mediaId);if(!m||one('SELECT 1 FROM media_hidden WHERE media_id=?',mediaId))throw problem('MEDIA_HIDDEN','The prior import is missing or removed. Review it in the catalogue before retrying.',409);
    if(path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||/[\x00:]/.test(m.relative_path))throw problem('UNSAFE_STORAGE','Existing media has an unsafe stored location.',409);
    const parts=m.relative_path.split(/[\\/]/);if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))throw problem('UNSAFE_STORAGE','Existing media has an unsafe stored location.',409);
    let destination=root;for(const part of parts){destination=path.join(destination,part);let stat;try{stat=await fs.lstat(destination);}catch{throw problem('STORAGE_UNAVAILABLE','The existing imported original is unavailable. Restore or reconcile it before retrying.',409);}if(stat.isSymbolicLink())throw problem('UNSAFE_STORAGE','Junctions and symbolic links are refused.',409);}
    if(await cloudAvailability(destination)!=='local')throw problem('MEDIA_OFFLINE','Make this specific imported original available on the laptop before retrying.',409);
    const original=await fs.readFile(destination);if(sha(original)!==fingerprint)throw problem('STORAGE_CONFLICT','The existing imported original changed. No file was replaced.',409);
    return {media:m,destination};
  }
  async function receive(id,slot,stream,{name,contentType,expectedSha256,source={kind:'upload'},imageOnly=false}={}){
    const s=session(id,true);if(!validKey(slot))throw problem('INVALID_ARGUMENT','Reuse a stable 8–128 character slot key for this file.');const selectedName=filename(name);
    if(expectedSha256!==undefined&&!/^[a-f0-9]{64}$/.test(expectedSha256))throw problem('INVALID_ARGUMENT','Expected SHA-256 must be lowercase hexadecimal.');
    if(processing||isBusy())throw problem('BUSY','Another import or file operation is running. Retry this same import and slot.',409);
    if(one("SELECT 1 FROM media_import_items WHERE import_id=? AND slot_key=? AND status='erased'",id,slot))throw problem('MEDIA_ERASED','This image was permanently deleted. Use a new import for an explicit new upload.',410);
    slotAllowed(id,slot);
    processing=true;let temp,handle;
    const timer=setTimeout(()=>stream.destroy?.(problem('UPLOAD_TIMEOUT','The upload timed out.',408)),60000);timer.unref();
    try{
      const staged=await ordinaryDirectory(path.join(dataDir,'import-staging'));temp=path.join(staged,randomUUID()+'.part');handle=await fs.open(temp,'wx',0o600);
      const hash=createHash('sha256');let size=0;const already=one('SELECT COALESCE(SUM(size),0) n FROM media_import_items WHERE import_id=? AND slot_key<>?',id,slot).n;
      for await(const chunk of stream){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>(imageOnly?UPLOAD_IMAGE_BYTES:limit)||size+already>totalLimit)throw problem('MEDIA_LIMIT','The file or pending import exceeds its byte limit.',413);hash.update(bytes);await handle.writeFile(bytes);}
      await handle.sync();await handle.close();handle=null;const fingerprint=hash.digest('hex');
      if(expectedSha256&&expectedSha256!==fingerprint)throw problem('HASH_MISMATCH','The retrieved bytes do not match the selected file hash.',409);
      const previous=one('SELECT * FROM media_import_items WHERE import_id=? AND slot_key=?',id,slot);
      if(previous?.status==='committed'){if(previous.sha256!==fingerprint)throw problem('IDEMPOTENCY_CONFLICT','This slot already contains another file.',409);await verifyExisting(previous.media_id,fingerprint);return view(id);}
      const bytes=await fs.readFile(temp);
      if(imageOnly&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&!(bytes[0]===255&&bytes[1]===216))throw problem('INVALID_MEDIA','The selected file is not a PNG or JPEG image. Choose a valid image and retry.');
      const type=await validateMedia(bytes,{decodeImage});
      if(imageOnly&&type.kind!=='image')throw problem('INVALID_MEDIA','This operation accepts only decoded JPEG or PNG images.');
      const claimed=String(contentType||'').split(';')[0].trim().toLowerCase();
      if(claimed&&claimed!=='application/octet-stream'&&claimed!==type.contentType)throw problem('TYPE_MISMATCH','The file bytes do not match the declared media type.');
      await ordinaryDirectory(root);let folder='Imported media',relative=path.join(folder,fingerprint+'.'+type.extension),destination;
      const existingBlob=one('SELECT media_id FROM imported_media_blobs WHERE sha256=?',fingerprint);
      if(existingBlob){const existing=await verifyExisting(existingBlob.media_id,fingerprint);destination=existing.destination;relative=existing.media.relative_path;folder=existing.media.folder;}
      else{const destinationDir=await ordinaryDirectory(path.join(root,folder));destination=path.join(destinationDir,path.basename(relative));try{await fs.copyFile(temp,destination,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;const info=await fs.lstat(destination);if(info.isSymbolicLink()||!info.isFile())throw problem('UNSAFE_STORAGE','Existing import storage is not a regular file.',409);}}
      const stored=await fs.readFile(destination);if(stored.length!==size||sha(stored)!==fingerprint)throw problem('STORAGE_CONFLICT','Stored media differs from the verified upload; no file was overwritten.',409);
      if(type.preview?.data){const cache=await ordinaryDirectory(path.join(dataDir,'import-thumbnails')),file=path.join(cache,fingerprint+'.jpg');try{await fs.writeFile(file,Buffer.from(type.preview.data,'base64'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;const info=await fs.lstat(file);if(info.isSymbolicLink()||!info.isFile())throw problem('UNSAFE_STORAGE','Unsafe thumbnail cache.',409);}}
      const stat=await fs.stat(destination),p={...JSON.parse(s.provenance_json),...source,validation:type.validation,...(type.width?{width:type.width,height:type.height}:{}),imported_at:now()};
      transaction(()=>{
        const people=targets(session(id,true)),blob=one('SELECT media_id FROM imported_media_blobs WHERE sha256=?',fingerprint);let mediaId=blob?.media_id;
        if(!mediaId){mediaId=one('SELECT id FROM media WHERE relative_path=?',relative)?.id||randomUUID();if(!one('SELECT 1 FROM media WHERE id=?',mediaId))run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',mediaId,relative,folder,type.kind,size,stat.mtime.toISOString(),now());run('INSERT INTO imported_media_blobs VALUES(?,?)',fingerprint,mediaId);}
        if(one('SELECT 1 FROM media_hidden WHERE media_id=?',mediaId))throw problem('MEDIA_HIDDEN','This imported file was previously removed. Restore it through the catalogue before reusing it.',409);
        for(const c of people)run('INSERT OR IGNORE INTO depictions VALUES(?,?)',mediaId,c.id);
        const details=one('SELECT title,description,reference_candidate FROM media_import_metadata WHERE import_id=?',id);
        if(details){Object.assign(p,{title:details.title,description:details.description,reference_candidate:!!details.reference_candidate});if(details.description)run("INSERT OR IGNORE INTO media_notes(media_id,tags,notes) VALUES(?,'',?)",mediaId,details.description);}
        run("INSERT INTO media_import_items(id,import_id,slot_key,status,sha256,media_id,filename,content_type,size,provenance_json,created_at) VALUES(?,?,?,'committed',?,?,?,?,?,?,?) ON CONFLICT(import_id,slot_key) DO UPDATE SET status='committed',sha256=excluded.sha256,media_id=excluded.media_id,filename=excluded.filename,content_type=excluded.content_type,size=excluded.size,provenance_json=excluded.provenance_json,error_code=NULL",previous?.id||randomUUID(),id,slot,fingerprint,mediaId,selectedName,type.contentType,size,JSON.stringify(p),now());
        run('INSERT INTO media_import_events VALUES(?,?,?,?,?,?)',randomUUID(),id,slot,'committed',null,now());
      });return view(id);
    }catch(error){const safe=error instanceof ImportError?error:problem('IMPORT_FAILED','The import could not finish. Retry the same pending import and slot; verified staged files are recoverable.',503);failed(id,slot,safe);throw safe;}
    finally{clearTimeout(timer);await handle?.close().catch(()=>{});if(temp)await fs.unlink(temp).catch(()=>{});processing=false;}
  }
  async function fromUrl(args){
    shape(args,['import_id','slot_key','url','filename','expected_sha256']);session(args.import_id,true);if(!validKey(args.slot_key))throw problem('INVALID_ARGUMENT','Use a stable file slot key.');text(args.url,8192,'url');
    slotAllowed(args.import_id,args.slot_key);
    let response;try{response=await download(args.url,{maxBytes:limit});return await receive(args.import_id,args.slot_key,response.stream,{name:args.filename||'selected media',contentType:response.contentType,expectedSha256:args.expected_sha256,source:response.source});}
    catch(error){response?.stream.destroy?.();const safe=error instanceof ImportError?error:problem('DOWNLOAD_FAILED','The media URL could not be imported. Use the private upload page.',502);failed(args.import_id,args.slot_key,safe);throw safe;}
  }
  const uploads=installMediaUploads({one,all,run,transaction,dataDir,session,viewImport:view,receive,ordinaryDirectory,clock,busy:()=>processing||isBusy()});
  const management=installImportManagement({one,all,run,transaction,uploads,load,enabled,isBusy:()=>processing||isBusy(),clock,origin:config?.origin});
  async function files(args){
    shape(args,['request_key','character_ids','files','provenance','title','description','reference_candidate']);
    if(!Array.isArray(args.files)||!args.files.length||args.files.length>20)throw problem('INVALID_ARGUMENT','Select 1–20 files.');
    // Bind ordered stable file IDs to request_key, but never persist temporary
    // signed URLs. A renewed URL may recover a failed download on retry.
    const identities=args.files.map(f=>{shape(f,['download_url','file_id','mime_type','file_name']);text(f.download_url,8192,'download_url');return text(f.file_id,512,'file_id');});
    if(identities.some(id=>!id)||new Set(identities).size!==identities.length)throw problem('INVALID_ARGUMENT','Files need distinct non-empty host file IDs.');
    const {files:input,...beginArgs}=args,pending=begin(beginArgs);
    const batchKey='batch_'+digest(identities);const prior=one("SELECT slot_key FROM media_import_events WHERE import_id=? AND event='file_batch'",pending.import_id);
    if(prior&&prior.slot_key!==batchKey)throw problem('IDEMPOTENCY_CONFLICT','Use the same ordered file IDs when retrying this request.',409);
    if(!prior)run('INSERT INTO media_import_events VALUES(?,?,?,?,?,?)',randomUUID(),pending.import_id,batchKey,'file_batch',null,now());
    const results=[];
    for(const [index,f] of input.entries()){
      const slot='file_'+sha(f.file_id);let response;
      try{
        session(pending.import_id,true);slotAllowed(pending.import_id,slot);const old=one("SELECT * FROM media_import_items WHERE import_id=? AND slot_key=? AND status='committed'",pending.import_id,slot);
        if(old){await verifyExisting(old.media_id,old.sha256);results.push({index,slot_key:slot,status:'committed',media_id:old.media_id});continue;}
        if(f.mime_type!==undefined&&!['image/png','image/jpeg'].includes(f.mime_type))throw problem('INVALID_MEDIA','Native file imports accept PNG and JPEG images.');
        response=await download(f.download_url,{maxBytes:UPLOAD_IMAGE_BYTES});
        await receive(pending.import_id,slot,response.stream,{name:f.file_name||'selected image',contentType:f.mime_type||response.contentType,source:{kind:'host_file',transport:'download_url',file_id_sha256:sha(f.file_id)},imageOnly:true});
        results.push({index,slot_key:slot,status:'committed',media_id:one('SELECT media_id FROM media_import_items WHERE import_id=? AND slot_key=?',pending.import_id,slot).media_id});
      }catch(e){response?.stream.destroy?.();const safe=e instanceof ImportError?e:problem('IMPORT_FAILED','File could not be retrieved or verified. Retry with a fresh host URL.',503);failed(pending.import_id,slot,safe);results.push({index,slot_key:slot,status:'failed',error_code:safe.code});}
    }
    return {...view(pending.import_id),results};
  }
  return {begin,view,receive,fromUrl,files,uploads,list:management.list,cancel:management.cancel,isBusy:()=>processing||uploads.isBusy()};
}
