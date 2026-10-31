import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryProviderConfig,libraryPlanHash,validateLibraryApproval,libraryCanSend,libraryUsageCost,effectiveLibraryBudget,libraryScope} from './library-run-support.mjs';
const preview=()=>{const plan={kind:'private-world-library-plan',provider:libraryProviderConfig(),budget_usd:30,items:[{media_id:'synthetic',original:{sha256:'fixture'},staging_name:'fixture.jpg'}]};plan.plan_hash=libraryPlanHash(plan);return plan;};
const approval=plan=>({plan_hash:plan.plan_hash,ack_upload:true,ack_cost:true,max_total_usd:30,expires_at:new Date(Date.now()+60000).toISOString()});
test('full-library approval binds corpus, Sol-medium world contract, budget and expiry independently of pilot approval',()=>{
  const plan=preview();assert.doesNotThrow(()=>validateLibraryApproval(plan,approval(plan)));
  for(const patch of [{ack_cost:false},{ack_upload:false},{max_total_usd:100},{expires_at:'2000-01-01'},{plan_hash:'old-pilot'}])assert.throws(()=>validateLibraryApproval(plan,{...approval(plan),...patch}));
  const changed=structuredClone(plan);changed.provider.reasoning_effort='high';changed.plan_hash=libraryPlanHash(changed);assert.throws(()=>validateLibraryApproval(changed,approval(changed)));
  const duplicate=structuredClone(plan);duplicate.items.push(duplicate.items[0]);duplicate.plan_hash=libraryPlanHash(duplicate);assert.throws(()=>validateLibraryApproval(duplicate,approval(duplicate)));
});
test('library guard refuses retries, uncertainty, operator stop and insufficient budget before another transfer',()=>{
  const state={config:libraryProviderConfig(),alreadyAttempted:false,unknownOutcome:false,stopped:false,spent:0};assert.equal(libraryCanSend(state),true);
  for(const patch of [{alreadyAttempted:true},{unknownOutcome:true},{stopped:true},{spent:29.95},{spent:NaN}])assert.equal(libraryCanSend({...state,...patch}),false);
  assert.equal(libraryUsageCost({input_tokens:2000,cached_input_tokens:1000,output_tokens:1000,reasoning_output_tokens:800}),.0121);
});
test('explicit 35 USD amendment changes only the total guard and preserves the immutable transfer plan and pause',()=>{
  const plan=preview(),before=JSON.stringify(plan),amendment={kind:'private-library-budget-amendment',base_plan_hash:plan.plan_hash,max_total_usd:35,resume_authorized:false,approved_at:new Date().toISOString()};
  assert.equal(effectiveLibraryBudget(plan),30);assert.equal(effectiveLibraryBudget(plan,amendment),35);assert.equal(JSON.stringify(plan),before);assert.doesNotThrow(()=>validateLibraryApproval(plan,approval(plan)));
  const state={config:libraryProviderConfig(),alreadyAttempted:false,unknownOutcome:false,stopped:false,spent:30};assert.equal(libraryCanSend(state),false);assert.equal(libraryCanSend({...state,budget_usd:35}),true);assert.equal(libraryCanSend({...state,budget_usd:35,stopped:true}),false);
  for(const patch of [{base_plan_hash:'other-plan'},{max_total_usd:350},{resume_authorized:true}])assert.throws(()=>effectiveLibraryBudget(plan,{...amendment,...patch}));
});
test('expanded 35 USD scope requires a fresh exact approval and cannot run unrelated historical queue items',()=>{
  const old=preview(),plan={...preview(),budget_usd:35};plan.plan_hash=libraryPlanHash(plan);const accepted={...approval(plan),max_total_usd:35};assert.doesNotThrow(()=>validateLibraryApproval(plan,accepted));assert.throws(()=>validateLibraryApproval(plan,approval(old)));
  assert.deepEqual(libraryScope(plan),{sql:'media_id IN (?)',ids:['synthetic']});assert.throws(()=>libraryScope({...plan,items:[]}));
});
