// Phase 0 (2026-11-11, docs/NEXT_GEN_PLAN_2026-11-11.md): fixes that protect data and money.
// Synthetic data and test providers only; no network, no cost.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp,resolveDataDir} from '../app/server.mjs';
import {createMockProvider,createXaiProvider} from '../app/world-ai.mjs';
import {createErrorLog} from '../app/error-log.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});

// A small world: Palor, one character at home in a café, Palor standing there.
async function world({respond,clock}){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-phase0-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  // The provider can be swapped per test step (mock, slow, cut short, timed out).
  const provider={name:'mock',model:'mock',impl:createMockProvider(respond),complete(r){return this.impl.complete(r);}};
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:clock});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};};
  await call('/api/characters',{name:'Palor'});const a=(await call('/api/characters',{name:'Teszt Aladár'})).data;
  const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));
  await call('/api/world-engine/places',{character_id:a.id,location_id:cafe.id,role:'home'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-cafe','Kávézó','n-city',cafe.id)]}}]}));
  await call('/api/play/travel',{node_id:'n-cafe'});
  const close=async()=>{await new Promise(r=>app.server.close(r));app.db.close();};
  return {app,call,a,provider,root,dataDir,origin,close};
}
const reply={reply:'Szia, Palor!',beat:'talk',spark:1,choices:['Jól.','Hiányoztál.','Gyere!']};
const summary={title:'Kávé',summary:'Beszélgettek.',character_memory:'Jó volt.',palor_memory:'Jó volt.',level_delta:1,reason:'Kedves volt.'};
const isSummary=r=>/foglalsz össze/.test(r.system);

test('ending a conversation twice at once saves one summary, one event and one level step',async()=>{
  let release;const gate=new Promise(r=>{release=r;});
  const w=await world({respond:async r=>{if(isSummary(r)){await gate;return summary;}return reply;},clock:()=>new Date('2026-11-11T10:00:00')});
  try{
    const conv=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'})).data;
    const first=w.call(`/api/play/conversations/${conv.id}/end`,{});
    await new Promise(r=>setTimeout(r,50));
    // While the first summary is still being written, a second end and a new line are refused.
    const second=await w.call(`/api/play/conversations/${conv.id}/end`,{});assert.equal(second.status,409);
    const line=await w.call('/api/play/talk',{conversation_id:conv.id,text:'Még valami.'});assert.equal(line.status,409);
    release();const done=await first;assert.equal(done.status,200);assert.equal(done.data.status,'closed');
    const again=await w.call(`/api/play/conversations/${conv.id}/end`,{});assert.equal(again.status,200,'ending a closed talk just shows it');
    assert.equal(w.app.db.prepare("SELECT count(*) n FROM world_events WHERE json_extract(payload_json,'$.play_conversation_id')=?").get(conv.id).n,1);
    assert.equal(w.app.db.prepare("SELECT count(*) n FROM world_level_revisions WHERE source_id=? AND actor='play'").get(w.a.id).n,1);
    assert.equal(w.app.db.prepare("SELECT count(*) n FROM character_memories WHERE character_id=?").get(w.a.id).n,1);
  }finally{release();await w.close();}
});

test('a talk running past midnight stays open; one idle for hours on an earlier day is closed quietly',async()=>{
  let now=new Date('2026-11-11T23:50:00');
  const w=await world({respond:r=>isSummary(r)?summary:reply,clock:()=>now});
  try{
    const conv=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'})).data;
    now=new Date('2026-11-12T00:10:00');
    assert.equal((await w.call('/api/play/unread')).data.unread_messages,0,'the light unread check works');
    await w.call('/api/play');
    assert.equal((await w.call('/api/play/conversations/'+conv.id)).data.status,'open','20 minutes after midnight it is still the same talk');
    now=new Date('2026-11-12T04:00:00');await w.call('/api/play');
    const after=(await w.call('/api/play/conversations/'+conv.id)).data;
    assert.equal(after.status,'closed');assert.equal(after.summary.level_delta,0);
  }finally{await w.close();}
});

test('a second start with the same character continues the open conversation',async()=>{
  const w=await world({respond:r=>isSummary(r)?summary:reply,clock:()=>new Date('2026-11-11T10:00:00')});
  try{
    const one=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'})).data;
    const two=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Megint én.'})).data;
    assert.equal(two.id,one.id);assert.equal(two.lines.length,4);
    const opener=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',opener:true})).data;
    assert.equal(opener.id,one.id);assert.equal(opener.lines.length,4,'an opener on an open talk only shows it');
    assert.equal(w.app.db.prepare("SELECT count(*) n FROM play_conversations WHERE status='open'").get().n,1);
  }finally{await w.close();}
});

test('an answer cut at the token limit keeps its reply; a timed-out call counts against the cap as uncertain',async()=>{
  const w=await world({respond:()=>reply,clock:()=>new Date('2026-11-11T10:00:00')});
  try{
    w.provider.name='test';
    w.provider.impl={complete:async r=>{assert.equal(r.maxTokens,600);return {text:'{"reply":"Szia, Palor, rég lát','usage':{input:100,cached:0,output:600},finish:'length'};}};
    const cut=await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'});
    assert.equal(cut.status,200);assert.equal(cut.data.lines.at(-1).text,'Szia, Palor, rég lát');assert.deepEqual(cut.data.choices,[]);
    const before=w.app.db.prepare('SELECT cost_usd FROM world_usage').get().cost_usd;
    w.provider.impl={complete:async()=>{throw Object.assign(new Error('timeout'),{code:'AI_UNCERTAIN'});}};
    const timed=await w.call('/api/play/talk',{conversation_id:cut.data.id,text:'Halló?'});assert.equal(timed.status,504);
    const after=w.app.db.prepare('SELECT cost_usd FROM world_usage').get().cost_usd;
    assert.ok(after>before,'the possible charge counts against today\'s cap');
    const uncertain=JSON.parse(w.app.db.prepare("SELECT value FROM application_settings WHERE key='world:uncertain-usd:2026-11-11'").get().value);
    assert.ok(uncertain>0&&Math.abs((after-before)-uncertain)<1e-6);
  }finally{await w.close();}
});

test('the Grok stream accepts a last event without a closing newline and reports the finish reason',async()=>{
  const body=(async function*(){const enc=new TextEncoder();
    yield enc.encode('data: '+JSON.stringify({choices:[{delta:{content:'{"reply":"Szia'},finish_reason:'length'}]})+'\n\n');
    yield enc.encode('data: [DONE]');})();
  const provider=createXaiProvider({key:'test-key-123',fetchImpl:async()=>({ok:true,status:200,body})});
  const out=await provider.complete({system:'s',user:'u',onDelta:()=>{}});
  assert.equal(out.text,'{"reply":"Szia');assert.equal(out.finish,'length');
});

test('media search treats % and _ literally; an empty media file is served without breaking the connection',async()=>{
  const w=await world({respond:()=>reply,clock:()=>new Date('2026-11-11T10:00:00')});
  try{
    const add=async(name,bytes)=>{await fs.writeFile(path.join(w.root,name),bytes);const id=randomUUID();w.app.db.prepare('INSERT INTO media(id,relative_path,folder,kind,size,modified_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,'.','image',bytes.length,new Date().toISOString(),new Date().toISOString());return id;};
    await add('ar 100% kesz.jpg',Buffer.from('x'));await add('ar 1000 kesz.jpg',Buffer.from('x'));await add('a_b.jpg',Buffer.from('x'));await add('axb.jpg',Buffer.from('x'));
    const hits=async q=>(await w.call('/api/media?search='+encodeURIComponent(q))).data.items.map(m=>m.relative_path).sort();
    assert.deepEqual(await hits('100%'),['ar 100% kesz.jpg']);
    assert.deepEqual(await hits('a_b'),['a_b.jpg']);
    const empty=await add('ures.jpg',Buffer.alloc(0));
    const r=await fetch(w.origin+'/media/'+empty);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,0);
  }finally{await w.close();}
});

test('unexpected errors are logged with their route and shown in system status; the log is capped',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-errlog-'));
  const log=createErrorLog(dir,{maxBytes:400});
  for(let i=0;i<5;i++)log.write(new Error('hiba '+i),{method:'GET',route:'/api/x'});
  const recent=log.recent();assert.equal(recent[0].message,'hiba 4');assert.equal(recent[0].route,'/api/x');assert.ok(!('stack' in recent[0]));
  assert.ok((await fs.readdir(path.join(dir,'logs'))).includes('errors.1.log'),'the log rotates past its size limit');

  const w=await world({respond:()=>reply,clock:()=>new Date('2026-11-11T10:00:00')});
  try{
    // A query that fails inside SQLite is an unexpected (500) error.
    w.app.db.exec('DROP VIEW active_media');
    const r=await w.call('/api/media?offset=0');assert.equal(r.status,500);
    const lines=(await fs.readFile(path.join(w.dataDir,'logs','errors.log'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
    assert.equal(lines.at(-1).route,'/api/media');assert.ok(lines.at(-1).stack);
  }finally{await w.close();}
});

test('without an explicit folder the live desktop catalogue is chosen over the old parent folder',()=>{
  const base='C:\\Users\\x\\AppData\\Local';
  assert.equal(resolveDataDir({LIVING_UNIVERSE_DATA:'D:\\data'},()=>true),'D:\\data');
  assert.equal(resolveDataDir({LOCALAPPDATA:base},f=>f===path.join(base,'LivingUniverse','desktop-catalogue','universe.sqlite')),path.join(base,'LivingUniverse','desktop-catalogue'));
  assert.equal(resolveDataDir({LOCALAPPDATA:base},()=>false),path.join(base,'LivingUniverse'),'a fresh install keeps the old default');
});
