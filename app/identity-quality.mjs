import {fork} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {backup,DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {localIdentityAvailable} from './local-identity.mjs';

export const BODY_QUALITY_METHOD='local-dinov2-small-crop-letterbox-v1';
export const FACE_QUALITY_METHOD='local-insightface-buffalo_l-v1';
export async function backupBeforeIdentityQuality(db,dataDir){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='characters'").get()||db.prepare("SELECT 1 FROM sqlite_master WHERE name='identity_quality_reviews'").get())return;
  const dir=path.join(dataDir,'backups');await mkdir(dir,{recursive:true});const file=path.join(dir,'before-identity-quality-'+randomUUID()+'.sqlite');await backup(db,file);
  const check=new DatabaseSync(file,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Identity quality backup verification failed');}finally{check.close();}
}
export function qualityCrop(c){
  if(c==null)return null;
  if(!c||typeof c!=='object'||!['x','y','w','h'].every(k=>Number.isFinite(c[k]))||c.x<0||c.y<0||c.w<=0||c.h<=0||c.x+c.w>1||c.y+c.h>1)throw Object.assign(Error('Érvénytelen személy-kivágás.'),{status:400});
  return {x:c.x,y:c.y,w:c.w,h:c.h};
}
export function qualitySimilarity(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length||![...a,...b].every(Number.isFinite))return null;
  const norm=v=>Math.sqrt(v.reduce((s,x)=>s+x*x,0));const d=norm(a)*norm(b);return d?Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/d)):null;
}
export function localQualityAnalyser(){
  let child=null;
  const analyse=job=>new Promise((resolve,reject)=>{
    if(child)return reject(Object.assign(Error('Már fut képelemzés.'),{status:409}));
    const worker=child=fork(new URL('./identity-quality-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    const finish=(error,value)=>{clearTimeout(timer);if(child===worker)child=null;worker.kill();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('A helyi elemzés túl sokáig tartott.')),60000);
    worker.once('error',e=>finish(e));worker.once('exit',()=>{if(child===worker)finish(Error('Az elemző leállt.'));});
    worker.once('message',r=>r.ok?finish(null,r):finish(Error(r.code)));worker.send(job);
  });
  analyse.available=()=>localIdentityAvailable();analyse.close=()=>{child?.kill();child=null;};return analyse;
}

export function installIdentityQuality({db,one,all,run,safeFile,analyse=localQualityAnalyser(),now=()=>Date.now()}){
  db.exec(`CREATE TABLE IF NOT EXISTS identity_quality_reviews(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),media_id TEXT NOT NULL REFERENCES media(id),canon_id TEXT NOT NULL,target_sha256 TEXT NOT NULL,crop_json TEXT,face_verdict TEXT NOT NULL,body_verdict TEXT NOT NULL,note TEXT NOT NULL,method TEXT NOT NULL,created_at TEXT NOT NULL,actor TEXT NOT NULL)`);
  const pending=new Map();let busy=false;
  const latest=cid=>one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
  async function source(mid,expected=null){
    const m=one("SELECT * FROM active_media WHERE id=? AND kind='image'",mid);if(!m)throw Object.assign(Error('A kép nem elérhető.'),{status:409});
    const file=await safeFile(m);if((await stat(file)).size>20*1024*1024)throw Object.assign(Error('A kép túl nagy ehhez az ellenőrzéshez.'),{status:413});
    const hash=createHash('sha256').update(await readFile(file)).digest('hex');
    if(expected&&hash!==expected)throw Object.assign(Error('A referencia fájlja megváltozott.'),{status:409});return {file,sha256:hash};
  }
  async function compare(body){
    if(busy)throw Object.assign(Error('Már fut minőségellenőrzés.'),{status:409});
    if(analyse.available&&!analyse.available())throw Object.assign(Error('A helyi modellek nem elérhetők.'),{status:409});
    const cid=body.character_id,mid=body.media_id,crop=qualityCrop(body.crop),canon=latest(cid);if(!canon)throw Object.assign(Error('Nincs jóváhagyott referencia.'),{status:409});
    const refs=JSON.parse(canon.references_json||'[]').filter(r=>['face','body'].includes(r.role)&&r.media_id!==mid).slice(0,16);
    if(!refs.length)throw Object.assign(Error('Független referencia szükséges.'),{status:409});
    busy=true;
    try{
      const scope=body.single_person===true&&body.body_visible===true;
      const target=await source(mid),targetResult=await analyse({file:target.file,crop,body:scope});
      const results={face:[],body:[]},bindings=[],references={face:[],body:[]};
      for(const r of refs){
        if(!r.sha256)continue;
        const s=await source(r.media_id,r.sha256),rc=qualityCrop(r.crop);
        if(s.sha256===target.sha256)continue;
        // A whole crowded frame cannot become a per-person body comparison.
        const assigned=one('SELECT count(*) n FROM depictions WHERE media_id=?',r.media_id)?.n;
        if(r.role==='body'&&!rc&&assigned!==1)continue;
        const v=await analyse({file:s.file,crop:rc,body:r.role==='body'});
        references[r.role].push({media_id:r.media_id,reference_id:r.reference_id||null,crop:rc});
        const vector=r.role==='face'?v.face:v.body,tv=r.role==='face'?targetResult.face:targetResult.body;
        const score=qualitySimilarity(tv,vector);
        if(score!==null&&(r.role!=='face'||targetResult.faces===1&&v.faces===1)&&(r.role!=='body'||targetResult.faces<=1&&v.faces<=1&&(rc||v.faces===1)))results[r.role].push({reference_id:r.reference_id||null,media_id:r.media_id,score});
        bindings.push({media_id:r.media_id,sha256:s.sha256});
      }
      if(latest(cid)?.id!==canon.id)throw Object.assign(Error('A referenciarevízió közben megváltozott.'),{status:409});
      const id=randomUUID(),report={id,character_id:cid,media_id:mid,canon_id:canon.id,target_sha256:target.sha256,crop,references,
        face:{method:FACE_QUALITY_METHOD,verdict:results.face.length?'needs_review':'unknown',scores:results.face},
        body:{method:BODY_QUALITY_METHOD,verdict:results.body.length?'needs_review':'unknown',reason:!scope?'PERSON_SCOPE_REQUIRED':targetResult.faces>1?'MULTIPLE_PEOPLE':'UNCALIBRATED_APPEARANCE_SIMILARITY',scores:results.body},canon_changed:false};
      for(const [key,p] of pending)if(p.expires<now())pending.delete(key);if(pending.size>=20)pending.delete(pending.keys().next().value);
      pending.set(id,{report,bindings,expires:now()+15*60e3});return report;
    }finally{busy=false;}
  }
  async function review(body){
    const p=pending.get(body.report_id);if(!p||p.expires<now())throw Object.assign(Error('Lejárt ellenőrzés; hasonlítsd össze újra.'),{status:409});
    if(!['match','mismatch','unknown'].includes(body.face)||!['match','mismatch','unknown'].includes(body.body))throw Object.assign(Error('Külön arc- és testdöntés szükséges.'),{status:400});
    const r=p.report;if(latest(r.character_id)?.id!==r.canon_id)throw Object.assign(Error('A jóváhagyott referencia megváltozott.'),{status:409});
    await source(r.media_id,r.target_sha256);for(const x of p.bindings)await source(x.media_id,x.sha256);
    const id=randomUUID();run('INSERT INTO identity_quality_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,r.character_id,r.media_id,r.canon_id,r.target_sha256,r.crop?JSON.stringify(r.crop):null,body.face,body.body,String(body.note||'').slice(0,600),'human-review+'+FACE_QUALITY_METHOD+'+'+BODY_QUALITY_METHOD,new Date(now()).toISOString(),'local-creator');
    pending.delete(body.report_id);return {id,face_verdict:body.face,body_verdict:body.body,canon_changed:false};
  }
  async function handle({p,req,body,json}){
    if(p==='/api/identity/quality'&&req.method==='GET'){json({available:!analyse.available||analyse.available(),busy,reviews:all('SELECT r.*,c.name FROM identity_quality_reviews r JOIN characters c ON c.id=r.character_id ORDER BY r.created_at DESC LIMIT 30')});return true;}
    if(p==='/api/identity/quality/compare'&&req.method==='POST'){json(await compare(body));return true;}
    if(p==='/api/identity/quality/review'&&req.method==='POST'){json(await review(body));return true;}return false;
  }
  return {compare,review,handle,isBusy:()=>busy,close:()=>analyse.close?.()};
}
