// A friend's car as a ride, trip pictures and the once-per-trip roadside stop through the HTTP
// API (owner request, 2026-11-14). Synthetic characters and places only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {translateServerMessage} from '../app/public/i18n.js';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const story=id=>{const c=(a,b)=>[{key:'A',text:'Az első lehetőség.',to:a},{key:'B',text:'A második lehetőség.',to:b}];
  return {id,title:'Teszt '+id,setting:'road',transport:'car',content:'everyday',start:'s1',nodes:{
    s1:{text:'Egy idegen férfi integet az út szélén.',choices:c('s2','s3')},s2:{text:'Megállsz.',choices:c('s4','s5')},s3:{text:'Továbbmész.',choices:c('s4','s5')},
    s4:{text:'Beszélgettek.',choices:c('s6','s7')},s5:{text:'Hallgattok.',choices:c('s6','s7')},s6:{text:'Elbúcsúztok.',choices:c('e1','e2')},s7:{text:'Kezet fogtok.',choices:c('e1','e2')},
    e1:{text:'Jó volt.',ending:'good'},e2:{text:'Ennyi.',ending:'neutral'}}};};

test('rides and roadside stops: a friend\'s car between towns, validated; one stop per trip',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rides-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  let r=0.99;
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({reply:'Szia!'})),worldClock:()=>new Date('2026-11-13T10:00:00'),playRandom:()=>r});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(res=>app.server.listen(0,'127.0.0.1',res));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const x=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:x.status,data:await x.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const sanyi=(await call('/api/characters',{name:'Sanyi',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+sanyi.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Otthon van.')},history:[],proposals:[]}));
  const loc=async name=>(await call('/api/locations',{name,kind:'tag'})).data;
  const house=await loc('Sanyi háza'),car=await loc('Sanyi autója'),pub=await loc('Kocsma');
  await call('/api/world-engine/places',{character_id:sanyi.id,location_id:house.id,role:'home'});
  const n=(id,name,parent,src,order=0)=>({id,name,parent_id:parent,kind:'place',source_id:src,placed:true,archived:false,order});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[
    n('t-fv','Székesfehérvár',null,null,0),n('n-house','Sanyi háza','t-fv',house.id),n('n-car','Sanyi autója','n-house',car.id),
    n('t-bp','Budapest',null,null,1),n('n-pub','Kocsma','t-bp',pub.id)]}}]}));
  // A picture of the car place: shown on the trip in his car.
  await fs.writeFile(path.join(root,'auto.png'),PNG);await call('/api/scan',{});
  const pic=app.db.prepare("SELECT id FROM media WHERE relative_path='auto.png'").get().id;
  app.db.prepare('INSERT INTO media_tags(media_id,tag_id) VALUES(?,?)').run(pic,app.db.prepare('SELECT tag_id FROM locations WHERE id=?').get(car.id).tag_id);

  // At Sanyi's house: he is there; his car is no door.
  await call('/api/play/travel',{node_id:'n-house'});
  assert.ok((await call('/api/play/place/n-house')).data.people.some(p=>p.id===sanyi.id));
  assert.ok(!(await call('/api/play/room-exits/n-house')).data.neighbours.some(x=>x.id==='n-car'),'a car is not a room');
  const opts=(await call('/api/play/travel-options?to=n-pub')).data.options;
  const ride=opts.find(o=>o.ride_with);assert.equal(ride.ride_with.id,sanyi.id);assert.equal(ride.mode,'car');

  // Validation: only someone with a car who is here, only by car.
  const bad=await call('/api/play/travel',{node_id:'n-pub',mode:'car',ride_with:'nincs-ilyen'});
  assert.equal(bad.status,409);assert.notEqual(translateServerMessage(bad.data.error),bad.data.error,'translated');
  assert.equal((await call('/api/play/travel',{node_id:'n-pub',mode:'bike',ride_with:sanyi.id})).status,409);

  // In Sanyi's car to the Budapest pub: he drives and comes along; the car's picture on the way.
  const trip=(await call('/api/play/travel',{node_id:'n-pub',mode:'car',ride_with:sanyi.id})).data;
  assert.equal(trip.trip.ride_with.name,'Sanyi');assert.equal(trip.trip.mode,'car');
  assert.deepEqual(trip.trip.scenes,[{name:'Sanyi autója',image_id:pic}]);
  assert.equal(trip.trip.roadside,null);
  assert.ok(trip.people.some(p=>p.id===sanyi.id),'he came along');

  // Back by car with someone by the road: one stop per trip, with the trip's token only.
  r=0;
  const back=(await call('/api/play/travel',{node_id:'n-house',mode:'car'})).data.trip;
  assert.equal(back.story,null);assert.ok(back.roadside?.text&&back.roadside.token);
  await call('/api/play/stories/import',{text:JSON.stringify({stories:[story('utszeli')]})});
  assert.equal((await call('/api/play/roadside',{token:'masik'})).status,409);
  const stop=await call('/api/play/roadside',{token:back.roadside.token});
  assert.equal(stop.status,200);assert.equal(stop.data.story?.story.id,'utszeli');
  const again=await call('/api/play/roadside',{token:back.roadside.token});
  assert.equal(again.status,409);assert.notEqual(translateServerMessage(again.data.error),again.data.error);
});
