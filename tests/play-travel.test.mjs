import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {preferredTravel,rememberedTravel,travelPayload} from '../app/public/play-travel.js';
import {crowdLayout,townLabelLayout,overlaps} from '../app/public/play-map-layout.js';

test('A7/B6 remembers the exact mode/car/ride, asking for unavailable modes and new train/ride choices',()=>{
  const bike={mode:'bike',minutes:90},car={mode:'car',minutes:30,vehicle:{id:'own-car'}},train={mode:'train',minutes:40,line:'test-line'},ride={mode:'car',ride_with:{id:'friend'}};
  const remembered=rememberedTravel(car,[bike,car]);assert.equal(preferredTravel([bike,car],remembered),car);
  assert.equal(preferredTravel([bike,{mode:'car'}],remembered),null);assert.equal(preferredTravel([bike,car,train],remembered),null);assert.equal(preferredTravel([bike,car,ride],remembered),null);
  assert.equal(preferredTravel([bike,car,{...train,unavailable:'night'}],remembered),car);
  const withTrain=rememberedTravel(car,[bike,car,train]);assert.equal(preferredTravel([bike,car,train],withTrain),car);
  assert.equal(preferredTravel([bike,car],remembered,{alwaysAsk:true}),null);assert.equal(preferredTravel([bike,car],remembered,{force:true}),null);
  assert.deepEqual(travelPayload(car),{mode:'car',vehicle_id:'own-car'});assert.deepEqual(travelPayload(ride),{mode:'car',ride_with:'friend'});
});
test('B6 changing or cancelling the preflight happens before the only travel write; no automatic metadata is sent',async()=>{
  const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('  let travelling=false;'),source.indexOf('  // The road moment'));
  for(const decision of [null,'change','go']){
    let finish;const writes=[],choices=[];
    const ctx={townNote:null,talkCharacter:null,data:{},document:{body:{classList:{add(){},remove(){}},appendChild(){}},createElement:()=>({setAttribute(){},remove(){}})},t:key=>key,label:n=>n.name,node:id=>({id,name:'Teszt'}),esc:s=>s,
      chooseTravel:async(id,options)=>{choices.push(options);return options?.force?{mode:'bike',automatic:false}:{mode:'car',automatic:true};},tripChoiceNotice:()=>new Promise(resolve=>finish=resolve),
      setTimeout:()=>1,clearTimeout(){},carHere:()=>null,mergeState:()=>false,afterTrip:async()=>false,api:async(route,body)=>{writes.push({route,body});return {node:{id:'destination'},people:[]};}};
    vm.createContext(ctx);vm.runInContext(fn+';this.travel=travelTo;',ctx);const run=ctx.travel('destination');await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,0);
    assert.equal(await ctx.travel('second-destination'),null,'another click cannot start a parallel trip');finish(decision);await run;
    assert.equal(writes.length,decision===null?0:1);if(writes.length){assert.equal(writes[0].route,'/api/play/travel');assert.equal(writes[0].body.mode,decision==='change'?'bike':'car');assert.ok(!('automatic' in writes[0].body));}
    assert.equal(choices.length,decision==='change'?2:1);
  }
});
test('V11/V12 display layout avoids label/crowd collisions without changing saved pin coordinates',()=>{
  const labels=[{id:'a',x:100,y:150,width:150,height:34,count:20},{id:'b',x:200,y:100,width:180,height:34,count:4}];
  const crowds=crowdLayout(labels);for(const crowd of crowds.values())for(const label of labels)assert.equal(overlaps(crowd,label,6),false);
  assert.equal(crowds.get('a').width,100,'at most three faces plus the remainder badge');
  const pins=['a','b','c'].map(id=>({id,name:'Teszt ház '+id})),positions=new Map(pins.map(p=>[p.id,[500,300]])),before=JSON.stringify([...positions]);
  const placed=[...townLabelLayout(pins,positions).values()];for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert.equal(overlaps(placed[i],placed[j]),false);
  assert.equal(JSON.stringify([...positions]),before);
});
test('town labels stay touching their own pin in a tight cluster (Káloz houses, 2026-11-20)',()=>{
  // Three houses as close as on the Káloz map, each with someone inside (avatar badge).
  const pins=[['szomszed','Szomszéd ház',[128,48]],['gyuszi','Gyuszi háza',[125,80]],['csaladi','Családi ház',[210,45]]].map(([id,name])=>({id,name,count:1}));
  const positions=new Map([['szomszed',[328,248]],['gyuszi',[325,280]],['csaladi',[410,245]]]),labels=townLabelLayout(pins,positions);
  for(const p of pins){const [x,y]=positions.get(p.id),l=labels.get(p.id),cx=Math.min(Math.max(x,l.x),l.x+l.width),cy=Math.min(Math.max(y,l.y),l.y+l.height);
    assert.ok(Math.hypot(cx-x,cy-y)<=70,`${p.name} label is ${Math.round(Math.hypot(cx-x,cy-y))} units from its pin`);}
});
