import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {createAnalysisSource} from './analysis-source.mjs';
import {analysisCategories,analysisVersions,analysisDigest as digest,analysisError as error,validateAnalysisResult,matchAnalysisResult,createMockAnalysisProvider} from './analysis-model.mjs';

const now=()=>new Date().toISOString();
const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw error('INVALID_ARGUMENT','Ismeretlen elemzési mező.');};
const requestKey=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{8,100}$/u.test(v))throw error('INVALID_ARGUMENT','Adj meg stabil műveleti azonosítót.');return v;};
export const analysisTables={
  media_analysis_jobs:['id','request_key','request_hash','provider_json','goals_json','status','revision','pause_reason','created_at','updated_at'],
  media_analysis_items:['id','job_id','media_id','ordinal','status','source_json','result_json','context_json','match_hash','cache_key','cache_hit','attempts','error_code'],
  media_analysis_cache:['cache_key','provider_json','source_sha256','derivative_sha256','result_json','created_at'],
  media_analysis_proposals:['id','item_id','match_hash','ordinal','payload_json','status'],
  media_analysis_decisions:['id','request_key','request_hash','preview_hash','operation','status','selection_json','result_json','created_at'],
  media_analysis_tag_links:['media_id','tag_id','decision_id'],
  media_analysis_place_links:['media_id','location_id','decision_id','is_primary']
};
export async function backupBeforeMediaAnalysis(db,dataDir){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='media_analysis_schema'").get())return null;
  const populated=['characters','media','locations'].some(t=>db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get());if(!populated)return null;
  const directory=path.join(dataDir,'backups');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'before-media-analysis-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw error('BACKUP_FAILED','Az elemzés előtti adatbázismentés nem ellenőrizhető.',500);}finally{copy.close();}return file;
}

export function installMediaAnalysis({db,root,one,all,run,transaction,taxonomy,locations,isBusy=()=>false,availability,decode,provider=createMockAnalysisProvider(),timeoutMs=30000}){
  transaction(()=>db.exec(readFileSync(new URL('./migrations/023-media-analysis.up.sql',import.meta.url),'utf8')));
  if(one('SELECT version FROM media_analysis_schema WHERE id=1')?.version!==1)throw error('SCHEMA_UNSUPPORTED','Ismeretlen elemzési adatbázisséma.',409);
  // Only the explicitly local mock transport is implemented in this release.
  if(provider.id!=='mock'||provider.local!==true||provider.mock!==true||typeof provider.version!=='string'||typeof provider.analyzeImage!=='function')throw error('PROVIDER_DISABLED','Csak a helyi mock provider használható.',403);
  const spec={id:provider.id,version:provider.version,model:provider.model||'fixture',local:true,mock:true,...analysisVersions};
  const source=createAnalysisSource({root,one,availability,decode}),csrf=randomBytes(32).toString('hex');
  let worker=null,controller=null,closed=false,preparing=0;
  transaction(()=>{run("UPDATE media_analysis_jobs SET status='paused',revision=revision+1,pause_reason='restart',updated_at=? WHERE status IN ('queued','running')",now());run("UPDATE media_analysis_items SET status='queued' WHERE status='running'");});
  function active(mid){const row=one("SELECT * FROM active_media WHERE id=? AND kind='image'",mid);if(!row)throw error('IMAGE_UNAVAILABLE','A kiválasztott kép nem aktív vagy nem érhető el.',409);return row;}
  function mediaBinding(mid){
    const m=active(mid);return digest({media:[m.id,m.relative_path,m.kind],characters:all('SELECT character_id FROM depictions WHERE media_id=? ORDER BY character_id',mid),tags:all('SELECT tag_id FROM media_tags WHERE media_id=? ORDER BY tag_id',mid),notes:one('SELECT tags,notes FROM media_notes WHERE media_id=?',mid)||null,places:locations.allDetails(mid).map(p=>[p.id,p.is_primary]).sort(),role:one('SELECT role FROM media_roles WHERE media_id=?',mid)||null,sorting:one('SELECT complete FROM media_categorization WHERE media_id=?',mid)||null});
  }
  function catalogueContext(){const vocabulary=taxonomy.noteTags.vocabulary(),tree=locations.editor.tree();return {vocabulary,places:tree.items,vocabulary_hash:digest(vocabulary),tree_hash:tree.tree_version};}
  const binding=(mid,context=catalogueContext())=>({vocabulary_hash:context.vocabulary_hash,tree_hash:context.tree_hash,media_binding:mediaBinding(mid)});
  function getJob(id){const row=one('SELECT * FROM media_analysis_jobs WHERE id=?',id);if(!row)throw error('NOT_FOUND','Az elemzési köteg nem található.',404);return row;}
  function getItem(id){const row=one('SELECT * FROM media_analysis_items WHERE id=?',id);if(!row)throw error('NOT_FOUND','Az elemzési kép nem található.',404);return row;}
  function view(id,offset=0){
    const job=getJob(id),context=catalogueContext(),counts=Object.fromEntries(all('SELECT status,COUNT(*) count FROM media_analysis_items WHERE job_id=? GROUP BY status',id).map(r=>[r.status,r.count]));
    const items=all('SELECT * FROM media_analysis_items WHERE job_id=? ORDER BY ordinal LIMIT 20 OFFSET ?',id,offset).map(item=>{
      let stale=false;try{stale=!!item.context_json&&digest(binding(item.media_id,context))!==digest(JSON.parse(item.context_json));}catch{stale=true;}
      const manifest=JSON.parse(item.source_json),proposals=all('SELECT id,payload_json,status FROM media_analysis_proposals WHERE item_id=? AND match_hash=? ORDER BY ordinal',item.id,item.match_hash).map(p=>({id:p.id,...JSON.parse(p.payload_json),status:p.status}));
      return {id:item.id,media_id:item.media_id,file_name:path.win32.basename(manifest.relative_path),source_sha256:manifest.sha256,status:item.status,error_code:item.error_code,cache_hit:!!item.cache_hit,attempts:item.attempts,stale,result:item.result_json?JSON.parse(item.result_json):null,proposals};
    });
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    return {id:job.id,status:job.status,revision:job.revision,pause_reason:job.pause_reason,provider:JSON.parse(job.provider_json),goals:JSON.parse(job.goals_json),created_at:job.created_at,counts,total,items,next_offset:offset+20<total?offset+20:null};
  }
  function options(body){
    if(body.provider_id!==undefined&&body.provider_id!=='mock')throw error('PROVIDER_DISABLED','Valódi vagy külső provider nincs bekötve.',403);
    if(!Array.isArray(body.media_ids)||!body.media_ids.length||body.media_ids.length>100||body.media_ids.some(v=>typeof v!=='string'))throw error('INVALID_ARGUMENT','Jelölj ki 1–100 képet.');
    const ids=[...new Set(body.media_ids)].sort();for(const id of ids)active(id);
    const goals=body.goals??analysisCategories;if(!Array.isArray(goals)||!goals.length||goals.some(g=>!analysisCategories.includes(g)))throw error('INVALID_ARGUMENT','Válassz támogatott elemzési célokat.');
    return {ids,goals:[...new Set(goals)].sort(),provider:spec};
  }
  async function previewJob(body){
    shape(body,['media_ids','goals','provider_id']);if(closed||isBusy())throw error('BUSY','Más katalógusművelet fut. Próbáld később.',409);
    preparing++;try{
      const chosen=options(body),context=catalogueContext(),items=[];
      for(const id of chosen.ids){const input=await source.read(id);items.push({media_id:id,source:input.manifest,binding:binding(id,context)});}
      if(closed||isBusy())throw error('BUSY','Az előnézet megszakadt. Készíts új előnézetet.',409);
      return {chosen,items,preview_hash:digest({chosen,items}),mock:true,external_upload:false,cost:0};
    }finally{preparing--;}
  }
  async function createJob(body){
    shape(body,['media_ids','goals','provider_id','preview_hash','request_key']);requestKey(body.request_key);
    const chosen=options(body),requestHash=digest({chosen,preview_hash:body.preview_hash}),prior=one('SELECT * FROM media_analysis_jobs WHERE request_key=?',body.request_key);
    if(prior){if(prior.request_hash!==requestHash)throw error('CONFLICT','Ez a műveleti azonosító más köteghez tartozik.',409);return view(prior.id);}
    const {preview_hash:expected,...args}=body;delete args.request_key;const plan=await previewJob(args);
    if(expected!==plan.preview_hash)throw error('STALE_PREVIEW','A kép, a szótár, a helyszínfa vagy a hozzárendelés változott. Készíts új előnézetet.',409);
    const id=randomUUID();transaction(()=>{
      if(one('SELECT COUNT(*) n FROM media_analysis_jobs').n>=1000||one('SELECT COUNT(*) n FROM media_analysis_items').n+plan.items.length>10000)throw error('QUEUE_LIMIT','Az elemzési előzmény elérte a határt; semmit nem töröltünk.',409);
      for(const item of plan.items)if(digest(binding(item.media_id))!==digest(item.binding))throw error('STALE_PREVIEW','A katalógus megváltozott. Készíts új előnézetet.',409);
      run('INSERT INTO media_analysis_jobs VALUES(?,?,?,?,?,?,0,?,?,?)',id,body.request_key,requestHash,JSON.stringify(spec),JSON.stringify(plan.chosen.goals),'queued','',now(),now());
      for(const [ordinal,item]of plan.items.entries())run("INSERT INTO media_analysis_items(id,job_id,media_id,ordinal,status,source_json) VALUES(?,?,?,?,'queued',?)",randomUUID(),id,item.media_id,ordinal,JSON.stringify(item.source));
    });kick();return view(id);
  }
  function storeMatches(item,result,context){
    const current=binding(item.media_id,context),matchHash=digest({result,context:current});
    run("UPDATE media_analysis_proposals SET status='stale' WHERE item_id=? AND status='pending' AND match_hash<>?",item.id,matchHash);
    const proposals=matchAnalysisResult(result,context.vocabulary,context.places,JSON.parse(getJob(item.job_id).goals_json));
    for(const [ordinal,payload]of proposals.entries())run("INSERT OR IGNORE INTO media_analysis_proposals VALUES(?,?,?,?,?,'pending')",randomUUID(),item.id,matchHash,ordinal,JSON.stringify(payload));
    run('UPDATE media_analysis_items SET context_json=?,match_hash=? WHERE id=?',JSON.stringify(current),matchHash,item.id);
  }
  async function interruptible(promise,signal,timeout=timeoutMs){
    let timer,onAbort;try{return await Promise.race([promise,new Promise((_,reject)=>{onAbort=()=>reject(error('INTERRUPTED','A feldolgozás megszakadt.',409));if(signal.aborted)return onAbort();signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>reject(error('TIMEOUT','A provider nem válaszolt időben.',409)),timeout);})]);}
    finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
  }
  async function processItem(job,item){
    const control=new AbortController();controller=control;const revision=job.revision;
    const current=()=>!closed&&one("SELECT 1 FROM media_analysis_jobs WHERE id=? AND status='running' AND revision=?",job.id,revision)&&one("SELECT 1 FROM media_analysis_items WHERE id=? AND status='running'",item.id);
    run("UPDATE media_analysis_items SET status='running',attempts=attempts+1,error_code=NULL WHERE id=?",item.id);
    try{
      const input=await interruptible(source.read(item.media_id,JSON.parse(item.source_json)),control.signal),image=await interruptible(source.derivative(input.bytes),control.signal);
      const goals=JSON.parse(job.goals_json),cacheKey=digest({source:input.manifest.sha256,derivative:image.sha256,provider:spec,goals});
      const cached=one('SELECT result_json FROM media_analysis_cache WHERE cache_key=?',cacheKey);
      const raw=cached?JSON.parse(cached.result_json):await interruptible(Promise.resolve().then(()=>provider.analyzeImage({image,source_sha256:input.manifest.sha256,goals,signal:control.signal})),control.signal);
      const result=validateAnalysisResult(raw);
      // A late or cancelled provider result never commits, even if it ignored AbortSignal.
      if(!current())return;
      await interruptible(source.read(item.media_id,input.manifest),control.signal);if(!current())return;
      const context=catalogueContext();transaction(()=>{
        if(!cached&&one('SELECT COUNT(*) n FROM media_analysis_cache').n<5000)run('INSERT OR IGNORE INTO media_analysis_cache VALUES(?,?,?,?,?,?)',cacheKey,JSON.stringify(spec),input.manifest.sha256,image.sha256,JSON.stringify(result),now());
        run("UPDATE media_analysis_items SET status='succeeded',result_json=?,cache_key=?,cache_hit=? WHERE id=?",JSON.stringify(result),cacheKey,cached?1:0,item.id);storeMatches(item,result,context);
      });
    }catch(e){if(current())run("UPDATE media_analysis_items SET status='failed',error_code=? WHERE id=?",['SOURCE_CHANGED','IMAGE_OFFLINE','IMAGE_LIMIT','INVALID_IMAGE','IMAGE_UNAVAILABLE','UNSAFE_IMAGE','INVALID_RESULT','TIMEOUT','DECODE_FAILED'].includes(e.code)?e.code:'ANALYSIS_FAILED',item.id);}
    finally{control.abort();if(controller===control)controller=null;}
  }
  async function pump(){
    while(!closed){
      const job=one("SELECT * FROM media_analysis_jobs WHERE status IN ('queued','running') ORDER BY rowid LIMIT 1");if(!job)return;
      if(isBusy()){run("UPDATE media_analysis_jobs SET status='paused',pause_reason='catalogue_busy',revision=revision+1,updated_at=? WHERE id=?",now(),job.id);continue;}
      if(digest(JSON.parse(job.provider_json))!==digest(spec)){run("UPDATE media_analysis_jobs SET status='paused',pause_reason='provider_changed',revision=revision+1,updated_at=? WHERE id=?",now(),job.id);continue;}
      if(job.status==='queued'){run("UPDATE media_analysis_jobs SET status='running',updated_at=? WHERE id=?",now(),job.id);job.status='running';}
      const item=one("SELECT * FROM media_analysis_items WHERE job_id=? AND status='queued' ORDER BY ordinal LIMIT 1",job.id);
      if(!item){run("UPDATE media_analysis_jobs SET status='completed',updated_at=? WHERE id=? AND status='running' AND revision=?",now(),job.id,job.revision);continue;}
      await processItem(job,item);
    }
  }
  function kick(){if(worker||closed)return;worker=Promise.resolve().then(pump).catch(()=>{if(!closed)transaction(()=>{run("UPDATE media_analysis_jobs SET status='paused',pause_reason='worker_error',revision=revision+1,updated_at=? WHERE status IN ('queued','running')",now());run("UPDATE media_analysis_items SET status='queued' WHERE status='running'");});}).finally(()=>{worker=null;});}
  function controlJob(id,operation){
    const job=getJob(id);if(['completed','cancelled'].includes(job.status))throw error('CONFLICT','A befejezett vagy törölt köteg nem folytatható. Indíts új kijelölt köteget.',409);
    if(operation==='resume'&&digest(JSON.parse(job.provider_json))!==digest(spec))throw error('PROVIDER_CHANGED','A provider verziója megváltozott; új köteg szükséges.',409);
    const status={pause:'paused',resume:'queued',cancel:'cancelled'}[operation];
    transaction(()=>{run('UPDATE media_analysis_jobs SET status=?,revision=revision+1,pause_reason=?,updated_at=? WHERE id=?',status,operation==='pause'?'user':'',now(),id);run("UPDATE media_analysis_items SET status=? WHERE job_id=? AND status IN ('queued','running')",operation==='cancel'?'cancelled':'queued',id);});
    // Other queued jobs must not be interrupted by a control action on this job.
    if(controller&&worker&&job.status==='running')controller.abort();if(operation==='resume')kick();return view(id);
  }
  async function rematch(id){
    const item=getItem(id);if(item.status!=='succeeded'||!item.result_json)throw error('CONFLICT','Csak elkészült eredmény illeszthető újra.',409);
    preparing++;try{await source.read(item.media_id,JSON.parse(item.source_json));if(closed||isBusy())throw error('BUSY','Más katalógusművelet fut.',409);transaction(()=>storeMatches(item,validateAnalysisResult(JSON.parse(item.result_json)),catalogueContext()));return view(item.job_id);}finally{preparing--;}
  }

  // Review/approval implementation is kept in a separate module below.
  return {spec,csrf,view,getJob,getItem,previewJob,createJob,controlJob,rematch,catalogueContext,binding,source,storeMatches,
    list:()=>all('SELECT id,status,created_at,pause_reason FROM media_analysis_jobs ORDER BY rowid DESC LIMIT 50'),
    isBusy:()=>!!worker||preparing>0,
    async close(){closed=true;controller?.abort();transaction(()=>{run("UPDATE media_analysis_jobs SET status='paused',pause_reason='shutdown',revision=revision+1,updated_at=? WHERE status IN ('queued','running')",now());run("UPDATE media_analysis_items SET status='queued' WHERE status='running'");});await worker;},
    async settle(){await worker;},
    guard(req){const supplied=req.headers['x-lu-analysis-csrf'];if(req.headers.origin!=='http://'+req.headers.host||typeof supplied!=='string'||!/^[a-f0-9]{64}$/u.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(csrf)))throw error('FORBIDDEN','Nyisd meg újra az elemzési felületet a művelethez.',403);}
  };
}
