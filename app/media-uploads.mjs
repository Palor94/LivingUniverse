import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {ImportError} from './safe-download.mjs';

export const UPLOAD_CHUNK_BYTES=256*1024,UPLOAD_IMAGE_BYTES=20*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=(code,message,status=400)=>{throw new ImportError(code,message,status);};
const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_ARGUMENT','Unexpected upload fields.');};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const key=/^[A-Za-z0-9_-]{8,128}$/;

export async function backupBeforeMediaUploads(db,dataDir){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='media_uploads'").get()||!db.prepare('SELECT 1 FROM characters LIMIT 1').get())return null;
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'before-media-uploads-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_FAILED','The upload migration backup failed verification.',500);}finally{copy.close();}return file;
}

// The caller supplies the SAME receiver used by URL and private browser imports.
// Only UUID/offset-derived paths enter staging; original filenames are metadata.
export function installMediaUploads({one,all,run,transaction,dataDir,session,viewImport,receive,ordinaryDirectory,clock=()=>Date.now(),busy=()=>false}){
  let active=false;
  const now=()=>new Date(clock()).toISOString();
  function row(id){if(typeof id!=='string'||!uuid.test(id))fail('INVALID_ID','Use the returned upload UUID.');const u=one('SELECT * FROM media_uploads WHERE id=?',id);if(!u)fail('NOT_FOUND','Upload not found.',404);session(u.import_id);return u;}
  function writable(u){session(u.import_id,true);if(u.status==='erased')fail('MEDIA_ERASED','This image was permanently deleted; use a new import for new media.',410);if(u.status==='expired'||Date.parse(u.expires_at)<=clock())fail('UPLOAD_EXPIRED','This upload expired. Begin a new import; committed files remain available.',410);}
  function inspect(id){const u=row(id),s=viewImport(u.import_id);return {upload_id:u.id,import_id:u.import_id,slot_key:u.slot_key,status:u.status==='committed'?'committed':u.status==='cancelled'?'cancelled':Date.parse(u.expires_at)<=clock()?'expired':u.status,size_bytes:u.size,received_bytes:u.received_bytes,sha256:u.sha256,chunk_bytes:UPLOAD_CHUNK_BYTES,expires_at:u.expires_at,error_code:u.error_code,receipt:s.items.find(i=>i.slot_key===u.slot_key&&i.status==='committed')||null,canon_approved:false};}
  async function directory(u){const base=await ordinaryDirectory(path.join(dataDir,'upload-staging'));return ordinaryDirectory(path.join(base,u.id));}
  async function chunkFile(u,offset){return path.join(await directory(u),offset+'.part');}
  async function readChunk(u,c){const file=await chunkFile(u,c.offset),s=await fs.lstat(file);if(s.isSymbolicLink()||!s.isFile()||s.size!==c.size||s.size>UPLOAD_CHUNK_BYTES)fail('STAGING_CHANGED','A staged chunk changed. No media was registered.',409);const b=await fs.readFile(file);if(hash(b)!==c.sha256)fail('STAGING_CHANGED','A staged chunk changed. No media was registered.',409);return b;}
  async function removeChunks(u){
    if(!uuid.test(u.id))fail('UNSAFE_STORAGE','Invalid staging directory identity.',409);
    const base=path.join(dataDir,'upload-staging'),dir=path.join(base,u.id);
    // Never traverse an unexpected entry or recurse through a junction.
    try{await ordinaryDirectory(base);const s=await fs.lstat(dir);if(s.isSymbolicLink()||!s.isDirectory()||path.resolve(await fs.realpath(dir)).toLowerCase()!==path.resolve(dir).toLowerCase())fail('UNSAFE_STORAGE','Unsafe staging directory; cleanup was not performed.',409);
      for(const name of await fs.readdir(dir)){if(!/^\d+\.part$/.test(name))continue;const file=path.join(dir,name),st=await fs.lstat(file);if(st.isFile()&&!st.isSymbolicLink())await fs.unlink(file);}
      await fs.rmdir(dir);
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  async function cleanup(){if(active||busy())return;return locked(async()=>{for(const u of all("SELECT * FROM media_uploads WHERE expires_at<=? OR status IN ('committed','cancelled')",now())){
    try{await removeChunks(u);if(u.status==='cancelled')run("UPDATE media_uploads SET error_code='IMPORT_CANCELLED' WHERE id=?",u.id);else if(u.status!=='committed')run("UPDATE media_uploads SET status='expired',error_code='UPLOAD_EXPIRED' WHERE id=?",u.id);else if(u.error_code==='CLEANUP_PENDING')run('UPDATE media_uploads SET error_code=NULL WHERE id=?',u.id);}
    catch{run("UPDATE media_uploads SET error_code='CLEANUP_PENDING' WHERE id=?",u.id);}
  }});}
  async function cancelImport(id,mark){return locked(async()=>{
    // Mark first, synchronously: new URL/native/chunk writes cannot race cleanup.
    mark();run("UPDATE media_uploads SET status='cancelled',error_code='IMPORT_CANCELLED' WHERE import_id=? AND status<>'committed'",id);
    let complete=true;
    for(const u of all('SELECT * FROM media_uploads WHERE import_id=?',id)){
      try{await removeChunks(u);if(u.status==='cancelled')run("UPDATE media_uploads SET error_code='IMPORT_CANCELLED' WHERE id=?",u.id);else run('UPDATE media_uploads SET error_code=NULL WHERE id=?',u.id);}
      catch{complete=false;run("UPDATE media_uploads SET error_code='CLEANUP_PENDING' WHERE id=?",u.id);}
    }
    return {cleanup_complete:complete,...(!complete?{cleanup_error_code:'CLEANUP_PENDING'}:{})};
  });}
  async function locked(fn){if(active||busy())fail('BUSY','Another upload or file operation is running. Retry this same request.',409);active=true;try{return await fn();}finally{active=false;}}
  async function begin(args){
    shape(args,['import_id','slot_key','filename','content_type','size_bytes','sha256']);const s=session(args.import_id,true);
    if(typeof args.slot_key!=='string'||!key.test(args.slot_key)||typeof args.filename!=='string'||!args.filename||args.filename.length>200||/[\x00-\x1f\x7f]/.test(args.filename))fail('INVALID_ARGUMENT','Supply a stable slot key and a filename of at most 200 characters.');
    if(!['image/png','image/jpeg'].includes(args.content_type))fail('INVALID_MEDIA','Chunk uploads accept PNG and JPEG images.');
    if(!Number.isSafeInteger(args.size_bytes)||args.size_bytes<1||args.size_bytes>UPLOAD_IMAGE_BYTES)fail('MEDIA_LIMIT','Images must be 1 byte to 20 MiB.',413);
    if(typeof args.sha256!=='string'||! /^[a-f0-9]{64}$/.test(args.sha256))fail('INVALID_ARGUMENT','Compute SHA-256 from the actual selected bytes.');
    const requestHash=hash(JSON.stringify([args.filename,args.content_type,args.size_bytes,args.sha256]));
    await cleanup();
    return locked(async()=>transaction(()=>{
      session(s.id,true);
      const prior=one('SELECT * FROM media_uploads WHERE import_id=? AND slot_key=?',s.id,args.slot_key);
      if(prior){if(prior.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT','This slot is already bound to different upload bytes or metadata.',409);return inspect(prior.id);}
      const slots=one('SELECT COUNT(*) n FROM (SELECT slot_key FROM media_import_items WHERE import_id=? UNION SELECT slot_key FROM media_uploads WHERE import_id=?)',s.id,s.id).n;
      if(slots>=20&&!one('SELECT 1 FROM media_import_items WHERE import_id=? AND slot_key=?',s.id,args.slot_key))fail('IMPORT_LIMIT','An import accepts at most 20 file slots.',413);
      const reserved=one("SELECT COALESCE(SUM(size),0) n FROM media_uploads WHERE status='uploading' AND expires_at>?",now()).n;
      if(reserved+args.size_bytes>256*1024*1024)fail('STAGING_LIMIT','Too much unfinished upload data. Use list_media_imports and cancel_media_import for unwanted pending imports, or finish active uploads.',429);
      const id=randomUUID();run("INSERT INTO media_uploads(id,import_id,slot_key,request_hash,filename,content_type,size,sha256,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,'uploading',?,?)",id,s.id,args.slot_key,requestHash,args.filename,args.content_type,args.size_bytes,args.sha256,now(),s.expires_at);return inspect(id);
    }));
  }
  async function chunk(args){
    shape(args,['upload_id','offset','data_base64']);const u=row(args.upload_id);writable(u);
    if(!Number.isSafeInteger(args.offset)||args.offset<0||args.offset%UPLOAD_CHUNK_BYTES!==0)fail('INVALID_ARGUMENT','Use the received_bytes offset returned by the server.');
    const encoded=args.data_base64;
    if(typeof encoded!=='string'||!encoded.length||encoded.length>Math.ceil(UPLOAD_CHUNK_BYTES/3)*4||encoded.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('INVALID_ARGUMENT','Use canonical base64 of at most one chunk of actual file bytes.');
    const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded||bytes.length!==Math.min(UPLOAD_CHUNK_BYTES,u.size-args.offset))fail('CHUNK_SIZE','Use full chunks except for the final remaining bytes.');
    return locked(async()=>{
      const current=row(u.id);writable(current);const prior=one('SELECT * FROM media_upload_chunks WHERE upload_id=? AND offset=?',u.id,args.offset),fingerprint=hash(bytes);
      if(prior){if(prior.sha256!==fingerprint||prior.size!==bytes.length)fail('IDEMPOTENCY_CONFLICT','This offset already contains different bytes.',409);if(current.status!=='committed')await readChunk(u,prior);return inspect(u.id);}
      if(current.status==='committed'||args.offset!==current.received_bytes)fail('UPLOAD_OFFSET','Resume at the server received_bytes offset.',409);
      const file=await chunkFile(u,args.offset);let handle;
      try{handle=await fs.open(file,'wx',0o600);await handle.writeFile(bytes);await handle.sync();}
      catch(e){if(e.code!=='EEXIST')throw e;const st=await fs.lstat(file);if(st.isSymbolicLink()||!st.isFile()||st.size!==bytes.length||hash(await fs.readFile(file))!==fingerprint)fail('STAGING_CHANGED','A staged chunk differs. No file was overwritten.',409);}
      finally{await handle?.close();}
      transaction(()=>{writable(row(u.id));run('INSERT INTO media_upload_chunks VALUES(?,?,?,?)',u.id,args.offset,bytes.length,fingerprint);run("UPDATE media_uploads SET received_bytes=?,status='uploading',error_code=NULL WHERE id=?",args.offset+bytes.length,u.id);});return inspect(u.id);
    });
  }
  async function finalize(args){
    shape(args,['upload_id']);const u=row(args.upload_id);
    return locked(async()=>{
      if(u.status==='erased')fail('MEDIA_ERASED','This image was permanently deleted; this upload cannot restore it.',410);
      if(u.status==='committed')return inspect(u.id);
      writable(u);if(u.received_bytes!==u.size)fail('UPLOAD_INCOMPLETE','Upload is incomplete. Resume at received_bytes before finalizing.',409);
      try{
        const chunks=all('SELECT * FROM media_upload_chunks WHERE upload_id=? ORDER BY offset',u.id);
        const stream=Readable.from((async function*(){let offset=0;for(const c of chunks){if(c.offset!==offset)fail('UPLOAD_INCOMPLETE','A chunk is missing.',409);yield await readChunk(u,c);offset+=c.size;}if(offset!==u.size)fail('UPLOAD_INCOMPLETE','The upload length does not match.',409);})());
        await receive(u.import_id,u.slot_key,stream,{name:u.filename,contentType:u.content_type,expectedSha256:u.sha256,source:{kind:'chunk_upload'},imageOnly:true});
        run("UPDATE media_uploads SET status='committed',error_code=NULL WHERE id=?",u.id);
        await removeChunks(u);return inspect(u.id);
      }catch(e){if(u.status!=='committed')run("UPDATE media_uploads SET error_code=? WHERE id=?",e instanceof ImportError?e.code:'UPLOAD_FAILED',u.id);if(e instanceof ImportError)throw e;fail('UPLOAD_FAILED','The upload could not finish. Check status and retry the same upload.',503);}
    });
  }
  // Logical exports intentionally exclude temporary image bytes. A restored
  // pending upload must not claim that its old staging offsets are resumable.
  function afterRestore(){run("UPDATE media_uploads SET status='expired',error_code='RESTORED_WITHOUT_STAGING' WHERE status NOT IN ('committed','cancelled','erased')");}
  return {begin,chunk,finalize,inspect,cleanup,cancelImport,afterRestore,isBusy:()=>active};
}
