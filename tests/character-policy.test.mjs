import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {installCharacterPolicy,identityHash,genderClass} from '../app/character-policy.mjs';
import {buildProfileGenerationPackage} from '../app/public/ghost-profile.js';
test('policy guards raw inserts, updates, imports and stored gender proposals',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE characters(id TEXT,name TEXT,aliases TEXT,biography TEXT,appearance TEXT);CREATE TABLE application_settings(key TEXT,value TEXT)');
 const one=(sql,...args)=>db.prepare(sql).get(...args);
 const p=installCharacterPolicy({db,one,config:{reject_female_characters:true,blocked_identity_hashes:[identityHash('Deleted Person')]}});
 try{
  const insert=db.prepare('INSERT INTO characters VALUES(?,?,?,?,?)');
  assert.throws(()=>insert.run('1','A','','Nem: nő.',''),/női karakter/);
  assert.throws(()=>insert.run('1','A','','',''),/női karakter/);
  assert.throws(()=>insert.run('1','Deleted Person','','Nem: férfi.',''),/női karakter/);
  insert.run('1','A','','Nem: férfi.','');
  assert.throws(()=>db.prepare("UPDATE characters SET biography='Nem: female.'").run(),/női karakter/);
  assert.throws(()=>db.prepare('INSERT INTO application_settings VALUES(?,?)').run('ghost:character:1',JSON.stringify({values:{gender:{value:'Nő.'}}})),/női karakter/);
  p.assertGeneration('1');p.assertValues({personality:{value:'Kedves.'}},'1',{requireKnown:true});
  assert.throws(()=>p.assertValues({gender:{value:'Nő.'}},'1',{requireKnown:true}),/női karakter/);
  assert.throws(()=>p.assertPrompt('A man and a woman in a cafe'),/női karakter/);
  assert.equal(genderClass('[Kánon] Férfi. [Hipotézis] apaként él.'),'non_female');
 }finally{db.close();}
});
test('desktop creation enforces policy and generation packages carry it',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-policy-'));
 const root=path.join(temp,'root');await fs.mkdir(root);
 const app=await createApp({root,dataDir:path.join(temp,'data'),characterPolicy:{reject_female_characters:true}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 async function create(body){const res=await fetch(base+'/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
 try{
  assert.equal((await create({name:'Woman',gender:'nő'})).status,400);
  assert.equal((await create({name:'Unknown'})).status,400);
  const c=await create({name:'Male',gender:'férfi'});assert.equal(c.status,201);
  const g=await (await fetch(base+'/api/characters/'+c.data.id+'/ghost')).json();
  assert.equal(g.template.character_policy.reject_female_characters,true);
  assert.throws(()=>buildProfileGenerationPackage(c.data,g),/női karakter/);
  g.values.gender={value:'Férfi.'};const pkg=buildProfileGenerationPackage(c.data,g);assert.match(pkg.instructions,/nem hozhat létre/);
 }finally{await app.close();await fs.rm(temp,{recursive:true,force:true});}
});
