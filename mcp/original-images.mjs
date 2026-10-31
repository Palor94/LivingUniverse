import {createHash} from 'node:crypto';
import {dimensions,thumbnail,MAX_SOURCE_BYTES,MAX_IMAGE_BYTES,MAX_EDGE} from './images.mjs';

// Secure MCP Tunnel allows 10 MiB including its envelope. Leave room for
// metadata and headers; larger originals use byte-preserving read chunks.
export const MAX_INLINE_IMAGE_BYTES=6*1024*1024;
export const MAX_MCP_RESPONSE_BYTES=9*1024*1024;
export const IMAGE_READ_CHUNK_BYTES=262144;
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function originalInfo(bytes){
  const size=dimensions(bytes);
  if(!size.width||!size.height||size.width*size.height>40000000||bytes.length>MAX_SOURCE_BYTES)throw Error('Original image exceeds limits.');
  const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))?'image/gif':bytes.toString('ascii',0,2)==='BM'?'image/bmp':null;
  if(!mime)throw Error('Unsupported original image format.');
  return {representation:'original',mime_type:mime,width:size.width,height:size.height,size_bytes:bytes.length,sha256:digest(bytes)};
}
export async function verifyOriginal(bytes,decode=thumbnail){
  const info=originalInfo(bytes);
  // Reuse the existing bounded Windows decoder to validate pixels. Its derived
  // output is discarded; the caller returns the untouched input bytes.
  const decoded=await decode(bytes),preview=Buffer.from(decoded?.data||'','base64'),size=dimensions(preview);
  if(decoded.type!=='image'||decoded.mimeType!=='image/jpeg'||preview.length>MAX_IMAGE_BYTES||size.width>MAX_EDGE||size.height>MAX_EDGE||preview[0]!==255||preview[1]!==216)throw Error('Image decoding failed.');
  return info;
}
