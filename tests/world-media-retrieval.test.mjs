import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sceneWire} from './analysis-scene-fixtures.mjs';
import {planningFolder} from '../app/media-purpose.mjs';
import {installWorldIndex,indexWorldResult} from '../app/analysis-world-index.mjs';
import {retrieveWorldMedia} from '../app/world-media-retrieval.mjs';
const result=()=>({...sceneWire(),world_details:{camera:{direction:'profile',elevation:'eye_level',framing:'full_body',uncertain:false},reference_coverage:[{participant_id:'p1',usable_for:['pose_reference'],limitations:'fixture',uncertain:false}],scene_requirements:{visible_features:[],incompatible_uses:[]},content:{level:'non_intimate'}}});
test('AI candidate retrieval uses proposed labels with explained criteria while preserving review and canon boundaries',()=>{
  const db=new DatabaseSync(':memory:');try{installWorldIndex(db);for(const id of ['ordinary','plan'])indexWorldResult(db,{media_id:id,source_sha256:'hash',result_item_id:id,result:result(),characters:[{id:'character',name:'Fixture'}],source_relative_path:id==='plan'?planningFolder+'/fixture.jpg':'characters/fixture.jpg'});
    const criteria={purpose:'scene_illustration',character_ids:['character'],activities:['handing over an object'],compatible_settings:['cafe washroom'],camera:{direction:'profile'}};
    const found=retrieveWorldMedia(db,criteria,{activeMediaIds:new Set(['ordinary','plan'])});assert.equal(found.total,1);assert.equal(found.items[0].media_id,'ordinary');assert.ok(found.items[0].matches.some(m=>m.criterion==='activity'));assert.ok(found.items[0].warnings.includes('MODEL_PROPOSALS_NOT_HUMAN_ACCEPTED'));assert.equal(found.items[0].canon_approval,'not_checked');assert.equal(db.prepare("SELECT count(*) n FROM world_assets WHERE review_state='accepted'").get().n,0);
    assert.equal(retrieveWorldMedia(db,{...criteria,accepted_only:true}).total,0);assert.equal(retrieveWorldMedia(db,criteria,{activeMediaIds:new Set()}).total,0);assert.equal(retrieveWorldMedia(db,{purpose:'generation_plan',reference_uses:['pose_reference']}).items[0].media_id,'plan');
    assert.equal(retrieveWorldMedia(db,{...criteria,activities:['not present']}).reason,'NO_MATCH');assert.equal(retrieveWorldMedia(db,{...criteria,participant_role_requirements:[{character_id:'character',role:'other_visible'}]}).reason,'REVIEWED_PARTICIPANT_BINDINGS_REQUIRED');assert.throws(()=>retrieveWorldMedia(db,{...criteria,unexpected:true}));
  }finally{db.close();}
});
