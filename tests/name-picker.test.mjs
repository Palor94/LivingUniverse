import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortNames,foldName} from '../app/public/name-picker.js';
test('Hungarian name ordering is shared, accent-aware, stable and puts only explicitly flagged group records last',()=>{
  const rows=[{id:'c',name:'Csaba'},{id:'group',name:'Ábel',is_group:true},{id:'a',name:'Ádám'},{id:'b',name:'Ábel'},{id:'z',name:'Zoltán'},{id:'unknown',name:'Vonatos fiatalok'}];const before=structuredClone(rows);assert.deepEqual(sortNames(rows).map(x=>x.id),['b','a','c','unknown','z','group']);assert.deepEqual(rows,before);assert.equal(foldName('ÁRvíztűrő'),'arvizturo');
});
