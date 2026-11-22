// 2026-11-22: group scenes – who speaks (named first, else the longest silent), each speaks only
// for himself, and the group save point writes each one's inner state and opinions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('group: named person answers first, else the longest silent; save point keeps each one\'s state',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-glife-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('társas jelenetet foglalsz'))return {title:'Kávé',summary:'Beszélgettek.',memories:{'Teszt Aladár':'Jó volt.','Béla':'Fárasztó volt.'},
      inner:{'Teszt Aladár':{mood:'vidám',intensity:2,reason:'Palor megdicsérte.',concerns:['a pékség'],wants_from_palor:'',palor_view:'Jóban vannak.'},'Béla':{mood:'sértett',intensity:2,reason:'Palor nem figyelt rá.',concerns:[],wants_from_palor:'figyelem',palor_view:'Palor mellőzi.'}},
      opinions:{'Teszt Béla':[{about:'Aladár',text:'Aladár mindig a középpontban akar lenni.'}]}};
    if(req.system.includes('társas jelenetét'))return {replies:[{name:'Teszt Aladár',text:'Szia!'},{name:'Teszt Béla',text:'Na.'}],choices:['a','b','c']};
    return {reply:'Szia!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
  const a=await mk('Teszt Aladár'),b=await mk('Teszt Béla');
  const work=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
  for(const c of [a,b]){app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:c.id,location_id:work.id,role:'work'});}
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-c',name:'Kávézó',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-c'});
  let g=(await call('/api/play/group-talk',{opener:true})).data;
  const last=()=>requests.filter(r=>r.system.includes('társas jelenetét')).at(-1);
  assert.match(last().system,/Palor helyett soha senki nem beszél/);
  g=(await call('/api/play/group-talk',{conversation_id:g.id,text:'Bélával akartam beszélni. Mi újság?'})).data;
  assert.match(last().user,/KI SZÓLAL MEG: Palor most Teszt Béla felé szólt: ő válaszol elsőként/,'a name with a case ending counts');
  g=(await call('/api/play/group-talk',{conversation_id:g.id,text:'És mi a helyzet?'})).data;
  assert.match(last().user,/KI SZÓLAL MEG: Palor senkit nem szólított meg név szerint; elsőként Teszt (Aladár|Béla) válaszoljon/);
  const ended=(await call(`/api/play/conversations/${g.id}/end`,{})).data;assert.equal(ended.status,'closed');
  const sumReq=requests.filter(r=>r.system.includes('társas jelenetet foglalsz')).at(-1);
  assert.match(sumReq.system,/Ténykezelés/);assert.match(sumReq.system,/"inner"/);
  const inner=app.worldEngine.internals.inner;
  assert.equal(inner.current(a.id).mood,'vidám');assert.equal(inner.current(b.id).mood,'sértett','matched by first name');
  assert.equal(inner.current(b.id).palor_view,'Palor mellőzi.');
  assert.equal(app.db.prepare("SELECT count(*) n FROM world_beliefs WHERE model='play-opinion' AND character_id=? AND about_id=?").get(b.id,a.id).n,1);
});
