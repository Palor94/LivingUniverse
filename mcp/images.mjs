import {referenceCrop} from '../app/reference-crop.mjs';
import {createHash} from 'node:crypto';
import {imageDecoderPool} from '../app/windows-image-decoder.mjs';

export const MAX_IMAGE_BYTES=196608,MAX_SOURCE_BYTES=20*1024*1024,MAX_EDGE=768;
export const MAX_REFERENCE_BYTES=3*1024*1024,MAX_REFERENCE_EDGE=2048;
export function dimensions(b){
  if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if(b.length>=10&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return {width:b.readUInt16LE(6),height:b.readUInt16LE(8)};
  if(b.length>=26&&b.toString('ascii',0,2)==='BM')return {width:Math.abs(b.readInt32LE(18)),height:Math.abs(b.readInt32LE(22))};
  if(b[0]===255&&b[1]===216){let p=2;while(p+4<b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];if(marker===218||marker===217)break;const n=b.readUInt16BE(p);if(n<2||p+n>b.length)break;if([192,193,194].includes(marker)&&n>=8)return {height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};p+=n;}}
  throw Error('Unsupported image format.');
}
const defaultPool=imageDecoderPool();
export function createImageDecoder({convert=defaultPool,now=Date.now,failureTtl=600000}={}){
  const failed=new Map(),pending=new Map();
  return async function decode(bytes,reference=false,crop=null){
    const maxBytes=reference?MAX_REFERENCE_BYTES:MAX_IMAGE_BYTES,maxEdge=reference?MAX_REFERENCE_EDGE:MAX_EDGE;
    const d=dimensions(bytes),region=reference?referenceCrop(crop):null;
    if(!d.width||!d.height||d.width*d.height>40000000||bytes.length>MAX_SOURCE_BYTES)throw Error('Image exceeds safe limits.');
    const key=createHash('sha256').update(bytes).update(JSON.stringify([maxBytes,maxEdge,region])).digest('hex'),old=failed.get(key);
    if(old&&now()-old.at<failureTtl)throw Error(old.message);failed.delete(key);
    let job=pending.get(key);if(job)return job;
    job=(async()=>{
      const response=await convert({data:bytes.toString('base64'),reference,crop:region}),result=response.data;
      if(typeof result!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(result))throw Error('Invalid thumbnail.');
      const output=Buffer.from(result,'base64'),size=dimensions(output);
      if(output.length>maxBytes||size.width>maxEdge||size.height>maxEdge||output[0]!==255||output[1]!==216)throw Error('Image exceeds output bound.');
      return {type:'image',mimeType:'image/jpeg',data:output.toString('base64')};
    })().catch(error=>{failed.set(key,{at:now(),message:String(error.message||error).slice(0,1024)});if(failed.size>256)failed.delete(failed.keys().next().value);throw error;}).finally(()=>pending.delete(key));
    pending.set(key,job);return job;
  };
}
const decodeImage=createImageDecoder();
export const thumbnail=bytes=>decodeImage(bytes,false);
export const referenceImage=(bytes,crop=null)=>decodeImage(bytes,true,crop);
