#!/usr/bin/env node
// Operator-only vision tagging trial. Writes local reports; never writes canon.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {analyzeWorldImage,estimateTagCostUsd,VISION_TAG_KEY,VISION_TAG_METHOD,buildTagPlanFields} from './vision-engine.mjs';
import {estimateIdentityCostUsd,VISION_IDENTITY_METHOD} from './vision-identity.mjs';
import {readAutoCanonConfig} from './auto-canon-gates.mjs';
import {isPlanningSource} from './media-purpose.mjs';

function parseArgs(argv){
  const opts={flags:new Set()};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(['--estimate','--trial','--ack-upload','--ack-cost','--ack-adult','--include-plans'].includes(a))opts.flags.add(a);
    else if(['--config','--report','--database','--media-root','--limit','--max-usd','--ids-file'].includes(a)&&argv[i+1])opts[a]=argv[++i];
    else throw Object.assign(Error('INVALID_VISION_COMMAND'),{code:'INVALID_VISION_COMMAND'});
  }
  return opts;
}

function contentTypeFor(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext==='.png')return 'image/png';
  if(ext==='.jpg'||ext==='.jpeg')return 'image/jpeg';
  return null;
}

async function loadConfig(opts){
  if(!opts['--config'])return {database:opts['--database'],mediaRoot:opts['--media-root'],auto_canon:{}};
  const cfg=JSON.parse(await fs.readFile(opts['--config'],'utf8'));
  return {
    database:path.resolve(opts['--database']||cfg.database),
    mediaRoot:path.resolve(opts['--media-root']||cfg.mediaRoot||cfg.media_root),
    auto_canon:cfg.auto_canon||{}
  };
}

// --ids-file: the Képműhely priority list (tagging-priority.json), in its order; ids that are
// no longer active images are skipped, never replaced.
async function selectTrialMedia(db,limit,{includePlans=false,ids=null}={}){
  const rows=db.prepare(`SELECT id,relative_path FROM active_media WHERE kind='image' ORDER BY id`).all();
  const chosen=ids?ids.map(id=>rows.find(r=>r.id===id)).filter(Boolean):rows;
  return chosen
    .filter(r=>/\.(jpe?g|png)$/i.test(r.relative_path))
    .filter(r=>includePlans||!isPlanningSource(r.relative_path))
    .slice(0,limit);
}

async function main(){
  const opts=parseArgs(process.argv.slice(2));
  if(!opts.flags.has('--estimate')&&!opts.flags.has('--trial'))throw Object.assign(Error('EXPLICIT_MODE_REQUIRED'),{code:'EXPLICIT_MODE_REQUIRED'});
  if(!opts['--report']||!opts['--config']&&!(opts['--database']&&opts['--media-root']))throw Object.assign(Error('CONFIG_OR_PATHS_REQUIRED'),{code:'CONFIG_OR_PATHS_REQUIRED'});
  const report=path.resolve(opts['--report']);
  if(report.toLowerCase().includes('onedrive'))throw Object.assign(Error('PRIVATE_LOCAL_REPORT_REQUIRED'),{code:'PRIVATE_LOCAL_REPORT_REQUIRED'});
  await fs.mkdir(path.dirname(report),{recursive:true});
  const cfg=await loadConfig(opts);
  if(!path.isAbsolute(cfg.mediaRoot))throw Object.assign(Error('ABSOLUTE_MEDIA_ROOT_REQUIRED'),{code:'ABSOLUTE_MEDIA_ROOT_REQUIRED'});
  const limit=Math.min(Math.max(Number(opts['--limit']||3)||3,1),25);
  const maxUsd=opts['--max-usd']!=null?Number(opts['--max-usd']):null;
  if(maxUsd!=null&&!(Number.isFinite(maxUsd)&&maxUsd>0))throw Object.assign(Error('INVALID_MAX_USD'),{code:'INVALID_MAX_USD'});

  const db=new DatabaseSync(cfg.database,{readOnly:true});
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
  let media;
  let ids=null;
  if(opts['--ids-file']){try{ids=JSON.parse(await fs.readFile(opts['--ids-file'],'utf8')).media_ids;}catch{ids=null;}
    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Object.assign(Error('INVALID_IDS_FILE'),{code:'INVALID_IDS_FILE'});}
  try{media=await selectTrialMedia(db,limit,{includePlans:opts.flags.has('--include-plans'),ids});}finally{db.close();}

  const tagCost=estimateTagCostUsd(media.length,{maxTotalUsd:maxUsd});
  const identityCost=estimateIdentityCostUsd(media.length,{maxTotalUsd:maxUsd});
  const autoCanon=readAutoCanonConfig(cfg.auto_canon);
  const plan=buildTagPlanFields({
    kind:'vision-tag-trial-plan',
    prepared_at:new Date().toISOString(),
    database:cfg.database,
    media_root:cfg.mediaRoot,
    method:VISION_TAG_METHOD,
    identity_method:VISION_IDENTITY_METHOD,
    items:media.map(m=>({media_id:m.id,relative_path:m.relative_path})),
    cost_preview:{tag:tagCost,identity:identityCost},
    auto_canon:autoCanon
  });

  if(opts.flags.has('--estimate')&&!opts.flags.has('--trial')){
    await fs.writeFile(report,JSON.stringify({kind:'vision-tag-cost-estimate',...plan},null,2));
    console.log(JSON.stringify({mode:'estimate',images:media.length,tag:tagCost,identity:identityCost,auto_canon_writer_enabled:autoCanon.writer_enabled,numeric_gates_locked:autoCanon.numeric_gates_locked,live_calls:0}));
    return;
  }

  for(const flag of ['--ack-upload','--ack-cost','--ack-adult'])if(!opts.flags.has(flag))throw Object.assign(Error('ACK_FLAGS_REQUIRED'),{code:'ACK_FLAGS_REQUIRED'});
  if(maxUsd!=null&&!tagCost.within_budget)throw Object.assign(Error('OVER_BUDGET'),{code:'OVER_BUDGET'});
  const apiKey=process.env[VISION_TAG_KEY];
  if(!apiKey)throw Object.assign(Error('MISSING_API_KEY'),{code:'MISSING_API_KEY'});

  const results=[];
  let spent=0;
  for(const item of media){
    const file=path.join(cfg.mediaRoot,...item.relative_path.split(/[\\/]/u));
    const type=contentTypeFor(file);
    if(!type){results.push({media_id:item.id,status:'skipped',reason:'unsupported_extension'});continue;}
    const bytes=await fs.readFile(file);
    try{
      const out=await analyzeWorldImage({bytes,contentType:type,apiKey});
      const usageCost=out.usage?((out.usage.input_tokens/1e6)*2)+((out.usage.output_tokens/1e6)*10):null;
      if(usageCost!=null)spent+=usageCost;
      results.push({
        media_id:item.id,status:'ok',request_id:out.request_id,source_sha256:out.source_sha256,usage:out.usage,
        participants:out.raw.scene_details.participants.map(p=>({id:p.id,region:p.region})),
        background:out.raw.background,tag_count:out.raw.tags.length,raw:out.raw
      });
      if(maxUsd!=null&&spent>maxUsd){results.push({status:'stopped',reason:'max_usd_reached',spent_usd:Number(spent.toFixed(6))});break;}
    }catch(e){
      results.push({media_id:item.id,status:'error',code:e.code||'VISION_FAILED',message:e.message,...(e.detail?{detail:e.detail}:{})});
      // No automatic retry of uncertain/failed paid outcomes.
      break;
    }
  }

  const payload={
    kind:'vision-tag-trial-result',
    method:VISION_TAG_METHOD,
    prepared_at:plan.prepared_at,
    finished_at:new Date().toISOString(),
    database:cfg.database,
    media_root:cfg.mediaRoot,
    ack:{upload:true,cost:true,adult:true,max_usd:maxUsd},
    cost_preview:plan.cost_preview,
    spent_usd_estimate:Number(spent.toFixed(6)),
    auto_canon:autoCanon,
    note:'Tagging only. Import via world-review remains separate. Auto-canon writer stays disabled until numeric gates are locked.',
    results
  };
  await fs.writeFile(report,JSON.stringify(payload,null,2));
  console.log(JSON.stringify({
    mode:'trial',images:media.length,ok:results.filter(r=>r.status==='ok').length,
    errors:results.filter(r=>r.status==='error').length,spent_usd_estimate:payload.spent_usd_estimate,
    auto_canon_writer_enabled:autoCanon.writer_enabled,canon_writes:0
  }));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(e=>{console.error(JSON.stringify({code:e.code||'VISION_RUN_FAILED',message:e.message}));process.exitCode=1;});
}
