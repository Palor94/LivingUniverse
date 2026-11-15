#!/usr/bin/env node
// Operator-only auto-canon benchmark (docs/AUTO_CANON.md, step 2-3). Runs identity-v1 on the
// held-out set saved from Képműhely › Készültség and compares each answer with the owner's
// reviewed identities. Writes a local report only: no catalogue or canon write, no thresholds
// set. Paid mode needs --ack-upload --ack-cost --ack-adult, --max-usd and OPENAI_API_KEY; a
// failed or uncertain call stops the run (never retried automatically).
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {compareIdentity,estimateIdentityCostUsd,VISION_IDENTITY_METHOD} from './vision-identity.mjs';
import {VISION_TAG_KEY} from './vision-engine.mjs';

const PRICE={input:2,cached:0.1,output:10};
const REFS_PER_CANDIDATE=2;
const hash=s=>createHash('sha1').update(s).digest('hex');
const typeOf=f=>/\.png$/i.test(f)?'image/png':/\.jpe?g$/i.test(f)?'image/jpeg':null;

function parseArgs(argv){
  const o={flags:new Set()};
  for(let i=0;i<argv.length;i++){const a=argv[i];
    if(['--estimate','--trial','--ack-upload','--ack-cost','--ack-adult'].includes(a))o.flags.add(a);
    else if(['--set','--database','--media-root','--report','--max-usd','--limit'].includes(a)&&argv[i+1])o[a]=argv[++i];
    else throw Object.assign(Error('INVALID_BENCHMARK_COMMAND'),{code:'INVALID_BENCHMARK_COMMAND'});}
  return o;
}

// One case per picture: who is really on it (owner-reviewed), the regions, and the candidates
// offered (the true characters plus a deterministic distractor, so false matches can show).
export function buildCases(db,set,{refsPerCandidate=REFS_PER_CANDIDATE}={}){
  const latestCanon=cid=>{const r=db.prepare('SELECT references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1').get(cid);try{return JSON.parse(r?.references_json||'[]').filter(x=>x?.media_id);}catch{return [];}};
  const ready=[];for(const {character_id} of db.prepare('SELECT DISTINCT character_id FROM canon').all()){const refs=latestCanon(character_id),roles=new Set(refs.map(r=>r.role));if(roles.has('face')&&roles.has('body'))ready.push(character_id);}
  ready.sort((a,b)=>hash(a).localeCompare(hash(b)));
  // Paid runs send one face and one body reference; the free local method can use them all.
  const refsFor=cid=>{const refs=latestCanon(cid);const pick=refsPerCandidate>2?refs.filter(r=>['face','body'].includes(r.role)):[refs.find(r=>r.role==='face'),refs.find(r=>r.role==='body')].filter(Boolean);
    return pick.slice(0,refsPerCandidate).map(r=>({media_id:r.media_id,role:r.role,relative_path:db.prepare('SELECT relative_path FROM active_media WHERE id=?').get(r.media_id)?.relative_path||null})).filter(r=>r.relative_path&&typeOf(r.relative_path));};
  const name=cid=>db.prepare('SELECT name FROM characters WHERE id=?').get(cid)?.name||null;
  const cases=[];
  for(const kind of ['solo','multi','unknown'])for(const media_id of set[kind]||[]){
    const row=db.prepare(`SELECT m.relative_path,w.raw_json,wd.document_json FROM active_media m JOIN world_review_sources w ON w.media_id=m.id JOIN world_review_documents wd ON wd.source_id=w.id
      WHERE m.id=? ORDER BY w.rowid DESC LIMIT 1`).get(media_id);if(!row||!typeOf(row.relative_path))continue;
    const doc=JSON.parse(row.document_json),raw=JSON.parse(row.raw_json),regions=new Map((raw.scene_details?.participants||[]).map(p=>[p.id,p.region||null]));
    const people=(doc.participants||[]).filter(p=>!p.ignored).map(p=>({id:p.id,region:regions.get(p.id)??null,truth:p.character_id||null,state:p.identity_state||null}));
    const truths=[...new Set(people.map(p=>p.truth).filter(id=>id&&ready.includes(id)))].slice(0,2);
    const distractor=ready.filter(id=>!people.some(p=>p.truth===id)).sort((a,b)=>hash(media_id+a).localeCompare(hash(media_id+b)));
    const candidateIds=[...truths,...distractor.slice(0,truths.length?1:2)];
    const candidates=candidateIds.map(cid=>({character_id:cid,name:name(cid),references:refsFor(cid)})).filter(c=>c.references.length);
    if(!candidates.length)continue;
    cases.push({kind,media_id,relative_path:row.relative_path,participants:people,candidates});
  }
  return cases;
}

// Scores the model's answers against the owner's reviewed identities (no thresholds chosen).
export function score(cases,results){
  const m={participants:0,correct_match:0,false_match:0,missed:0,abstain_or_unknown:0,correct_reject:0,face_errors:0,body_errors:0,face_checked:0,body_checked:0};
  for(const c of cases){const r=results.find(x=>x.media_id===c.media_id&&x.status==='ok');if(!r)continue;
    const offered=new Set(c.candidates.map(x=>x.character_id));
    for(const p of c.participants){m.participants++;const a=r.result.participants.find(x=>x.participant_id===p.id)||{decision:'abstain',character_id:null};
      const truthOffered=p.truth&&offered.has(p.truth);
      if(a.decision==='match'){if(a.character_id===p.truth)m.correct_match++;else m.false_match++;}
      else{m.abstain_or_unknown++;if(truthOffered)m.missed++;else m.correct_reject++;}
      if(truthOffered&&a.character_id===p.truth){for(const side of ['face','body']){const v=a[side]?.verdict;if(v==='match'||v==='mismatch'){m[side+'_checked']++;if(v==='mismatch')m[side+'_errors']++;}}}
      else if(a.decision==='match'&&a.character_id!==p.truth){for(const side of ['face','body'])if(a[side]?.verdict==='match'){m[side+'_checked']++;m[side+'_errors']++;}}}
  }
  return m;
}

async function main(){
  const o=parseArgs(process.argv.slice(2));
  if(!!o.flags.has('--estimate')===!!o.flags.has('--trial'))throw Object.assign(Error('EXPLICIT_MODE_REQUIRED'),{code:'EXPLICIT_MODE_REQUIRED'});
  for(const k of ['--set','--database','--media-root','--report'])if(!o[k])throw Object.assign(Error('PATHS_REQUIRED'),{code:'PATHS_REQUIRED'});
  const report=path.resolve(o['--report']);if(report.toLowerCase().includes('onedrive'))throw Object.assign(Error('PRIVATE_LOCAL_REPORT_REQUIRED'),{code:'PRIVATE_LOCAL_REPORT_REQUIRED'});
  const set=JSON.parse(await fs.readFile(o['--set'],'utf8'));if(set.kind!=='auto-canon-benchmark-set')throw Object.assign(Error('INVALID_SET'),{code:'INVALID_SET'});
  const db=new DatabaseSync(path.resolve(o['--database']),{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
  let cases;try{cases=buildCases(db,set);}finally{db.close();}
  const limit=o['--limit']?Math.max(1,Math.min(100,Number(o['--limit'])||1)):cases.length;cases=cases.slice(0,limit);
  const maxUsd=o['--max-usd']!=null?Number(o['--max-usd']):null;
  const estimate=estimateIdentityCostUsd(cases.length,{referenceImagesPerTarget:Math.max(...cases.map(c=>c.candidates.reduce((n,x)=>n+x.references.length,0)),0),maxTotalUsd:maxUsd});
  await fs.mkdir(path.dirname(report),{recursive:true});
  const summary={cases:cases.length,by_kind:Object.fromEntries(['solo','multi','unknown'].map(k=>[k,cases.filter(c=>c.kind===k).length])),participants:cases.reduce((n,c)=>n+c.participants.length,0)};
  if(o.flags.has('--estimate')){await fs.writeFile(report,JSON.stringify({kind:'identity-benchmark-estimate',method:VISION_IDENTITY_METHOD,summary,estimate,cases:cases.map(({media_id,kind,candidates})=>({media_id,kind,candidates:candidates.map(c=>c.character_id)}))},null,2));
    console.log(JSON.stringify({mode:'estimate',...summary,usd:estimate.estimated_additional_usd,live_calls:0}));return;}
  for(const f of ['--ack-upload','--ack-cost','--ack-adult'])if(!o.flags.has(f))throw Object.assign(Error('ACK_FLAGS_REQUIRED'),{code:'ACK_FLAGS_REQUIRED'});
  if(!(Number.isFinite(maxUsd)&&maxUsd>0))throw Object.assign(Error('MAX_USD_REQUIRED'),{code:'MAX_USD_REQUIRED'});
  const apiKey=process.env[VISION_TAG_KEY];if(!apiKey)throw Object.assign(Error('MISSING_API_KEY'),{code:'MISSING_API_KEY'});
  const root=path.resolve(o['--media-root']),read=async rel=>fs.readFile(path.join(root,...rel.split(/[\\/]/u)));
  const results=[];let spent=0,started=Date.now();
  for(const c of cases){
    if(spent>=maxUsd){results.push({status:'stopped',reason:'max_usd_reached'});break;}
    try{
      const candidates=[];for(const x of c.candidates)candidates.push({character_id:x.character_id,name:x.name,references:await Promise.all(x.references.map(async r=>({role:r.role,bytes:await read(r.relative_path),contentType:typeOf(r.relative_path)})))});
      const t0=Date.now(),out=await compareIdentity({targetBytes:await read(c.relative_path),targetContentType:typeOf(c.relative_path),participants:c.participants.map(p=>({id:p.id,region:p.region})),candidates,apiKey});
      const u=out.usage,usd=u?((u.input_tokens-u.cached_input_tokens)*PRICE.input+u.cached_input_tokens*PRICE.cached+u.output_tokens*PRICE.output)/1e6:null;if(usd)spent+=usd;
      results.push({media_id:c.media_id,status:'ok',result:out.result,usage:u,usd,ms:Date.now()-t0,request_id:out.request_id});
    }catch(e){results.push({media_id:c.media_id,status:'error',code:e.code||'IDENTITY_FAILED',message:e.message});break;}
  }
  const metrics=score(cases,results);
  await fs.writeFile(report,JSON.stringify({kind:'identity-benchmark-result',method:VISION_IDENTITY_METHOD,ack:{upload:true,cost:true,adult:true,max_usd:maxUsd},summary,spent_usd:Number(spent.toFixed(4)),seconds:Math.round((Date.now()-started)/1000),metrics,
    note:'No canon write. Numeric gates stay unset until the owner locks them (docs/AUTO_CANON.md step 4).',cases:cases.map(({media_id,kind,participants,candidates})=>({media_id,kind,participants,candidates:candidates.map(c=>c.character_id)})),results},null,2));
  console.log(JSON.stringify({mode:'trial',ok:results.filter(r=>r.status==='ok').length,errors:results.filter(r=>r.status==='error').length,spent_usd:Number(spent.toFixed(4)),metrics,canon_writes:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({code:e.code||'BENCHMARK_FAILED',message:e.message}));process.exitCode=1;});
