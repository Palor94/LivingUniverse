import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installCharacterGeneration,sogniPresetLabel} from '../app/public/character-generation.js';
test('LoRA preset label displays the requested exact adapter names and decimal strengths',()=>{assert.equal(sogniPresetLabel({loras:['krea2-mystic-x','krea2-realism-engine'],lora_strengths:[1,0.8]}),'Mystic X · 1 / Realism Engine v3 · 0,8');});

function fixture({available=true,canon=true,failFirst=false,onSaved=async()=>{}}={}){
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',checked:false,disabled:false,isConnected:true,innerHTML:'',textContent:''});return nodes.get(selector);};
  const refs=[{dataset:{generationRef:'ref-face'},checked:false},{dataset:{generationRef:'ref-body'},checked:false}];
  const context={enabled:true,csrf:'fixture-csrf',providers:[{provider:'sogni',available,model:'krea-identity-edit',max_references:2}],canon:canon?{revision_id:'canon-fixture',references:refs.map((r,i)=>({media_id:r.dataset.generationRef,available:true,name:'Reference '+i,role:i?'body':'face'}))}:null,runs:[]};
  const posts=[],reads=[];
  const panel=installCharacterGeneration({onSaved,$:node,$$:selector=>selector==='[data-generation-ref]'?refs:[],esc:value=>String(value??'').replaceAll('<','&lt;'),api:async route=>{reads.push(route);return structuredClone(context);},mediaDialog:async()=>{},request:async(url,options)=>{
    posts.push({url,options});if(failFirst&&posts.length===1)throw Error('Lost response');
    const body=JSON.parse(options.body);return Response.json({run_id:'run-fixture',status:url.endsWith('/execute')?'succeeded':'pending',...(url.endsWith('/execute')?{output:{media_id:'new-media',active:true}}:{}),created_at:'2026-10-28T10:00:00Z',manifest_hash:'hash-fixture',manifest:{prompt:body.prompt,provider_prompt:body.prompt,provider:'sogni',model:'krea-identity-edit',size:body.size,estimated_cost_usd:null,characters:[{name:'Fixture',references:[]}]}});
  }});
  return {panel,nodes,node,refs,posts,reads};
}

test('opening the Sogni panel never submits, and exact prompt/reference choices are required before preparation',async()=>{
  const f=fixture();await f.panel.render({id:'character-fixture',name:'Fixture'});assert.equal(f.posts.length,0);assert.equal(f.node('#generation-prepare').disabled,true);
  assert.match(f.node('#profile-content').innerHTML,/Kérés előkészítése/);assert.match(f.node('#profile-content').innerHTML,/Jóváhagyott referenciák/);
  f.node('#generation-scene').oninput({target:{value:'  Literal <scene>  '}});assert.equal(f.node('#generation-prepare').disabled,true);
  f.refs[0].checked=true;f.refs[0].onchange();assert.equal(f.node('#generation-prepare').disabled,false);
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(f.posts.length,1);
  const body=JSON.parse(f.posts[0].options.body);assert.equal(body.prompt,'  Literal <scene>  ');assert.deepEqual(body.reference_ids,['ref-face']);assert.equal(body.revision_id,'canon-fixture');assert.equal(f.posts[0].options.headers['X-LU-Generation-CSRF'],'fixture-csrf');assert.match(f.node('#generation-plan').innerHTML,/Jóváhagyom a tervet/);assert.equal(f.node('#generation-approve').disabled,true);assert.equal(f.posts.some(p=>p.url.endsWith('/execute')),false);
  f.panel.cleanup();
});

test('lost preparation responses reuse the same request key, and scene/reference drafts survive leaving the panel',async()=>{
  const f=fixture({failFirst:true});await f.panel.render({id:'character-fixture',name:'Fixture'});
  f.node('#generation-scene').oninput({target:{value:'My scene'}});f.refs[0].checked=true;f.refs[0].onchange();
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(f.node('#generation-error').textContent,'Lost response');
  await f.node('#generation-composer').onsubmit({preventDefault(){}});assert.equal(JSON.parse(f.posts[0].options.body).request_key,JSON.parse(f.posts[1].options.body).request_key);
  f.panel.cleanup();await f.panel.render({id:'character-fixture',name:'Fixture'});assert.match(f.node('#profile-content').innerHTML,/My scene/);assert.match(f.node('#profile-content').innerHTML,/ref-face" checked/);f.panel.cleanup();
});

test('missing credentials or canon disable preparation and explain the next local step',async()=>{
  for(const options of [{available:false},{canon:false}]){const f=fixture(options);await f.panel.render({id:'character-fixture',name:'Fixture'});assert.equal(f.node('#generation-prepare').disabled,true);assert.match(f.node('#profile-content').innerHTML,options.canon===false?/Approved identity/:/Connect Sogni.cmd/);assert.equal(f.posts.length,0);f.panel.cleanup();}
});
test('a newly completed image immediately opens its existing character media collection',async()=>{
  const saved=[],f=fixture({onSaved:async(...args)=>saved.push(args)});await f.panel.render({id:'character-fixture',name:'Fixture'});
  f.node('#generation-scene').oninput({target:{value:'New scene'}});f.refs[0].checked=true;f.refs[0].onchange();await f.node('#generation-composer').onsubmit({preventDefault(){}});
  await f.node('#generation-execute').onclick();assert.deepEqual(saved,[['character-fixture','new-media']]);f.panel.cleanup();
});
