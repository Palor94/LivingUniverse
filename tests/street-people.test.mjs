// People on a town's street (owner, 2026-11-23): someone whose day puts him on the street is met in
// the street window while Palor walks in that town, once per day part; the consistency checks
// accept the street but still refuse a stairwell. Synthetic world, mock provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {livingWorld} from './helpers/living-world.mjs';
import {checkInvariants} from '../app/invariants.mjs';

const SLOT_IDS=['reggel','delutan','este','ejszaka'];
test('a person on the town street stops Palor in the street window, once per day part',async t=>{
  const w=await livingWorld(t);
  const street=await w.call('/api/locations',{name:'Teszt város - street',kind:'tag'});
  const home=await w.call('/api/locations',{name:'Teszt otthon',kind:'tag'});
  const nodes=[
    {id:'n-town',name:'Teszt város',parent_id:null,kind:'place',placed:true,archived:false,order:0},
    {id:'n-street',name:'Teszt város - street',short_name:'Street',parent_id:'n-town',kind:'place',source_id:street.id,placed:true,archived:false,order:0},
    {id:'n-cafe',name:'Teszt kávézó',parent_id:'n-town',kind:'place',source_id:w.cafe.id,placed:true,archived:false,order:1},
    {id:'n-home',name:'Teszt otthon',parent_id:'n-town',kind:'place',source_id:home.id,placed:true,archived:false,order:2}];
  await fs.writeFile(path.join(w.dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r2',approved_head:'r2',revisions:[{id:'r2',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes}}]}));
  let ov=await w.call('/api/play');
  const slot=SLOT_IDS[ov.clock.slot_index];
  w.app.db.prepare("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,'accepted',?)").run(randomUUID(),w.a.id,street.id,ov.clock.day,slot,new Date().toISOString());
  ov=await w.call('/api/play');assert.equal(ov.people.find(p=>p.id===w.a.id).location_id,street.id);
  let met=0,metOnce=null;
  for(const to of ['n-home','n-cafe','n-home','n-cafe','n-home','n-cafe']){
    const r=await w.call('/api/play/travel',{node_id:to});const sm=r.trip?.encounter?.street_meet;
    if(sm?.character_id===w.a.id){met++;metOnce=r;
      // The talk opens right there on the street.
      const talk=await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',opener:true});assert.equal(talk.status,'open');
      await w.end(talk);
      const inv=await w.call('/api/play/invariants');assert.equal(inv.ok,true,JSON.stringify(inv.errors));
      // Walk on to the original destination before the next trip.
      await w.call('/api/play/travel',{node_id:sm.destination_id});}
    if((await w.call('/api/play')).clock.slot_index!==ov.clock.slot_index)break;
  }
  assert.equal(met,1,'met exactly once in this day part');
  assert.equal(metOnce.node.id,'n-town','Palor stops on the town street');
});
test('consistency checks: town street allowed, stairwell still an error',()=>{
  const base={cast:[{id:'a',name:'A'}],palorNodeId:'t',presentAtPalor:[],openConversations:[],nodes:[{id:'t',name:'Város'},{id:'s',parent_id:'t',location_id:'L-s',name:'Street',walk_through:true,town_street:true},{id:'l',location_id:'L-l',name:'Lépcsőház',walk_through:true}]};
  assert.equal(checkInvariants({...base,positions:[['a','L-s']]}).ok,true);
  assert.ok(checkInvariants({...base,positions:[['a','L-l']]}).errors.some(e=>e.code==='ON_WALK_THROUGH'));
});
