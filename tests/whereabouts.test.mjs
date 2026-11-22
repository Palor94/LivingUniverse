// S1 (2026-11-21): who is where in a whole synthetic week, and why; gaps for the owner. No AI call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('a week of positions follows appointment > event > schedule > place, with reasons; gaps are listed',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-where-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  let now=new Date('2026-11-16T10:00:00');const requests=[];
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(r=>{requests.push(r);return {reply:'Szia!'};}),worldClock:()=>now});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const loc=async name=>(await call('/api/locations',{name,kind:'tag'})).data.id;
  const H1=await loc('Aladár háza'),W=await loc('Gyár'),H2=await loc('Béla háza'),PUB=await loc('Kocsma'),H3=await loc('Csaba háza');
  const person=async(name)=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Élni.')},history:[],proposals:[]}));return c;};
  const a=await person('Teszt Aladár'),b=await person('Teszt Béla'),c=await person('Teszt Csaba'),d=await person('Teszt Dénes');
  const place=(cid,l,role)=>call('/api/world-engine/places',{character_id:cid,location_id:l,role});
  await place(a.id,H1,'home');await place(a.id,W,'work');await place(b.id,H2,'home');await place(c.id,H3,'home');
  // Béla: Saturday evening at the pub by his weekly schedule; and one schedule entry points nowhere.
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('world:schedule:'+b.id,JSON.stringify({entries:[{days:[6],slot:'este',location_id:PUB},{days:[0],slot:'reggel',location_id:randomUUID()}]}));
  // Csaba: an accepted meeting with Palor on Wednesday afternoon at the pub.
  app.db.prepare("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,'accepted',?)").run(randomUUID(),c.id,PUB,'2026-11-18','delutan',new Date().toISOString());
  // Aladár: a world event on Thursday morning puts him at the pub instead of work.
  app.db.prepare("INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(randomUUID(),'2026-11-19','everyday','applied','Reggeli sör','Aladár munka előtt beugrott.',JSON.stringify({slot:'reggel',character_ids:[a.id],location_id:PUB,memories:[],level_changes:[]}),'mock',new Date().toISOString());
  const names={[H1]:'H1',[W]:'W',[H2]:'H2',[PUB]:'PUB',[H3]:'H3'};
  const week={};
  for(let i=0;i<7;i++){now=new Date(Date.UTC(2026,10,16+i,9,0,0));
    const r=(await call('/api/play/whereabouts')).data;
    week[r.day]=Object.fromEntries([a,b,c,d].map(p=>[p.name.split(' ')[1],r.slots.map(s=>{const x=s.people.find(y=>y.id===p.id);return (names[x.location_id]||'-')+':'+(x.reason||'-');}).join(' ')]));
    if(i===0){assert.deepEqual(r.gaps.map(g=>g.name+'/'+g.kind).sort(),['Teszt Béla/schedule_missing_place','Teszt Dénes/no_places']);}
  }
  const workday='W:work W:work H1:home H1:home',weekend='H1:home H1:home H1:home H1:home';
  assert.equal(week['2026-11-16'].Aladár,workday,'Monday');
  assert.equal(week['2026-11-19'].Aladár,'PUB:event W:work H1:home H1:home','Thursday: the event wins over work');
  assert.equal(week['2026-11-21'].Aladár,weekend,'Saturday');
  assert.equal(week['2026-11-21'].Béla,'H2:home H2:home PUB:schedule H2:home','Saturday evening: schedule');
  assert.equal(week['2026-11-20'].Béla,'H2:home H2:home H2:home H2:home');
  assert.equal(week['2026-11-18'].Csaba,'H3:home PUB:appointment H3:home H3:home','Wednesday: the meeting with Palor wins');
  for(const day of Object.keys(week))assert.equal(week[day].Dénes,'-:- -:- -:- -:-','no places: nowhere, never guessed');
  // The same week computed again gives the same table (deterministic).
  now=new Date(Date.UTC(2026,10,19,9,0,0));const again=(await call('/api/play/whereabouts')).data;
  assert.equal(again.slots.map(s=>{const x=s.people.find(y=>y.id===a.id);return (names[x.location_id]||'-')+':'+(x.reason||'-');}).join(' '),week['2026-11-19'].Aladár);
});
