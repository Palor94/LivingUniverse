import {test} from 'node:test';
import assert from 'node:assert/strict';
import {livingWorld} from './helpers/living-world.mjs';

test('schedule approval refuses changed profile/schedule and preserves failed proposals',async t=>{
  const w=await livingWorld(t),base='/api/play/schedules/'+w.a.id,grid={'1|reggel':{location_id:w.cafe.id,activity:'Meglévő feladat.',privacy:'secret'}};
  let state=await w.call(base,{grid});
  await w.call(base+'/proposal',{grid:{'2|este':w.cafe.id},source:'synthetic'});
  const key='ghost:character:'+w.a.id,p=JSON.parse(w.app.db.prepare('SELECT value FROM application_settings WHERE key=?').get(key).value);p.values.weekly_routine={value:'Más heti rutin.',kind:'hypothesis'};
  w.app.db.prepare('UPDATE application_settings SET value=? WHERE key=?').run(JSON.stringify(p),key);
  assert.equal((await w.call(base)).proposal.stale,true);await assert.rejects(w.call(base+'/proposal/accept',{}));
  assert.deepEqual((await w.call(base)).grid,grid);assert.ok((await w.call(base)).proposal);
  await w.call(base+'/proposal/reject',{});
  await w.call(base,{grid:{'3|este':w.cafe.id},expected_version:state.version});
  await assert.rejects(w.call(base,{grid,expected_version:state.version}));
  state=await w.call(base);assert.ok(state.grid['3|este']);assert.equal(state.grid['1|reggel'],undefined);
  await w.call(base+'/proposal',{grid:{'4|este':w.cafe.id},source:'synthetic'});
  const propKey='world:schedule-proposal:'+w.a.id,proposal=JSON.parse(w.app.db.prepare('SELECT value FROM application_settings WHERE key=?').get(propKey).value);proposal.grid={'4|este':'missing-location'};
  w.app.db.prepare('UPDATE application_settings SET value=? WHERE key=?').run(JSON.stringify(proposal),propKey);
  await assert.rejects(w.call(base+'/proposal/accept',{}));
  assert.ok((await w.call(base)).proposal,'failed acceptance cannot delete a proposal');assert.deepEqual((await w.call(base)).grid,state.grid);
  await assert.rejects(w.call(base,{expected_version:state.version}));assert.deepEqual((await w.call(base)).grid,state.grid);
  state=await w.call(base,{grid:{},flexible:true});assert.equal(state.flexible,true);assert.deepEqual(state.grid,{});
  await w.call(base,{grid:{}});assert.equal((await w.call(base)).flexible,true,'ordinary saves preserve the explicit flexible decision');
});
