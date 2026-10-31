import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pilotCredentialEnvironment} from '../app/analysis-credentials.mjs';
async function fixture(fn){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lu-analysis-credentials-')),file=path.join(root,'AppData','Local','LivingUniverse','analysis-trial','credentials','openai-analysis-key.dpapi');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'synthetic-ciphertext');
  try{await fn({root,file});}finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('lu-analysis-credentials-'));await fs.rm(root,{recursive:true,force:true});}
}
test('pilot key loader captures only the dedicated credential in memory, never in arguments or global environment',()=>fixture(async({root})=>{
  const env={USERPROFILE:root,SystemRoot:'C:\\Windows',OPENAI_API_KEY:'unrelated-existing-key',CONTROL_PLANE_API_KEY:'unrelated-tunnel-key'},fake='synthetic-only-openai-pilot-credential';let called=0;
  const loaded=await pilotCredentialEnvironment({env,platform:'win32',run:async(exe,args,options)=>{called++;assert.ok(exe.endsWith('powershell.exe'));assert.ok(!JSON.stringify(args).includes(fake));assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.env.CONTROL_PLANE_API_KEY,undefined);assert.equal(options.windowsHide,true);return {stdout:fake};}});
  assert.equal(called,1);assert.equal(loaded.OPENAI_API_KEY,fake);assert.equal(env.OPENAI_API_KEY,'unrelated-existing-key');
}));
test('pilot key loader rejects oversized files before decryption and redacts decryption errors',()=>fixture(async({root,file})=>{
  let calls=0;const options={env:{USERPROFILE:root},platform:'win32',run:async()=>{calls++;throw Error('sensitive fixture text');}};
  await assert.rejects(pilotCredentialEnvironment(options),e=>e.code==='CREDENTIAL_REQUIRED'&&!e.message.includes('sensitive fixture text'));assert.equal(calls,1);
  await fs.writeFile(file,'x'.repeat(32769));await assert.rejects(pilotCredentialEnvironment(options),{code:'CREDENTIAL_REQUIRED'});assert.equal(calls,1);
}));
