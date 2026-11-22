import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installTidyUp} from '../app/tidy-up.mjs';
import {installQuickTag} from '../app/quick-tag.mjs';

// Minimal synthetic catalogue: only the tables these two modules read.
function catalogue(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT,aliases TEXT DEFAULT '',biography TEXT,personality TEXT,appearance TEXT,cover_id TEXT);
    CREATE TABLE identity_faces(media_id TEXT,face_index INTEGER);
    CREATE TABLE character_ui(character_id TEXT PRIMARY KEY,cover_crop TEXT,merged_into TEXT);
    CREATE TABLE character_cover_frames(character_id TEXT,media_id TEXT);
    CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,folder TEXT,kind TEXT,size INTEGER,modified_at TEXT,created_at TEXT);
    CREATE TABLE media_hidden(media_id TEXT PRIMARY KEY,original_path TEXT,physical INTEGER,created_at TEXT);
    CREATE VIEW active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);
    CREATE TABLE depictions(media_id TEXT,character_id TEXT,PRIMARY KEY(media_id,character_id));
    CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE tag_groups(id TEXT PRIMARY KEY,name TEXT,name_key TEXT);
    CREATE TABLE structured_tags(id TEXT PRIMARY KEY,group_id TEXT,name TEXT,name_key TEXT);
    CREATE TABLE media_tags(media_id TEXT,tag_id TEXT,PRIMARY KEY(media_id,tag_id));
    CREATE TABLE canon(id TEXT,character_id TEXT,references_json TEXT);
    CREATE TABLE generation_feedback(media_id TEXT,character_id TEXT,rating INTEGER);
    CREATE TABLE locations(id TEXT PRIMARY KEY,name TEXT,tag_id TEXT);
    CREATE TABLE world_places(character_id TEXT,location_id TEXT,role TEXT);
    CREATE TABLE world_review_sources(id TEXT,media_id TEXT,raw_json TEXT);
    CREATE TABLE media_notes(media_id TEXT,tags TEXT,notes TEXT);`);
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
  const transaction=f=>{db.exec('BEGIN');try{const r=f();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  const fail=(m,status=400)=>Object.assign(Error(m),{status});
  return {db,one,all,run,transaction,fail};
}

test('tidy-up: lists missing covers/profiles/proposals and sets only empty covers from the character\'s own pictures',async()=>{
  const c=catalogue(),{run}=c;
  run("INSERT INTO characters(id,name,biography,cover_id) VALUES('a','Aladár','',NULL),('b','Béla','Nem: férfi.',NULL),('c','Csaba','','m9')");
  run("INSERT INTO application_settings VALUES('ghost:character:c',?)",JSON.stringify({values:{occupation:'pék'},proposals:[{status:'pending'},{status:'accepted'}]}));
  for(const [id,p] of [['m1','x\\a1.png'],['m2','x\\ab.png'],['m3','x\\b1.png'],['m9','x\\c.png']])run("INSERT INTO media VALUES(?,?,'x','image',10,'2026-01-01','2026-01-01')",id,p);
  run("INSERT INTO depictions VALUES('m1','a'),('m2','a'),('m2','b'),('m3','b'),('m9','c')");
  run("INSERT INTO canon VALUES('k','b',?)",JSON.stringify([{media_id:'m2'}]));
  const tidy=installTidyUp({...c,locationCanvas:{context:async()=>({head:'h2',approved_head:'h1'})}});
  const s=await tidy.summary();
  assert.deepEqual(s.no_cover.map(x=>x.id),['a','b']);
  assert.deepEqual(s.no_profile.map(x=>x.id),['a'],'a Szellemprofil or bio counts as a profile');
  assert.deepEqual(s.ghost_pending,[{id:'c',name:'Csaba',count:1}]);
  assert.equal(s.tree_draft,true);
  const sug=new Map(tidy.coverSuggestions().items.map(i=>[i.id,i]));
  assert.equal(sug.get('a').candidates[0].id,'m1','a picture showing only this character ranks first');
  assert.equal(sug.get('b').candidates[0].id,'m2','an approved reference ranks first');
  assert.throws(()=>tidy.setCovers([{character_id:'a',media_id:'m3'}]),/active picture of this character/);
  assert.deepEqual(tidy.setCovers([{character_id:'a',media_id:'m1'},{character_id:'c',media_id:'m9'}]),{set:1},'existing covers are never replaced');
  assert.equal(c.one("SELECT cover_id FROM characters WHERE id='a'").cover_id,'m1');
});

test('place hints: folder name, folder neighbours and AI description, abstaining when unsure',()=>{
  const c=catalogue(),{run}=c;
  run("INSERT INTO tag_groups VALUES('g','Setting & location','setting')");
  for(const [id,name] of [['l1','Budapest - Kávézó'],['l2','Feri háza - Konyha'],['l3','Gergő háza - Konyha'],['l4','Edzőterem']]){run('INSERT INTO structured_tags VALUES(?,?,?,?)','t'+id,'g',name,name);run('INSERT INTO locations VALUES(?,?,?)',id,name,'t'+id);}
  run("INSERT INTO characters(id,name) VALUES('feri','Feri')");run("INSERT INTO world_places VALUES('feri','l2','home')");
  const media=[['k1','20_SHARED_MEDIA\\Scenes\\Kör\\1.png'],['k2','20_SHARED_MEDIA\\Scenes\\Kör\\2.png'],['k3','20_SHARED_MEDIA\\Scenes\\Kör\\3.png'],
    ['e1','20_SHARED_MEDIA\\Edzőterem\\e.png'],['f1','10_CHARACTERS\\Feri\\f.png'],['u1','10_CHARACTERS\\Feri\\u.png'],['r1','10_CHARACTERS\\Feri\\r.png']];
  for(const [id,p] of media)run("INSERT INTO media VALUES(?,?,'x','image',1,'2026-01-01','2026-01-01')",id,p);
  run("INSERT INTO media_tags VALUES('k1','tl1'),('k2','tl1')");
  run("INSERT INTO depictions VALUES('f1','feri'),('u1','feri'),('r1','feri')");
  const ai=(mid,label,settings=[])=>run('INSERT INTO world_review_sources VALUES(?,?,?)','s'+mid,mid,JSON.stringify({background:{kind:'scene'},scene_details:{environment:{observed_function:{hu:label,en:label}},compatible_settings:settings.map(s=>({label:{hu:s,en:s}}))}}));
  ai('f1','Konyha pult mellett');ai('u1','Ismeretlen belső tér');ai('r1','Referencialap edzőterem háttérrel');
  const qt=installQuickTag({...c,worldReview:null});
  const hints=Object.fromEntries(qt.locationQueue({limit:50}).items.map(i=>[i.media_id,i.suggestion&&[i.suggestion.name,i.suggestion.reason]]));
  assert.deepEqual(hints.k3,['Budapest - Kávézó','folder'],'two of two tagged neighbours share the place');
  assert.deepEqual(hints.e1,['Edzőterem','folder_name']);
  assert.deepEqual(hints.f1,['Feri háza - Konyha','ai_people'],'two kitchens match; the pictured character\'s home decides');
  assert.equal(hints.u1,null,'no signal, no guess');
  assert.equal(hints.r1,null,'reference sheets get no place');
  assert.equal(qt.locationQueue({suggested:true}).total,3);
});
