import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createCharacterOrigin,COLLECTION_ORIGIN_POLICY} from '../app/character-origin.mjs';

const declared='owner_declared_fictional_ai';
async function fixture(t){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-origin-')),root=path.join(temp,'media');
  await fs.mkdir(root);
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT,biography TEXT,notes TEXT);
    CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT,size INTEGER,active INTEGER DEFAULT 1);
    CREATE VIEW active_media AS SELECT * FROM media WHERE active=1;
    CREATE TABLE depictions(media_id TEXT,character_id TEXT);
    CREATE TABLE canon(id TEXT,character_id TEXT,references_json TEXT);
    CREATE TABLE media_provenance(cache_key TEXT PRIMARY KEY,result TEXT,checked_at TEXT);
    CREATE TABLE application_settings(key TEXT,value TEXT);
    INSERT INTO characters VALUES('c','Fixture','Nem kitalált személy.','Old unreliable origin.');`);
  const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
  const origin=createCharacterOrigin({one,all,root,db});
  t.after(async()=>{db.close();await fs.rm(temp,{recursive:true,force:true});});
  async function media(id,relative_path=id+'.png',{bytes=Buffer.from('unverified fixture'),kind='image',active=1,exists=true}={}){
    if(exists){const file=path.join(root,relative_path);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
    db.prepare('INSERT INTO media VALUES(?,?,?,?,?)').run(id,relative_path,kind,bytes.length,active);
    db.prepare('INSERT INTO depictions VALUES(?,?)').run(id,'c');
    return id;
  }
  const approve=refs=>db.prepare('INSERT INTO canon VALUES(?,?,?)').run('revision','c',JSON.stringify(refs));
  return {temp,root,db,one,all,origin,media,approve};
}

test('owner declaration supersedes every legacy origin/cache result without rewriting history',async t=>{
  const f=await fixture(t);
  for(const [id,old,bytes] of [
    ['camera','camera','Apple\0iPhone'],['missing-proof','no_proof','no metadata'],
    ['invalid','ai_edit_of_input_image','c2pa jumb trainedAlgorithmicMedia c2pa.ingredient broken'],
    ['old-generated','generated_from_text','c2pa jumb trainedAlgorithmicMedia'],
  ]){
    await f.media(id,id+'.png',{bytes:Buffer.from(bytes)});
    const m=f.one('SELECT * FROM media WHERE id=?',id);
    f.db.prepare('INSERT INTO media_provenance VALUES(?,?,?)').run(id+':'+m.size+':'+m.relative_path,old,'historical');
  }
  const refs=f.all('SELECT id FROM media').map(m=>({media_id:m.id,role:'face'}));f.approve(refs);
  const before=f.all('SELECT * FROM media_provenance ORDER BY cache_key');
  assert.deepEqual(f.origin.referenceProofs('c'),{[declared]:4});
  assert.equal(f.origin.allowedReferences('c').length,4);
  const o=f.origin.originOf('c');assert.equal(o.origin,'invented');assert.equal(o.origin_basis,'owner_declaration');
  assert.equal(o.media_origin,'fictional_ai_generated');assert.equal(o.independently_verified,false);
  assert.deepEqual(o.origin_policy,COLLECTION_ORIGIN_POLICY);
  assert.equal(o.origin_policy.grants_reference_approval,false);
  assert.equal(o.origin_policy.grants_real_person_consent,false);
  assert.equal(o.origin_policy.grants_provider_permission,false);
  assert.deepEqual(f.all('SELECT * FROM media_provenance ORDER BY cache_key'),before);
  assert.deepEqual(JSON.parse(f.one('SELECT references_json FROM canon').references_json),refs);
  assert.equal(f.one('SELECT notes FROM characters').notes,'Old unreliable origin.');
});

test('new collection media has a declared origin but never becomes an approved reference automatically',async t=>{
  const f=await fixture(t);await f.media('new','nested/new.png');
  assert.equal(f.origin.proofOf('new'),declared);assert.equal(f.origin.originOf('c').origin,'invented');
  assert.deepEqual(f.origin.allowedReferences('c'),[]);assert.equal(f.origin.mayUseReferences('c'),false);
  assert.equal(f.origin.mayUseEverydayReferences('c'),false);assert.equal(f.one('SELECT count(*) n FROM canon').n,0);
  f.approve([{media_id:'new',role:'face'}]);assert.equal(f.origin.mayUseReferences('c'),true);
  f.db.prepare('DELETE FROM depictions').run();assert.equal(f.origin.mayUseReferences('c'),false);
});

test('approved reference IDs, distinct crops, roles and hashes survive origin filtering',async t=>{
  const f=await fixture(t);await f.media('shared');
  const refs=[{media_id:'shared',reference_id:'face-ref',role:'face',sha256:'a'.repeat(64),crop:{x:0,y:0,w:.4,h:.4}},
    {media_id:'shared',reference_id:'body-ref',role:'body',sha256:'a'.repeat(64),crop:{x:.4,y:.4,w:.6,h:.6}}];
  f.approve(refs);
  assert.deepEqual(f.origin.allowedReferences('c'),refs.map(r=>({...r,character_id:'c',revision_id:'revision',proof:declared})));
  assert.deepEqual(f.origin.everydayReferences('c'),f.origin.allowedReferences('c'));
});

test('outside paths, sibling prefixes, missing/removed files and non-media cannot receive the declaration',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.temp,'outside.png'),'c2pa jumb trainedAlgorithmicMedia');
  for(const [id,p,opts] of [
    ['traversal','../outside.png',{}],['absolute',path.join(f.temp,'outside.png'),{}],
    ['sibling','../media-extra/outside.png',{}],['root','.',{}],['drive','C:\\elsewhere\\input.png',{}],
    ['missing','gone.png',{}],['removed','removed.png',{active:0}],['not-media','code.mjs',{kind:'script'}],
  ]){
    await f.media(id,p,{...opts,exists:false});
    assert.notEqual(f.origin.proofOf(id),declared,id);
  }
  f.approve(f.all('SELECT id FROM media').map(m=>({media_id:m.id,role:'general'})));
  assert.equal(f.origin.originOf('c').origin,'not_stated');assert.equal(f.origin.intimateAllowed('c'),false);
  assert.deepEqual(f.origin.allowedReferences('c'),[]);
  assert.equal(createCharacterOrigin({one:f.one,all:f.all}).proofOf('absolute'),'missing');
});

test('directory junctions cannot extend the collection declaration to external files',async t=>{
  const f=await fixture(t),outside=path.join(f.temp,'outside');await fs.mkdir(outside);
  await fs.writeFile(path.join(outside,'input.png'),'fixture');
  try{await fs.symlink(outside,path.join(f.root,'linked'),process.platform==='win32'?'junction':'dir');}
  catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('Directory links are unavailable.');return;}throw e;}
  await f.media('linked','linked/input.png',{exists:false});f.approve([{media_id:'linked',role:'face'}]);
  assert.equal(f.origin.proofOf('linked'),'outside_collection');assert.equal(f.origin.mayUseReferences('c'),false);
});

test('restored and relocated files are evaluated again without stale missing/cache results',async t=>{
  const f=await fixture(t);await f.media('restored','restored.png',{exists:false});
  assert.equal(f.origin.proofOf('restored'),'missing');await fs.writeFile(path.join(f.root,'restored.png'),'fixture');
  assert.equal(f.origin.proofOf('restored'),declared);await fs.unlink(path.join(f.root,'restored.png'));
  assert.equal(f.origin.proofOf('restored'),'missing');
  await fs.writeFile(path.join(f.root,'moved.png'),'fixture');f.db.prepare('UPDATE media SET relative_path=? WHERE id=?').run('moved.png','restored');
  assert.equal(f.origin.proofOf('restored'),declared);
  f.db.prepare('UPDATE media SET relative_path=? WHERE id=?').run('../outside.png','restored');
  assert.equal(f.origin.proofOf('restored'),'outside_collection');
});

test('videos are declared media while legacy video canon is preserved and not offered as a still-image input',async t=>{
  const f=await fixture(t);await f.media('video','clip.mp4',{kind:'video'});
  const handle=await fs.open(path.join(f.root,'clip.mp4'),'r+');try{await handle.truncate(65*1024*1024);}finally{await handle.close();}
  f.approve([{media_id:'video',role:'body'}]);
  assert.equal(f.origin.proofOf('video'),declared);assert.deepEqual(f.origin.referenceProofs('c'),{[declared]:1});
  assert.deepEqual(f.origin.allowedReferences('c'),[]);assert.equal(f.one('SELECT count(*) n FROM canon').n,1);
});

test('old free-text origin claims cannot confer a declaration without in-scope media',async t=>{
  const f=await fixture(t);
  for(const biography of ['Kitalált karakter.','Nem kitalált személy.','generált fotó grok-forrás']){
    f.db.prepare('UPDATE characters SET biography=?').run(biography);
    assert.equal(f.origin.originOf('c').origin,'not_stated');assert.equal(f.origin.intimateAllowed('c'),false);
  }
  assert.equal(f.origin.originOf('absent').origin,'not_stated');
});
