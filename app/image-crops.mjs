import {samePhysicalPath,resolveMediaPath} from './media-paths.mjs';
import {promises as fs,constants,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pixelCrop} from './public/crop-selection.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,sha=/^[a-f0-9]{64}$/;
const extensions={'.jpg':'jpeg','.jpeg':'jpeg','.png':'png','.webp':'webp'};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function imageInfo(b){
  let width,height,format,animated=false,orientation=1;
  if(b.length>=33&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR'){
    format='png';width=b.readUInt32BE(16);height=b.readUInt32BE(20);let at=8,ended=false;
    while(at+12<=b.length){const size=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(at+12+size>b.length)throw Error('Incomplete PNG.');if(type==='acTL')animated=true;if(type==='IEND'){ended=true;break;}at+=12+size;}if(!ended)throw Error('Incomplete PNG.');
  }else if(b.length>12&&b[0]===255&&b[1]===216&&b.at(-2)===255&&b.at(-1)===217){
    format='jpeg';let at=2;
    while(at+4<b.length){if(b[at++]!==255)break;while(b[at]===255)at++;const marker=b[at++];if(marker===218||marker===217)break;if(marker===1||(marker>=208&&marker<=215))continue;const size=b.readUInt16BE(at);if(size<2||at+size>b.length)throw Error('Incomplete JPEG.');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8){height=b.readUInt16BE(at+3);width=b.readUInt16BE(at+5);}
      if(marker===225&&b.toString('ascii',at+2,at+8)==='Exif\0\0'){try{const base=at+8,le=b.toString('ascii',base,base+2)==='II',u16=p=>le?b.readUInt16LE(p):b.readUInt16BE(p),u32=p=>le?b.readUInt32LE(p):b.readUInt32BE(p),dir=base+u32(base+4);for(let i=0;i<Math.min(u16(dir),100);i++){const p=dir+2+i*12;if(p+12>at+size)break;if(u16(p)===274&&u16(p+2)===3&&u32(p+4)===1)orientation=u16(p+8);}}catch{}}
      at+=size;
    }
    if(orientation>=5&&orientation<=8)[width,height]=[height,width];
  }else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'&&b.readUInt32LE(4)===b.length-8){
    format='webp';const type=b.toString('ascii',12,16);
    if(type==='VP8X'){animated=!!(b[20]&2);width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
    else if(type==='VP8 '&&b.subarray(23,26).equals(Buffer.from([157,1,42]))){width=b.readUInt16LE(26)&16383;height=b.readUInt16LE(28)&16383;}
    else if(type==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);width=1+(bits&16383);height=1+((bits>>>14)&16383);}
  }
  if(!width||!height||width*height>32000000||width>16000||height>16000)throw Error('Use a valid JPEG, PNG or WebP picture of at most 32 megapixels.');
  return {width,height,format,animated};
}
export function installImageCrops({db,root,dataDir,one,all,run,transaction,asset,safeFile,fingerprint,moving,isScanning,fail}){
  db.exec(readFileSync(new URL('./migrations/013-image-crops.up.sql',import.meta.url),'utf8'));
  run("UPDATE media_image_edits SET status='needs_review' WHERE status IN ('preparing','restoring')");
  const originals=path.join(dataDir,'image-originals'),staging=path.join(dataDir,'image-edit-staging');
  function protectedImage(mid){return !!one("SELECT 1 FROM canon c,json_each(c.references_json) r WHERE json_extract(r.value,'$.media_id')=? LIMIT 1",mid);}
  function available(mid){const m=asset(mid);if(m.kind!=='image'||!extensions[path.extname(m.relative_path).toLowerCase()])throw fail('Cropping supports JPEG, PNG and WebP pictures. Animated pictures are not flattened.');if(one('SELECT 1 FROM media_hidden WHERE media_id=?',mid))throw fail('Restore this item from Removed items before cropping it.',409);return m;}
  async function source(m){const file=await safeFile(m),expected=resolveMediaPath(root,m.relative_path),same=(a,b)=>(process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b);if(!same(file,expected)||(await fs.lstat(expected)).isSymbolicLink())throw fail('Cropping through symbolic links is not allowed.',403);const stat=await fs.stat(file);if(!stat.isFile()||stat.size>64*1024*1024)throw fail('This picture is too large for the crop editor (64 MB maximum).');return {file,stat};}
  async function privateFile(folder,name){await fs.mkdir(folder,{recursive:true});const base=await fs.realpath(dataDir),real=await fs.realpath(folder);if(!real.startsWith(base+path.sep)||(await fs.lstat(folder)).isSymbolicLink())throw fail('The recovery storage directory is unsafe.',403);return path.join(real,name);}
  function state(mid){const edit=one("SELECT id,status,created_at FROM media_image_edits WHERE media_id=? AND status IN ('applied','needs_review') ORDER BY rowid DESC LIMIT 1",mid);return {protected:protectedImage(mid),latest_edit:edit||null};}
  function metadata(mid,stat){run('UPDATE media SET size=?,modified_at=? WHERE id=?',stat.size,stat.mtime.toISOString(),mid);run('DELETE FROM media_fingerprints WHERE media_id=?',mid);}
  function receipt(edit){return {ok:true,edit_id:edit.id,status:edit.status,original_recoverable:true};}
  async function handle({p,body,req,json}){
    const route=p.match(/^\/api\/media\/([^/]+)\/image-crop(?:\/(restore))?$/);if(!route)return false;const mid=route[1];
    if(!uuid.test(mid))throw fail('Invalid media ID.');
    if(req.method==='GET'&&!route[2]){const m=available(mid),{file,stat}=await source(m);json({...state(mid),source_sha256:await fingerprint(file),source_size:stat.size});return true;}
    if(req.method!=='POST')throw fail('Use the crop editor action.',405);
    if(moving.has(mid)||isScanning())throw fail('A file operation is running. Retry after it finishes.',409);
    if(protectedImage(mid))throw fail('This picture belongs to approved reference history. Its pixels cannot be replaced; use a separate picture for editing.',409);
    const restoring=!!route[2];
    if(!body||!uuid.test(body.edit_id)||!sha.test(body.source_sha256))throw fail('Reload the picture before cropping or restoring it.');
    const m=available(mid);moving.add(mid);let journal=null,temp=null,replaced=false;
    try{
      const {file,stat}=await source(m),originalHash=await fingerprint(file);
      const previous=!restoring&&one('SELECT * FROM media_image_edits WHERE id=?',body.edit_id);
      if(previous?.status==='applied'&&previous.media_id===mid&&previous.original_sha256===body.source_sha256&&previous.cropped_sha256===originalHash){
        if(typeof body.image_data!=='string'||body.image_data.length>32*1024*1024||hash(Buffer.from(body.image_data.split(',')[1]||'','base64'))!==previous.cropped_sha256||!['x','y','w','h'].every(k=>JSON.parse(previous.crop_json)[k]===body.crop?.[k]))throw fail('This crop request already belongs to different content.',409);
        json({...receipt(previous),source_sha256:originalHash});return true;
      }
      if(originalHash!==body.source_sha256)throw fail('The picture changed. Reopen the crop editor; nothing was replaced.',409);
      let bytes,edit;
      if(restoring){edit=one('SELECT * FROM media_image_edits WHERE id=? AND media_id=?',body.edit_id,mid);if(!edit||!['applied','needs_review'].includes(edit.status)||edit.cropped_sha256!==originalHash)throw fail('Only the most recent unchanged crop can be restored.',409);const backup=await privateFile(originals,edit.id+'.original');try{if((await fs.lstat(backup)).isSymbolicLink())throw fail('Unsafe recovery file.',403);bytes=await fs.readFile(backup);}catch(e){if(e.status)throw e;throw fail('The saved original is missing or unavailable in recovery storage. The current picture was kept.',409);}if(hash(bytes)!==edit.original_sha256)throw fail('The saved original failed its integrity check; nothing was replaced.',409);}
      else{
        const r=body.crop;if(!r||!['x','y','w','h'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<.01||r.h<.01||r.x+r.w>1.000001||r.y+r.h>1.000001)throw fail('Choose a crop inside the picture.');
        if(typeof body.image_data!=='string'||body.image_data.length>32*1024*1024)throw fail('The cropped image is too large (24 MB maximum).',413);
        const match=body.image_data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw fail('Use a valid PNG, JPEG or WebP crop.');bytes=Buffer.from(match[2],'base64');if(bytes.length>24*1024*1024)throw fail('The cropped image is too large.',413);
        let originalInfo,output;try{originalInfo=imageInfo(await fs.readFile(file));output=imageInfo(bytes);}catch(e){throw fail(e.message);}
        const expected=pixelCrop(originalInfo.width,originalInfo.height,r);if(originalInfo.animated||output.animated)throw fail('Animated pictures cannot be cropped without losing animation.');if(output.format!==extensions[path.extname(m.relative_path).toLowerCase()]||output.width!==expected.w||output.height!==expected.h)throw fail('The crop format or pixel dimensions do not match the original. Reopen the editor.');
        edit=one('SELECT * FROM media_image_edits WHERE id=?',body.edit_id);if(edit){if(edit.media_id===mid&&edit.original_sha256===originalHash&&edit.cropped_sha256===hash(bytes)&&edit.status==='applied'){json(receipt(edit));return true;}throw fail('This crop request was already used. Reopen the editor.',409);}
        const backup=await privateFile(originals,body.edit_id+'.original');await fs.copyFile(file,backup,constants.COPYFILE_EXCL);if(await fingerprint(backup)!==originalHash)throw fail('Original backup verification failed. Nothing was replaced.',409);
        run("INSERT INTO media_image_edits VALUES(?,?,'preparing',?,?,?,?,?,?,NULL)",body.edit_id,mid,originalHash,hash(bytes),JSON.stringify(r),stat.size,stat.mtime.toISOString(),new Date().toISOString());edit=one('SELECT * FROM media_image_edits WHERE id=?',body.edit_id);
      }
      // Stage on the destination filesystem so atomic replacement also works
      // when private recovery storage is mounted on a different device.
      journal=edit.id;temp=path.join(path.dirname(file),'.living-universe-crop-'+randomUUID()+'.tmp');await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});if(await fingerprint(temp)!==hash(bytes))throw fail('Crop staging verification failed.',409);
      const current=available(mid),check=await source(current);if(check.file!==file||await fingerprint(file)!==originalHash||protectedImage(mid))throw fail('The source or approved reference status changed. Nothing was replaced.',409);
      if(restoring)run("UPDATE media_image_edits SET status='restoring' WHERE id=?",edit.id);
      // The verified private backup precedes the same-filesystem atomic replacement.
      await fs.rename(temp,file);temp=null;replaced=true;const saved=await fs.stat(file);
      transaction(()=>{metadata(mid,saved);run('UPDATE media_image_edits SET status=?,restored_at=? WHERE id=?',restoring?'restored':'applied',restoring?new Date().toISOString():null,edit.id);});
      json({...receipt(one('SELECT * FROM media_image_edits WHERE id=?',edit.id)),source_sha256:hash(bytes)});return true;
    }catch(e){if(journal)run("UPDATE media_image_edits SET status='needs_review' WHERE id=?",journal);if(e.status)throw e;throw fail(replaced?'The picture changed, but catalogue confirmation failed. The verified original is retained; reopen the crop editor to restore it.':'The crop could not finish. The current picture was kept. Check OneDrive availability, file locks and recovery storage on the same drive, then retry.',409);}
    finally{if(temp)await fs.unlink(temp).catch(()=>{});moving.delete(mid);}
  }
  return {handle,state};
}
