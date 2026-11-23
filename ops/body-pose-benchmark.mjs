// Bounded offline CPU trial; model/runtime must already be explicitly installed.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {bodyProportions,proportionSimilarity,BODY_PROPORTIONS_METHOD} from '../app/body-proportions.mjs';
import {qualityCrop} from '../app/identity-quality.mjs';
import {rates} from '../app/run-local-identity-benchmark.mjs';
const argv=process.argv.slice(2),o={};for(let i=0;i<argv.length;i+=2)o[argv[i]]=argv[i+1];
const numPoses=Number(o['--num-poses']||1);if(![1,2].includes(numPoses))throw Error('INVALID_POSE_COUNT');
for(const k of ['--database','--media-root','--report'])if(!o[k])throw Error('PATHS_REQUIRED');
const runtime=path.join(process.env.LOCALAPPDATA,'LivingUniverse','vision-body-pose-1.2.3-full-1'),installed=JSON.parse(await readFile(path.join(runtime,'installation.json'),'utf8'));
const report=path.resolve(o['--report']);if(report.toLowerCase().includes('onedrive'))throw Error('LOCAL_REPORT_REQUIRED');
if(createHash('sha256').update(await readFile(path.join(runtime,'pose_landmarker_full.task'))).digest('hex')!==installed.model_sha256)throw Error('MODEL_CHANGED');
const root=await realpath(o['--media-root']),db=new DatabaseSync(o['--database'],{readOnly:true});let refs=[];
try{for(const c of db.prepare('SELECT c.* FROM canon c WHERE c.rowid=(SELECT max(x.rowid) FROM canon x WHERE x.character_id=c.character_id)').all())for(const r of JSON.parse(c.references_json||'[]')){
  if(r.role!=='body'||!r.sha256)continue;const m=db.prepare("SELECT relative_path FROM active_media WHERE id=? AND kind='image'").get(r.media_id);if(!m)continue;
  if(!r.crop&&db.prepare('SELECT count(*) n FROM depictions WHERE media_id=?').get(r.media_id).n!==1)continue;
  refs.push({...r,character_id:c.character_id,relative_path:m.relative_path});
}}finally{db.close();}
const counts=new Map();for(const r of refs)counts.set(r.character_id,(counts.get(r.character_id)||0)+1);refs.sort((a,b)=>(counts.get(b.character_id)>1)-(counts.get(a.character_id)>1)||a.character_id.localeCompare(b.character_id));refs=refs.slice(0,24);
const req=createRequire(path.join(process.env.LOCALAPPDATA,'LivingUniverse','vision-local','node','package.json')),sharp=req('sharp');
const server=createServer(async(request,response)=>{try{const p=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(p==='/'){response.setHeader('Content-Type','text/html');response.end('<html><body></body></html>');return;}
  if(p==='/body-proportions.mjs'){response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL('../app/body-proportions.mjs',import.meta.url)));return;}
  const file=path.resolve(runtime,'.'+p),rel=path.relative(runtime,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('PATH_ESCAPE');const actual=await realpath(file);if(path.relative(runtime,actual).startsWith('..')||!(await stat(actual)).isFile())throw Error('INVALID_FILE');
  response.setHeader('Content-Type',p.endsWith('.mjs')||p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');response.end(await readFile(actual));
}catch{response.writeHead(404);response.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_INFERENCE_TIMEOUT')),ms);})]).finally(()=>clearTimeout(timer));};
try{
  let pw;try{pw=await import('playwright-core');}catch{pw=await import(pathToFileURL(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs')).href);}
  browser=await pw.chromium.launch({channel:'msedge',headless:true});
  const createPage=async()=>{const p=await browser.newPage();await p.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await p.goto(origin);
    await bounded(p.evaluate(async count=>{const {FilesetResolver,PoseLandmarker}=await import('/vision_bundle.mjs');globalThis.pose=await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/wasm'),{baseOptions:{modelAssetPath:'/pose_landmarker_full.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:count,outputSegmentationMasks:true});},numPoses),60000);return p;};
  let page=await createPage();console.error('Offline CPU runtime ready.');
  const rows=[],abstained=[];
  for(const r of refs){console.error('Reference '+(rows.length+abstained.length+1)+'/'+refs.length);try{
    const file=await realpath(path.resolve(root,r.relative_path)),rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('PATH_ESCAPE');
    const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error('REFERENCE_CHANGED');
    let image=sharp(bytes).rotate().removeAlpha().toColourspace('srgb'),crop=qualityCrop(r.crop);if(crop){const m=await image.metadata();const left=Math.floor(crop.x*m.width),top=Math.floor(crop.y*m.height);image=image.extract({left,top,width:Math.max(1,Math.min(m.width-left,Math.round(crop.w*m.width))),height:Math.max(1,Math.min(m.height-top,Math.round(crop.h*m.height)))});}
    const png=await image.resize(512,512,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
    const measurement=await bounded(page.evaluate(async encoded=>{const {bodyProportions}=await import('/body-proportions.mjs'),image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();const result=pose.detect(image),mask=result.segmentationMasks?.[0];try{return bodyProportions({width:image.naturalWidth,height:image.naturalHeight,landmarks:result.landmarks,mask:mask?{width:mask.width,height:mask.height,data:mask.getAsFloat32Array()}:null});}finally{for(const m of result.segmentationMasks||[])m.close();}},png.toString('base64')),20000);
    if(!measurement.features)throw Error(measurement.reason);rows.push({character_id:r.character_id,media_id:r.media_id,sha256:r.sha256,measurement});
  }catch(e){abstained.push({media_id:r.media_id,reason:e.message});if(/Aborted|LOCAL_INFERENCE_TIMEOUT|Target closed/.test(e.message)){await page.close();page=await createPage();}}console.error('Processed '+(rows.length+abstained.length));}
  const pairs=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];if(a.media_id===b.media_id||a.sha256===b.sha256)continue;pairs.push({truth:a.character_id===b.character_id,body:proportionSimilarity(a.measurement,b.measurement)});}
  const result={method:BODY_PROPORTIONS_METHOD,model_sha256:installed.model_sha256,sdk_version:installed.plan.sdk.version,num_poses:numPoses,max_image_edge:512,selected:refs.length,usable:rows.length,abstained,metrics:rates(pairs,'body',[.5,.6,.7,.8,.9,.95]),network_uploads:0,canon_writes:0,threshold_selected:false,rows,note:'2D pose/silhouette shape cues, affected by clothing/view. No face feature and no identity certification. Small approved-reference pair sample; not a calibrated automatic pass.'};
  await mkdir(path.dirname(report),{recursive:true});await writeFile(report,JSON.stringify(result,null,2));console.log(JSON.stringify({report,selected:refs.length,usable:rows.length,abstained:abstained.length,metrics:result.metrics}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
