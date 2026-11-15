import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installThumbnails,powershellConverter} from '../app/thumbnails.mjs';

// A synthetic 24-bit BMP (no real media): big enough to be worth a preview.
function bmp(w,h){
  const row=Math.ceil(w*3/4)*4,size=54+row*h,b=Buffer.alloc(size);
  b.write('BM');b.writeUInt32LE(size,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(row*h,34);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=54+y*row+x*3;b[o]=x%256;b[o+1]=y%256;b[o+2]=128;}
  return b;
}
function fakeRes(){const r={status:0,headers:{},body:null,writeHead(s,h){r.status=s;r.headers=h||{};},end(d){r.body=d;}};return r;}

async function fixture(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-thumb-')),root=path.join(temp,'media');await fs.mkdir(root);
  const media={big:{id:'big',kind:'image',relative_path:'big.bmp'},small:{id:'small',kind:'image',relative_path:'small.bmp'},clip:{id:'clip',kind:'video',relative_path:'clip.mp4'},bad:{id:'bad',kind:'image',relative_path:'bad.jpg'}};
  await fs.writeFile(path.join(root,'big.bmp'),bmp(400,300));await fs.writeFile(path.join(root,'small.bmp'),bmp(20,20));await fs.writeFile(path.join(root,'clip.mp4'),'synthetic');await fs.writeFile(path.join(root,'bad.jpg'),Buffer.alloc(200*1024,7));
  const asset=id=>{const m=media[id];if(!m)throw Object.assign(Error('Media not found'),{status:404});return m;};
  const safeFile=async m=>path.join(root,m.relative_path);
  return {temp,root,asset,safeFile};
}

test('previews: made once per width, cached outside the media folder, originals untouched; videos, small and unreadable pictures fall back to the original',async()=>{
  const f=await fixture(),calls=[];
  const convert=async(src,dst,edge)=>{calls.push({src,edge});if(src.endsWith('bad.jpg'))throw Error('cannot read');await fs.writeFile(dst,'jpeg-'+edge);};
  const thumbs=installThumbnails({dataDir:path.join(f.temp,'data'),asset:f.asset,safeFile:f.safeFile,convert});
  const before=await fs.readFile(path.join(f.root,'big.bmp'));
  const get=async(url,headers={})=>{const res=fakeRes();const handled=await thumbs.handle({p:url.split('?')[0],req:{method:'GET',url,headers},res});return {handled,res};};
  // Two parallel requests for the same preview share one conversion.
  const [a,b]=await Promise.all([get('/thumb/big?w=300'),get('/thumb/big?w=320')]);
  assert.equal(a.res.status,200);assert.equal(String(a.res.body),'jpeg-320');assert.equal(String(b.res.body),'jpeg-320');assert.equal(calls.length,1,'one conversion for one width');
  assert.match(a.res.headers['Cache-Control'],/max-age/);
  const again=await get('/thumb/big?w=320',{'if-none-match':a.res.headers.ETag});assert.equal(again.res.status,304);assert.equal(calls.length,1);
  const large=await get('/thumb/big?w=5000');assert.equal(String(large.res.body),'jpeg-1600','unknown widths round up to the next size, capped');
  for(const id of ['small','clip','bad']){const r=await get('/thumb/'+id);assert.equal(r.res.status,307,id);assert.equal(r.res.headers.Location,'/media/'+id);}
  const badCalls=calls.filter(c=>c.src.endsWith('bad.jpg')).length;await get('/thumb/bad');assert.equal(calls.filter(c=>c.src.endsWith('bad.jpg')).length,badCalls,'a failed picture is not retried in a loop');
  assert.equal((await get('/media/big')).handled,false,'other routes pass through');
  await assert.rejects(get('/thumb/missing'),/Media not found/);
  assert.deepEqual(await fs.readFile(path.join(f.root,'big.bmp')),before,'the original is never changed');
  assert.deepEqual((await fs.readdir(f.root)).sort(),['bad.jpg','big.bmp','clip.mp4','small.bmp'],'nothing is written next to the originals');
  // An edited original (new size) gets a new preview.
  await fs.writeFile(path.join(f.root,'big.bmp'),bmp(500,300));const edited=await get('/thumb/big?w=320');assert.notEqual(edited.res.headers.ETag,a.res.headers.ETag);assert.equal(calls.filter(c=>c.src.endsWith('big.bmp')).length,3);
  await fs.rm(f.temp,{recursive:true,force:true});
});

test('previews: the Windows worker converts a real picture, also with accents in the path',{skip:process.platform!=='win32'},async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-thumb-real-')),src=path.join(temp,'Ünnepi kép ő.bmp'),dst=path.join(temp,'out.jpg');
  await fs.writeFile(src,bmp(900,600));const convert=powershellConverter({workers:1});
  try{
    await convert(src,dst,320);const out=await fs.readFile(dst);assert.equal(out[0],0xff);assert.equal(out[1],0xd8);assert.ok(out.length<60_000);
    await assert.rejects(convert(path.join(temp,'none.bmp'),path.join(temp,'none.jpg'),320));
    await convert(src,path.join(temp,'second.jpg'),640);assert.ok((await fs.stat(path.join(temp,'second.jpg'))).size>0,'the worker keeps going after a failed picture');
  }finally{convert.close();await fs.rm(temp,{recursive:true,force:true});}
});
