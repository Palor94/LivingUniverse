import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudSceneSummary,renderCloudSceneReport} from './render-cloud-scene-report.mjs';
import {sceneWire} from './analysis-scene-fixtures.mjs';

test('local comparison keeps cached Sol baseline and fresh Sol medium results in distinct columns',()=>{
  const models=['low','medium'].map(reasoning_effort=>({model:'gpt-6.1-sol',reasoning_effort,variant:'Sol '+reasoning_effort}));
  const attempts=models.map((m,i)=>({...m,media_id:'synthetic',status:'succeeded',cost_usd:i+.01,elapsed_ms:1000,result:{...sceneWire(),description:{hu:i?'MEDIUM_RESULT':'LOW_RESULT',en:'Synthetic'}}}));
  const report={attempts,finished_at:'2026-10-31'},plan={models,items:[{media_id:'synthetic',label:'fixture',staging_name:'fixture.jpg'}]};
  assert.deepEqual(cloudSceneSummary(report).map(s=>[s.model,s.succeeded,s.known_cost_usd]),[['Sol low',1,.01],['Sol medium',1,1.01]]);
  const html=renderCloudSceneReport(plan,report);
  assert.equal((html.match(/LOW_RESULT/g)||[]).length,1);assert.equal((html.match(/MEDIUM_RESULT/g)||[]).length,1);
  assert.ok(!html.includes('<script'));assert.ok(!html.includes('src="http'));
});
