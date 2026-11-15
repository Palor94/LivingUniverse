import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('group scene: two people at the same place answer in one turn; save point remembers both, never intimate',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-group-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('társas jelenetet foglalsz'))return {title:'Kávészünet',summary:'Hárman beszélgettek.',memories:{'Teszt Aladár':'Palor jókedvű volt.','Teszt Béla':'Palor kérdezett a munkáról.'},palor_memory:'Jó volt velük.'};
    if(req.system.includes('társas jelenetét'))return {replies:[{name:'Teszt Aladár',text:'Szia, Palor!'},{name:'Béla',text:'Na, mi újság?'},{name:'Ismeretlen',text:'nem szerepel'}],beat:'sex',choices:['Sziasztok!','Mi a helyzet?','Kértek egy kávét?']};
    return {reply:'Szia!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Aladár'),b=await mk('Teszt Béla');
    const work=(await call('/api/locations',{name:'Kórház',kind:'tag'})).data;
    for(const c of [a,b]){app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.'),anatomy:entry('TITKOS-EXPLICIT')},history:[],proposals:[]}));
      await call('/api/world-engine/places',{character_id:c.id,location_id:work.id,role:'work'});}
    app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('44444444-4444-4444-8444-444444444444',palor.id,a.id,'PALOR-TITKOS');
    // Synthetic speech text for Palor: a general part, a section for Aladár, a private flirting part.
    const speech=['Általános beszédstílus','Röviden, viccesen beszél.','Gyakori fordulatai:','“Na jó, de most komolyan…”','Aladárral','“Aladár, ezt most hagyjuk.” HANG-ALADAR','Cecillel','“Cecil, gyere.” HANG-MAS','Flörtölés és puhatolózás','“Titok.” FLORT-TITKOS'].join('\n');
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+palor.id,JSON.stringify({version:1,values:{speech:entry(speech)},history:[],proposals:[]}));
    const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-work','Kórház','n-city',work.id)]}}]}));
    assert.equal((await call('/api/play/group-talk',{opener:true})).status,409,'Palor is not with them yet');
    // Wrong-typed ids are a 4xx, never a 500 (audit 2026-11-10).
    for(const [route,body] of [['/api/play/talk',{conversation_id:{},text:'x'}],['/api/play/talk',{photo_id:[1]}],['/api/play/group-talk',{conversation_id:[1],text:'x'}],['/api/relationships',{source_id:[1],target_id:a.id}],['/api/play/media/feedback',{media_id:{},panel:'scene',characters:[a.id],verdict:1}],['/api/play/content',{media_id:{},level:'nudity'}]]){
      const r=await call(route,body);assert.ok(r.status>=400&&r.status<500,route+' → '+r.status);}
    await call('/api/play/travel',{node_id:'n-work'});
    let g=(await call('/api/play/group-talk',{opener:true})).data;
    assert.equal(g.mode,'group');assert.deepEqual(g.participants.map(p=>p.name).sort(),['Teszt Aladár','Teszt Béla']);
    assert.deepEqual(g.lines.map(l=>l.speaker_name),['Teszt Aladár','Teszt Béla'],'unknown speakers are dropped; a first name is enough');
    assert.deepEqual(g.choices,['Sziasztok!','Mi a helyzet?','Kértek egy kávét?'],'group scenes get suggested replies');
    assert.equal(g.lines.at(-1).beat,'talk','a group scene never goes beyond flirt');
    assert.ok(requests.at(-1).system.includes('nincs benne intim')&&!requests.at(-1).user.includes('TITKOS-EXPLICIT')&&!requests.at(-1).user.includes('PALOR-TITKOS'));
    g=(await call('/api/play/group-talk',{conversation_id:g.id,text:'Kávé?'})).data;assert.equal(g.lines.length,5);
    // Suggestion rules (2026-11-15): one reaction plus two diverging ones, Palor's own voice for
    // the people here only plus his flirting part, earlier suggestions not repeated.
    const last=requests.at(-1);
    assert.match(last.system,/Az 1\. közvetlen reakció/);assert.doesNotMatch(last.system,/pózváltás/);
    assert.ok(last.user.includes('PALOR BESZÉDMÓDJA')&&last.user.includes('HANG-ALADAR')&&last.user.includes('Na jó, de most komolyan'));
    assert.ok(!last.user.includes('HANG-MAS')&&last.user.includes('FLORT-TITKOS'));
    assert.match(last.user,/"choices" NE ismételje[^\n]*\n- Sziasztok!\n- Mi a helyzet\?\n- Kértek egy kávét\?/);
    assert.match(last.user,/AZ UTOLSÓ VÁLASZOK[^\n]*\n- Teszt Aladár: Szia, Palor!\n- Teszt Béla: Na, mi újság\?/);
    const ended=(await call(`/api/play/conversations/${g.id}/end`,{})).data;assert.equal(ended.status,'closed');
    const mem=id=>app.db.prepare("SELECT text FROM character_memories WHERE character_id=? AND reason LIKE 'Világmotor%'").all(id).map(r=>r.text);
    assert.deepEqual(mem(a.id),['Palor jókedvű volt.']);assert.deepEqual(mem(b.id),['Palor kérdezett a munkáról.']);
    const ev=app.db.prepare("SELECT id,payload_json FROM world_events WHERE title='Kávészünet'").get();assert.equal(JSON.parse(ev.payload_json).character_ids.length,2);
    // Save points name everyone in a group scene.
    assert.ok((await call('/api/play/save-points')).data.points.some(p=>p.label.includes('Teszt Aladár')&&p.label.includes('Teszt Béla')));
    // The company breaks up (Palor walks away): the next line closes the scene instead of failing.
    const g2=(await call('/api/play/group-talk',{opener:true})).data;await call('/api/play/travel',{node_id:'n-city'});
    const gone=(await call('/api/play/group-talk',{conversation_id:g2.id,text:'Hahó?'})).data;assert.equal(gone.dispersed,true);assert.equal(gone.status,'closed');
    // Routes the Élő világ and journal screens use.
    const ready=(await call('/api/play/readiness')).data;assert.equal(ready.cast.length,2);assert.ok(ready.cast.every(c=>'stand_in' in c));assert.ok(ready.missing_backgrounds.every(b=>b.location_id&&b.name));
    assert.ok((await call('/api/play/relationships')).data.people.some(p=>p.id===a.id));
    const picked=(await call('/api/play/media/pick?'+new URLSearchParams({panel:'journal',characters:[a.id,b.id].join(','),mood:'intimate',progress:'0',daypart:'night'}))).data;assert.deepEqual(picked.items,[]);assert.equal(picked.want_level,'nudity');
    assert.equal((await call(`/api/play/journal/${ev.id}/media`,{})).data.media,null,'no picture of both: none rather than a wrong one');
    // Intimate group scenes (owner 2026-11-15): only when intimacy is open with every one of them.
    const setLevel=(cid,level)=>app.db.prepare('INSERT INTO world_relationship_levels VALUES(?,?,?,?) ON CONFLICT DO UPDATE SET level=excluded.level').run(cid,palor.id,level,'x');
    await call('/api/play/travel',{node_id:'n-work'});
    setLevel(a.id,1);
    let h=(await call('/api/play/group-talk',{opener:true})).data;
    assert.equal(h.lines.at(-1).beat,'talk','one of them is not there yet: at most flirting');assert.ok(requests.at(-1).system.includes('nincs benne intim'));
    await call(`/api/play/conversations/${h.id}/end`,{});
    setLevel(b.id,1);
    h=(await call('/api/play/group-talk',{opener:true})).data;
    assert.equal(h.lines.at(-1).beat,'sex','open with both: the scene may become sexual');
    assert.ok(requests.at(-1).system.includes('szexuálissá is válhat')&&requests.at(-1).system.includes('pózváltás'));
    assert.ok(requests.at(-1).user.includes('TITKOS-EXPLICIT'),'explicit profile fields go in');
    h=(await call('/api/play/group-talk',{conversation_id:h.id,text:'Gyertek.'})).data;
    await call(`/api/play/conversations/${h.id}/end`,{});
    const iev=app.db.prepare("SELECT payload_json FROM world_events WHERE json_extract(payload_json,'$.play_conversation_id')=?").get(h.id);
    assert.equal(JSON.parse(iev.payload_json).intimate,true,'its save point is intimate (news never carries it)');
  }finally{await app.close();}
});
