import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {installSorting,removeSelectedMedia} from '../app/public/sorting.js';
import {createApp} from '../app/server.mjs';

test('bulk removal snapshots selected IDs, reports failures and warnings, and stops between items',async()=>{
  const requests=[],progress=[];
  const api=async(route,body)=>{requests.push({route,body});if(route.includes('protected'))throw Error('Approved reference');return {ok:true,warning:route.includes('spare')?'Old source retained':undefined};};
  const result=await removeSelectedMedia({ids:['spare','protected','spare','last'],mode:'file',api,onProgress:p=>progress.push(p)});
  assert.deepEqual(requests.map(r=>r.route),['/api/media/spare/remove','/api/media/protected/remove','/api/media/last/remove']);assert.ok(requests.every(r=>r.body.mode==='file'));
  assert.deepEqual(result.removed,['spare','last']);assert.deepEqual(result.failed,[{id:'protected',message:'Approved reference'}]);assert.equal(result.warnings.length,1);assert.equal(progress.at(-1).processed,3);assert.deepEqual(result.unprocessed,[]);
  let canceled=false;requests.length=0;const stopped=await removeSelectedMedia({ids:['first','second'],mode:'catalogue',api,onProgress:()=>{canceled=true;},isCanceled:()=>canceled});assert.deepEqual(stopped.removed,['first']);assert.deepEqual(stopped.unprocessed,['second']);assert.equal(requests.length,1);assert.equal(requests[0].body.mode,'catalogue');
  await assert.rejects(removeSelectedMedia({ids:['first'],mode:'permanent',api}),/Choose how/);assert.equal(requests.length,1);
});

test('Needs sorting offers a disabled bulk remove button until selection, and opens a review before any removal',async()=>{
  const nodes=new Map(),buttons=[],requests=[];let html='';
  const node=()=>({insertAdjacentHTML(_position,text){if(text.includes('data-bulk-action="remove"'))buttons.push({dataset:{bulkAction:'remove'}});},querySelectorAll:()=>[]});
  for(const key of ['.media-grid','.toolbar','#sorting-status','#media-type-tabs','#select-visible','#clear-selected','#selection-count','#bulk-remove-form','#bulk-remove-submit','#bulk-remove-cancel','#bulk-remove-status','#bulk-remove-results'])nodes.set(key,node());nodes.set('#dialog',{addEventListener(){},removeEventListener(){},close(){}});
  const $=key=>nodes.get(key)||null,$$=key=>key==='[data-bulk-action]'?buttons:[];
  const ui=installSorting({$,$$,getView:()=> 'inbox',esc:s=>s.replaceAll('<','&lt;'),action:fn=>fn,openDialog:(_title,body)=>{html=body;},api:async(...args)=>requests.push(args)});
  ui.setPage([{id:'first',relative_path:'one.png'},{id:'second',relative_path:'<two>.mp4'}],'/queue','page-1');ui.listing();const button=buttons.find(b=>b.dataset.bulkAction==='remove');assert.ok(button);assert.equal(button.disabled,true);
  $('#select-visible').onclick();assert.equal(button.disabled,false);await button.onclick();assert.equal(requests.length,0);assert.match(html,/Only the 2 selected items on this page/);assert.match(html,/value="catalogue" checked/);assert.match(html,/value="file"/);assert.match(html,/&lt;two>/);assert.equal(typeof $('#bulk-remove-form').onsubmit,'function');
  $('#clear-selected').onclick();assert.equal(button.disabled,true);ui.setPage([{id:'third',relative_path:'third.png'}],'/queue','page-2');await button.onclick();assert.equal(requests.length,0);
});

test('selected file removal reuses recoverable trash, protects canon and leaves unselected files and metadata intact',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-bulk-remove-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  try{
    for(const name of ['spare.png','reference.png','unselected.png'])await fs.writeFile(path.join(root,name),'fixture '+name);
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),value=await r.json();if(!r.ok)throw Error(value.error);return value;};
    await api('/api/scan',{});const items=(await api('/api/media')).items,find=name=>items.find(m=>m.relative_path===name),spare=find('spare.png'),reference=find('reference.png'),character=await api('/api/characters',{name:'Dezső'});
    for(const m of [spare,reference])await api('/api/media/'+m.id,{character_ids:[character.id],tags:'retain',notes:'Keep this note'},'PUT');await api('/api/characters/'+character.id+'/canon',{appearance:'Keep canon',references:[{media_id:reference.id,role:'face'}]});const before=await api('/api/export');
    const result=await removeSelectedMedia({ids:[spare.id,reference.id],mode:'file',api});assert.deepEqual(result.removed,[spare.id]);assert.equal(result.failed[0].id,reference.id);assert.match(result.failed[0].message,/approved identity reference/);
    const removed=await api('/api/removed');assert.equal(removed.items.length,1);assert.equal(removed.items[0].id,spare.id);assert.equal(removed.items[0].physical,1);assert.equal(await fs.readFile(path.join(root,'unselected.png'),'utf8'),'fixture unselected.png');assert.equal(await fs.readFile(path.join(root,'reference.png'),'utf8'),'fixture reference.png');
    const after=await api('/api/export');for(const table of ['depictions','media_notes','reviews','canon'])assert.deepEqual(after[table],before[table],table);assert.equal(after.media.length,before.media.length);
    await api('/api/media/'+spare.id+'/restore-item',{});assert.equal(await fs.readFile(path.join(root,'spare.png'),'utf8'),'fixture spare.png');
    await removeSelectedMedia({ids:[spare.id],mode:'catalogue',api});assert.equal(await fs.readFile(path.join(root,'spare.png'),'utf8'),'fixture spare.png');assert.equal((await api('/api/removed')).items[0].physical,0);
  }finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
