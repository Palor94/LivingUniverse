import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {installGenerationSessions} from '../app/generation-sessions.mjs';
test('scoped grants require verified prices, freeze manifests, atomically reserve ceilings and retain uncertain charges',()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');let time=Date.now();const plans=new Map(),id=randomUUID();
  const manifest={provider:'sogni',model:'fixture-v1',n:2,max_estimated_capacity_units:10,characters:[{character_id:randomUUID(),revision_id:randomUUID(),references:[{media_id:randomUUID(),sha256:'a'.repeat(64)}]}],sogni_estimate:{source:'sogni',capacity_units:6,usd:null,estimated_at:new Date(time).toISOString()}},rehash=()=>createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const plan={run_id:id,status:'pending',expires_at:new Date(time+3600000).toISOString(),manifest,manifest_hash:rehash()};plans.set(id,plan);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const sessions=installGenerationSessions({one:(sql,...args)=>db.prepare(sql).get(...args),all:(sql,...args)=>db.prepare(sql).all(...args),run:(sql,...args)=>db.prepare(sql).run(...args),transaction,imageGeneration:{view:rid=>structuredClone(plans.get(rid))},clock:()=>time});
  const prepare=(extra={})=>sessions.prepare({run_ids:[id],expires_at:new Date(time+1800000).toISOString(),max_images:2,max_capacity_units:6,max_usd:0.02,...extra},'owner'),approve=value=>sessions.approve(value.id,{scope_hash:value.scope_hash,acknowledge_external_upload_and_cost:true},'owner');
  try{
    assert.throws(()=>approve(prepare()),{code:'SESSION_PRICE_UNKNOWN'});manifest.sogni_estimate.usd=0.01;plan.manifest_hash=rehash();const draft=prepare();assert.throws(()=>sessions.approve(draft.id,{scope_hash:draft.scope_hash},'owner'),{code:'APPROVAL_REQUIRED'});
    assert.throws(()=>approve(prepare({max_images:1})),{code:'SESSION_BUDGET'});const granted=approve(draft);assert.equal(granted.status,'approved');
    assert.throws(()=>transaction(()=>{sessions.reserve(granted.id,id,plan.manifest_hash);throw Error('dispatch transaction failed');}));assert.equal(sessions.get(granted.id).reservations.length,0);
    transaction(()=>sessions.reserve(granted.id,id,plan.manifest_hash));assert.equal(sessions.get(granted.id).reservations[0].micro_usd,10000);assert.throws(()=>transaction(()=>sessions.reserve(granted.id,id,plan.manifest_hash)),{code:'SESSION_ALREADY_RESERVED'});
    // An uncertain result never releases a reservation, including after restart.
    assert.equal(JSON.parse(db.prepare('SELECT value FROM application_settings WHERE key=?').get('generation-session:'+granted.id).value).reservations.length,1);
    const revoked=approve(prepare());sessions.revoke(revoked.id,'owner');assert.throws(()=>transaction(()=>sessions.reserve(revoked.id,id,plan.manifest_hash)),{code:'SESSION_EXPIRED'});
    const changed=approve(prepare());manifest.prompt='changed';plan.manifest_hash=rehash();assert.throws(()=>transaction(()=>sessions.reserve(changed.id,id,plan.manifest_hash)),{code:'SESSION_SCOPE_CHANGED'});delete manifest.prompt;plan.manifest_hash=rehash();
    const expired=approve(prepare());time+=300001;assert.throws(()=>transaction(()=>sessions.reserve(expired.id,id,plan.manifest_hash)),{code:'ESTIMATE_EXPIRED'});
  }finally{db.close();}
});
