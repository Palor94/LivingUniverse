import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('rewind undoes later events, memories, levels and messages, and can itself be undone',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rewind-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  let ids={},clock=new Date('2026-11-10T09:00:00');
  const provider=createMockProvider(req=>{
    if(req.system.includes('foglalsz össze'))return {title:'Kávé',summary:'Beszélgettek.',character_memory:'Palor kedves.',palor_memory:'Aladár fáradt.',level_delta:1,reason:'jó'};
    if(req.system.includes('játékmester'))return {events:[{kind:'meeting',title:'Edzés',summary:'Együtt edzettek.',character_ids:[ids.a,ids.b],location_id:null,memories:[{character_id:ids.a,text:'Edzettünk.'}],level_changes:[{source_id:ids.a,target_id:ids.b,delta:1,reason:'jó'}],new_acquaintances:[[ids.a,ids.b]]}]};
    if(req.system.includes('Palorral beszélsz'))return {reply:'Szia!'};
    return {intention:'Edzés.',location_id:null,wants_to_meet:[],message_to_palor:'Szia Palor!'};
  });
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>clock});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const palor=await mk('Palor'),a=await mk('Teszt Aladár'),b=await mk('Teszt Béla');ids={a:a.id,b:b.id};
  for(const c of [a,b])app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Rutin.')},history:[],proposals:[]}));
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('44444444-4444-4444-8444-444444444444',a.id,palor.id,'Kollégák.');
  const level=(x,y)=>app.db.prepare('SELECT level FROM world_relationship_levels WHERE source_id=? AND target_id=?').get(x,y)?.level;
  const liveMemories=id=>app.db.prepare("SELECT text FROM character_memories WHERE character_id=? AND status='approved'").all(id).map(r=>r.text);

  // Save point A: a phone talk with Aladár (level towards Palor becomes 1).
  let conv=(await call('/api/play/talk',{character_id:a.id,channel:'phone',text:'Szia!'})).data;
  await call(`/api/play/conversations/${conv.id}/end`,{});
  assert.equal(level(a.id,palor.id),1);
  // Later: a world round (meeting, memory, levels, a message to Palor).
  clock=new Date('2026-11-10T13:00:00');
  await call('/api/world-engine/settings',{enabled:true});
  await call('/api/world-engine/run',{});
  assert.equal(level(a.id,b.id),2);assert.ok(liveMemories(a.id).includes('Edzettünk.'));
  assert.ok((await call('/api/play/messages')).data.messages.length>0);
  // A meeting agreed after the save point is cancelled by the rewind and restored by undo.
  const fl=(await call('/api/locations',{name:'Rewind kávézó',kind:'tag'})).data;
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n-cafe',name:'Rewind kávézó',parent_id:null,kind:'place',source_id:fl.id,placed:true,archived:false,order:0}]}}]}));
  assert.equal((await call('/api/play/invite',{character_id:a.id,node_id:'n-cafe',slot_index:3})).data.status,'accepted');
  // A second talk raises the level again (next day: at most one step closer per day, 2026-11-11).
  clock=new Date('2026-11-11T09:00:00');
  conv=(await call('/api/play/talk',{character_id:a.id,channel:'phone',text:'Még egyszer szia!'})).data;
  await call(`/api/play/conversations/${conv.id}/end`,{});
  assert.equal(level(a.id,palor.id),2);

  const {points}=(await call('/api/play/save-points')).data;
  const first=points.find(p=>p.kind==='conversation'&&p===points.filter(x=>x.kind==='conversation').at(-1));
  assert.ok(first,'the first conversation is a save point');
  const rewound=(await call('/api/play/rewind',{time:first.time,label:first.label})).data;
  assert.ok(rewound.events>=2&&rewound.memories>=2&&rewound.levels>=2);
  assert.equal(level(a.id,palor.id),1,'level back to the save point');
  assert.equal(level(a.id,b.id),undefined,'acquaintance made later is gone');
  assert.deepEqual(liveMemories(a.id),['Palor kedves.'],'later memories are rewound, not deleted');
  assert.ok(app.db.prepare("SELECT count(*) n FROM character_memories WHERE status='rewound'").get().n>=2);
  assert.equal((await call('/api/play/messages')).data.messages.length,0);
  assert.ok((await call('/api/play/journal')).data.events.every(e=>e.title!=='Edzés'));
  assert.equal(app.db.prepare('SELECT status FROM play_appointments').get().status,'rewound');
  // The world clock stepped back, so the afternoon runs again when due.
  assert.equal(app.worldEngine.settings().last_day,null);

  // Undo brings everything back.
  assert.equal((await call('/api/play/rewind/undo',{})).data.undone,true);
  assert.equal(level(a.id,palor.id),2);assert.equal(level(a.id,b.id),2);
  assert.ok(liveMemories(a.id).includes('Edzettünk.'));
  assert.equal(app.db.prepare('SELECT status FROM play_appointments').get().status,'accepted');
  assert.equal((await call('/api/play/rewind/undo',{})).status,404);

  // After a rewind, new activity blocks undo (the timeline moved on).
  await call('/api/play/rewind',{time:first.time});
  conv=(await call('/api/play/talk',{character_id:a.id,channel:'phone',text:'Új szál.'})).data;
  assert.equal((await call('/api/play/rewind/undo',{})).status,409);
});
