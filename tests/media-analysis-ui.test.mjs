import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installMediaAnalysisUI} from '../app/public/media-analysis.js';
import {analysisCategories,analysisDefaultGoals} from '../app/analysis-model.mjs';

function fixture(t,provider){
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{open:true,isConnected:true,disabled:false,checked:false,innerHTML:'',value:'',textContent:''});return nodes.get(selector);};
  const posts=[],screens=[];
  const plan={chosen:{provider},items:[{media_id:'selected-id',source:{relative_path:'Synthetic.bmp',sha256:'a'.repeat(64)},derivative:{sha256:'b'.repeat(64),width:1,height:1,size:16}}],preview_hash:'c'.repeat(64),external_upload:!provider.local,transfer:{prompt:'Exact fixture prompt',output_schema:{type:'object'},image_detail:'low'},cost:{estimated_usd:.01,max_total_usd:1,input_tokens_per_image:2000,input_usd_per_million:1,output_usd_per_million:2,basis:'Fixture <rates>',limitations:'Not a billing cap'}};
  t.mock.method(globalThis,'fetch',async(url,init)=>{if(init.body){posts.push({url,body:JSON.parse(init.body)});if(url.endsWith('/preview'))return Response.json(plan);return Response.json({error:'Lost response'}, {status:503});}return Response.json({csrf:'fixture-csrf',providers:[provider],categories:analysisCategories,default_goals:analysisDefaultGoals});});
  t.mock.method(globalThis,'FormData',function(){return {get:()=>provider.id,getAll:()=>['expression']};});
  const ui=installMediaAnalysisUI({$:node,$$:()=>[],esc:value=>String(value??'').replaceAll('<','&lt;'),api:async()=>({csrf:'fixture-csrf'}),action:fn=>fn,toast:()=>{},openDialog:(title,html)=>{screens.push({title,html});node('.analysis-panel').innerHTML=html;},refresh:async()=>{}});
  return {ui,node,posts,screens};
}

test('cloud UI previews exact sources and cost, requires two unchecked acknowledgements and reuses request keys',async t=>{
  const provider={id:'openai',model:'fixture-v1',model_revision:'fixture-v1',mock:false,local:false,prompt:'v1',preprocess:'jpeg-v1',max_output_tokens:4096},f=fixture(t,provider);await f.ui.prepare(['selected-id']);assert.equal(f.posts.length,0);await f.node('#analysis-prepare').onsubmit({target:{},preventDefault(){}});assert.equal(f.posts.length,1);const html=f.screens.at(-1).html;assert.match(html,/Felhő · OpenAI/);assert.doesNotMatch(html,/Mock tesztüzem/);assert.match(html,/a{64}/);assert.match(html,/b{64}/);assert.match(html,/Fixture &lt;rates>/);assert.match(html,/nem kemény számlázási plafon/);assert.match(html,/analysis-upload-ack/);assert.match(html,/analysis-cost-ack/);assert.doesNotMatch(html,/<input[^>]*checked/);
  await assert.rejects(f.node('#analysis-start').onclick(),/külön jelölés/);assert.equal(f.posts.length,1);f.node('#analysis-upload-ack').checked=true;await assert.rejects(f.node('#analysis-start').onclick());assert.equal(f.posts.length,1);f.node('#analysis-cost-ack').checked=true;
  await assert.rejects(f.node('#analysis-start').onclick(),/Lost response/);await assert.rejects(f.node('#analysis-start').onclick(),/Lost response/);assert.equal(f.posts[1].body.request_key,f.posts[2].body.request_key);assert.deepEqual(f.posts[1].body.transfer_approval,{preview_hash:'c'.repeat(64),ack_upload:true,ack_cost:true});f.ui.cleanup();
});

test('local and mock previews clearly identify their modes and never include cloud approval',async t=>{
  for(const provider of [{id:'mock',mock:true,local:true,model:'fixture',version:'1'},{id:'ollama',mock:false,local:true,model:'vision:v1',model_revision:'digest'}]){
    const f=fixture(t,provider);await f.ui.prepare(['selected-id']);await f.node('#analysis-prepare').onsubmit({target:{},preventDefault(){}});const html=f.screens.at(-1).html;assert.match(html,provider.mock?/Mock tesztüzem/:/Helyi Ollama/);assert.doesNotMatch(html,/analysis-upload-ack|analysis-cost-ack/);await assert.rejects(f.node('#analysis-start').onclick(),/Lost response/);assert.equal(f.posts[1].body.transfer_approval,undefined);f.ui.cleanup();t.mock.restoreAll();
  }
});

test('goal picker defaults to environment, action and camera/reference use rather than clothing',async t=>{
  const f=fixture(t,{id:'mock',mock:true,local:true,model:'fixture'});await f.ui.prepare(['selected-id']);const html=f.screens.at(-1).html;
  for(const goal of analysisDefaultGoals){const input=html.match(new RegExp('<input[^>]*value="'+goal+'"[^>]*>','u'))?.[0];assert.ok(input,goal);assert.match(input,/checked/u);}
  for(const goal of ['clothing','expression','pose','lighting'])assert.doesNotMatch(html.match(new RegExp('<input[^>]*value="'+goal+'"[^>]*>','u'))?.[0]||'',/checked/u);
  assert.match(html,/Akció \/ tevékenység/u);assert.match(html,/referenciahasználat/u);f.ui.cleanup();
});
