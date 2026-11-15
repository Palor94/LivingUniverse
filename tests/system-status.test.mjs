import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installSystemStatus,tunnelHealth,readTunnelHealth} from '../app/system-status.mjs';

test('system status: startup tasks pointing to a moved folder, a stopped gateway or tunnel are reported with the fix',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sys-'));
  for(const f of ['app/start-existing.mjs','mcp/grok-task-runner.mjs','mcp/task-runner.mjs']){await fs.mkdir(path.join(root,path.dirname(f)),{recursive:true});await fs.writeFile(path.join(root,f),'');}
  const good=(name,script)=>({name,exe:process.execPath,args:`"${path.join(root,script)}"`,dir:root});
  let tasks=[good('Living Universe catalogue runtime','app/start-existing.mjs'),good('Living Universe Grok Gateway','mcp/grok-task-runner.mjs'),
    {name:'Living Universe Private MCP Tunnel',exe:process.execPath,args:'"C:/régi hely/LivingUniverse/mcp/task-runner.mjs"',dir:'C:/régi hely/LivingUniverse'}];
  let gw=true,tn=true;
  const sys=installSystemStatus({projectRoot:root,readTasks:async()=>tasks,probe:async()=>gw,tunnelRunning:async()=>tn});
  let s=await sys.status({fresh:true});
  assert.equal(s.ok,false);assert.deepEqual(s.problems,['task:Living Universe Private MCP Tunnel']);
  const broken=s.startup.find(t=>!t.ok);assert.deepEqual(broken.problems.sort(),['folder','script']);
  assert.equal(broken.expected.script,path.join(root,'mcp/task-runner.mjs'));assert.equal(broken.expected.folder,root);
  // A task starting another copy of the code is a problem too.
  const copy=path.join(root,'old-copy','mcp');await fs.mkdir(copy,{recursive:true});await fs.writeFile(path.join(copy,'task-runner.mjs'),'');
  tasks[2]={name:'Living Universe Private MCP Tunnel',exe:process.execPath,args:`"${path.join(copy,'task-runner.mjs')}"`,dir:root};
  s=await sys.status({fresh:true});assert.deepEqual(s.startup[2].problems,['other_copy']);
  // Everything fine, then the gateway and the tunnel stop; a missing task is reported.
  tasks[2]=good('Living Universe Private MCP Tunnel','mcp/task-runner.mjs');assert.equal((await sys.status({fresh:true})).ok,true);
  gw=false;tn=false;tasks=tasks.slice(0,2);s=await sys.status({fresh:true});
  assert.deepEqual(s.problems,['task:Living Universe Private MCP Tunnel','gateway','tunnel']);assert.equal(s.startup[2].problem,'missing');
  // Results are cached for a minute unless a fresh check is asked for.
  gw=true;assert.equal((await sys.status()).gateway,false);assert.equal((await sys.status({fresh:true})).gateway,true);
  assert.equal(JSON.stringify(s.keys).includes('sk-'),false,'only presence of keys, never values');
  await fs.rm(root,{recursive:true,force:true});
});

test('a ready tunnel with failing cloud authentication is never healthy; diagnostics omit secrets',async()=>{
  const now=Date.now(),metric=seconds=>`commands_poll_last_successful_timestamp_seconds ${seconds}\n`;
  const health={live:true,ready:true,components:{'control-plane':{details:{http_status:401,last_error:'sk-synthetic-private-value'}}}};
  const denied=tunnelHealth(health,metric(0),now);
  assert.equal(denied.connected,false);assert.equal(denied.reason,'authentication_failed');assert.equal(denied.http_status,401);
  assert.ok(!JSON.stringify(denied).includes('synthetic-private'));
  health.components['control-plane'].details.http_status=200;
  assert.equal(tunnelHealth(health,metric(now/1000),now).connected,true);
  assert.equal(tunnelHealth(health,metric((now-180000)/1000),now).connected,false,'old success does not hide a lost connection');
  assert.equal(tunnelHealth(health,metric(0),now).connected,false,'ready alone is insufficient');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lu-health-')),file=path.join(root,'health.url');
  try{
    await fs.writeFile(file,'https://example.test/');let called=false;
    await assert.rejects(readTunnelHealth({file,fetcher:async()=>{called=true;}}));assert.equal(called,false,'never fetch a non-loopback URL');
    await fs.writeFile(file,'http://127.0.0.1:12345');
    const result=await readTunnelHealth({file,now,fetcher:async url=>url.pathname==='/metrics'?new Response(metric(now/1000)):Response.json(health)});
    assert.equal(result.connected,true);
    const system=installSystemStatus({projectRoot:root,readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>denied});
    const status=await system.status({fresh:true});assert.equal(status.tunnel,false);assert.equal(status.tunnel_status.reason,'authentication_failed');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('system status: a stopped Tailscale and old running code are reported (2026-11-13)',async()=>{
  let ts={installed:true,state:'Stopped'},code={restart_needed:true,changed_count:3};
  const sys=installSystemStatus({projectRoot:os.tmpdir(),readTasks:async()=>null,probe:async()=>true,tunnelRunning:async()=>true,tailscale:async()=>ts,freshness:()=>code});
  let s=await sys.status({fresh:true});
  assert.deepEqual(s.problems,['tailscale','restart']);assert.equal(s.tailscale,'Stopped');assert.equal(s.changed_count,3);
  ts={installed:true,state:'Running'};code={restart_needed:false,changed_count:0};
  s=await sys.status({fresh:true});assert.equal(s.ok,true);assert.equal(s.restart_needed,false);
  ts={installed:false,state:'unknown'};assert.equal((await sys.status({fresh:true})).ok,true,'no Tailscale installed: nothing to report');
});

test('right after a start a tunnel or gateway that is not up yet is "starting", not a problem',async()=>{
  let t=1_000_000,tn=false,gw=false;
  const sys=installSystemStatus({projectRoot:process.cwd(),readTasks:async()=>null,probe:async()=>gw,tunnelRunning:async()=>tn,startedAt:t,startGraceMs:180_000,now:()=>t});
  let s=await sys.status({fresh:true});
  assert.equal(s.ok,true);assert.deepEqual(s.starting,['gateway','tunnel']);assert.equal(s.tunnel_status.reason,'starting');
  // Up after a moment: nothing starting any more.
  tn=true;gw=true;s=await sys.status({fresh:true});assert.deepEqual([s.ok,s.starting],[true,[]]);
  // After the grace time a stopped tunnel is a real problem again.
  t+=181_000;tn=false;s=await sys.status({fresh:true});
  assert.deepEqual([s.ok,s.problems,s.starting],[false,['tunnel'],[]]);
  // A refused login is never "starting".
  const auth=installSystemStatus({projectRoot:process.cwd(),readTasks:async()=>null,probe:async()=>true,tunnelRunning:async()=>({running:true,connected:false,reason:'authentication_failed'}),startedAt:t,startGraceMs:180_000,now:()=>t});
  assert.deepEqual((await auth.status({fresh:true})).problems,['tunnel']);
});
