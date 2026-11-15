import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTagCostUsd,analyzeWorldImage,VISION_TAG_MODEL} from '../app/vision-engine.mjs';
import {estimateIdentityCostUsd,validateIdentityResult,compareIdentity} from '../app/vision-identity.mjs';
import {evaluateAutoCanonCandidate,readAutoCanonConfig,machineActor} from '../app/auto-canon-gates.mjs';
import {isPlanningSource,notPlanningSQL} from '../app/media-purpose.mjs';

test('tag cost estimate stays explicit and budget-aware',()=>{
  const est=estimateTagCostUsd(10,{maxTotalUsd:5});
  assert.equal(est.model,VISION_TAG_MODEL);
  assert.equal(est.image_count,10);
  assert.ok(est.per_image_usd_estimate>0);
  assert.equal(typeof est.within_budget,'boolean');
});

test('identity validator accepts match and rejects forged character ids',()=>{
  const ok=validateIdentityResult({
    schema:1,media_decision:'continue',abstain_reason:'',
    participants:[{participant_id:'p1',character_id:'c1',decision:'match',face:{verdict:'match',evidence:'eyes'},body:{verdict:'match',evidence:'build'},crop_roles:['face','body'],notes:''}]
  },{candidateIds:new Set(['c1']),participantIds:new Set(['p1'])});
  assert.equal(ok.participants[0].character_id,'c1');
  assert.throws(()=>validateIdentityResult({
    schema:1,media_decision:'continue',abstain_reason:'',
    participants:[{participant_id:'p1',character_id:'evil',decision:'match',face:{verdict:'match',evidence:'x'},body:{verdict:'unevaluated',evidence:'y'},crop_roles:['face'],notes:''}]
  },{candidateIds:new Set(['c1']),participantIds:new Set(['p1'])}));
});

test('auto-canon abstains until writer and numeric gates are locked',()=>{
  const participant={decision:'match',character_id:'c1',face:{verdict:'match'},body:{verdict:'match'},crop_roles:['face','body']};
  const blocked=evaluateAutoCanonCandidate({participant,region:{x:0.1,y:0.1,width:0.4,height:0.6},existingRoles:new Set(['face','body'])});
  assert.equal(blocked.ok,false);
  assert.ok(blocked.abstain_reasons.includes('writer_disabled'));
  assert.ok(blocked.abstain_reasons.includes('numeric_gates_unset'));
  const ready=evaluateAutoCanonCandidate({
    config:{writer_enabled:true,numeric_gates:{locked:true,accept_face:0.9,accept_body:0.9}},
    participant,region:{x:0.1,y:0.1,width:0.4,height:0.6},existingRoles:new Set(['face','body'])
  });
  assert.equal(ready.ok,true);
  assert.deepEqual(ready.roles,['face','body']);
  assert.match(machineActor({}),/^machine:/);
  assert.equal(readAutoCanonConfig({}).writer_enabled,false);
});

test('generation-plan drawings are planning-only and blocked from auto-canon',()=>{
  assert.equal(isPlanningSource('20_SHARED_MEDIA/Unassigned/Generation plans, ideas/sketch-1.jpg'),true);
  assert.equal(isPlanningSource('10_CHARACTERS/Palor/photo.jpg'),false);
  assert.match(notPlanningSQL,/Generation plans, ideas/);
  const participant={decision:'match',character_id:'c1',face:{verdict:'match'},body:{verdict:'match'},crop_roles:['face','body']};
  const blocked=evaluateAutoCanonCandidate({
    config:{writer_enabled:true,numeric_gates:{locked:true,accept_face:0.9,accept_body:0.9}},
    participant,region:{x:0.1,y:0.1,width:0.4,height:0.6},existingRoles:new Set(['face','body']),
    relativePath:'20_SHARED_MEDIA\\Unassigned\\Generation plans, ideas\\idea.png'
  });
  assert.equal(blocked.ok,false);
  assert.ok(blocked.abstain_reasons.includes('generation_plan_excluded'));
});

test('analyzeWorldImage validates provider JSON and does not retry on failure',async()=>{
  const bytes=Buffer.from([0xff,0xd8,0xff,0xd9,0x00,0x01,0x02,0x03]);
  const raw={
    schema:1,
    description:{hu:'Teszt',en:'Test'},
    background:{kind:'neutral',hu:'háttér',en:'backdrop'},
    tags:[],
    scene_details:{
      environment:{observed_function:{hu:'semleges',en:'neutral'},evidence:'plain',uncertain:false},
      compatible_settings:[],
      participants:[{id:'p1',screen_position:{hu:'közép',en:'center'},region:{x:0.2,y:0.1,width:0.5,height:0.7},character_id:null}],
      activities:[],
      simulation_use:{suggested_scope:'character_introduction',narration_only:true,evidence:'neutral',uncertain:false,approved:false}
    },
    world_details:{
      camera:{direction:'frontal',elevation:'eye_level',framing:'upper_body',evidence:'front',uncertain:false},
      reference_coverage:[{participant_id:'p1',face_visibility:'clear',body_coverage:'partial',occlusion:'none',usable_for:['face_reference'],limitations:'legs cropped',uncertain:false}],
      scene_requirements:{visible_features:[],incompatible_uses:[],evidence:'none',uncertain:false},
      content:{level:'non_intimate',evidence:'clothed',uncertain:false}
    }
  };
  const fetchImpl=async()=>({
    ok:true,
    headers:{get:()=>'req_1'},
    body:(async function*(){yield Buffer.from(JSON.stringify({id:'resp_1',output_text:JSON.stringify(raw),usage:{input_tokens:100,output_tokens:50,total_tokens:150}}));})()
  });
  const out=await analyzeWorldImage({bytes,contentType:'image/jpeg',apiKey:'test-key',fetchImpl});
  assert.equal(out.model,VISION_TAG_MODEL);
  assert.equal(out.raw.scene_details.participants[0].id,'p1');
});

test('compareIdentity posts multi-image request and validates candidate binding',async()=>{
  const target=Buffer.from('target-bytes-jpeg-xxxx');
  const ref=Buffer.from('reference-bytes-yyyy');
  const identity={
    schema:1,media_decision:'continue',abstain_reason:'',
    participants:[{participant_id:'p1',character_id:'c1',decision:'match',face:{verdict:'match',evidence:'same eyes'},body:{verdict:'abstain',evidence:'cropped'},crop_roles:['face'],notes:''}]
  };
  let posted;
  const fetchImpl=async(url,init)=>{posted=JSON.parse(init.body);return{
    ok:true,headers:{get:()=>null},
    body:(async function*(){yield Buffer.from(JSON.stringify({id:'id_1',output_text:JSON.stringify(identity)}));})()
  };};
  const out=await compareIdentity({
    targetBytes:target,targetContentType:'image/jpeg',
    participants:[{id:'p1',region:{x:0.1,y:0.1,width:0.4,height:0.5}}],
    candidates:[{character_id:'c1',name:'Test',references:[{role:'face',bytes:ref,contentType:'image/jpeg'}]}],
    apiKey:'test-key',fetchImpl
  });
  assert.equal(out.result.participants[0].character_id,'c1');
  assert.equal(posted.model,VISION_TAG_MODEL);
  assert.equal(posted.input[0].content.filter(c=>c.type==='input_image').length,2);
  assert.ok(estimateIdentityCostUsd(5).estimated_additional_usd>0);
});
