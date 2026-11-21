import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('scene guests: a new man joins a 1:1 scene, speaks in the reply, the narrator sees him, he can be saved or leave',async()=>{
  // Never a real paid picture from a test: the OpenAI key is removed for this run.
  const savedKey=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-guests-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let guestName='Teszt Vendel';
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('ideiglenes mellékszereplőt'))return {name:guestName,description:'Harmincas, széles vállú férfi vadászruhában. Épp erre járt.',portrait:'A man in hunting clothes in a forest.'};
    if(req.system.includes('játék Rendszere'))return {answer:'RENDSZER-LEIRAS: hárman vannak a tisztáson.'};
    if(req.system.includes('összefoglal'))return {title:'Találkozás',summary:'Beszélgettek.'};
    return {reply:'Szia!',guests:[{name:'Vendel',text:'*bólint* Jó estét.'},{name:'Senki',text:'nem szerepel'}],choices:['a','b','c'],intimate:replyIntimate};});
  let replyIntimate=false;
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Aladár');
    const work=(await call('/api/locations',{name:'Erdő',kind:'tag'})).data;
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Sétálni.')},history:[],proposals:[]}));
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+palor.id,JSON.stringify({version:1,values:{appearance_summary:entry('PALOR-KULSO')},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
    const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-work','Erdő','n-city',work.id)]}}]}));
    await call('/api/play/travel',{node_id:'n-work'});
    let v=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',text:'Szia!'})).data;
    assert.equal(v.guests.length,0);
    // Join: no character record, male policy text, picture off when not asked for.
    v=(await call('/api/play/guests',{conversation_id:v.id,hint:'egy vadász',portrait:false})).data;
    assert.deepEqual(v.guests.map(g=>[g.name,g.image,g.saved]),[['Teszt Vendel','off',false]]);
    assert.ok(requests.at(-1).user.includes('egy vadász')&&requests.at(-1).system.includes('soha nem nő'));
    assert.equal(app.db.prepare("SELECT count(*) n FROM characters WHERE name='Teszt Vendel'").get().n,0,'a guest is not a character');
    // A taken name is refused (Palor, the partner or another guest).
    guestName='Palor';assert.equal((await call('/api/play/guests',{conversation_id:v.id})).status,409);
    await mk('Teszt Cecil');guestName='teszt cecil';assert.equal((await call('/api/play/guests',{conversation_id:v.id})).status,409,'an existing character name is taken');
    assert.ok(requests.at(-1).user.includes('Teszt Cecil'));guestName='Teszt Vendel';
    // The reply writes his line too; unknown names are dropped.
    v=(await call('/api/play/talk',{conversation_id:v.id,text:'Ki ez?'})).data;
    const talkReq=requests.at(-1);assert.ok(talkReq.user.includes('TÖBBEN VAGYTOK A JELENETBEN')&&talkReq.user.includes('Teszt Vendel'));
    assert.deepEqual(v.lines.slice(-2).map(l=>[l.speaker_name||null,l.text]),[[null,'Szia!'],['Teszt Vendel','*bólint* Jó estét.']]);
    assert.deepEqual(v.choices,['a','b','c'],'the suggestions stay with his reply, not the guest line');
    // Palor speaks to the guest by name (with an ending): he must answer and his line comes first;
    // the suggested lines stay Palor's own, naming whom he speaks to.
    v=(await call('/api/play/talk',{conversation_id:v.id,text:'Vendelnek is szólok: te mit szólsz ehhez?'})).data;
    const asked=requests.at(-1).user;
    assert.match(asked,/Palor most Teszt Vendel felé szólt\. Neki KÖTELEZŐ/);assert.match(asked,/KIZÁRÓLAG Palor saját következő mondatai/);
    assert.deepEqual(v.lines.slice(-2).map(l=>l.speaker_name||null),['Teszt Vendel',null],'the addressed guest answers first');
    assert.deepEqual(v.choices,['a','b','c']);
    v=(await call('/api/play/talk',{conversation_id:v.id,text:'Aladár, gyere közelebb.'})).data;
    assert.match(requests.at(-1).user,/Palor most hozzád \(Teszt Aladár\) szólt/);
    assert.deepEqual(v.lines.slice(-2).map(l=>l.speaker_name||null),[null,'Teszt Vendel']);
    // The generated content decides whether the scene is intimate now, not the conversation mode.
    assert.equal(v.mode,'normal');assert.equal(v.intimate_now,false);assert.match(requests.at(-1).user,/"intimate":true/);
    replyIntimate=true;v=(await call('/api/play/talk',{conversation_id:v.id,text:'Gyere ide.'})).data;
    assert.equal(v.mode,'normal');assert.equal(v.intimate_now,true);
    replyIntimate=false;
    // The narrator sees Palor and the guest; the next reply continues from what it wrote.
    v=(await call('/api/play/talk',{conversation_id:v.id,text:'*Rendszer! Írd le, mi látszik most.*'})).data;
    assert.equal(v.narration.answer,'RENDSZER-LEIRAS: hárman vannak a tisztáson.');
    const narr=requests.at(-1);assert.ok(narr.user.includes('CSATLAKOZOTT ÚJ SZEREPLŐ')&&narr.user.includes('PALOR-KULSO')&&narr.system.includes('új szöveget írhatsz'));
    await call('/api/play/talk',{conversation_id:v.id,text:'És most?'});
    assert.ok(requests.at(-1).user.includes('A JELENET LEÍRÁSA')&&requests.at(-1).user.includes('RENDSZER-LEIRAS'));
    // Pictures: a stand-in OpenAI (no network, no cost) makes the dressed one, then the shirtless
    // one as an edit of it.
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4]),openai=[],realFetch=globalThis.fetch;
    process.env.OPENAI_API_KEY='test-key';
    globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://api.openai.com/')){openai.push({url:String(url),body:JSON.parse(opts.body)});return new Response(JSON.stringify({data:[{b64_json:jpeg.toString('base64')}],usage:{total_tokens:10}}),{status:200});}return realFetch(url,opts);};
    try{
      guestName='Teszt Vendel';
      guestName='Teszt Ödön';v=(await call('/api/play/guests',{conversation_id:v.id,portrait:true})).data;
      for(let i=0;i<40&&app.db.prepare("SELECT bare_status s FROM play_guests WHERE name='Teszt Ödön'").get().s==='pending';i++)await new Promise(r=>setTimeout(r,25));
    }finally{globalThis.fetch=realFetch;delete process.env.OPENAI_API_KEY;}
    assert.deepEqual(openai.map(o=>o.url.split('/').at(-1)),['generations','edits']);
    assert.match(openai[0].body.prompt,/fully clothed/);assert.match(openai[1].body.prompt,/shirtless/);assert.equal(openai[1].body.images.length,1);
    v=(await call('/api/play/conversations/'+v.id)).data;
    const odon=v.guests.find(g=>g.name==='Teszt Ödön');assert.deepEqual([odon.image,odon.bare],['done','done']);
    for(const q of ['','?bare=1']){const r=await fetch(origin+`/api/play/guests/${odon.id}/image${q}`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');}
    // A guest without a shirtless picture (older guest, or a failed edit) gets one on request:
    // one edit of his dressed picture.
    app.db.prepare("UPDATE play_guests SET bare_status='failed',bare_file=NULL WHERE id=?").run(odon.id);
    process.env.OPENAI_API_KEY='test-key';openai.length=0;
    globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://api.openai.com/')){openai.push({url:String(url),body:JSON.parse(opts.body)});return new Response(JSON.stringify({data:[{b64_json:jpeg.toString('base64')}]}),{status:200});}return realFetch(url,opts);};
    try{await call(`/api/play/guests/${odon.id}/shirtless`,{});
      for(let i=0;i<40&&app.db.prepare('SELECT bare_status s FROM play_guests WHERE id=?').get(odon.id).s==='pending';i++)await new Promise(r=>setTimeout(r,25));}
    finally{globalThis.fetch=realFetch;delete process.env.OPENAI_API_KEY;}
    assert.deepEqual(openai.map(o=>o.url.split('/').at(-1)),['edits']);
    assert.equal(app.db.prepare('SELECT bare_status s FROM play_guests WHERE id=?').get(odon.id).s,'done');
    // New pictures on request: both again, waist-up 2:3 with background, nothing below the waist.
    process.env.OPENAI_API_KEY='test-key';openai.length=0;
    globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://api.openai.com/')){openai.push({url:String(url),body:JSON.parse(opts.body)});return new Response(JSON.stringify({data:[{b64_json:jpeg.toString('base64')}]}),{status:200});}return realFetch(url,opts);};
    try{await call(`/api/play/guests/${odon.id}/pictures`,{});
      for(let i=0;i<40&&app.db.prepare('SELECT bare_status s FROM play_guests WHERE id=?').get(odon.id).s==='pending';i++)await new Promise(r=>setTimeout(r,25));}
    finally{globalThis.fetch=realFetch;delete process.env.OPENAI_API_KEY;}
    assert.deepEqual(openai.map(o=>[o.url.split('/').at(-1),o.body.size]),[['generations','1024x1536'],['edits','1024x1536']]);
    for(const o of openai)assert.match(o.body.prompt,/no waistband, belt or trousers visible[\s\S]*background/);
    assert.match(openai[0].body.prompt,/A man in hunting clothes/,'the stored picture description is reused');
    assert.equal((await call('/api/play/guests',{conversation_id:v.id})).status,409,'at most two guests');
    // Save: a real male character with the description as working text, both pictures in his
    // folder; twice is the same.
    const so=(await call(`/api/play/guests/${odon.id}/save`,{})).data;assert.equal(so.saved.pictures.length,2);
    assert.deepEqual((await fs.readdir(path.join(root,'10_CHARACTERS','Teszt Ödön'))).map(f=>f.split(' - ')[1]).sort(),['félmeztelen','profilkép']);
    const gid=v.guests.find(g=>g.name==='Teszt Vendel').id;
    const s=(await call(`/api/play/guests/${gid}/save`,{})).data;assert.equal(s.saved.name,'Teszt Vendel');assert.deepEqual(s.saved.pictures,[]);
    const row=app.db.prepare("SELECT biography,appearance FROM characters WHERE name='Teszt Vendel'").get();assert.equal(row.biography,'Nem: férfi.');assert.match(row.appearance,/vadászruhában/);
    await call(`/api/play/guests/${gid}/save`,{});assert.equal(app.db.prepare("SELECT count(*) n FROM characters WHERE name='Teszt Vendel'").get().n,1);
    // Leave: he is no longer in the scene.
    v=(await call(`/api/play/guests/${gid}/leave`,{})).data;assert.deepEqual(v.guests.map(g=>g.name),['Teszt Ödön']);
    // Without a key nothing is called and both pictures fail quietly.
    guestName='Teszt Zoltán';v=(await call('/api/play/guests',{conversation_id:v.id,portrait:true})).data;
    for(let i=0;i<20&&app.db.prepare("SELECT image_status s FROM play_guests WHERE name='Teszt Zoltán'").get().s==='pending';i++)await new Promise(r=>setTimeout(r,25));
    const z=(await call('/api/play/conversations/'+v.id)).data.guests.find(g=>g.name==='Teszt Zoltán');assert.deepEqual([z.image,z.bare],['failed','failed']);
    assert.equal((await call(`/api/play/guests/${z.id}/shirtless`,{})).status,409,'no shirtless picture without a dressed one');
    // Sogni is explicitly selected, so missing/unavailable Sogni never falls back to OpenAI.
    await call('/api/play/settings',{guest_image_provider:'sogni'});assert.equal((await call('/api/play/settings',{guest_image_provider:'unknown'})).status,400);
    assert.equal((await call(`/api/play/guests/${odon.id}/pictures`,{})).status,409);assert.equal((await call(`/api/play/guests/${odon.id}/shirtless`,{})).status,409);
  }finally{await app.close?.();app.server.close();if(savedKey!==undefined)process.env.OPENAI_API_KEY=savedKey;}
});
