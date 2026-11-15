import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider,priceOf} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('world engine runs a capped, validated day and keeps serious events for the owner',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-world-engine-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];let ids={};let clock=new Date('2026-11-09T10:00:00');
  // Synthetic AI: agents want to meet; the game master returns one valid everyday
  // event, one serious event, one event with an invented character and one "death".
  const provider=createMockProvider(req=>{
    requests.push(req);
    if(req.system.includes('játékmester'))return {events:[
      {kind:'meeting',title:'Edzés együtt',summary:'Aladár és Béla együtt edzettek.',character_ids:[ids.a,ids.b],location_id:ids.gym,memories:[{character_id:ids.a,text:'Béla jó edzőtárs.'},{character_id:'00000000-0000-4000-8000-000000000000',text:'kitalált'}],level_changes:[{source_id:ids.a,target_id:ids.b,delta:5,reason:'jó hangulat'}],new_acquaintances:[[ids.a,ids.b]]},
      {kind:'meeting',title:'Ismeretlenek',summary:'Aladár és Csaba régi barátként beszélgettek.',character_ids:[ids.a,ids.c]},
      {kind:'serious',title:'Veszekedés',summary:'Nagyot vesztek össze.',character_ids:[ids.a,ids.b],memories:[{character_id:ids.b,text:'Összevesztünk.'}],level_changes:[{source_id:ids.b,target_id:ids.a,delta:-2,reason:'veszekedés'}]},
      {kind:'everyday',title:'Kitalált',summary:'Egy új ember jött.',character_ids:['00000000-0000-4000-8000-000000000000']},
      {kind:'everyday',title:'Baleset',summary:'Béla majdnem meghalt.',character_ids:[ids.b]}]};
    if(req.system.includes('kezdő közelségi'))return {levels:[{i:0,level:2}]};
    return {intention:'Edzeni megyek.',location_id:ids.gym,wants_to_meet:[ids.b,ids.a,'nem-letezo'],message_to_palor:'Szia Palor!'};
  });
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>clock});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,method)=>{const r=await fetch(origin+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Aladár'),b=await mk('Teszt Béla'),passive=await mk('Teszt Csaba');
    const gym=(await call('/api/locations',{name:'Edzőterem',kind:'tag'})).data,home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data;
    ids={a:a.id,b:b.id,c:passive.id,gym:gym.id};
    for(const [c,routine] of [[a,'Hétfőn edzés a teremben.'],[b,'Munka után edzés.']])
      app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Erősebb lenni.'),weekly_routine:entry(routine),anatomy:entry('TITKOS-EXPLICIT')},history:[],proposals:[]}));
    app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('11111111-1111-4111-8111-111111111111',a.id,palor.id,'Egyszer találkozott Palorral.');

    // Off by default: no run, no calls.
    let s=(await call('/api/world-engine')).data;
    assert.equal(s.settings.enabled,false);assert.deepEqual(s.characters.map(c=>c.name).sort(),['Teszt Aladár','Teszt Béla']);
    assert.equal((await call('/api/world-engine/run',{})).status,409);assert.equal(requests.length,0);

    // Free place suggestions: own-name home + keyword gym. Passive characters get none.
    await call('/api/world-engine/places/suggest',{});
    s=(await call('/api/world-engine')).data;
    const placesA=s.characters.find(c=>c.id===a.id).places.map(p=>p.location_name+':'+p.role).sort();
    assert.deepEqual(placesA,['Aladár háza:home','Edzőterem:routine']);
    assert.ok(!s.characters.some(c=>c.id===passive.id));

    // Lively tempo: every character acts in this round (tiers are covered in world-tiers.test).
    await call('/api/world-engine/settings',{enabled:true,tempo:'lively'});
    const ran=(await call('/api/world-engine/run',{})).data;
    assert.equal(ran.stopped,null);assert.equal(ran.days.length,1);
    // Prompts carry the season and what the character already did today.
    assert.ok(requests[0].user.includes('évszak: ősz')&&requests[0].user.includes('MA MÁR CSINÁLTAD'));
    // Agent prompts never contain explicit profile fields.
    assert.ok(requests.every(r=>!r.user.includes('TITKOS-EXPLICIT')));
    assert.equal(requests.length,3);

    s=(await call('/api/world-engine')).data;
    // Invented character dropped; the serious event waits; a second serious one
    // (the "death") is dropped because only one serious proposal is kept per day.
    assert.deepEqual(s.unseen.map(e=>e.title),['Edzés együtt']);
    assert.deepEqual(s.proposed.map(e=>e.title),['Veszekedés']);
    // First day: the game master is told to introduce everyday life, not a turning point.
    // (The pacing hint sits at the end of the user message since 2026-11-12, so the system message can be cached.)
    assert.ok(requests.find(r=>r.system.includes('játékmester')).user.includes('Első nap'));
    // Strangers shown as old friends were dropped. The declared first meeting made both
    // sides acquaintances (1); the +5 was clamped to +1 for an everyday event.
    const level=(x,y)=>app.db.prepare('SELECT level FROM world_relationship_levels WHERE source_id=? AND target_id=?').get(x,y)?.level;
    assert.equal(level(a.id,b.id),2);assert.equal(level(b.id,a.id),1);
    assert.equal(s.unseen[0].slot,'reggel');
    const memories=app.db.prepare("SELECT character_id,text FROM character_memories WHERE reason LIKE 'Világmotor%'").all();
    assert.deepEqual(memories.map(m=>m.text),['Béla jó edzőtárs.']);
    // Only the character who knows Palor may message him, and at most once a day.
    assert.deepEqual(s.messages.map(m=>m.from),['Teszt Aladár']);
    await app.worldEngine.simulateDay('2026-11-09',{id:'delutan',label:'délután'});
    assert.equal(app.db.prepare("SELECT count(*) n FROM world_messages WHERE world_day='2026-11-09'").get().n,1);
    app.db.prepare("DELETE FROM world_events WHERE json_extract(payload_json,'$.slot')='delutan'").run();

    // Accept applies the serious event's effects; refuse applies nothing.
    const fight=s.proposed.find(e=>e.title==='Veszekedés');
    assert.equal((await call('/api/world-engine/events/'+fight.id,{accept:true})).data.status,'accepted');
    assert.equal(level(b.id,a.id),-1);

    // Same day again does nothing automatically; two days later catches up both days.
    assert.equal(await app.worldEngine.maybeRun(),null);
    clock=new Date('2026-11-11T10:00:00');
    const catchUp=(await call('/api/world-engine/run',{})).data;
    // The missed day runs as one compressed round, then today's due morning.
    assert.deepEqual(catchUp.days.map(d=>d.day+':'+d.slot),['2026-11-10:nap','2026-11-11:reggel']);
    // Refusing applies nothing and cannot be reversed into an accept.
    const later=(await call('/api/world-engine')).data.proposed[0],levelBefore=level(b.id,a.id);
    assert.equal((await call('/api/world-engine/events/'+later.id,{accept:false})).data.status,'refused');
    assert.equal(level(b.id,a.id),levelBefore);
    assert.equal((await call('/api/world-engine/events/'+later.id,{accept:true})).status,409);
    // A refused proposal never happened: it is not listed under "Amíg távol voltál"; an accepted one is.
    const away=(await call('/api/world-engine')).data.unseen.map(e=>e.id);
    assert.ok(!away.includes(later.id),'refused event is not shown as having happened');
    assert.ok(away.includes(fight.id),'accepted event is shown');

    // Run log, tempo validation, and repeats of yesterday's events are filtered out.
    const runs=app.db.prepare('SELECT world_day,events,dropped FROM world_runs ORDER BY created_at').all();
    assert.ok(runs.length>=3);assert.ok(runs.some(r=>r.dropped>0),'yesterday\'s "Edzés együtt" is not repeated');
    assert.equal((await call('/api/world-engine/settings',{tempo:'wild'})).status,400);
    assert.equal((await call('/api/world-engine/settings',{tempo:'calm'})).data.tempo,'calm');
    // Cost cap stops the run before any call is sent.
    await call('/api/world-engine/settings',{daily_cap_usd:0});
    const before=requests.length;
    const capped=(await call('/api/world-engine/run',{extra:true})).data;
    assert.equal(capped.stopped.code,'CAP_REACHED');assert.equal(requests.length,before);

    // Starting levels: only empty pairs, and the owner can override by hand.
    await call('/api/world-engine/settings',{daily_cap_usd:1.5});
    const proposed=(await call('/api/world-engine/levels/propose',{})).data;
    assert.equal(proposed.set,1);assert.equal(level(a.id,palor.id),2);
    await call('/api/world-engine/levels',{source_id:a.id,target_id:palor.id,level:4});assert.equal(level(a.id,palor.id),4);
    const revisions=app.db.prepare('SELECT actor FROM world_level_revisions WHERE source_id=? AND target_id=? ORDER BY rowid').all(a.id,palor.id).map(r=>r.actor);
    assert.deepEqual(revisions,['world_engine_initial','creator']);

    await call('/api/world-engine/seen',{});
    s=(await call('/api/world-engine')).data;assert.equal(s.unseen.length,0);assert.equal(s.messages.length,0);
  }finally{await app.close();}
});

test('pricing counts cached input at the cached rate',()=>{
  assert.equal(priceOf({input:1_000_000,cached:0,output:0}),0.2);
  assert.equal(priceOf({input:1_000_000,cached:1_000_000,output:1_000_000}),0.55);
});
