import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sceneWire} from './analysis-scene-fixtures.mjs';
import {validateAnalysisResult,analysisDigest} from '../app/analysis-model.mjs';
import {validateAnalysisWireResult,worldAnalysisOutputSchema} from '../app/analysis-schema.mjs';
import {installWorldIndex,indexWorldResult,searchWorldIndex} from '../app/analysis-world-index.mjs';
import {createAnalysisProvider} from '../app/analysis-providers.mjs';
import {pilotProviderConfig} from './cloud-scene-pilot-support.mjs';
import {renderAnalysisWorld} from '../app/public/media-analysis.js';
export const worldFixture=()=>({...sceneWire(),world_details:{camera:{direction:'profile',elevation:'eye_level',framing:'full_body',evidence:'Synthetic camera coverage',uncertain:false},reference_coverage:[{participant_id:'p1',face_visibility:'partial',body_coverage:'full',occlusion:'none',usable_for:['body_reference','pose_reference'],limitations:'Face only partly visible',uncertain:true}],scene_requirements:{visible_features:[{hu:'Mosdókagyló',en:'washbasin'}],incompatible_uses:[],evidence:'Fixture sink',uncertain:false},content:{level:'non_intimate',evidence:'Synthetic fixture',uncertain:false}}});

test('world contract preserves structured camera, reference coverage and bilingual scene search without accepting canon',()=>{
  const result=validateAnalysisWireResult(worldFixture(),worldAnalysisOutputSchema);assert.equal(result.world_details.camera.direction,'profile');assert.equal(result.scene_details.simulation_use.approved,false);
  const db=new DatabaseSync(':memory:');try{installWorldIndex(db);indexWorldResult(db,{media_id:'fixture',source_sha256:'hash',result_item_id:'item',result,characters:[{id:'known-assignment',name:'Synthetic name'}]});
    assert.equal(searchWorldIndex(db,{query:'mosdókagyló'}).total,0);
    assert.equal(searchWorldIndex(db,{query:'mosdokagylo',direction:'profile',scope:'scene_illustration',character_id:'known-assignment',includeUnreviewed:true}).total,1);
    assert.equal(searchWorldIndex(db,{query:'" OR * -',includeUnreviewed:true}).total,0);
    result.scene_details.simulation_use={...result.scene_details.simulation_use,suggested_scope:'character_introduction',narration_only:true};indexWorldResult(db,{media_id:'fixture',source_sha256:'hash',result_item_id:'item',result});
    assert.equal(searchWorldIndex(db,{scope:'scene_illustration',includeUnreviewed:true}).total,0);assert.equal(db.prepare('SELECT count(*) n FROM world_assets').get().n,1);
  }finally{db.close();}
});
test('world validation refuses dangling, duplicate and visually impossible reference proposals',()=>{
  for(const mutate of [r=>r.world_details.reference_coverage[0].participant_id='p8',r=>r.world_details.reference_coverage.push(r.world_details.reference_coverage[0]),r=>{r.world_details.reference_coverage[0].face_visibility='hidden';r.world_details.reference_coverage[0].usable_for=['face_reference'];},r=>r.world_details.reference_coverage[0].body_coverage='hidden',r=>delete r.scene_details,r=>r.world_details.camera.direction='invented',r=>r.world_details.identity='invented']){const r=worldFixture();mutate(r);assert.throws(()=>validateAnalysisResult(r));}
});
test('world and scene requests bind distinct schema/prompt/cache specifications; old scene remains unchanged',()=>{
  const config=pilotProviderConfig('gpt-6.1-sol'),scene=createAnalysisProvider('openai',config),world=createAnalysisProvider('openai',{...config,result_contract:'world-v1',reasoning_effort:'medium'});
  assert.notEqual(scene.spec.prompt_hash,world.spec.prompt_hash);assert.notEqual(scene.spec.output_schema_hash,world.spec.output_schema_hash);assert.equal(world.spec.prompt,'media-analysis-world-1');assert.equal(world.spec.reasoning_effort,'medium');assert.doesNotThrow(()=>validateAnalysisResult(sceneWire()));assert.ok(analysisDigest(worldFixture()));
});
test('world review escapes provider text and keeps reference limits visible',()=>{
  const world=worldFixture().world_details;world.reference_coverage[0].limitations='<img src=x onerror=alert(1)>';const html=renderAnalysisWorld(world);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('profil'));assert.ok(html.includes('teljes alak'));assert.ok(html.includes('testreferencia'));
});
