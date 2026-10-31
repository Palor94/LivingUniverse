import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createApp} from '../app/server.mjs';
import {imageInfo} from '../app/image-crops.mjs';
import {moveCrop,pixelCrop} from '../app/public/crop-selection.js';
function png(w,h){const crc=b=>{let v=-1;for(const n of b){v^=n;for(let i=0;i<8;i++)v=(v>>>1)^(v&1?0xedb88320:0);}return (v^-1)>>>0;};const chunk=(type,b)=>{const data=Buffer.concat([Buffer.from(type),b]),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(b.length);sum.writeUInt32BE(crc(data));return Buffer.concat([size,data,sum]);};const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;const pixels=Buffer.alloc(h*(1+w*3));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*(1+w*3)+1+x*3;pixels[p]=x*7;pixels[p+1]=y*9;pixels[p+2]=80;}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
const digest=b=>createHash('sha256').update(b).digest('hex');
test('crop sides resize independently, corners remain free, movement is bounded and source pixels are exact',()=>{
 const c={x:.2,y:.25,w:.5,h:.5},west=moveCrop(c,'w',.1,.2);assert.ok(Math.abs(west.x-.3)<1e-10);assert.ok(Math.abs(west.w-.4)<1e-10);assert.equal(west.y,c.y);assert.equal(west.h,c.h);
 const east=moveCrop(c,'e',.1,.3);assert.equal(east.x,c.x);assert.equal(east.y,c.y);assert.equal(east.h,c.h);assert.ok(Math.abs(east.w-.6)<1e-10);
 const top=moveCrop(c,'n',.3,.1);assert.equal(top.x,c.x);assert.equal(top.w,c.w);assert.ok(Math.abs(top.y-.35)<1e-10);assert.ok(Math.abs(top.h-.4)<1e-10);
 const bottom=moveCrop(c,'s',.3,-.1);assert.equal(bottom.x,c.x);assert.equal(bottom.y,c.y);assert.equal(bottom.w,c.w);assert.ok(Math.abs(bottom.h-.4)<1e-10);
 const corner=moveCrop(c,'se',.1,-.1);assert.ok(Math.abs(corner.w-.6)<1e-10);assert.ok(Math.abs(corner.h-.4)<1e-10);
 assert.deepEqual(moveCrop(c,'move',1,-1),{...c,x:.5,y:0});assert.ok(moveCrop(c,'w',1,0).w>=.009999);assert.deepEqual(pixelCrop(1000,800,c),{x:200,y:200,w:500,h:400});assert.deepEqual(imageInfo(png(32,24)),{width:32,height:24,format:'png',animated:false});assert.throws(()=>imageInfo(Buffer.from('<svg/>')));
});
test('replacing and restoring a crop retains identity, assignments, sorting, notes and original bytes; stale and canon edits fail',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-crops-')),root=path.join(temp,'pictures'),dataDir=path.join(temp,'data');await fs.mkdir(root);const original=png(32,24),cropped=png(16,12);await fs.writeFile(path.join(root,'test.png'),original);await fs.writeFile(path.join(root,'reference.png'),original);let app,base;
 async function start(){app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
 const request=(route,body,method)=>fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});async function call(...args){const r=await request(...args),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
 await start();try{
  await call('/api/scan',{});const items=(await call('/api/media')).items,m=items.find(m=>m.relative_path==='test.png'),ref=items.find(x=>x.id!==m.id),cid=(await call('/api/characters',{name:'Árvíztűrő'})).id;
  await call('/api/media/'+m.id,{character_ids:[cid],tags:'keep tag',notes:'Preserve notes',categorization_complete:true},'PUT');await call('/api/media/'+ref.id,{character_ids:[cid]},'PUT');await approveCanon(call,cid,{appearance:'Unchanged identity',references:[{media_id:ref.id,role:'face'}]});const before=await call('/api/export');
  const info=await call('/api/media/'+m.id+'/image-crop'),payload={edit_id:randomUUID(),source_sha256:info.source_sha256,crop:{x:.25,y:.25,w:.5,h:.5},image_data:'data:image/png;base64,'+cropped.toString('base64')};
  assert.equal((await request('/api/media/not-an-id/image-crop')).status,400);assert.equal((await request('/api/media/'+m.id+'/image-crop',{...payload,image_data:'data:image/svg+xml;base64,PHN2Zy8+'})).status,400);
  assert.equal((await request('/api/media/'+m.id+'/image-crop',{...payload,crop:{x:.9,y:0,w:.5,h:.5}})).status,400);assert.equal((await request('/api/media/'+m.id+'/image-crop',{...payload,source_sha256:'0'.repeat(64)})).status,409);assert.equal((await request('/api/media/'+ref.id+'/image-crop',payload)).status,409);
  const first=await fetch(base+'/media/'+m.id),etag=first.headers.get('etag');assert.equal((await fetch(base+'/media/'+m.id,{headers:{'If-None-Match':etag}})).status,304);
  const saved=await call('/api/media/'+m.id+'/image-crop',payload);assert.equal(saved.status,'applied');assert.deepEqual(await fs.readFile(path.join(root,'test.png')),cropped);assert.deepEqual(await fs.readFile(path.join(dataDir,'image-originals',payload.edit_id+'.original')),original);assert.equal((await call('/api/media/'+m.id+'/image-crop',payload)).edit_id,saved.edit_id);assert.equal((await fetch(base+'/media/'+m.id,{headers:{'If-None-Match':etag}})).status,200);
  await call('/api/scan',{});const after=await call('/api/export');for(const table of ['characters','depictions','media_notes','reviews','canon','media_categorization'])assert.deepEqual(after[table],before[table],table);assert.equal(after.media.length,before.media.length);assert.equal(after.media_image_edits.length,1);assert.equal((await call('/api/media/'+m.id)).relative_path,m.relative_path);
  await app.close();await start();const current=await call('/api/media/'+m.id+'/image-crop');assert.equal(current.latest_edit.id,payload.edit_id);assert.equal(current.source_sha256,digest(cropped));
  await fs.writeFile(path.join(dataDir,'image-originals',payload.edit_id+'.original'),'tampered');assert.equal((await request('/api/media/'+m.id+'/image-crop/restore',{edit_id:payload.edit_id,source_sha256:current.source_sha256})).status,409);assert.deepEqual(await fs.readFile(path.join(root,'test.png')),cropped);await fs.writeFile(path.join(dataDir,'image-originals',payload.edit_id+'.original'),original);
  await call('/api/media/'+m.id+'/image-crop/restore',{edit_id:payload.edit_id,source_sha256:current.source_sha256});assert.deepEqual(await fs.readFile(path.join(root,'test.png')),original);assert.equal((await call('/api/media/'+m.id+'/image-crop')).latest_edit,null);
  await approveCanon(call,cid,{appearance:'Unchanged identity',references:[]});assert.equal((await request('/api/media/'+ref.id+'/image-crop',payload)).status,409);
  const originalPath=path.join(root,'test.png');await fs.unlink(originalPath);assert.equal((await request('/api/media/'+m.id+'/image-crop')).status,404);await fs.writeFile(originalPath,original);
  const outside=path.join(temp,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.png'),original);await fs.symlink(outside,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');const escaped=randomUUID();app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(escaped,path.join('escape','secret.png'),'escape','image',original.length,new Date().toISOString(),new Date().toISOString());assert.equal((await request('/api/media/'+escaped+'/image-crop')).status,403);
 }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
