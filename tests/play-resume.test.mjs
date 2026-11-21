import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
const preferences=source.slice(source.indexOf('  function rememberSpatialView(){'),source.indexOf('  // Keyboard:'));
const entry=source.slice(source.indexOf('    if(!synced){'),source.indexOf("    if(!studio)document.body.classList.add('play-mode');"));
function fixture(saved,{blocked=false,failPlace=false}={}){
  const writes=[],reads=[];
  const town={id:'actual-town',kind:'town'},place={id:'actual-room',location_id:'actual-location'};
  const ctx={studio:false,mode:'map',townId:null,spatialView:{mode:'map',townId:null},synced:false,current:{node:{id:'stale-room'}},phone:true,talkCharacter:null,
    data:{node_id:place.id},node:id=>id===place.id?place:id===town.id?town:null,townOf:()=>town,
    localStorage:{getItem(){if(blocked)throw Error('blocked');return saved;},setItem(k,v){if(blocked)throw Error('blocked');writes.push(JSON.parse(v));}},
    api:async route=>{reads.push(route);if(failPlace)throw Error('synthetic offline');return {node:place,people:[]};}};
  vm.createContext(ctx);vm.runInContext(preferences+`;async function enter(){${entry}}`,ctx);
  return {ctx,writes,reads,town,place};
}
test('A9 ignores legacy menu preferences and malformed/blocked storage, accepting only map/town',()=>{
  for(const mode of ['journal','relationships','messages','settings','place'])assert.equal(fixture(JSON.stringify({mode,townId:'old-town'})).ctx.mode,'map');
  for(const value of [null,'not-json','{}','null'])assert.equal(fixture(value).ctx.mode,'map');
  assert.equal(fixture(null,{blocked:true}).ctx.mode,'map');
  for(const mode of ['map','town']){
    const {ctx}=fixture(JSON.stringify({mode,townId:'saved-town'}));assert.equal(ctx.mode,mode);assert.equal(ctx.townId,'saved-town');
  }
});
test('A9 menus never overwrite the last spatial preference and place views remain persisted as map',()=>{
  const f=fixture(JSON.stringify({mode:'town',townId:'saved-town'}));
  for(const mode of ['journal','relationships','messages','settings']){f.ctx.mode=mode;f.ctx.rememberSpatialView();}
  assert.equal(f.writes.length,0);assert.equal(f.ctx.spatialView.mode,'town');
  f.ctx.mode='place';f.ctx.rememberSpatialView();assert.equal(f.writes[0].mode,'map');
  const blocked=fixture(null,{blocked:true});assert.doesNotThrow(()=>blocked.ctx.rememberSpatialView());
});
test('A9 reopening resolves the real room, keeps menus transient within a session and reads no travel/AI route',async()=>{
  const f=fixture(JSON.stringify({mode:'town',townId:'wrong-town'}));
  f.ctx.mode='settings';await f.ctx.enter();assert.equal(f.ctx.mode,'place');assert.equal(f.ctx.current.node.id,f.place.id);
  f.ctx.mode='journal';await f.ctx.enter();assert.equal(f.ctx.mode,'journal','normal in-session rerenders keep the menu');
  f.ctx.synced=false;await f.ctx.enter();assert.equal(f.ctx.mode,'place');
  assert.deepEqual(f.reads,['/api/play/place/actual-room','/api/play/place/actual-room']);
});
test('A9 corrects a stale town preference; missing nodes and failed room reads never show an old scene',async()=>{
  const f=fixture(JSON.stringify({mode:'town',townId:'wrong-town'}));f.ctx.data.node_id=f.town.id;
  await f.ctx.enter();assert.equal(f.ctx.mode,'town');assert.equal(f.ctx.townId,f.town.id);assert.equal(f.ctx.current,null);
  f.ctx.data.node_id='unknown';f.ctx.synced=false;await f.ctx.enter();assert.equal(f.ctx.mode,'map');assert.equal(f.ctx.townId,null);
  const failed=fixture(JSON.stringify({mode:'town',townId:'wrong-town'}),{failPlace:true});await failed.ctx.enter();
  assert.equal(failed.ctx.mode,'town');assert.equal(failed.ctx.townId,failed.town.id);assert.equal(failed.ctx.current,null);
});
