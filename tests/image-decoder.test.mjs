import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImageDecoder,dimensions} from '../mcp/images.mjs';
import {imageDecoderPool} from '../app/windows-image-decoder.mjs';

function bmp(w=40,h=50,{truncated=false}={}){
  const row=Math.ceil(w*3/4)*4,size=54+row*h,b=Buffer.alloc(truncated?54:size);b.write('BM');b.writeUInt32LE(size,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(row*h,34);if(!truncated)b.fill(128,54);return b;
}
test('V5 failures coalesce and remain negative-cached for ten minutes, keyed by bytes, crop and output size',async()=>{
  let calls=0,now=0;const decode=createImageDecoder({now:()=>now,convert:async()=>{calls++;throw Error('Synthetic decoder: invalid source pixels');}}),source=bmp();
  await Promise.all([assert.rejects(decode(source),/invalid source/),assert.rejects(decode(source),/invalid source/)]);assert.equal(calls,1);
  now=599999;await assert.rejects(decode(source));assert.equal(calls,1);
  now=600001;await assert.rejects(decode(source));assert.equal(calls,2);
  await assert.rejects(decode(source,true));assert.equal(calls,3);await assert.rejects(decode(source,true,{x:0,y:0,w:.5,h:1}));assert.equal(calls,4);
  const changed=Buffer.from(source);changed[54]++;await assert.rejects(decode(changed));assert.equal(calls,5);
});
test('V5 edge-touching approved crops survive Windows decimal differences; shared worker is reused',{skip:process.platform!=='win32'},async()=>{
  const worker=imageDecoderPool({workers:1});const decode=createImageDecoder({convert:worker}),source=bmp();
  const crops=[{x:.6364639872345477,y:.2030905077262693,w:.36353601276545233,h:.7315672480770559},{x:.06588254442401961,y:.17130247541347612,w:.9341174555759804,h:.8286975245865239},{x:.6650979434742648,y:.28609266133761035,w:.33490205652573524,h:.7139073386623896}];
  try{for(const crop of crops){const result=await decode(source,true,crop),size=dimensions(Buffer.from(result.data,'base64'));assert.ok(size.width>0&&size.height>0);assert.equal(size.width,Math.round((crop.x+crop.w)*40)-Math.round(crop.x*40));}assert.equal(worker.stats.starts,1);}
  finally{worker.close();}
});
test('V5 a real decoder failure retains its cause without CLIXML and does not start another job',{skip:process.platform!=='win32'},async()=>{
  const worker=imageDecoderPool({workers:1});let calls=0;const decode=createImageDecoder({convert:payload=>{calls++;return worker(payload);}}),source=bmp(40,50,{truncated:true});
  try{let message;await assert.rejects(decode(source,true),error=>{message=error.message;return /Thumbnail conversion unavailable/.test(message)&&/FromStream|valid|Parameter|Exception/.test(message)&&!message.includes('CLIXML');});await assert.rejects(decode(source,true),error=>error.message===message);assert.equal(calls,1);assert.equal(worker.stats.starts,1);}
  finally{worker.close();}
});
