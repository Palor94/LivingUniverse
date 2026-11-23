// Integration regression: real talk/save-point routes, synthetic men and a mock provider.
// Checks the model's input, not whether a live model actually follows the instruction.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'synthetic test',visibility:'creator'});
const cases=[
  {name:'Teszt Aladár',values:{attachment:9,directness:9},promise:/elutasításként éled meg, fáj/,date:/elutasításként éled meg, fáj/,expression:/egyenesen kimondja/},
  {name:'Teszt Béla',values:{recognition:9,expressiveness:2},promise:/sértésként éled meg/,date:/sértésként éled meg/,expression:/inkább elhallgat vagy visszahúzódik/},
  {name:'Teszt Csaba',values:{security:9,emotional_stability:2},promise:/megingatja a bizalmadat/,date:/megingatja a bizalmadat/,expression:/hamar kibillen/},
  {name:'Teszt Dénes',values:{autonomy:9,attachment:4},promise:/nem is számítottál rá nagyon/,date:/kicsit megkönnyebbültél/},
  {name:'Teszt Ernő',values:{attachment:2},promise:/nem veszed különösebben a szívedre/,date:/nem veszed különösebben a szívedre/},
  {name:'Teszt Ferenc',values:{},promise:null,date:null},
];

test('missed promises and dates reach the next talk with each man’s own reaction, once',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-commitments-'));
  const root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  let now=new Date('2026-11-12T10:00:00'),summary;
  const requests=[];
  const provider=createMockProvider(req=>{
    requests.push(req);
    return /foglalsz össze/.test(req.system)?summary:{reply:'Szia, Palor!',beat:'talk',spark:0,choices:[]};
  });
  // This fixture injects logical game days; real-time break capping is tested separately.
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,clockBreakCap:false,worldClock:()=>now});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{
    const res=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await res.json();assert.ok(res.ok,JSON.stringify(data));return data;
  };
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const cafe=await call('/api/locations',{name:'Teszt kávézó',kind:'tag'});
  const node={id:'n-cafe',name:'Teszt kávézó',parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0};
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node]}}]}));
  await call('/api/play/travel',{node_id:'n-cafe'});
  const emptySummary=()=>({title:'Teszt beszélgetés',summary:'Beszélgettek.',level_delta:0,promises:[]});
  const talk=cid=>call('/api/play/talk',{character_id:cid,text:'Szia!'});
  const end=async conv=>{summary=emptySummary();await call(`/api/play/conversations/${conv.id}/end`,{});};
  const checkReading=(block,expected,expression)=>{
    if(expected){assert.match(block,expected);if(expression)assert.match(block,expression);}
    else assert.doesNotMatch(block,/Neked ez:/,'unknown traits must not invent an event reaction');
    for(const other of cases){
      if(other.promise&&String(other.promise)!==String(expected)&&String(other.date)!==String(expected)){
        assert.doesNotMatch(block,other.promise,'another profile’s interpretation must not leak');
      }
    }
  };
  for(const scenario of cases)await t.test(scenario.name,async()=>{
    now=new Date('2026-11-12T10:00:00');
    const c=await call('/api/characters',{name:scenario.name,gender:'férfi'});
    const values=Object.fromEntries(Object.entries({goals:'Dolgozni.',...scenario.values}).map(([key,value])=>[key,entry(value)]));
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values,history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:c.id,location_id:cafe.id,role:'home'});
    // Create the promise through the real save point, not by inserting a thread.
    let conv=await talk(c.id);
    summary={...emptySummary(),promises:[{by:'palor',text:'Holnap felhívlak.',due:'2026-11-13'}]};
    await call(`/api/play/conversations/${conv.id}/end`,{});
    conv=await talk(c.id);
    assert.match(requests.at(-1).user,/Palor ígérte: Holnap felhívlak/);
    assert.doesNotMatch(requests.at(-1).user,/ELMARADT:/);
    await end(conv);
    now=new Date('2026-11-15T10:00:00');
    conv=await talk(c.id);
    const promisePrompt=requests.at(-1).user;
    const promiseBlock=promisePrompt.match(/TERVEK ÉS ÍGÉRETEK KÖZTETEK:\n[^]*?(?=\n\n|$)/)?.[0];
    assert.ok(promiseBlock,'promise context must reach the actual provider request');
    assert.match(promiseBlock,/ELMARADT: Palor nem tartotta meg: Holnap felhívlak/);
    checkReading(promiseBlock,scenario.promise,scenario.expression);
    assert.match(promisePrompt,/A SAJÁT CÉLOD EBBEN A BESZÉLGETÉSBEN: szóvá tenni, hogy Palor nem tartotta meg/);
    const thread=app.db.prepare('SELECT status,noted_at FROM world_threads WHERE character_id=?').get(c.id);
    assert.equal(thread.status,'lapsed');assert.ok(thread.noted_at);
    await call('/api/play/talk',{conversation_id:conv.id,text:'Bocsánat.'});
    assert.doesNotMatch(requests.at(-1).user,/ELMARADT:|A SAJÁT CÉLOD EBBEN A BESZÉLGETÉSBEN: szóvá tenni/);
    await end(conv);
    // Seed a known accepted date that Palor did not attend.
    const ap='missed-'+c.id;
    app.db.prepare("INSERT INTO play_appointments VALUES(?, ?, ?, '2026-11-14','reggel','accepted','2026-11-13T10:00:00Z')").run(ap,c.id,cafe.id);
    app.db.prepare('INSERT INTO play_dates(appointment_id,created_at) VALUES(?,?)').run(ap,'2026-11-13T10:00:00Z');
    conv=await talk(c.id);
    const dateBlock=requests.at(-1).user.split('\n').find(line=>line.startsWith('ELMARADT RANDEVÚ:'));
    assert.ok(dateBlock,'missed date must reach the actual provider request');
    assert.match(dateBlock,/Palor nem jött el.*2026-11-14.*Teszt kávézó/);
    checkReading(dateBlock,scenario.date,scenario.expression);
    assert.ok(app.db.prepare('SELECT missed_noted_at FROM play_dates WHERE appointment_id=?').get(ap).missed_noted_at);
    await call('/api/play/talk',{conversation_id:conv.id,text:'Bocsánat a tegnapért.'});
    assert.doesNotMatch(requests.at(-1).user,/ELMARADT RANDEVÚ:/);
    await end(conv);
  });
});
