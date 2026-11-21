import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {groupSystemErrors,renderSystemErrors} from '../app/public/system-error-summary.js';
const cid='11111111-1111-4111-8111-111111111111',one='22222222-2222-4222-8222-222222222222',two='33333333-3333-4333-8333-333333333333';
test('V4 repeats group by character/resource and display human text without UUIDs or API paths',()=>{
  const error=id=>({route:`/api/characters/${cid}/references/${id}/image`,message:'Thumbnail conversion unavailable.'}),errors=[error(one),error(one),error(two)];
  const groups=groupSystemErrors(errors,[{id:cid,name:'Teszt Ádám'}]);assert.equal(groups.length,1);assert.equal(groups[0].resources,2);assert.equal(groups[0].occurrences,3);
  const html=renderSystemErrors(errors,[{id:cid,name:'<Teszt Ádám>'}],s=>String(s).replaceAll('<','&lt;'));
  assert.match(html,/2 referenciakép/);assert.match(html,/&lt;Teszt Ádám>/);assert.match(html,/Előfordulás: 3/);assert.equal((html.match(/data-system-character=/g)||[]).length,1);
  const visible=html.replace(/<[^>]*>/g,'');assert.doesNotMatch(visible,/\/api\/|11111111|22222222|Thumbnail/);
  assert.equal(groupSystemErrors(errors,[])[0].characterId,null);
});
test('V5 failed approved preview becomes a keyboard-accessible opener; original and canon actions are unchanged',()=>{
  const source=readFileSync(new URL('../app/public/client.js',import.meta.url),'utf8'),fn=source.slice(source.indexOf('function bindImages(){'),source.indexOf('let characterListReturn='));
  let replacement,opened=0;const image={complete:false,naturalWidth:0,getAttribute:()=>'/reference',closest:()=>({querySelector:()=>({click:()=>opened++})}),replaceWith:node=>replacement=node};
  const ctx={$$:()=>[image],t:key=>key,document:{createElement:tag=>({tag})},extras:{covers(){}}};vm.createContext(ctx);vm.runInContext(fn+';bindImages();',ctx);image.onerror();
  assert.equal(replacement.tag,'button');assert.equal(replacement.type,'button');assert.match(replacement.className,/reference-unavailable/);assert.equal(opened,0);replacement.onclick();assert.equal(opened,1);
});
