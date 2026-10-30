import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {cloudAvailability} from './duplicates.mjs';
import {referenceImage,MAX_SOURCE_BYTES,MAX_REFERENCE_BYTES,MAX_REFERENCE_EDGE} from '../mcp/images.mjs';
import {originalInfo} from '../mcp/original-images.mjs';
import {analysisError,analysisHash,analysisDigest} from './analysis-model.mjs';

export function createAnalysisSource({root,one,availability=cloudAvailability,decode=referenceImage}){
  async function read(mediaId,expected){
    const m=one("SELECT * FROM active_media WHERE id=? AND kind='image'",mediaId);
    if(!m||typeof m.relative_path!=='string'||path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||/[\x00:]/u.test(m.relative_path))throw analysisError('IMAGE_UNAVAILABLE','Válassz aktív, elérhető képet.',409);
    const parts=m.relative_path.split(/[\\/]/u);
    if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||['app','mcp','tests','docs','backups','node_modules'].includes(parts[0].toLowerCase()))throw analysisError('UNSAFE_IMAGE','Nem engedélyezett képelérési út.',403);
    const realRoot=await fs.realpath(root);let file=realRoot;
    for(const part of parts){file=path.join(file,part);const st=await fs.lstat(file).catch(()=>null);if(!st||st.isSymbolicLink())throw analysisError('IMAGE_UNAVAILABLE','A kép útvonala nem érhető el biztonságosan.',409);}
    const relative=path.relative(realRoot,await fs.realpath(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw analysisError('UNSAFE_IMAGE','A kép a médiakönyvtáron kívül van.',403);
    if(await availability(file)!=='local')throw analysisError('IMAGE_OFFLINE','A kép nincs helyben; automatikus OneDrive-letöltést nem indítunk.',409);
    const handle=await fs.open(file,constants.O_RDONLY);let bytes,before,after;
    try{
      before=await handle.stat();if(!before.isFile()||before.size<1||before.size>MAX_SOURCE_BYTES)throw analysisError('IMAGE_LIMIT','A kép meghaladja a méretkorlátot.',413);
      bytes=Buffer.alloc(before.size);let offset=0;
      while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
      const extra=Buffer.alloc(1),growth=await handle.read(extra,0,1,bytes.length);after=await handle.stat();
      if(offset!==bytes.length||growth.bytesRead||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw analysisError('SOURCE_CHANGED','A kép olvasás közben megváltozott.',409);
    }finally{await handle.close();}
    let info;try{info=originalInfo(bytes);}catch{throw analysisError('INVALID_IMAGE','Nem támogatott vagy túl nagy képtartalom.',400);}
    const manifest={media_id:m.id,relative_path:m.relative_path,kind:m.kind,sha256:info.sha256,size:before.size,mtime_ms:before.mtimeMs,ctime_ms:before.ctimeMs,mime_type:info.mime_type,width:info.width,height:info.height};
    if(expected&&analysisDigest(manifest)!==analysisDigest(expected))throw analysisError('SOURCE_CHANGED','A kép megváltozott az előnézet vagy elemzés óta.',409);
    return {manifest,bytes};
  }
  async function derivative(bytes){
    let decoded;try{decoded=await decode(bytes);}catch{throw analysisError('DECODE_FAILED','Nem sikerült biztonságos elemzési képet készíteni.',409);}
    const output=Buffer.from(decoded?.data||'','base64');let info;try{info=originalInfo(output);}catch{throw analysisError('DECODE_FAILED','Érvénytelen elemzési képszármazék.',409);}
    if(decoded.type!=='image'||decoded.mimeType!=='image/jpeg'||info.mime_type!=='image/jpeg'||output.length>MAX_REFERENCE_BYTES||Math.max(info.width,info.height)>MAX_REFERENCE_EDGE)throw analysisError('DECODE_FAILED','Az elemzési kép meghaladja a korlátokat.',409);
    return {bytes:output,mime_type:info.mime_type,sha256:analysisHash(output),width:info.width,height:info.height};
  }
  return {read,derivative};
}
