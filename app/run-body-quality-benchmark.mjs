// Bounded local benchmark of current approved body references. No model install/network/writes.
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createLocalIdentity} from './local-identity.mjs';
import {BODY_QUALITY_METHOD,qualityCrop,qualitySimilarity} from './identity-quality.mjs';
import {rates} from './run-local-identity-benchmark.mjs';

export function bodyBenchmarkPairs(rows){
  const pairs=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];if(a.media_id===b.media_id||a.sha256===b.sha256)continue;
    pairs.push({truth:a.character_id===b.character_id,body:qualitySimilarity(a.vector,b.vector)});
  }
  return pairs;
}
export async function main(args){
  const o={};for(let i=0;i<args.length;i+=2)o[args[i]]=args[i+1];
  for(const k of ['--database','--media-root','--report'])if(!o[k])throw Error('PATHS_REQUIRED');
  const report=path.resolve(o['--report']);if(report.toLowerCase().includes('onedrive'))throw Error('PRIVATE_LOCAL_REPORT_REQUIRED');
  const root=await realpath(o['--media-root']),db=new DatabaseSync(o['--database'],{readOnly:true});let refs=[];
  try{for(const c of db.prepare('SELECT c.* FROM canon c WHERE c.rowid=(SELECT max(x.rowid) FROM canon x WHERE x.character_id=c.character_id)').all())for(const r of JSON.parse(c.references_json||'[]')){
    if(r.role!=='body'||!r.sha256)continue;const m=db.prepare("SELECT relative_path FROM active_media WHERE id=? AND kind='image'").get(r.media_id);if(!m)continue;
    const count=db.prepare('SELECT count(*) n FROM depictions WHERE media_id=?').get(r.media_id).n;
    if(!r.crop&&count!==1)continue;refs.push({...r,character_id:c.character_id,canon_id:c.id,relative_path:m.relative_path});
  }}finally{db.close();}
  // Keep pairs from characters with multiple independent approved pictures first.
  const counts=new Map();for(const r of refs)counts.set(r.character_id,(counts.get(r.character_id)||0)+1);
  refs.sort((a,b)=>(counts.get(b.character_id)>1)-(counts.get(a.character_id)>1)||a.character_id.localeCompare(b.character_id));
  refs=refs.slice(0,Math.min(24,Math.max(2,Number(o['--limit'])||12)));
  const engine=await createLocalIdentity(),rows=[],abstained=[];
  for(const r of refs){try{
    const file=await realpath(path.resolve(root,r.relative_path)),rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('PATH_ESCAPE');
    const sha256=createHash('sha256').update(await readFile(file)).digest('hex');if(sha256!==r.sha256)throw Error('REFERENCE_CHANGED');
    const crop=qualityCrop(r.crop),img=await engine.load(file),faces=(await engine.faces(img)).filter(f=>{if(!crop)return true;const x=(f.box[0]+f.box[2])/2/img.width,y=(f.box[1]+f.box[3])/2/img.height;return x>=crop.x&&x<=crop.x+crop.w&&y>=crop.y&&y<=crop.y+crop.h;});if(faces.length>1||!crop&&faces.length!==1)throw Error('PERSON_SCOPE_AMBIGUOUS');
    const vector=Array.from(await engine.bodyEmbedding(img,crop?{x:crop.x,y:crop.y,width:crop.w,height:crop.h}:null,{preserveAspect:true}));rows.push({character_id:r.character_id,media_id:r.media_id,sha256,vector});
  }catch(e){abstained.push({media_id:r.media_id,reason:e.message});}}
  const pairs=bodyBenchmarkPairs(rows),metrics=rates(pairs,'body',[0.4,0.5,0.6,0.7,0.8,0.9]);
  const result={kind:'body-quality-benchmark',method:BODY_QUALITY_METHOD,created_at:new Date().toISOString(),selected:refs.length,usable:rows.length,abstained,metrics,network_calls:0,canon_writes:0,threshold_selected:false,note:'Appearance embedding, not anatomical verification. Leave-source-out reference pairs only; approved reference identities are labels. No target collection labels inferred, no automatic canon gate.'};
  await mkdir(path.dirname(report),{recursive:true});await writeFile(report,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,abstained:abstained.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
