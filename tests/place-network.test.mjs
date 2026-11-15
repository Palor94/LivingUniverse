import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {kindOf,chains,route,anchorOf,townOf,travelMinutes,vehicleOwner,rollEncounter} from '../app/place-network.mjs';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const N=(id,short_name,parent_id=null,location_id=null)=>({id,name:short_name,short_name,parent_id,location_id});
const nodes=[N('bp','Budapest'),N('bp-utca','Budapest utca','bp','l-utca'),N('bp-spar','Interspar','bp','l-spar-bp'),N('bp-feri','Feri háza','bp','l-feri'),N('bp-feri-n','Nappali','bp-feri','l-feri-n'),
  N('fv','Székesfehérvár'),N('fv-spar','Interspar','fv','l-spar-fv'),N('fv-domi','Domi autója','fv','l-domi-car'),N('fv-gym','Edzőterem','fv','l-gym')];
const byId=new Map(nodes.map(n=>[n.id,n]));

test('place network: kinds, chains across towns, routes, anchors and vehicle owners from the names',()=>{
  assert.equal(kindOf(byId.get('bp-utca')),'transit');assert.equal(kindOf(byId.get('bp-spar')),'shop');
  assert.equal(kindOf(byId.get('bp-feri')),'home');assert.equal(kindOf(byId.get('bp-feri-n')),'room');
  // Names from the owner's tree that used to stay unclassified.
  const k=name=>kindOf({id:'x',name,short_name:name,parent_id:'bp'});
  assert.deepEqual(['Férfi zárt','Fogdacella','Munkásszálló','Hajléktalanok sátra','Ünnepi sátor','Disco','Stadion – azonosítandó','Wellness központ','Metro','Street','Rendőrség','Sárbogárd - Gimnázium','Káloz határa','Tó','Referáló','Futárszolgálat'].map(k),
    ['work','room','home','home','leisure','leisure','leisure','leisure','transit','transit','public','public','nature','nature','room','work']);
  assert.equal(kindOf(byId.get('fv-domi')),'vehicle');assert.equal(kindOf({...byId.get('bp'),kind:'collection'}),'area');
  // The same chain in two towns: each branch points at the other (different staff per branch).
  assert.deepEqual(chains(nodes).get('bp-spar'),[{id:'fv-spar',short_name:'Interspar',town:'Székesfehérvár'}]);
  assert.equal(chains(nodes).get('fv-gym'),undefined,'one gym in one town is not a chain');
  assert.deepEqual(route(byId,'bp-feri-n','fv-gym').map(n=>n.id),['bp-feri-n','bp-feri','bp','fv','fv-gym']);
  assert.equal(anchorOf(byId,'bp-feri-n').id,'bp-feri');assert.equal(townOf(byId,'fv-gym').id,'fv');
  assert.equal(travelMinutes(byId,'bp-feri-n','bp-feri'),1);assert.ok(travelMinutes(byId,'bp-feri','fv-gym',{vehicle:true})<travelMinutes(byId,'bp-feri','fv-gym'));
  // Real distances: Budapest → Székesfehérvár by car takes about an hour; a short hop between
  // neighbouring villages much less; crossing Budapest takes longer than crossing a village.
  const geo=new Map([...nodes,N('kz','Káloz'),N('kz-h','Péter háza','kz'),N('kz-k','Kocsma','kz'),N('sb','Sárbogárd'),N('sb-g','Gergő háza','sb')].map(n=>[n.id,n]));
  const car=travelMinutes(geo,'bp-feri','fv-gym',{vehicle:true});assert.ok(car>=50&&car<=80,String(car));
  assert.ok(travelMinutes(geo,'kz-h','sb-g',{vehicle:true})<car/2);
  assert.ok(travelMinutes(geo,'kz-h','kz-k')<travelMinutes(geo,'bp-feri','bp-spar'));
  assert.equal(vehicleOwner(byId.get('fv-domi'),[{id:'d',name:'Domi'},{id:'x',name:'Dominik'}]),'d');
});

test('tree tidy-up: name prefixes suggest a parent, never pulling a place out of a deeper home; duplicates listed',async()=>{
  const {cleanupSuggestions,reparentCanvas,normalizeCanvas}=await import('../app/public/location-canvas-model.js');
  const p=(id,name,parent_id,placed=true)=>({id,name,parent_id:placed?parent_id:null,kind:'place',source_id:null,type_ids:[],placed,archived:false,order:0,note:'',x:null,y:null});
  const state=normalizeCanvas({schema:1,types:[],nodes:[{...p('world:living-universe','Living Universe',null),kind:'world'},
    p('draft:sb','Sárbogárd','world:living-universe'),p('draft:gim','Sárbogárd - Gimnázium','world:living-universe'),
    p('draft:kaloz','Káloz','world:living-universe'),p('draft:tel','Cigánytelep','draft:kaloz'),p('draft:sanyi','Sanyi háza','draft:tel'),p('draft:szoba','Sanyi háza - nagyszoba','draft:sanyi'),
    p('draft:lost','Sanyi háza - konyha',null,false),p('draft:d1','Kávézó','draft:kaloz'),p('draft:d2','Kávézó','draft:kaloz')]});
  const {suggestions,duplicates}=cleanupSuggestions(state);
  assert.deepEqual(suggestions.map(s=>[s.name,s.to,s.unplaced]),[['Sárbogárd - Gimnázium','Sárbogárd',false],['Sanyi háza - konyha','Sanyi háza',true]]);
  assert.deepEqual(duplicates.map(d=>[d.name,d.node_ids.length]),[['Kávézó',2]]);
  // Applying a suggestion with the editor's own reparent keeps the plan valid.
  const next=reparentCanvas(structuredClone(state),'draft:gim','draft:sb');
  assert.equal(next.nodes.find(n=>n.id==='draft:gim').parent_id,'draft:sb');
});

test('tree tidy-up: duplicates merge into the place still in the catalogue; the rest is archived, nothing deleted',async()=>{
  const {cleanupSuggestions,pickDuplicateKeeper,mergeDuplicates,normalizeCanvas}=await import('../app/public/location-canvas-model.js');
  const p=(id,name,parent_id,source_id=null)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
  const state=normalizeCanvas({schema:1,types:[],nodes:[{...p('world:living-universe','Living Universe',null),kind:'world'},
    p('draft:bp','Budapest','world:living-universe'),p('src-deleted','Budapest - Kávézó','draft:bp','src-deleted'),p('src-live','Budapest - Kávézó','draft:bp','src-live'),
    p('draft:terasz','Terasz','src-deleted')]});
  const [dup]=cleanupSuggestions(state).duplicates;assert.deepEqual(dup.node_ids.sort(),['src-deleted','src-live']);
  const keep=pickDuplicateKeeper(state,dup.node_ids,new Set(['src-live']));
  assert.equal(keep,'src-live','the place still in the catalogue wins over one with more sub-places');
  const next=structuredClone(state),r=mergeDuplicates(next,dup.node_ids,keep);
  assert.deepEqual(r,{moved:1,archived:1});
  const ghost=next.nodes.find(n=>n.id==='src-deleted');
  assert.ok(ghost&&ghost.archived&&ghost.source_id==='src-deleted','archived, kept with its ID and source');
  assert.equal(next.nodes.find(n=>n.id==='draft:terasz').parent_id,'src-live','its sub-place moved to the kept one');
  assert.deepEqual(cleanupSuggestions(normalizeCanvas(next)).duplicates,[]);
  assert.equal(pickDuplicateKeeper(state,dup.node_ids),'src-deleted','without catalogue info: more sub-places wins');
});

test('tree tidy-up: each dash part is one level; a missing middle level is created once and shared',async()=>{
  const {cleanupSuggestions,applyTidy,normalizeCanvas}=await import('../app/public/location-canvas-model.js');
  const p=(id,name,parent_id,placed=true)=>({id,name,parent_id:placed?parent_id:null,kind:'place',source_id:null,type_ids:[],placed,archived:false,order:0,note:'',x:null,y:null});
  const state=normalizeCanvas({schema:1,types:[],nodes:[{...p('world:living-universe','Living Universe',null),kind:'world'},
    p('k','Káloz','world:living-universe'),p('sz','Szomszéd ház','k'),
    p('n1','Káloz - Szomszéd ház - nappali',null,false),
    p('u1','Káloz - Új ház - konyha',null,false),p('u2','Káloz - Új ház - nappali',null,false),
    p('g','Sárbogárd - Gimnázium','world:living-universe'),p('t','Sárbogárd - Gimnázium - Tornaterem',null,false),
    p('kt','Kálozi cigánytelep','k'),p('kr','Káloz - Cigánytelep - rejtekhely','kt')]});
  const {suggestions}=cleanupSuggestions(state);
  const to=Object.fromEntries(suggestions.map(s=>[s.node_id,s.to]));
  assert.equal(to.n1,'Káloz › Szomszéd ház','under the existing Szomszéd ház, not straight under Káloz');
  assert.equal(to.u1,'Káloz › Új ház (új)');assert.equal(to.u2,'Káloz › Új ház (új)');
  assert.equal(to.t,'Sárbogárd - Gimnázium','a full-name prefix is still the anchor');
  assert.ok(!('kr' in to),'already inside Káloz under another name: no new level invented');
  let n=0;const next=structuredClone(state),r=applyTidy(next,suggestions,()=>'new-'+(++n));
  assert.deepEqual(r,{created:1,moved:4});
  const made=next.nodes.filter(x=>x.name==='Új ház');assert.equal(made.length,1);assert.equal(made[0].parent_id,'k');
  assert.deepEqual(['n1','u1','u2','t'].map(id=>next.nodes.find(x=>x.id===id).parent_id),['sz',made[0].id,made[0].id,'g']);
  normalizeCanvas(next);
  // Only the second room chosen: the shared level is still made for it.
  n=0;const only=structuredClone(state);assert.deepEqual(applyTidy(only,[suggestions.find(s=>s.node_id==='u2')],()=>'new-'+(++n)),{created:1,moved:1});
});

test('travel encounters: never between rooms, chance meetings with people out in the same towns',()=>{
  const people=[{id:'p1',name:'Teszt Aladár',location_id:'l-gym',node_id:'fv-gym',level:2},{id:'p2',name:'Otthonülő',location_id:'l-feri',node_id:'bp-feri',level:0}];
  assert.equal(rollEncounter({byId,fromId:'bp-feri-n',toId:'bp-feri',people,rand:()=>0}),null,'rooms of one house');
  assert.equal(rollEncounter({byId,fromId:'bp-feri',toId:'fv-spar',people,rand:()=>0.99}),null,'no luck this time');
  const met=rollEncounter({byId,fromId:'bp-feri',toId:'fv-spar',people,rand:()=>0,slotIndex:1});
  assert.deepEqual([met.kind,met.character_id],['person','p1']);
  const night=rollEncounter({byId,fromId:'bp-feri',toId:'bp-utca',people:[],rand:()=>0,slotIndex:3});
  assert.equal(night.kind,'event');assert.match(night.text,/\S/);
});

test('Play: a parked car stays where it was left, driving moves it; items are put down and picked up',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-network-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>new Date('2026-11-10T13:00:00'),playRandom:()=>0.99});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const loc={};for(const name of ['Palor lakása','Feri háza','Nappali','Interspar','Edzőterem'])loc[name]=(await call('/api/locations',{name,kind:'tag'})).data.id;
  const tn=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,placed:true,archived:false,order:0});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[
    tn('bp','Budapest',null,null),tn('home','Palor lakása','bp',loc['Palor lakása']),tn('feri','Feri háza','bp',loc['Feri háza']),tn('feri-n','Feri háza - Nappali','feri',loc['Nappali']),
    tn('fv','Székesfehérvár',null,null),tn('fv-spar','Székesfehérvár - Interspar','fv',loc['Interspar']),tn('bp-spar','Budapest - Interspar','bp',null),tn('gym','Edzőterem','fv',loc['Edzőterem'])]}}]}));
  const went=await call('/api/play/travel',{node_id:'home'});assert.equal(went.status,200,JSON.stringify(went.data));
  const made=await call('/api/play/items',{name:'Palor Astrája',kind:'vehicle'});assert.equal(made.status,200,JSON.stringify(made.data));
  const car=made.data.items[0];
  assert.deepEqual([car.kind,car.here],['vehicle',true]);
  // Driving to Feri's living room parks the car at Feri's house (the site), not in the room.
  const trip=(await call('/api/play/travel',{node_id:'feri-n',vehicle_id:car.id})).data;
  assert.equal(trip.trip.vehicle,'Palor Astrája');assert.equal(trip.trip.encounter,null);
  let items=(await call('/api/play/items')).data.items;assert.deepEqual([items[0].node_id,items[0].here],['feri',true]);
  // Walking away leaves it there; from far away it cannot be driven.
  await call('/api/play/travel',{node_id:'gym'});
  items=(await call('/api/play/items')).data.items;assert.deepEqual([items[0].place,items[0].here],['Feri háza',false]);
  assert.equal((await call('/api/play/travel',{node_id:'home',vehicle_id:car.id})).status,409);
  // A bag put down at the gym stays there until it is picked up again.
  const bag=(await call('/api/play/items',{name:'Sporttáska'})).data.items.find(i=>i.kind==='item');
  assert.equal(bag.carried,true);await call('/api/play/items/'+bag.id,{action:'drop'});
  await call('/api/play/travel',{node_id:'home'});
  assert.equal((await call('/api/play/items/'+bag.id,{action:'take'})).status,409,'not here');
  await call('/api/play/travel',{node_id:'gym'});
  assert.equal((await call('/api/play/items/'+bag.id,{action:'take'})).data.items.find(i=>i.id===bag.id).carried,true);
  // Place view: kind, town and the other branch of the same chain.
  const spar=(await call('/api/play/place/fv-spar')).data;
  assert.equal(spar.node.place_kind,'shop');assert.deepEqual(spar.branches.map(b=>b.town),['Budapest']);
});
