// Manual, opt-in real-model trial. Never imported by the automatic test suite.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {analysisHash} from '../app/analysis-model.mjs';
import {configuredAnalysisProviders} from '../app/analysis-providers.mjs';

const args=process.argv.slice(2),flags=new Set(['--prepare','--run','--trace']),values=new Set(['--output','--endpoint','--model','--digest','--limit','--samples']);
const opts={};for(let i=0;i<args.length;i++){const key=args[i];if(flags.has(key))opts[key]=true;else if(values.has(key)&&args[i+1]&&!args[i+1].startsWith('--'))opts[key]=args[++i];else throw Error('Unknown or incomplete trial argument: '+key);}
if(!opts['--output']||!!opts['--prepare']===!!opts['--run'])throw Error('Choose --prepare or --run and an explicit --output directory outside OneDrive.');
const output=path.resolve(opts['--output']);if(output.toLowerCase().includes('onedrive')||output===path.parse(output).root)throw Error('Trial output must be isolated outside OneDrive.');
const limit=Number(opts['--limit']??opts['--samples']?.split(',').length??3);if(!Number.isInteger(limit)||limit<1||limit>3)throw Error('--limit must be 1, 2 or 3.');
await fs.mkdir(output,{recursive:true});
if(opts['--run']&&await fs.stat(path.join(output,'report.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('A prior report exists; choose a fresh output directory to preserve trial history.');

function bitmap(draw){
  const width=384,height=256,stride=width*3,b=Buffer.alloc(54+stride*height,255);b.fill(0,0,54);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(width,18);b.writeInt32LE(height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(stride*height,34);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [r,g,blue]=draw(x,y),p=54+(height-1-y)*stride+x*3;b[p]=blue;b[p+1]=g;b[p+2]=r;}return b;
}
const samples=[
  {id:'shapes',name:'synthetic-shapes.bmp',expected:{description:'Red square on the left, blue circle in the middle, green triangle on the right, white background. No people or text.',exact_world_location:null},bytes:bitmap((x,y)=>{
    if(x>=24&&x<112&&y>=84&&y<172)return [225,35,35];if((x-192)**2+(y-128)**2<=44**2)return [35,75,225];if(y>=78&&y<=174&&Math.abs(x-320)<=(y-78)*.48)return [30,170,65];return [255,255,255];
  })},
  {id:'beach',name:'synthetic-beach.bmp',expected:{description:'Simple geometric illustration: pale blue sky, yellow sun at upper right, blue sea, sand. No people, buildings or text. Generic seaside only.',exact_world_location:null},bytes:bitmap((x,y)=>{
    if((x-320)**2+(y-45)**2<23**2)return [255,210,25];return y<110?[150,210,245]:y<177?[35,125,210]:[240,215,150];
  })},
  {id:'blank',name:'synthetic-blank.bmp',expected:{description:'Uniform white image. No people, clothing, objects, scene or text.',exact_world_location:null},bytes:bitmap(()=>[255,255,255])}
];
const mediaDir=path.join(output,'media');await fs.mkdir(mediaDir,{recursive:true});
for(const sample of samples){const file=path.join(mediaDir,sample.name);let existing;try{existing=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}if(existing&&!existing.equals(sample.bytes))throw Error('Refusing to replace a changed trial image.');if(!existing)await fs.writeFile(file,sample.bytes,{flag:'wx'});}
const dataset={version:1,synthetic:true,private_media:false,samples:samples.map(({bytes,...s})=>({...s,sha256:analysisHash(bytes),width:384,height:256,size:bytes.length}))};
const selected=opts['--samples']?opts['--samples'].split(',').map(id=>{const s=samples.find(v=>v.id===id);if(!s)throw Error('Unknown synthetic sample: '+id);return s;}):samples;
if(new Set(selected.map(s=>s.id)).size!==selected.length||selected.length<limit)throw Error('Select enough distinct synthetic samples for the limit.');
await fs.writeFile(path.join(output,'dataset.json'),JSON.stringify(dataset,null,2));
if(opts['--prepare']){console.log(JSON.stringify({prepared:true,output,dataset},null,2));process.exit(0);}

const endpoint=opts['--endpoint'],model=opts['--model'],digest=opts['--digest'];
if(!endpoint||!model||!/^sha256:[a-f0-9]{64}$/u.test(digest??''))throw Error('Real execution requires explicit --endpoint, --model and full --digest.');
const url=new URL(endpoint);if(!['127.0.0.1','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.pathname!=='/api/chat'||url.username||url.password||url.search||url.hash)throw Error('Only explicit HTTP loopback /api/chat is allowed.');
const dataDir=path.join(output,'catalogue-'+randomUUID());
const providerConfig={enabled:true,endpoint,model,model_revision:digest,local_only_confirmed:true,timeout_ms:300000,max_response_bytes:131072,max_output_tokens:2048};
const report={kind:'real-local-ollama-smoke',started_at:new Date().toISOString(),synthetic:true,paid_api:false,private_media:false,endpoint,model,model_revision:digest,provider_config:providerConfig,dataset_version:dataset.version,catalogue_dir:dataDir,items:[],recognition_accuracy_benchmark:false};
const traceTasks=[];let traceOrdinal=0;
const tracedFetch=async(url,init)=>{
  if(!String(url).startsWith(new URL(endpoint).origin+'/api/'))throw Error('Diagnostic transport is loopback-only.');
  const response=await fetch(url,init);
  if(new URL(url).pathname==='/api/chat'){
    const clone=response.clone(),ordinal=++traceOrdinal;
    traceTasks.push((async()=>{const chunks=[];let size=0,truncated=false;try{for await(const chunk of clone.body){size+=chunk.length;if(size>131072){truncated=true;break;}chunks.push(chunk);}await fs.writeFile(path.join(output,'response-trace-'+ordinal+'.json'),JSON.stringify({http_status:response.status,truncated,body:Buffer.concat(chunks).toString('utf8')},null,2));}catch{await fs.writeFile(path.join(output,'response-trace-'+ordinal+'.json'),JSON.stringify({http_status:response.status,read_failed:true}));}})());
  }return response;
};
let app,base,csrf;const protectedTables=['media','characters','canon','depictions','relationships','media_notes','media_roles','media_categorization','media_tags','media_locations','media_location_links'];
const snapshot=()=>Object.fromEntries(protectedTables.map(t=>[t,app.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
async function call(route,body,method=body?'POST':'GET'){
  const response=await fetch(base+route,{method,signal:AbortSignal.timeout(60000),headers:body?{'Content-Type':'application/json',Origin:base,'X-LU-Analysis-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.code||'TRIAL_API_FAILED');return result;
}
try{
  const config={providers:{ollama:providerConfig,openai:{enabled:false}}};
  app=await createApp({root:mediaDir,dataDir,mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:config,...(opts['--trace']?{mediaAnalysisTestOptions:configuredAnalysisProviders(config,{fetchImpl:tracedFetch})}:{})});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;csrf=(await call('/api/media-analysis')).csrf;
  for(const sample of selected.slice(0,limit)){
    const mediaId=randomUUID(),timestamp=new Date().toISOString();app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)").run(mediaId,sample.name,sample.bytes.length,timestamp,timestamp);
    await call('/api/media/'+mediaId,{character_ids:[],notes:'Synthetic local trial; no private records.',tags:'',categorization_complete:false},'PUT');
    const before=snapshot(),chosen={media_ids:[mediaId],provider_id:'ollama',goals:['background','lighting']},preview=await call('/api/media-analysis/jobs/preview',chosen),started=performance.now();
    console.log(JSON.stringify({event:'inference_start',sample:sample.id,source_sha256:preview.items[0].source.sha256,derivative_sha256:preview.items[0].derivative.sha256}));
    const job=await call('/api/media-analysis/jobs',{...chosen,preview_hash:preview.preview_hash,request_key:randomUUID()});await app.mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+job.id);
    const unchanged=JSON.stringify(before)===JSON.stringify(snapshot()),item=saved.items[0];report.items.push({sample:sample.id,expected:sample.expected,media_id:mediaId,job_id:job.id,wall_time_ms:Math.round(performance.now()-started),input:preview.items[0],provider:saved.provider,status:item.status,error_code:item.error_code,cache_hit:item.cache_hit,result:item.result,proposals:item.proposals,protected_catalogue_unchanged:unchanged,original_sha256_after:analysisHash(await fs.readFile(path.join(mediaDir,sample.name)))});
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({event:'inference_end',sample:sample.id,status:item.status,error_code:item.error_code,wall_time_ms:report.items.at(-1).wall_time_ms,protected_catalogue_unchanged:unchanged}));
    if(!unchanged)throw Error('PROTECTED_CATALOGUE_CHANGED');if(item.status!=='succeeded')break;
  }
  report.database_integrity=app.db.prepare('PRAGMA integrity_check').get().integrity_check;report.foreign_key_violations=app.db.prepare('PRAGMA foreign_key_check').all().length;
}catch(e){report.failure=String(e.code||e.message||'TRIAL_FAILED').slice(0,300);process.exitCode=1;}
finally{if(app)await app.close();await Promise.all(traceTasks);report.finished_at=new Date().toISOString();report.trace_real_http=!!opts['--trace'];report.complete=report.items.length===limit&&report.items.every(i=>i.status==='succeeded'&&i.protected_catalogue_unchanged&&i.original_sha256_after===i.input.source.sha256);if(!report.complete)process.exitCode=1;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({event:'trial_finished',complete:report.complete,items:report.items.length,failure:report.failure??null,report:path.join(output,'report.json')}));}
