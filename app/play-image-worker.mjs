import {randomBytes,timingSafeEqual} from 'node:crypto';
import {GenerationError} from './image-providers.mjs';
import {referenceKey} from './reference-crop.mjs';

// A finite executor over the existing needs -> brief -> job -> place pipeline.
// It never estimates/uploads, grants a session or resumes work on its own.
export function installPlayImageWorker({one,all,run,imageGeneration,sessions,playAssets,playMode,origin,palor,identity}){
  const csrf=randomBytes(32).toString('hex'),prefix='play-image-order:',active=new Map();
  const fail=(code,message,status=409)=>{throw new GenerationError(code,message,status);};
  const shape=(args,keys)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!keys.includes(key)))fail('INVALID_ARGUMENT','Invalid picture order fields.',400);};
  const save=value=>run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',prefix+value.run_id,JSON.stringify(value));
  const get=rid=>{const row=one('SELECT value FROM application_settings WHERE key=?',prefix+rid);if(!row)fail('NOT_FOUND','Picture order not found.',404);return JSON.parse(row.value);};
  function bindings(ids,intimate=false){return ids.map(cid=>{const canon=one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid),refs=intimate?origin.allowedReferences(cid):origin.everydayReferences(cid);if(!canon||!refs.length)fail('REFERENCE_NOT_APPROVED','Every pictured character needs eligible approved references.');const chosen=[refs.find(ref=>ref.role==='face'),refs.find(ref=>ref.role==='body')].filter(Boolean);if(!chosen.length)fail('REFERENCE_NOT_APPROVED','Approve a face or body reference first.');return {character_id:cid,revision_id:canon.id,reference_ids:[...new Set(chosen.map(referenceKey))]};});}
  async function context(args){
    shape(args,['target','character_id','location_id','expression','outfit','conversation_id']);let brief,participants;
    if(args.target==='snapshot'){
      const conv=one("SELECT * FROM play_conversations WHERE id=? AND character_id=? AND status='open' AND channel='in_person' AND rewound_at IS NULL",args.conversation_id||'',args.character_id||'');if(!conv||conv.mode==='group'||conv.location_id!==args.location_id)fail('SCENE_UNAVAILABLE','Choose an open face-to-face conversation with one character.');
      const pid=palor()?.id;if(!pid||pid===args.character_id)fail('SCENE_UNAVAILABLE','Palor and one existing partner are required.');const scene=(await playMode.prompts(args)).scene;
      const content=/intimate, consensual/.test(scene.prompt)?'sexual_activity':/flirty/.test(scene.prompt)?'nudity':'non_intimate';brief={target:'scene',character_id:args.character_id,location_id:args.location_id,prompt:scene.prompt,content_expected:content};participants=[pid,args.character_id];
    }else if(args.target==='figure'){
      const {conversation_id,...target}=args;brief=await playAssets.brief(target);participants=[args.character_id];
    }else fail('INVALID_ARGUMENT','Choose a figure or conversation snapshot.',400);
    const runs=all('SELECT value FROM application_settings WHERE key LIKE ? ORDER BY rowid DESC LIMIT 30',prefix+'%').map(row=>JSON.parse(row.value)).filter(order=>order.request.character_id===args.character_id&&order.request.target===args.target).map(order=>({run_id:order.run_id,status:order.status,created_at:order.created_at}));
    return {csrf,args,brief,runs,characters:bindings(participants,brief.content_expected!=='non_intimate'),provider:imageGeneration.capabilities().providers.find(provider=>provider.provider==='sogni')};
  }
  async function prepare(args){shape(args,['request_key','target','character_id','location_id','expression','outfit','conversation_id','output_count','max_estimated_capacity_units']);const {request_key,output_count,max_estimated_capacity_units,...target}=args,prior=one('SELECT id FROM image_generation_runs WHERE request_key=?',request_key);
    if(prior){const order=get(prior.id);if(JSON.stringify(order.request)!==JSON.stringify(args))fail('IDEMPOTENCY_CONFLICT','This request key belongs to a different picture order.');return view(prior.id);}
    const selected=await context(target),plan=await imageGeneration.prepare({request_key,provider:'sogni',prompt:selected.brief.prompt,characters:selected.characters,output_count:output_count??1,max_estimated_capacity_units,size:target.target==='figure'?'1024x1536':'1536x1024',play_target:{...target,content:selected.brief.content_expected}});
    const job=await playAssets.startJob(target.target==='snapshot'?{target:'scene',character_id:target.character_id,location_id:target.location_id}:{target:'figure',character_id:target.character_id,expression:target.expression||'alap',outfit:target.outfit||'dressed'});
    if(target.target==='snapshot')run('UPDATE play_generation_jobs SET brief_json=? WHERE id=?',JSON.stringify({...job,...selected.brief}),job.job_id);
    const order={run_id:plan.run_id,request:args,job_id:job.job_id,brief:selected.brief,status:'prepared',selected:null,checks:[],created_at:new Date().toISOString()};save(order);return view(plan.run_id);
  }
  function view(rid){return {...get(rid),plan:imageGeneration.view(rid)};}
  async function place(rid,index,{automatic=false}={}){
    const order=get(rid),plan=imageGeneration.view(rid);if(order.status==='placed')return view(rid);if(plan.status!=='succeeded'||!Number.isInteger(index)||!plan.outputs[index]?.active)fail('INVALID_STATE','Choose a completed, active output.');const output=plan.outputs[index];
    if(order.brief.target==='figure'){
      const check=await identity.checkGenerated(order.brief.character_id,output.media_id);order.checks[index]=check;save(order);
      if(check.face_verdict!=='matches'){order.status='review_required';save(order);fail('FACE_REVIEW_REQUIRED','The local face check abstained or found a mismatch. The output remains in the catalogue for review.');}
      // A face match only screens the face. Body quality stays explicitly unknown.
    }else if(automatic)fail('SCENE_REVIEW_REQUIRED','Multi-character scene fidelity requires owner selection.');
    const result=await playAssets.finishJob({job_id:order.job_id,outcome:'done',media_id:output.media_id,model:'Sogni '+plan.manifest.model+' · '+rid,content:order.brief.content_expected});order.status='placed';order.selected={index,media_id:output.media_id,...result};save(order);return view(rid);
  }
  async function startWorker(sid){
    if(active.has(sid))return {session_id:sid,running:true};const session=sessions.get(sid);if(session.status!=='approved')fail('APPROVAL_REQUIRED','Approve the exact finite session first.');for(const job of session.scope.jobs){const order=get(job.run_id);if(order.brief.target!=='figure')fail('SCENE_REVIEW_REQUIRED','Only figure orders can be automatically placed.');}
    const work=(async()=>{for(const job of session.scope.jobs){if(sessions.get(sid).status!=='approved')break;const order=get(job.run_id);if(order.status==='placed')continue;
      try{await imageGeneration.execute(job.run_id,sid);await imageGeneration.settle();const plan=imageGeneration.view(job.run_id);if(plan.status!=='succeeded'){order.status=plan.status;save(order);if(plan.status==='failed')await playAssets.finishJob({job_id:order.job_id,outcome:'refused',note:'Provider declined; no retry or rewording.',model:plan.manifest.model});break;}
        let chosen=-1;for(const [index,output] of plan.outputs.entries()){const check=await identity.checkGenerated(order.brief.character_id,output.media_id);order.checks[index]=check;if(check.face_verdict==='matches'&&chosen<0)chosen=index;}save(order);if(chosen<0){order.status='review_required';save(order);break;}await place(job.run_id,chosen,{automatic:true});
      }catch(error){const latest=get(job.run_id);latest.status='review_required';latest.error_code=error.code||'WORKER_STOPPED';save(latest);break;}
    }})().finally(()=>active.delete(sid));active.set(sid,work);return {session_id:sid,running:true};
  }
  async function handle({p,req,body,url,json}){
    const match=p.match(/^\/api\/play\/picture-orders(?:\/([a-f0-9-]{36})(?:\/(estimate|approve|execute|select))?)?$/i),worker=p.match(/^\/api\/play\/picture-worker\/([a-f0-9-]{36})$/i);if(!match&&!worker)return false;
    try{if(req.method==='GET'){if(worker)json({running:active.has(worker[1]),session:sessions.get(worker[1])});else if(match[1])json(view(match[1]));else json(await context(Object.fromEntries(url.searchParams)));return true;}
      const token=req.headers['x-lu-asset-csrf'];if(req.method!=='POST'||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(csrf)))fail('FORBIDDEN','Reload the image panel before continuing.',403);
      if(worker){shape(body,[]);json(await startWorker(worker[1]));return true;}const [,rid,op]=match;if(!rid)json(await prepare(body));else{const order=get(rid),plan=imageGeneration.view(rid);if(op==='estimate')json({...order,plan:await imageGeneration.estimateRun(rid,body,'local-creator')});else if(op==='approve')json({...order,plan:await imageGeneration.decide(rid,{...body,decision:'approve'},'local-creator')});else if(op==='execute'){shape(body,['manifest_hash']);if(body.manifest_hash!==plan.manifest_hash)fail('STALE_PLAN','Review this exact plan.');json({...order,plan:await imageGeneration.execute(rid)});}else if(op==='select'){shape(body,['manifest_hash','index']);if(body.manifest_hash!==plan.manifest_hash)fail('STALE_PLAN','Review this exact plan.');json(await place(rid,body.index));}else fail('INVALID_ARGUMENT','Choose a picture action.',400);}return true;
    }catch(error){json({code:error.code||'PICTURE_UNAVAILABLE',error:error.status?error.message:'The picture order could not be processed.'},error.status||500);return true;}
  }
  return {context,prepare,view,place,startWorker,handle,isBusy:()=>active.size>0,settle:()=>Promise.allSettled([...active.values()])};
}
