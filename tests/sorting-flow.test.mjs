import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installSorting} from '../app/public/sorting.js';
import {mediaFormValues,mediaFormPayload} from '../app/public/media-form.js';

test('location dropdown and structured labels serialize without losing multiple character assignments',()=>{
  const f=new FormData();for(const cid of ['Palor','Pákozdi'])f.append('character',cid);f.append('structured_tag','shirtless');f.set('location_id','m7-location');f.set('notes','Keep note');
  const finished=mediaFormValues(f,true);assert.equal(finished.categorization_complete,true);assert.deepEqual(finished.character_ids,['Palor','Pákozdi']);assert.deepEqual(finished.structured_tag_ids,['shirtless']);assert.equal(finished.location_id,'m7-location');assert.equal(finished.location_reference,true);f.set('location_id','');assert.equal(mediaFormValues(f,false).location_reference,false);f.set('location_id','__unspecified__');assert.equal(mediaFormValues(f).location_id,null);assert.equal(mediaFormValues(f).location_reference,true);
});

test('Finish sorting explicitly completes multicharacter items; Save for later explicitly keeps review',async()=>{
  const native=globalThis.FormData,values=new native();values.append('character','Palor');values.append('character','Pákozdi');values.set('location_id','');values.append('structured_tag','body');values.set('notes','Annotated both people');
  const form={dataset:{},insertAdjacentHTML(){}},nodes=new Map(['#media-form','#categorization-complete','#quick-character-search','.dialog-head','#sort-prev','#sort-next','#sort-save-next','#sort-draft','#media-save-status','button[type="submit"],button.primary','#dialog'].map(s=>[s,{dataset:{},insertAdjacentHTML(){},close(){}}]));nodes.set('#media-form',form);nodes.get('#categorization-complete').checked=false;const requests=[];
  try{globalThis.FormData=class{constructor(){return values;}};const sorting=installSorting({$:selector=>nodes.get(selector)||null,$$:()=>[],esc:s=>s,api:async(route,payload)=>{requests.push({route,payload});return {};},action:fn=>fn,refresh:async()=>{},reload:async()=>{},toast(){},mediaDialog:async()=>{}});
    await sorting.viewer({id:'shared',relative_path:'shared.png',categorization_complete:false,sorting_status:'multiple'});let release;form._pendingTagCreation=new Promise(resolve=>{release=()=>{values.append('structured_tag','created-inline');resolve(true);};});const finish=nodes.get('#sort-save-next').onclick();await Promise.resolve();assert.equal(requests.length,0);release();await finish;assert.equal(requests.at(-1).payload.categorization_complete,true);assert.deepEqual(requests.at(-1).payload.character_ids,['Palor','Pákozdi']);assert.ok(requests.at(-1).payload.structured_tag_ids.includes('created-inline'));assert.equal(nodes.get('#categorization-complete').checked,true);
    await nodes.get('#sort-draft').onclick();assert.equal(requests.at(-1).payload.categorization_complete,false);assert.match(nodes.get('#media-save-status').textContent,/Draft/);
  }finally{globalThis.FormData=native;}
});

test('failed inline creation stops a pending Finish operation instead of silently dropping the new label',async()=>{
  await assert.rejects(mediaFormPayload({_pendingLocationCreation:Promise.resolve(false)},true),/could not be created/);
});
