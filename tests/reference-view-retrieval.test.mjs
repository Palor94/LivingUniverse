import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountReferencePreview,readReferenceView,REFERENCE_VIEW_URI} from '../mcp/reference-view.mjs';
import {retrieveReviewedWorldMedia} from '../app/world-review-retrieval.mjs';

// A minimal browser stand-in for the MCP reference widget.
function widget(){
  const el=()=>({hidden:true,src:'',alt:'',textContent:'',removeAttribute(k){this[k]='';}});
  const nodes={reference:el(),status:el(),details:el()},listeners={},posted=[];
  globalThis.document={getElementById:id=>nodes[id],documentElement:{scrollHeight:100},body:{}};
  const parent={postMessage:m=>posted.push(m)};
  globalThis.window={parent,openai:undefined,addEventListener:(type,fn)=>{listeners[type]=fn;}};
  mountReferencePreview();
  const send=params=>listeners.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params}});
  return {nodes,posted,send,listeners,parent};
}

test('reference widget: shows only real inline JPEG/PNG data, never URLs, SVG or broken data',()=>{
  const w=widget();
  assert.equal(w.posted[0].method,'ui/initialize');
  const jpeg='/9j/'+'A'.repeat(60);
  w.send({content:[{type:'image',data:jpeg,mimeType:'image/jpeg'}],_meta:{referencePreview:{role:'face',revision_id:'r1'}},structuredContent:{image_info:{representation:'original',sha256:'abc'}}});
  assert.equal(w.nodes.reference.hidden,false);assert.equal(w.nodes.reference.src,'data:image/jpeg;base64,'+jpeg);assert.match(w.nodes.status.textContent,/original reference · face/);assert.match(w.nodes.details.textContent,/Canon revision r1/);
  for(const bad of [{data:'PHN2Zz4=',mimeType:'image/svg+xml'},{data:'iVBORw0KGgo'+'A'.repeat(9),mimeType:'image/jpeg'},{data:'/9j/AAA',mimeType:'image/jpeg'},{data:'/9j/'+'A'.repeat(59)+'$',mimeType:'image/jpeg'}]){
    w.send({content:[{type:'image',...bad}]});assert.equal(w.nodes.reference.hidden,true,JSON.stringify(bad));assert.equal(w.nodes.reference.src,'');assert.match(w.nodes.status.textContent,/cannot display it here/);
  }
  w.send({isError:true});assert.match(w.nodes.status.textContent,/unavailable/);
  w.send({structuredContent:{image_info:{delivery:'chunks_required'}}});assert.match(w.nodes.status.textContent,/no thumbnail was substituted/);
  // Messages from anyone but the host are ignored.
  w.listeners.message({source:{},data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[{type:'image',data:jpeg,mimeType:'image/jpeg'}]}}});
  assert.equal(w.nodes.reference.hidden,true);
  const r=readReferenceView();assert.equal(r.contents[0].uri,REFERENCE_VIEW_URI);assert.deepEqual(r.contents[0]._meta.ui.csp,{connectDomains:[],resourceDomains:[]},'no network for the widget');
  delete globalThis.window;delete globalThis.document;
});

test('reviewed media retrieval: rejects unknown or malformed criteria before touching the database',()=>{
  let touched=0;const db={prepare:()=>{touched++;return {all:()=>[]};}};
  for(const bad of [{nope:1},[],{purpose:'other'},{character_ids:'x'},{character_ids:Array(9).fill('a')},{camera:{zoom:'x'}},{activities:['']},{activities:'running'},{query:'x'.repeat(201)},{accepted_only:'yes'},{participant_role_requirements:[{character_id:'a',role:'nope'}]}])
    assert.throws(()=>retrieveReviewedWorldMedia(db,bad),e=>e.code==='INVALID_CRITERIA',JSON.stringify(bad));
  assert.equal(touched,0);
  const empty=retrieveReviewedWorldMedia(db,{});assert.deepEqual(empty,{total:0,items:[],reason:'NO_MATCH',uses_proposed_labels:true});
  assert.equal(retrieveReviewedWorldMedia(db,{accepted_only:true}).uses_proposed_labels,false);
});
