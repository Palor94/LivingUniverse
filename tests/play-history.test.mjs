import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

// Synthetic data only. Talks build a shared history the character carries into later talks, and
// the profile's events tab can list every talk with its summary and lines.
test('play history: shared past grows per save point, reaches the prompt, talk log lists it',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-play-history-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];let round=0;
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('foglalsz össze')){round++;
      return {title:'Beszélgetés '+round,summary:'ÖSSZEFOGLALÓ-'+round,character_memory:'EMLÉK-'+round,palor_memory:'P-'+round,level_delta:0,reason:'semmi',...(round===2?{}:{shared_history:'KÖZÖS-MÚLT-'+round})};}
    return {reply:'Szia, Palor!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const summaryReq=()=>requests.filter(r=>r.system.includes('foglalsz össze')).at(-1);
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    await mk('Palor');const a=await mk('Teszt Béla');
    const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Teszt cél.')},history:[],proposals:[]}));
    const talk=async text=>{const c=(await call('/api/play/talk',{character_id:a.id,channel:'phone',text})).data;assert.ok(c.id,JSON.stringify(c));return c;};

    // First talk: nothing earlier, the summary is asked for a shared history.
    let c1=await talk('Első üzenet');
    assert.ok(!requests.at(-1).user.includes('KÖZÖS MÚLTATOK'));
    await call(`/api/play/conversations/${c1.id}/end`,{});
    assert.ok(summaryReq().system.includes('"shared_history"'));
    assert.ok(summaryReq().user.includes('még nincs, ez az első beszélgetésük'));

    // Second talk: the shared history is in his prompt; an empty answer keeps the old version.
    const c2=await talk('Második üzenet');
    assert.ok(requests.at(-1).user.includes('KÖZÖS MÚLTATOK PALORRAL')&&requests.at(-1).user.includes('KÖZÖS-MÚLT-1'));
    await call(`/api/play/conversations/${c2.id}/end`,{});
    assert.ok(summaryReq().user.includes('KÖZÖS-MÚLT-1'),'the update grows from the previous version');
    assert.equal(JSON.parse(app.db.prepare('SELECT summary_json FROM play_conversations WHERE id=?').get(c2.id).summary_json).shared_history,'KÖZÖS-MÚLT-1');

    // Third talk (left open): the talk before the last one is listed too.
    await talk('Harmadik üzenet');
    const prompt=requests.at(-1).user;
    assert.ok(prompt.includes('KORÁBBI BESZÉLGETÉSEITEK')&&prompt.includes('ÖSSZEFOGLALÓ-1'));
    assert.ok(prompt.includes('LEGUTÓBB PALORRAL: 2026-11-10: ÖSSZEFOGLALÓ-2'));

    // Profile talk log: newest first, open talk included, lines on demand.
    const log=(await call('/api/play/talk-log/'+a.id)).data;
    assert.equal(log.shared_history,'KÖZÖS-MÚLT-1');
    assert.deepEqual(log.talks.map(t=>t.status),['open','closed','closed']);
    assert.equal(log.talks[2].summary,'ÖSSZEFOGLALÓ-1');assert.equal(log.talks[2].character_memory,'EMLÉK-1');
    const lines=(await call('/api/play/talk-log/lines/'+c1.id)).data.lines;
    assert.deepEqual(lines.map(l=>l.name),['Palor','Teszt Béla']);assert.equal(lines[0].text,'Első üzenet');
    assert.equal((await call('/api/play/talk-log/00000000-0000-4000-8000-000000000000')).status,404);

    // A rewound talk takes its shared-history version back with it.
    app.db.prepare("UPDATE play_conversations SET rewound_at='x' WHERE id=?").run(c1.id);
    assert.equal((await call('/api/play/talk-log/'+a.id)).data.shared_history,'KÖZÖS-MÚLT-1','c2 kept the copy');
    app.db.prepare("UPDATE play_conversations SET rewound_at='x' WHERE id=?").run(c2.id);
    assert.equal((await call('/api/play/talk-log/'+a.id)).data.shared_history,'');
  }finally{await app.close();await fs.rm(base,{recursive:true,force:true}).catch(()=>{});}
});
