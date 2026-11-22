// S2 (2026-11-22): weekly schedule grid, owner-approved proposal from his own routine text, one step back.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('schedules: grid save drives where he is; proposal only from his text and known places; accept, undo; Palor has none',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sch-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const asked=[];
  const provider=createMockProvider(req=>{if(req.system.includes('heti napirendjét javasolod')){asked.push(req);
      return {cells:[{day:2,slot:'este',place:'Edzőterem',why:'kedd esténként edz'},{day:3,slot:'este',place:'Kitalált Bár',why:'x'},{day:9,slot:'este',place:'Edzőterem'}]};}
    return {};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-17T19:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const pal=(await call('/api/characters',{name:'Palor',gender:'férfi'})).data;
  const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Élni.'),weekly_routine:entry('Kedd esténként edzeni jár.')},history:[],proposals:[]}));
  const home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data.id,gym=(await call('/api/locations',{name:'Edzőterem',kind:'tag'})).data.id,pub=(await call('/api/locations',{name:'Kocsma',kind:'tag'})).data.id;
  await call('/api/world-engine/places',{character_id:a.id,location_id:home,role:'home'});await call('/api/world-engine/places',{character_id:a.id,location_id:gym,role:'other'});
  assert.equal((await call('/api/play/schedules/'+pal.id)).status,400);
  let g=(await call('/api/play/schedules/'+a.id)).data;
  assert.equal(g.routine,'Kedd esténként edzeni jár.');assert.deepEqual(g.places.map(p=>p.name),['Aladár háza','Edzőterem']);assert.deepEqual(g.grid,{});const cell=(l,x={})=>({location_id:l,activity:'',privacy:'public',...x});
  assert.equal((await call('/api/play/schedules/'+a.id,{grid:{'8|este':gym}})).status,400);
  // 2026-11-17 is a Tuesday (2): the evening at the pub, from the grid.
  g=(await call('/api/play/schedules/'+a.id,{grid:{'2|este':pub,'4|este':pub}})).data;assert.deepEqual(g.grid,{'2|este':cell(pub),'4|este':cell(pub)});
  assert.deepEqual(JSON.parse(app.db.prepare('SELECT value FROM application_settings WHERE key=?').get('world:schedule:'+a.id).value).entries.map(e=>[e.days,e.slot]),[[[2,4],'este']]);
  let ev=(await call('/api/play/whereabouts')).data.slots[2].people.find(p=>p.id===a.id);assert.deepEqual([ev.location_id,ev.reason],[pub,'schedule']);
  // Proposal: only the known place survives, the invented one and the bad day are dropped; not applied yet.
  g=(await call('/api/play/schedules/'+a.id+'/propose',{})).data;
  assert.match(asked[0].user,/HETI RUTIN:\nKedd esténként edzeni jár\./);assert.match(asked[0].user,/ISMERT HELYEI: Aladár háza, Edzőterem/);
  assert.deepEqual(g.proposal.grid,{'2|este':cell(gym)});assert.deepEqual(g.grid,{'2|este':cell(pub),'4|este':cell(pub)});
  g=(await call('/api/play/schedules/'+a.id+'/proposal/accept',{})).data;assert.deepEqual(g.grid,{'2|este':cell(gym)});assert.equal(g.proposal,null);
  ev=(await call('/api/play/whereabouts')).data.slots[2].people.find(p=>p.id===a.id);assert.equal(ev.location_id,gym);
  g=(await call('/api/play/schedules/'+a.id+'/undo',{})).data;assert.deepEqual(g.grid,{'2|este':cell(pub),'4|este':cell(pub)});
  assert.equal((await call('/api/play/schedules/'+a.id+'/proposal/reject',{})).status,409);
  // A proposal written outside the app: unknown places and bad cells are dropped, the rest waits for the owner.
  g=(await call('/api/play/schedules/'+a.id+'/proposal',{grid:{'5|este':{location_id:gym,activity:'edz, aztán a szaunában marad',privacy:'secret'},'5|reggel':{location_id:(await call('/api/locations',{name:'Idegen hely',kind:'tag'})).data.id},'9|este':{location_id:gym}},why:{'5|este':'heti rutin'},source:'teszt'})).data;
  assert.deepEqual(g.proposal.grid,{'5|este':cell(gym,{activity:'edz, aztán a szaunában marad',privacy:'secret'})});assert.equal(g.proposal.source,'teszt');
  assert.equal((await call('/api/play/schedules/import',{file:'../secret.json'})).status,400,'only the routine import folder');
});
