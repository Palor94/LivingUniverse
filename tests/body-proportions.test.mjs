import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyProportions,proportionSimilarity} from '../app/body-proportions.mjs';
const pose=()=>{const p=Array.from({length:33},()=>({x:0.5,y:0.1,visibility:0.99}));for(const [i,x,y] of [[11,.3,.3],[12,.7,.3],[23,.36,.65],[24,.64,.65],[15,.2,.8],[16,.8,.8]])p[i]={x,y,visibility:.99};return p;};
const mask=(half=22)=>({width:100,height:100,data:Float32Array.from({length:10000},(_,i)=>Math.abs(i%100-50)<=half?1:0)});
test('body measurements use torso/silhouette, keep face identity independent and abstain on bad scope',()=>{
  const landmarks=[pose()],a=bodyProportions({landmarks,width:200,height:400,mask:mask()}),b=bodyProportions({landmarks,width:200,height:400,mask:mask(14)});
  assert.equal(a.verdict,'needs_review');assert.equal(a.identity_verified,false);assert.ok(proportionSimilarity(a,b)<1);
  const changed=pose();changed[0]={x:.9,y:.8,visibility:.01};assert.deepEqual(bodyProportions({landmarks:[changed],width:200,height:400,mask:mask()}).features,a.features,'face landmarks do not certify a body');
  assert.equal(bodyProportions({landmarks:[],width:200,height:400}).reason,'SINGLE_PERSON_REQUIRED');assert.equal(bodyProportions({landmarks:[pose(),pose()],width:200,height:400}).verdict,'unknown');
  const hidden=pose();hidden[23].visibility=.1;assert.equal(bodyProportions({landmarks:[hidden],width:200,height:400}).reason,'TORSO_NOT_CLEAR');
  const arms=pose();arms[15]={x:.5,y:.55,visibility:.99};assert.equal(bodyProportions({landmarks:[arms],width:200,height:400,mask:mask()}).reason,'ARMS_OCCLUDE_TORSO');
  assert.equal(proportionSimilarity(a,{features:null}),null);
});
