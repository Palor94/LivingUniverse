// Explicit manual full-library run. Live catalogue is query-only; all writes stay in a private run folder.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createAnalysisSource} from '../app/analysis-source.mjs';
import {cloudAvailabilityMany} from '../app/duplicates.mjs';
import {createAnalysisProvider} from '../app/analysis-providers.mjs';
import {pilotCredentialEnvironment} from '../app/analysis-credentials.mjs';
import {referenceImage} from '../mcp/images.mjs';
import {analysisDefaultGoals,analysisDigest,analysisHash,analysisError} from '../app/analysis-model.mjs';
import {installWorldIndex,indexWorldResult} from '../app/analysis-world-index.mjs';
import {isPlanningSource} from '../app/media-purpose.mjs';
import {libraryProviderConfig,libraryPlanHash,validateLibraryApproval,libraryUsageCost,libraryCanSend,effectiveLibraryBudget,libraryScope} from './library-run-support.mjs';
import {startLibraryReview} from './private-library-review.mjs';
import {installLibraryRetention,libraryItemRetired,forgetLibraryObservations,syncLibraryRetention} from './library-retention.mjs';

const args=process.argv.slice(2),opts={};let mode='';
for(let i=0;i<args.length;i++){if(['--prepare','--refresh','--run','--pause','--review'].includes(args[i])&&!mode)mode=args[i];else if(['--config','--output','--port'].includes(args[i])&&args[i+1]&&!opts[args[i]])opts[args[i]]=args[++i];else throw Error('Invalid explicit library command');}
if(!mode||!opts['--output']||mode==='--prepare'&&!opts['--config'])throw Error('Explicit mode/config/private output required');
if(opts['--port']&&(mode!=='--review'||!/^\d{4,5}$/.test(opts['--port'])||Number(opts['--port'])>65535))throw Error('Invalid private review port');
const output=path.resolve(opts['--output']);if(output.toLowerCase().includes('onedrive')||output===path.parse(output).root)throw Error('Private output must stay outside OneDrive');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const atomic=async(file,value)=>{await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file);};
const exists=async file=>fs.access(file).then(()=>true,()=>false);
const budgetFor=async value=>effectiveLibraryBudget(value,await exists(path.join(output,'budget-amendment.json'))?await read(path.join(output,'budget-amendment.json')):null);
let app,live,review,inhibitor,lock,current,stopReason=null,plan,consecutiveFailures=0;
const cache=new Map();
async function decode(bytes){const key=analysisHash(bytes);if(cache.has(key))return cache.get(key);const result=await referenceImage(bytes);cache.set(key,result);if(cache.size>64)cache.delete(cache.keys().next().value);return result;}
async function stage(provider,onItemSettled){return createApp({root:path.join(output,'media'),dataDir:path.join(output,'catalogue'),mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:{providers:{}},mediaAnalysisTestOptions:{provider,providers:[provider],availability:async()=> 'local',decode,onItemSettled}});}
function installRunTables(db){
  db.exec(`CREATE TABLE IF NOT EXISTS library_items(media_id TEXT PRIMARY KEY,status TEXT NOT NULL,job_id TEXT,item_id TEXT,error_code TEXT,cost_usd REAL NOT NULL DEFAULT 0,cache_hit INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS library_attempts(media_id TEXT PRIMARY KEY,request_sha256 TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,receipt_json TEXT,cost_usd REAL,elapsed_ms INTEGER);`);installWorldIndex(db);installLibraryRetention(db);
}
const spent=()=>app.db.prepare('SELECT coalesce(sum(cost_usd),0) n FROM library_attempts').get().n;
async function status(state){
  const scope=libraryScope(plan),counts=Object.fromEntries(app.db.prepare('SELECT status,count(*) n FROM library_items WHERE '+scope.sql+' GROUP BY status').all(...scope.ids).map(r=>[r.status,r.n]));
  await atomic(path.join(output,'status.json'),{kind:'private-world-library-status',plan_hash:plan.plan_hash,state,stop_reason:stopReason,updated_at:new Date().toISOString(),worker_pid:process.pid,counts,calculated_cost_usd:spent(),transport_attempts:app.db.prepare('SELECT count(*) n FROM library_attempts').get().n,cached_images:app.db.prepare('SELECT count(*) n FROM library_items WHERE cache_hit=1').get().n,unknown_cost_attempts:app.db.prepare('SELECT count(*) n FROM library_attempts WHERE cost_usd IS NULL').get().n,total:plan.items.length,budget_usd:await budgetFor(plan)});
}
async function keepAwake(){
  if(process.platform!=='win32')return null;
  const script="Add-Type -Namespace LU -Name SleepGuard -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);';try{if([LU.SleepGuard]::SetThreadExecutionState([uint32]2147483649)-eq 0){exit 1};[Console]::WriteLine('READY');[Console]::Out.Flush();[void][Console]::In.ReadLine()}finally{[void][LU.SleepGuard]::SetThreadExecutionState([uint32]2147483648)}";
  return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let ready=false;const timer=setTimeout(()=>{child.kill();reject(Error('SLEEP_GUARD_UNAVAILABLE'));},15000);child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',reject);child.stdout.on('data',chunk=>{if(!ready&&String(chunk).includes('READY')){ready=true;clearTimeout(timer);resolve(child);}});child.on('exit',()=>{if(!ready){clearTimeout(timer);reject(Error('SLEEP_GUARD_UNAVAILABLE'));}});});
}
async function settleItem({job_id,item_id,media_id}){
  const row=app.db.prepare('SELECT status,result_json,error_code,cache_hit FROM media_analysis_items WHERE id=?').get(item_id),attempt=app.db.prepare('SELECT * FROM library_attempts WHERE media_id=?').get(media_id);
  if(libraryItemRetired(app.db,media_id)){
    forgetLibraryObservations(app.db,plan.items.find(i=>i.media_id===media_id));
    if(attempt){if(!attempt.receipt_json||attempt.cost_usd===null)stopReason='UNVERIFIED_USAGE_OR_OUTCOME';app.db.prepare('UPDATE library_attempts SET state=?,finished_at=? WHERE media_id=?').run(attempt.cost_usd===null?'unknown':row.status,new Date().toISOString(),media_id);}
    await status(stopReason?'stopping':'running');return;
  }
  if(row.status==='succeeded'){
    consecutiveFailures=0;
    const item=plan.items.find(i=>i.media_id===media_id),result=JSON.parse(row.result_json);
    indexWorldResult(app.db,{media_id,source_sha256:item.original.sha256,result_item_id:item_id,result,characters:item.characters,source_relative_path:item.original.relative_path});
    app.db.prepare("UPDATE library_items SET status='succeeded',job_id=?,item_id=?,error_code=NULL,cost_usd=?,cache_hit=? WHERE media_id=?").run(job_id,item_id,attempt?.cost_usd||0,row.cache_hit,media_id);
  }else if(stopReason&&!attempt){app.db.prepare("UPDATE library_items SET status='queued',job_id=NULL,item_id=NULL,error_code=NULL WHERE media_id=?").run(media_id);}
  else{
    consecutiveFailures++;if(consecutiveFailures>=3)stopReason=stopReason||'THREE_CONSECUTIVE_FAILURES';
    app.db.prepare("UPDATE library_items SET status='failed',job_id=?,item_id=?,error_code=?,cost_usd=? WHERE media_id=?").run(job_id,item_id,row.error_code,attempt?.cost_usd||0,media_id);
    if(attempt&&(!attempt.receipt_json||attempt.cost_usd===null)||row.error_code==='PROVIDER_OUTCOME_UNKNOWN'){stopReason='UNVERIFIED_USAGE_OR_OUTCOME';app.db.prepare("UPDATE library_attempts SET state='unknown' WHERE media_id=?").run(media_id);}
  }
  if(attempt&&attempt.state!=='unknown')app.db.prepare('UPDATE library_attempts SET state=?,finished_at=? WHERE media_id=? AND state<>?').run(row.status,new Date().toISOString(),media_id,'unknown');
  await status(stopReason?'stopping':'running');
}

try{
  if(mode==='--pause'){await fs.writeFile(path.join(output,'pause.request'),'Pause requested by the operator. The active request may finish.');console.log(JSON.stringify({pause_requested:true}));}
  else if(mode==='--prepare'){
    await fs.mkdir(output);await fs.mkdir(path.join(output,'media'));
    const cfg=await read(opts['--config']);live=new DatabaseSync(cfg.database,{readOnly:true,allowExtension:false});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
    const rows=live.prepare("SELECT * FROM active_media WHERE kind='image' ORDER BY id").all(),root=await fs.realpath(cfg.mediaRoot);
    const provider=createAnalysisProvider('openai',libraryProviderConfig(),{env:{},fetchImpl:async()=>{throw Error('PREPARATION_EXTERNAL_TRANSPORT_FORBIDDEN');}});
    plan={kind:'private-world-library-plan',prepared_at:new Date().toISOString(),database:cfg.database,media_root:root,active_images:rows.length,scope:'all-active-catalogue-images-at-preparation',provider:libraryProviderConfig(),goals:analysisDefaultGoals,budget_usd:30,disclosure:provider.disclosure,items:[],excluded:[],external_calls:0};
    const getCharacters=live.prepare('SELECT c.id,c.name FROM depictions d JOIN characters c ON c.id=d.character_id WHERE d.media_id=? ORDER BY c.id');
    for(let offset=0;offset<rows.length;offset+=16){
      const batch=rows.slice(offset,offset+16),paths=batch.map(r=>path.join(root,r.relative_path)),states=await cloudAvailabilityMany(paths);
      const source=createAnalysisSource({root,one:(sql,...p)=>live.prepare(sql).get(...p),availability:async file=>states.get(file)||'unknown'});
      for(const row of batch){try{
        const input=await source.read(row.id),ext={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/bmp':'.bmp'}[input.manifest.mime_type];if(!ext)throw Error('UNSUPPORTED_IMAGE');
        const name=row.id+ext;await fs.writeFile(path.join(output,'media',name),input.bytes,{flag:'wx'});
        plan.items.push({media_id:row.id,staging_name:name,original:input.manifest,characters:getCharacters.all(row.id)});
      }catch(error){plan.excluded.push({media_id:row.id,relative_path:row.relative_path,code:error.code||'UNSUPPORTED_OR_UNAVAILABLE_IMAGE'});}}
      await atomic(path.join(output,'preparation-status.json'),{checked:Math.min(offset+16,rows.length),total:rows.length,prepared:plan.items.length,excluded:plan.excluded.length,external_calls:0});
    }
    plan.plan_hash=libraryPlanHash(plan);await fs.writeFile(path.join(output,'plan.json'),JSON.stringify(plan,null,2),{flag:'wx'});await fs.copyFile(new URL('../docs/WORLD_MEDIA_TAGGING.md',import.meta.url),path.join(output,'method.md'));
    app=await stage(provider);installRunTables(app.db);
    const at=new Date().toISOString(),insert=app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)");app.db.exec('BEGIN IMMEDIATE');try{for(const item of plan.items){insert.run(item.media_id,item.staging_name,item.original.size,at,at);app.db.prepare("INSERT INTO library_items(media_id,status) VALUES(?,'queued')").run(item.media_id);}app.db.exec('COMMIT');}catch(e){app.db.exec('ROLLBACK');throw e;}
    await status('prepared');console.log(JSON.stringify({event:'private_world_library_prepared',output,images:plan.items.length,excluded:plan.excluded.length,model:plan.provider.model,reasoning_effort:plan.provider.reasoning_effort,budget_usd:30,plan_hash:plan.plan_hash,external_calls:0}));
  }else{
    plan=await read(path.join(output,'plan.json'));if(plan.plan_hash!==libraryPlanHash(plan))throw Error('LIBRARY_PLAN_CHANGED');
    if(mode==='--refresh'){
      if(await exists(path.join(output,'approval.json'))||await exists(path.join(output,'worker.lock')))throw Error('APPROVED_PLAN_CANNOT_CHANGE');
      const provider=createAnalysisProvider('openai',plan.provider,{env:{},fetchImpl:async()=>{throw Error('PREPARATION_EXTERNAL_TRANSPORT_FORBIDDEN');}});app=await stage(provider);installRunTables(app.db);
      if(app.db.prepare('SELECT count(*) n FROM library_attempts').get().n||app.db.prepare('SELECT count(*) n FROM media_analysis_jobs').get().n)throw Error('STARTED_PLAN_CANNOT_CHANGE');
      live=new DatabaseSync(plan.database,{readOnly:true,allowExtension:false});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');const unresolved=[];let restored=0;
      for(const item of plan.excluded){if(item.code!=='SOURCE_CHANGED'){unresolved.push(item);continue;}try{
        const source=createAnalysisSource({root:plan.media_root,one:(sql,...p)=>live.prepare(sql).get(...p)}),input=await source.read(item.media_id),ext={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/bmp':'.bmp'}[input.manifest.mime_type];if(!ext)throw Error('UNSUPPORTED_IMAGE');
        const name=item.media_id+ext;await fs.writeFile(path.join(output,'media',name),input.bytes,{flag:'wx'});const characters=live.prepare('SELECT c.id,c.name FROM depictions d JOIN characters c ON c.id=d.character_id WHERE d.media_id=? ORDER BY c.id').all(item.media_id);
        plan.items.push({media_id:item.media_id,staging_name:name,original:input.manifest,characters});const at=new Date().toISOString();app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)").run(item.media_id,name,input.manifest.size,at,at);app.db.prepare("INSERT INTO library_items(media_id,status) VALUES(?,'queued')").run(item.media_id);restored++;
      }catch(error){unresolved.push({...item,code:error.code||'LOCAL_REFRESH_FAILED'});}}
      await fs.copyFile(path.join(output,'plan.json'),path.join(output,'plan-before-refresh.json'),fs.constants?.COPYFILE_EXCL??1);
      plan.items.sort((a,b)=>a.media_id.localeCompare(b.media_id));plan.excluded=unresolved;plan.refreshed_at=new Date().toISOString();plan.plan_hash=libraryPlanHash(plan);await atomic(path.join(output,'plan.json'),plan);await status('prepared');console.log(JSON.stringify({restored,images:plan.items.length,excluded:plan.excluded.length,external_calls:0,plan_hash:plan.plan_hash}));
    }
    else if(mode==='--review'){review=await startLibraryReview(output,plan,{port:Number(opts['--port']||0),followDeletions:true});console.log(JSON.stringify({review:review.url,pid:process.pid}));}
    else{
      if(await exists(path.join(output,'planning-supplement.json'))&&(await read(path.join(output,'planning-supplement.json'))).state==='pending_inclusion')throw analysisError('PLANNING_SUPPLEMENT_PENDING','A kért tervképek még nincsenek benne a jóváhagyott futási állományban.',409);
      validateLibraryApproval(plan,await read(path.join(output,'approval.json')));
      lock=await fs.open(path.join(output,'worker.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString(),plan_hash:plan.plan_hash}));
      await fs.rm(path.join(output,'pause.request'),{force:true});
      const env=await pilotCredentialEnvironment();
      const base=createAnalysisProvider('openai',plan.provider,{env,onReceipt:async receipt=>{
        if(!current||current.request_sha256!==receipt.request_sha256)throw Error('RECEIPT_BINDING_CHANGED');
        const cost=receipt.usage&&receipt.model_matches?libraryUsageCost(receipt.usage):null;
        app.db.prepare('UPDATE library_attempts SET receipt_json=?,cost_usd=?,state=? WHERE media_id=?').run(JSON.stringify(receipt),cost,cost===null?'unknown':'received',current.media_id);
        if(cost===null)stopReason='UNVERIFIED_USAGE_OR_MODEL';await status(stopReason?'stopping':'running');
      }});
      const provider={...base,async analyzeImage(input){
        const media_id=input.authorization?.media_id,request_sha256=analysisDigest(base.requestBody(input));
        await syncLibraryRetention({output,plan,db:app.db,live});for(const r of app.db.prepare('SELECT source_sha256 FROM library_redactions').all())cache.delete(r.source_sha256);
        if(libraryItemRetired(app.db,media_id))throw analysisError('IMAGE_UNAVAILABLE','A képet eltávolították az élő médiatárból.',409);
        if(await exists(path.join(output,'pause.request')))stopReason='OPERATOR_PAUSE';
        try{validateLibraryApproval(plan,await read(path.join(output,'approval.json')));}catch{stopReason='APPROVAL_INVALIDATED_OR_EXPIRED';}
        const attempted=!!app.db.prepare('SELECT 1 FROM library_attempts WHERE media_id=?').get(media_id),unknown=!!app.db.prepare("SELECT 1 FROM library_attempts WHERE state IN ('started','unknown')").get();
        if(!libraryCanSend({alreadyAttempted:attempted,unknownOutcome:unknown,stopped:!!stopReason,spent:spent(),config:plan.provider,budget_usd:await budgetFor(plan)})){stopReason=stopReason|| (attempted||unknown?'UNVERIFIED_OR_REPEATED_ATTEMPT':'LOCAL_BUDGET_GUARD');throw analysisError('UPLOAD_APPROVAL_REQUIRED','A futási költség- vagy folytatási őr megállította a következő küldést.',403);}
        if(input.authorization.request_sha256!==request_sha256||!plan.items.some(i=>i.media_id===media_id&&i.original.sha256===input.source_sha256))throw Error('LIBRARY_SOURCE_NOT_APPROVED');
        current={media_id,request_sha256};const started=performance.now();app.db.prepare("INSERT INTO library_attempts(media_id,request_sha256,state,started_at) VALUES(?,?,'started',?)").run(media_id,request_sha256,new Date().toISOString());await status('running');
        try{return await base.analyzeImage(input);}finally{app.db.prepare('UPDATE library_attempts SET elapsed_ms=? WHERE media_id=?').run(Math.round(performance.now()-started),media_id);current=null;}
      }};
      app=await stage(provider,settleItem);installRunTables(app.db);
      live=new DatabaseSync(plan.database,{readOnly:true,allowExtension:false});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=3000;');
      await syncLibraryRetention({output,plan,db:app.db,live});
      // Shared queue restart marks active cloud attempts uncertain; never silently resubmit them.
      if(app.db.prepare("SELECT 1 FROM library_attempts WHERE state IN ('started','unknown')").get())throw Error('UNVERIFIED_PREVIOUS_ATTEMPT');
      // Recover committed items after an interruption between the shared queue commit and projection update.
      const recoveryScope=libraryScope(plan);
      for(const row of app.db.prepare("SELECT i.id item_id,i.job_id,i.media_id FROM media_analysis_items i JOIN library_items l ON l.media_id=i.media_id WHERE i.status='succeeded' AND l.status<>'succeeded' AND l."+recoveryScope.sql).all(...recoveryScope.ids))await settleItem(row);
      inhibitor=await keepAwake();review=await startLibraryReview(output,plan);await status('running');
      console.log(JSON.stringify({event:'private_world_library_started',url:review.url,images:plan.items.length,pid:process.pid,temporary_sleep_guard:!!inhibitor,sqlite_busy_timeout_ms:app.db.prepare('PRAGMA busy_timeout').get().timeout}));
      let first=true;
      while(!stopReason){
        if(await exists(path.join(output,'pause.request'))){stopReason='OPERATOR_PAUSE';break;}
        await syncLibraryRetention({output,plan,db:app.db,live});
        const selectedScope=libraryScope(plan),initialBatch=first,pending=app.db.prepare("SELECT media_id FROM library_items WHERE status='queued' AND "+selectedScope.sql+" ORDER BY media_id LIMIT ?").all(...selectedScope.ids,first?3:25);if(!pending.length)break;
        if(first){const planning=plan.items.find(i=>isPlanningSource(i.original.relative_path)&&app.db.prepare("SELECT 1 FROM library_items WHERE media_id=? AND status='queued'").get(i.media_id));if(planning&&!pending.some(i=>i.media_id===planning.media_id))pending[pending.length-1]={media_id:planning.media_id};}
        const ids=pending.map(i=>i.media_id);
        const requestKey=randomUUID();let job;
        try{
          // A concurrent deletion can invalidate a transport-free preview; skip only removed IDs.
          for(const media_id of ids){const item=plan.items.find(i=>i.media_id===media_id);if(analysisHash(await fs.readFile(path.join(output,'media',item.staging_name)))!==item.original.sha256)throw Error('STAGED_SOURCE_CHANGED');}
          const preview=await app.mediaAnalysis.previewJob({media_ids:ids,provider_id:'openai',goals:plan.goals});
          job=await app.mediaAnalysis.createJob({media_ids:ids,provider_id:'openai',goals:plan.goals,preview_hash:preview.preview_hash,request_key:requestKey,transfer_approval:{preview_hash:preview.preview_hash,ack_upload:true,ack_cost:true}});
        }catch(error){
          await syncLibraryRetention({output,plan,db:app.db,live});
          if(!app.db.prepare('SELECT 1 FROM media_analysis_jobs WHERE request_key=?').get(requestKey)&&ids.some(id=>libraryItemRetired(app.db,id)))continue;
          throw error;
        }
        first=false;
        for(const media_id of ids)app.db.prepare('UPDATE library_items SET job_id=? WHERE media_id=?').run(job.id,media_id);
        await app.mediaAnalysis.settle();
        if(app.db.prepare('SELECT status FROM media_analysis_jobs WHERE id=?').get(job.id).status!=='completed'&&!stopReason)throw Error('SHARED_QUEUE_PAUSED');
        if(initialBatch&&ids.some(id=>!['succeeded','removed'].includes(app.db.prepare('SELECT status FROM library_items WHERE media_id=?').get(id).status)))stopReason=stopReason||'INITIAL_CONTRACT_CHECK_FAILED';
      }
      await status(stopReason?'paused':'completed');
      await atomic(path.join(output,'verification.json'),{staging_integrity:app.db.prepare('PRAGMA integrity_check').get().integrity_check,foreign_key_errors:app.db.prepare('PRAGMA foreign_key_check').all().length,finished_at:new Date().toISOString(),live_catalogue_opened_read_only_during_preparation:true,live_catalogue_writes:0,automatic_acceptances:0});
      console.log(JSON.stringify({event:'private_world_library_finished',stop_reason:stopReason,cost_usd:spent()}));
    }
  }
}catch(error){stopReason=stopReason||error.code||'LIBRARY_RUN_STOPPED';if(app&&plan)await status('paused').catch(()=>{});console.error(JSON.stringify({event:'private_world_library_error',code:stopReason,...(error.code==='ERR_SQLITE_ERROR'?{sqlite_error_code:error.errcode}: {})}));process.exitCode=1;}
finally{
  if(inhibitor){inhibitor.stdin.end();inhibitor=null;}
  cache.clear();if(app)await app.close();live?.close();
  if(lock){await lock.close();await fs.rm(path.join(output,'worker.lock'),{force:true});}
  if(review&&mode==='--run')setTimeout(()=>{review.server.closeAllConnections();review.server.close();},60*60*1000).unref();
}
