import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodedImage,memoizedRead} from '../app/public/play-scene.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('B9 layout/preload reads coalesce, expire, evict and invalidate without caching failures',async()=>{
  let now=0,calls=0,fail=false;
  const read=memoizedRead(async key=>{calls++;if(fail)throw Error('synthetic offline');return key;},{now:()=>now,ttl:10,max:2});
  const first=read('a');assert.equal(read('a'),first);assert.equal(await first,'a');assert.equal(calls,1);
  now=11;await read('a');assert.equal(calls,2);read.invalidate('a');await read('a');assert.equal(calls,3);
  await read('b');await read('c');await read('a');assert.equal(calls,6);
  fail=true;await assert.rejects(read('failed'));fail=false;await read('failed');assert.equal(calls,8);
});

test('A6 image readiness waits for decoding, handles failure and bounds a stalled request',async()=>{
  let finish,settled=false;
  const pending=decodedImage({decode:()=>new Promise(resolve=>{finish=resolve;})},1000).then(value=>{settled=true;return value;});
  await Promise.resolve();assert.equal(settled,false);finish();assert.equal(await pending,true);
  assert.equal(await decodedImage({decode:()=>Promise.reject(Error('synthetic invalid image'))}),false);
  assert.equal(await decodedImage({decode:()=>new Promise(()=>{})},5),false);
});

test('A6 passage display time starts only after image decoding and skipping remains immediate',async()=>{
  const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('  function passageMoment('),source.indexOf('  // Travel times'));
  for(const skip of [false,true]){
    let finish;const scheduled=[],image={remove(){}},el={setAttribute(){},classList:{add(){},remove(){}},querySelector:()=>image,remove(){}};
    const ctx={document:{createElement:()=>el,body:{appendChild(){}},addEventListener(){},removeEventListener(){}},pic:()=>'/fixture.png',esc:s=>s,decodedImage:()=>new Promise(resolve=>{finish=resolve;}),clearTimeout(){},setTimeout:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;}};
    vm.createContext(ctx);vm.runInContext(fn+';this.passage=passageMoment;',ctx);
    const result=ctx.passage([{image_id:'fixture',name:'Teszt út'}],null,1100);
    assert.equal(scheduled.length,0,'no display timer while the image is pending');
    if(skip){el.onclick();assert.equal(scheduled[0].ms,0);}
    finish(true);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(scheduled.some(t=>t.ms===1100),!skip);
    if(!skip)scheduled.find(t=>t.ms===1100).fn();
    scheduled.find(t=>t.ms===0).fn();await result;
  }
});
