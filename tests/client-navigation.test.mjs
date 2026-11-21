import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {appRouteHash} from '../app/public/app-routes.js';

const source=readFileSync(new URL('../app/public/client.js',import.meta.url),'utf8');
const navigation=source.slice(source.indexOf('let characterListReturn='),source.indexOf('async function render(){'));
function fixture({flush=async()=>{},render=async()=>{}}={}){
  const positions=[];
  const context={view:'characters',query:'szűrt név',activeCharacter:null,folder:'',kind:'image',offset:0,profileTab:'profile',
    extras:{flush},ghostProfile:{flush:async()=>{}},characterGeneration:{cleanup(){}},sorting:{reset(){}},places:{reset(){}},
    cancelUndoWindows(){},appRouteHash,history:{replaceState(){},pushState(){}},location:{pathname:'/',search:'',hash:'',href:'http://fixture/'},render,
    window:{scrollY:1800,scrollTo(position){positions.push({...position});this.scrollY=position.top;}}};
  vm.createContext(context);vm.runInContext(navigation,context);
  return {...context,context,positions,go:(...args)=>context.navigate(...args)};
}

test('V1 opens a profile at the top, restores the filtered list only via its explicit Back action',async()=>{
  const f=fixture();await f.go('profile','synthetic-male');
  assert.equal(f.context.window.scrollY,0);
  assert.equal(f.context.query,'');f.context.window.scrollY=3000;
  await f.go('characters',null,{restoreCharacterList:true});
  assert.equal(f.context.window.scrollY,1800);assert.equal(f.context.query,'szűrt név');
  await f.go('profile','another-male');f.context.window.scrollY=2400;
  await f.go('characters');
  assert.equal(f.context.window.scrollY,0);assert.equal(f.context.query,'');
  assert.match(source,/#back-characters'\)\.onclick=action\(\(\)=>navigate\('characters',null,\{restoreCharacterList:true\}\)\)/);
});

test('V1 resets unrelated destinations, does not restore stale list state after leaving the profile flow',async()=>{
  const f=fixture();await f.go('profile','synthetic-male');
  f.context.window.scrollY=3000;await f.go('location-catalogue');assert.equal(f.context.window.scrollY,0);
  await f.go('profile','different-origin');await f.go('characters',null,{restoreCharacterList:true});
  assert.equal(f.context.window.scrollY,0);assert.equal(f.context.query,'');
  f.context.window.scrollY=900;await f.go('ghost-template');
  await f.go('characters',null,{restoreCharacterList:true});assert.equal(f.context.window.scrollY,900);
});

test('V1 waits for the destination to finish rendering before restoring scroll',async()=>{
  let finish;const f=fixture({render:()=>new Promise(resolve=>{finish=resolve;})});
  const navigating=f.go('profile','synthetic-male');await new Promise(setImmediate);
  assert.equal(f.positions.length,0);finish();await navigating;
  assert.deepEqual(f.positions,[{top:0,left:0,behavior:'instant'}]);
});

test('V1 ignores obsolete navigation completion and never scrolls after a failed render',async()=>{
  let finish,number=0;
  const f=fixture({render:()=>++number===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve()});
  const old=f.go('profile','synthetic-male');await new Promise(setImmediate);
  await f.go('home');f.context.window.scrollY=500;finish();await old;
  assert.equal(f.context.window.scrollY,500);assert.equal(f.positions.length,1);
  const failed=fixture({render:async()=>{throw Error('fixture render failure');}});
  await assert.rejects(failed.go('profile','synthetic-male'),/fixture render failure/);
  assert.equal(failed.positions.length,0);
});
