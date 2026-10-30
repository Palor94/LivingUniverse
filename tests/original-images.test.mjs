import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {PassThrough} from 'node:stream';
import http from 'node:http';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createDispatcher,createGateway} from '../mcp/http-gateway.mjs';
import {serve} from '../mcp/server.mjs';
import {thumbnail,referenceImage,dimensions,MAX_REFERENCE_BYTES,MAX_SOURCE_BYTES} from '../mcp/images.mjs';
import {MAX_INLINE_IMAGE_BYTES,MAX_MCP_RESPONSE_BYTES,IMAGE_READ_CHUNK_BYTES,digest} from '../mcp/original-images.mjs';

function crc(bytes){let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0;}
function box(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function png(w,h){const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;const pixels=randomBytes((w*4+1)*h);for(let y=0;y<h;y++)pixels[y*(w*4+1)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),box('IHDR',header),box('IDAT',deflateSync(pixels,{level:0})),box('IEND',Buffer.alloc(0))]);}
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-originals-')),root=path.join(dir,'media'),dataDir=path.join(dir,'data');await fs.mkdir(root);
 const mobile={enabled:true,origin:'https://fixture.example.ts.net',login:'fixture@example.test'};
 const app=await createApp({root,dataDir,mobile,mobileAvailability:async()=> 'local'});await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
 const database=path.join(dataDir,'universe.sqlite'),reader=await createCatalogue({database,mediaRoot:root,availability:async()=> 'local'}),cid=randomUUID(),other=randomUUID();
 for(const id of [cid,other])app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(id,'Disposable original-image fixture','2026-10-29');
 async function add(bytes,name){const id=randomUUID();await fs.writeFile(path.join(root,name),bytes);const s=await fs.stat(path.join(root,name));app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(id,name,'','image',s.size,s.mtime.toISOString(),'2026-10-29');return id;}
 return {dir,root,dataDir,app,reader,cid,other,add,mobile,base:'http://127.0.0.1:'+app.mobileServer.address().port,close:async()=>{reader.close();await app.close();assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true});}};
}

test('PNG and JPEG originals survive stdio and OAuth HTTP byte-for-byte, without duplicate widget pixels',async()=>{
 const f=await fixture();let gateway;
 try{
  const bytes=png(1024,1024),mid=await f.add(bytes,'alpha.png'),sha=digest(bytes);assert(bytes.length>3*1024*1024&&bytes.length<MAX_INLINE_IMAGE_BYTES);
  const rev=randomUUID();f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(rev,f.cid,null,'',JSON.stringify([{media_id:mid,role:'face',sha256:sha}]),'Fixture approval','2026-10-29');
  const before=f.app.db.prepare('SELECT * FROM canon').all();
  const request={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_approved_references',arguments:{character_id:f.cid,media_id:mid,include_image:true,image_quality:'original'}}};
  const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);
  const running=serve({catalogue:f.reader,input,output});input.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n'+JSON.stringify(request)+'\n');await running;
  const response=JSON.parse(wire.trim().split('\n')[1]);assert.equal(response.result.isError,false);assert.deepEqual(Buffer.from(response.result.content[1].data,'base64'),bytes);assert.equal(response.result.content[1].mimeType,'image/png');assert.equal(response.result._meta.referencePreview.data,undefined);assert(wire.length<MAX_MCP_RESPONSE_BYTES);assert(wire.length>2*1024*1024);
  assert.deepEqual(response.result.structuredContent.image_info,{representation:'original',mime_type:'image/png',width:1024,height:1024,size_bytes:bytes.length,sha256:sha,delivery:'inline',approved_original_fingerprint_verified:true});
  const config={public_origin:'https://gateway.example',private_origin:f.mobile.origin,control_token:randomBytes(32).toString('hex'),state_file:path.join(f.dir,'oauth.json')};
  const dispatcher=createDispatcher({catalogue:f.reader});gateway=createGateway({config,dispatch:dispatcher});await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r));
  // A genuine OAuth-issued token; full private browser approval is covered by
  // grok-gateway.test. This independently tests large authenticated HTTP output.
  const auth=gateway.authorization,client=auth.register({redirect_uris:['https://grok.com/original-test']});const verifier=randomBytes(32).toString('base64url');
  const {createHash}=await import('node:crypto');const challenge=createHash('sha256').update(verifier).digest('base64url');
  const begun=auth.authorize({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'fixture-original-state'}),id=begun.location.split('/').at(-1);auth.decide(id,'approve',f.mobile.login);const back=auth.continueFlow(id,begun.cookie.split(';')[0]);const code=new URL(back.location).searchParams.get('code');const token=auth.token({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code_verifier:verifier,code});
  const base='http://127.0.0.1:'+gateway.server.address().port;
  assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).status,401);
  const raw=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.access_token},body:JSON.stringify(request)});assert.equal(raw.status,200);const http=await raw.json();assert.deepEqual(Buffer.from(http.result.content[1].data,'base64'),bytes);assert.equal(http.result.structuredContent.image_info.sha256,sha);
  const jpeg=Buffer.from((await thumbnail(bytes)).data,'base64'),jid=await f.add(jpeg,'photo.jpeg');const result=await f.reader.call('get_media',{media_id:jid,include_image:true,image_quality:'original'});assert.equal(result.image.mimeType,'image/jpeg');assert.deepEqual(Buffer.from(result.image.data,'base64'),jpeg);
  assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),before);assert.deepEqual(await fs.readFile(path.join(f.root,'alpha.png')),bytes);
 }finally{if(gateway)await new Promise(r=>{gateway.server.close(r);gateway.server.closeAllConnections();});await f.close();}
});

test('large original uses resumable verified read chunks; changed, hidden, invalid and nonapproved data refused',async()=>{
 const f=await fixture();try{
  const bytes=png(1400,1200),mid=await f.add(bytes,'large.png'),sha=digest(bytes);assert(bytes.length>MAX_INLINE_IMAGE_BYTES);
  const rev=randomUUID();f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(rev,f.cid,null,'',JSON.stringify([{media_id:mid,role:'body',sha256:sha}]),'Fixture approval','2026-10-29');
  const original=await f.reader.call('get_approved_references',{character_id:f.cid,media_id:mid,include_image:true,image_quality:'original'});assert.equal(original.image,undefined);assert.equal(original.data.image_info.delivery,'chunks_required');const transfer=original.data.image_info.transfer;assert.equal(transfer.revision_id,rev);
  const parts=[];let offset=0,first;
  while(offset!==null){const {data}=await f.reader.call('get_media_image_chunk',{media_id:mid,character_id:f.cid,revision_id:rev,expected_sha256:sha,offset});const part=Buffer.from(data.data_base64,'base64');assert.equal(part.length,data.chunk_bytes);assert.equal(digest(part),data.chunk_sha256);assert.equal(data.approved_original_fingerprint_verified,true);assert(part.length<=IMAGE_READ_CHUNK_BYTES);parts.push(part);if(offset===0)first=data;offset=data.next_offset;}
  assert.deepEqual(Buffer.concat(parts),bytes);assert.equal(digest(Buffer.concat(parts)),sha);assert.deepEqual((await f.reader.call('get_media_image_chunk',{media_id:mid,expected_sha256:sha,offset:0})).data.data_base64,first.data_base64);
  for(const args of [{offset:-1},{offset:bytes.length},{offset:0,expected_sha256:'bad'},{offset:0,revision_id:rev},{offset:0,path:'private.png'}])await assert.rejects(f.reader.call('get_media_image_chunk',{media_id:mid,expected_sha256:sha,...args}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(f.reader.call('get_media_image_chunk',{media_id:mid,expected_sha256:sha,offset:0,character_id:f.other}),{code:'NOT_APPROVED'});
  await assert.rejects(f.reader.call('get_media_image_chunk',{media_id:mid,expected_sha256:'0'.repeat(64),offset:0}),{code:'MEDIA_CHANGED'});
  await fs.writeFile(path.join(f.root,'large.png'),png(4,4));await assert.rejects(f.reader.call('get_media_image_chunk',{media_id:mid,expected_sha256:sha,offset:IMAGE_READ_CHUNK_BYTES}),{code:'MEDIA_CHANGED'});await assert.rejects(f.reader.call('get_approved_references',{character_id:f.cid,media_id:mid,include_image:true,image_quality:'original'}),{code:'CANON_MISMATCH'});
  const invalid=await f.add(bytes.subarray(0,33),'broken.png');await assert.rejects(f.reader.call('get_media',{media_id:invalid,include_image:true,image_quality:'original'}),{code:'IMAGE_UNAVAILABLE'});
  const huge=await f.add(Buffer.alloc(0),'too-large.png');await fs.truncate(path.join(f.root,'too-large.png'),MAX_SOURCE_BYTES+1);await assert.rejects(f.reader.call('get_media',{media_id:huge,include_image:true,image_quality:'original'}),{code:'SOURCE_TOO_LARGE'});
  const hidden=await f.add(png(2,2),'hidden.png');f.app.db.prepare('INSERT INTO media_hidden(media_id,original_path,physical,created_at) VALUES(?,?,?,?)').run(hidden,'hidden.png',0,'2026-10-29');await assert.rejects(f.reader.call('get_media_image_chunk',{media_id:hidden,expected_sha256:sha,offset:0}),{code:'NOT_FOUND'});
 }finally{await f.close();}
});

test('private image downloads deliver full originals with exact MIME and require the existing identity',async()=>{
 const f=await fixture();try{
  const bytes=png(1300,1300),mid=await f.add(bytes,'download.png'),sha=digest(bytes);assert(bytes.length>MAX_INLINE_IMAGE_BYTES);const revision=randomUUID();f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,f.cid,null,'',JSON.stringify([{media_id:mid,role:'general',sha256:sha}]),'Fixture','2026-10-29');
  const headers={'Tailscale-User-Login':f.mobile.login};
  for(const route of ['/media-original/'+mid,'/approved-preview/'+f.cid+'/'+mid]){
   assert.equal((await fetch(f.base+route)).status,403);
   assert.equal((await fetch(f.base+route,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
   assert.equal((await fetch(f.base+route,{headers:{...headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
   // Node fetch replaces Sec-Fetch-Mode with cors; use HTTP to simulate the
   // real browser's navigation headers without pretending a fetch is navigation.
   const response=await new Promise((resolve,reject)=>{const req=http.get(f.base+route,{headers:{...headers,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));});req.on('error',reject);});assert.equal(response.status,200);assert.equal(response.headers['content-type'],'image/png');assert.equal(response.headers['x-content-sha256'],sha);assert.equal(response.headers['cache-control'],'no-store');assert.deepEqual(response.bytes,bytes);
  }
  assert.equal((await fetch(f.base+'/approved-preview/'+f.other+'/'+mid,{headers})).status,409);
 }finally{await f.close();}
});

test('default selected reference preserves detail within 2048 px, keeps originals and normalizes orientation',async()=>{
 const f=await fixture();try{
  const bytes=png(2560,1600),mid=await f.add(bytes,'detailed.png'),sha=digest(bytes),rev=randomUUID();
  f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(rev,f.cid,null,'',JSON.stringify([{media_id:mid,role:'face',sha256:sha}]),'Fixture approval','2026-10-29');
  const metadata=await f.reader.call('get_media',{media_id:mid});assert.equal(metadata.image,undefined);assert.equal(metadata.data.image_info,undefined);
  const dispatch=createDispatcher({catalogue:f.reader});
  const wire=await dispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_approved_references',arguments:{character_id:f.cid,media_id:mid,include_image:true}}});
  assert.equal(wire.result.isError,false);const info=wire.result.structuredContent.image_info,derived=Buffer.from(wire.result.content[1].data,'base64');
  assert.equal(info.representation,'reference');assert.equal(info.delivery,'inline');assert.equal(info.width,2048);assert.equal(info.height,1280);assert.equal(info.mime_type,'image/jpeg');assert(derived.length<=MAX_REFERENCE_BYTES);assert.equal(digest(derived),info.sha256);assert.equal(info.source.sha256,sha);assert.equal(info.source.width,2560);assert.equal(info.approved_original_fingerprint_verified,true);assert.equal(wire.result._meta.referencePreview.representation,'reference');assert.equal(wire.result._meta.referencePreview.data,undefined);
  const retry=await f.reader.call('get_media',{media_id:mid,include_image:true});assert.deepEqual(Buffer.from(retry.image.data,'base64'),derived);
  const exact=await f.reader.call('get_media',{media_id:mid,include_image:true,image_quality:'original'});assert.equal(exact.data.image_info.delivery,'chunks_required');assert.equal(exact.data.image_info.sha256,sha);
  const small=png(64,64),sid=await f.add(small,'small.png');const smallRead=await f.reader.call('get_media',{media_id:sid,include_image:true});assert.deepEqual(Buffer.from(smallRead.image.data,'base64'),small);assert.equal(smallRead.data.image_info.representation,'original');
  // A synthetic EXIF orientation=6 JPEG must remain upright after derivation.
  const exif=Buffer.alloc(32);exif.write('Exif\0\0',0,'ascii');exif.write('II',6);exif.writeUInt16LE(42,8);exif.writeUInt32LE(8,10);exif.writeUInt16LE(1,14);exif.writeUInt16LE(274,16);exif.writeUInt16LE(3,18);exif.writeUInt32LE(1,20);exif.writeUInt16LE(6,24);
  const segment=Buffer.from([255,225,0,34]);const rotatedInput=Buffer.concat([derived.subarray(0,2),segment,exif,derived.subarray(2)]);
  const rotated=await referenceImage(rotatedInput);assert.deepEqual(dimensions(Buffer.from(rotated.data,'base64')),{width:1280,height:2048});
  await assert.rejects(f.reader.call('get_media',{media_id:mid,include_image:true,image_quality:'tiny'}),{code:'INVALID_ARGUMENT'});
  assert.deepEqual(await fs.readFile(path.join(f.root,'detailed.png')),bytes);assert.equal(f.app.db.prepare('SELECT references_json FROM canon WHERE id=?').get(rev).references_json,JSON.stringify([{media_id:mid,role:'face',sha256:sha}]));
 }finally{await f.close();}
});
