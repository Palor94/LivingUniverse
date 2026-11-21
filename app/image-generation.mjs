import {promises as fs,readFileSync,constants} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {referenceCrop,sameCrop,referenceKey} from './reference-crop.mjs';
import {referenceImage} from '../mcp/images.mjs';
import {cloudAvailability} from './duplicates.mjs';
import {validateMedia} from './media-imports.mjs';
import {configuredImageProviders,imageProviderSpecs,generateProviderImage,estimateProviderImage,GenerationError} from './image-providers.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(code,message,status=400)=>{throw new GenerationError(code,message,status);};
const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_ARGUMENT','Unexpected generation fields.');};
const id=v=>{if(typeof v!=='string'||!uuid.test(v))fail('INVALID_ID','Use an existing catalogue UUID.');return v;};

export async function backupBeforeImageGeneration(db,dataDir){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='image_generation_runs'").get()||!db.prepare('SELECT 1 FROM characters LIMIT 1').get())return null;
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'before-image-generation-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_FAILED','The generation migration backup could not be verified.',500);}finally{copy.close();}return file;
}

export function installImageGeneration({db,root,dataDir,one,all,run,transaction,mediaImports,characterPolicy,writeConfig,config={},isBusy=()=>false,clock=()=>Date.now(),availability=cloudAvailability,decodeImage,generate=generateProviderImage,estimate=estimateProviderImage,env=process.env}){
  db.exec(readFileSync(new URL('./migrations/018-image-generation.up.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/050-generation-output-items.up.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/025-mcp-living-world.up.sql',import.meta.url),'utf8'));
  const active=new Map();let preparing=false,sessions=null;
  const now=()=>new Date(clock()).toISOString();
  const event=(rid,type,actor='service',detail=null)=>run('INSERT INTO image_generation_events VALUES(?,?,?,?,?,?)',randomUUID(),rid,type,actor,detail,now());
  // A network request interrupted by restart must never trigger a second paid call.
  transaction(()=>{for(const row of all("SELECT id FROM image_generation_runs WHERE status='running'")){run("UPDATE image_generation_runs SET status='uncertain',error_code='PROCESS_INTERRUPTED' WHERE id=?",row.id);event(row.id,'interrupted');}});
  function enabled(){if(writeConfig?.enabled!==true)fail('GENERATION_DISABLED','Generation requires the existing authenticated change service.',403);}
  function capabilities(){enabled();return {enabled:true,providers:Object.values(configuredImageProviders(config,env)),host_image_generation_handoff:'unverified',host_attachment_byte_handoff:'unverified',manual_upload_supported:true,canon_approval_available:false,approval_required:true};}
  function get(rid){enabled();id(rid);const row=one('SELECT * FROM image_generation_runs WHERE id=?',rid);if(!row)fail('NOT_FOUND','Generation run not found.',404);return row;}
  function view(rid){const row=get(rid),output=one('SELECT * FROM image_generation_outputs WHERE run_id=?',rid),items=all('SELECT * FROM image_generation_output_items WHERE run_id=? ORDER BY item_index',rid),portable=item=>({media_id:item.media_id,sha256:item.sha256,size:item.size,receipt:JSON.parse(item.receipt_json),active:!!one('SELECT 1 FROM active_media WHERE id=?',item.media_id)});return {run_id:row.id,status:row.status,manifest:JSON.parse(row.manifest_json),manifest_hash:row.manifest_hash,created_at:row.created_at,expires_at:row.expires_at,approval_url:writeConfig.origin+'/image-generation/'+row.id,approved_by:row.approved_by,approved_at:row.approved_at,error_code:row.error_code,output:output?{media_id:output.media_id,sha256:output.sha256,size:output.size,receipt:JSON.parse(output.receipt_json),active:!!one('SELECT 1 FROM active_media WHERE id=?',output.media_id)}:null,outputs:(items.length?items:output?[output]:[]).map(portable),canon_approved:false,events:all('SELECT event,actor,detail,created_at FROM image_generation_events WHERE run_id=? ORDER BY rowid',rid)};}
  function currentBinding(binding){
    characterPolicy?.assertGeneration(binding.character_id);
    const c=one('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',id(binding.character_id));
    const canon=one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',binding.character_id);
    if(!c||!canon||canon.id!==binding.revision_id)fail('STALE_CANON','An approved character revision changed or is unavailable. Prepare and review a fresh plan.',409);
    let refs;try{refs=JSON.parse(canon.references_json);}catch{fail('CANON_INVALID','Review the approved references locally.',409);}
    for(const selected of binding.references)if(!refs.some(r=>r.media_id===selected.media_id&&(!selected.reference_id||r.reference_id===selected.reference_id)&&r.sha256===selected.sha256&&r.role===selected.role&&sameCrop(r.crop,selected.crop)))fail('STALE_REFERENCE','A selected reference is no longer approved.',409);
    return {c,canon};
  }
  async function source(ref){
    const m=one("SELECT * FROM active_media WHERE id=? AND kind='image'",ref.media_id);
    if(!m||typeof m.relative_path!=='string'||path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||/[\x00:]/.test(m.relative_path))fail('REFERENCE_UNAVAILABLE','An approved reference has no safe active original.',409);
    const parts=m.relative_path.split(/[\\/]/);
    if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||['app','mcp','docs','tests','backups','node_modules'].includes(parts[0].toLowerCase()))fail('UNSAFE_REFERENCE','Reference storage is not permitted.',403);
    let file=root;
    for(const part of parts){file=path.join(file,part);const stat=await fs.lstat(file).catch(()=>null);if(!stat||stat.isSymbolicLink())fail('REFERENCE_UNAVAILABLE','Reference paths must be available without symbolic links.',409);}
    const realRoot=await fs.realpath(root),real=await fs.realpath(file),relative=path.relative(realRoot,real);
    if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('UNSAFE_REFERENCE','Reference storage escaped the media root.',403);
    if(await availability(file)!=='local')fail('REFERENCE_OFFLINE','Make the selected reference available locally before preparing generation.',409);
    const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
    try{const stat=await handle.stat();if(!stat.isFile()||stat.size>20*1024*1024)fail('REFERENCE_LIMIT','Each reference must be a regular image up to 20 MiB.');const bytes=await handle.readFile();if(bytes.length>20*1024*1024||hash(bytes)!==ref.sha256)fail('REFERENCE_CHANGED','Reference bytes differ from approved canon. No generation was sent.',409);const type=await validateMedia(bytes,{decodeImage});if(type.kind!=='image')fail('REFERENCE_FORMAT','Only approved PNG/JPEG reference originals are supported.');if(ref.crop){const image=await referenceImage(bytes,referenceCrop(ref.crop));return {bytes:Buffer.from(image.data,'base64'),contentType:image.mimeType};}return {bytes,contentType:type.contentType};}finally{await handle.close();}
  }
  async function validate(manifest){
    characterPolicy?.assertPrompt(manifest.prompt);
    if(characterPolicy?.enabled&&manifest.character_policy?.reject_female_characters!==true)fail('CHARACTER_POLICY_CHANGED','Prepare and approve a fresh plan under the current character policy.',409);
    const references=[];let size=0;
    for(const b of manifest.characters){currentBinding(b);for(const ref of b.references){const input=await source(ref);size+=input.bytes.length;if(size>20*1024*1024)fail('REFERENCE_LIMIT','Combined reference originals must be at most 20 MiB.');references.push(input);}}
    // Recheck after asynchronous file reads before approval/submission.
    for(const b of manifest.characters)currentBinding(b);
    return references;
  }
  async function prepare(args){
    enabled();shape(args,['request_key','provider','prompt','characters','size','max_estimated_capacity_units','output_count','play_target']);
    if(args.play_target!==undefined){shape(args.play_target,['target','character_id','location_id','expression','outfit','conversation_id','content']);if(!['figure','snapshot'].includes(args.play_target.target))fail('INVALID_ARGUMENT','Invalid play target.');for(const key of ['character_id','location_id','conversation_id'])if(args.play_target[key]!=null)id(args.play_target[key]);}
    const count=args.output_count??1;if(!Number.isInteger(count)||count<1||count>(args.provider==='sogni'?4:1))fail('INVALID_ARGUMENT','Choose one to four image outputs.');
    if(args.max_estimated_capacity_units!==undefined&&(args.provider!=='sogni'||typeof args.max_estimated_capacity_units!=='number'||!Number.isFinite(args.max_estimated_capacity_units)||args.max_estimated_capacity_units<=0||args.max_estimated_capacity_units>1e9))fail('INVALID_ARGUMENT','Choose a positive Sogni capacity ceiling.');
    if(typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(args.request_key))fail('INVALID_ARGUMENT','Reuse an 8–128 character request key.');
    if(!Object.hasOwn(imageProviderSpecs,args.provider))fail('INVALID_PROVIDER','Choose a documented API provider.');
    if(typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>12000)fail('INVALID_ARGUMENT','Use a scene prompt of 1–12000 characters.');
    if(!Array.isArray(args.characters)||!args.characters.length||args.characters.length>5)fail('INVALID_ARGUMENT','Select 1–5 distinct character bindings.');
    const size=args.size??'1024x1024';if(!['1024x1024','1536x1024','1024x1536'].includes(size))fail('INVALID_ARGUMENT','Unsupported output size.');
    characterPolicy?.assertPrompt(args.prompt);
    const requestHash=digest({...args,size}),prior=one('SELECT * FROM image_generation_runs WHERE request_key=?',args.request_key);
    if(prior){if(prior.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT','This request key belongs to another plan.',409);return view(prior.id);}
    if(preparing||active.size||isBusy())fail('BUSY','Another generation or file operation is active. Retry this request key.',409);
    const provider=configuredImageProviders(config,env)[args.provider];if(!provider?.available)fail('PROVIDER_DISABLED','Enable this provider/model and its server-side API key before preparing a paid run.',403);
    if(one("SELECT COUNT(*) n FROM image_generation_runs WHERE status IN ('pending','approved') AND expires_at>?",now()).n>=50)fail('RUN_LIMIT','Too many pending plans.',429);
    preparing=true;
    try{
      const seen=new Set();let index=0;
      const bindings=args.characters.map((b,slot)=>{
        shape(b,['character_id','revision_id','reference_ids']);id(b.character_id);id(b.revision_id);
        if(seen.has(b.character_id))fail('INVALID_ARGUMENT','Each character needs one distinct binding.');seen.add(b.character_id);
        // A group record mixes several people's faces; generating "it" would blend identities.
        if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_groups'")&&one('SELECT 1 FROM character_groups WHERE character_id=?',b.character_id))fail('GROUP_CHARACTER','Groups cannot be used for image generation. Create the individual person as a character first.');
        if(!Array.isArray(b.reference_ids)||!b.reference_ids.length||b.reference_ids.length>16||new Set(b.reference_ids).size!==b.reference_ids.length)fail('INVALID_ARGUMENT','Select 1–16 distinct approved reference IDs for each character.');
        const {c,canon}=currentBinding({...b,references:[]}),refs=JSON.parse(canon.references_json);
        return {slot:slot+1,character_id:c.id,name:c.name,revision_id:canon.id,appearance:canon.appearance,references:b.reference_ids.map(mid=>{id(mid);const r=refs.find(r=>referenceKey(r)===mid)||((refs.filter(r=>r.media_id===mid).length===1)?refs.find(r=>r.media_id===mid):null);if(!r||!/^[a-f0-9]{64}$/.test(r.sha256)||!['face','body','detail','general'].includes(r.role))fail('REFERENCE_NOT_APPROVED','Use fingerprinted references from the exact approved revision.');return {input_index:++index,media_id:r.media_id,...(r.reference_id?{reference_id:r.reference_id}:{}),role:r.role,sha256:r.sha256,...(r.crop?{crop:referenceCrop(r.crop)}:{})};})};
      });
      if(index>provider.max_references)fail('REFERENCE_LIMIT','This provider accepts at most '+provider.max_references+' reference images.');
      const policyPrompt=characterPolicy?.enabled?'Only non-female characters may appear. Do not generate women or female characters.\n':'';
      const providerPrompt=policyPrompt+'Create one image of the selected fictional adults. Keep facial identity and body proportions consistent with each character\'s references. Character-slot bindings are descriptive; do not mix identities.\n'+bindings.map(b=>'Character slot '+b.slot+': '+JSON.stringify({name:b.name,approved_appearance:b.appearance,reference_inputs:b.references.map(r=>({image:r.input_index,role:r.role}))})).join('\n')+'\nScene requested by the creator:\n'+args.prompt;
      if(providerPrompt.length>30000)fail('PROMPT_LIMIT','Selected approved appearance plus scene exceeds the provider prompt limit.');
      const manifest={schema_version:1,...(args.play_target?{play_target:args.play_target}:{}),...(characterPolicy?.description?{character_policy:characterPolicy.description}:{}),provider:args.provider,model:provider.model,task:'reference_conditioned_edit',prompt:args.prompt,provider_prompt:providerPrompt,characters:bindings,size,n:count,estimated_cost_usd:provider.estimated_cost_usd,actual_cost_usd:null,regional_binding:false,safety_identifier:hash(writeConfig.login),identity_guaranteed:false};
      if(args.provider==='sogni')Object.assign(manifest,{model_label:provider.model_label,loras:provider.loras,lora_strengths:provider.lora_strengths});
      if(args.provider==='sogni'&&(args.max_estimated_capacity_units||provider.max_estimated_capacity_units))manifest.max_estimated_capacity_units=Math.min(args.max_estimated_capacity_units||Infinity,provider.max_estimated_capacity_units||Infinity);
      await validate(manifest);const rid=randomUUID();
      transaction(()=>{run("INSERT INTO image_generation_runs VALUES(?,?,?,?,?,'pending',?,?,NULL,NULL,NULL)",rid,args.request_key,requestHash,JSON.stringify(manifest),digest(manifest),now(),new Date(clock()+86400000).toISOString());event(rid,'prepared');});return view(rid);
    }finally{preparing=false;}
  }
  async function decide(rid,args,actor){
    shape(args,['decision','manifest_hash','acknowledge_external_upload_and_cost']);const row=get(rid);
    if(args.manifest_hash!==row.manifest_hash)fail('STALE_PLAN','Review this exact generation manifest before deciding.',409);
    if(args.decision==='approve'&&row.status==='approved')return view(rid);
    if(row.status!=='pending')fail('INVALID_STATE','This plan is no longer awaiting a decision.',409);
    if(args.decision==='reject'){transaction(()=>{run("UPDATE image_generation_runs SET status='rejected' WHERE id=?",rid);event(rid,'rejected',actor);});return view(rid);}
    if(args.decision!=='approve'||args.acknowledge_external_upload_and_cost!==true)fail('APPROVAL_REQUIRED','Explicitly approve sending these references and separate API charges.',403);
    if(Date.parse(row.expires_at)<=clock())fail('PLAN_EXPIRED','Prepare a fresh plan for review.',410);
    if(preparing||active.size||isBusy())fail('BUSY','Wait for the current file operation.',409);
    const manifest=JSON.parse(row.manifest_json);checkEstimate(manifest);await validate(manifest);
    transaction(()=>{if(get(rid).status!=='pending')fail('INVALID_STATE','This plan was already decided.',409);run("UPDATE image_generation_runs SET status='approved',approved_by=?,approved_at=? WHERE id=?",actor,now(),rid);event(rid,'approved_external_upload_and_cost',actor);});return view(rid);
  }
  function checkEstimate(manifest){
    if(!manifest.sogni_estimate)return;
    if(clock()-Date.parse(manifest.sogni_estimate.estimated_at)>300000)fail('ESTIMATE_EXPIRED','The cost estimate expired. Prepare and review a fresh plan.',409);
    if(manifest.sogni_estimate.capacity_units>manifest.max_estimated_capacity_units)fail('COST_LIMIT','The Sogni estimate exceeds the approved capacity ceiling.',409);
  }
  async function estimateRun(rid,args,actor){
    shape(args,['manifest_hash','acknowledge_external_upload']);const row=get(rid);
    if(row.status!=='pending'||row.manifest_hash!==args.manifest_hash)fail('STALE_PLAN','Estimate the exact pending plan.',409);
    if(args.acknowledge_external_upload!==true)fail('APPROVAL_REQUIRED','Explicitly allow sending these references for the non-generating estimate.',403);
    const manifest=JSON.parse(row.manifest_json);if(manifest.provider!=='sogni'||!manifest.max_estimated_capacity_units)fail('INVALID_ARGUMENT','Prepare a Sogni plan with a capacity ceiling.');
    if(preparing||active.size||isBusy())fail('BUSY','Wait for the current operation.',409);preparing=true;
    try{
      const references=await validate(manifest);event(rid,'approved_estimate_upload',actor);
      const result=await estimate({manifest,references,config,env,requestKey:'lu_'+rid,clock});
      if(result.source!=='sogni'||!Number.isFinite(result.capacity_units)||result.capacity_units<=0)fail('ESTIMATE_UNAVAILABLE','The provider estimate is invalid.',502);
      const monetary=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
      Object.assign(manifest,{sogni_estimate:{source:'sogni',capacity_units:result.capacity_units,token_type:['spark','sogni'].includes(result.token_type)?result.token_type:null,spark:monetary(result.spark),usd:monetary(result.usd),estimated_at:now()},estimated_cost_usd:monetary(result.usd)});
      transaction(()=>{if(get(rid).status!=='pending'||get(rid).manifest_hash!==row.manifest_hash)fail('STALE_PLAN','The pending plan changed.',409);run('UPDATE image_generation_runs SET manifest_json=?,manifest_hash=? WHERE id=?',JSON.stringify(manifest),digest(manifest),rid);event(rid,'estimated','service');});return view(rid);
    }finally{preparing=false;}
  }
  async function resultDirectory(){const dir=path.join(dataDir,'generation-results');await fs.mkdir(dir,{recursive:true});const s=await fs.lstat(dir);if(s.isSymbolicLink()||!s.isDirectory()||path.resolve(await fs.realpath(dir)).toLowerCase()!==path.resolve(dir).toLowerCase())fail('UNSAFE_STORAGE','Generation recovery storage must be an ordinary local directory.',409);return dir;}
  async function register(rid,manifest,result){
    const outputs=result.outputs||[result];if(outputs.length!==(manifest.n||1))fail('INVALID_OUTPUT','The provider returned a different number of pictures.');
    for(const [index,output] of outputs.entries()){
      if(one('SELECT 1 FROM image_generation_output_items WHERE run_id=? AND item_index=?',rid,index))continue;
      const type=await validateMedia(output.bytes,{decodeImage});if(type.kind!=='image')fail('INVALID_OUTPUT','The provider must return a decoded image.');
      const fingerprint=hash(output.bytes),existing=one('SELECT id FROM media WHERE id=(SELECT media_id FROM imported_media_blobs WHERE sha256=?)',fingerprint),pending=mediaImports.begin({request_key:'generation_'+rid+(index?'_'+index:''),character_id:manifest.characters[0].character_id,provenance:{provider:manifest.provider,model:manifest.model,prompt:manifest.prompt,generation_id:rid}});
      const imported=await mediaImports.receive(pending.import_id,'generated_output_01',Readable.from([output.bytes]),{name:'generated-'+rid+'-'+index+'.'+type.extension,contentType:type.contentType,expectedSha256:fingerprint,source:{kind:'api_generation',manifest_hash:get(rid).manifest_hash,provider_request_id:output.request_id||result.request_id,usage:output.usage||result.usage,revised_prompt:output.revised_prompt||result.revised_prompt}}),item=imported.items.find(item=>item.slot_key==='generated_output_01'),receipt=JSON.stringify({import_id:pending.import_id,owned_media:output.owned_media??!existing,provider_request_id:output.request_id||result.request_id,usage:output.usage||result.usage,actual_cost_usd:null});
      transaction(()=>{for(const binding of manifest.characters)run('INSERT OR IGNORE INTO depictions VALUES(?,?)',item.media_id,binding.character_id);if(index===0)run('INSERT OR IGNORE INTO image_generation_outputs VALUES(?,?,?,?,?,?)',rid,item.media_id,fingerprint,item.size,receipt,now());run('INSERT INTO image_generation_output_items VALUES(?,?,?,?,?,?,?)',rid,index,item.media_id,fingerprint,item.size,receipt,now());});
    }
    run("UPDATE image_generation_runs SET status='succeeded',error_code=NULL WHERE id=?",rid);event(rid,'registered');
  }
  async function perform(rid,manifest,references){
    try{
      const result=await generate({manifest,references,config,env,requestKey:'lu_'+rid,onProviderJob:job=>event(rid,'provider_job_created','service',job)});
      for(const output of result.outputs||[result]){if(!Buffer.isBuffer(output.bytes))fail('INVALID_OUTPUT','The provider must return a decoded image.');output.owned_media=!one('SELECT 1 FROM imported_media_blobs WHERE sha256=?',hash(output.bytes));}
      // Persist verified provider bytes before registration. Registration retries never call the provider.
      const dir=await resultDirectory(),file=path.join(dir,rid+'.json');
      const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify({...result,bytes:result.outputs?null:result.bytes.toString('base64'),...(result.outputs?{outputs:result.outputs.map(output=>({...output,bytes:output.bytes.toString('base64')}))}:{})}));await handle.sync();}finally{await handle.close();}
      run("UPDATE image_generation_runs SET status='generated' WHERE id=?",rid);event(rid,'provider_result_staged');
      await register(rid,manifest,result);
    }catch(error){const code=error instanceof GenerationError?error.code:'REGISTRATION_FAILED';const state=get(rid).status;
      run('UPDATE image_generation_runs SET status=?,error_code=? WHERE id=?',state==='generated'?'generated':code==='PROVIDER_REJECTED'?'failed':'uncertain',code,rid);event(rid,'attempt_stopped','service',code);
    }
  }
  async function execute(rid,sessionId=null){
    const row=get(rid);if(active.has(rid)||['succeeded','running','uncertain','failed','rejected','withdrawn'].includes(row.status))return view(rid);
    if(row.status==='generated'){
      if(active.size||preparing||isBusy())fail('BUSY','Wait for the current operation.',409);
      const task=(async()=>{const file=path.join(await resultDirectory(),rid+'.json'),s=await fs.lstat(file);if(s.isSymbolicLink()||s.size>128*1024*1024)fail('UNSAFE_STORAGE','Invalid recovery artifact.',409);const saved=JSON.parse(await fs.readFile(file,'utf8'));await register(rid,JSON.parse(row.manifest_json),{...saved,bytes:Buffer.from(saved.bytes||saved.outputs?.[0]?.bytes,'base64'),...(saved.outputs?{outputs:saved.outputs.map(output=>({...output,bytes:Buffer.from(output.bytes,'base64')}))}:{})});})().catch(error=>{run('UPDATE image_generation_runs SET error_code=? WHERE id=?',error instanceof GenerationError?error.code:'REGISTRATION_FAILED',rid);event(rid,'registration_retry_failed');}).finally(()=>active.delete(rid));active.set(rid,task);return view(rid);
    }
    if(!sessionId&&(row.status!=='approved'||!row.approved_by))fail('APPROVAL_REQUIRED','Open the private review page and approve this exact plan first.',403);
    if(sessionId&&!['pending','approved'].includes(row.status))fail('INVALID_STATE','This plan cannot be submitted.',409);
    if(Date.parse(row.expires_at)<=clock())fail('PLAN_EXPIRED','This plan expired. Prepare a fresh plan.',410);
    if(preparing||active.size||isBusy())fail('BUSY','Another generation or file operation is active.',409);
    preparing=true;
    try{const manifest=JSON.parse(row.manifest_json),provider=configuredImageProviders(config,env)[manifest.provider];
      if(!provider?.available||provider.model!==manifest.model||!manifest.sogni_estimate&&provider.estimated_cost_usd!==manifest.estimated_cost_usd)fail('PROVIDER_CHANGED','Provider configuration changed; prepare a fresh plan for approval.',409);
      checkEstimate(manifest);
      if(provider.max_estimated_capacity_units&&(!manifest.max_estimated_capacity_units||manifest.max_estimated_capacity_units>provider.max_estimated_capacity_units))fail('PROVIDER_CHANGED','The capacity ceiling changed. Prepare a fresh plan.',409);
      if(manifest.provider==='sogni'&&(JSON.stringify(manifest.loras??[])!==JSON.stringify(provider.loras)||JSON.stringify(manifest.lora_strengths??[])!==JSON.stringify(provider.lora_strengths)))fail('PROVIDER_CHANGED','Sogni LoRA settings changed; prepare a fresh plan for approval.',409);
      const references=await validate(manifest);
      transaction(()=>{const latest=get(rid);if(latest.manifest_hash!==row.manifest_hash||!['pending','approved'].includes(latest.status))fail('INVALID_STATE','Run status changed.',409);if(sessionId){if(!sessions)fail('APPROVAL_REQUIRED','Session approval is unavailable.',403);const actor=sessions.reserve(sessionId,rid,row.manifest_hash);run('UPDATE image_generation_runs SET approved_by=?,approved_at=? WHERE id=?',actor,now(),rid);event(rid,'session_approved',actor,sessionId);}else if(latest.status!=='approved')fail('APPROVAL_REQUIRED','Explicit approval is required.',403);run("UPDATE image_generation_runs SET status='running' WHERE id=?",rid);event(rid,'submitted');});
      const task=perform(rid,manifest,references).finally(()=>active.delete(rid));active.set(rid,task);return view(rid);
    }finally{preparing=false;}
  }
  function withdraw(rid,args,actor){
    shape(args,['manifest_hash']);const row=get(rid);if(row.manifest_hash!==args.manifest_hash)fail('STALE_PLAN','Reload the stored run.',409);if(row.status==='withdrawn')return view(rid);if(row.status!=='succeeded')fail('INVALID_STATE','Only a completed generation can be withdrawn.',409);
    const outputs=all('SELECT * FROM image_generation_output_items WHERE run_id=? ORDER BY item_index',rid);if(!outputs.length)outputs.push(one('SELECT * FROM image_generation_outputs WHERE run_id=?',rid));const ownImports=JSON.stringify(outputs.map(output=>JSON.parse(output.receipt_json).import_id)),targets=[];
    for(const output of outputs){const receipt=JSON.parse(output.receipt_json),media=one('SELECT * FROM media WHERE id=?',output.media_id),shared=one("SELECT 1 FROM media_import_items WHERE media_id=? AND status='committed' AND import_id NOT IN(SELECT value FROM json_each(?))",media.id,ownImports)||one('SELECT 1 FROM image_generation_outputs WHERE media_id=? AND run_id<>?',media.id,rid)||one('SELECT 1 FROM image_generation_output_items WHERE media_id=? AND run_id<>?',media.id,rid),hide=receipt.owned_media&&!shared;
      if(hide&&one("SELECT 1 FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,'$.media_id')=?)",media.id))fail('CANON_REFERENCE_PROTECTED','Retire this approved reference explicitly before withdrawing its media.',409);targets.push({media,hide});}
    transaction(()=>{for(const {media,hide} of targets)if(hide){run('INSERT OR IGNORE INTO media_hidden VALUES(?,?,0,?)',media.id,media.relative_path,now());run('UPDATE characters SET cover_id=NULL WHERE cover_id=?',media.id);}run("UPDATE image_generation_runs SET status='withdrawn' WHERE id=?",rid);event(rid,targets.some(target=>target.hide)?'withdrawn_media_to_catalogue_trash':'withdrawn_shared_media_retained',actor);});return view(rid);
  }
  async function previewReference(rid,cid,mid,referenceId){const manifest=view(rid).manifest,binding=manifest.characters.find(b=>b.character_id===cid),ref=binding?.references.find(r=>r.media_id===mid&&(!referenceId||referenceKey(r)===referenceId));if(!ref)fail('NOT_FOUND','Reference not found in this plan.',404);currentBinding(binding);const input=await source(ref);currentBinding(binding);return {bytes:input.bytes,mimeType:input.contentType,sha256:hash(input.bytes)};}
  function summary(args={}){
    enabled();shape(args,['character_id','limit','offset']);
    const page=(v,f,max)=>{if(v===undefined)return f;if(!Number.isInteger(v)||v<0||v>max)fail('INVALID_ARGUMENT','Pagination is outside the allowed range.');return v;};
    const limit=page(args.limit,20,50),offset=page(args.offset,0,100000);if(!limit)fail('INVALID_ARGUMENT','Limit must be positive.');
    if(args.character_id!==undefined)id(args.character_id);
    const rows=all('SELECT id,status,manifest_json,created_at,error_code FROM image_generation_runs ORDER BY rowid DESC');
    const matched=[];for(const row of rows){const manifest=JSON.parse(row.manifest_json);if(args.character_id&&!(manifest.characters||[]).some(c=>c.character_id===args.character_id))continue;matched.push({row,manifest});}
    const by_status={};let estimated=0,actual=0,estimated_known=0,actual_known=0;
    for(const {row,manifest} of matched){by_status[row.status]=(by_status[row.status]||0)+1;if(typeof manifest.estimated_cost_usd==='number'){estimated+=manifest.estimated_cost_usd;estimated_known++;}const output=one('SELECT receipt_json FROM image_generation_outputs WHERE run_id=?',row.id);if(output){const receipt=JSON.parse(output.receipt_json);if(typeof receipt.actual_cost_usd==='number'){actual+=receipt.actual_cost_usd;actual_known++;}else if(typeof manifest.actual_cost_usd==='number'){actual+=manifest.actual_cost_usd;actual_known++;}}}
    const pageRows=matched.slice(offset,offset+limit).map(({row,manifest})=>{const output=one('SELECT media_id,sha256,size,receipt_json,created_at FROM image_generation_outputs WHERE run_id=?',row.id);return {run_id:row.id,status:row.status,created_at:row.created_at,error_code:row.error_code,provider:manifest.provider||null,model:manifest.model||null,estimated_cost_usd:typeof manifest.estimated_cost_usd==='number'?manifest.estimated_cost_usd:null,characters:(manifest.characters||[]).map(c=>({character_id:c.character_id,revision_id:c.revision_id})),output:output?{media_id:output.media_id,sha256:output.sha256,size:output.size,created_at:output.created_at,actual_cost_usd:JSON.parse(output.receipt_json).actual_cost_usd??null}:null};});
    return {total_runs:matched.length,by_status,estimated_cost_usd_total:estimated,estimated_cost_runs:estimated_known,actual_cost_usd_total:actual,actual_cost_runs:actual_known,currency:'USD',canon_approved:false,paid_calls_made:false,runs:pageRows,next_offset:matched.length>offset+limit?offset+limit:null};
  }
  function feedback(args){
    enabled();shape(args,['request_key','media_id','character_id','run_id','decision','rating','face_verdict','body_verdict','notes']);
    const requestKey=typeof args.request_key==='string'?args.request_key:'';if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey))fail('INVALID_ARGUMENT','Use an 8–128 character idempotency key for this intent.');
    const mediaId=id(args.media_id),characterId=id(args.character_id);if(!['approved','rejected','unreviewed'].includes(args.decision))fail('INVALID_ARGUMENT','Choose approved, rejected, or unreviewed.');
    const rating=args.rating===undefined||args.rating===null?null:args.rating;if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))fail('INVALID_ARGUMENT','Rating must be 1–5 or null.');
    const face=args.face_verdict??'unknown',body=args.body_verdict??'unknown';if(!['unknown','matches','mismatch','uncertain'].includes(face)||!['unknown','matches','mismatch','uncertain'].includes(body))fail('INVALID_ARGUMENT','Invalid face or body verdict.');
    const notes=typeof args.notes==='string'?args.notes:'';if(notes.length>5000)fail('INVALID_ARGUMENT','Keep feedback under 5,000 characters.');
    if(args.run_id!==undefined)id(args.run_id);
    const requestHash=digest({operation:'feedback',args});
    const duplicate=one('SELECT * FROM generation_feedback WHERE request_key=?',requestKey);if(duplicate){if(duplicate.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT','This request key already belongs to different feedback.',409);return viewFeedback(duplicate);}
    if(!one('SELECT 1 FROM active_media WHERE id=?',mediaId)||!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',mediaId,characterId))fail('MEDIA_NOT_ASSIGNED','Feedback requires active media assigned to the character.',409);
    if(args.run_id&&!one('SELECT 1 FROM image_generation_outputs WHERE run_id=? AND media_id=? UNION SELECT 1 FROM image_generation_output_items WHERE run_id=? AND media_id=?',args.run_id,mediaId,args.run_id,mediaId))fail('RUN_MISMATCH','run_id must match the feedback media output.',409);
    if(characterPolicy)characterPolicy.assertGeneration(characterId);
    return transaction(()=>{
      const existing=one('SELECT * FROM generation_feedback WHERE request_key=?',requestKey);if(existing){if(existing.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT','This request key already belongs to different feedback.',409);return viewFeedback(existing);}
      const fid=randomUUID(),created=now();
      run('INSERT INTO generation_feedback VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',fid,requestKey,requestHash,mediaId,characterId,args.run_id??null,args.decision,rating,face,body,notes,created);
      run('INSERT INTO reviews VALUES(?,?,?,?,?,?,?)',randomUUID(),mediaId,characterId,args.decision,rating,notes,created);
      return viewFeedback(one('SELECT * FROM generation_feedback WHERE id=?',fid));
    });
  }
  function viewFeedback(row){return {feedback_id:row.id,request_key:row.request_key,media_id:row.media_id,character_id:row.character_id,run_id:row.run_id,decision:row.decision,rating:row.rating,face_verdict:row.face_verdict,body_verdict:row.body_verdict,notes:row.notes,created_at:row.created_at,canon_changed:false,message:'Feedback saved. Canon and approved references were not changed.'};}
  return {capabilities,summary,feedback,prepare,view,decide,estimateRun,execute,withdraw,previewReference,setSessions:value=>{sessions=value;},isBusy:()=>preparing||active.size>0,settle:()=>Promise.allSettled([...active.values()])};
}
