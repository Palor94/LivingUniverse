// Background job ledger (debugging package, 2026-11-13).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createJobLedger,outagesFrom,costAlert} from '../app/job-ledger.mjs';

test('jobs, busy stretches, stuck rounds and connectivity changes are recorded',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-jobs-'));
  try{
    let t=Date.parse('2026-11-13T10:00:00Z'),busy=null,round={running:false,last:{id:'r1',step:'agents',started_at:'2026-11-13T09:00:00Z',finished_at:null}};
    let status={gateway:true,tunnel:true,tailscale:{state:'Running'}};
    const world={roundState:()=>round,clearStuckRound:()=>{round={...round,last:{...round.last,finished_at:new Date(t).toISOString(),error:{code:'INTERRUPTED'}}};return round.last;}};
    const jobs=createJobLedger({dataDir:dir,now:()=>t,worldEngine:world,systemStatus:{status:async()=>status},every:3_600_000,sampleEvery:3_600_000});
    const j=jobs.start('scan');t+=5000;j.done();
    const f=jobs.start('import');t+=1000;f.failed(Object.assign(Error('broken'),{code:'X'}));
    const v=jobs.view();
    assert.deepEqual(v.recent.map(r=>[r.kind,r.outcome,r.ms]),[['import','failed',1000],['scan','done',5000]]);
    assert.equal(v.recent[0].error.code,'X');
    // A saved round status "running" with nothing running is stuck and can be unstuck.
    assert.deepEqual(v.stuck.map(s=>[s.kind,s.can_unstick]),[['world_round',true]]);
    assert.throws(()=>jobs.unstick({kind:'world_round'}),/Confirm/);
    jobs.unstick({kind:'world_round',confirm:true});
    assert.equal(jobs.view().stuck.length,0);
    // A long explicit job becomes stuck after its limit.
    jobs.start('scan');t+=31*60_000;
    assert.equal(jobs.stuck()[0].kind,'scan');
    assert.equal(jobs.checks().find(c=>c.id==='jobs').state,'warn');
    // Connectivity: only changes are written; an outage closes when the state is ok again.
    await jobs.sample();status={...status,tailscale:{state:'Stopped'}};t+=60_000;await jobs.sample();await jobs.sample();
    t+=10*60_000;status={...status,tailscale:{state:'Running'}};await jobs.sample();
    const out=jobs.view().connectivity.outages;
    assert.deepEqual(out.map(o=>[o.what,o.state,o.minutes]),[['tailscale','Stopped',10]]);
    const lines=(await fs.readFile(path.join(dir,'logs','connectivity.log'),'utf8')).trim().split('\n');
    assert.equal(lines.length,5,'gateway, tunnel, tailscale, then stopped and running again');
    jobs.close();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('a busy flag polled over time becomes one job',async()=>{
  let busy='beolvasás',t=0;
  const jobs=createJobLedger({now:()=>t,every:10});
  jobs.watch('busy',()=>busy);
  assert.equal(jobs.view().running[0].detail,'beolvasás');
  t=4000;busy=null;await new Promise(r=>setTimeout(r,40));
  assert.equal(jobs.view().running.length,0);
  assert.deepEqual(jobs.view().recent.map(r=>[r.kind,r.detail,r.ms]),[['busy','beolvasás',4000]]);
  jobs.close();
});

test('outages and cost alerts',()=>{
  const o=outagesFrom([{at:'2026-11-13T10:00:00Z',what:'tunnel',state:'down',ok:false},{at:'2026-11-13T10:30:00Z',what:'tunnel',state:'ok',ok:true},{at:'2026-11-13T11:00:00Z',what:'gateway',state:'down',ok:false}],{now:Date.parse('2026-11-13T11:20:00Z')});
  assert.deepEqual(o.map(x=>[x.what,x.minutes,x.to===null]),[['gateway',20,true],['tunnel',30,false]]);
  const days=[{day:'2026-11-13',cost_usd:0.9},{day:'2026-11-12',cost_usd:0.3},{day:'2026-11-11',cost_usd:0.25},{day:'2026-11-10',cost_usd:0.35}];
  assert.equal(costAlert({days,runs:[],today:'2026-11-13'}).day_alert,true);
  assert.equal(costAlert({days:days.map(d=>d.day==='2026-11-13'?{...d,cost_usd:0.4}:d),runs:[],today:'2026-11-13'}).day_alert,false);
  assert.equal(costAlert({days:[{day:'2026-11-13',cost_usd:0.1},{day:'2026-11-12',cost_usd:0}],runs:[],today:'2026-11-13'}).day_alert,false,'small sums never alert');
  const runs=[{cost_usd:0.3},{cost_usd:0.05},{cost_usd:0.06},{cost_usd:0.04}];
  assert.equal(costAlert({days:[],runs,today:'x'}).run_alert,true);
});
