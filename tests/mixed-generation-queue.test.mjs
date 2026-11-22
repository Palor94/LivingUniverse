import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installAssetGeneration} from '../app/asset-generation.mjs';
import {installGenerationSessions} from '../app/generation-sessions.mjs';
import {installPlayImageWorker} from '../app/play-image-worker.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');

test('mixed queue shares durable budgets, keeps background selection, stops after revocation or uncertain billing',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-mixed-')),db=new DatabaseSync(':memory:');t.after(async()=>{db.close();await fs.rm(dir,{recursive:true,force:true});});
  db.exec('CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE image_generation_runs(id TEXT,request_key TEXT);CREATE TABLE canon(id TEXT,character_id TEXT);CREATE TABLE locations(id TEXT,name TEXT,tag_id TEXT);');
  const cid=randomUUID(),lid=randomUUID(),mid=randomUUID();db.prepare('INSERT INTO canon VALUES(?,?)').run(randomUUID(),cid);db.prepare('INSERT INTO locations VALUES(?,?,?)').run(lid,'Synthetic room',randomUUID());
  const sql={one:(s,...a)=>db.prepare(s).get(...a),all:(s,...a)=>db.prepare(s).all(...a),run:(s,...a)=>db.prepare(s).run(...a),transaction:fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  let sessions,providerCalls=0,figureCalls=0,mode='ok',sid,price=.002;const plans=new Map(),placements=[];
  const assets=installAssetGeneration({...sql,dataDir:dir,backgrounds:{},locationTree:{load:async()=>({nodes:[]})},guests:{},config:{providers:{sogni_text:{enabled:true,model:'z-turbo'}}},env:{SOGNI_API_KEY:'fixture'},generate:async args=>{
    if(args.estimate)return {capacity_units:2,usd:price};providerCalls++;assert.equal(sessions.get(sid).reservations.length,1,'full background reservation precedes dispatch');
    if(mode==='revoke')sessions.revoke(sid,'owner');if(mode==='uncertain')throw Error('connection lost after submission');return {outputs:[{bytes:png},{bytes:png}]};
  }});
  const images={capabilities:()=>({providers:[{provider:'sogni',available:true}]}),prepare:async args=>{const rid=randomUUID(),manifest={...args,n:1,model:'fixture-reference-model',sogni_estimate:{source:'sogni',capacity_units:1,usd:.001,estimated_at:new Date().toISOString()}},plan={run_id:rid,status:'pending',manifest,manifest_hash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),expires_at:new Date(Date.now()+3600000).toISOString(),outputs:[]};plans.set(rid,plan);sql.run('INSERT INTO image_generation_runs VALUES(?,?)',rid,args.request_key);return structuredClone(plan);},view:rid=>structuredClone(plans.get(rid)),execute:async(rid,grant)=>{const plan=plans.get(rid);sql.transaction(()=>{sessions.reserve(grant,rid,plan.manifest_hash);plan.status='running';});figureCalls++;plan.status='succeeded';plan.outputs=[{media_id:mid,active:true}];},settle:async()=>{}};
  sessions=installGenerationSessions({...sql,imageGeneration:images,viewRun:rid=>plans.has(rid)?images.view(rid):assets.view(rid)});assets.setSessions(sessions);
  const worker=installPlayImageWorker({...sql,imageGeneration:images,assetGeneration:assets,sessions,playAssets:{brief:async args=>({...args,prompt:'Exact synthetic empty room or adult male figure.',content_expected:'non_intimate'}),startJob:async()=>({job_id:randomUUID()}),finishJob:async(args,internal)=>{placements.push({args,internal});return {status:'done',placed:{placed_media_id:randomUUID()}};}},origin:{everydayReferences:()=>[{media_id:mid,role:'face'}]},playMode:{},palor:()=>null,identity:{checkGenerated:async()=>({face_verdict:'matches',body_verdict:'unknown'})}});
  async function pair(){const background=await worker.prepare({target:'background',location_id:lid,time_of_day:'este',request_key:'background_'+randomUUID(),output_count:2,max_estimated_capacity_units:4});await assets.estimate(background.run_id,{manifest_hash:background.plan.manifest_hash,acknowledge_external_text:true},'owner');const figure=await worker.prepare({target:'figure',character_id:cid,expression:'alap',request_key:'figure_'+randomUUID(),output_count:1,max_estimated_capacity_units:4});return [worker.view(background.run_id),figure];}
  function grant(orders,extra={}){const draft=sessions.prepare({run_ids:orders.map(o=>o.run_id),expires_at:new Date(Date.now()+600000).toISOString(),max_images:3,max_capacity_units:3,max_usd:.003,...extra},'owner');return sessions.approve(draft.id,{scope_hash:draft.scope_hash,acknowledge_external_upload_and_cost:true},'owner');}
  const orders=await pair();assert.throws(()=>grant(orders,{max_images:2}),{code:'SESSION_BUDGET'});sid=grant(orders).id;await worker.startWorker(sid);await worker.settle();
  assert.equal(providerCalls,1);assert.equal(figureCalls,1);assert.equal(worker.view(orders[0].run_id).status,'selection_required');assert.equal(worker.view(orders[1].run_id).status,'placed');assert.equal(placements.length,1,'no automatic background choice');
  const reservations=sessions.get(sid).reservations;assert.equal(reservations.reduce((n,r)=>n+r.images,0),3);assert.equal(reservations.reduce((n,r)=>n+r.micro_usd,0),3000);
  await worker.place(orders[0].run_id,1);assert.deepEqual(placements[1].internal.bytes,png);assert.equal(placements[1].internal.source,'Sogni');await worker.startWorker(sid);await worker.settle();assert.equal(providerCalls,1);
  mode='revoke';const revoked=await pair();sid=grant(revoked).id;await worker.startWorker(sid);await worker.settle();assert.equal(figureCalls,1,'revocation stops the next job');assert.equal(worker.view(revoked[1].run_id).plan.status,'pending');
  mode='uncertain';const uncertain=await pair();sid=grant(uncertain).id;await worker.startWorker(sid);await worker.settle();assert.equal(worker.view(uncertain[0].run_id).plan.status,'uncertain');const calls=providerCalls;await worker.startWorker(sid);await worker.settle();assert.equal(providerCalls,calls,'uncertain paid outcome is never retried');assert.equal(sessions.get(sid).reservations.length,1);assert.equal(figureCalls,1);
  price=null;const unknown=await pair();assert.throws(()=>grant(unknown),{code:'SESSION_PRICE_UNKNOWN'});assert.equal(providerCalls,calls);
});
