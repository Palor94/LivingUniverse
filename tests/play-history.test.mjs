import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';

// Synthetic data only. Talks build a shared history the character carries into later talks, and
// the profile's events tab can list every talk with its summary and lines.
test('play history: shared past grows per save point, reaches the prompt, talk log lists it',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-play-history-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];let round=0;
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('foglalsz össze')){round++;
      return {title:'Beszélgetés '+round,summary:'ÖSSZEFOGLALÓ-'+round,character_memory:'EMLÉK-'+round,palor_memory:'P-'+round,level_delta:0,reason:'semmi',...(round===2?{}:{shared_history:'KÖZÖS-MÚLT-'+round}),
        tags:['Munka','munka','család'],importance:round===1?9:4,learned:{character:'Palor orvos.',palor:''},mood:{character:'vidám',palor:'fáradt'},
        // "Kovács" is ambiguous (two people): abstains; "Géza" is unique; an unknown name is dropped.
        mentioned_people:['Géza','Kovács','Ismeretlen Ödön','Palor'],mentioned_places:['Kórház','Sehol']};}
    return {reply:'Szia, Palor!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const summaryReq=()=>requests.filter(r=>r.system.includes('foglalsz össze')).at(-1);
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Béla'),geza=await mk('Teszt Géza');await mk('Kovács Ádám');await mk('Kovács Dénes');
    const hospital=(await call('/api/locations',{name:'Kórház',kind:'tag'})).data;
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

    // Richer fields: normalised tags, importance only 1-5, mentions resolved only when unique.
    const s1=JSON.parse(app.db.prepare('SELECT summary_json FROM play_conversations WHERE id=?').get(c1.id).summary_json);
    assert.deepEqual(s1.tags,['munka','család']);assert.equal(s1.importance,undefined);
    assert.deepEqual(s1.learned,{character:'Palor orvos.',palor:''});assert.deepEqual(s1.mood,{character:'vidám',palor:'fáradt'});
    assert.deepEqual(s1.mentioned_character_ids,[geza.id]);assert.deepEqual(s1.mentioned_location_ids,[hospital.id]);
    assert.equal(app.db.prepare('SELECT count(*) n FROM characters').get().n,5,'no character is created from a talk');

    // Profile talk log: newest first, open talk included, lines on demand.
    const log=(await call('/api/play/talk-log/'+a.id)).data;
    assert.equal(log.shared_history,'KÖZÖS-MÚLT-1');
    assert.deepEqual(log.items.map(t=>t.status),['open','closed','closed']);
    assert.equal(log.items[2].summary,'ÖSSZEFOGLALÓ-1');assert.equal(log.items[2].character_memory,'EMLÉK-1');assert.equal(log.items[1].importance,4);
    assert.deepEqual(log.items[2].participants.map(p=>p.name),['Palor','Teszt Béla']);assert.equal(log.items[2].role,'participant');
    const lines=(await call('/api/play/talk-log/talk/'+c1.id)).data.lines;
    assert.deepEqual(lines.map(l=>l.name),['Palor','Teszt Béla']);assert.equal(lines[0].text,'Első üzenet');
    // A scene guest's line carries the guest's own name, not '?' (2026-11-22).
    const gid='11111111-1111-4111-8111-111111111111',lid='22222222-2222-4222-8222-222222222222';
    app.db.prepare("INSERT INTO play_guests(id,conversation_id,name,description,image_status,created_at) VALUES(?,?,?,?,'none',?)").run(gid,c1.id,'Teszt Vendég','',new Date().toISOString());
    app.db.prepare("INSERT INTO play_lines(id,conversation_id,speaker,text,created_at) VALUES(?,?,'character','Vendég szól.',?)").run(lid,c1.id,new Date().toISOString());
    app.db.prepare('INSERT INTO play_line_speaker(line_id,character_id) VALUES(?,?)').run(lid,'guest:'+gid);
    const withGuest=(await call('/api/play/talk-log/talk/'+c1.id)).data.lines;
    assert.equal(withGuest.at(-1).name,'Teszt Vendég');assert.equal(withGuest.at(-1).speaker_id,'guest:'+gid);
    app.db.prepare('DELETE FROM play_line_speaker WHERE line_id=?').run(lid);app.db.prepare('DELETE FROM play_lines WHERE id=?').run(lid);
    assert.equal((await call('/api/play/talk-log/00000000-0000-4000-8000-000000000000')).status,404);
    // Every participant's profile: Palor sees all talks; a mentioned person sees them marked.
    assert.equal((await call('/api/play/talk-log/'+palor.id)).data.items.length,3);
    const mentioned=(await call('/api/play/talk-log/'+geza.id)).data;
    assert.deepEqual(mentioned.items.map(i=>i.role),['mentioned','mentioned']);assert.equal(mentioned.shared_history,'');

    // Promotion by hand: a proposed story event whose source key points back to the talk.
    const ev=(await call('/api/events',{request_key:'promote-'+c1.id,status:'proposed',event:{title:'Beszélgetés 1',summary:'ÖSSZEFOGLALÓ-1',details:'',consequences:'',timeline:'main',visibility:'participants',
      chronology:{kind:'exact',start:'2026-11-10',label:'reggel'},participants:[{character_id:palor.id,role:'participant',knows:true},{character_id:a.id,role:'participant',knows:true}],location_ids:[],
      sources:[{system:'Living Universe játék',external_id:'play-conversation:'+c1.id,url:'',locator:'',excerpt:''}],tags:['munka'],related_event_ids:[]}})).data;
    assert.equal(ev.status,'proposed');
    assert.equal((await call('/api/play/talk-log/'+a.id)).data.items[2].story_event_id,ev.id);

    // B3 participant card: shared facts only; no private memories or creator reasons.
    const beforeCard=requests.length;
    const card=(await call('/api/play/known-character/'+a.id)).data;
    assert.deepEqual(Object.keys(card).sort(),['appointments','labels','person','talks','threads']);
    assert.equal(card.person.id,a.id);assert.equal(card.talks.length,2);
    assert.ok(card.talks.some(talk=>talk.summary==='ÖSSZEFOGLALÓ-1'));
    assert.ok(!JSON.stringify(card).includes('EMLÉK-'));assert.ok(!('memories' in card)&&!('friends' in card)&&!('history' in card));
    assert.equal(requests.length,beforeCard,'card read has no model call');
    assert.equal((await call('/api/play/known-character/00000000-0000-4000-8000-000000000000')).status,404);

    // MCP: the same read model, with a character perspective.
    const catalogue=await createCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root});
    try{
      const listed=(await catalogue.call('list_conversations',{character_id:geza.id})).data;assert.equal(listed.total,2);
      assert.equal((await catalogue.call('list_conversations',{character_id:geza.id,perspective_character_id:geza.id})).data.total,0,'he was not there');
      assert.equal((await catalogue.call('list_conversations',{character_id:a.id,min_importance:4})).data.total,1);
      assert.equal((await catalogue.call('list_conversations',{character_id:a.id,tag:'család'})).data.total,2);
      const full=(await catalogue.call('get_conversation',{conversation_id:c1.id})).data;
      assert.equal(full.shared_history,'KÖZÖS-MÚLT-1');assert.equal(full.lines.length,2);assert.equal(full.story_event_id,ev.id);
      await assert.rejects(catalogue.call('list_conversations',{character_id:a.id,bogus:1}),/Unknown arguments/);
    }finally{catalogue.close();}

    // A rewound talk takes its shared-history version back with it.
    app.db.prepare("UPDATE play_conversations SET rewound_at='x' WHERE id=?").run(c1.id);
    assert.equal((await call('/api/play/talk-log/'+a.id)).data.shared_history,'KÖZÖS-MÚLT-1','c2 kept the copy');
    app.db.prepare("UPDATE play_conversations SET rewound_at='x' WHERE id=?").run(c2.id);
    assert.equal((await call('/api/play/talk-log/'+a.id)).data.shared_history,'');
  }finally{await app.close();await fs.rm(base,{recursive:true,force:true}).catch(()=>{});}
});
