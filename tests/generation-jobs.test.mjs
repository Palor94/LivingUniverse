import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationWatcher} from '../app/public/generation-jobs.js';
test('B20 observes durable jobs across screens, announces each newly completed run once and never sends commands',async()=>{
 let jobs=[{run_id:'old',status:'succeeded',output:{active:true}}],reads=0;const completed=[],updates=[],timers=[];
 const watcher=createGenerationWatcher({read:async()=>{reads++;return {jobs};},onUpdate:values=>updates.push(values),onComplete:job=>completed.push(job.run_id),schedule:(fn,ms)=>{timers.push(ms);return 1;},unschedule(){}});
 await watcher.start();assert.deepEqual(completed,[]);jobs=[...jobs,{run_id:'new',status:'running'}];await watcher.poll();assert.equal(timers.at(-1),3000);
 jobs[1]={run_id:'new',status:'succeeded',output:{active:true}};await watcher.poll();await watcher.poll();assert.deepEqual(completed,['new']);assert.equal(timers.at(-1),30000);assert.equal(updates.length,4);watcher.stop();await watcher.poll();assert.equal(reads,4);
});
test('B20 concurrent status refreshes coalesce and stopped observers ignore late completion',async()=>{
 let finish,reads=0,updates=0;const watcher=createGenerationWatcher({read:()=>{reads++;return new Promise(resolve=>{finish=resolve;});},onUpdate:()=>updates++,schedule:()=>1,unschedule(){}});
 const first=watcher.poll(),second=watcher.poll();assert.equal(reads,1);watcher.stop();finish({jobs:[]});await Promise.all([first,second]);assert.equal(updates,0);
});
