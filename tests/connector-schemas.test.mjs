// Connector schema lint (debugging package, 2026-11-13). One schema ChatGPT's strict validator
// rejects makes the whole connector answer {"detail":"Bad Request"} (seen on 2026-11-13).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lintAll,lintTool} from '../mcp/schema-lint.mjs';

// Free-form objects ChatGPT already accepted. A new one must be reviewed and added here.
const KNOWN_FREE_FORM=['propose_ghost_profile.values: object without properties (free-form)','propose_story_event.event: object without properties (free-form)'];

test('every connector tool schema passes the strict lint',()=>{
  const r=lintAll();
  assert.ok(r.count>=60,'all tool groups are covered');
  assert.deepEqual(r.errors,[]);
  assert.deepEqual(r.warnings.sort(),[...KNOWN_FREE_FORM].sort());
});

test('the lint catches the shapes that broke the connector',()=>{
  const t=props=>({name:'x',description:'d',inputSchema:{type:'object',properties:props,additionalProperties:false}});
  assert.match(lintTool(t({m:{type:'object',additionalProperties:{type:'string'}}})).join(),/additionalProperties is a schema/);
  assert.match(lintTool(t({a:{type:'array'}})).join(),/array without items/);
  assert.match(lintTool(t({a:{description:'no type'}})).join(),/no type/);
  assert.match(lintTool({name:'bad name',description:'d',inputSchema:{type:'object',properties:{},required:['q']}}).join(),/invalid tool name.*required "q"/);
  assert.deepEqual(lintTool(t({list:{type:'array',items:{type:'object',properties:{x:{type:'number'}},required:['x'],additionalProperties:false}}})),[]);
});
