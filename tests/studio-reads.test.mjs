import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStudioReads,lazyScreen} from '../app/public/studio-reads.js';
test('studio reads coalesce, expire, isolate mutable values and discard old cache entries across writes',async()=>{
  let time=0,calls=0,release;const cache=createStudioReads({clock:()=>time,read:async()=>{calls++;return {characters:[]};}});const [a,b]=await Promise.all([cache.get('/api/state'),cache.get('/api/state')]);a.characters.push('local mutation');assert.deepEqual(b.characters,[]);assert.equal(calls,1);await cache.get('/api/state');assert.equal(calls,1);cache.invalidate();await cache.get('/api/state');assert.equal(calls,2);time=30001;await cache.get('/api/state');assert.equal(calls,3);
  let reads=0;const late=createStudioReads({read:()=>++reads===1?new Promise(resolve=>{release=resolve;}):Promise.resolve({version:2})});const old=late.get('/api/state');await new Promise(setImmediate);late.invalidate();assert.equal((await late.get('/api/state')).version,2);release({version:1});await old;assert.equal((await late.get('/api/state')).version,2);assert.equal(reads,2);
});
test('rare screens load once when used, retry failed imports and never load for cleanup',async()=>{
  let loads=0,leaves=0;const screen=lazyScreen(async()=>{loads++;return {render:async value=>value,leave:()=>leaves++};});screen.leave();assert.equal(loads,0);assert.deepEqual(await Promise.all([screen.render('a'),screen.render('b')]),['a','b']);assert.equal(loads,1);screen.leave();assert.equal(leaves,1);
});

test('leaving during a deferred import cannot render an obsolete screen; failed imports can be retried',async()=>{
 let release,renders=0;const screen=lazyScreen(()=>new Promise(resolve=>{release=resolve;}));const old=screen.render();await new Promise(setImmediate);screen.leave();release({render:()=>renders++});await old;assert.equal(renders,0);await screen.render();assert.equal(renders,1);
 let tries=0;const retry=lazyScreen(async()=>{if(++tries===1)throw Error('offline');return {render:()=>42};});await assert.rejects(retry.render(),/offline/);assert.equal(await retry.render(),42);assert.equal(tries,2);
});
