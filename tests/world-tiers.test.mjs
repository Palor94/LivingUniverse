import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('world tiers: close characters act every day part, distant ones every other; lively tempo wakes everyone',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-tiers-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const agentCalls=[];let clock=new Date('2026-11-10T07:00:00');
  const provider=createMockProvider(req=>{
    const m=req.system.match(/Te most (.+?) vagy\./);if(m)agentCalls.push(m[1]);
    if(req.system.includes('játékmester'))return {events:[]};
    return {intention:'Pihen.',location_id:null,wants_to_meet:[],message_to_palor:null};
  });
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>clock});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),close=await mk('Közeli Ede'),far=[];for(const n of ['Távoli Aba','Távoli Bodó','Távoli Csaba','Távoli Dénes'])far.push(await mk(n));
  for(const c of [close,...far])app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Rutin.')},history:[],proposals:[]}));
  await call('/api/world-engine/levels',{source_id:close.id,target_id:palor.id,level:2});
  await call('/api/world-engine/settings',{enabled:true});

  // A morning and an afternoon round: the close one twice, each distant one exactly once.
  await call('/api/world-engine/run',{});clock=new Date('2026-11-10T13:00:00');await call('/api/world-engine/run',{});
  const count=name=>agentCalls.filter(n=>n===name).length;
  assert.equal(count('Közeli Ede'),2,JSON.stringify(agentCalls));
  for(const f of far)assert.equal(count(f.name),1,f.name+': '+JSON.stringify(agentCalls));
  // The cost estimate counts distant characters at half.
  const st=(await call('/api/world-engine')).data;assert.ok(st.estimate_per_day_usd>0);

  // Lively tempo: everyone acts in the evening round.
  await call('/api/world-engine/settings',{tempo:'lively'});
  agentCalls.length=0;clock=new Date('2026-11-10T19:00:00');
  await call('/api/world-engine/run',{});
  for(const c of [close,...far])assert.equal(count(c.name),1,c.name);
});
