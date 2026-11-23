#!/usr/bin/env node
// Operator-only video analysis (docs/VISION_ENGINE.md, owner lock 2026-11-07): the stills that
// the browser saved for each video (app/media-signals.mjs) are tagged one by one with the
// same world-v1 contract as pictures, on the locked model. The content level and description
// of each still go into media_video_frames, so the media director knows what each video
// shows and where its best moment starts. Never writes canon; reports stay outside OneDrive.
//
//   --estimate                     count stills and price them (no call, the default safe mode)
//   --trial --ack-upload --ack-cost --ack-adult --max-usd N [--limit 5]   paid run
//   --plan lock|minimal            lock = every saved still (1 / 4 s + last frame, default);
//                                  minimal = first + last + most different, about 1 per 6 s
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {analyzeWorldImage,VISION_TAG_KEY,VISION_TAG_METHOD} from './vision-engine.mjs';
import {minimalFrames,MAX_VIDEO_SECONDS} from './media-signals.mjs';
import {LEVELS,aiLevelOf} from './content-levels.mjs';

const fail=code=>Object.assign(Error(code),{code});
function parseArgs(argv){
  const o={flags:new Set(),'--plan':'lock'};
  for(let i=0;i<argv.length;i++){const a=argv[i];
    if(['--estimate','--trial','--ack-upload','--ack-cost','--ack-adult'].includes(a))o.flags.add(a);
    else if(['--database','--report','--limit','--max-usd','--plan','--skip','--concurrency'].includes(a)&&argv[i+1])o[a]=argv[++i];
    else throw fail('INVALID_VIDEO_COMMAND');}
  return o;
}

// Price of one still, from the measured usage of the pictures already tagged (gpt-6.1-sol
// list prices: $2 input, $0.10 cached input, $10 output per million tokens).
export function perStillUsd(db){
  const u=db.prepare("SELECT avg(json_extract(raw_json,'$.usage.input_tokens')) i,avg(json_extract(raw_json,'$.usage.cached_input_tokens')) c,avg(json_extract(raw_json,'$.usage.output_tokens')) o FROM world_review_sources WHERE json_extract(raw_json,'$.usage.input_tokens') IS NOT NULL").get();
  const i=u?.i||4200,c=u?.c||2400,o=u?.o||1700;
  return ((i-c)*2+c*0.1+o*10)/1e6;
}

// The planned stills of each video that are not analysed yet (an interrupted video continues
// with its missing stills only; a fully analysed one is left out).
export function plannedStills(db,plan,limit=Infinity){
  const videos=db.prepare(`SELECT s.media_id,s.duration FROM media_signals s JOIN active_media m ON m.id=s.media_id
    WHERE m.kind='video' AND s.frames>0 AND (s.duration IS NULL OR s.duration<=${MAX_VIDEO_SECONDS}) ORDER BY m.relative_path`).all();
  const out=[];
  for(const v of videos){if(out.length>=limit)break;
    const frames=db.prepare('SELECT t,file,dhash,level FROM media_video_frames WHERE media_id=? ORDER BY t').all(v.media_id);
    const keep=new Set(plan==='minimal'?minimalFrames(frames,v.duration):frames.map(f=>f.t));
    const stills=frames.filter(f=>keep.has(f.t)&&f.level==null).map(({level,...f})=>f);
    if(stills.length)out.push({media_id:v.media_id,duration:v.duration,stills});
  }
  return out;
}

async function main(){
  const o=parseArgs(process.argv.slice(2));
  if(!o.flags.has('--estimate')&&!o.flags.has('--trial'))throw fail('EXPLICIT_MODE_REQUIRED');
  if(!['lock','minimal'].includes(o['--plan']))throw fail('INVALID_PLAN');
  if(!o['--database']||!o['--report'])throw fail('DATABASE_AND_REPORT_REQUIRED');
  const database=path.resolve(o['--database']),report=path.resolve(o['--report']);
  if(report.toLowerCase().includes('onedrive'))throw fail('PRIVATE_LOCAL_REPORT_REQUIRED');
  await fs.mkdir(path.dirname(report),{recursive:true});
  const framesDir=path.join(path.dirname(database),'video-frames');
  const limit=Math.min(Math.max(Number(o['--limit']||5)||5,1),50);
  const maxUsd=o['--max-usd']!=null?Number(o['--max-usd']):null;
  if(maxUsd!=null&&!(maxUsd>0))throw fail('INVALID_MAX_USD');

  const ro=new DatabaseSync(database,{readOnly:true});
  let per,all,batch;
  // --skip id,id: videos whose earlier attempt had an uncertain outcome (never retried automatically).
  const skip=new Set(String(o['--skip']||'').split(',').map(s=>s.trim()).filter(Boolean));
  try{per=perStillUsd(ro);all=plannedStills(ro,o['--plan']).filter(v=>!skip.has(v.media_id));batch=all.slice(0,limit);}finally{ro.close();}
  const count=list=>list.reduce((n,v)=>n+v.stills.length,0);
  const estimate={plan:o['--plan'],model:'gpt-6.1-sol',per_still_usd:Number(per.toFixed(5)),
    all:{videos:all.length,stills:count(all),usd:Number((count(all)*per).toFixed(2))},
    this_run:{videos:batch.length,stills:count(batch),usd:Number((count(batch)*per).toFixed(2))}};
  if(!o.flags.has('--trial')){await fs.writeFile(report,JSON.stringify({kind:'video-analysis-estimate',...estimate},null,2));console.log(JSON.stringify({mode:'estimate',...estimate,live_calls:0}));return;}

  for(const f of ['--ack-upload','--ack-cost','--ack-adult'])if(!o.flags.has(f))throw fail('ACK_FLAGS_REQUIRED');
  if(maxUsd==null)throw fail('MAX_USD_REQUIRED');
  if(estimate.this_run.usd>maxUsd)throw fail('OVER_BUDGET');
  const apiKey=process.env[VISION_TAG_KEY];if(!apiKey)throw fail('MISSING_API_KEY');

  const db=new DatabaseSync(database);db.exec('PRAGMA busy_timeout=5000;');
  const save=db.prepare('UPDATE media_video_frames SET level=?,description=?,analysed_at=? WHERE media_id=? AND t=?');
  const results=[];let spent=0,stop=false;
  // --concurrency N (1–6, default 1): N stills in flight at once. On the first error or the
  // budget, no new still starts; the ones already sent finish and are saved. Never retried.
  const concurrency=Math.min(6,Math.max(1,Number(o['--concurrency']||1)||1));
  const tasks=batch.flatMap(v=>v.stills.map(s=>({v,s})));let next=0;
  async function worker(){
    while(!stop&&next<tasks.length){const {v,s}=tasks[next++];
      const file=path.resolve(framesDir,s.file);if(!file.startsWith(path.resolve(framesDir)+path.sep)){results.push({media_id:v.media_id,t:s.t,status:'skipped',reason:'path'});continue;}
      try{
        const out=await analyzeWorldImage({bytes:await fs.readFile(file),contentType:'image/jpeg',apiKey});
        const u=out.usage||{};spent+=(((u.input_tokens||0)-(u.cached_input_tokens||0))*2+(u.cached_input_tokens||0)*0.1+(u.output_tokens||0)*10)/1e6;
        const level=aiLevelOf(out.raw.world_details?.content);
        save.run(LEVELS.includes(level)?level:'nudity',String(out.raw.description?.hu||'').slice(0,600),new Date().toISOString(),v.media_id,s.t);
        results.push({media_id:v.media_id,t:s.t,status:'ok',level,request_id:out.request_id,usage:out.usage,raw:out.raw});
        if(spent>maxUsd&&!stop){results.push({status:'stopped',reason:'max_usd_reached'});stop=true;}
      }catch(e){
        // No automatic retry of uncertain/failed paid outcomes.
        results.push({media_id:v.media_id,t:s.t,status:'error',code:e.code||'VISION_FAILED',message:e.message});stop=true;
      }
    }
  }
  try{await Promise.all(Array.from({length:concurrency},worker));}finally{db.close();}
  await fs.writeFile(report,JSON.stringify({kind:'video-analysis-result',method:VISION_TAG_METHOD,estimate,spent_usd_estimate:Number(spent.toFixed(4)),finished_at:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify({mode:'trial',videos:batch.length,ok:results.filter(r=>r.status==='ok').length,errors:results.filter(r=>r.status==='error').length,spent_usd_estimate:Number(spent.toFixed(4)),canon_writes:0}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(e=>{console.error(JSON.stringify({code:e.code||'VIDEO_RUN_FAILED',message:e.message}));process.exitCode=1;});
}
