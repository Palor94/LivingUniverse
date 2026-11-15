import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {codeFreshness,createRequestLog,parseTailscale} from '../app/dev-tools.mjs';

test('request log keeps API JSON answers and failures, never query strings',()=>{
  const log=createRequestLog({size:3});
  log.record({method:'GET',route:'/api/state',status:200,ms:12});
  log.record({method:'GET',route:'/api/media/x/thumb',status:200,ms:5,json:false});
  log.record({method:'GET',route:'/client.js',status:200,ms:1});
  log.record({method:'POST',route:'/api/play/talk',status:500,ms:2500});
  const all=log.list();
  assert.deepEqual(all.map(e=>e.route),['/api/play/talk','/api/state']);
  assert.equal(all[0].slow,true);assert.equal(log.list({filter:'failed'}).length,1);
  for(let i=0;i<5;i++)log.record({method:'GET',route:'/api/x'+i,status:200,ms:1});
  assert.equal(log.list().length,3,'bounded');
});

test('code freshness lists server files changed after loading',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-fresh-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,'app'));await fs.mkdir(path.join(dir,'mcp'));
  await fs.writeFile(path.join(dir,'app','a.mjs'),'');await fs.writeFile(path.join(dir,'mcp','b.mjs'),'');await fs.writeFile(path.join(dir,'app','notes.txt'),'');
  const old=new Date(Date.now()-60_000);await fs.utimes(path.join(dir,'app','a.mjs'),old,old);
  const r=codeFreshness({projectRoot:dir,loadedAt:Date.now()-30_000});
  assert.equal(r.restart_needed,true);assert.deepEqual(r.changed.map(c=>[c.file,c.part]),[['mcp/b.mjs','mcp']]);
});

test('code freshness finds new server folders and skips the client',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-fresh2-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  for(const d of ['app/world','app/public'])await fs.mkdir(path.join(dir,d),{recursive:true});
  await fs.writeFile(path.join(dir,'app','world','w.mjs'),'');await fs.writeFile(path.join(dir,'app','public','c.js'),'');
  assert.deepEqual(codeFreshness({projectRoot:dir,loadedAt:Date.now()-30_000}).changed.map(c=>c.file),['app/world/w.mjs']);
});

test('a failed restart launch can be retried at once; old slow statements stop warning',async t=>{
  const {installDevTools,createQueryLog}=await import('../app/dev-tools.mjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-dev4-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let clock=Date.parse('2026-11-12T10:00:00Z'),tries=0;
  const queryLog=createQueryLog({thresholdMs:0,now:()=>clock});
  for(let i=0;i<25;i++)queryLog.time('SELECT 1',()=>1);
  const fail=(m,s)=>Object.assign(Error(m),{status:s});
  const tools=installDevTools({projectRoot:dir,dataDir:dir,mediaRoot:dir,db:null,errorLog:{recent:()=>[],file:path.join(dir,'none')},requestLog:createRequestLog(),queryLog,
    restartLauncher:()=>async()=>{if(++tries===1)throw fail('The restart could not be started.',500);},now:()=>clock,fail});
  t.after(()=>tools.close());
  const answers=[];const json=(d,s=200)=>answers.push(s);
  const post=()=>tools.handle({p:'/api/dev/restart',req:{method:'POST'},url:new URL('http://x/'),body:{confirm:true},json});
  await assert.rejects(post(),e=>e.status===500);
  await post();assert.deepEqual(answers,[202],'second try is not blocked by the failed one');
  assert.equal((await tools.doctor()).checks.find(c=>c.id==='queries').state,'warn');
  clock+=2*3600e3;
  assert.equal((await tools.doctor()).checks.find(c=>c.id==='queries').state,'ok','older than an hour');
});

test('restart log is readable whether PowerShell wrote UTF-16 or UTF-8',async()=>{
  const {decodeLog}=await import('../app/dev-tools.mjs');
  const text='Újraindítás: leállítás...\r\nIndítás';
  assert.equal(decodeLog(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')])),text);
  assert.equal(decodeLog(Buffer.from(text,'utf16le')),text,'appended part without BOM');
  assert.equal(decodeLog(Buffer.from('﻿'+text,'utf8')),text);
  assert.equal(decodeLog(Buffer.from(text,'utf8')),text);
});

test('the tailscale check keeps its own state next to the Tailscale backend state',async t=>{
  const {installDevTools}=await import('../app/dev-tools.mjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-dev5-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  for(const [backend,state] of [['Running','ok'],['Stopped','bad']]){
    const tools=installDevTools({projectRoot:dir,dataDir:dir,mediaRoot:dir,db:null,errorLog:{recent:()=>[],file:path.join(dir,'none')},requestLog:createRequestLog(),
      mobile:()=>({enabled:true,listening:true,port:4318}),tailscale:async()=>({installed:true,state:backend,name:'gep'}),fail:Error});
    const c=(await tools.doctor()).checks.find(x=>x.id==='tailscale');tools.close();
    assert.deepEqual([c.state,c.backend],[state,backend]);
  }
});

test('tailscale output is reduced to state and own name',()=>{
  assert.deepEqual(parseTailscale(JSON.stringify({BackendState:'Running',Self:{DNSName:'laptop.example.ts.net.',TailscaleIPs:['100.1.2.3']},Peer:{a:{}}})),{state:'Running',name:'laptop.example.ts.net'});
  assert.deepEqual(parseTailscale('Tailscale is stopped.'),{state:'Stopped',name:null});
});

test('doctor, logs and restart routes',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-dev-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  let restarts=0;
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,
    systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  let launched=null;
  t.after(async()=>{await app.close();await launched?.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};

  await call('/api/state?secret=1');await call('/api/does-not-exist');
  const doc=(await call('/api/dev/doctor?deep=1')).data;
  assert.equal(doc.database.integrity,'ok');assert.equal(doc.process.pid,process.pid);
  const ids=doc.checks.map(c=>c.id);
  for(const id of ['code','database','media','disk_data','mobile','gateway','tunnel','errors','requests'])assert.ok(ids.includes(id),id);
  assert.equal(doc.checks.find(c=>c.id==='mobile').state,'off');assert.ok(!ids.includes('tailscale'),'no Tailscale check while mobile access is off');
  assert.equal(doc.restart.available,false,'tests and copies never restart the service');

  const reqs=(await call('/api/dev/log?kind=requests')).data.entries;
  assert.ok(reqs.some(e=>e.route==='/api/state'&&e.status===200));assert.ok(reqs.some(e=>e.route==='/api/does-not-exist'&&e.status===404));
  assert.ok(reqs.every(e=>!e.route.includes('?')),'no query strings');
  assert.deepEqual((await call('/api/dev/log?kind=errors')).data.entries,[]);
  assert.equal((await call('/api/dev/log?kind=bogus')).status,400);

  assert.equal((await call('/api/dev/restart',{})).status,400,'needs confirmation');
  assert.equal((await call('/api/dev/restart',{confirm:true})).status,409,'not enabled here');
  // The service path (installProcessGuards → enableRestart) uses the Windows controller; here a stand-in.
  launched=await createApp({root,dataDir:path.join(base,'data2'),mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,devRestart:async()=>{restarts++;},
    systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  await new Promise(r=>launched.server.listen(0,'127.0.0.1',r));
  const o2='http://127.0.0.1:'+launched.server.address().port;
  const post=async()=>(await fetch(o2+'/api/dev/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"confirm":true}'})).status;
  assert.equal(await post(),202);assert.equal(restarts,1);
  assert.equal(await post(),429,'one restart per minute');assert.equal(restarts,1);
});

test('AI trace keeps timing and tokens, never the text; slow statements keep SQL only',async()=>{
  const {createAiTrace,createQueryLog}=await import('../app/dev-tools.mjs');
  const trace=createAiTrace();
  const ok={name:'mock',model:'m1',async complete({onDelta}){onDelta?.('{"reply":"Sz');return {text:'{"reply":"Szia"}',usage:{input:10,cached:2,output:5},finish:'stop'};}};
  const bad={name:'xai',model:'g',async complete(){throw Object.assign(Error('t'),{code:'AI_UNCERTAIN'});}};
  assert.equal(trace.wrap(ok),trace.wrap(ok),'one wrapper per provider');assert.equal(trace.wrap(null),null);
  const r=await trace.wrap(ok).complete({system:'titkos rendszer',user:'titkos kérdés',maxTokens:300,onDelta:()=>{}});
  assert.equal(r.text,'{"reply":"Szia"}');
  await assert.rejects(trace.wrap(bad).complete({system:'a',user:'b'}),e=>e.code==='AI_UNCERTAIN');
  const [failed,done]=trace.list();
  assert.equal(failed.error,'AI_UNCERTAIN');assert.equal(done.streamed,true);assert.ok(done.first_text_ms!==null);
  assert.deepEqual(done.usage,{input:10,cached:2,output:5});assert.equal(done.max_tokens,300);
  assert.ok(!JSON.stringify(trace.list()).includes('titkos'),'no prompt text');
  const q=createQueryLog({thresholdMs:0});
  assert.equal(q.time('SELECT  *\n FROM x WHERE id=?',()=>42),42);
  assert.deepEqual(q.list().map(e=>e.sql),['SELECT * FROM x WHERE id=?']);assert.equal(q.count(),1);
});

test('browser errors are logged, bounded; AI calls and tables show in the doctor',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-dev2-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const {createMockProvider}=await import('../app/world-ai.mjs');
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({reply:'Szia!'})),
    systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  assert.equal((await call('/api/dev/client-error',{message:'x is not a function',stack:'at play.js:1:2',where:'play · play.js'})).status,202);
  const [logged]=(await call('/api/dev/log?kind=errors')).data.entries;
  assert.equal(logged.source,'client');assert.equal(logged.route,'play · play.js');assert.equal(logged.message,'x is not a function');
  for(let i=0;i<40;i++)await call('/api/dev/client-error',{message:'spam'});
  assert.equal((await call('/api/dev/log?kind=errors&limit=500')).data.entries.length,30,'at most 30 per 10 minutes');

  // An AI call through the world engine's provider shows up in the trace.
  await app.worldEngine.internals.ask('s','u',50);
  assert.equal((await call('/api/dev/log?kind=ai')).data.entries[0].provider,'mock');
  const doc=(await call('/api/dev/doctor?deep=1')).data;
  assert.ok(doc.database.tables.some(x=>x.name==='media'));
  assert.ok(doc.checks.some(c=>c.id==='queries'));
  assert.equal((await call('/api/dev/log?kind=queries')).status,200);
});

test('doctor reports event-loop delay since the previous check',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-dev3-'));
  const app=await createApp({root:path.join(base,'media'),dataDir:path.join(base,'data'),mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await app.devTools.doctor();
  const until=Date.now()+300;while(Date.now()<until){} // a 300 ms freeze
  await new Promise(r=>setTimeout(r,50));
  const d=await app.devTools.doctor();
  const lag=d.checks.find(c=>c.id==='lag');
  assert.ok(lag.max_ms>=250,'freeze measured: '+lag.max_ms);
  assert.ok(Math.abs(Date.parse(lag.max_at)-until+300)<200,'freeze start time kept');
  assert.ok(Number.isInteger(d.steps_ms.disks),'steps are timed');
  assert.ok((await app.devTools.doctor()).event_loop.max_ms<250,'starts over after each check');
});
