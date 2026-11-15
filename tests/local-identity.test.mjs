import {test} from 'node:test';
import assert from 'node:assert/strict';
import {similarity} from '../app/local-identity.mjs';
import {rates} from '../app/run-local-identity-benchmark.mjs';

test('face alignment: the similarity transform recovers a rotation, scale and shift exactly',()=>{
  const dst=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
  // src = inverse of (scale 0.5, rotate 30°, shift) applied to dst, so the fit must give it back.
  const s=0.5,th=Math.PI/6,a=s*Math.cos(th),b=s*Math.sin(th),tx=12,ty=-7,d=a*a+b*b;
  const src=dst.map(([x,y])=>{const u=x-tx,w=y-ty;return [(a*u+b*w)/d,(-b*u+a*w)/d];});
  const t=similarity(src,dst);
  for(const [k,v] of Object.entries({a,b,tx,ty}))assert.ok(Math.abs(t[k]-v)<1e-6,k);
});

test('benchmark rates: hits and false alarms per threshold; missing scores are counted, not guessed',()=>{
  const pairs=[{truth:true,face:0.6},{truth:true,face:0.3},{truth:false,face:0.1},{truth:false,face:0.35},{truth:true,face:null}];
  const r=rates(pairs,'face',[0.25,0.5]);
  assert.deepEqual([r.positives,r.negatives,r.missing],[2,2,1]);
  assert.deepEqual(r.table,[{threshold:0.25,hit_rate:1,false_alarm_rate:0.5},{threshold:0.5,hit_rate:0.5,false_alarm_rate:0}]);
});
