// Travel between towns by bicycle, car or train; entry rooms; passages; the Káloz countryside
// (owner request, 2026-11-14). Synthetic places only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {travelMinutes,travelOptions,trainBetween,arrivalOf,passagesOf,isPassage,isRegion,originChild,rollEncounter,ridesWith,tripScenePlaces,isFuelStop,transportPlace,rollRoadside,ROADSIDE} from '../app/place-network.mjs';
import {transportOf,validateStory} from '../app/play-stories.mjs';

const N=(id,name,parent_id=null,location_id='l-'+id)=>({id,name,short_name:name,parent_id,location_id,kind:'place'});
const nodes=[
  {...N('bp','Budapest'),location_id:null},N('bp-utca','Utca','bp'),N('bp-flat','Milán lakása','bp'),N('bp-flat-n','Nappali','bp-flat'),N('bp-flat-e','Erkély','bp-flat'),
  N('stairs','Emeletes ház lépcsőháza'),
  {...N('fv','Székesfehérvár'),location_id:null},N('fv-pub','Kocsma','fv'),
  {...N('kz','Káloz'),location_id:null},N('kz-utca','Utca','kz'),N('kz-house','Péter háza','kz'),N('kz-house-n','Nappali','kz-house'),N('kz-house-k','Konyha','kz-house'),
  N('kz-h','Káloz határa','kz'),N('lake','Tó','kz-h'),N('shore','Tópart','lake'),N('park','Erdei parkoló','kz-h'),N('forest','Erdő','park'),N('peak','Mountain','forest'),
  {...N('sb','Sárbogárd'),location_id:null},N('sb-g','Gimnázium','sb'),{...N('pecs','Pécs'),location_id:null},N('pecs-k','Kollégium','pecs')
];
const byId=new Map(nodes.map(n=>[n.id,n]));

test('travel modes: bike is much slower than car; trains only on real direct lines',()=>{
  const bike=travelMinutes(byId,'kz-house-n','fv-pub',{mode:'bike'}),car=travelMinutes(byId,'kz-house-n','fv-pub',{mode:'car'});
  assert.ok(bike>car*2.5,`bike ${bike} car ${car}`);
  assert.equal(trainBetween(byId.get('kz'),byId.get('fv')),null,'Káloz has no station');
  assert.equal(trainBetween(byId.get('bp'),byId.get('pecs')).line,'40','Pécs only by the Budapest – Sárbogárd – Pécs train');
  assert.equal(trainBetween(byId.get('fv'),byId.get('pecs')),null);
  assert.equal(trainBetween(byId.get('fv'),byId.get('sb')).line,'45');
  assert.deepEqual(travelOptions(byId,'kz-house-n','fv-pub').map(o=>o.mode),['bike','car']);
  assert.deepEqual(travelOptions(byId,'bp-flat-n','sb-g').map(o=>o.mode),['bike','car','train']);
  // Pécs: car or train only (owner, 2026-11-14).
  assert.deepEqual(travelOptions(byId,'bp-flat-n','pecs-k').map(o=>o.mode),['car','train']);
  assert.deepEqual(travelOptions(byId,'kz-house-n','pecs-k').map(o=>o.mode),['car']);
  // No trains between midnight and 4 am (owner, 2026-11-14): shown, but not available.
  assert.equal(travelOptions(byId,'bp-flat-n','sb-g',{hour:2}).find(o=>o.mode==='train').unavailable,'night');
  assert.equal(travelOptions(byId,'bp-flat-n','sb-g',{hour:4}).find(o=>o.mode==='train').unavailable,undefined);
  assert.deepEqual(travelOptions(byId,'kz-house-n','kz-house-k'),[],'no window inside a town');
  // Inside Káloz one walks, even with a car (owner, 2026-11-14).
  assert.equal(travelMinutes(byId,'kz-house-n','kz-h',{mode:'car'}),travelMinutes(byId,'kz-house-n','kz-h',{mode:'foot'}));
});

test('entry rooms: a home is entered in its living room, the lake on its shore; passages are walked through',()=>{
  assert.equal(arrivalOf(nodes,byId,'fv-pub','kz-house'),'kz-house-n');
  assert.equal(arrivalOf(nodes,byId,'kz','lake'),'shore');
  assert.equal(arrivalOf(nodes,byId,'shore','lake'),'lake','from the shore one goes into the water');
  assert.equal(originChild(nodes,'bp-flat').id,'bp-flat-n');
  assert.ok(isPassage(byId.get('bp-utca'))&&isPassage(byId.get('stairs'))&&!isPassage(byId.get('bp-flat')));
  assert.ok(isRegion(byId.get('kz-h')));
  // Out of a flat: stairwell, then the street; between two rooms of one home: nothing.
  assert.deepEqual(passagesOf(nodes,byId,'bp-flat-n','sb-g').map(n=>n.id),['stairs','bp-utca']);
  assert.deepEqual(passagesOf(nodes,byId,'bp-flat-n','bp-flat-e'),[]);
  assert.deepEqual(passagesOf(nodes,byId,'kz-house-k','kz-h').map(n=>n.id),['kz-utca']);
});

test('the countryside: the mountain is a long hike, the water a few steps from the shore',()=>{
  const toPeak=travelMinutes(byId,'kz-h','peak'),toLake=travelMinutes(byId,'kz-h','shore');
  assert.ok(toPeak>=120,String(toPeak));assert.ok(toLake<30,String(toLake));
  assert.ok(travelMinutes(byId,'shore','lake')<=5);
});

test('road happenings follow the way of travelling',()=>{
  const people=[];let i=0;const seq=[0.1,0.9,0.5];const rand=()=>seq[i++%seq.length];
  const train=rollEncounter({byId,fromId:'bp-flat-n',toId:'sb-g',people,rand,mode:'train'});
  assert.match(train.text,/vonat|kalauz|peron|állomás|megálló|kocsi/i);
  i=0;const bike=rollEncounter({byId,fromId:'kz-house-n',toId:'fv-pub',people,rand,mode:'bike'});
  assert.ok(bike&&bike.kind==='event');
});

test('stories: train and station stories only on a train; bicycle stories on a bike',()=>{
  const base={id:'x',title:'Egy út',setting:'road',content:'everyday',start:'a',nodes:{a:{text:'Kezdet.'}}};
  assert.equal(transportOf({...base,title:'Kalauz a vonaton',transport:'foot'}),'train');
  assert.equal(transportOf({...base,title:'Kukoricaföld és bicikli'}),'bike');
  assert.equal(transportOf({...base,transport:'car'}),'car');
  assert.ok(!validateStory({...base,transport:'train'}).some(e=>e.startsWith('transport')));
  assert.ok(validateStory({...base,transport:'boat'}).some(e=>e.startsWith('transport')));
});

// Cars as vehicles, trip pictures, roadside stops (owner, 2026-11-14).
test('a friend with a car is a ride between towns, never inside Káloz',()=>{
  const cars=[...nodes,N('kz-car','Péter autója','kz-house'),N('van','Lakatos Sándor fehér furgonja'),{...N('old-car','Feri autója','kz-house'),archived:true}];
  const cast=[{id:'p',name:'Péter'},{id:'s',name:'Lakatos Sándor'},{id:'f',name:'Feri'},{id:'x',name:'Xavér'}];
  assert.deepEqual(ridesWith(cars,cast,['p','x']),[{id:'p',name:'Péter',vehicle:'Péter autója',node_id:'kz-car'}],'only an owner who is with Palor');
  assert.deepEqual(ridesWith(cars,cast,['f']),[],'an archived car is no ride');
  assert.deepEqual(ridesWith(cars,cast,['s']).map(r=>r.vehicle),['Lakatos Sándor fehér furgonja']);
  const rides=[{id:'p',name:'Péter',vehicle:'Péter autója'}];
  const opts=travelOptions(byId,'kz-house-n','fv-pub',{rides});
  const ride=opts.find(o=>o.ride_with);
  assert.equal(ride.mode,'car');assert.equal(ride.minutes,opts.find(o=>o.mode==='car'&&!o.ride_with).minutes);assert.equal(ride.ride_with.name,'Péter');
  assert.deepEqual(travelOptions(byId,'kz-house-n','kz-h',{rides}),[],'inside Káloz everyone walks');
});

test('trip pictures: station then train, the friend\'s car, a petrol station only on a fuel stop',()=>{
  assert.deepEqual(tripScenePlaces({mode:'train'}),[{name:'Vasútállomás'},{name:'Vonat'}]);
  assert.deepEqual(tripScenePlaces({mode:'bike'}),[]);
  assert.deepEqual(tripScenePlaces({mode:'car'}),[]);
  assert.deepEqual(tripScenePlaces({mode:'car',encounterText:'Megállsz tankolni egy benzinkútnál; a kávé pocsék.'}),[{name:'Benzinkút'}]);
  assert.deepEqual(tripScenePlaces({mode:'car',rideNodeId:'kz-car'}),[{node_id:'kz-car'}]);
  assert.deepEqual(tripScenePlaces({mode:'train',crossTown:false}),[]);
  assert.ok(isFuelStop('Megállsz tankolni')&&!isFuelStop('Dugó van az úton.'));
  const tp=[N('train','Vonat'),{...N('st','Vasútállomás'),archived:true},N('st2','Vasútállomás')];
  assert.equal(transportPlace(tp,'vasutallomas')?.id,'st2');assert.equal(transportPlace(tp,'Benzinkút'),null);
});

test('roadside stop: only on a car trip between towns without a story, about one in four',()=>{
  const low=()=>0.1,high=()=>0.9;
  assert.ok(ROADSIDE.includes(rollRoadside({mode:'car',crossTown:true,story:null,rand:low})));
  assert.equal(rollRoadside({mode:'car',crossTown:true,story:null,rand:high}),null);
  assert.equal(rollRoadside({mode:'car',crossTown:true,story:{run_id:'r'},rand:low}),null);
  assert.equal(rollRoadside({mode:'train',crossTown:true,story:null,rand:low}),null);
  assert.equal(rollRoadside({mode:'car',crossTown:false,story:null,rand:low}),null);
  assert.ok(ROADSIDE.every(t=>!/\b(nő|férfi|lány|fiú|asszony|srác)\b/i.test(t)),'no gender words');
});
