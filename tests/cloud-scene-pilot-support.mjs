import {analysisDigest} from '../app/analysis-model.mjs';
export const pilotModelIds=['gpt-6.1-terra','gpt-6.1-sol'];
const prices={'gpt-6.1-terra':[1,5,0.05],'gpt-6.1-sol':[2,10,0.1],'gpt-6-astra':[10,50,1]};
export function pilotProviderConfig(model){
  if(!Object.hasOwn(prices,model))throw Error('Unsupported pilot model');
  const scale=prices[model][0];
  return {enabled:true,model,model_revision:model,result_contract:'scene-v1',image_detail:'high',reasoning_effort:'low',timeout_ms:180000,max_response_bytes:262144,max_output_tokens:8192,cost:{input_usd_per_million:scale,output_usd_per_million:5*scale,input_tokens_per_image:8000,max_total_usd:2,basis:'Official OpenAI Standard short-context prices checked 2026-10-31; no caching discount assumed.',limitations:'Input allowance is an estimate including image/prompt/schema. Output cap includes reasoning. Not a provider billing cap; taxes and account adjustments excluded.'}};
}
export function pilotComparisonConfigs(suite='terra-sol-low'){
  if(suite==='terra-sol-low')return pilotModelIds.map(pilotProviderConfig);
  if(suite==='sol-medium-astra-low')return [{...pilotProviderConfig('gpt-6.1-sol'),reasoning_effort:'medium'},pilotProviderConfig('gpt-6-astra')];
  throw Error('Unsupported pilot comparison');
}
export function pilotUsageCost(usage,model){
  const c=pilotProviderConfig(model).cost,cachedRate=prices[model][2];
  return ((usage.input_tokens-usage.cached_input_tokens)*c.input_usd_per_million+usage.cached_input_tokens*cachedRate+usage.output_tokens*c.output_usd_per_million)/1e6;
}
export const pilotPlanHash=plan=>{const {plan_hash,...value}=plan;return analysisDigest(value);};
export function validatePilotApproval(plan,approval){
  if(plan.kind!=='private-cloud-scene-pilot-preview'||plan.plan_hash!==pilotPlanHash(plan)||plan.items.length!==5||plan.requests.length!==10||plan.budget_usd!==2||JSON.stringify(plan.models)!==JSON.stringify(pilotComparisonConfigs(plan.suite)))throw Error('PREVIEW_CHANGED');
  if(approval?.plan_hash!==plan.plan_hash||approval.ack_upload!==true||approval.ack_cost!==true||approval.ack_adult_context!==true||approval.max_total_usd!==plan.budget_usd||!Number.isFinite(Date.parse(approval.expires_at))||Date.parse(approval.expires_at)<Date.now()||JSON.stringify(approval.selected_codes)!==JSON.stringify(plan.items.map(i=>i.label)))throw Error('EXACT_CLOUD_APPROVAL_REQUIRED');
}
