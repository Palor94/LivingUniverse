import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {keyBackground} from '../app/public/sprite-cutout-pixels.js';

function frame(w,h,color){const data=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++)data.set([...color,255],p*4);return {data};}
function rect(f,w,x,y,width,height,color){for(let row=y;row<y+height;row++)for(let col=x;col<x+width;col++)f.data.set([...color,255],(row*w+col)*4);}
const alpha=(f,w,x,y)=>f.data[(y*w+x)*4+3];
test('B9 worker pixel method preserves an enclosed white garment and clears only border-connected white',()=>{
  const f=frame(20,30,[255,255,255]);rect(f,20,4,4,12,22,[0,0,0]);rect(f,20,7,8,6,10,[255,255,255]);
  const bounds=keyBackground(f,20,30);assert.equal(alpha(f,20,0,0),0);assert.equal(alpha(f,20,4,4),255);assert.equal(alpha(f,20,8,10),255);
  assert.ok(bounds.width<20&&bounds.height<30);
});
test('B9 chroma key clears large enclosed green pockets, retains small details and transparent borders',()=>{
  const f=frame(40,50,[0,255,0]);rect(f,40,5,5,30,40,[20,20,20]);rect(f,40,10,10,10,10,[0,255,0]);rect(f,40,25,15,1,1,[0,255,0]);
  keyBackground(f,40,50);assert.equal(alpha(f,40,0,0),0);assert.equal(alpha(f,40,12,12),0);assert.equal(alpha(f,40,25,15),255);assert.equal(alpha(f,40,5,5),255);
  const transparent=frame(10,20,[200,100,100]);for(const [x,y] of [[0,0],[9,0],[0,19],[9,19]])transparent.data[(y*10+x)*4+3]=0;
  const before=transparent.data.slice();keyBackground(transparent,10,20);assert.deepEqual(transparent.data,before);
});
test('B9 concurrent cutout consumers share one worker job and worker failure falls back without main-thread pixels',async()=>{
  const source=readFileSync(new URL('../app/public/sprite-cutout.js',import.meta.url),'utf8').replace('export function cutout','function cutout').replace('import.meta.url',"'http://local/sprite-cutout.js'");
  const jobs=[];let worker;
  const ctx={URL,Response,setTimeout,clearTimeout,Worker:class{constructor(){worker=this;}postMessage(job){jobs.push(job);}terminate(){}},FileReader:class{readAsDataURL(blob){this.result='data:'+blob.type+';base64,fixture';this.onload();}}};
  vm.createContext(ctx);vm.runInContext(source+';this.cutout=cutout;',ctx);
  const a=ctx.cutout('/api/sprites/fixture?v=one'),b=ctx.cutout('/api/sprites/fixture?v=one');assert.equal(a,b);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(jobs.length,1);
  worker.onmessage({data:{id:jobs[0].id,blob:new Blob(['fixture'],{type:'image/webp'})}});assert.match(await a,/^data:image\/webp/);
  const failed=ctx.cutout('/api/sprites/other?v=two');await new Promise(resolve=>setImmediate(resolve));worker.onerror();assert.equal(await failed,'/api/sprites/other?v=two');
  assert.equal(await ctx.cutout('/api/sprites/third'),'/api/sprites/third');assert.equal(jobs.length,2);
});
