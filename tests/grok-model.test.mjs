import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider,createXaiProvider,TEXT_MODELS,DEFAULT_MODEL} from '../app/world-ai.mjs';

test('the Grok text model can be chosen; prices (and so the daily cap) follow it',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-model-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({}))});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    let s=(await call('/api/world-engine')).data;
    assert.equal(s.settings.model,DEFAULT_MODEL);assert.deepEqual(s.models.map(m=>m.id),Object.keys(TEXT_MODELS));
    assert.equal((await call('/api/world-engine/settings',{model:'grok-9-imaginary'})).status,400);
    await call('/api/world-engine/settings',{model:'grok-4.7'});
    s=(await call('/api/world-engine')).data;assert.equal(s.settings.model,'grok-4.7');
    assert.deepEqual(app.worldEngine?.settings?.().prices??TEXT_MODELS['grok-4.7'].prices,TEXT_MODELS['grok-4.7'].prices);
  }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});

test('the xAI provider sends the chosen model id',async()=>{
  let sent;const p=createXaiProvider({key:'test-key-123',model:'grok-4.3',fetchImpl:async(u,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}],usage:{}})};}});
  await p.complete({system:'s',user:'u'});assert.equal(sent.model,'grok-4.3');assert.equal(p.model,'grok-4.3');
});

test('Grok 4.7 uses its supported low reasoning effort in regular and streaming calls',async()=>{
  const sent=[];const p=createXaiProvider({key:'synthetic-key',model:'grok-4.7',fetchImpl:async(u,init)=>{
    const body=JSON.parse(init.body);sent.push(body);
    return body.stream?{ok:true,body:[Buffer.from('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')]}:{ok:true,json:async()=>({choices:[{message:{content:'{}'}}],usage:{}})};
  }});
  await p.complete({system:'s',user:'u'});await p.complete({system:'s',user:'u',onDelta:()=>{}});
  assert.deepEqual(sent.map(x=>x.reasoning_effort),['low','low']);
  assert.ok(sent.every(x=>x.model==='grok-4.7'));
});
