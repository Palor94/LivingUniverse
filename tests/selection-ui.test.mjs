import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installSorting} from '../app/public/sorting.js';

test('selection controls update all bulk buttons without iterating a single DOM element',()=>{
  const nodes=new Map(['.media-grid','.toolbar','#sorting-status','#media-type-tabs','#select-visible','#clear-selected','#selection-count'].map(key=>[key,{insertAdjacentHTML(){}}]));
  const buttons=['assign','tags_add','location','unlocation'].map(operation=>({dataset:{bulkAction:operation}}));
  // Match querySelector semantics: a single element is deliberately not iterable.
  const $=selector=>selector==='[data-bulk-action]'?buttons[0]:nodes.get(selector)||null;
  const $$=selector=>selector==='[data-bulk-action]'?buttons:[];
  const sorting=installSorting({$,$$,getView:()=> 'library',esc:s=>s,action:fn=>fn});
  sorting.setPage([{id:'one'},{id:'two'}],'/api/media?ids_only=1','test-page');
  sorting.listing();assert.ok(buttons.every(b=>b.disabled));assert.equal(nodes.get('#selection-count').textContent,'0 selected on this page');
  nodes.get('#select-visible').onclick();assert.ok(buttons.every(b=>!b.disabled));assert.equal(nodes.get('#selection-count').textContent,'2 selected on this page');
  nodes.get('#clear-selected').onclick();assert.ok(buttons.every(b=>b.disabled));assert.ok(buttons.every(b=>b.title.includes('Select at least one')));
});
