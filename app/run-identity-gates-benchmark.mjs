#!/usr/bin/env node
// Gate benchmark for the local face method (2026-11-12). Read-only: opens the catalogue read-only,
// uses the face embeddings the app already cached (identity_faces), writes one report outside
// OneDrive. No network, no catalogue or canon write, no thresholds chosen.
//
// Two test sets:
//  A. approved face references, leave-one-out: each reference against all other references;
//  B. one-face pictures linked to exactly one character (image-level links, so a little noisy).
//     A picture whose character has no face reference is an "unknown": any acceptance is false.
// For each threshold and margin: how many are accepted, how many of those are wrong, coverage.
import {DatabaseSync} from 'node:sqlite';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {LOCAL_IDENTITY_METHOD} from './local-identity.mjs';

const MIN_DET=0.6,MIN_PX=40;
const vec=b=>b?new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)):null;
const cos=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const planning="lower(replace(m.relative_path,'\\','/')) LIKE lower('20_SHARED_MEDIA/Unassigned/Generation plans, ideas') || '/%'";

export function benchmark(db,{method=LOCAL_IDENTITY_METHOD,thresholds=[0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7],margins=[0.05,0.1,0.15]}={}){
  const faces=mid=>db.prepare('SELECT face_index,box_json,det_score,face_px,embedding FROM identity_faces WHERE media_id=? AND method=? AND face_index>=0').all(mid,method).map(f=>({...f,box:JSON.parse(f.box_json),v:vec(f.embedding)}));
  const canon=db.prepare('SELECT c.character_id,c.references_json,ch.name FROM canon c JOIN characters ch ON ch.id=c.character_id LEFT JOIN character_ui u ON u.character_id=c.character_id WHERE u.merged_into IS NULL AND c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id)').all();
  const refs=[];
  for(const r of canon){let list=[];try{list=JSON.parse(r.references_json||'[]');}catch{}
    for(const x of list){if(x?.role!=='face')continue;const fs_=faces(x.media_id);if(!fs_.length)continue;
      const crop=x.crop,inCrop=crop?fs_.filter(f=>{const cx=f.box.x+f.box.w/2,cy=f.box.y+f.box.h/2;return cx>=crop.x&&cx<=crop.x+crop.w&&cy>=crop.y&&cy<=crop.y+crop.h;}):fs_;
      if(crop&&inCrop.length!==1)continue;
      const f=inCrop.sort((a,b)=>b.box.w*b.box.h-a.box.w*a.box.h)[0];refs.push({character_id:r.character_id,name:r.name,media_id:x.media_id,v:f.v});}}
  const refMedia=new Set(refs.map(r=>r.media_id)),withRefs=new Set(refs.map(r=>r.character_id));
  // Best score per character over a gallery, optionally leaving one reference out.
  function rank(v,skip=null){const best=new Map();for(const r of refs){if(r===skip)continue;const s=cos(v,r.v);if(!best.has(r.character_id)||s>best.get(r.character_id).score)best.set(r.character_id,{character_id:r.character_id,name:r.name,score:s});}return [...best.values()].sort((a,b)=>b.score-a.score);}
  const cases=[];
  for(const r of refs){if(refs.filter(x=>x.character_id===r.character_id).length<2)continue;const rk=rank(r.v,r);cases.push({set:'references',truth:r.character_id,top:rk[0],second:rk[1]});}
  const linked=db.prepare(`SELECT m.id,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) ids FROM active_media m WHERE m.kind='image' AND NOT (${planning}) AND (SELECT count(*) FROM depictions d WHERE d.media_id=m.id)=1`).all();
  for(const m of linked){
    if(refMedia.has(m.id))continue;
    const fs_=faces(m.id).filter(f=>(f.det_score??0)>=MIN_DET&&(f.face_px??0)>=MIN_PX);if(fs_.length!==1)continue;
    const rk=rank(fs_[0].v);cases.push({set:withRefs.has(m.ids)?'linked':'unknown',truth:withRefs.has(m.ids)?m.ids:null,top:rk[0],second:rk[1]});
  }
  const table=[];
  for(const t of thresholds)for(const mg of margins){
    const row={threshold:t,margin:mg};
    for(const set of ['references','linked','unknown']){
      const c=cases.filter(x=>x.set===set),acc=c.filter(x=>x.top&&x.top.score>=t&&(!x.second||x.top.score-x.second.score>=mg)),wrong=acc.filter(x=>x.top.character_id!==x.truth);
      row[set]={cases:c.length,accepted:acc.length,wrong:wrong.length,coverage:c.length?+(acc.length/c.length).toFixed(3):null};
    }
    table.push(row);
  }
  // Same-person vs different-person similarity of reference pairs.
  const same=[],diff=[];for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++)(refs[i].character_id===refs[j].character_id?same:diff).push(cos(refs[i].v,refs[j].v));
  const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(3):null;};
  return {kind:'identity-gates-benchmark',method,created_at:new Date().toISOString(),references:refs.length,characters_with_references:withRefs.size,
    cases:{references:cases.filter(c=>c.set==='references').length,linked:cases.filter(c=>c.set==='linked').length,unknown:cases.filter(c=>c.set==='unknown').length},
    pairs:{same:{n:same.length,p10:q(same,0.1),median:q(same,0.5)},different:{n:diff.length,median:q(diff,0.5),p99:q(diff,0.99),max:q(diff,1)}},
    table,note:'Similarity only. No canon write. Linked pictures carry image-level links, so some "wrong" answers may be wrong links instead.',
    worst:cases.filter(c=>c.truth&&c.top&&c.top.character_id!==c.truth&&c.top.score>=0.4).map(c=>({set:c.set,score:+c.top.score.toFixed(3),said:c.top.name})).slice(0,20)};
}

async function main(){
  const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2)o[a[i]]=a[i+1];
  if(!o['--database']||!o['--report'])throw Error('Usage: --database <universe.sqlite> --report <file outside OneDrive>');
  const report=path.resolve(o['--report']);if(report.toLowerCase().includes('onedrive'))throw Error('PRIVATE_LOCAL_REPORT_REQUIRED');
  const db=new DatabaseSync(path.resolve(o['--database']),{readOnly:true});let r;try{r=benchmark(db);}finally{db.close();}
  await fs.mkdir(path.dirname(report),{recursive:true});await fs.writeFile(report,JSON.stringify(r,null,2));
  console.log(JSON.stringify({references:r.references,cases:r.cases,pairs:r.pairs,network_calls:0,canon_writes:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
