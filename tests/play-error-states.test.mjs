// Play error states (debugging package, 2026-11-13): what the player sees when Grok does not
// answer, the daily AI budget is used up, or a picture is missing. Each must be a handled answer
// (no 500, nothing in errors.log) with a Hungarian message, and a failed talk keeps the line.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {translateServerMessage} from '../app/public/i18n.js';

test('Grok down, budget used up and a missing picture give handled Hungarian errors',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-play-err-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  let mode='down';
  const provider=createMockProvider(()=>{
    if(mode==='down')throw Object.assign(Error('Grok could not be reached (no connection).'),{code:'AI_FAILED'});
    if(mode==='empty')return {reply:''};
    return {reply:'Szia!'};
  });
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};};
  const hungarian=msg=>{const hu=translateServerMessage(msg);return hu!==msg||/[áéíóöőúüű]/i.test(msg);};
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Aladár');
    const work=(await call('/api/locations',{name:'Kórház',kind:'tag'})).data,flat=(await call('/api/locations',{name:'Palor lakása',kind:'tag'})).data;
    const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Jó orvos lenni.')},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
    const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-work','Kórház','n-city',work.id),node('n-flat','Palor lakása','n-city',flat.id)]}}]}));
    await call('/api/play');
    const trip=await call('/api/play/travel',{node_id:'n-work'});assert.equal(trip.status,200,JSON.stringify(trip.data).slice(0,300));

    // 1. Grok does not answer.
    const down=await call('/api/play/talk',{character_id:a.id,text:'Szia!'});
    assert.ok(down.status>=400&&down.status<500||[502,503].includes(down.status),'handled: '+down.status);
    assert.ok(hungarian(down.data.error),'Hungarian: '+down.data.error);
    // 2. The character answers with nothing.
    mode='empty';
    const empty=await call('/api/play/talk',{character_id:a.id,text:'Szia!'});
    assert.equal(empty.status,502,JSON.stringify({down,empty}));assert.ok(hungarian(empty.data.error));
    // 3. Daily budget used up.
    mode='ok';
    const cap=app.worldEngine.settings().daily_cap_usd;
    app.worldEngine.updateSettings({daily_cap_usd:0});
    const broke=await call('/api/play/talk',{character_id:a.id,text:'Szia!'});
    app.worldEngine.updateSettings({daily_cap_usd:cap});
    if(broke.status!==200){assert.equal(broke.status,429,JSON.stringify(broke.data));assert.ok(hungarian(broke.data.error));}
    // 4. A picture whose file is missing.
    const mid=randomUUID();
    app.db.prepare('INSERT INTO media(id,relative_path,folder,kind,size,modified_at,created_at) VALUES(?,?,?,?,?,?,?)').run(mid,'nincs/ilyen.jpg','nincs','image',10,new Date().toISOString(),new Date().toISOString());
    const pic=await fetch(origin+'/media/'+mid);
    assert.equal(pic.status,404);
    assert.ok(hungarian((await pic.json()).error));
    // And a normal answer still works afterwards.
    const ok=await call('/api/play/talk',{character_id:a.id,text:'Szia!'});
    assert.equal(ok.status,200);
    const log=await fs.readFile(path.join(dataDir,'logs','errors.log'),'utf8').catch(()=>'');
    assert.equal(log.trim(),'','no unexpected server error');
  }finally{await app.close();await fs.rm(base,{recursive:true,force:true});}
});
