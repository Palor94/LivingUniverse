import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installDuplicatesUI} from '../app/public/duplicates.js';

test('duplicate comparison wires one-click file removal and leaves the remaining copy',async()=>{
  const nodes=new Map();let refreshes=0,opened=null;const requests=[],messages=[];
  function parse(html){
    for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set('#'+match[1],{});
    for(const match of html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)){
      const attrs=match[1],id=attrs.match(/id="([^"]+)"/)?.[1];
      const open=attrs.match(/data-duplicate-open="([^"]+)"/)?.[1];
      const trash=attrs.match(/data-duplicate-trash="([^"]+)"/)?.[1];
      const compare=attrs.match(/data-duplicate-compare="([^"]+)"/)?.[1];
      nodes.set(id?'#'+id:open?'open:'+open:trash?'trash:'+trash:'compare:'+compare,{dataset:{duplicateOpen:open,duplicateTrash:trash,duplicateCompare:compare},disabled:/\bdisabled\b/.test(attrs),textContent:match[2]});
    }
  }
  const sidebar={insertAdjacentHTML:(_,html)=>parse(html)};
  const $=selector=>selector==='.sidebar-bottom'?sidebar:nodes.get(selector);
  const $$=selector=>[...nodes.entries()].filter(([key])=>key.startsWith(selector==='[data-duplicate-open]'?'open:':selector==='[data-duplicate-trash]'?'trash:':'compare:')).map(([,value])=>value);
  const group={items:[{id:'keep',kind:'image',relative_path:'Dezső/keep.png',characters:['Dezső'],categorization_complete:true,canonical:true},{id:'spare',kind:'image',relative_path:'spare.png',characters:[],categorization_complete:false,canonical:false}]};
  const second={items:[{id:'other',kind:'image',relative_path:'other.png',characters:[],categorization_complete:false},{id:'other-copy',kind:'image',relative_path:'other-copy.png',characters:[],categorization_complete:true}]};
  const ui=installDuplicatesUI({$,$$,esc:String,action:fn=>fn,toast:(...args)=>messages.push(args),openDialog:(_,html)=>{nodes.clear();parse(html);},mediaDialog:async id=>{opened=id;nodes.clear();},getState:()=>({folders:[]}),refresh:async()=>{refreshes++;},api:async(route,body)=>{
    requests.push({route,body});
    if(route.startsWith('/api/duplicates/groups'))return {items:[group,second],total:2,cached:4,active:4,stale:0};
    if(route==='/api/media/spare')return {id:'spare',relative_path:'Dezső/spare.png',characters:[{name:'Dezső'}],categorization_complete:true,canonicalFor:[]};
    if(route==='/api/media/other')return {id:'other',relative_path:'other.png',characters:[{name:'Palor'}],categorization_complete:true,canonicalFor:[]};
    assert.equal(route,'/api/media/spare/remove');assert.deepEqual(body,{mode:'file'});return {ok:true};
  }});
  ui.controls();await $('#duplicate-tool').onclick();await $('#duplicate-results').onclick();
  await $('compare:0').onclick();
  assert.equal($('#duplicate-group-prev').disabled,true);
  assert.equal($('#duplicate-group-next').disabled,false);
  $('#duplicate-group-next').onclick();
  assert.equal(typeof $('trash:other').onclick,'function');
  assert.equal($('#duplicate-group-next').disabled,true);
  await $('open:other').onclick();assert.equal(opened,'other');
  assert.equal(await ui.returnAfterSave('unrelated'),false);
  assert.equal(await ui.returnAfterSave('other'),true);
  assert.equal($('#duplicate-group-prev').disabled,false);
  assert.equal($('#duplicate-group-next').disabled,true);
  assert.deepEqual(second.items.find(m=>m.id==='other').characters,['Palor']);
  $('#duplicate-group-prev').onclick();
  assert.equal(typeof $('open:spare').onclick,'function');
  assert.equal(typeof $('trash:spare').onclick,'function');
  assert.equal($('trash:keep').disabled,true);
  await $('open:spare').onclick();assert.equal(opened,'spare');
  assert.equal(await ui.returnAfterSave('spare'),true);
  assert.equal($('#duplicate-group-prev').disabled,true);
  assert.equal($('#duplicate-group-next').disabled,false);
  assert.equal(group.items.find(m=>m.id==='spare').relative_path,'Dezső/spare.png');
  assert.equal(group.items.find(m=>m.id==='spare').categorization_complete,true);
  await $('trash:spare').onclick();
  assert.equal(refreshes,1);assert.equal(requests.filter(r=>r.route.endsWith('/remove')).length,1);
  assert.deepEqual(group.items.map(m=>m.id),['keep']);assert.equal($('trash:keep').disabled,true);
  assert.equal($('#duplicate-group-next').disabled,false);
  $('#duplicate-group-next').onclick();
  assert.equal(typeof $('trash:other').onclick,'function');
  $('#duplicate-group-prev').onclick();
  assert.equal($('trash:keep').disabled,true);
  assert.match(messages.at(-1)[0],/recoverable trash/);
});
