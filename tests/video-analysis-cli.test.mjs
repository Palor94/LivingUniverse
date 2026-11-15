import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const cli=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','app','run-video-analysis.mjs');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''}});

test('video analysis CLI: estimate makes no call, skips long videos, paid mode needs every acknowledgement',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-vid-')),dbFile=path.join(dir,'universe.sqlite'),report=path.join(dir,'report.json');
  const db=new DatabaseSync(dbFile);
  db.exec(`CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT);CREATE TABLE media_hidden(media_id TEXT);CREATE VIEW active_media AS SELECT * FROM media;
    CREATE TABLE world_review_sources(media_id TEXT,raw_json TEXT);
    CREATE TABLE media_signals(media_id TEXT PRIMARY KEY,dhash TEXT,group_id TEXT,captured_at TEXT,duration REAL,width INTEGER,height INTEGER,frames INTEGER NOT NULL DEFAULT 0,error TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE media_video_frames(media_id TEXT NOT NULL,t REAL NOT NULL,file TEXT NOT NULL,sha256 TEXT NOT NULL,dhash TEXT,level TEXT,description TEXT,analysed_at TEXT,PRIMARY KEY(media_id,t));`);
  db.prepare("INSERT INTO world_review_sources VALUES('x',?)").run(JSON.stringify({usage:{input_tokens:4000,cached_input_tokens:2000,output_tokens:1000}}));
  for(const [id,d,n] of [['short',15,5],['long',40,0]]){db.prepare("INSERT INTO media VALUES(?,?,'video')").run(id,id+'.mp4');db.prepare("INSERT INTO media_signals(media_id,duration,frames,updated_at) VALUES(?,?,?,'x')").run(id,d,n);
    for(let i=0;i<n;i++)db.prepare("INSERT INTO media_video_frames(media_id,t,file,sha256,dhash) VALUES(?,?,?,'h',?)").run(id,i*4,id+'/'+i+'.jpg',i===2?'ffffffff00000000':'0000000000000000');}
  db.close();
  const est=run('--estimate','--database',dbFile,'--report',report);assert.equal(est.status,0,est.stderr);
  const out=JSON.parse(est.stdout);assert.equal(out.live_calls,0);assert.equal(out.all.videos,1,'the 40 s video is skipped');assert.equal(out.all.stills,5);
  // Real usage → per still: (2000×2 + 2000×0.1 + 1000×10) / 1e6 USD.
  assert.equal(out.per_still_usd,0.0142);
  const min=JSON.parse(run('--estimate','--plan','minimal','--database',dbFile,'--report',report).stdout);assert.equal(min.all.stills,3);
  const paid=run('--trial','--database',dbFile,'--report',report,'--max-usd','1');assert.notEqual(paid.status,0);assert.match(paid.stderr,/ACK_FLAGS_REQUIRED/);
  const noKey=run('--trial','--ack-upload','--ack-cost','--ack-adult','--max-usd','1','--database',dbFile,'--report',report);assert.match(noKey.stderr,/MISSING_API_KEY/,'no key: nothing is sent');
  await fs.rm(dir,{recursive:true,force:true});
});
