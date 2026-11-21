// Debugging package (2026-11-13): request ids, browser steps in errors.log, AI statistics, the
// connector view, the weekly report, bug report bundles (with a database snapshot) and their
// sandbox replay hook, the connector call log, the change risk list and seeded randomness.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PassThrough} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {serve} from '../mcp/server.mjs';
import {createCallLog} from '../mcp/call-log.mjs';
import {changeRisk} from '../ops/test.mjs';
import {seededRandom} from '../ops/sandbox.mjs';
import {createTrail,controlLabel} from '../app/public/debug-trail.js';
import {weeklyMarkdown} from '../app/weekly-report.mjs';
import {isPlayRoute} from '../app/mobile.mjs';

test('request ids, steps, statistics, connector, weekly report and bug reports',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-debug-'));let app;
  const launched=[];
  try{
    app=await createApp({root:temp,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,imageGeneration:{},
      diagnosticsDir:path.join(temp,'diag'),sandboxLauncher:async name=>{launched.push(name);return {started:true,url:'http://127.0.0.1:4330'};}});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+app.server.address().port;
    const get=async p=>{const r=await fetch(origin+p);return {r,body:await r.json()};};
    const post=async(p,b)=>{const r=await fetch(origin+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return {r,body:await r.json()};};

    // Every answer carries a request id, and the request log keeps it.
    const {r:first}=await get('/api/dev/jobs');
    const rid=first.headers.get('x-request-id');
    assert.match(rid,/^[0-9a-f]{8}$/);
    const {body:requests}=await get('/api/dev/log?kind=requests&limit=20');
    assert.ok(requests.entries.some(e=>e.id===rid));

    // A browser error keeps its last steps and request id.
    await post('/api/dev/client-error',{message:'boom',where:'play',steps:['12:00:01 click: Térkép'],request_id:rid});
    const {body:errors}=await get('/api/dev/log?kind=errors&limit=5');
    assert.deepEqual([errors.entries[0].request_id,errors.entries[0].steps],[rid,['12:00:01 click: Térkép']]);

    // AI statistics from the saved log.
    await fs.mkdir(path.join(temp,'data','logs'),{recursive:true});
    const day=new Date().toISOString();
    await fs.writeFile(path.join(temp,'data','logs','ai-calls.log'),[{at:day,provider:'xai',model:'m',ms:1000,usage:{input:100,cached:50,output:10},finish:'stop'},{at:day,provider:'xai',model:'m',ms:3000,usage:{input:100,cached:0,output:10},finish:'length'},{at:day,provider:'xai',model:'m',ms:500,error:'AI_FAILED'}].map(JSON.stringify).join('\n')+'\n');
    const {body:stats}=await get('/api/dev/log?kind=ai-stats');
    assert.deepEqual(stats.days.map(d=>[d.calls,d.errors,d.truncated,d.cache_share]),[[3,1,1,0.25]]);

    // Connector: every tool linted, no schema error, calls read from the call log.
    await fs.writeFile(path.join(temp,'data','logs','mcp-calls.log'),[{at:day,client:'stdio',version:'2000-01-01T00:00:00Z',kind:'list',count:70},{at:day,client:'stdio',version:'2000-01-01T00:00:00Z',kind:'call',tool:'list_town_maps',ok:false,code:'UNKNOWN_TOOL',ms:0}].map(JSON.stringify).join('\n')+'\n');
    const {body:conn}=await get('/api/dev/connector');
    assert.ok(conn.tool_count>=60);
    assert.deepEqual(conn.schema_errors,[]);
    assert.deepEqual(conn.problems.sort(),['old_chat','old_code']);
    assert.equal(conn.clients[0].stale_calls,1);

    // Weekly report.
    const measurement={id:'11111111-2222-4333-8444-555555555555',task:'talk',surface:'desktop',clicks:4,ms:2500};
    assert.equal((await post('/api/dev/ux-measurements',measurement)).r.status,201);
    assert.equal((await post('/api/dev/ux-measurements',measurement)).body.duplicate,true,'an uncertain save can be retried without counting twice');
    assert.equal((await post('/api/dev/ux-measurements',{...measurement,note:'private entered text'})).r.status,400);
    assert.equal((await post('/api/dev/ux-measurements',{...measurement,clicks:-1})).r.status,400);
    const foreign=await fetch(origin+'/api/dev/ux-measurements',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:JSON.stringify(measurement)});
    assert.equal(foreign.status,403);
    const {body:week}=await get('/api/dev/weekly');
    assert.equal(week.errors.client,1);
    assert.equal(week.ai.calls,3);
    assert.ok(week.audit);
    assert.deepEqual(week.ux,[{task:'talk',surface:'desktop',runs:1,clicks:4,ms:2500,avg_clicks:4,avg_ms:2500}]);
    assert.match(weeklyMarkdown(week),/Első mondatig \(laptop\): 1 mérés, átlag 4 kattintás, 2.5 mp/);

    // Bug report with a database snapshot; list; replay goes to the sandbox launcher.
    const {r:created,body:report}=await post('/api/dev/bug-report',{note:'A térkép nem nyílt meg',snapshot:true,client:{steps:[{kind:'click',text:'Térkép'}]}});
    assert.equal(created.status,201);
    assert.match(report.name,/^hiba-\d{4}-/);
    const folder=path.join(temp,'diag',report.name);
    const saved=JSON.parse(await fs.readFile(path.join(folder,'report.json'),'utf8'));
    assert.equal(saved.note,'A térkép nem nyílt meg');
    assert.ok(saved.server.doctor.checks&&saved.server.jobs&&saved.server.audit&&saved.server.connector);
    const copy=new DatabaseSync(path.join(folder,'universe.sqlite'),{readOnly:true});
    assert.ok(copy.prepare("SELECT count(*) n FROM sqlite_master WHERE name='characters'").get().n);copy.close();
    assert.match(await fs.readFile(path.join(folder,'OLVASS-EL.txt'),'utf8'),/--from-report hiba-/);
    const {body:list}=await get('/api/dev/bug-reports');
    assert.deepEqual(list.reports.map(x=>[x.name,x.snapshot]),[[report.name,true]]);
    assert.equal((await post('/api/dev/bug-reports/'+report.name+'/sandbox',{})).r.status,400);
    assert.equal((await post('/api/dev/bug-reports/hiba-../sandbox',{confirm:true})).r.status,404);
    const {body:replay}=await post('/api/dev/bug-reports/'+report.name+'/sandbox',{confirm:true});
    assert.deepEqual([launched,replay.url],[[report.name],'http://127.0.0.1:4330']);
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});

test('the connector logs lists and calls, explains old chats and names its version',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-calls-'));
  try{
    const file=path.join(temp,'logs','mcp-calls.log');
    const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',c=>wire+=c);
    const catalogue={call:async name=>{if(name==='list_characters')return {data:{characters:[]}};throw Object.assign(Error('x'),{code:'X'});}};
    const running=serve({catalogue,input,output,onCall:createCallLog(file,{client:'test'})});
    input.end([{jsonrpc:'2.0',id:1,method:'initialize',params:{}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_characters',arguments:{}}},{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'list_town_maps_v0',arguments:{}}},{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'save_town_map',arguments:{}}}].map(JSON.stringify).join('\n')+'\n');
    await running;
    const replies=wire.trim().split('\n').map(JSON.parse);
    assert.match(replies[2].result._meta['living-universe/program'],/^\d{4}-|unknown/);
    const old=JSON.parse(replies[3].result.content[0].text);
    assert.equal(old.code,'UNKNOWN_TOOL');assert.match(old.message,/refresh the Living Universe connector and open a new chat/);
    const off=JSON.parse(replies[4].result.content[0].text);
    assert.equal(off.code,'TOOL_UNAVAILABLE','a real tool that is switched off is not an old chat');
    const log=(await fs.readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(log.map(e=>[e.kind,e.tool||null,e.ok??null,e.code??null]),[['list',null,null,null],['call','list_characters',true,null],['call','list_town_maps_v0',false,'UNKNOWN_TOOL'],['call','save_town_map',false,'TOOL_UNAVAILABLE']]);
    assert.ok(log.every(e=>e.client==='test'&&!('arguments' in e)));
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('change risk names screens and tests; seeded randomness repeats',()=>{
  const r=changeRisk(['app/play-mode.mjs','mcp/backgrounds.mjs'],['play-mode.test.mjs','play-stories.test.mjs','mcp-writes.test.mjs','backgrounds.test.mjs','catalogue.test.mjs']);
  assert.ok(r.screens.includes('Játék')&&r.screens.includes('ChatGPT és Grok csatlakozó'));
  assert.ok(r.tests.includes('play-mode.test.mjs'));
  assert.deepEqual(changeRisk(['app/public/i18n.js'],[]).screens,['minden képernyő']);
  const a=seededRandom(42),b=seededRandom(42),c=seededRandom(43);
  const seq=f=>[f(),f(),f()];
  const sa=seq(a);assert.deepEqual(sa,seq(b));assert.notDeepEqual(sa,seq(c));
  assert.ok(sa.every(x=>x>=0&&x<1));
});

test('the browser trail keeps clicks and requests, never typed text',()=>{
  const trail=createTrail({storage:false});
  trail.note('click','Térkép');
  const id=trail.apiStart('POST','/api/play/travel');
  assert.equal(trail.inflight().length,1);
  trail.apiEnd(id,500,'abcd1234');
  assert.deepEqual(trail.api(1).map(x=>[x.route,x.status,x.request_id]),[['/api/play/travel',500,'abcd1234']]);
  assert.match(trail.steps(5).at(-1).text,/travel → 500 #abcd1234/);
  trail.setContext('play',()=>({nézet:'map'}));
  assert.deepEqual(trail.context(),{play:{nézet:'map'}});
  // Labels come from the control, not from fields.
  const fake=(tag,attrs={},text='')=>({tagName:tag,id:attrs.id||'',dataset:{},getAttribute:k=>attrs[k]??null,textContent:text});
  const input=fake('INPUT',{type:'checkbox'},'');input.closest=()=>input;
  assert.equal(controlLabel(input),'input');
  const button=fake('BUTTON',{id:'play-scan'},'  Háttérképek   beolvasása ');button.closest=()=>button;
  assert.equal(controlLabel(button),'Háttérképek beolvasása #play-scan');
});

test('B7 counts tasks across the bounded trail and reload; debugger clicks and cancelled tasks are excluded',()=>{
  let clock=1000;const saved=new Map(),old=globalThis.sessionStorage;
  globalThis.sessionStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
  try{
    let trail=createTrail({clock:()=>clock,makeId:()=> '11111111-2222-4333-8444-555555555555'});
    assert.equal(trail.startTask('talk'),true);assert.equal(trail.startTask('background'),false);
    for(let n=0;n<75;n++)trail.note('click','control');
    trail.note('click','Feladat vége',{measure:false});
    assert.equal(trail.steps(100).length,60);
    trail=createTrail({clock:()=>clock});clock=4500;
    assert.equal(trail.activeTask().clicks,75,'counter is independent of the 60-step ring and survives reload');
    const record=trail.finishTask();assert.deepEqual([record.clicks,record.ms,record.task,record.surface],[75,3500,'talk','desktop']);
    assert.equal(trail.finishTask(),null);
    assert.equal(trail.measurements()[0].saved,undefined);trail.taskSaved(record.id);
    assert.equal(trail.measurements()[0].saved,true);
    assert.equal(trail.startTask('other','phone'),true);trail.cancelTask();
    assert.equal(trail.measurements().length,1);
    assert.equal(trail.activeTask(),null);assert.equal(trail.startTask('private text'),false);
    assert.equal(isPlayRoute('/api/dev/ux-measurements','POST'),true);
    assert.equal(isPlayRoute('/api/dev/ux-measurements','GET'),false);
    assert.equal(isPlayRoute('/api/dev/weekly','GET'),false);
  }finally{globalThis.sessionStorage=old;}
});
