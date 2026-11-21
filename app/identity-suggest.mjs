// Local face identity at work (2026-11-12): "who is in this picture" suggestions, likely wrong
// links, and a consistency check of every character's approved face references.
//
// Method: the benchmarked local face method (docs/VISION_ENGINE.md: InsightFace SCRFD + ArcFace,
// offline, free). A scan runs in a child process (identity-worker.mjs) one picture at a time and
// keeps each face's box and embedding in identity_faces (migration 032), so later reports are
// instant and a picture is only analysed again when its file changes.
//
// Boundaries (AGENTS.md, docs/AUTO_CANON.md):
// - Nothing here writes canon or approves anything. A suggestion becomes an ordinary depiction
//   link only when the owner clicks it (through the existing bulk-assign route).
// - Face only. The numbers below are suggestion thresholds (docs/VISION_ENGINE.md, gate benchmark
//   2026-11-12), not the auto-canon gates, which stay unset until the owner locks them.
// - References come only from the current canon's approved face references (with their crop).
// - Generation-plan sheets and removed media are never scanned.
import {fork} from 'node:child_process';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {notPlanningSQL,playAssetFilter} from './media-purpose.mjs';
import {LOCAL_IDENTITY_METHOD,localIdentityAvailable} from './local-identity.mjs';

// SUGGEST raised from 0.35 to 0.50 by the 2026-11-12 gate benchmark: at 0.35 a quarter of the faces of
// characters without a face reference were "recognised" as someone else; at 0.50 about one in ten.
export const SUGGEST=0.5,MARGIN=0.05,MIN_FACE_PX=40,MIN_DET=0.6;
export const OUTLIER=0.25,LOOKALIKE=0.45,MISMATCH_OWN=0.2,MISMATCH_OTHER=0.4;
const JOB_TIMEOUT=60_000;

const toVector=blob=>blob?new Float32Array(blob.buffer.slice(blob.byteOffset,blob.byteOffset+blob.byteLength)):null;
const cosine=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const round=v=>Math.round(v*1000)/1000;

// Default analyser: the child process. Tests pass their own.
export function workerAnalyser(){
  let child=null,seq=0;const waiting=new Map();
  const start=()=>{
    child=fork(new URL('./identity-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    child.on('message',m=>{const w=waiting.get(m?.id);if(!w)return;waiting.delete(m.id);clearTimeout(w.timer);m.ok?w.resolve(m):w.reject(Object.assign(Error('The picture could not be analysed.'),{code:m.code}));});
    child.on('exit',()=>{child=null;for(const [id,w] of waiting){clearTimeout(w.timer);w.reject(Error('The analyser stopped.'));waiting.delete(id);}});
  };
  const analyse=file=>new Promise((resolve,reject)=>{if(!child)start();const id=++seq;
    const timer=setTimeout(()=>{waiting.delete(id);child?.kill();reject(Error('The analysis took too long.'));},JOB_TIMEOUT);
    waiting.set(id,{resolve,reject,timer});child.send({id,file});});
  analyse.close=()=>{child?.kill();child=null;};
  analyse.available=()=>localIdentityAvailable();
  return analyse;
}

export function installIdentitySuggest({db,one,all,run,transaction,safeFile,fail,analyse=workerAnalyser(),method=LOCAL_IDENTITY_METHOD,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/032-identity-faces.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  let job={running:false,scope:null,total:0,done:0,faces:0,errors:0,failed:[],started_at:null,finished_at:null,stopped:false};

  // ---- references: the current canon's approved face references -------------------------------
  function faceReferences(){
    const rows=all('SELECT c.character_id,c.references_json,ch.name FROM canon c JOIN characters ch ON ch.id=c.character_id LEFT JOIN character_ui u ON u.character_id=c.character_id WHERE u.merged_into IS NULL AND c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id)');
    const out=[];
    for(const r of rows){let refs=[];try{refs=JSON.parse(r.references_json||'[]');}catch{}
      for(const x of refs)if(x?.role==='face'&&x.media_id)out.push({character_id:r.character_id,name:r.name,media_id:x.media_id,crop:x.crop||null,reference_id:x.reference_id||null});}
    return out;
  }
  const facesOf=mediaId=>all('SELECT face_index,box_json,det_score,face_px,embedding FROM identity_faces WHERE media_id=? AND method=? AND face_index>=0 ORDER BY face_index',mediaId,method).map(f=>({...f,box:JSON.parse(f.box_json),vector:toVector(f.embedding)}));
  // The face a reference means: inside its crop (the face centre in the crop region), else the biggest.
  function referenceVector(ref){
    const faces=facesOf(ref.media_id);if(!faces.length)return null;
    const inCrop=ref.crop?faces.filter(f=>{const cx=f.box.x+f.box.w/2,cy=f.box.y+f.box.h/2;return cx>=ref.crop.x&&cx<=ref.crop.x+ref.crop.w&&cy>=ref.crop.y&&cy<=ref.crop.y+ref.crop.h;}):faces;
    // A crop with several faces in it is ambiguous: abstain.
    if(ref.crop&&inCrop.length!==1)return null;
    return inCrop.sort((a,b)=>b.box.w*b.box.h-a.box.w*a.box.h)[0].vector;
  }

  // ---- scanning --------------------------------------------------------------------------------
  function targets(scope){
    const refs=[...new Set(faceReferences().map(r=>r.media_id))];
    const base=`SELECT m.id,m.relative_path FROM active_media m WHERE m.kind='image' AND ${notPlanningSQL} AND ${playAssetFilter(one)}`;
    const pictures=scope==='all'?all(base+' ORDER BY m.created_at DESC'):all(base+' AND NOT EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id) ORDER BY m.created_at DESC');
    const seen=new Set(),list=[];
    for(const id of refs){const m=one('SELECT id,relative_path,kind FROM active_media WHERE id=?',id);if(m&&m.kind==='image'&&!seen.has(id)){seen.add(id);list.push(m);}}
    for(const m of pictures)if(!seen.has(m.id)){seen.add(m.id);list.push(m);}
    return list;
  }
  async function fileKey(m){const full=await safeFile(m),s=await fs.stat(full);return {full,key:s.size+'-'+Math.round(s.mtimeMs)};}
  const cachedKey=mediaId=>one('SELECT file_key FROM identity_faces WHERE media_id=? AND method=? LIMIT 1',mediaId,method)?.file_key;
  async function runScan(list){
    for(const m of list){
      if(job.stopped)break;
      try{
        const {full,key}=await fileKey(m);
        if(cachedKey(m.id)!==key){
          const result=await analyse(full);
          transaction(()=>{run('DELETE FROM identity_faces WHERE media_id=? AND method=?',m.id,method);
            if(!result.faces.length)run('INSERT INTO identity_faces VALUES(?,?,?,-1,NULL,NULL,NULL,NULL,?)',m.id,method,key,iso());
            result.faces.forEach((f,i)=>run('INSERT INTO identity_faces VALUES(?,?,?,?,?,?,?,?,?)',m.id,method,key,i,JSON.stringify(f.box),f.score,f.px,Buffer.from(f.embedding,'base64'),iso()));});
          job.faces+=result.faces.length;
        }
      }catch(e){job.errors++;if(job.failed.length<50)job.failed.push({media_id:m.id,reason:e.code||e.message});}
      job.done++;
      await new Promise(r=>setImmediate(r));
    }
    job.running=false;job.finished_at=iso();
  }
  function startScan(scope='unsorted'){
    if(!['unsorted','all'].includes(scope))throw fail('Choose unsorted or all.');
    if(job.running)throw fail('A face scan is already running.',409);
    if(analyse.available&&!analyse.available())throw fail('The local face models are not installed on this computer.',409);
    const list=targets(scope);
    job={running:true,scope,total:list.length,done:0,faces:0,errors:0,failed:[],started_at:iso(),finished_at:null,stopped:false};
    runScan(list).catch(()=>{job.running=false;job.finished_at=iso();});
    return status();
  }
  const status=()=>({...job,method,scanned:one('SELECT count(DISTINCT media_id) n FROM identity_faces WHERE method=?',method).n,available:analyse.available?analyse.available():true});

  // ---- report ----------------------------------------------------------------------------------
  function report({limit=150}={}){
    const refs=faceReferences(),byChar=new Map();
    for(const r of refs){const v=referenceVector(r);if(!byChar.has(r.character_id))byChar.set(r.character_id,{character_id:r.character_id,name:r.name,refs:[]});byChar.get(r.character_id).refs.push({...r,vector:v});}
    const chars=[...byChar.values()],usable=chars.map(c=>({...c,vectors:c.refs.map(r=>r.vector).filter(Boolean)})).filter(c=>c.vectors.length);
    const scoreAll=v=>usable.map(c=>({character_id:c.character_id,name:c.name,score:Math.max(...c.vectors.map(x=>cosine(v,x)))})).sort((a,b)=>b.score-a.score);
    const rejected=new Set(all('SELECT media_id,character_id FROM identity_feedback').map(r=>r.media_id+'|'+r.character_id));
    const suggestions=[],mismatches=[];
    const scanned=all(`SELECT DISTINCT f.media_id FROM identity_faces f JOIN active_media m ON m.id=f.media_id WHERE f.method=? AND f.face_index>=0 AND ${notPlanningSQL}`,method).map(r=>r.media_id);
    for(const mid of scanned){
      const faces=facesOf(mid).filter(f=>f.vector&&(f.det_score??0)>=MIN_DET&&(f.face_px??0)>=MIN_FACE_PX);if(!faces.length||!usable.length)continue;
      const linked=new Set(all('SELECT character_id FROM depictions WHERE media_id=?',mid).map(r=>r.character_id));
      const scored=faces.map(f=>({f,ranks:scoreAll(f.vector)}));
      for(const {f,ranks} of scored){
        const [top,second]=ranks;
        if(!top||top.score<SUGGEST||(second&&top.score-second.score<MARGIN))continue;
        if(linked.has(top.character_id)||rejected.has(mid+'|'+top.character_id))continue;
        suggestions.push({media_id:mid,face_index:f.face_index,box:f.box,character_id:top.character_id,name:top.name,score:round(top.score),runner_up:second?{name:second.name,score:round(second.score)}:null});
      }
      // A linked character whose face is nowhere in a clear one-face picture, while someone else's is.
      if(scored.length===1)for(const cid of linked){
        const own=scored[0].ranks.find(r=>r.character_id===cid);if(!own)continue;
        const other=scored[0].ranks.find(r=>r.character_id!==cid);
        if(own.score<MISMATCH_OWN&&other&&other.score>=MISMATCH_OTHER)mismatches.push({media_id:mid,linked:{character_id:cid,name:own.name,score:round(own.score)},looks_like:{character_id:other.character_id,name:other.name,score:round(other.score)}});
      }
    }
    // Canon references: each one against the character's other face references, and against everyone else's.
    const references=chars.map(c=>{
      const items=c.refs.map((r,i)=>{
        if(!r.vector)return {media_id:r.media_id,reference_id:r.reference_id,status:facesOf(r.media_id).length?'ambiguous':'no_face'};
        const others=c.refs.filter((x,j)=>j!==i&&x.vector).map(x=>cosine(r.vector,x.vector));
        const mean=others.length?others.reduce((a,b)=>a+b,0)/others.length:null;
        return {media_id:r.media_id,reference_id:r.reference_id,status:mean!==null&&mean<OUTLIER?'outlier':'ok',agreement:mean===null?null:round(mean)};
      });
      return {character_id:c.character_id,name:c.name,face_references:c.refs.length,usable:c.refs.filter(r=>r.vector).length,items};
    }).sort((a,b)=>a.usable-b.usable||a.name.localeCompare(b.name,'hu'));
    const lookalikes=[];
    for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++){
      let best=-1;for(const a of usable[i].vectors)for(const b of usable[j].vectors)best=Math.max(best,cosine(a,b));
      if(best>=LOOKALIKE)lookalikes.push({a:{character_id:usable[i].character_id,name:usable[i].name},b:{character_id:usable[j].character_id,name:usable[j].name},score:round(best)});
    }
    const withoutFace=all("SELECT c.id character_id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY c.name").filter(c=>!byChar.has(c.character_id));
    return {method,thresholds:{suggest:SUGGEST,margin:MARGIN,outlier:OUTLIER,lookalike:LOOKALIKE},
      suggestions:suggestions.sort((a,b)=>b.score-a.score).slice(0,limit),suggestion_count:suggestions.length,
      mismatches:mismatches.slice(0,limit),references,lookalikes:lookalikes.sort((a,b)=>b.score-a.score),
      characters_without_face_reference:withoutFace.length};
  }
  function feedback(body,actor='creator'){
    if(!one('SELECT 1 FROM media WHERE id=?',body.media_id)||!one('SELECT 1 FROM characters WHERE id=?',body.character_id))throw fail('Not found',404);
    if(body.verdict!=='no')throw fail('Only "no" is recorded.');
    run('INSERT INTO identity_feedback VALUES(?,?,?,?,?) ON CONFLICT(media_id,character_id) DO NOTHING',body.media_id,body.character_id,'no',actor,iso());
    return {ok:true};
  }
  async function handle({p,req,body,json}){
    if(p==='/api/identity'&&req.method==='GET')return json({status:status(),report:report()}),true;
    if(p==='/api/identity/status'&&req.method==='GET')return json(status()),true;
    if(p==='/api/identity/scan'&&req.method==='POST')return json(startScan(body.scope)),true;
    if(p==='/api/identity/scan/stop'&&req.method==='POST'){job.stopped=true;return json(status()),true;}
    if(p==='/api/identity/feedback'&&req.method==='POST')return json(feedback(body)),true;
    return false;
  }
  async function checkGenerated(characterId,mediaId){
    const result={method,body_verdict:'unknown',face_verdict:'uncertain',canon_changed:false};
    if(job.running||analyse.available&&!analyse.available())return {...result,reason:'IDENTITY_UNAVAILABLE'};
    const refs=faceReferences().filter(ref=>ref.character_id===characterId),media=one("SELECT * FROM active_media WHERE id=? AND kind='image'",mediaId);if(!refs.length||!media)return {...result,reason:'FACE_REFERENCE_MISSING'};
    // Refresh only these approved references; never infer from an unrelated face
    // in a group reference. Cropped references must contain exactly one face.
    const vectors=[];for(const ref of refs){const m=one('SELECT * FROM active_media WHERE id=?',ref.media_id);if(!m)return {...result,reason:'REFERENCE_UNAVAILABLE'};const {key}=await fileKey(m);if(cachedKey(m.id)!==key)await runScan([m]);const vector=referenceVector(ref);if(!vector)return {...result,reason:'AMBIGUOUS_REFERENCE'};vectors.push(vector);}
    try{const analysed=await analyse(await safeFile(media)),faces=(analysed.faces||[]).filter(face=>face.px>=MIN_FACE_PX&&face.score>=MIN_DET);if(faces.length!==1)return {...result,reason:faces.length?'MULTIPLE_FACES':'NO_FACE'};const vector=toVector(Buffer.from(faces[0].embedding,'base64')),score=Math.max(...vectors.map(ref=>cosine(vector,ref)));return {...result,face_verdict:score>=SUGGEST?'matches':'mismatch',score:round(score),threshold:SUGGEST};}catch{return {...result,reason:'IDENTITY_UNAVAILABLE'};}
  }
  return {handle,startScan,status,report,feedback,faceReferences,checkGenerated,close:()=>{job.stopped=true;analyse.close?.();},wait:async()=>{while(job.running)await new Promise(r=>setTimeout(r,10));}};
}
