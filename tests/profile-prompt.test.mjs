// Profile integration 2026-11-15: meta fields out, scale phrases, per-use field sets, legacy
// fallback. Synthetic profile only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultTemplate} from '../app/ghost-profile.mjs';
import {profileText,scaleLine} from '../app/profile-prompt.mjs';

const e=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
const profile=(values,legacy={})=>({template:defaultTemplate,values,legacy:{biography:'',appearance:'',personality:'',speech_style:'',sexuality:'',...legacy}});

test('meta and explicit fields stay out; explicit only on request',()=>{
  const p=profile({origin:e('Grok-import 2026'),anatomy:e('ANAT'),goals:e('Dolgozni.')});
  const t=profileText(p);
  assert.ok(!t.includes('Grok-import'));assert.ok(!t.includes('ANAT'));assert.ok(t.includes('Dolgozni.'));
  assert.ok(profileText(p,{explicit:true}).includes('ANAT'));
  assert.ok(!profileText(p,{explicit:true}).includes('Grok-import'),'meta never, even in intimate scenes');
});

test('scales get behaviour phrases at the ends; middle and custom scales stay numbers',()=>{
  assert.match(scaleLine({id:'sarcasm',label:'Szarkazmus',max:10},9),/9\/10 – gyakran szarkasztikus/);
  assert.match(scaleLine({id:'sarcasm',label:'Szarkazmus',max:10},1),/1\/10 – ritkán ironizál/);
  assert.equal(scaleLine({id:'sarcasm',label:'Szarkazmus',max:10},5),'Szarkazmus: 5/10');
  assert.match(scaleLine({id:'grievances',label:'Sérelmek',max:5},5),/nehezen bocsát meg/);
  assert.equal(scaleLine({id:'custom_x',label:'Egyéni',max:10},10),'Egyéni: 10/10');
  assert.ok(profileText(profile({extraversion:e(0)})).includes('0/10 – visszahúzódó'),'zero is a value');
  assert.ok(!profileText(profile({extraversion:e(null)})).includes('Extraverzió'),'null is unknown');
});

test('each use gets its own field set and length',()=>{
  const long='x'.repeat(1000);
  const p=profile({goals:e('CÉL'),relationship_speech:e('KAPCS'),grievances:e(4),speech:e(long)});
  const agent=profileText(p,{use:'agent'}),group=profileText(p,{use:'group'}),talk=profileText(p,{use:'talk'});
  assert.ok(agent.includes('CÉL')&&!agent.includes('KAPCS')&&!agent.includes('Sérelmek'));
  assert.ok(!group.includes('CÉL')&&group.includes('KAPCS'));
  assert.ok(talk.includes('CÉL')&&talk.includes('KAPCS')&&talk.includes('Sérelmek'));
  assert.ok(group.length<agent.length,'group fields are clipped shorter');
});

test('unfilled text fields fall back to the older profile text, but not an accepted empty value',()=>{
  const t=profileText(profile({},{biography:'RÉGI ÉLETRAJZ',personality:'RÉGI SZEMÉLYISÉG'}));
  assert.ok(t.includes('RÉGI ÉLETRAJZ')&&t.includes('RÉGI SZEMÉLYISÉG'));
  assert.ok(!profileText(profile({identity:e('')},{biography:'RÉGI ÉLETRAJZ'})).includes('RÉGI'),'accepted empty value is respected');
  assert.equal(profileText(null),'');
});
