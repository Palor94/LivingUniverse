import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {planningFolder,isPlanningSource,describeMediaPurpose,renderMediaPurpose} from '../app/media-purpose.mjs';
import {installWorldIndex,indexWorldResult,searchWorldIndex} from '../app/analysis-world-index.mjs';
import {sceneWire} from './analysis-scene-fixtures.mjs';

const result=()=>({...sceneWire(),world_details:{camera:{direction:'profile',elevation:'eye_level',framing:'full_body'},reference_coverage:[{usable_for:['pose_reference']}],scene_requirements:{visible_features:[],incompatible_uses:[]},content:{level:'non_intimate'}}});
test('explicit planning folder matches exact normalized ancestry without guessing identity or classifying unread image content',()=>{
  assert.equal(isPlanningSource(planningFolder+'/fixture.jpg'),true);assert.equal(isPlanningSource((planningFolder+'/sub/fixture.jpg').toUpperCase().replaceAll('/','\\')),true);
  assert.equal(isPlanningSource('30_IMPORTS/Incoming/Generation plans, ideas/fixture.jpg'),false);
  assert.equal(isPlanningSource('20_SHARED_MEDIA/Unassigned/ordinary-photo.jpg'),false);
  for(const path of [planningFolder+' backup/fixture.jpg','elsewhere/'+planningFolder+'/fixture.jpg',planningFolder+'/../fixture.jpg','C:/'+planningFolder+'/fixture.jpg'])assert.equal(isPlanningSource(path),false);
  const pending=describeMediaPurpose(planningFolder+'/fixture.jpg');assert.deepEqual(pending.uses,['generation_plan']);assert.equal(pending.realization_state,'planned');assert.equal(pending.simulation_role,'planning_only');assert.equal(pending.story_event_evidence,false);assert.equal(pending.character_identity_evidence,false);
  const classified=describeMediaPurpose(planningFolder+'/fixture.jpg',result());assert.ok(classified.uses.includes('action_scheme'));assert.ok(classified.uses.includes('pose_reference'));assert.ok(classified.uses.includes('composition_reference'));assert.equal(describeMediaPurpose('10_CHARACTERS/fixture.jpg').kind,'catalogue_media');
});
test('plans remain findable for generation while excluded from scene and character-introduction selectors even if reviewed',()=>{
  const db=new DatabaseSync(':memory:');try{installWorldIndex(db);const r=result();indexWorldResult(db,{media_id:'plan',source_sha256:'hash',result_item_id:'item',source_relative_path:planningFolder+'/fixture.jpg',result:r});db.prepare("UPDATE world_assets SET review_state='accepted'").run();
    assert.equal(searchWorldIndex(db).total,0);assert.equal(searchWorldIndex(db,{scope:'scene_illustration',includeUnreviewed:true}).total,0);assert.equal(searchWorldIndex(db,{scope:'generation_plan',query:'akcióséma'}).total,1);assert.equal(searchWorldIndex(db,{scope:'generation_plan',query:'generation plan',includeUnreviewed:true}).total,1);
    r.scene_details.simulation_use.suggested_scope='character_introduction';r.scene_details.simulation_use.narration_only=true;indexWorldResult(db,{media_id:'plan',source_sha256:'hash',result_item_id:'item',source_relative_path:planningFolder+'/fixture.jpg',result:r});assert.equal(searchWorldIndex(db,{scope:'character_introduction',includeUnreviewed:true}).total,0);assert.equal(searchWorldIndex(db,{scope:'generation_plan',includeUnreviewed:true}).total,1);
    assert.ok(renderMediaPurpose(describeMediaPurpose(planningFolder+'/fixture.jpg',r)).includes('Megvalósítandó terv'));
  }finally{db.close();}
});
