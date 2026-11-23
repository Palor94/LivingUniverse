import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../../app/server.mjs';
import {createMockProvider} from '../../app/world-ai.mjs';

export const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'synthetic regression',visibility:'creator'});
export async function livingWorld(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-narrative-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];let now=new Date('2026-11-12T10:00:00');
  const control={summary:{title:'Teszt',summary:'Beszélgettek.',character_memory:'Palorral beszélgettem.',level_delta:0},reply:{reply:'Értem.',beat:'talk',spark:0,choices:['Kérdezek a helyzetről.','Más megoldást ajánlok.','Időt kérek.']}};
  const provider=createMockProvider(req=>{
    requests.push(req);
    if(req.system.includes('játék Rendszere'))return control.narrator||{answer:'Narrátori megfigyelés.'};
    if(req.system.includes('jelenetvezetője')){if(control.narrative instanceof Error)throw control.narrative;return control.narrative;}
    if(req.system.includes('játékmester'))return {events:control.worldEvents||[]};
    if(req.system.includes('szimulációjában'))return {intention:'Beszélget.',location_id:control.locationId||null,wants_to_meet:[],message_to_palor:null};
    if(req.system.includes('társas jelenetet foglalsz'))return {...control.summary,memories:{'Teszt Aladár':'Palorral beszélgettem.','Teszt Béla':'Palorral beszélgettem.','Teszt Csaba':'Palorral beszélgettem.'}};
    if(req.system.includes('foglalsz össze'))return control.summary;
    if(req.system.includes('társas jelenetét'))return {replies:['Teszt Aladár','Teszt Béla','Teszt Csaba'].map(name=>({name,text:control.reply.reply})),choices:control.reply.choices};
    return {...control.reply,...(req.system.includes('"memo"')?{memo:'A napi teendőkről beszéltek, a tervet még egyeztetik.'}:{})};
  });
  const opts={root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>now};
  const app=await createApp(opts);t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,route+': '+JSON.stringify(data));return data;};
  const mk=async(name,values={},notes='')=>{
    const c=await call('/api/characters',{name,gender:'férfi',notes});
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,entry(v)])),history:[],proposals:[]}));return c;
  };
  const palor=await mk('Palor',{play_voice:'PALOR-SAJAT-HANG'},'PALOR-ADMIN-PRIVAT');
  const a=await mk('Teszt Aladár',{goals:'Megoldani a napi feladatot.',speech:'ALADAR-HANG: nyugodtan, hosszú mondatokban.',recognition:9,attachment:9,grievances:9,security:9,anatomy:'ALADAR-EXPLICIT',secrets:'ALADAR-TITOK'});
  const b=await mk('Teszt Béla',{goals:'Önállóan dolgozni.',speech:'BELA-HANG: röviden, tárgyilagosan.',autonomy:9,attachment:2,recognition:2,anatomy:'BELA-EXPLICIT',secrets:'BELA-TITOK'});
  const c=await mk('Teszt Csaba',{goals:'A munka befejezése.',speech:'CSABA-HANG: csendesen.',security:2});
  const outsider=await mk('Teszt Dénes',{goals:'Pihenni.',secrets:'KIVULALLO-TITOK'},'KIVULALLO-ADMIN');
  const cafe=await call('/api/locations',{name:'Teszt kávézó',kind:'tag'});
  for(const p of [a,b,c])await call('/api/world-engine/places',{character_id:p.id,location_id:cafe.id,role:'home'});
  const node={id:'n-cafe',name:'Teszt kávézó',parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0};
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node]}}]}));
  await call('/api/play/travel',{node_id:'n-cafe'});
  const start=(channel,text='Szia!',cid=a.id)=>call(channel==='group'?'/api/play/group-talk':'/api/play/talk',channel==='group'?{text}:{character_id:cid,channel,text});
  const turn=(conv,text)=>call(conv.mode==='group'?'/api/play/group-talk':'/api/play/talk',{conversation_id:conv.id,text});
  const end=conv=>call(`/api/play/conversations/${conv.id}/end`,{});
  const event=conv=>app.db.prepare("SELECT * FROM world_events WHERE json_extract(payload_json,'$.play_conversation_id')=? AND rewound_at IS NULL").get(conv.id);
  return {app,opts,root,dataDir,call,requests,control,palor,a,b,c,outsider,cafe,start,turn,end,event,setNow:date=>{now=new Date(date);}};
}
