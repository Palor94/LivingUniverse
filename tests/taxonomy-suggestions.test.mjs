import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {visualVersion} from '../app/public/image-hash.js';

async function fixture(fn){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dataDir){app=await createApp({root,dataDir,duplicateAvailability:async()=> 'local'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  await start(path.join(temp,'data'));try{await fn({app:()=>app,root,temp,call,request,restart:async()=>{await app.close();await start(path.join(temp,'restored'));}});}finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('structured groups, additive bulk labels, explicit text migration, filtering, and backups preserve legacy data and canon',()=>fixture(async({root,call,request,restart})=>{
  await fs.writeFile(path.join(root,'one.png'),'original');await fs.writeFile(path.join(root,'two.png'),'original two');await call('/api/scan',{});const items=(await call('/api/media')).items,ids=items.map(m=>m.id),c=await call('/api/characters',{name:'Péter'});
  for(const id of ids)await call('/api/media/'+id,{character_ids:[c.id],tags:'Mosolygó, FULL BODY',notes:'Original note'},'PUT');const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Original canon',references:[{media_id:ids[0],role:'body'}]});
  const vocab=await call('/api/taxonomy');assert.equal(vocab.groups.length,9);const expression=vocab.groups.find(g=>g.id==='group-expression');const group=await call('/api/taxonomy/groups',{name:'Saját csoport'}),tag=await call('/api/taxonomy/tags',{group_id:group.id,name:'Rövidnadrág'});
  assert.equal((await request('/api/taxonomy/tags',{group_id:group.id,name:'RÖVIDNADRÁG'})).status,409);
  const smile=await call('/api/taxonomy/tags',{group_id:expression.id,name:'Mosolygó'});assert.equal((await call('/api/taxonomy/apply',{operation:'add',media_ids:ids,tag_ids:[tag.id]})).updated,2);assert.equal((await call('/api/taxonomy/apply',{operation:'add',media_ids:ids,tag_ids:[tag.id]})).updated,0);
  const preview=await call('/api/taxonomy/migrate',{source:'mosolygó',tag_id:smile.id});assert.equal(preview.matched,2);assert.equal((await call('/api/media/'+ids[0])).structured_tags.length,1);
  assert.equal((await request('/api/taxonomy/migrate',{source:'mosolygó',tag_id:smile.id,confirm:true,expected_count:5})).status,409);
  await call('/api/taxonomy/migrate',{source:'mosolygó',tag_id:smile.id,confirm:true,expected_count:2});assert.equal((await call('/api/media/'+ids[0])).structured_tags.length,2);assert.equal((await call('/api/media?structured_tag='+smile.id)).total,2);assert.equal((await call('/api/media?search=Rövidnadrág')).total,2);
  const old=await call('/api/media/'+ids[0]);assert.equal(old.tags,'Mosolygó, FULL BODY');assert.equal(old.notes,'Original note');assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
  await call('/api/taxonomy/tags',{id:tag.id,group_id:group.id,name:'Piros rövidnadrág'});assert.equal((await call('/api/media/'+ids[0])).structured_tags.find(t=>t.id===tag.id).name,'Piros rövidnadrág');
  assert.equal((await request('/api/taxonomy/apply',{operation:'add',media_ids:ids,tag_ids:[smile.id,'invalid']})).status,400);assert.equal((await call('/api/media/'+ids[1])).structured_tags.length,2);
  await call('/api/taxonomy/apply',{operation:'remove',media_ids:[ids[1]],tag_ids:[smile.id]});assert.equal((await call('/api/media/'+ids[1])).structured_tags.length,1);
  await call('/api/media/'+ids[0],{character_ids:[c.id],tags:old.tags,notes:old.notes,structured_tag_ids:[smile.id]},'PUT');assert.deepEqual((await call('/api/media/'+ids[0])).structured_tags.map(t=>t.id),[smile.id]);
  assert.equal((await request('/api/media/'+ids[0],{character_ids:[],tags:'changed',structured_tag_ids:['bad']},'PUT')).status,400);assert.equal((await call('/api/media/'+ids[0])).tags,old.tags);
  const backup=await call('/api/export');await restart();await call('/api/restore',backup);assert.deepEqual((await call('/api/taxonomy')).mappings,backup.legacy_tag_mappings);assert.equal((await call('/api/media?structured_tag='+smile.id)).total,1);assert.equal((await call('/api/media/'+ids[0])).notes,old.notes);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);assert.equal(await fs.readFile(path.join(root,'one.png'),'utf8'),'original');
}));

test('reference candidates use approved evidence only; feedback preserves assignments and blocks stale acceptance',()=>fixture(async({root,call,request,restart})=>{
  const names=['face.png','body.png','target.png','unapproved.png'];for(const [i,name] of names.entries())await fs.writeFile(path.join(root,name),'different bytes '+i);await call('/api/scan',{});const ids={};for(const m of (await call('/api/media')).items)ids[m.relative_path]=m.id;
  const peter=await call('/api/characters',{name:'Péter'}),palor=await call('/api/characters',{name:'Palor'}),other=await call('/api/characters',{name:'Unapproved person'});
  for(const name of ['face.png','body.png'])await call('/api/media/'+ids[name],{character_ids:[peter.id],tags:'original'},'PUT');await call('/api/media/'+ids['target.png'],{character_ids:[palor.id],tags:'scene',notes:'Keep target note'},'PUT');await call('/api/media/'+ids['unapproved.png'],{character_ids:[other.id],tags:'same pattern'},'PUT');
  const canon=await call('/api/characters/'+peter.id+'/canon',{appearance:'Protected',references:[{media_id:ids['face.png'],role:'face'},{media_id:ids['body.png'],role:'body'}]});
  assert.equal((await call('/api/suggestions/generate',{media_ids:[ids['target.png']]})).created,0);
  const hashed=await call('/api/duplicates/analyze',{ids:Object.values(ids)});for(const r of hashed.results)await call('/api/duplicates/visual',{id:r.id,...r.visual,hash:r.id===ids['body.png']?'0000000000000003':'0000000000000000',version:visualVersion,width:100,height:100});
  let generated=await call('/api/suggestions/generate',{media_ids:[ids['target.png']]});assert.equal(generated.created,1);assert.equal(generated.reference_characters,1);const s=(await call('/api/suggestions')).items[0];assert.equal(s.character_id,peter.id);assert.equal(s.canon_id,canon.id);assert.equal(s.stale,false);assert.equal(s.evidence.face_identity,null);assert.equal(s.evidence.body_proportions,null);assert.deepEqual(new Set(s.evidence.references.map(r=>r.role)),new Set(['face','body']));assert.equal((await call('/api/media/'+s.media_id)).characters.length,1);
  await call('/api/suggestions/feedback',{id:s.id,decision:'rejected',notes:'Body proportion wrong',face_verdict:'uncertain',body_verdict:'mismatch'});assert.equal((await call('/api/suggestions')).total,0);generated=await call('/api/suggestions/generate',{media_ids:[s.media_id]});assert.equal(generated.created,0);assert.equal((await call('/api/suggestions')).total,0);
  await call('/api/suggestions/feedback',{id:s.id,decision:'reopened'});await call('/api/suggestions/feedback',{id:s.id,decision:'accepted',notes:'This is Péter despite the rendering error',face_verdict:'matches',body_verdict:'mismatch'});
  const updated=await call('/api/media/'+s.media_id);assert.deepEqual(new Set(updated.characters.map(c=>c.id)),new Set([peter.id,palor.id]));assert.equal(updated.notes,'Keep target note');assert.equal(updated.tags,'scene');assert.equal(updated.categorization_complete,false);assert.equal((await call('/api/characters/'+peter.id)).canon.id,canon.id);
  const backup=await call('/api/export');await restart();await call('/api/restore',backup);assert.equal((await call('/api/suggestions?state=accepted')).items[0].feedback.length,3);
  await call('/api/characters/'+peter.id+'/canon',{appearance:'New explicit revision',references:[{media_id:ids['face.png'],role:'face'}]});assert.equal((await call('/api/suggestions?state=accepted')).items[0].stale,true);assert.equal((await request('/api/suggestions/feedback',{id:s.id,decision:'accepted'})).status,409);
  await fs.writeFile(path.join(root,'target.png'),'Changed outside app');assert.equal((await request('/api/suggestions/feedback',{id:s.id,decision:'reopened'})).status,409);
  assert.equal((await call('/api/suggestions/capabilities')).ai,false);assert.equal((await call('/api/suggestions/capabilities')).external_provider,null);
}));

test('new migrations roll back only their own labels and suggestions',async()=>{
  const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE media(id TEXT PRIMARY KEY); CREATE TABLE characters(id TEXT PRIMARY KEY); CREATE TABLE canon(id TEXT PRIMARY KEY); INSERT INTO media VALUES(\'stable\');');for(const name of ['005-structured-tags','006-sorting-suggestions'])db.exec(await fs.readFile(new URL('../app/migrations/'+name+'.up.sql',import.meta.url),'utf8'));for(const name of ['006-sorting-suggestions','005-structured-tags'])db.exec(await fs.readFile(new URL('../app/migrations/'+name+'.down.sql',import.meta.url),'utf8'));assert.equal(db.prepare('SELECT id FROM media').get().id,'stable');assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('sorting_suggestions','tag_groups','structured_tags','media_tags','legacy_tag_mappings','suggestion_feedback')").get().n,0);}finally{db.close();}
});

test('backups from before structured tagging still restore without requiring new tables',()=>fixture(async({root,call,restart})=>{
  await fs.writeFile(path.join(root,'legacy.png'),'legacy bytes');await call('/api/scan',{});const m=(await call('/api/media')).items[0];await call('/api/media/'+m.id,{character_ids:[],tags:'Régi címke',notes:'Original Hungarian note'},'PUT');
  const old=await call('/api/export');for(const table of ['tag_groups','structured_tags','media_tags','legacy_tag_mappings','sorting_suggestions','suggestion_feedback'])delete old[table];old.application_settings=old.application_settings.filter(s=>s.key!=='taxonomy_initialized');await restart();await call('/api/restore',old);assert.equal((await call('/api/media/'+m.id)).tags,'Régi címke');assert.equal((await call('/api/media/'+m.id)).notes,'Original Hungarian note');assert.equal((await call('/api/taxonomy')).groups.length,9);assert.equal((await call('/api/suggestions')).total,0);
}));
