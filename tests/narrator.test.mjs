// "*Rendszer! …*" (2026-11-15): an order to the game itself is answered by the narrator from the
// recorded data, not by the character; the rest of the line still goes to the character.
// Synthetic characters and places only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('narrator: answers *Rendszer!* orders from the data, explicit details in person, never on the phone',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-narrator-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldClock:()=>new Date('2026-11-10T19:00:00'),
    worldProvider:createMockProvider(req=>{requests.push(req);return req.system.includes('Rendszere')?{answer:'Narrátori válasz.'}:{reply:'Szia.'};})});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const palor=(await call('/api/characters',{name:'Palor',gender:'férfi'})).data;
  const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Esténként otthon.'),anatomy:entry('ANATÓMIA-ADAT')},history:[],proposals:[]}));
  const home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data;
  await call('/api/world-engine/places',{character_id:a.id,location_id:home.id,role:'home'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n-home',name:'Aladár háza',parent_id:null,kind:'place',source_id:home.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-home'});
  const setLevel=l=>call('/api/world-engine/levels',{source_id:a.id,target_id:palor.id,level:l});

  // Flirt stage in person (owner 2026-11-18: the narrator follows the scene that is running, the
  // relationship level alone does not close it): the narrator answers, explicit fields included.
  await setLevel(0);
  let r=(await call('/api/play/talk',{character_id:a.id,text:'*Rendszer! adj leírást róla*'})).data;
  assert.equal(r.narration_only,true);assert.equal(r.narration.answer,'Narrátori válasz.');assert.equal(r.narration.question,'adj leírást róla');
  assert.equal(requests.length,1,'only the narrator was asked');
  assert.ok(requests[0].system.includes('Rendszere'));assert.ok(requests[0].user.includes('ANATÓMIA-ADAT'));
  assert.equal(app.db.prepare('SELECT count(*) n FROM play_conversations').get().n,0,'no conversation started');
  // On the phone explicit fields stay out.
  await call('/api/play/talk',{character_id:a.id,channel:'phone',text:'*Rendszer! adj leírást róla*'});
  assert.ok(!requests.at(-1).user.includes('ANATÓMIA-ADAT'));

  // Intimate stage: explicit details are part of the data.
  await setLevel(2);
  await call('/api/play/talk',{character_id:a.id,text:'*Rendszer! adj leírást róla*'});
  assert.ok(requests.at(-1).user.includes('ANATÓMIA-ADAT'));

  // An order with a spoken line: narrator first, then the character gets the line without the order.
  r=(await call('/api/play/talk',{character_id:a.id,text:'Szia! *Rendszer: milyen a szobája?*'})).data;
  assert.equal(r.narration.answer,'Narrátori válasz.');assert.ok(!r.narration_only);
  assert.equal(r.lines.at(-1).text,'Szia.');
  assert.ok(r.lines.some(l=>l.speaker==='palor'&&l.text==='Szia!'),'the order is not part of the talk');
  assert.ok(!requests.at(-1).user.includes('Rendszer'));

  // An ordinary *action* stays an action for the character.
  r=(await call('/api/play/talk',{conversation_id:r.id,text:'*leül*'})).data;
  assert.equal(r.narration,undefined);
});
