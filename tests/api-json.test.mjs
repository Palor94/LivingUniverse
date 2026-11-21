import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,appendStatusRetry} from '../app/public/api-json.js';
import {t} from '../app/public/i18n.js';

test('A17 network and malformed JSON responses become Hungarian transport errors without raw bytes',async()=>{
  for(const request of [async()=>{throw TypeError('Failed to fetch');},async()=>new Response('<html>PRIVATE gateway text</html>',{status:502}),async()=>new Response(''),async()=>Response.json(null),async()=>Response.json(7)]){
    await assert.rejects(requestJson('/api/state',{},request),error=>{assert.equal(error.transport,true);assert.equal(error.uncertain,false);assert.match(error.message,/A program/);assert.doesNotMatch(error.message,/Unexpected|Failed|PRIVATE/);return true;});
  }
});
test('A17 ambiguous writes retain uncertainty and are never automatically retried',async()=>{
  for(const method of ['POST','PUT','DELETE']){
    let calls=0;const body=JSON.stringify({request_key:'stable-fixture'});
    await assert.rejects(requestJson('/api/write',{method,body,headers:{'X-Test-CSRF':'token'}},async(_route,options)=>{calls++;assert.equal(options.body,body);assert.equal(options.headers['X-Test-CSRF'],'token');return new Response('broken',{status:409});}),error=>error.status===0&&error.httpStatus===409&&error.uncertain===true&&error.transport===true&&error.message===t('api.writeUncertain'));
    assert.equal(calls,1);
  }
});
test('A17 valid success values and server error status, code, request ID and translation survive',async()=>{
  assert.deepEqual(await requestJson('/api/state',{},async()=>Response.json({ok:true})),{ok:true});
  await assert.rejects(requestJson('/api/write',{},async()=>Response.json({error:'Name required',code:'NAME',request_id:'abcd1234'},{status:500})),error=>{assert.equal(error.status,500);assert.equal(error.code,'NAME');assert.equal(error.requestId,'abcd1234');assert.match(error.message,/#abcd1234/);assert.equal(error.transport,undefined);return true;});
});
test('A17 status-retry control does not run on creation and ignores duplicate clicks while busy',async()=>{
  let button,finish,calls=0;
  const host={ownerDocument:{createElement:()=>({isConnected:true})},append:node=>{button=node;}};
  appendStatusRetry(host,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  assert.equal(button.type,'button');assert.equal(button.textContent,t('api.retry'));assert.equal(calls,0);
  const first=button.onclick();await button.onclick();assert.equal(calls,1);assert.equal(button.disabled,true);finish();await first;assert.equal(button.disabled,false);
});
