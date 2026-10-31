import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pilotModelIds,pilotProviderConfig,pilotComparisonConfigs,pilotUsageCost,pilotPlanHash,validatePilotApproval} from './cloud-scene-pilot-support.mjs';
const preview=()=>{const p={kind:'private-cloud-scene-pilot-preview',models:pilotModelIds.map(pilotProviderConfig),budget_usd:2,items:['A1','B2','C1','D2','E3'].map(label=>({label})),requests:Array.from({length:10},(_,index)=>({index}))};p.plan_hash=pilotPlanHash(p);return p;};
const approval=plan=>({plan_hash:plan.plan_hash,ack_upload:true,ack_cost:true,ack_adult_context:true,max_total_usd:2,selected_codes:plan.items.map(i=>i.label),expires_at:new Date(Date.now()+60000).toISOString()});
test('cloud pilot requires exact current five-image/two-model transfer, cost and adult-context approval',()=>{
  const plan=preview(),ok=approval(plan);assert.doesNotThrow(()=>validatePilotApproval(plan,ok));
  for(const change of [{ack_upload:false},{ack_cost:false},{ack_adult_context:false},{max_total_usd:20},{expires_at:'2000-01-01'},{selected_codes:['other']}])assert.throws(()=>validatePilotApproval(plan,{...ok,...change}));
  const changed=structuredClone(plan);changed.items[0].label='A3';assert.throws(()=>validatePilotApproval(changed,ok));
  const expanded=structuredClone(plan);expanded.models[0].image_detail='auto';expanded.plan_hash=pilotPlanHash(expanded);assert.throws(()=>validatePilotApproval(expanded,approval(expanded)));
});
test('cloud pilot cost uses cached input discount and already-inclusive output, without adding reasoning twice',()=>{
  const usage={input_tokens:2000,output_tokens:1000,total_tokens:3000,cached_input_tokens:1000,reasoning_output_tokens:800};assert.equal(pilotUsageCost(usage,'gpt-6.1-terra'),.00605);assert.equal(pilotUsageCost(usage,'gpt-6.1-sol'),.0121);
});
test('follow-up approval binds Sol medium and Astra low without unlocking other settings or reusing the first approval',()=>{
  const old=preview(),plan={...preview(),suite:'sol-medium-astra-low',models:pilotComparisonConfigs('sol-medium-astra-low')};plan.plan_hash=pilotPlanHash(plan);
  assert.doesNotThrow(()=>validatePilotApproval(plan,approval(plan)));
  assert.throws(()=>validatePilotApproval(plan,approval(old)));
  assert.deepEqual(plan.models.map(c=>[c.model,c.reasoning_effort]),[['gpt-6.1-sol','medium'],['gpt-6-astra','low']]);
  const changed=structuredClone(plan);changed.models[1].reasoning_effort='high';changed.plan_hash=pilotPlanHash(changed);assert.throws(()=>validatePilotApproval(changed,approval(changed)));
  assert.throws(()=>pilotComparisonConfigs('all-models'));
  assert.equal(pilotUsageCost({input_tokens:2000,cached_input_tokens:1000,output_tokens:1000},'gpt-6-astra'),.061);
});
