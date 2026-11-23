// Robot player (2026-11-23): the live budget guard never lets a call pass the cap, counts an
// uncertain failure as spent, and the journeys list stays well-formed. No network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {budgetGuard,PALOR_LINES} from '../ops/robot-player.mjs';
import {JOURNEYS} from '../ops/ui-journeys.mjs';

const prices={input:0.2,cached_input:0.05,output:0.5};
const req={system:'x'.repeat(30000),user:'y'.repeat(30000),maxTokens:700};
test('budget guard: reserves the worst case, refuses past the cap, stops the robot',async()=>{
  let sent=0;const g=budgetGuard({name:'xai',model:'m',async complete(){sent++;return {text:'{}',usage:{input:15000,cached:0,output:200}};}},{maxUsd:0.05,prices});
  let refused=false;for(let i=0;i<20;i++){try{await g.provider.complete(req);}catch(e){refused=true;assert.equal(e.code,'AI_FAILED');break;}}
  assert.ok(refused&&g.state.exhausted);assert.ok(g.state.spent<=0.05,'never above the cap: '+g.state.spent);assert.equal(sent,g.state.calls);
});
test('budget guard: an uncertain failure counts its full reservation',async()=>{
  const g=budgetGuard({name:'xai',model:'m',async complete(){throw Object.assign(Error('cut'),{code:'AI_UNCERTAIN'});}},{maxUsd:1,prices});
  await assert.rejects(g.provider.complete(req));assert.ok(g.state.spent>0.01);
  const h=budgetGuard({name:'xai',model:'m',async complete(){throw Object.assign(Error('offline'),{code:'AI_FAILED'});}},{maxUsd:1,prices});
  await assert.rejects(h.provider.complete(req));assert.equal(h.state.spent,0);
});
test('robot lines and journeys are well-formed',()=>{
  assert.ok(PALOR_LINES.length>=10&&PALOR_LINES.every(l=>typeof l==='string'&&l.length<200));
  assert.ok(JOURNEYS.length>=4);for(const j of JOURNEYS){assert.ok(j.id&&j.steps.length);for(const s of j.steps)assert.equal(typeof s.run,'function');}
});
