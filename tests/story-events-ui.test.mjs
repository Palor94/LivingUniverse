import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installEventTimeline,readEventSources} from '../app/public/story-events.js';

test('event editor opens with several sources and remove/add controls without submitting or approving',async t=>{
  const originalLocation=globalThis.location,originalStorage=globalThis.localStorage;
  globalThis.location={origin:'http://fixture.local'};globalThis.localStorage={getItem:()=>null};
  t.after(()=>{globalThis.location=originalLocation;globalThis.localStorage=originalStorage;});
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);};
  const removeButtons=[{},{}],form=node('#event-editor');let dialog='',writes=0;
  const api=async(route,body)=>{if(body)writes++;if(route==='/api/location-editor')return {items:[]};return {items:[],total:0,next_offset:null};};
  const timeline=installEventTimeline({$:selector=>selector==='#event-discard-draft'?null:node(selector),$$:selector=>selector==='[data-remove-source]'?removeButtons:[],esc:v=>String(v??'').replaceAll('<','&lt;'),api,action:fn=>fn,toast:()=>{},openDialog:(title,html)=>{dialog=html;},getState:()=>({characters:[{id:'fixture',name:'Fixture character'}]}),openCharacter:()=>{}});
  await timeline.render({id:'fixture'});await node('#event-new').onclick();
  assert.match(dialog,/data-source="system"/);assert.match(dialog,/Original source excerpt/);assert.match(dialog,/Knows event/);assert.equal(typeof form.onsubmit,'function');assert.equal(typeof removeButtons[0].onclick,'function');assert.equal(typeof removeButtons[1].onclick,'function');assert.equal(typeof node('#event-add-source').onclick,'function');assert.equal(writes,0);
});

test('source form collection retains each source and its exact excerpt, locator and checksum',()=>{
  const rows=[{values:{system:'Fantasy Den',external_id:'session:event',excerpt:'  Árvíztűrő\n<untrusted>  ',locator:'messages 1–4'}},{values:{system:'Creator',sha256:'a'.repeat(64),imported_at:'2026-10-27T10:00:00Z'}}],form={};
  const queryAll=(selector,root)=>selector==='[data-event-source]'&&root===form?rows:Object.entries(root.values).map(([source,value])=>({dataset:{source},value}));
  assert.deepEqual(readEventSources(form,queryAll),rows.map(r=>r.values));
});
