import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProfileAutosave} from '../app/public/profile-autosave.js';
import {compactCharacterSubtitle,matchesReadiness,sortReadyCharacters} from '../app/public/character-readiness.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('A15 autosave serializes writes and flush includes text typed while the previous write was pending',async()=>{
  let current='first',saved='',concurrent=0,maxConcurrent=0;const calls=[],resolvers=[];
  const auto=createProfileAutosave({delay:10000,snapshot:()=>current===saved?null:{text:current},write:body=>{calls.push(body);maxConcurrent=Math.max(maxConcurrent,++concurrent);return new Promise(resolve=>resolvers.push(()=>{concurrent--;resolve();}));},onSaved:(result,body)=>{saved=body.text;}});
  const flushing=auto.flush();await tick();assert.equal(calls.length,1);current='second';auto.schedule();const secondFlush=auto.flush();resolvers.shift()();await tick();assert.equal(calls.length,2);assert.equal(calls[1].text,'second');resolvers.shift()();await Promise.all([flushing,secondFlush]);
  assert.equal(saved,'second');assert.equal(maxConcurrent,1);auto.stop();
});
test('A15 unconfirmed write blocks automatic retry, retains a draft and resumes only after explicit reconciliation',async()=>{
  let calls=0,current='draft',saved='',fail=true;const auto=createProfileAutosave({delay:1,snapshot:()=>current===saved?null:{text:current},write:async()=>{calls++;if(fail)throw Error('synthetic lost response');},onSaved:(result,body)=>{saved=body.text;}});
  await assert.rejects(auto.flush(),/lost response/);auto.schedule();await new Promise(resolve=>setTimeout(resolve,5));await assert.rejects(auto.flush(),/lost response/);assert.equal(calls,1);assert.equal(current,'draft');
  fail=false;auto.resume();await auto.flush();assert.equal(calls,2);assert.equal(saved,'draft');auto.stop();
});
test('V6/B2 compact subtitle, readiness filters and sorts preserve unknown metadata and original card objects',()=>{
  assert.equal(compactCharacterSubtitle('András; Bandi. A barátai ezt használják; Bandó (csak barátok); Negyedik','Tanár; későbbi megjegyzés.'),'András · Bandi · Bandó — Tanár');
  assert.equal(compactCharacterSubtitle('', ''),'');assert.equal(matchesReadiness(undefined,'empty'),false);
  const characters=[{id:'a',name:'Teszt Ádám'},{id:'b',name:'Teszt Béla'},{id:'c',name:'Teszt Csaba'}],status=new Map([['a',{profile_filled:0,profile_percent:0,figures:0,has_routine:false,has_home:false,knows_palor:false}],['b',{profile_filled:4,profile_percent:80,figures:3,has_routine:true,has_home:true,knows_palor:true}]]);
  assert.equal(matchesReadiness(status.get('a'),'empty'),true);assert.equal(matchesReadiness(status.get('b'),'known'),true);
  assert.deepEqual(sortReadyCharacters(characters,status,'profile-desc').map(c=>c.id),['b','a','c']);assert.deepEqual(sortReadyCharacters(characters,status,'missing').map(c=>c.id),['a','b','c']);assert.equal(characters[0].id,'a');
});
