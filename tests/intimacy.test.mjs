import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('intimacy protocol: owner switch + relationship stage gate pictures and intimate scenes',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-intimacy-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('foglalsz össze'))return {title:'Közel',summary:'Közel kerültek.',character_memory:'Jó volt.',palor_memory:'Jó volt.',level_delta:1,reason:'közelség'};
    return {reply:'*Mosolyog.*'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T19:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),a=await mk('Teszt Aladár');
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Esténként otthon.'),sexual_hand_use:entry('EXPLICIT-PREFERENCIA')},history:[],proposals:[]}));
  const home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data;
  await call('/api/world-engine/places',{character_id:a.id,location_id:home.id,role:'home'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n-home',name:'Aladár háza',parent_id:null,kind:'place',source_id:home.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-home'});
  const setLevel=l=>call('/api/world-engine/levels',{source_id:a.id,target_id:palor.id,level:l});

  // Adult from the start (owner decision 2026-11-10); the switch was removed (2026-11-22): turning it off does nothing.
  assert.equal((await call('/api/play/settings')).data.adult,true);
  await call('/api/play/settings',{adult:false});
  assert.equal((await call('/api/play/settings')).data.adult,true);

  // Strangers may flirt, acquaintances anything; phone stays non-intimate.
  // Open hostility (2026-11-15) opens it too, with an angry, rough tone and consent kept.
  await setLevel(-2);assert.equal((await call('/api/play/place/n-home')).data.people[0].stage,'intimate');
  {const c=(await call('/api/play/talk',{character_id:a.id,intimate:true,text:'*Közelebb lép.*'})).data;
    assert.equal(c.mode,'intimate');assert.match(requests.at(-1).system,/dühös, indulattal teli és durva/);assert.match(requests.at(-1).system,/beleegyező felnőtt/);
    await call(`/api/play/conversations/${c.id}/end`,{});
    app.db.prepare("DELETE FROM world_events WHERE json_extract(payload_json,'$.intimate')=1").run();}
  await setLevel(0);assert.equal((await call('/api/play/place/n-home')).data.people[0].stage,'flirt');
  assert.equal((await call('/api/play/talk',{character_id:a.id,intimate:true,text:'x'})).status,409);
  await setLevel(1);assert.equal((await call('/api/play/place/n-home')).data.people[0].stage,'intimate');
  assert.equal((await call('/api/play/talk',{character_id:a.id,channel:'phone',intimate:true,text:'x'})).status,409);

  // A flirt-stage talk keeps explicit fields out; an intimate scene routes them in, with consent rules.
  await setLevel(0);
  let conv=(await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).data;
  assert.ok(!requests.at(-1).user.includes('EXPLICIT-PREFERENCIA'));
  await setLevel(4);
  conv=(await call('/api/play/talk',{conversation_id:conv.id,intimate:true,text:'*Közelebb lép.*'})).data;
  assert.equal(conv.mode,'intimate');
  assert.ok(requests.at(-1).user.includes('EXPLICIT-PREFERENCIA'));
  assert.match(requests.at(-1).system,/beleegyező felnőtt/);assert.match(requests.at(-1).system,/nemet mondhatsz/);

  // Save point: intimate flag on the event, milestone when the level crosses into "szerető".
  const ended=(await call(`/api/play/conversations/${conv.id}/end`,{})).data;
  assert.equal(ended.summary.intimate,true);assert.match(ended.summary.milestone,/szerelmi kapcsolat/);
  assert.equal(app.db.prepare("SELECT count(*) n FROM world_events WHERE json_extract(payload_json,'$.intimate')=1").get().n,1);

  // The recent intimate moment keeps the stage open even if the level drops later.
  await setLevel(-1);assert.equal((await call('/api/play/place/n-home')).data.people[0].stage,'intimate');
  assert.ok((await call('/api/play/export')).data.markdown.includes('Közel kerültek.'));
  assert.equal((await call('/api/play/settings',{text_speed:'warp'})).status,400);
});
