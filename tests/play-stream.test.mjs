import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider,createXaiProvider,partialJsonString} from '../app/world-ai.mjs';

test('partialJsonString reads a string field from JSON that is still arriving',()=>{
  assert.equal(partialJsonString('{"rep',"reply"),null);
  assert.equal(partialJsonString('{"reply":"Szia, mi u','reply'),'Szia, mi u');
  assert.equal(partialJsonString('{"reply" : "a\\nb\\"c\\','reply'),'a\nb"c','a half escape waits for the next piece');
  assert.equal(partialJsonString('{"reply":"\\u00e1l','reply'),'ál');
  assert.equal(partialJsonString('{"reply":"\\u00','reply'),'');
  assert.equal(partialJsonString('{"reply":"kész","mood":"alap"}','reply'),'kész');
});

const sse=events=>({ok:true,status:200,body:(async function*(){const enc=new TextEncoder();for(const e of events){const s=typeof e==='string'?e:'data: '+JSON.stringify(e)+'\n\n';
  // Split each event in two to prove lines are rebuilt across chunks.
  yield enc.encode(s.slice(0,7));yield enc.encode(s.slice(7));}})()});

test('Grok provider streams: growing text, usage at the end; a stream cut before [DONE] is uncertain',async()=>{
  let sent;const pieces=['{"reply":"Sz','ia!"','}'];
  const ok=createXaiProvider({key:'test-key-123',fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return sse([...pieces.map(p=>({choices:[{delta:{content:p}}]})),{choices:[],usage:{prompt_tokens:100,completion_tokens:7}},'data: [DONE]\n\n']);}});
  const seen=[];const out=await ok.complete({system:'s',user:'u',onDelta:t=>seen.push(t)});
  assert.equal(sent.stream,true);assert.deepEqual(sent.stream_options,{include_usage:true});
  assert.equal(out.text,'{"reply":"Szia!"}');assert.deepEqual(out.usage,{input:100,cached:0,output:7});
  assert.deepEqual(seen,['{"reply":"Sz','{"reply":"Szia!"','{"reply":"Szia!"}']);
  const cut=createXaiProvider({key:'test-key-123',fetchImpl:async()=>sse([{choices:[{delta:{content:'{"reply":"Sz'}}]}])});
  await assert.rejects(cut.complete({system:'s',user:'u',onDelta:()=>{}}),e=>e.code==='AI_UNCERTAIN');
  const refused=createXaiProvider({key:'test-key-123',fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'bad key'})})});
  await assert.rejects(refused.complete({system:'s',user:'u',onDelta:()=>{}}),e=>e.code==='AI_KEY');
});

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
test('streamed talk: reply lines while he writes, then the full view; early checks stay ordinary errors',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-stream-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  let next={reply:'Szia, Palor! Rég láttalak, hogy vagy mostanában?',beat:'talk',spark:1,choices:['Jól.','Hiányoztál.','Gyere velem!']};
  const provider=createMockProvider(()=>{if(next==='FAIL')throw Object.assign(new Error('x'),{code:'AI_UNCERTAIN'});return next;});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-11T10:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const stream=async body=>{const r=await fetch(origin+'/api/play/talk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,stream:true})});
    const type=r.headers.get('content-type')||'';if(!type.includes('ndjson'))return {status:r.status,error:(await r.json()).error};
    return {status:r.status,lines:(await r.text()).trim().split('\n').map(l=>JSON.parse(l))};};
  try{
    await call('/api/characters',{name:'Palor'});const a=(await call('/api/characters',{name:'Teszt Aladár'})).data;
    const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:a.id,location_id:cafe.id,role:'work'});
    const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-cafe','Kávézó','n-city',cafe.id)]}}]}));
    await call('/api/play/travel',{node_id:'n-cafe'});

    const s=await stream({character_id:a.id,channel:'in_person',opener:true});
    assert.equal(s.status,200);
    const partial=s.lines.filter(l=>typeof l.reply==='string').map(l=>l.reply);
    assert.ok(partial.length>=1,'at least one live piece');
    for(let i=1;i<partial.length;i++)assert.ok(partial[i].length>partial[i-1].length,'pieces only grow');
    assert.ok(next.reply.startsWith(partial[0]));
    const done=s.lines.at(-1).done;assert.ok(done,'the finished view comes last');
    assert.equal(done.lines.at(-1).text,next.reply);assert.deepEqual(done.choices,next.choices);

    // A check before Grok is asked: an ordinary JSON error, not a stream.
    const bad=await stream({conversation_id:done.id,text:''});assert.equal(bad.status,400);assert.ok(bad.error);
    // Grok failing before any text arrived: still a clear 504, nothing saved.
    next='FAIL';const before=done.lines.length;
    const failed=await stream({conversation_id:done.id,text:'Szia!'});
    const status=failed.lines?failed.lines.at(-1).status:failed.status,error=failed.lines?failed.lines.at(-1).error:failed.error;
    assert.equal(status,504);assert.ok(error);
    next={reply:'Itt vagyok.',beat:'talk',spark:0,choices:[]};
    const plain=(await call('/api/play/talk',{conversation_id:done.id,text:'Szia!'})).data;
    assert.equal(plain.lines.length,before+2,'the failed turn saved nothing; the plain JSON route still works');
  }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
