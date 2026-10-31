import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {retainMediaSearch} from '../app/public/media-form.js';

function searchInput({focused=true,start=4,end=start,direction='none'}={}){
  const document={activeElement:null},input={value:'árvíztűrő',selectionStart:start,selectionEnd:end,selectionDirection:direction,ownerDocument:document,
    focus(options){this.focusOptions=options;document.activeElement=this;this.selectionStart=this.selectionEnd=0;},
    setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}};
  if(focused)document.activeElement=input;
  return input;
}

test('media redraw retains the same input, text, caret and backwards selection without scrolling',()=>{
  const input=searchInput({start:2,end:6,direction:'backward'}),restore=retainMediaSearch(input),replacement={replaceWith(node){this.reused=node;}};
  input.ownerDocument.activeElement=null;restore(replacement);
  assert.equal(replacement.reused,input);assert.equal(input.value,'árvíztűrő');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,6);assert.equal(input.selectionDirection,'backward');assert.deepEqual(input.focusOptions,{preventScroll:true});
});

test('media redraw does not steal focus when the user has moved to a different control',()=>{
  const input=searchInput({focused:false}),otherControl={};input.ownerDocument.activeElement=otherControl;
  retainMediaSearch(input)({replaceWith(){}});assert.equal(input.ownerDocument.activeElement,otherControl);assert.equal(input.focusOptions,undefined);
  retainMediaSearch(null)(null);
});

function clientFunctions(){
  const source=readFileSync(new URL('../app/public/client.js',import.meta.url),'utf8');
  const functions=source.slice(source.indexOf('function mediaViewContext()'),source.indexOf('function pager('));
  const pages=[],context=vm.createContext({URLSearchParams,view:'library',activeCharacter:null,profileTab:'profile',query:'a',kind:'image',folder:'',offset:0,sorting:{getStatus:()=>'',setPage:(...args)=>pages.push(args)},tagging:{getFilter:()=>''},places:{getFilter:()=>''}});
  vm.runInContext(functions,context);return {context,pages};
}

test('a slow response for an older search is discarded while the newest query can update results',async()=>{
  const {context,pages}=clientFunctions();let release;context.api=()=>new Promise(r=>{release=r;});
  const stale=context.fetchMedia();context.query='ab';release({items:[{id:'stale'}],total:1});assert.equal(await stale,null);assert.equal(pages.length,0);
  context.api=async()=>({items:[{id:'latest'}],total:1});const latest=await context.fetchMedia();assert.equal(latest.items[0].id,'latest');assert.equal(pages.length,1);assert.match(pages[0][1],/search=ab/);
});

test('changing dossier tabs discards pending media results; valid last-page fallback still succeeds',async()=>{
  const {context,pages}=clientFunctions();context.view='profile';context.profileTab='media';context.activeCharacter='fixture';let release;context.api=()=>new Promise(r=>{release=r;});
  const pending=context.fetchMedia('fixture');context.profileTab='events';release({items:[],total:0});assert.equal(await pending,null);assert.equal(pages.length,0);
  context.profileTab='media';context.offset=48;context.api=async()=>({items:[{id:'first-page'}],total:1});const result=await context.fetchMedia('fixture');assert.equal(result.items[0].id,'first-page');assert.equal(context.offset,0);assert.equal(pages.length,1);
});
