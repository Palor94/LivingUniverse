// World audit 2026-11-12: night belongs to its day, pause and resume, validated level changes,
// memory recall, promises (open threads), running summary of long talks, invitations from
// characters, rewind of dates and promises, restore of older backups. Synthetic data and the
// mock provider only: no network, no cost.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {normalizeEvents} from '../app/world-prompts.mjs';
import {worldDayAt} from '../app/world-common.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
const isSummary=r=>/foglalsz össze/.test(r.system),isGm=r=>r.system.includes('játékmester'),isAgent=r=>r.system.includes('szimulációjában');

// Palor and Teszt Aladár, who lives at the café; Palor stands there. The clock and the answers
// can change per step.
async function world({respond,at}){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-audit-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let now=new Date(at);
  const provider=createMockProvider(r=>{requests.push(r);return respond(r);});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>now});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};};
  const palor=(await call('/api/characters',{name:'Palor'})).data,a=(await call('/api/characters',{name:'Teszt Aladár'})).data;
  const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('11111111-1111-4111-8111-111111111111',a.id,palor.id,'Ismerik egymást.');
  await call('/api/world-engine/places',{character_id:a.id,location_id:cafe.id,role:'home'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-cafe','Kávézó','n-city',cafe.id)]}}]}));
  await call('/api/play/travel',{node_id:'n-cafe'});
  const close=async()=>{await new Promise(r=>app.server.close(r));app.db.close();await fs.rm(base,{recursive:true,force:true});};
  return {app,call,a,palor,cafe,requests,setNow:d=>{now=new Date(d);},close};
}
const reply={reply:'Szia, Palor!',beat:'talk',spark:0,choices:[]};
const quiet=r=>isGm(r)?{events:[]}:isAgent(r)?{intention:'Pihen.',location_id:null,wants_to_meet:[],message_to_palor:null}:isSummary(r)?{title:'Beszélgetés',summary:'Beszélgettek.',level_delta:0}:reply;

test('after midnight it is still the previous night: play clock, invitations and the night round',async()=>{
  // 2026-11-14 is a Saturday; at 01:30 it is still Friday night.
  assert.equal(worldDayAt(new Date('2026-11-14T01:30:00')),'2026-11-13');
  assert.equal(worldDayAt(new Date('2026-11-14T06:00:00')),'2026-11-14');
  const w=await world({respond:quiet,at:'2026-11-14T01:30:00'});
  try{
    const o=(await w.call('/api/play')).data;
    assert.deepEqual([o.clock.day,o.clock.slot,o.clock.weekday],['2026-11-13','éjszaka','péntek']);
    await w.call('/api/world-engine/levels',{source_id:w.a.id,target_id:w.palor.id,level:2});
    // "Morning" asked for at 01:30 is the coming morning (Saturday), not Sunday.
    const inv=(await w.call('/api/play/invite',{character_id:w.a.id,node_id:'n-cafe',slot_index:0})).data;
    assert.equal(inv.status,'accepted');assert.equal(inv.day,'2026-11-14');
    // A PC woken at 01:30 still lives last night's part instead of skipping it.
    const s=w.app.worldEngine.settings();w.app.worldEngine.writeSettings({...s,enabled:true,last_day:'2026-11-13',last_slot:2});
    const ran=(await w.call('/api/world-engine/run',{})).data;
    assert.deepEqual(ran.days.map(d=>[d.day,d.slot]),[['2026-11-13','ejszaka']]);
  }finally{await w.close();}
});

test('switching the world back on continues from now: no replay of the paused days, no stale messages',async()=>{
  const w=await world({respond:r=>isGm(r)?{events:[]}:isAgent(r)?{intention:'Dolgozik.',location_id:null,wants_to_meet:[],message_to_palor:'Szia Palor!'}:reply,at:'2026-11-14T13:00:00'});
  try{
    const s=w.app.worldEngine.settings();w.app.worldEngine.writeSettings({...s,enabled:false,last_day:'2026-11-10',last_slot:3});
    await w.call('/api/world-engine/settings',{enabled:true,tempo:'lively'});
    const state=(await w.call('/api/world-engine')).data;
    assert.equal(state.settings.resumed.from_day,'2026-11-10');assert.deepEqual(state.due.map(d=>d.slot),['délután']);
    const ran=(await w.call('/api/world-engine/run',{})).data;
    assert.deepEqual(ran.days.map(d=>[d.day,d.slot]),[['2026-11-14','delutan']],'only the current day part runs');
    // Catch-up days (engine left on while the PC was off) run, but send no old phone messages.
    w.app.worldEngine.writeSettings({...w.app.worldEngine.settings(),last_day:'2026-11-12',last_slot:3});
    w.setNow('2026-11-15T07:00:00');
    const caught=(await w.call('/api/world-engine/run',{})).data;
    assert.deepEqual(caught.days.map(d=>d.day),['2026-11-13','2026-11-14','2026-11-15']);
    const days=w.app.db.prepare('SELECT world_day FROM world_messages ORDER BY world_day').all().map(r=>r.world_day);
    assert.deepEqual(days,['2026-11-14','2026-11-15'],'one from the resumed round, one from today; none for the catch-up day 2026-11-13');
  }finally{await w.close();}
});

test('the game master may move levels only for participants and people they know',()=>{
  const [a,b,c]=['a1','b2','c3'],allowed=new Set([a,b,c]);
  const events=normalizeEvents({events:[{kind:'meeting',title:'Első kávé',summary:'Megismerkedtek.',character_ids:[a,b],new_acquaintances:[[a,b]],
    level_changes:[{source_id:a,target_id:b,delta:1},{source_id:a,target_id:c,delta:1},{source_id:c,target_id:a,delta:1},{source_id:b,target_id:a,delta:0}]}]},
    {allowed,knownPairs:[],locationExists:()=>false,slotId:'reggel'});
  assert.deepEqual(events[0].payload.level_changes.map(l=>l.source_id+'>'+l.target_id),['a1>b2']);
  // Someone he already knows may be affected without being there.
  const known=normalizeEvents({events:[{kind:'everyday',title:'Hír',summary:'Hallott róla.',character_ids:[a],level_changes:[{source_id:a,target_id:c,delta:-1}]}]},{allowed,knownPairs:['a1|c3'],locationExists:()=>false,slotId:'reggel'});
  assert.equal(known[0].payload.level_changes.length,1);
});

test('memory recall keeps the newest and brings back the old ones about the people and words of the moment',async()=>{
  const w=await world({respond:quiet,at:'2026-11-12T10:00:00'});
  try{
    const i=w.app.worldEngine.internals;
    i.remember(w.a.id,'Béla megígérte, hogy segít a költözésben.','teszt-0');
    for(let n=1;n<=30;n++)i.remember(w.a.id,`Hétköznapi dolog ${n}.`,'teszt-'+n);
    const recalled=i.recallMemories(w.a.id,{about:['Teszt Béla'],limit:6});
    assert.equal(recalled.length,6);
    assert.ok(recalled.includes('Béla megígérte, hogy segít a költözésben.'),'the old memory about the person present');
    assert.deepEqual(recalled.slice(-3),['Hétköznapi dolog 28.','Hétköznapi dolog 29.','Hétköznapi dolog 30.'],'newest three, oldest first');
    assert.ok(i.recallMemories(w.a.id,{text:'Mi lesz a költözéssel?'}).some(m=>m.startsWith('Béla')),'words of the moment');
    assert.ok(!i.recallMemories(w.a.id,{text:'Mi a helyzet?'}).some(m=>m.startsWith('Béla')),'without a reason the old one stays out');
  }finally{await w.close();}
});

test('a character without goals or routine can be met and talked to, but does not act in world rounds (2026-11-15)',async()=>{
  const w=await world({respond:quiet,at:'2026-11-12T10:00:00'});
  try{
    const b=(await w.call('/api/characters',{name:'Teszt Csendes'})).data,empty=(await w.call('/api/characters',{name:'Teszt Üres'})).data;
    w.app.db.prepare('UPDATE characters SET biography=? WHERE id=?').run('RÉGI ÉLETRAJZ',b.id);
    await w.call('/api/world-engine/places',{character_id:b.id,location_id:w.cafe.id,role:'home'});
    const i=w.app.worldEngine.internals;
    assert.ok(i.meetable().some(c=>c.id===b.id)&&!i.autonomous().some(c=>c.id===b.id));
    assert.ok(!i.meetable().some(c=>c.id===empty.id),'no profile at all: not in Play');
    const conv=(await w.call('/api/play/talk',{character_id:b.id,channel:'in_person',text:'Szia!'}));
    assert.equal(conv.status,200,JSON.stringify(conv.data));
    const talk=w.requests.filter(r=>!isGm(r)&&!isAgent(r)&&!isSummary(r)).at(-1);
    assert.ok(JSON.stringify(talk).includes('RÉGI ÉLETRAJZ'),'older profile text reaches the talk prompt');
  }finally{await w.close();}
});

test('a character who holds grudges recalls old hurts (profile grievances, 2026-11-15)',async()=>{
  const w=await world({respond:quiet,at:'2026-11-12T10:00:00'});
  try{
    const i=w.app.worldEngine.internals,key='ghost:character:'+w.a.id;
    i.remember(w.a.id,'Csalódott, mert Béla cserben hagyta.','teszt-0');
    for(let n=1;n<=30;n++)i.remember(w.a.id,`Hétköznapi dolog ${n}.`,'teszt-'+n);
    const hurt=()=>i.recallMemories(w.a.id,{limit:6}).some(m=>m.startsWith('Csalódott'));
    assert.ok(!hurt(),'unknown grievances: earlier behaviour');
    const setGrudge=v=>w.app.db.prepare('UPDATE application_settings SET value=? WHERE key=?').run(JSON.stringify({version:2,values:{goals:entry('Dolgozni.'),grievances:entry(v)},history:[],proposals:[]}),key);
    setGrudge(5);assert.ok(hurt(),'holds grudges: the hurt comes back');
    setGrudge(0);assert.ok(!hurt(),'forgives easily: it stays out');
  }finally{await w.close();}
});

test('promises from a talk return in later talks, lapse after their day, and are undone by rewind',async()=>{
  let summary={title:'Kávé',summary:'Megbeszélték.',level_delta:0,promises:[{by:'palor',text:'Pénteken felhívom.',due:'2026-11-13'},{by:'x',text:'rossz'}]};
  const w=await world({respond:r=>isSummary(r)?summary:quiet(r),at:'2026-11-12T10:00:00'});
  try{
    const first=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Pénteken felhívlak.'})).data;
    const point=(await w.call(`/api/play/conversations/${first.id}/end`,{})).data;assert.equal(point.status,'closed');
    const rows=()=>w.app.db.prepare('SELECT promised_by,text,due_day,status,noted_at,rewound_at FROM world_threads').all();
    assert.deepEqual(rows().map(r=>[r.promised_by,r.due_day,r.status]),[['palor','2026-11-13','open']],'invalid ones are dropped');
    // The next talk knows about it.
    const second=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'})).data;
    assert.match(w.requests.at(-1).user,/TERVEK ÉS ÍGÉRETEK KÖZTETEK:\n- Palor ígérte: Pénteken felhívom\. \(esedékes: 2026-11-13\)/);
    // The summary hears about the open plan by number.
    summary={title:'Újra',summary:'Megint.',level_delta:0,promises:[]};
    await w.call(`/api/play/conversations/${second.id}/end`,{});
    assert.match(w.requests.at(-1).user,/NYITOTT TERVEK:\n1\. Palor: Pénteken felhívom\./);
    const savePoint=w.app.db.prepare("SELECT closed_at FROM play_conversations WHERE id=?").get(second.id).closed_at;
    // Saturday: Friday's call never came. He brings it up once.
    w.setNow('2026-11-15T10:00:00');
    const third=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Hali!'})).data;
    assert.match(w.requests.at(-1).user,/ELMARADT: Palor nem tartotta meg: Pénteken felhívom\./);
    assert.equal(rows()[0].status,'lapsed');assert.ok(rows()[0].noted_at);
    await w.call('/api/play/talk',{conversation_id:third.id,text:'Bocs.'});
    assert.doesNotMatch(w.requests.at(-1).user,/ELMARADT/,'brought up only once');
    // A kept plan: the summary names it by number.
    summary={title:'Ígéret',summary:'Új terv.',level_delta:0,promises:[{by:'character',text:'Holnap hozok kávét.',due:null}]};
    await w.call(`/api/play/conversations/${third.id}/end`,{});
    const fourth=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Megjött a kávé?'})).data;
    summary={title:'Kávé',summary:'Meghozta.',level_delta:0,kept:[1]};
    await w.call(`/api/play/conversations/${fourth.id}/end`,{});
    assert.deepEqual(rows().map(r=>r.status).sort(),['kept','lapsed']);
    // Rewind to the save point before Saturday: the later plan is undone, the lapsed one open again.
    const rw=(await w.call('/api/play/rewind',{time:savePoint})).data;assert.ok(rw.id);
    const after=rows();
    assert.equal(after.find(r=>r.text==='Holnap hozok kávét.').rewound_at!==null,true);
    const call=after.find(r=>r.text==='Pénteken felhívom.');assert.equal(call.status,'open');assert.equal(call.noted_at,null);
    // Undo brings everything back.
    assert.equal((await w.call('/api/play/rewind/undo',{})).status,200);
    assert.deepEqual(rows().filter(r=>!r.rewound_at).map(r=>r.status).sort(),['kept','lapsed']);
    const detail=(await w.call('/api/play/relationship/'+w.a.id)).data;
    assert.equal(detail.threads.length,2);
  }finally{await w.close();}
});

test('a long talk keeps a running summary and uses it once old lines leave the window',async()=>{
  const w=await world({respond:r=>isSummary(r)?{title:'Hosszú',summary:'Sokat beszéltek.',level_delta:0}:r.system.includes('"memo"')?{...reply,memo:'Eddig a nyaralásról beszéltek.'}:reply,at:'2026-11-12T10:00:00'});
  try{
    let conv=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Mesélj a nyaralásról!'})).data;
    for(let n=0;n<11;n++)conv=(await w.call('/api/play/talk',{conversation_id:conv.id,text:'És aztán? '+n})).data;
    assert.equal(conv.lines.length,24);
    const memo=JSON.parse(w.app.db.prepare('SELECT memo_json FROM play_conversations WHERE id=?').get(conv.id).memo_json);
    assert.equal(memo.text,'Eddig a nyaralásról beszéltek.');
    assert.match(w.requests.at(-1).user,/A BESZÉLGETÉS KORÁBBI RÉSZE \(összefoglaló\): Eddig a nyaralásról beszéltek\./);
    // Place and time sit at the end of the user message, not in the cached system message.
    assert.doesNotMatch(w.requests.at(-1).system,/Kávézó/);assert.match(w.requests.at(-1).user,/HOL ÉS MIKOR: itt: /);
  }finally{await w.close();}
});

test('a friendly character may invite Palor; Palor answers on the phone and he remembers it',async()=>{
  let cafeId=null;
  const w=await world({respond:r=>isGm(r)?{events:[]}:isAgent(r)?{intention:'Vár valakit.',location_id:cafeId,wants_to_meet:[],message_to_palor:null,invite_palor:{location_id:cafeId,slot:'este',text:'Gyere át este a kávézóba!'}}:reply,at:'2026-11-12T10:00:00'});
  try{
    cafeId=w.cafe.id;
    // Not close enough yet: the prompt does not even offer it.
    await w.call('/api/world-engine/settings',{enabled:true,tempo:'lively'});
    await w.call('/api/world-engine/run',{});
    assert.doesNotMatch(w.requests.find(isAgent).system,/invite_palor/);
    assert.equal(w.app.db.prepare("SELECT count(*) n FROM play_appointments WHERE status='invited'").get().n,0);
    // Friendly: he invites Palor for this evening.
    await w.call('/api/world-engine/levels',{source_id:w.a.id,target_id:w.palor.id,level:2});
    w.setNow('2026-11-12T13:00:00');w.requests.length=0;
    await w.call('/api/world-engine/run',{});
    assert.match(w.requests.find(isAgent).system,/invite_palor/);
    const thread=(await w.call('/api/play/phone/'+w.a.id)).data.items;
    const invitation=thread.find(i=>i.invitation).invitation;
    assert.equal(thread.find(i=>i.invitation).text,'Gyere át este a kávézóba!');
    assert.deepEqual([invitation.day,invitation.slot,invitation.place,invitation.status,invitation.passed],['2026-11-12','este','Kávézó','invited',false]);
    const ok=(await w.call('/api/play/invitations/'+invitation.id,{accept:true})).data;assert.equal(ok.status,'accepted');
    assert.equal((await w.call('/api/play/invitations/'+invitation.id,{accept:false})).status,409,'answered once');
    assert.ok(w.app.db.prepare('SELECT 1 FROM play_dates WHERE appointment_id=?').get(invitation.id),'an accepted invitation is a date');
    assert.ok(w.app.db.prepare("SELECT 1 FROM character_memories WHERE character_id=? AND text LIKE 'Palor elfogadta a meghívásomat%'").get(w.a.id));
    // In the evening he is at the café, whatever his routine says.
    w.setNow('2026-11-12T19:00:00');
    assert.equal((await w.call('/api/play')).data.people.find(p=>p.id===w.a.id).location_id,w.cafe.id);
    // One waiting invitation at a time; an old one that passed cannot be accepted.
    w.app.db.prepare("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES('99999999-9999-4999-8999-999999999999',?,?,'2026-11-11','este','invited','2026-11-11T10:00:00Z')").run(w.a.id,w.cafe.id);
    assert.equal((await w.call('/api/play/invitations/99999999-9999-4999-8999-999999999999',{accept:true})).status,409);
  }finally{await w.close();}
});

test('a backup made before newer columns existed still restores (missing columns take their defaults)',async()=>{
  const w=await world({respond:quiet,at:'2026-11-12T10:00:00'});
  try{
    const conv=(await w.call('/api/play/talk',{character_id:w.a.id,channel:'in_person',text:'Szia!'})).data;
    await w.call(`/api/play/conversations/${conv.id}/end`,{});
    const backup=(await w.call('/api/export')).data;
    for(const row of backup.play_conversations){delete row.mode;delete row.memo_json;delete row.participants_json;}
    for(const row of backup.world_usage)delete row.cached_tokens;
    delete backup.world_threads;delete backup.play_invitations;
    // Restore goes into an empty catalogue (a separate data folder).
    const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-audit-restore-'));await fs.mkdir(path.join(base,'media'));
    const fresh=await createApp({root:path.join(base,'media'),dataDir:path.join(base,'data'),mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(quiet)});
    await new Promise(r=>fresh.server.listen(0,'127.0.0.1',r));
    try{
      const res=await fetch('http://127.0.0.1:'+fresh.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});
      assert.equal(res.status,200,await res.text());
      assert.equal(fresh.db.prepare('SELECT mode FROM play_conversations WHERE id=?').get(conv.id).mode,'normal');
    }finally{await new Promise(r=>fresh.server.close(r));fresh.db.close();await fs.rm(base,{recursive:true,force:true});}
  }finally{await w.close();}
});
