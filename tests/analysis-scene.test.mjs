import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sceneFixture,sceneWire} from './analysis-scene-fixtures.mjs';
import {validateSceneDetails,responseUsage} from '../app/analysis-scene.mjs';
import {validateAnalysisResult,analysisDigest,analysisHash,matchAnalysisResult} from '../app/analysis-model.mjs';
import {analysisOutputSchema,sceneAnalysisOutputSchema,sceneAnalysisPrompt,validateAnalysisWireResult} from '../app/analysis-schema.mjs';
import {createAnalysisProvider} from '../app/analysis-providers.mjs';
import {renderAnalysisScene} from '../app/public/media-analysis.js';

test('opt-in scene wire preserves non-exclusive settings and unmapped per-activity participants without creating place proposals',()=>{
  const result=validateAnalysisWireResult(sceneWire(),sceneAnalysisOutputSchema);assert.equal(result.scene_details.compatible_settings.length,2);assert.equal(result.scene_details.participants[0].character_id,null);assert.ok(matchAnalysisResult(result,[],[],['background']).every(p=>p.kind!=='location'));
  assert.throws(()=>validateAnalysisWireResult(sceneWire(),analysisOutputSchema),{code:'INVALID_RESULT'});
  const legacy=sceneWire();delete legacy.scene_details;assert.equal(validateAnalysisWireResult(legacy).scene_details,undefined);
});
for(const [label,mutate]of [
  ['invented character ID',s=>s.participants[0].character_id='some-character'],
  ['invented place ID',s=>s.compatible_settings[0].location_id='some-place'],
  ['unknown role participant',s=>s.activities[0].roles[0].participant_id='p8'],
  ['duplicate participant',s=>s.participants.push(structuredClone(s.participants[0]))],
  ['duplicate role',s=>s.activities[0].roles.push(structuredClone(s.activities[0].roles[0]))],
  ['out-of-bounds region',s=>s.participants[0].region.width=1.1],
  ['automatic simulation approval',s=>s.simulation_use.approved=true]
])test('scene validator refuses '+label,()=>{const s=sceneFixture();mutate(s);assert.throws(()=>validateSceneDetails(s,'scene'),{code:'INVALID_RESULT'});});

test('neutral reference backdrop requires narration-only character introduction and has no scene compatibility',()=>{
  const s=sceneFixture();assert.throws(()=>validateSceneDetails(s,'neutral'),{code:'INVALID_RESULT'});s.compatible_settings=[];s.simulation_use={...s.simulation_use,suggested_scope:'character_introduction',narration_only:true};assert.ok(validateSceneDetails(s,'neutral'));s.simulation_use.narration_only=false;assert.throws(()=>validateSceneDetails(s,'neutral'),{code:'INVALID_RESULT'});
});
test('scene review shows multiple hypotheses, action-specific roles and unmapped identities with escaped text',()=>{
  const s=sceneFixture();s.activities[0].roles[0].role='giving_oral';s.activities[0].roles[1].role='receiving_oral';s.compatible_settings[0].label.hu='<script>fixture</script>';
  const html=renderAnalysisScene(s);assert.match(html,/petrol-station washroom/u);assert.match(html,/orális stimulációt végző/u);assert.match(html,/orális stimulációt fogadó/u);assert.match(html,/karakterhez még nincs megfeleltetve/u);assert.match(html,/&lt;script&gt;/u);assert.doesNotMatch(html,/<script>/u);
});
const config=()=>({enabled:true,model:'fixture-scene',model_revision:'fixture-scene',result_contract:'scene-v1',image_detail:'high',reasoning_effort:'low',max_output_tokens:8192,cost:{basis:'Fixture only',limitations:'Not a billing cap',input_usd_per_million:1,output_usd_per_million:5,input_tokens_per_image:8000,max_total_usd:2}});
const image={bytes:Buffer.from('synthetic-bytes'),mime_type:'image/jpeg'};image.sha256=analysisHash(image.bytes);
const usage={input_tokens:2000,output_tokens:100,total_tokens:2100,input_tokens_details:{cached_tokens:200},output_tokens_details:{reasoning_tokens:50}};
const envelope=()=>({model:'fixture-scene',status:'completed',usage,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(sceneWire())}]}]});
test('scene OpenAI request binds actual schema/detail/reasoning and captures sanitized usage separately from model content',async()=>{
  const receipts=[],calls=[],p=createAnalysisProvider('openai',config(),{env:{OPENAI_API_KEY:'synthetic-key'},fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(envelope());},onReceipt:r=>receipts.push(r)});
  const args={image,goals:['background','action','angle','framing','reference_use'],signal:new AbortController().signal,admin_notes:'never-transfer'};const body=p.requestBody(args);
  assert.equal(body.instructions,sceneAnalysisPrompt);assert.equal(body.input[0].content[1].detail,'high');assert.deepEqual(body.reasoning,{effort:'low'});assert.deepEqual(body.text.format.schema,sceneAnalysisOutputSchema);assert.doesNotMatch(JSON.stringify(body),/never-transfer/u);
  const result=await p.analyzeImage({...args,authorization:{request_sha256:analysisDigest(body)}});assert.equal(calls.length,1);assert.equal(result.scene_details.compatible_settings.length,2);assert.equal(result.usage.reasoning_output_tokens,50);assert.equal(receipts[0].usage.cached_input_tokens,200);assert.equal(receipts[0].request_sha256,analysisDigest(body));assert.equal(validateAnalysisResult(result).usage.output_tokens,100);
  const base=createAnalysisProvider('openai',{...config(),result_contract:'standard'});assert.notEqual(base.spec.output_schema_hash,p.spec.output_schema_hash);assert.notEqual(base.spec.prompt_hash,p.spec.prompt_hash);
});
test('malformed model result still emits one sanitized usage receipt and never retries',async()=>{
  const receipts=[];let calls=0;const raw=envelope();raw.output[0].content[0].text='invalid-json';const p=createAnalysisProvider('openai',config(),{env:{OPENAI_API_KEY:'synthetic-key'},fetchImpl:async()=>{calls++;return Response.json(raw);},onReceipt:r=>receipts.push(r)}),args={image,goals:['background'],signal:new AbortController().signal};await assert.rejects(p.analyzeImage({...args,authorization:{request_sha256:analysisDigest(p.requestBody(args))}}),{code:'INVALID_RESULT'});assert.equal(calls,1);assert.equal(receipts[0].usage.output_tokens,100);assert.ok(!JSON.stringify(receipts).includes('invalid-json'));
});
test('usage rejects inconsistent totals and does not double-count reasoning tokens',()=>{
  assert.equal(responseUsage({...usage,total_tokens:999}),null);const u=responseUsage(usage);assert.equal(u.output_tokens,100);assert.equal(u.reasoning_output_tokens,50);assert.throws(()=>validateAnalysisResult({...sceneWire(),usage:{...u,reasoning_output_tokens:101}}),{code:'INVALID_RESULT'});
  for(const extra of [{result_contract:'invalid'},{image_detail:'original'},{reasoning_effort:'invalid'}])assert.throws(()=>createAnalysisProvider('openai',{...config(),...extra}),{code:'INVALID_PROVIDER_CONFIG'});
});
