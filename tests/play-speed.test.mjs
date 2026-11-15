// Play speed (C1–C3, 2026-11-14): a trip returns a small state delta, and the cached positions
// never go stale after an appointment or a clock advance. Synthetic characters and places only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {originChild,originIndex,arrivalOf} from '../app/place-network.mjs';

test('origin index answers exactly like the scanning originChild',()=>{
  const n=(id,name,parent_id,extra={})=>({id,name,parent_id,kind:'place',...extra});
  const nodes=[n('h','Ház',null),n('a','Nappali','h',{archived:true}),n('b','Konyha','h'),n('c','Nappali','h'),n('d','Nagyszoba','h'),
    n('l','Tó',null),n('s','Tópart','l',{placed:false}),n('s2','Tópart','l'),n('x','Utca',null),n('r','Nappali',null)];
  const index=originIndex(nodes);
  for(const id of [null,'h','l','x','b','nincs'])assert.equal(originChild(nodes,id,index),originChild(nodes,id),String(id));
  const byId=new Map(nodes.map(x=>[x.id,x]));
  for(const [from,to] of [[null,'h'],['b','h'],['x','l'],['s2','l']])assert.equal(arrivalOf(nodes,byId,from,to,index),arrivalOf(nodes,byId,from,to));
});

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('play speed: travel returns the state delta; positions follow appointments and the clock',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-speed-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({reply:'Szia!'})),worldClock:()=>new Date('2026-11-13T10:00:00'),playRandom:()=>0.99});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(res=>app.server.listen(0,'127.0.0.1',res));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const x=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:x.status,data:await x.json()};};
  const palor=(await call('/api/characters',{name:'Palor',gender:'férfi'})).data;
  const sanyi=(await call('/api/characters',{name:'Sanyi',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+sanyi.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Dolgozik.')},history:[],proposals:[]}));
  const loc=async name=>(await call('/api/locations',{name,kind:'tag'})).data;
  const house=await loc('Sanyi háza'),living=await loc('Sanyi háza - Nappali'),shop=await loc('Műhely'),pub=await loc('Kocsma');
  await call('/api/world-engine/places',{character_id:sanyi.id,location_id:house.id,role:'home'});
  await call('/api/world-engine/places',{character_id:sanyi.id,location_id:shop.id,role:'work'});
  await call('/api/world-engine/levels',{source_id:sanyi.id,target_id:palor.id,level:2});
  const n=(id,name,parent,src,order=0)=>({id,name,parent_id:parent,kind:'place',source_id:src,placed:true,archived:false,order});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[
    n('t-fv','Székesfehérvár',null,null,0),n('n-house','Sanyi háza','t-fv',house.id,0),n('n-living','Nappali','n-house',living.id,0),
    n('n-shop','Műhely','t-fv',shop.id,1),n('n-pub','Kocsma','t-fv',pub.id,2)]}}]}));
  const where=async()=>(await call('/api/play')).data.people.find(p=>p.id===sanyi.id)?.location_id;

  // Morning of a workday: at work. The overview flags the house's entry room (C2 index).
  const ov=(await call('/api/play')).data;
  assert.equal(ov.nodes.find(x=>x.id==='n-house').origin_id,'n-living');
  assert.equal(await where(),shop.id);

  // A trip returns the delta: Palor's node, the clock and everyone's place, without a reload.
  const trip=(await call('/api/play/travel',{node_id:'n-house'})).data;
  assert.equal(trip.node.id,'n-living','a home is entered in its living room');
  assert.equal(trip.state.node_id,'n-living');
  assert.ok(trip.state.clock?.day&&Number.isInteger(trip.state.clock.slot_index));
  assert.deepEqual(trip.state.people,[{id:sanyi.id,location_id:shop.id}]);
  assert.ok(Array.isArray(trip.state.items));assert.equal(trip.state.unread_messages,0);assert.equal(trip.state.open_conversation,null);
  const after=(await call('/api/play')).data;
  for(const k of ['node_id','clock','items','unread_messages','open_conversation'])assert.deepEqual(trip.state[k],after[k],k+' matches the overview');
  assert.deepEqual(trip.state.people,after.people.map(p=>({id:p.id,location_id:p.location_id})));

  // An accepted invitation for this day part moves him at once (no stale cached position).
  const inv=(await call('/api/play/invite',{character_id:sanyi.id,node_id:'n-pub',slot_index:trip.state.clock.slot_index})).data;
  assert.equal(inv.status,'accepted');
  assert.equal(await where(),pub.id);
  // Next trip's delta sees it too.
  assert.equal((await call('/api/play/travel',{node_id:'n-pub'})).data.state.people[0].location_id,pub.id);

  // Two day parts later (evening) the morning date no longer holds: he is home, in the house's
  // entry room, where Palor can actually meet him (2026-11-15; the house itself is never a room).
  for(let i=0;i<2;i++)assert.equal((await call('/api/play/wait',{until:'next_slot'})).status,200);
  assert.equal((await call('/api/play')).data.clock.slot_index,2);
  assert.equal(await where(),living.id);
});
