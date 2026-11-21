import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {t} from '../app/public/i18n.js';

const source=readFileSync(new URL('../app/public/client.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('async function renderHome(){'),source.indexOf('// Pictures outside their folder'));
async function home(count,total){
  const content={innerHTML:''};
  const summary={identity:{single:0,pair:0,other:0,analysed:total},locations:{active:total,untagged:count}};
  const context={readStartupPreference:()=> 'home',localStorage:{},action:fn=>fn,t,view:'home',state:{stats:{media:total,inbox:count},characters:[]},api:async route=>route.endsWith('/sync')?{completed:0}:route.endsWith('/summary')?summary:null,paintBadges(){},paintSignals(){},paintSystem(){},heading:()=>'',esc:String,$:()=>content,$$:()=>[]};
  vm.createContext(context);await vm.runInContext(render+';renderHome()',context);
  return content.innerHTML;
}
test('32 remaining at 99.5% has one location card and one inbox card, each with a real incomplete ratio',async()=>{
  const html=await home(32,6400);
  assert.equal((html.match(/32 hátra/g)||[]).length,4,'one visible count and one accessible progress description per task');
  assert.equal((html.match(/data-home-task="locations"/g)||[]).length,1);
  assert.equal((html.match(/data-home-task="inbox"/g)||[]).length,1);
  assert.equal((html.match(/data-progress="99.5" data-incomplete/g)||[]).length,2);
  assert.equal((html.match(/99% kész/g)||[]).length,2);
  assert.ok(!html.includes('100% kész'));
  assert.ok(!html.includes('home-cards'));
  assert.match(source,/min\(\$\{bar.dataset.progress\}%, calc\(100% - 4px\)\)/);
});
test('only an empty queue is complete, including an empty catalogue',async()=>{
  for(const total of [0,6400]){
    const html=await home(0,total);
    assert.equal((html.match(/100% kész/g)||[]).length,2);
    assert.ok(!html.includes('data-incomplete'));
    assert.equal((html.match(/ disabled/g)||[]).length,2);
  }
});
test('inconsistent totals never show a negative or completed pending queue',async()=>{
  const html=await home(32,0);
  assert.equal((html.match(/data-progress="0" data-incomplete/g)||[]).length,2);
  assert.ok(!html.includes('100% kész'));
});
