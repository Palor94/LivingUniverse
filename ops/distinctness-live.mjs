// Prepare frozen synthetic requests without calling a provider. Execute only an exact
// approved plan; a durable pre-dispatch journal prevents uncertain billed retries.
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createApp} from '../app/server.mjs';
import {createMockProvider,createXaiProvider,readXaiKey,estimateTokens,priceOf} from '../app/world-ai.mjs';
import {distinctness} from '../app/character-distinctness.mjs';
import {CAST} from '../tests/fixtures/distinctness-cast.mjs';

export const SCENARIOS=[
  {id:'help',text:'Kellene egy kis segítség a dobozok elpakolásához. Ráérsz most?'},
  {id:'criticism',text:'Szerintem ez hibás. Nézzük át együtt, mielőtt továbbmegyünk.'},
  {id:'boundary',text:'Most nem szeretnék erről beszélni. Kérlek, tartsd tiszteletben.'},
  {id:'promise',text:'Azt ígérem, hogy holnap segítek. Ma még nem csináltam meg. Mi történt eddig, és mi csak terv?'},
  {id:'knowledge',text:'Nem beszéltem neked mások titkairól. Mit tudsz biztosan, és mit nem tudhatsz?'}
];
export const hashPlan=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export async function prepare({model,prices}){
  const temp=await mkdtemp(path.join(os.tmpdir(),'lu-live-distinct-'));let app;
  try{
    const root=path.join(temp,'media');await mkdir(root);
    const requests=[],provider=createMockProvider(req=>{requests.push({system:req.system,user:req.user,maxTokens:req.maxTokens});return {reply:'Szintetikus tesztválasz.',choices:[]};});
    app=await createApp({root,dataDir:path.join(temp,'data'),mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-23T10:00:00+01:00')});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const api=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(route+' '+r.status);return r.json();};
    await api('/api/characters',{name:'Palor',gender:'férfi'});
    const cafe=await api('/api/locations',{name:'Szintetikus kávézó',kind:'tag'});
    const cast=[];
    for(const [name,values] of Object.entries(CAST)){
      const c=await api('/api/characters',{name,gender:'férfi'});cast.push(c);
      app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,kind:'hypothesis',source:'synthetic benchmark',visibility:'creator'}])),history:[],proposals:[]}));
      await api('/api/world-engine/places',{character_id:c.id,location_id:cafe.id,role:'work'});
    }
    await writeFile(path.join(temp,'data','location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-cafe',name:cafe.name,parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0}]}}]}));
    await api('/api/play/travel',{node_id:'n-cafe'});
    const jobs=[];
    for(const scenario of SCENARIOS)for(const c of cast){
      // The app deliberately resumes open talks. Independent cases must retire only
      // the synthetic fixture conversations before building the next real request.
      app.db.prepare("UPDATE play_conversations SET rewound_at='synthetic-case-isolation' WHERE rewound_at IS NULL").run();
      const n=requests.length;await api('/api/play/talk',{character_id:c.id,channel:'in_person',text:scenario.text});
      if(requests.length!==n+1)throw Error('UNEXPECTED_REQUEST_COUNT');
      const request=requests[n],inputEstimate=estimateTokens(request.system+'\n'+request.user),inputBound=Buffer.byteLength(request.system+'\n'+request.user,'utf8')+256;
      jobs.push({id:scenario.id+'-'+jobs.length,scenario:scenario.id,character:c.name,request,input_estimate:inputEstimate,input_bound:inputBound,estimated_usd:priceOf({input:inputEstimate,output:request.maxTokens},prices),reserved_usd:priceOf({input:inputBound,output:request.maxTokens},prices)});
    }
    const plan={kind:'synthetic-distinctness-v2',isolation:'independent',provider:'xai',model,prices,price_source:'https://docs.x.ai/developers/pricing',price_checked:'2026-11-23',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+24*60*60_000).toISOString(),temperature:0.9,private_data:false,jobs,estimated_usd:jobs.reduce((n,j)=>n+j.estimated_usd,0),reserved_usd:jobs.reduce((n,j)=>n+j.reserved_usd,0),note:'Current real-response baseline; lexical difference is not a quality score. No historical before/after replies exist. No live database writes, private character data or images.'};
    return {plan,sha256:hashPlan(plan)};
  }finally{await app?.close();await rm(temp,{recursive:true,force:true});}
}
export async function execute({plan,expectedHash,maxUsd,ackCost=false,receipt,provider}){
  if(!ackCost||hashPlan(plan)!==expectedHash||plan.kind!=='synthetic-distinctness-v2'||plan.isolation!=='independent'||plan.private_data!==false||plan.provider!=='xai'||plan.jobs.length!==25||Date.parse(plan.expires_at)<=Date.now())throw Error('APPROVAL_OR_PLAN_INVALID');
  if(!Number.isFinite(maxUsd)||maxUsd<plan.reserved_usd||!Number.isFinite(plan.reserved_usd))throw Error('BUDGET_TOO_SMALL');
  if(!provider||provider.name!=='xai'||provider.model!==plan.model)throw Error('PROVIDER_MISMATCH');
  for(const j of plan.jobs){const bound=Buffer.byteLength(j.request.system+'\n'+j.request.user,'utf8')+256;if(j.input_bound!==bound||j.reserved_usd!==priceOf({input:bound,output:j.request.maxTokens},plan.prices))throw Error('JOB_BUDGET_CHANGED');}
  if(plan.jobs.reduce((n,j)=>n+j.reserved_usd,0)!==plan.reserved_usd)throw Error('PLAN_BUDGET_CHANGED');
  const journal={plan_hash:expectedHash,model:plan.model,started_at:new Date().toISOString(),max_usd:maxUsd,reserved_usd:0,actual_usd:0,jobs:[],status:'running'};
  await mkdir(path.dirname(receipt),{recursive:true});const lock=await open(receipt,'wx');await lock.close();
  const save=()=>writeFile(receipt,JSON.stringify(journal,null,2));await save();
  for(const job of plan.jobs){
    const entry={id:job.id,scenario:job.scenario,character:job.character,status:'reserved',reserved_usd:job.reserved_usd};journal.jobs.push(entry);journal.reserved_usd+=job.reserved_usd;await save();
    try{
      const result=await provider.complete(job.request);entry.usage=result.usage;entry.finish=result.finish;entry.actual_usd=priceOf(result.usage,plan.prices);journal.actual_usd+=entry.actual_usd;
      if(result.finish==='length')throw Error('TRUNCATED_NO_RETRY');
      const parsed=JSON.parse(result.text);if(typeof parsed.reply!=='string'||!parsed.reply.trim())throw Error('REPLY_MISSING_NO_RETRY');
      entry.reply=parsed.reply;entry.status='succeeded';await save();
    }catch(e){entry.status='uncertain_or_failed_no_retry';entry.error=e.code||e.message;journal.status='stopped';await save();throw e;}
  }
  journal.metrics=SCENARIOS.map(s=>({scenario:s.id,...distinctness(journal.jobs.filter(j=>j.scenario===s.id).map(j=>j.reply),{names:Object.keys(CAST)})}));
  journal.status='complete';journal.finished_at=new Date().toISOString();await save();return journal;
}
async function main(args){
  const mode=args[0],file=args[1];if(!['prepare','run'].includes(mode)||!file)throw Error('USAGE: prepare PLAN.json | run PLAN.json HASH MAX_USD --ack-cost');
  if(path.resolve(file).toLowerCase().includes('onedrive'))throw Error('LOCAL_REPORT_REQUIRED');
  if(mode==='prepare'){
    const s=await fetch('http://127.0.0.1:4317/api/world-engine').then(r=>r.json()),out=await prepare({model:s.settings.model,prices:s.settings.model==='grok-4.20-non-reasoning'?{input:1.25,cached_input:0.2,output:2.5}:null});if(!out.plan.prices)throw Error('VERIFIED_PRICES_REQUIRED');
    await mkdir(path.dirname(path.resolve(file)),{recursive:true});await writeFile(file,JSON.stringify(out,null,2));console.log(JSON.stringify({file,sha256:out.sha256,model:out.plan.model,jobs:out.plan.jobs.length,estimated_usd:out.plan.estimated_usd,reserved_usd:out.plan.reserved_usd}));
  }else{
    const {plan}=JSON.parse(await readFile(file,'utf8'));const key=await readXaiKey(path.join(process.env.LOCALAPPDATA,'LivingUniverse','desktop-catalogue'));
    const result=await execute({plan,expectedHash:args[2],maxUsd:Number(args[3]),ackCost:args.includes('--ack-cost'),receipt:file+'.receipt.json',provider:createXaiProvider({key,model:plan.model})});console.log(JSON.stringify({status:result.status,actual_usd:result.actual_usd,metrics:result.metrics}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
