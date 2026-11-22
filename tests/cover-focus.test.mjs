import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coverFocus} from '../app/cover-focus.mjs';
test('group cover centres the selected character; low quality, unknown and ambiguous faces abstain',()=>{
  const face=(x,vector)=>({box:{x,y:.1,w:.12,h:.18},vector,face_px:120,det_score:.9}),a=face(.1,[1,0]),b=face(.7,[0,1]);
  const result=coverFocus([a,b],[[0,1]]);assert.ok(result);assert.ok(Math.abs(result.crop.x+result.crop.w/2-.76)<1e-9);assert.ok(result.crop.y>=0&&result.crop.y+result.crop.h<=1);
  assert.equal(coverFocus([a,b],[[.1,.1]]),null);assert.equal(coverFocus([a,face(.6,[1,0])],[[1,0]]),null);assert.equal(coverFocus([{...b,face_px:10}],[[0,1]]),null);
});
