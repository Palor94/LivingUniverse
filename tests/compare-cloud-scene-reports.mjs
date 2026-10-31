// Local artifact composition only: reuse the completed Sol-low baseline without resubmission.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pilotPlanHash} from './cloud-scene-pilot-support.mjs';
import {renderCloudSceneReport,cloudSceneSummary} from './render-cloud-scene-report.mjs';

const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){if(!['--baseline','--output'].includes(args[i])||!args[i+1])throw Error('Explicit baseline and completed follow-up required');opts[args[i]]=path.resolve(args[i+1]);}
if(!opts['--baseline']||!opts['--output'])throw Error('Explicit baseline and completed follow-up required');
const read=async(root,file)=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const first={plan:await read(opts['--baseline'],'plan.json'),report:await read(opts['--baseline'],'report.json')},next={plan:await read(opts['--output'],'plan.json'),report:await read(opts['--output'],'report.json')};
for(const value of [first,next]){assert.equal(value.plan.plan_hash,pilotPlanHash(value.plan));assert.equal(value.report.plan_hash,value.plan.plan_hash);assert.equal(value.report.complete,true);assert.equal(value.report.live_selected_records_unchanged,true);}
assert.deepEqual(first.plan.items,next.plan.items);assert.deepEqual(first.plan.goals,next.plan.goals);
for(const file of ['prompt.txt','schema.json'])assert.equal(await fs.readFile(path.join(opts['--baseline'],file),'utf8'),await fs.readFile(path.join(opts['--output'],file),'utf8'));
const baseline=first.plan.models.find(c=>c.model==='gpt-6.1-sol'&&c.reasoning_effort==='low');assert.ok(baseline);
const variants=[{...baseline,variant:'GPT-6.1 Sol · low (korábbi)'},...next.plan.models.map(c=>({...c,variant:c.model+' · '+c.reasoning_effort}))];
const baselineAttempts=first.report.attempts.filter(a=>a.model===baseline.model);assert.equal(baselineAttempts.length,5);
const attempts=[...baselineAttempts.map(a=>({...a,variant:variants[0].variant})),...next.report.attempts.map(a=>({...a,variant:variants.slice(1).find(c=>c.model===a.model)?.variant}))];
assert.ok(attempts.every(a=>a.variant));
const plan={...next.plan,models:variants},report={...next.report,attempts};
let html=renderCloudSceneReport(plan,report);
html=html.replace('<table>','<p>A korábbi Sol low eredményei újraküldés nélkül szerepelnek. Az új tízhívásos próba számított költsége: '+next.report.calculated_cost_usd.toFixed(5)+' USD.</p><table>');
await fs.writeFile(path.join(opts['--output'],'results.html'),html);
const summary={new_cost_usd:next.report.calculated_cost_usd,baseline_reused_without_calls:true,models:cloudSceneSummary(report)};
await fs.writeFile(path.join(opts['--output'],'comparison-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
