import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configuredImageProviders,generateProviderImage} from '../app/image-providers.mjs';
import {safeUpload} from '../app/safe-download.mjs';
import {imageCredentialEnvironment} from '../app/sogni-credentials.mjs';
import {generationTools} from '../mcp/generation.mjs';

const bytes=Buffer.from('synthetic PNG payload');
function harness({states=['queued','running','completed'],artifact='https://storage.example/result.png?secret=signature',uploadError,fetchError,downloadBytes=bytes}={}){
  const calls=[],uploads=[],jobs=[];let polls=0,time=0;
  const result=status=>({data:{workflow:{workflowId:'wf_fixture_01',status,steps:[{id:'image',artifacts:[{url:artifact}]}]}}});
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});if(fetchError)throw Error('secret upstream details');
    if(url.includes('/image/uploadUrl?'))return Response.json({data:{uploadUrl:'https://storage.example/upload?signature=private'}});
    if(url.includes('/image/downloadUrl?'))return Response.json({data:{downloadUrl:'https://storage.example/reference?signature=private'}});
    if(options.method==='POST')return Response.json(result(states[0]));
    return Response.json(result(states[Math.min(++polls,states.length-1)]));
  };
  const upload=async(url,body,opts)=>{uploads.push({url,body,opts});if(uploadError)throw uploadError;};
  const download=async(url,opts)=>{calls.push({download:url,opts});return {contentType:'image/png',stream:Readable.from([downloadBytes])};};
  const args={manifest:{provider:'sogni',model:'krea-identity-edit',provider_prompt:'Exact approved identity and body prompt',size:'1536x1024'},references:[{bytes,contentType:'image/png'},{bytes:Buffer.from('second identity reference'),contentType:'image/jpeg'}],config:{providers:{sogni:{enabled:true,model:'krea-identity-edit'}}},env:{SOGNI_API_KEY:'fixture-bearer-secret'},fetchImpl,requestKey:'lu_fixture_one_attempt',onProviderJob:id=>jobs.push(id),sogniOptions:{upload,download,sleep:async ms=>{time+=ms;},clock:()=>time,timeoutMs:10000,pollMs:10}};
  return {args,calls,uploads,jobs};
}

test('Sogni uploads ordered approved bytes, starts exactly one explicit edit, polls and returns a portable receipt',async()=>{
  const f=harness(),result=await generateProviderImage(f.args);
  assert.deepEqual(result.bytes,bytes);assert.equal(result.request_id,'wf_fixture_01');assert.deepEqual(f.jobs,['wf_fixture_01']);assert.equal(f.uploads.length,2);
  assert.deepEqual(f.uploads[1].body,f.args.references[1].bytes);assert.equal(f.uploads[0].opts.Authorization,undefined);
  const starts=f.calls.filter(c=>c.options?.method==='POST');assert.equal(starts.length,1);const sent=JSON.parse(starts[0].options.body);
  assert.equal(starts[0].url,'https://api.sogni.ai/v1/creative-agent/workflows');assert.equal(starts[0].options.redirect,'error');assert.equal(starts[0].options.headers['Idempotency-Key'],'lu_fixture_one_attempt');
  assert.equal(sent.input.steps[0].toolName,'edit_image');assert.equal(sent.input.steps[0].arguments.sourceImageIndex,-1);assert.equal(sent.input.steps[0].arguments.prompt,f.args.manifest.provider_prompt);assert.equal(sent.input.steps[0].arguments.numberOfVariations,1);assert.equal(sent.input.steps[0].arguments.width,1536);assert.equal(sent.media_references.length,2);assert.equal(sent.safe_content_filter,true);
  for(const secret of ['fixture-bearer-secret','signature','https:'])assert.equal(JSON.stringify(result).includes(secret),false);
});

test('requested Krea LoRAs retain order and fractional strength in the exact upstream edit',async()=>{
  const f=harness(),loras=['krea2-mystic-x','krea2-realism-engine'],lora_strengths=[1,0.8];
  Object.assign(f.args.config.providers.sogni,{loras,lora_strengths});Object.assign(f.args.manifest,{loras,lora_strengths});
  await generateProviderImage(f.args);const sent=JSON.parse(f.calls.find(c=>c.options?.method==='POST').options.body).input.steps[0].arguments;
  assert.equal(sent.model,'krea-identity-edit');assert.deepEqual(sent.loras,loras);assert.deepEqual(sent.loraStrengths,[1,0.8]);
  f.calls.length=0;f.args.manifest.lora_strengths=[1,1];await assert.rejects(generateProviderImage(f.args),{code:'PROVIDER_CHANGED'});assert.equal(f.calls.length,0);
  for(const change of [{loras:['unknown'],lora_strengths:[1]},{loras,lora_strengths:[1]},{loras,lora_strengths:[1,NaN]},{loras,lora_strengths:[1,3]},{loras,lora_strengths,model:'qwen'}])assert.equal(configuredImageProviders({providers:{sogni:{enabled:true,model:'krea-identity-edit',...change}}},{SOGNI_API_KEY:'fixture'}).sogni.available,false);
});

test('model limits and credentials are enforced before any external request and MCP exposes Sogni',async()=>{
  const f=harness();f.args.references.push(f.args.references[0]);await assert.rejects(generateProviderImage(f.args),{code:'REFERENCE_LIMIT'});assert.equal(f.calls.length,0);
  f.args.references.pop();delete f.args.env.SOGNI_API_KEY;await assert.rejects(generateProviderImage(f.args),{code:'PROVIDER_DISABLED'});assert.equal(f.calls.length,0);
  for(const [model,limit] of [['krea-identity-edit',2],['qwen',3],['flux-3-klein',10],['gpt-image-2',16]]){
    const cap=configuredImageProviders({providers:{sogni:{enabled:true,model}}},{SOGNI_API_KEY:'key'}).sogni;assert.equal(cap.max_references,limit);assert.equal(cap.identity_guaranteed,false);
  }
  assert.ok(generationTools.find(t=>t.name==='prepare_image_generation').inputSchema.properties.provider.enum.includes('sogni'));
});

test('paused, failed, interrupted and timed out Sogni workflows never trigger another start or confirmation',async()=>{
  for(const states of [['queued','waiting_for_user'],['failed'],['cancelled'],['partial_failure'],['queued']]){
    const f=harness({states});f.args.sogniOptions.timeoutMs=25;
    await assert.rejects(generateProviderImage(f.args),{code:states.includes('waiting_for_user')?'PROVIDER_REVIEW_REQUIRED':'PROVIDER_OUTCOME_UNKNOWN'});assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,1);assert.deepEqual(f.jobs,['wf_fixture_01']);
  }
  const f=harness({fetchError:true});await assert.rejects(generateProviderImage(f.args),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&!e.message.includes('secret upstream'));assert.equal(f.calls.length,1);
});

test('Sogni rejects oversized results and masks failures after generation without a second paid call',async()=>{
  const f=harness({states:['completed'],downloadBytes:Buffer.alloc(20*1024*1024+1)});await assert.rejects(generateProviderImage(f.args),{code:'PROVIDER_OUTCOME_UNKNOWN'});assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,1);
  const invalid=harness({states:['completed']});invalid.args.sogniOptions.download=async()=>({contentType:'text/html',stream:Readable.from(['login'])});await assert.rejects(generateProviderImage(invalid.args),{code:'PROVIDER_RESULT_INVALID'});
});

test('signed reference PUTs pin public DNS, preserve signatures, omit credentials and refuse redirects/private targets',async()=>{
  let seen;const resolve=async()=>[{address:'8.8.8.8',family:4}];
  const request=(url,options,callback)=>{seen={url:String(url),options};const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{seen.body=body;queueMicrotask(()=>callback({statusCode:200,destroy(){}}));};return req;};
  await safeUpload('https://storage.example/reference?signature=keep-exactly',bytes,{contentType:'image/png',request,resolve});assert.equal(seen.options.method,'PUT');assert.equal(seen.options.headers.Authorization,undefined);assert.ok(seen.url.endsWith('signature=keep-exactly'));assert.equal(seen.body,bytes);
  seen.options.lookup('storage.example',{all:true},(e,addresses)=>assert.equal(addresses[0].address,'8.8.8.8'));
  for(const value of ['https://127.0.0.1/private','http://storage.example/x','https://user:password@storage.example/x'])await assert.rejects(safeUpload(value,bytes,{contentType:'image/png',request,resolve}),{code:'UNSAFE_URL'});
  await assert.rejects(safeUpload('https://storage.example/x',bytes,{contentType:'image/png',resolve,request:(url,options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>callback({statusCode:302,destroy(){}}));return req;}}),{code:'UPLOAD_FAILED'});
});

test('encrypted local key is backend-only and never overwrites supplied environment credentials',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-sogni-key-'));
  try{
    await fs.writeFile(path.join(dir,'sogni-key.dpapi'),'synthetic encrypted key');let calls=0;
    const run=async(exe,args,options)=>{calls++;assert.equal(options.windowsHide,true);assert.ok(args.includes('Read'));return {stdout:'synthetic-local-api-key'};};
    const env={PATH:'retained'};assert.equal((await imageCredentialEnvironment(dir,env,{platform:'win32',run})).SOGNI_API_KEY,'synthetic-local-api-key');assert.equal(env.SOGNI_API_KEY,undefined);
    assert.equal((await imageCredentialEnvironment(dir,{SOGNI_API_KEY:'environment-wins'},{platform:'win32',run})).SOGNI_API_KEY,'environment-wins');assert.equal(calls,1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
