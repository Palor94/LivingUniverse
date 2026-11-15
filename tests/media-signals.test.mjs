import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {framePlan,minimalFrames,hamming,exifTime,installMediaSignals} from '../app/media-signals.mjs';
import {plannedStills} from '../app/run-video-analysis.mjs';

test('video frame plans: owner lock (1 still / 4 s + last) and the minimal set',()=>{
  assert.deepEqual(framePlan(15),[0,4,8,12,14.8]);
  assert.equal(framePlan(30).length,9);assert.equal(framePlan(30).at(-1),29.8);
  assert.deepEqual(framePlan(0),[0]);
  const long=framePlan(195);assert.equal(long.length,12);assert.equal(long[0],0);assert.equal(long.at(-1),194.8,'a long video is covered to the end');
  // Minimal: first + last + the most different stills, about one per 6 seconds.
  const same='0000000000000000',other='ffffffff00000000';
  const frames=[0,4,8,12,14.8].map(t=>({t,dhash:t===8?other:same}));
  assert.deepEqual(minimalFrames(frames,15),[0,8,14.8],'the still that looks different is kept');
  assert.equal(minimalFrames(framePlan(30).map(t=>({t,dhash:same})),30).length,5);
  assert.equal(hamming(same,other),32);assert.equal(hamming(same,'bad'),64);
});

test('EXIF capture time from a JPEG header',()=>{
  const tiff=Buffer.alloc(64);tiff.write('II',0,'ascii');tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);
  tiff.writeUInt16LE(1,8);tiff.writeUInt16LE(0x8769,10);tiff.writeUInt16LE(4,12);tiff.writeUInt32LE(1,14);tiff.writeUInt32LE(26,18);
  tiff.writeUInt16LE(1,26);tiff.writeUInt16LE(0x9003,28);tiff.writeUInt16LE(2,30);tiff.writeUInt32LE(20,32);tiff.writeUInt32LE(44,36);
  tiff.write('2026:11:10 21:30:00\0',44,'ascii');
  const app1=Buffer.concat([Buffer.from([0xff,0xe1]),Buffer.from([0,72]),Buffer.from('Exif\0\0','binary'),tiff]);
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8]),app1,Buffer.from([0xff,0xda,0,2])]);
  assert.equal(exifTime(jpeg),'2026-11-10T21:30:00');
  assert.equal(exifTime(Buffer.from([0xff,0xd8,0xff,0xda,0,2])),null);
});

test('signals: browser results are stored, near-duplicates grouped per cast, stills saved outside the media folder',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sig-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root);
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT);CREATE TABLE media_hidden(media_id TEXT);
    CREATE VIEW active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);
    CREATE TABLE depictions(media_id TEXT,character_id TEXT);CREATE TABLE world_review_sources(media_id TEXT,raw_json TEXT);`);
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
  const transaction=fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  const fail=(m,s=400)=>Object.assign(Error(m),{status:s});
  for(const [id,kind,cast] of [['p1','image','A'],['p2','image','A'],['p3','image','B'],['v1','video','A']]){run('INSERT INTO media VALUES(?,?,?)',id,id+(kind==='video'?'.mp4':'.jpg'),kind);run('INSERT INTO depictions VALUES(?,?)',id,cast);}
  const s=installMediaSignals({db,one,all,run,transaction,fail,root,dataDir});
  assert.deepEqual(s.queue(10).items.map(i=>i.id),['p1','p2','p3','v1']);
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');
  await s.ingest([{media_id:'p1',dhash:'0000000000000000'},{media_id:'p2',dhash:'0000000000000003'},{media_id:'p3',dhash:'0000000000000000'},
    {media_id:'v1',duration:15,frames:[{t:0,data_url:'data:image/jpeg;base64,'+jpeg,dhash:'0000000000000000'},{t:4,data_url:'data:image/jpeg;base64,'+jpeg}]}]);
  s.flush();// grouping is debounced after ingest; run it now
  const g=id=>one('SELECT group_id FROM media_signals WHERE media_id=?',id).group_id;
  assert.ok(g('p1')&&g('p1')===g('p2'),'2 bits apart, same people → one group');assert.equal(g('p3'),null,'same picture hash but other people → not grouped');
  assert.equal(s.queue(10).items.length,0);
  const frames=all('SELECT t,file FROM media_video_frames ORDER BY t');assert.deepEqual(frames.map(f=>f.t),[0,4]);
  assert.ok((await fs.stat(path.join(dataDir,'video-frames',frames[0].file))).isFile());
  await assert.rejects(s.ingest([{media_id:'v1',frames:[{t:8,data_url:'data:image/png;base64,AAAA'}]}]),/JPEG/);
  const est=s.status().estimate;assert.equal(est.videos,1);assert.equal(est.plans.lock.stills,2);assert.ok(est.per_still_usd>0);
  // The paid runner's plan reads the same stills (nothing is called here).
  assert.deepEqual(plannedStills(db,'lock').map(v=>v.stills.length),[2]);
  // Videos over 35 seconds: only the length is kept; no stills, not in the estimate.
  run('INSERT INTO media VALUES(?,?,?)','v2','v2.mp4','video');
  await s.ingest([{media_id:'v2',duration:40,frames:[{t:0,data_url:'data:image/jpeg;base64,'+jpeg}]}]);
  assert.equal(one("SELECT count(*) n FROM media_video_frames WHERE media_id='v2'").n,0);
  assert.equal(s.status().videos.too_long,1);assert.equal(s.status().estimate.videos,1);
});
