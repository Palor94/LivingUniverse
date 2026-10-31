import {referenceCrop} from '../app/reference-crop.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const MAX_IMAGE_BYTES=196608,MAX_SOURCE_BYTES=20*1024*1024,MAX_EDGE=768;
export const MAX_REFERENCE_BYTES=3*1024*1024,MAX_REFERENCE_EDGE=2048;
export function dimensions(b){
  if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if(b.length>=10&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return {width:b.readUInt16LE(6),height:b.readUInt16LE(8)};
  if(b.length>=26&&b.toString('ascii',0,2)==='BM')return {width:Math.abs(b.readInt32LE(18)),height:Math.abs(b.readInt32LE(22))};
  if(b[0]===255&&b[1]===216){let p=2;while(p+4<b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];if(marker===218||marker===217)break;const n=b.readUInt16BE(p);if(n<2||p+n>b.length)break;if([192,193,194].includes(marker)&&n>=8)return {height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};p+=n;}}
  throw Error('Unsupported image format.');
}
export const thumbnail=bytes=>decodeImage(bytes,false);
export const referenceImage=(bytes,crop=null)=>decodeImage(bytes,true,crop);
async function decodeImage(bytes,reference,crop=null){
  const maxBytes=reference?MAX_REFERENCE_BYTES:MAX_IMAGE_BYTES,maxEdge=reference?MAX_REFERENCE_EDGE:MAX_EDGE;
  const d=dimensions(bytes);if(!d.width||!d.height||d.width*d.height>40000000||bytes.length>MAX_SOURCE_BYTES)throw Error('Image exceeds safe limits.');
  crop=referenceCrop(crop);
  const backend=process.env.LU_IMAGE_DECODER||(process.platform==='win32'?'windows':'portable');
  if(backend==='portable')return portableDecode(bytes,reference,crop);
  if(backend!=='windows'||process.platform!=='win32')throw Error('Configured image decoder unavailable.');
  const script=await readFile(new URL('./thumbnail.ps1',import.meta.url),'utf8');
  const result=await new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:decoderEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,done=false;const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Thumbnail conversion timed out.'));},15000);
    child.on('error',()=>finish(Error('Thumbnail converter unavailable.')));child.stdin.on('error',()=>{});child.stderr.resume();
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>Math.ceil(maxBytes/3)*4+1024){child.kill();finish(Error('Image exceeds output bound.'));}else chunks.push(chunk);});
    child.on('close',code=>finish(code?Error('Thumbnail conversion unavailable.'):null,Buffer.concat(chunks).toString('ascii').trim()));
    child.stdin.end(JSON.stringify({data:bytes.toString('base64'),reference,crop:referenceCrop(crop)}));
  });
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(result))throw Error('Invalid thumbnail.');
  const output=Buffer.from(result,'base64'),d2=dimensions(output);
  if(output.length>maxBytes||d2.width>maxEdge||d2.height>maxEdge||output[0]!==255||output[1]!==216)throw Error('Image exceeds output bound.');
  return {type:'image',mimeType:'image/jpeg',data:output.toString('base64')};
}

export function decoderEnvironment(env=process.env){
  return Object.fromEntries(Object.entries(env).filter(([key])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','LANG','LC_ALL','PSMODULEPATH'].includes(key.toUpperCase())));
}
async function portableDecode(bytes,reference,crop){
  const maxBytes=reference?MAX_REFERENCE_BYTES:MAX_IMAGE_BYTES,maxEdge=reference?MAX_REFERENCE_EDGE:MAX_EDGE;
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=256',fileURLToPath(new URL('./image-worker.mjs',import.meta.url)),reference?'reference':'thumbnail',JSON.stringify(crop)],{env:decoderEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Image conversion timed out.'));},15000);
    child.once('error',()=>finish(Error('Image converter unavailable.')));child.stdin.on('error',()=>{});child.stderr.resume();
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){child.kill();finish(Error('Image exceeds output bound.'));}else chunks.push(chunk);});
    child.once('close',code=>finish(code?Error('Image conversion unavailable.'):null,Buffer.concat(chunks)));
    child.stdin.end(bytes);
  });
  const d=dimensions(output);
  if(!output.length||output.length>maxBytes||d.width>maxEdge||d.height>maxEdge||output[0]!==255||output[1]!==216)throw Error('Image exceeds output bound.');
  return {type:'image',mimeType:'image/jpeg',data:output.toString('base64')};
}
