import {randomUUID,createHash} from 'node:crypto';
import {GenerationError} from './image-providers.mjs';

// The grant freezes existing, reviewed manifests. It never widens their scope or
// authorizes an estimate upload. Reservations survive errors and process restarts.
export function installGenerationSessions({one,run,all,transaction,imageGeneration,viewRun=rid=>imageGeneration.view(rid),clock=()=>Date.now()}){
  const prefix='generation-session:',hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const fail=(code,message,status=409)=>{throw new GenerationError(code,message,status);};
  const shape=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('INVALID_ARGUMENT','Invalid session fields.');};
  const save=value=>run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',prefix+value.id,JSON.stringify(value));
  const get=id=>{const row=typeof id==='string'&&one('SELECT value FROM application_settings WHERE key=?',prefix+id);if(!row)fail('NOT_FOUND','Generation session not found.',404);return JSON.parse(row.value);};
  const event=(value,type,actor,detail={})=>value.events.push({type,actor,at:new Date(clock()).toISOString(),...detail});
  function quote(plan){const estimate=plan.manifest.sogni_estimate||plan.manifest.estimate;
    if(plan.manifest.provider!=='sogni'||estimate?.source!=='sogni'||typeof estimate.usd!=='number'||!Number.isFinite(estimate.usd)||estimate.usd<0||!Number.isFinite(estimate.capacity_units)||estimate.capacity_units<=0)fail('SESSION_PRICE_UNKNOWN','A provider-verified USD estimate is required for every session job.');
    if(!Number.isFinite(Date.parse(estimate.estimated_at))||clock()-Date.parse(estimate.estimated_at)>300000||Date.parse(estimate.estimated_at)>clock()+1000)fail('ESTIMATE_EXPIRED','The cost estimate expired. Prepare and review a fresh plan.');
    if(estimate.capacity_units>plan.manifest.max_estimated_capacity_units)fail('COST_LIMIT','The estimate exceeds the approved capacity ceiling.');
    return {images:plan.manifest.n||1,capacity:estimate.capacity_units,micro_usd:Math.ceil(estimate.usd*1e6)};
  }
  function current(job){const plan=viewRun(job.run_id);if(plan.manifest_hash!==job.manifest_hash||hash(plan.manifest)!==job.manifest_hash||!['pending','approved'].includes(plan.status)||!(Date.parse(plan.expires_at)>clock()))fail('SESSION_SCOPE_CHANGED','A frozen session job changed or expired.');quote(plan);return plan;}
  function prepare(args,actor){shape(args,['run_ids','expires_at','max_images','max_capacity_units','max_usd']);
    if(!Array.isArray(args.run_ids)||!args.run_ids.length||args.run_ids.length>50||new Set(args.run_ids).size!==args.run_ids.length)fail('INVALID_ARGUMENT','Select one to fifty distinct prepared runs.');
    const expiry=Date.parse(args.expires_at);if(!Number.isFinite(expiry)||expiry<=clock()||expiry>clock()+86400000)fail('INVALID_ARGUMENT','Choose a session expiry within twenty-four hours.');
    if(!Number.isInteger(args.max_images)||args.max_images<1||args.max_images>200||!Number.isFinite(args.max_capacity_units)||args.max_capacity_units<=0||args.max_capacity_units>1e9||typeof args.max_usd!=='number'||!Number.isFinite(args.max_usd)||args.max_usd<=0||args.max_usd>1e5)fail('INVALID_ARGUMENT','Choose finite positive session limits.');
    const jobs=args.run_ids.map(run_id=>{const plan=viewRun(run_id);if(!['pending','approved'].includes(plan.status)||!(Date.parse(plan.expires_at)>clock()))fail('INVALID_STATE','Select pending or approved unexpired plans.');return {run_id,manifest_hash:plan.manifest_hash,manifest:plan.manifest};});
    const scope={jobs,expires_at:new Date(expiry).toISOString(),max_images:args.max_images,max_capacity_units:args.max_capacity_units,max_micro_usd:Math.floor(args.max_usd*1e6)},value={id:randomUUID(),status:'draft',scope,scope_hash:hash(scope),reservations:[],events:[]};event(value,'prepared',actor);save(value);return value;
  }
  function approve(id,args,actor){shape(args,['scope_hash','acknowledge_external_upload_and_cost']);return transaction(()=>{const value=get(id);if(value.scope_hash!==args.scope_hash||hash(value.scope)!==args.scope_hash)fail('SESSION_SCOPE_CHANGED','Review this exact session scope.');if(value.status==='approved')return value;if(value.status!=='draft'||Date.parse(value.scope.expires_at)<=clock())fail('SESSION_EXPIRED','The session is no longer approvable.');if(args.acknowledge_external_upload_and_cost!==true)fail('APPROVAL_REQUIRED','Approve the listed reference uploads and the session cost ceiling.');
    let images=0,capacity=0,cost=0;for(const job of value.scope.jobs){const q=quote(current(job));images+=q.images;capacity+=q.capacity;cost+=q.micro_usd;}
    if(images>value.scope.max_images||capacity>value.scope.max_capacity_units||cost>value.scope.max_micro_usd)fail('SESSION_BUDGET','The fixed jobs exceed the session limits.');value.status='approved';value.approved_by=actor;event(value,'approved_external_upload_and_cost',actor);save(value);return value;});}
  // Called inside the run's dispatch transaction, after asynchronous reference
  // validation. No await may separate the reservation and transition to running.
  function reserve(id,runId,manifestHash){const value=get(id);if(value.status!=='approved'||Date.parse(value.scope.expires_at)<=clock())fail('SESSION_EXPIRED','The session expired or was revoked.');const job=value.scope.jobs.find(job=>job.run_id===runId);if(!job||job.manifest_hash!==manifestHash)fail('SESSION_SCOPE_CHANGED','This run is outside the approved session.');if(value.reservations.some(item=>item.run_id===runId))fail('SESSION_ALREADY_RESERVED','This job was already reserved; inspect its outcome.');const q=quote(current(job)),used=value.reservations.reduce((sum,item)=>({images:sum.images+item.images,capacity:sum.capacity+item.capacity,micro_usd:sum.micro_usd+item.micro_usd}),{images:0,capacity:0,micro_usd:0});
    if(used.images+q.images>value.scope.max_images||used.capacity+q.capacity>value.scope.max_capacity_units||used.micro_usd+q.micro_usd>value.scope.max_micro_usd)fail('SESSION_BUDGET','The session budget is exhausted.');value.reservations.push({run_id:runId,manifest_hash:manifestHash,...q,at:new Date(clock()).toISOString()});event(value,'reserved',value.approved_by,{run_id:runId});save(value);return value.approved_by;
  }
  function revoke(id,actor){return transaction(()=>{const value=get(id);if(value.status==='revoked')return value;value.status='revoked';event(value,'revoked',actor);save(value);return value;});}
  return {get,prepare,approve,reserve,revoke,list:()=>all('SELECT value FROM application_settings WHERE key LIKE ? ORDER BY rowid DESC LIMIT 30',prefix+'%').map(row=>JSON.parse(row.value))};
}
