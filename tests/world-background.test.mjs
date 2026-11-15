import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salvageEvents,gmPrompt,agentPrompt,GM_TOKENS} from '../app/world-prompts.mjs';
import {mapLimit} from '../app/world-engine.mjs';

test('a cut game-master answer keeps its complete events (2026-11-13)',()=>{
  const full=JSON.stringify({events:[{title:'Egy',summary:'Valami "idézettel" és {kapcsossal}.',character_ids:['a']},{title:'Kettő',summary:'Más.',character_ids:['b'],memories:[{character_id:'b',text:'x'}]}]});
  const cut=full.slice(0,full.length-1)+',{"title":"Három","summary":"félbe';
  assert.deepEqual(salvageEvents(cut).map(e=>e.title),['Egy','Kettő']);
  assert.deepEqual(salvageEvents('nem json'),[]);
  assert.equal(salvageEvents('{"events":[{"title":"fél').length,0);
  assert.equal(gmPrompt({when:'',slotLabel:'',pacing:'',today:[],knownList:[],intentions:[],cast:[],levels:[],extras:[],places:[],recent:[]}).maxTokens,GM_TOKENS);
  assert.ok(GM_TOKENS>=3000);
});

test('character turns share the start of their prompt (cache) and name the character at the end',()=>{
  const base={when:'',profile:'',places:[],relations:[],known:new Map(),memories:[]};
  const a=agentPrompt({...base,name:'Aladár'}).system,b=agentPrompt({...base,name:'Béla'}).system;
  const common=[...a].findIndex((ch,i)=>ch!==b[i]);
  assert.ok(common>400,'a long identical prefix');assert.match(a,/Te most Aladár vagy\./);
});

test('mapLimit: at most N at once, order kept, no new work after a failure',async()=>{
  let running=0,peak=0;const done=[];
  const out=await mapLimit([1,2,3,4,5,6,7,8,9,10],3,async x=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,5));running--;done.push(x);return x*2;});
  assert.equal(peak,3);assert.deepEqual(out,[2,4,6,8,10,12,14,16,18,20]);
  const started=[];
  await assert.rejects(mapLimit([1,2,3,4,5,6,7,8],2,async x=>{started.push(x);await new Promise(r=>setTimeout(r,2));if(x===2)throw Error('boom');return x;}),/boom/);
  await new Promise(r=>setTimeout(r,30));
  assert.ok(started.length<8,'items after the failure are not started ('+started.length+')');
});
