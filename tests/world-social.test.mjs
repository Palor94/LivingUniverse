import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {installWorldSocial,MAX_TOLD,REFLECT_AFTER} from '../app/world-social.mjs';

// Synthetic world: four men, events and memories in a minimal schema.
function world(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE world_events(id TEXT PRIMARY KEY,world_day TEXT,kind TEXT,status TEXT,title TEXT,summary TEXT,payload_json TEXT,created_at TEXT,rewound_at TEXT);
    CREATE TABLE character_memories(id TEXT PRIMARY KEY,character_id TEXT,text TEXT,status TEXT,created_at TEXT,reason TEXT)`);
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
  let tick=0;const now=()=>new Date(Date.UTC(2026,10,12,10,0,tick++));
  const remember=(cid,text,eventId)=>run('INSERT INTO character_memories VALUES(?,?,?,?,?,?)',randomUUID(),cid,text,'approved',now().toISOString(),'Világmotor esemény '+eventId);
  const ids={};for(const n of ['Palor','Ádám','Béla','Csaba','Dénes']){ids[n]=randomUUID();run('INSERT INTO characters VALUES(?,?)',ids[n],n);}
  const event=(title,people,{day='2026-11-12',intimate=false,status='applied'}={})=>{const id=randomUUID();run('INSERT INTO world_events VALUES(?,?,?,?,?,?,?,?,NULL)',id,day,'meeting',status,title,title+' (összefoglaló)',JSON.stringify({character_ids:people.map(p=>ids[p]),intimate}),now().toISOString());return id;};
  const social=installWorldSocial({db,one,all,run,remember,now});
  return {db,one,all,run,ids,event,social,remember,now};
}

test('news travels only through meetings, one thing per direction, never intimate scenes, never to Palor',()=>{
  const w=world();
  w.event('Ádám új munkát kapott',['Ádám']);
  w.event('Ádám és Palor intim estéje',['Ádám','Palor'],{intimate:true});
  w.event('Régi ügy',['Ádám'],{day:'2026-10-01'});
  w.event('Visszautasított',['Ádám'],{status:'refused'});
  // Béla has heard nothing yet; Csaba never meets anyone.
  const meet=w.event('Ádám és Béla kávéznak',['Ádám','Béla']);
  const told=w.social.spread([{id:meet,character_ids:[w.ids.Ádám,w.ids.Béla]}],'2026-11-12',{palorId:w.ids.Palor});
  assert.equal(told.length,1,'Béla knew nothing Ádám had not seen; Ádám hears nothing back');
  assert.equal(told[0].to,w.ids.Béla);
  const heard=w.all('SELECT text FROM character_memories WHERE character_id=?',w.ids.Béla).map(r=>r.text);
  assert.equal(heard.length,1);assert.match(heard[0],/^Ádám mesélte \(2026-11-12\): Ádám új munkát kapott/);
  assert.ok(!heard.some(t=>/intim|Régi|Visszautasított/.test(t)));
  assert.equal(w.all('SELECT 1 FROM character_memories WHERE character_id=?',w.ids.Csaba).length,0,'no meeting, no news');
  // The same fact is not told twice; Béla passes it on to Dénes in a later meeting.
  const again=w.event('Ádám és Béla újra',['Ádám','Béla']);
  assert.equal(w.social.spread([{id:again,character_ids:[w.ids.Ádám,w.ids.Béla]}],'2026-11-12').filter(t=>t.to===w.ids.Béla).length,0);
  const chain=w.event('Béla és Dénes',['Béla','Dénes']);
  const second=w.social.spread([{id:chain,character_ids:[w.ids.Béla,w.ids.Dénes,w.ids.Palor]}],'2026-11-12',{palorId:w.ids.Palor});
  assert.ok(second.some(t=>t.to===w.ids.Dénes&&t.from===w.ids.Béla));
  assert.ok(!second.some(t=>t.to===w.ids.Palor),'Palor learns only by playing');
  // A cap per round.
  const many=Array.from({length:6},(_,i)=>w.event('Ügy '+i,['Csaba']));void many;
  const crowd=w.event('Nagy találkozó',['Csaba','Ádám','Béla','Dénes']);
  assert.ok(w.social.spread([{id:crowd,character_ids:['Csaba','Ádám','Béla','Dénes'].map(n=>w.ids[n])}],'2026-11-12').length<=MAX_TOLD);
  // Rewind undoes what was heard after the save point, and undo restores it.
  const before=w.all('SELECT count(*) n FROM world_knowledge WHERE rewound_at IS NULL')[0].n;
  const r=w.social.rewindAfter('2000-01-01T00:00:00.000Z',w.now().toISOString());
  assert.equal(w.all('SELECT count(*) n FROM world_knowledge WHERE rewound_at IS NULL')[0].n,0);
  w.social.undoRewind(r);assert.equal(w.all('SELECT count(*) n FROM world_knowledge WHERE rewound_at IS NULL')[0].n,before);
});

test('reflection: only after enough new memories, beliefs about known people resting on real memories, no retry of a failed call',async()=>{
  const w=world(),calls=[];
  const cast=[{id:w.ids.Ádám,name:'Ádám'},{id:w.ids.Béla,name:'Béla'}];
  const people=()=>w.all('SELECT id,name FROM characters');
  for(let i=0;i<REFLECT_AFTER-1;i++)w.remember(w.ids.Ádám,`Palor ${i}. alkalommal is eljött, ahogy ígérte.`,'e'+i);
  let answer={beliefs:[{about:'Palor',text:'Palor megtartja a szavát.',memories:[1,2,99]},{about:'Kitalált Ember',text:'x',memories:[1]},{about:'Ádám',text:'Magáról',memories:[1]},{about:'Béla',text:'Nincs alapja',memories:[]}]};
  const ask=async(system,user)=>{calls.push({system,user});if(answer instanceof Error)throw answer;return answer;};
  assert.deepEqual(await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people}),[]);assert.equal(calls.length,0,'not enough new memories yet');
  w.remember(w.ids.Ádám,'Palor segített a költözésben.','e9');
  const written=await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people});
  assert.equal(calls.length,1);assert.match(calls[0].user,/1\. Palor 0\. alkalommal/);assert.match(calls[0].system,/tévedhet/);
  assert.deepEqual(written.map(b=>b.about),['Palor'],'unknown people, himself and beliefs without memories are dropped');
  const row=w.one('SELECT * FROM world_beliefs WHERE text<>?','');assert.equal(JSON.parse(row.memory_ids_json).length,2);
  assert.deepEqual(w.social.beliefsFor(w.ids.Ádám).map(b=>b.text),['Palor megtartja a szavát.']);
  assert.equal(w.social.overview().beliefs[0].memory_count,2);
  // No new memories since: no new call.
  await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people});assert.equal(calls.length,1);
  // A failed call leaves an empty marker: the same memories are not paid for again.
  for(let i=0;i<REFLECT_AFTER;i++)w.remember(w.ids.Béla,'Ádám ma is panaszkodott '+i,'b'+i);
  answer=Object.assign(Error('timeout'),{code:'AI_UNCERTAIN'});
  assert.deepEqual(await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people}),[]);assert.equal(calls.length,2);
  await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people});assert.equal(calls.length,2,'no automatic retry');
  assert.deepEqual(w.social.beliefsFor(w.ids.Béla),[],'the marker is not a belief');
  // A reached cap stops before anything was spent and is passed on.
  for(let i=0;i<REFLECT_AFTER;i++)w.remember(w.ids.Béla,'Új emlék '+i,'c'+i);
  await assert.rejects(w.social.reflect(cast,'2026-11-12',{ask:async()=>{throw Object.assign(Error('cap'),{code:'CAP_REACHED'});},model:'mock',people}),/cap/);
});

test('E8 reflection: due by weight of the new memories; how he sees himself is kept apart from opinions',async()=>{
  const w=world();
  w.db.exec('CREATE TABLE memory_salience(memory_id TEXT PRIMARY KEY,importance INTEGER NOT NULL DEFAULT 3,recall_count INTEGER NOT NULL DEFAULT 0,last_recalled_day TEXT)');
  const cast=[{id:w.ids.Ádám,name:'Ádám'},{id:w.ids.Béla,name:'Béla'}],people=()=>w.all('SELECT id,name FROM characters');
  const weighted=(cid,text,imp)=>{w.remember(cid,text,'x');const id=w.one('SELECT id FROM character_memories ORDER BY rowid DESC LIMIT 1').id;w.run('INSERT INTO memory_salience(memory_id,importance) VALUES(?,?)',id,imp);};
  // Five turning points are enough; ten small things are not.
  for(let i=0;i<5;i++)weighted(w.ids.Ádám,`Fordulópont ${i}: Palor cserben hagyta.`,5);
  for(let i=0;i<10;i++)weighted(w.ids.Béla,`Apróság ${i}.`,1);
  assert.deepEqual(w.social.due(cast).map(c=>c.name),['Ádám']);
  const calls=[];
  const ask=async(system,user)=>{calls.push({system,user});return {beliefs:[{about:'Palor',text:'Palorra nem lehet számítani.',memories:[1,2]}],self:{text:'Túl naiv voltam, óvatosabb leszek.',memories:[3,4]}};};
  await w.social.reflect(cast,'2026-11-12',{ask,model:'mock',people});
  assert.match(calls[0].system,/legfontosabb kérdés az életében/);assert.match(calls[0].system,/"self"/);
  assert.deepEqual(w.social.beliefsFor(w.ids.Ádám).map(b=>b.text),['Palorra nem lehet számítani.'],'his self-view is not an opinion about someone');
  assert.equal(w.social.selfView(w.ids.Ádám).text,'Túl naiv voltam, óvatosabb leszek.');
  // A self-view without memories behind it is dropped.
  for(let i=0;i<5;i++)weighted(w.ids.Ádám,`Újabb fordulópont ${i}.`,5);
  await w.social.reflect(cast,'2026-11-13',{ask:async()=>({beliefs:[],self:{text:'Alaptalan.',memories:[]}}),model:'mock',people});
  assert.equal(w.social.selfView(w.ids.Ádám).text,'Túl naiv voltam, óvatosabb leszek.');
  // Rewind takes it back with the other beliefs.
  const r=w.social.rewindAfter('2026-11-12T00:00:00Z','2026-11-14T00:00:00Z');assert.equal(w.social.selfView(w.ids.Ádám),null);
  w.social.undoRewind(r);assert.ok(w.social.selfView(w.ids.Ádám));
});
