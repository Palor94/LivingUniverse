import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindCoverSave,preferredCoverCharacter} from '../app/public/enhancements.js';

test('shared pictures prefer the current character rather than the first person listed',()=>{
  const characters=[{id:'palor',name:'Palor'},{id:'kristof',name:'Kristóf'}];
  assert.equal(preferredCoverCharacter(characters,'kristof'),'kristof');assert.equal(preferredCoverCharacter(characters,null),'');assert.equal(preferredCoverCharacter([characters[1]],null),'kristof');
});

test('cover button saves the chosen crop once, refreshes and displays confirmation inside the modal',async()=>{
  const form={},button={},status={};let release,requests=0,refreshes=0;const crop={x:.2,y:.1,w:.4,h:.5};const gate=new Promise(r=>{release=r;});
  bindCoverSave({form,button,status,isReady:()=>true,character:()=>({id:'kristof',name:'Kristóf'}),getCrop:()=>crop,save:async(cid,r)=>{requests++;assert.equal(cid,'kristof');assert.deepEqual(r,crop);await gate;},onSaved:async()=>{refreshes++;}});
  assert.equal(button.type,'button');const first=button.onclick({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(requests,1);assert.equal(button.disabled,true);assert.match(status.textContent,/Saving/);release();await first;assert.equal(refreshes,1);assert.equal(button.disabled,false);assert.match(status.textContent,/Cover saved for Kristóf/);
});

test('cover save errors stay visible and allow retry without claiming a successful save',async()=>{
  const form={},button={},status={};let attempts=0,selected=null;
  bindCoverSave({form,button,status,isReady:()=>true,character:()=>selected,getCrop:()=>({x:0,y:0,w:1,h:1}),save:async()=>{if(++attempts===1)throw Error('Unavailable');},onSaved:async()=>{}});
  await button.onclick();assert.equal(attempts,0);assert.match(status.textContent,/Choose the character/);selected={id:'zsolti',name:'Zsolti'};await button.onclick();assert.match(status.textContent,/not saved: Unavailable/);assert.equal(button.disabled,false);await button.onclick();assert.match(status.textContent,/Cover saved for Zsolti/);
});
