import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installMediaReview} from '../app/media-review.mjs';

test('media review: unknown-content queue pages by offset, duplicates keep canon, "not duplicates" sticks',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT,size INTEGER);CREATE TABLE media_hidden(media_id TEXT);
    CREATE VIEW active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);
    CREATE TABLE depictions(media_id TEXT,character_id TEXT);CREATE TABLE media_tags(media_id TEXT,tag_id TEXT);CREATE TABLE tag_groups(id TEXT,name TEXT);CREATE TABLE structured_tags(id TEXT,group_id TEXT,name TEXT);
    CREATE TABLE world_review_sources(id TEXT,media_id TEXT,raw_json TEXT);CREATE TABLE canon(character_id TEXT,references_json TEXT);`);
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
  run("INSERT INTO characters VALUES('A','Aba')");
  for(let i=1;i<=5;i++){run('INSERT INTO media VALUES(?,?,?,?)','m'+i,`x/m${i}.jpg`,i===5?'video':'image',i*100);if(i!==4)run("INSERT INTO depictions VALUES(?,'A')",'m'+i);}
  run("INSERT INTO world_review_sources VALUES('s1','m1',?)",JSON.stringify({world_details:{content:{level:'nudity'}}}));
  const r=installMediaReview({db,one,all,run,fail:m=>Error(m)});
  let q=r.contentQueue({limit:2});assert.equal(q.total,4);assert.deepEqual(q.items.map(i=>i.media_id),['m2','m3'],'people first, AI-known m1 left out');
  assert.deepEqual(r.contentQueue({limit:2,offset:2}).items.map(i=>i.media_id),['m5','m4']);
  run("INSERT INTO play_content VALUES('m2','non_intimate','x')");assert.equal(r.contentQueue().total,3);
  assert.deepEqual(r.contentQueue({kind:'video'}).items.map(i=>i.media_id),['m5']);
  // Near-duplicates: the canon reference is the keeper and protected.
  run("INSERT INTO media_signals(media_id,group_id,width,height,updated_at) VALUES('m1','g',100,100,'x'),('m2','g',4000,3000,'x'),('m3','g',800,600,'x')");
  run("INSERT INTO canon VALUES('A',?)",JSON.stringify([{media_id:'m1'}]));
  const g=r.duplicateGroups().groups[0];assert.equal(g.keeper,'m1');assert.equal(g.items.find(i=>i.media_id==='m1').protected,true);
  r.markDistinct(['m1','m2','m3']);assert.equal(r.duplicateGroups().groups.length,0);
  assert.equal(one("SELECT count(*) n FROM media_signals WHERE group_id IS NOT NULL").n,0);
});
