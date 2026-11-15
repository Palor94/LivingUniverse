#!/usr/bin/env node
// Free, offline auto-canon benchmark with the local method (app/local-identity.mjs) on the same
// held-out set as run-identity-benchmark.mjs. For each picture and offered character it records
// the best face similarity and (single-person pictures or known boxes) the body similarity, then
// lists hit and false-alarm rates per threshold. Report only: no catalogue or canon write,
// no thresholds chosen, no network.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {buildCases} from './run-identity-benchmark.mjs';
import {createLocalIdentity,LOCAL_IDENTITY_METHOD} from './local-identity.mjs';

export function rates(pairs,key,thresholds){
  const pos=pairs.filter(p=>p.truth&&p[key]!=null),neg=pairs.filter(p=>!p.truth&&p[key]!=null);
  return {positives:pos.length,negatives:neg.length,missing:pairs.filter(p=>p[key]==null).length,
    table:thresholds.map(t=>({threshold:t,hit_rate:pos.length?Number((pos.filter(p=>p[key]>=t).length/pos.length).toFixed(3)):null,false_alarm_rate:neg.length?Number((neg.filter(p=>p[key]>=t).length/neg.length).toFixed(3)):null}))};
}

async function main(){
  const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i++){if(['--set','--database','--media-root','--report'].includes(a[i])&&a[i+1])o[a[i]]=a[++i];else throw Error('INVALID_COMMAND');}
  for(const k of ['--set','--database','--media-root','--report'])if(!o[k])throw Error('PATHS_REQUIRED');
  const report=path.resolve(o['--report']);if(report.toLowerCase().includes('onedrive'))throw Error('PRIVATE_LOCAL_REPORT_REQUIRED');
  const set=JSON.parse(await fs.readFile(o['--set'],'utf8'));
  const db=new DatabaseSync(path.resolve(o['--database']),{readOnly:true});let cases;try{cases=buildCases(db,set,{refsPerCandidate:8});}finally{db.close();}
  const id=await createLocalIdentity(),root=path.resolve(o['--media-root']),file=rel=>path.join(root,...rel.split(/[\\/]/u));
  const refCache=new Map();
  async function refVectors(c){
    if(refCache.has(c.character_id))return refCache.get(c.character_id);
    const v={face:[],body:[]};for(const r of c.references){try{const img=await id.load(file(r.relative_path));
      if(r.role==='face'){const f=await id.referenceFace(img);if(f)v.face.push(f);}else v.body.push(await id.bodyEmbedding(img));}catch{}}
    refCache.set(c.character_id,v);return v;
  }
  const pairs=[],started=Date.now();let noFace=0;
  for(const c of cases){
    let img;try{img=await id.load(file(c.relative_path));}catch{continue;}
    const faces=await id.faces(img),faceVecs=[];for(const f of faces)faceVecs.push(await id.faceEmbedding(img,f));if(!faces.length)noFace++;
    const solo=c.participants.length===1,region=solo?c.participants[0].region:null;
    const body=solo?await id.bodyEmbedding(img,region):null;
    const truths=new Set(c.participants.map(p=>p.truth).filter(Boolean));
    for(const cand of c.candidates){const r=await refVectors(cand);
      const face=faceVecs.length&&r.face.length?Math.max(...faceVecs.flatMap(f=>r.face.map(x=>id.cosine(f,x)))):null;
      const bodyScore=body&&r.body.length?Math.max(...r.body.map(x=>id.cosine(body,x))):null;
      pairs.push({media_id:c.media_id,kind:c.kind,character_id:cand.character_id,truth:truths.has(cand.character_id),faces:faces.length,face:face==null?null:Number(face.toFixed(4)),body:bodyScore==null?null:Number(bodyScore.toFixed(4))});}
  }
  const faceT=[0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6],bodyT=[0.4,0.5,0.6,0.7,0.75,0.8,0.85,0.9];
  const result={kind:'local-identity-benchmark',method:LOCAL_IDENTITY_METHOD,created_at:new Date().toISOString(),seconds:Math.round((Date.now()-started)/1000),cases:cases.length,pictures_without_face:noFace,
    face:rates(pairs,'face',faceT),body:rates(pairs,'body',bodyT),note:'Similarity only. No canon write; thresholds stay unset until the owner locks them.',pairs};
  await fs.mkdir(path.dirname(report),{recursive:true});await fs.writeFile(report,JSON.stringify(result,null,2));
  console.log(JSON.stringify({mode:'local',cases:cases.length,seconds:result.seconds,pictures_without_face:noFace,face:{positives:result.face.positives,negatives:result.face.negatives,missing:result.face.missing},body:{positives:result.body.positives,negatives:result.body.negatives,missing:result.body.missing},network_calls:0,canon_writes:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({code:e.code||e.message}));process.exitCode=1;});
