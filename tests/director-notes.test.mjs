// Owner's corrections during play (2026-11-15): a note written in the play screen applies at once
// to the character's next reply, can be withdrawn, and follows the character policy.
// Synthetic characters and places only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('director notes: saved, used in the next reply, withdrawn, policy-checked',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-notes-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(dataDir,{recursive:true});
  await fs.writeFile(path.join(dataDir,'character-policy.json'),JSON.stringify({reject_female_characters:true}));
  const requests=[];
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(req=>{requests.push(req);return {reply:'Szia, Géza!'};}),worldClock:()=>new Date('2026-11-10T09:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,method)=>{const r=await fetch(origin+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Hétköznap munka.')},history:[],proposals:[]}));
  const work=(await call('/api/locations',{name:'Műhely',kind:'tag'})).data;
  await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-work',name:'Műhely',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-work'});

  // Saved and listed.
  const note='Sosem szólítja doktor úrnak, hanem valamiért mindig Gézának hívja.';
  let r=await call('/api/play/notes',{character_id:a.id,text:note});
  assert.equal(r.status,200);assert.deepEqual(r.data.notes.map(n=>n.text),[note]);
  assert.deepEqual((await call('/api/play/notes/'+a.id)).data.notes.map(n=>n.text),[note]);

  // At once in the very next reply's prompt, marked as the owner's correction that wins.
  await call('/api/play/talk',{character_id:a.id,text:'Szia!'});
  const prompt=requests.at(-1).user;
  assert.ok(prompt.includes('AZ ALKOTÓ JAVÍTÁSAI'));assert.ok(prompt.includes(note));

  // Empty, too long and unknown are refused; a female correction is refused by the policy.
  assert.equal((await call('/api/play/notes',{character_id:a.id,text:'  '})).status,400);
  assert.equal((await call('/api/play/notes',{character_id:a.id,text:'x'.repeat(601)})).status,400);
  assert.equal((await call('/api/play/notes',{character_id:'00000000-0000-4000-8000-000000000000',text:'x'})).status,404);
  assert.equal((await call('/api/play/notes',{character_id:a.id,text:'Nem: nő.'})).status,400);

  // Withdrawn: gone from the list and from the next prompt.
  const id=(await call('/api/play/notes/'+a.id)).data.notes[0].id;
  r=await call('/api/play/notes/'+id,undefined,'DELETE');
  assert.equal(r.status,200);assert.deepEqual(r.data.notes,[]);
  const conv=app.db.prepare("SELECT id FROM play_conversations WHERE status='open' LIMIT 1").get();
  await call('/api/play/talk',{conversation_id:conv.id,text:'Hogy vagy?'});
  assert.ok(!requests.at(-1).user.includes(note));

  // Waiting with a talk still open saves it first instead of refusing (2026-11-15).
  const wait=await call('/api/play/wait',{until:'next_slot'});
  assert.equal(wait.status,200);
  assert.equal(app.db.prepare("SELECT count(*) n FROM play_conversations WHERE status='open'").get().n,0);
  assert.equal(app.db.prepare('SELECT status FROM play_conversations WHERE id=?').get(conv.id).status,'closed');
});
