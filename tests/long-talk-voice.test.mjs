// Real talk routes with a mock provider: prompt continuity, not live reply quality.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'synthetic test',visibility:'creator'});
const cast=[
  {name:'Teszt Aladár',values:{speech:'Hosszú, kedves mondatok; megszólítása: drága barátom.',play_voice:'Nyugodt, meleg hangon, választékosan beszél.',play_rules:'Kérdés előtt megnyugtatja a másikat.',play_lines:'Drága barátom, mondd csak nyugodtan.',sarcasm:1,bluntness:2,directness:2,expressiveness:9},phrases:['ritkán ironizál','tapintatos, finoman fogalmaz','kerülgeti a témát, célozgat','nyíltan, látványosan kifejezi az érzéseit']},
  {name:'Teszt Béla',values:{speech:'Rövid, csípős mondatok; kérdésre kérdéssel felel.',play_voice:'Halkan, száraz gúnnyal beszél.',play_rules:'Dicséretre gyanakvó kérdéssel reagál.',play_lines:'Ennyi? Ezért hívtál?',sarcasm:9,bluntness:9,directness:9,expressiveness:2},phrases:['gyakran szarkasztikus, csípős a humora','nyers, kertelés nélkül kimondja, amit gondol','egyenes, rögtön a lényegre tér','visszafogottan mutatja az érzéseit']},
];
const memoText='A napi teendőikről beszéltek. A következő hét terveit egyeztették.';

test('long talks retain their own voice and communication scales across repeated summaries',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-long-voice-'));
  const root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{
    requests.push(req);
    if(/foglalsz össze/.test(req.system))return {title:'Teszt',summary:'Beszélgettek.',level_delta:0};
    return {reply:'Értem.',beat:'talk',spark:0,photo:'none',choices:[],...(req.system.includes('"memo"')?{memo:memoText}:{})};
  });
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-12T10:00:00')});
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
  for(const person of cast){
    const c=await call('/api/characters',{name:person.name,gender:'férfi'});
    const values=Object.fromEntries(Object.entries({goals:'Megtervezni a hetet.',...person.values}).map(([key,value])=>[key,entry(value)]));
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values,history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:c.id,location_id:cafe.id,role:'home'});
    for(const channel of ['in_person','phone'])await t.test(person.name+' / '+channel,async()=>{
      let conv,initialProfile;const prompts=[];
      for(let turn=0;turn<16;turn++){
        conv=await call('/api/play/talk',conv?{conversation_id:conv.id,text:'És a következő terv? '+turn}:{character_id:c.id,channel,text:'KEZDETI-TEMA: tervezzük meg a hetet.'});
        const req=requests.at(-1);prompts.push(req);
        const profile=req.user.split('KAPCSOLATOD PALORRAL')[0];
        assert.ok(profile.startsWith('PROFILOD:'),'own profile is a separate prompt block');
        if(turn===0)initialProfile=profile;
        assert.equal(profile,initialProfile,'the summary must not replace or compress the profile');
        for(const key of ['speech','play_voice','play_rules','play_lines'])assert.ok(profile.includes(person.values[key]),key+' remains on turn '+turn);
        for(const phrase of person.phrases)assert.ok(profile.includes(phrase),'communication guidance remains: '+phrase);
        for(const other of cast.filter(x=>x!==person))assert.ok(!profile.includes(other.values.play_voice),'another character’s voice must not leak');
        assert.match(req.system,/Maradj a szerepben, a saját hangodon és beszédstílusodban/);
      }
      assert.equal(conv.lines.length,32);
      assert.ok(prompts.filter(r=>r.system.includes('"memo"')).length>=2,'multiple summary updates were exercised');
      const final=prompts.at(-1).user;
      assert.ok(final.includes('A BESZÉLGETÉS KORÁBBI RÉSZE (összefoglaló): '+memoText));
      assert.doesNotMatch(final,/KEZDETI-TEMA/,'the opening line really left the history window');
      assert.ok(!memoText.includes(person.values.play_voice),'the summary itself supplies no voice guidance');
      const stored=JSON.parse(app.db.prepare('SELECT memo_json FROM play_conversations WHERE id=?').get(conv.id).memo_json);
      assert.equal(stored.text,memoText);assert.ok(stored.lines>=20);
      await call(`/api/play/conversations/${conv.id}/end`,{});
    });
  }
});
