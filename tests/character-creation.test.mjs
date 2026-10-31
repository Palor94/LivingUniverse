import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {maleNameCandidates,nameCandidates,normalizeName,suggestMaleName,migrateCharacterRace} from '../app/character-creation.mjs';
import {bindNameSuggestion,races} from '../app/public/character-options.js';
import {installEnhancements} from '../app/public/enhancements.js';

test('profile race selector saves on change and supplies its saved value for conflict detection',async()=>{
  class Select extends EventTarget{tagName='SELECT';name='race';value='orc';dataset={};}
  const select=new Select(),form={insertAdjacentHTML(){}},status={},calls=[],c={id:'test',race:'orc',relationships:[]};
  const ui=installEnhancements({$:s=>s==='#profile-form'?form:s==='#save-status'?status:null,$$:(s,f)=>{assert.equal(s,'input,textarea,select');assert.equal(f,form);return [select];},api:async(route,body)=>{calls.push({route,body});return {};},getState:()=>({characters:[c]}),toast(){}});
  ui.profile(c);assert.equal(select.dataset.saved,'orc');select.value='dwarf';select.dispatchEvent(new Event('change'));await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,[{route:'/api/characters/test/profile-field',body:{field:'race',value:'dwarf',expected:'orc'}}]);assert.equal(select.dataset.saved,'dwarf');assert.equal(c.race,'dwarf');assert.equal(status.textContent,'Saved automatically');
});

test('suggestions normalize accents, case, Unicode composition and whitespace; handle session reuse and exhaustion',()=>{
  const candidates=['Adam Archer','Bence Varga','Peter Reed'];
  assert.equal(normalizeName('  PÉTER  REED '),normalizeName('Pe\u0301ter Reed'));
  assert.equal(suggestMaleName([' ÁDÁM  ARCHER '],['Bence Varga'],candidates,()=>0).name,'Peter Reed');
  const recycled=suggestMaleName([],['Adam Archer','Bence Varga','Peter Reed'],candidates,()=>0);assert.equal(recycled.name,'Adam Archer');assert.equal(recycled.recycled,true);
  assert.equal(suggestMaleName(candidates,[],candidates).name,null);
  assert.equal(suggestMaleName([],['Adam Archer'],['Adam Archer']).name,null);
  assert.throws(()=>suggestMaleName([],['x'.repeat(201)]),/previous name/);
});

test('Human uses Hungarian male given names; every fantasy race has its own examples and sound patterns',()=>{
  const examples={orc:['Grommash','Throm-Ka','Azog','Krag','Durgash','Zog'],goblin:['Zzig','Grix','Snikt','Skazz','Vob','Zzap'],troll:['Brog','Grok','Thrum','Zulg','Gorgo'],minotaur:['Asterius','Taurus','Morgoth'],centaur:['Chiron','Nessus','Pholos','Kratos','Strom'],satyr_faun:['Pan','Faunus','Satyrion','Crotus','Silenus'],werewolf:['Fenrir','Boris','Varg','Garou','Lycaon'],lizardfolk_dragonborn:['Sssar','Drako','Kressh','Shisss','Vrakh'],dwarf:['Thorin','Balin','Durin','Gromi','Thrain'],ogre:['Goliath','Grog','Ymir','Blunder','Oglok'],bearfolk_bullfolk:['Ursus','Biorn','Toruk','Karr']};
  assert.equal(nameCandidates(),maleNameCandidates);for(const name of ['Ádám','Bálint','Bence','Gábor','Kristóf','László','Máté','Péter','Zoltán'])assert.ok(nameCandidates('human').includes(name));assert.ok(nameCandidates('human').every(n=>!/[\s\d]/u.test(n)));
  for(const [race] of races){const pool=nameCandidates(race);assert.equal(new Set(pool.map(normalizeName)).size,pool.length,race);if(race==='human')continue;assert.ok(pool.length>100,race);for(const example of examples[race])assert.ok(pool.includes(example),race+': '+example);assert.ok(pool.every(n=>!/[\s\d]/u.test(n)));assert.equal(suggestMaleName(pool,[],pool).exhausted,true);}
  assert.throws(()=>nameCandidates('unknown'),/Choose a race/);
});

test('changing race immediately requests a matching name and only the latest selection can update the form',async()=>{
  class Field extends EventTarget{value='';isConnected=true;}
  const input=new Field(),raceInput=new Field(),button={disabled:false,isConnected:true},createButton={disabled:false},status={isConnected:true},pending=[];raceInput.value='human';
  bindNameSuggestion({input,raceInput,button,status,createButton,api:(route,body)=>new Promise((resolve,reject)=>pending.push({body,resolve,reject}))});
  const human=button.onclick();pending[0].resolve({name:'Bálint',message:'Suggested'});await human;assert.equal(input.value,'Bálint');
  raceInput.value='orc';raceInput.dispatchEvent(new Event('change'));assert.equal(pending.length,2);assert.equal(pending[1].body.race,'orc');assert.equal(button.disabled,true);
  raceInput.value='goblin';raceInput.dispatchEvent(new Event('change'));assert.equal(pending.length,3);assert.equal(pending[2].body.race,'goblin');
  pending[1].resolve({name:'Grommash',message:'Old request'});await new Promise(r=>setImmediate(r));assert.equal(input.value,'Bálint');assert.equal(button.disabled,true);assert.equal(createButton.disabled,true);
  pending[2].resolve({name:'Snikt',message:'Suggested'});await new Promise(r=>setImmediate(r));assert.equal(input.value,'Snikt');assert.equal(button.disabled,false);
  raceInput.value='human';raceInput.dispatchEvent(new Event('change'));assert.equal(pending[3].body.race,'human');pending[3].resolve({name:'Gábor',message:'Suggested'});await new Promise(r=>setImmediate(r));assert.equal(input.value,'Gábor');
  raceInput.value='troll';raceInput.dispatchEvent(new Event('change'));raceInput.value='human';raceInput.dispatchEvent(new Event('change'));pending[5].resolve({name:'Ádám',message:'Suggested'});await new Promise(r=>setImmediate(r));pending[4].reject(Error('Old failure'));await new Promise(r=>setImmediate(r));assert.equal(input.value,'Ádám');assert.equal(status.textContent,'Suggested');assert.equal(createButton.disabled,false);
  raceInput.value='dwarf';raceInput.dispatchEvent(new Event('change'));input.value='My own name';input.dispatchEvent(new Event('input'));pending[6].resolve({name:'Thorin',message:'Suggested'});await new Promise(r=>setImmediate(r));assert.equal(input.value,'My own name');assert.match(status.textContent,/manual edit/);
});

test('name button replaces repeated suggestions, preserves pending manual edits and recovers from errors without creating',async()=>{
  class Input extends EventTarget{value='';isConnected=true;}
  const input=new Input(),button={disabled:false,isConnected:true},createButton={disabled:false},status={isConnected:true};let response={name:'Adam Archer',message:'Suggested'},release,wait=false,fail=false;const calls=[];
  bindNameSuggestion({input,button,status,createButton,api:async(route,body)=>{calls.push({route,body});if(wait)await new Promise(r=>release=r);if(fail)throw Error('Unavailable');return response;}});
  await button.onclick();assert.equal(input.value,'Adam Archer');response={name:'Peter Reed',message:'Suggested'};await button.onclick();assert.equal(input.value,'Peter Reed');assert.deepEqual(calls[1].body.exclude,['Adam Archer','Adam Archer']);
  wait=true;const pending=button.onclick();assert.equal(createButton.disabled,true);input.value='My own name';input.dispatchEvent(new Event('input'));release();await pending;assert.equal(input.value,'My own name');assert.match(status.textContent,/manual edit/);
  wait=false;fail=true;await button.onclick();assert.equal(status.textContent,'Unavailable');assert.equal(button.disabled,false);assert.equal(createButton.disabled,false);
  fail=false;response={name:null,message:'Enter a name manually.'};await button.onclick();assert.equal(input.value,'My own name');assert.match(status.textContent,/manually/);assert.ok(calls.every(c=>c.route==='/api/character-name-suggestion'));
});

test('legacy database migration defaults to Human and makes a verified, unchanged pre-migration backup',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-race-migration-'));let db;
  try{
    db=new DatabaseSync(path.join(temp,'universe.sqlite'));db.exec("CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT,biography TEXT);INSERT INTO characters VALUES('old','Existing','Keep biography');");
    await migrateCharacterRace(db,temp);assert.equal(db.prepare('SELECT race FROM characters').get().race,'human');await migrateCharacterRace(db,temp);
    const files=await fs.readdir(path.join(temp,'backups'));assert.equal(files.length,1);const copy=new DatabaseSync(path.join(temp,'backups',files[0]),{readOnly:true});try{assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('SELECT biography FROM characters').get().biography,'Keep biography');assert.ok(!copy.prepare('PRAGMA table_info(characters)').all().some(c=>c.name==='race'));}finally{copy.close();}
  }finally{db?.close();await fs.rm(temp,{recursive:true,force:true});}
});

test('database-backed suggestions, race create/read/edit, conflict protection, restart, MCP and old/new restore',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-character-create-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(name){app=await createApp({root,dataDir:path.join(temp,name),mobile:{enabled:false},mcpWrites:null,characterPolicy:{reject_female_characters:true}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method=body?'POST':'GET'){const response=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
  try{
    await start('data');
    // Reserve all but two names directly in the real test database, including an accent/case variant.
    const insert=app.db.prepare('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)');for(const [i,name] of maleNameCandidates.slice(0,-2).entries())insert.run('reserved-'+i,i===0?'  '+name.normalize('NFD').toUpperCase()+'  ':name,'Nem: férfi.',new Date().toISOString());
    const count=app.db.prepare('SELECT COUNT(*) n FROM characters').get().n;
    const a=(await request('/api/character-name-suggestion',{exclude:[]})).data,b=(await request('/api/character-name-suggestion',{exclude:[a.name]})).data;assert.notEqual(a.name,b.name);assert.ok(maleNameCandidates.slice(-2).includes(a.name));assert.ok(maleNameCandidates.slice(-2).includes(b.name));assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,count);
    const c=(await request('/api/characters',{name:a.name,gender:'férfi',race:'orc'})).data;assert.equal(c.race,'orc');assert.equal((await request('/api/character-name-suggestion',{exclude:[]})).data.name,b.name);
    assert.equal((await request('/api/characters',{name:b.name,gender:'férfi'})).data.race,'human');assert.equal((await request('/api/character-name-suggestion',{exclude:[]})).data.exhausted,true);
    for(const [race] of races.filter(([key])=>key!=='human')){const first=(await request('/api/character-name-suggestion',{race,exclude:[]})).data,second=(await request('/api/character-name-suggestion',{race,exclude:[first.name]})).data;assert.ok(nameCandidates(race).includes(first.name),race);assert.ok(nameCandidates(race).includes(second.name),race);assert.notEqual(first.name,second.name,race);}
    assert.equal((await request('/api/character-name-suggestion',{race:'unknown',exclude:[]})).status,400);
    // An occupied fantasy name is excluded even if its character is saved under another race.
    insert.run('occupied-orc','  GRÓMMASH  ','Nem: férfi.',new Date().toISOString());const orcPool=nameCandidates('orc');const remainingOrc=(await request('/api/character-name-suggestion',{race:'orc',exclude:orcPool.filter(n=>n!=='Grommash'&&n!=='Krag')})).data;assert.equal(remainingOrc.name,'Krag');
    assert.equal((await request('/api/characters',{name:'Invalid race',gender:'férfi',race:'elf'})).status,400);
    for(const [race] of races){assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'race',value:race,expected:(await request('/api/characters/'+c.id)).data.race})).status,200);assert.equal((await request('/api/characters/'+c.id)).data.race,race);}
    assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'race',value:'troll',expected:'human'})).status,409);
    assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'race',value:'elf'})).status,400);
    const saved=(await request('/api/characters/'+c.id)).data;
    assert.equal((await request('/api/characters/'+c.id,{...saved,race:'dwarf',biography:'Nem: férfi.\nKeep biography',expected:{race:saved.race}},'PUT')).status,200);
    assert.equal((await request('/api/characters/'+c.id,{...saved,race:'ogre',expected:{race:saved.race}},'PUT')).status,409);
    const oldClient={...(await request('/api/characters/'+c.id)).data};delete oldClient.race;assert.equal((await request('/api/characters/'+c.id,oldClient,'PUT')).status,200);assert.equal((await request('/api/characters/'+c.id)).data.race,'dwarf');
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);const exported=(await request('/api/export')).data;
    await app.close();app=null;await start('data');assert.equal((await request('/api/characters/'+c.id)).data.race,'dwarf');assert.equal((await request('/api/state')).data.characters.find(x=>x.id===c.id).race,'dwarf');
    const catalogue=await createCatalogue({database:path.join(temp,'data','universe.sqlite'),mediaRoot:root});try{assert.equal((await catalogue.call('get_character',{character_id:c.id})).data.race,'dwarf');}finally{catalogue.close();}
    await app.close();app=null;await start('restored');assert.equal((await request('/api/restore',exported)).status,200);assert.equal((await request('/api/characters/'+c.id)).data.race,'dwarf');
    await app.close();app=null;await start('legacy');for(const row of exported.characters)delete row.race;assert.equal((await request('/api/restore',exported)).status,200);const legacy=(await request('/api/characters/'+c.id)).data;assert.equal(legacy.race,'human');assert.equal(legacy.biography,'Nem: férfi.\nKeep biography');assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
