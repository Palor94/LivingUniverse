import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installCharacterGeneration,sogniPresetLabel,defaultGenerationReferences} from '../app/public/character-generation.js';
test('LoRA preset label displays the requested exact adapter names and decimal strengths',()=>{assert.equal(sogniPresetLabel({loras:['krea2-mystic-x','krea2-realism-engine'],lora_strengths:[1,0.8]}),'Mystic X · 1 / Realism Engine v3 · 0,8');});

function fixture({available=true,canon=true,failFirst=false,onSaved=async()=>{},onOpenGallery=async()=>{}}={}){
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',checked:false,disabled:false,isConnected:true,innerHTML:'',textContent:''});return nodes.get(selector);};
  const refs=[{dataset:{generationRef:'ref-face'},checked:false},{dataset:{generationRef:'ref-body'},checked:false}];
  const context={enabled:true,csrf:'fixture-csrf',providers:[{provider:'sogni',available,model:'krea-identity-edit',max_references:2,max_estimated_capacity_units:10}],canon:canon?{revision_id:'canon-fixture',references:refs.map((r,i)=>({media_id:r.dataset.generationRef,available:true,name:'Reference '+i,role:i?'body':'face'}))}:null,runs:[]};
  const posts=[],reads=[];
  let current;
  const panel=installCharacterGeneration({onSaved,onOpenGallery,$:node,$$:selector=>selector==='[data-generation-ref]'?refs:[],esc:value=>String(value??'').replaceAll('<','&lt;'),api:async route=>{reads.push(route);return structuredClone(context);},mediaDialog:async()=>{},request:async(url,options)=>{
    posts.push({url,options});if(failFirst&&posts.length===1)throw Error('Lost response');
    const body=JSON.parse(options.body);
    if(url.endsWith('/estimate')){current.manifest.sogni_estimate={capacity_units:2,estimated_at:new Date().toISOString()};current.manifest_hash='estimated-hash';}
    else if(url.endsWith('/decision'))current.status=body.decision==='approve'?'approved':'rejected';
    else if(url.endsWith('/execute')){assert.equal(current.status,'approved');current.status='succeeded';current.output={media_id:'new-media',active:true};}
    else current={run_id:'run-fixture',status:'pending',created_at:'2026-10-28T10:00:00Z',manifest_hash:'hash-fixture',manifest:{prompt:body.prompt,provider_prompt:body.prompt,provider:'sogni',model:'krea-identity-edit',size:body.size,max_estimated_capacity_units:body.max_estimated_capacity_units,estimated_cost_usd:null,characters:[{name:'Fixture',references:[]}]}};
    return Response.json(current);
  }});
  return {panel,nodes,node,refs,posts,reads};
}

test('opening preselects approved face/body references without submitting; a prompt and capacity ceiling are required',async()=>{
  const f=fixture();await f.panel.render({id:'character-fixture',name:'Fixture'});assert.equal(f.posts.length,0);assert.equal(f.node('#generation-prepare').disabled,true);
  assert.match(f.node('#profile-content').innerHTML,/Kérés előkészítése/);assert.match(f.node('#profile-content').innerHTML,/Jóváhagyott referenciák/);
  f.node('#generation-scene').oninput({target:{value:'  Literal <scene>  '}});assert.equal(f.node('#generation-prepare').disabled,false);
  f.refs[0].checked=false;f.refs[0].onchange();f.refs[1].checked=false;f.refs[1].onchange();assert.equal(f.node('#generation-prepare').disabled,true);
  f.refs[0].checked=true;f.refs[0].onchange();assert.equal(f.node('#generation-prepare').disabled,false);
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(f.posts.length,1);
  const body=JSON.parse(f.posts[0].options.body);assert.equal(body.prompt,'  Literal <scene>  ');assert.deepEqual(body.reference_ids,['ref-face']);assert.equal(body.revision_id,'canon-fixture');assert.equal(body.max_estimated_capacity_units,10);assert.equal(f.posts[0].options.headers['X-LU-Generation-CSRF'],'fixture-csrf');assert.match(f.node('#generation-plan').innerHTML,/Szolgáltatói becslés kérése/);assert.equal(f.posts.some(p=>p.url.endsWith('/execute')),false);
  f.panel.cleanup();
});

test('lost preparation responses reuse the same request key, and scene/reference drafts survive leaving the panel',async()=>{
  const f=fixture({failFirst:true});await f.panel.render({id:'character-fixture',name:'Fixture'});
  f.node('#generation-scene').oninput({target:{value:'My scene'}});f.refs[0].checked=true;f.refs[0].onchange();
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.match(f.node('#generation-error').textContent,/A művelet már megtörténhetett/);
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(JSON.parse(f.posts[0].options.body).request_key,JSON.parse(f.posts[1].options.body).request_key);
  f.panel.cleanup();await f.panel.render({id:'character-fixture',name:'Fixture'});assert.match(f.node('#profile-content').innerHTML,/My scene/);assert.match(f.node('#profile-content').innerHTML,/ref-face" checked/);f.panel.cleanup();
});

test('missing credentials or canon disable preparation and explain the next local step',async()=>{
  for(const options of [{available:false},{canon:false}]){const f=fixture(options);await f.panel.render({id:'character-fixture',name:'Fixture'});assert.equal(f.node('#generation-prepare').disabled,true);assert.match(f.node('#profile-content').innerHTML,options.canon===false?/Approved identity/:/Connect Sogni.cmd/);assert.equal(f.posts.length,0);f.panel.cleanup();}
});

test('A17 the generation retry control only reads status after an ambiguous write, preserving the draft',async()=>{
  const f=fixture({failFirst:true});await f.panel.render({id:'character-fixture',name:'Fixture'});
  let retry;const out=f.node('#generation-error');out.ownerDocument={createElement:()=>({isConnected:true})};out.append=button=>{retry=button;};
  f.node('#generation-scene').oninput({target:{value:'Retained scene'}});f.refs[0].checked=true;f.refs[0].onchange();
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(f.posts.length,1);assert.ok(retry);
  const reads=f.reads.length;await retry.onclick();assert.equal(f.reads.length,reads+1);assert.equal(f.posts.length,1);
  assert.match(out.textContent,/újra válaszol/);
  f.panel.cleanup();await f.panel.render({id:'character-fixture',name:'Fixture'});assert.match(f.node('#profile-content').innerHTML,/Retained scene/);f.panel.cleanup();
});
test('one exact-plan approval starts one image and completion stays in place until Gallery is explicitly opened',async()=>{
  const saved=[],opened=[],f=fixture({onSaved:async(...args)=>saved.push(args),onOpenGallery:async(...args)=>opened.push(args)});await f.panel.render({id:'character-fixture',name:'Fixture'});
  f.node('#generation-scene').oninput({target:{value:'New scene'}});f.refs[0].checked=true;f.refs[0].onchange();await f.node('#generation-composer').onsubmit({preventDefault(){}});
  f.node('#generation-upload-ack').checked=true;await f.node('#generation-estimate').onclick();f.node('#generation-ack').checked=true;await f.node('#generation-approve').onclick();
  assert.deepEqual(saved,[['character-fixture','new-media']]);assert.deepEqual(opened,[]);assert.match(f.node('#generation-plan').innerHTML,/generation-result/);
  const approval=JSON.parse(f.posts.find(p=>p.url.endsWith('/decision')).options.body);assert.equal(approval.manifest_hash,'estimated-hash');assert.equal(approval.acknowledge_external_upload_and_cost,true);assert.equal(f.posts.filter(p=>p.url.endsWith('/execute')).length,1);
  await f.node('#generation-open-gallery').onclick();assert.deepEqual(opened,[['character-fixture','new-media']]);const count=f.posts.length;f.node('#generation-again').onclick();assert.equal(f.posts.length,count);f.panel.cleanup();
});

test('automatic reference selection retains approved choices, respects provider limits and never substitutes unavailable images',()=>{
 const refs=[{media_id:'a',role:'face',available:true},{media_id:'b',role:'body',available:true},{media_id:'c',role:'detail',available:false}];
 assert.deepEqual(defaultGenerationReferences(refs,2),['a','b']);assert.deepEqual(defaultGenerationReferences(refs,1),['a']);assert.deepEqual(defaultGenerationReferences(refs,2,['c','b']),['b']);assert.deepEqual(defaultGenerationReferences([],2),[]);
});
