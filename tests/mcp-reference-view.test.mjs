import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import {serve,tools} from '../mcp/server.mjs';
import {REFERENCE_VIEW_URI,REFERENCE_VIEW_HTML,mountReferencePreview} from '../mcp/reference-view.mjs';

test('reference preview is a single static resource and only verified image results carry widget pixels',async()=>{
  const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);
  const data={revision:{id:'canon-id'},references:[{media_id:'media-id',role:'body'}],image_info:{approved_original_fingerprint_verified:true}};
  const jpeg={type:'image',mimeType:'image/jpeg',data:'/9j/AAAA'};
  const catalogue={call:async(name,args)=>{if(args.fail)throw Error('private path');return {data,...(args.include_image?{image:jpeg}:{})};}};
  const running=serve({catalogue,input,output});let id=0;
  const requests=[['initialize',{}],['resources/list',{}],['resources/read',{uri:REFERENCE_VIEW_URI}],['resources/read',{uri:'file:///secret'}],['resources/read',{uri:REFERENCE_VIEW_URI,path:'secret'}],['tools/call',{name:'get_approved_references',arguments:{media_id:'media-id',include_image:true}}],['tools/call',{name:'get_approved_references',arguments:{}}],['tools/call',{name:'get_approved_references',arguments:{fail:true}}]];
  input.end(requests.map(([method,params])=>JSON.stringify({jsonrpc:'2.0',id:++id,method,params})).join('\n')+'\n');await running;
  const replies=wire.trim().split('\n').map(JSON.parse);
  assert.equal(replies[1].result.resources.length,1);assert.equal(replies[2].result.contents[0].text,REFERENCE_VIEW_HTML);
  assert.equal(replies[2].result.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.equal(replies[3].error.code,-32601);assert.equal(replies[4].error.code,-32601);
  const image=replies[5].result;assert.deepEqual(image.content[1],jpeg);assert.deepEqual(image._meta.referencePreview,{mimeType:'image/jpeg',role:'body',revision_id:'canon-id',representation:'original'});
  assert.equal(JSON.stringify(image.structuredContent).includes(jpeg.data),false);
  assert.equal(replies[6].result._meta,undefined);assert.equal(replies[7].result._meta,undefined);assert.equal(wire.includes('private path'),false);
  assert.equal(tools.length,10);assert.equal(tools.find(t=>t.name==='get_approved_references')._meta.ui.resourceUri,REFERENCE_VIEW_URI);
});

test('preview rejects foreign messages and remote images, renders literal text and clears stale images on error',()=>{
  const elements=Object.fromEntries(['reference','status','details'].map(id=>[id,{hidden:true,removeAttribute(name){delete this[name];}}]));
  const listeners={},sent=[],parent={postMessage:m=>sent.push(m)};
  const window={parent,addEventListener:(name,fn)=>listeners[name]=fn};
  const document={getElementById:id=>elements[id]};
  vm.runInNewContext(`(${mountReferencePreview.toString()})();`,{window,document});
  const message=params=>({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params}});
  const preview={_meta:{referencePreview:{data:'/9j/AAAA',role:'<script>bad</script>',revision_id:'canonical-id'}}};
  listeners.message({...message(preview),source:{}});assert.equal(elements.reference.src,undefined);
  listeners.message(message(preview));assert.equal(elements.reference.src,'data:image/jpeg;base64,/9j/AAAA');assert.equal(elements.reference.hidden,false);assert.match(elements.status.textContent,/<script>/);assert.equal(elements.status.innerHTML,undefined);
  listeners.message(message({_meta:{referencePreview:{data:'https://evil.test/image'}}}));assert.equal(elements.reference.src,undefined);assert.equal(elements.reference.hidden,true);
  listeners.message(message(preview));listeners.message(message({isError:true}));assert.equal(elements.reference.src,undefined);
  listeners.message({source:parent,data:{jsonrpc:'2.0',id:1,result:{}}});assert.equal(sent.at(-1).method,'ui/notifications/initialized');
  assert.ok(sent.every(m=>!['tools/call','ui/message'].includes(m.method)));
});

test('original reference viewer reads PNG content once, rejects SVG and clears metadata-only large images',()=>{
  const elements=Object.fromEntries(['reference','status','details'].map(id=>[id,{hidden:true,removeAttribute(name){delete this[name];}}]));
  const listeners={},parent={postMessage(){}};const window={parent,addEventListener:(name,fn)=>listeners[name]=fn},document={getElementById:id=>elements[id]};
  vm.runInNewContext(`(${mountReferencePreview.toString()})();`,{window,document});
  const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
  const render=params=>listeners.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params}});
  const result={content:[{type:'image',mimeType:'image/png',data}],structuredContent:{image_info:{representation:'original',delivery:'inline',sha256:'verified-hash'}},_meta:{referencePreview:{mimeType:'image/png',role:'face',revision_id:'revision',representation:'original'}}};
  render(result);assert.equal(elements.reference.src,'data:image/png;base64,'+data);assert.match(elements.status.textContent,/original/);assert.match(elements.details.textContent,/verified-hash/);
  render({structuredContent:{image_info:{representation:'original',delivery:'chunks_required'}}});assert.equal(elements.reference.src,undefined);assert.match(elements.status.textContent,/no thumbnail was substituted/);
  render({...result,content:[{type:'image',mimeType:'image/svg+xml',data:'PHN2Zz4='}]});assert.equal(elements.reference.src,undefined);
  render({...result,content:[{type:'image',mimeType:'image/png',data:data+'A'.repeat(8388608)}]});assert.equal(elements.reference.src,undefined);
});
