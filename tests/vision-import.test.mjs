import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneDetails} from '../app/analysis-scene.mjs';
import {recordsFromReport} from '../app/import-vision-tag.mjs';
import {score} from '../app/run-identity-benchmark.mjs';

const bi=s=>({hu:s,en:s});
const scene=over=>({environment:{observed_function:bi('szoba'),evidence:'x',uncertain:false},compatible_settings:[],
  participants:[{id:'p1',screen_position:bi('bal'),region:{x:0.6,y:0.1,width:0.45,height:0.9000000001},character_id:null},{id:'p2',screen_position:bi('jobb'),region:null,character_id:null}],
  activities:[{id:'a1',activity:bi('x'),position:bi('x'),visibility:'visible',evidence:'x',uncertain:false,roles:[{participant_id:'p1',role:'giving_oral',evidence:'x',uncertain:false},{participant_id:'p1',role:'receiving_manual',evidence:'x',uncertain:false},{participant_id:'p2',role:'giving_manual',evidence:'x',uncertain:false}]}],
  simulation_use:{suggested_scope:'scene_illustration',narration_only:false,evidence:'x',uncertain:false,approved:false},...over});

test('scene check: boxes past the frame are clipped, two different roles of one person are kept, real faults still fail with a reason',()=>{
  const v=validateSceneDetails(scene(),'scene');
  assert.equal(v.participants[0].region.width,1-0.6);assert.ok(v.participants[0].region.y+v.participants[0].region.height<=1);
  assert.equal(v.activities[0].roles.length,3);
  const twice=scene();twice.activities[0].roles.push({participant_id:'p1',role:'giving_oral',evidence:'x',uncertain:false});
  assert.throws(()=>validateSceneDetails(twice,'scene'),e=>e.code==='INVALID_RESULT'&&e.detail==='role_repeated_participant');
  const ghost=scene();ghost.activities[0].roles[0].participant_id='p7';
  assert.throws(()=>validateSceneDetails(ghost,'scene'),e=>e.detail==='role_unknown_participant');
  const outside=scene();outside.participants[0].region={x:1,y:0,width:0.2,height:0.2};
  assert.throws(()=>validateSceneDetails(outside,'scene'),e=>e.detail==='empty_region');
});

test('tagging report import: only successful results, with usage and provenance; other reports refused',()=>{
  const report={kind:'vision-tag-trial-result',method:'m',finished_at:'t',results:[{media_id:'a',status:'ok',source_sha256:'s',raw:{schema:1},usage:{input_tokens:1},request_id:'r'},{media_id:'b',status:'error',code:'INVALID_RESULT'}]};
  const {records,manifest}=recordsFromReport(report,id=>'Mappa/'+id+'.png');
  assert.equal(records.length,1);assert.equal(records[0].source_path,'Mappa/a.png');assert.deepEqual(records[0].raw.usage,{input_tokens:1});assert.equal(records[0].provenance.request_id,'r');
  assert.equal(manifest.kind,'vision-tag-trial-import');
  assert.throws(()=>recordsFromReport({kind:'other'},()=>null),e=>e.code==='INVALID_REPORT');
});

test('benchmark score: right and wrong matches, misses, correct refusals and face/body errors counted separately',()=>{
  const cases=[{media_id:'m1',candidates:[{character_id:'A'},{character_id:'B'}],participants:[{id:'p1',truth:'A'}]},
    {media_id:'m2',candidates:[{character_id:'A'},{character_id:'B'}],participants:[{id:'p1',truth:'A'},{id:'p2',truth:null}]},
    {media_id:'m3',candidates:[{character_id:'B'}],participants:[{id:'p1',truth:null}]}];
  const p=(id,decision,character_id,face='match',body='match')=>({participant_id:id,decision,character_id,face:{verdict:face},body:{verdict:body}});
  const results=[{media_id:'m1',status:'ok',result:{participants:[p('p1','match','A','match','mismatch')]}},
    {media_id:'m2',status:'ok',result:{participants:[p('p1','unknown',null),p('p2','match','B')]}},
    {media_id:'m3',status:'ok',result:{participants:[p('p1','abstain',null)]}}];
  const m=score(cases,results);
  assert.deepEqual([m.participants,m.correct_match,m.false_match,m.missed,m.correct_reject],[4,1,1,1,1]);
  assert.deepEqual([m.face_checked,m.face_errors,m.body_checked,m.body_errors],[2,1,2,2]);
});
