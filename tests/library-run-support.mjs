import {analysisDigest} from '../app/analysis-model.mjs';
import {pilotProviderConfig,pilotUsageCost} from './cloud-scene-pilot-support.mjs';
export const libraryProviderConfig=()=>({...pilotProviderConfig('gpt-6.1-sol'),result_contract:'world-v1',reasoning_effort:'medium',cost:{...pilotProviderConfig('gpt-6.1-sol').cost,input_tokens_per_image:10000,max_total_usd:30}});
export const libraryPlanHash=plan=>{const {plan_hash,...value}=plan;return analysisDigest(value);};
export function validateLibraryApproval(plan,approval){
  if(plan.kind!=='private-world-library-plan'||plan.plan_hash!==libraryPlanHash(plan)||analysisDigest(plan.provider)!==analysisDigest(libraryProviderConfig())||![30,35].includes(plan.budget_usd)||!Array.isArray(plan.items)||!plan.items.length||new Set(plan.items.map(i=>i.media_id)).size!==plan.items.length||plan.items.some(i=>!i.original?.sha256||!i.staging_name||i.staging_name.includes('/')||i.staging_name.includes('\\')))throw Error('LIBRARY_PLAN_CHANGED');
  if(approval?.plan_hash!==plan.plan_hash||approval.ack_upload!==true||approval.ack_cost!==true||approval.max_total_usd!==plan.budget_usd||!Number.isFinite(Date.parse(approval.expires_at))||Date.parse(approval.expires_at)<=Date.now())throw Error('EXPLICIT_LIBRARY_APPROVAL_REQUIRED');
}
export const libraryUsageCost=usage=>pilotUsageCost(usage,'gpt-6.1-sol');
export function libraryScope(plan){const ids=plan.items.map(i=>i.media_id);if(!ids.length||ids.length>20000||new Set(ids).size!==ids.length)throw Error('INVALID_LIBRARY_SCOPE');return {sql:'media_id IN ('+ids.map(()=>'?').join(',')+')',ids};}
export function effectiveLibraryBudget(plan,amendment=null){
  if(!amendment)return plan.budget_usd;
  if(amendment.kind!=='private-library-budget-amendment'||amendment.base_plan_hash!==plan.plan_hash||amendment.max_total_usd!==35||amendment.resume_authorized!==false||!Number.isFinite(Date.parse(amendment.approved_at)))throw Error('INVALID_BUDGET_AMENDMENT');
  return amendment.max_total_usd;
}
export const libraryNextAllowance=config=>(config.cost.input_tokens_per_image*config.cost.input_usd_per_million+config.max_output_tokens*config.cost.output_usd_per_million)/1e6;
export function libraryCanSend({alreadyAttempted,unknownOutcome,stopped,spent,config,budget_usd=config.cost.max_total_usd}){return !alreadyAttempted&&!unknownOutcome&&!stopped&&Number.isFinite(spent)&&Number.isFinite(budget_usd)&&spent+libraryNextAllowance(config)<=budget_usd;}
