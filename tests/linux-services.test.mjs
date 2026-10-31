import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {serviceCredentialEnvironment} from '../app/service-credentials.mjs';
import {launchNativeTunnel} from '../mcp/native-tunnel.mjs';

async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-service-fixture-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('service credentials support explicit private files and systemd scopes without mutating the caller environment',async t=>{
  const dir=await temporary(t),file=path.join(dir,'SOGNI_API_KEY');await fs.writeFile(file,'synthetic-credential-only\n',{mode:0o600});
  const env={CREDENTIALS_DIRECTORY:dir};const loaded=await serviceCredentialEnvironment(['SOGNI_API_KEY','OPENAI_API_KEY'],{env});assert.equal(loaded.SOGNI_API_KEY,'synthetic-credential-only');assert.equal(env.SOGNI_API_KEY,undefined);assert.equal(loaded.OPENAI_API_KEY,undefined);
  assert.equal((await serviceCredentialEnvironment(['SOGNI_API_KEY'],{env:{SOGNI_API_KEY_FILE:file}})).SOGNI_API_KEY,'synthetic-credential-only');
  assert.equal((await serviceCredentialEnvironment(['SOGNI_API_KEY'],{env:{SOGNI_API_KEY:'explicit-synthetic',SOGNI_API_KEY_FILE:path.join(dir,'missing')}})).SOGNI_API_KEY,'explicit-synthetic');
});
test('credential files reject missing, relative, malformed, oversized, symlink and loose POSIX permissions without exposing values',async t=>{
  const dir=await temporary(t),file=path.join(dir,'private');
  for(const value of ['too short','contains whitespace secret','x'.repeat(8193)]){
    await fs.writeFile(file,value,{mode:0o600});await assert.rejects(serviceCredentialEnvironment(['OPENAI_API_KEY'],{env:{OPENAI_API_KEY_FILE:file}}),error=>{assert.ok(!error.message.includes(value));return true;});
  }
  for(const location of ['relative',path.join(dir,'missing')])await assert.rejects(serviceCredentialEnvironment(['OPENAI_API_KEY'],{env:{OPENAI_API_KEY_FILE:location}}),/credential unavailable/);
  await fs.writeFile(file,'synthetic-test-credential',{mode:0o600});
  if(process.platform!=='win32'){await fs.chmod(file,0o644);await assert.rejects(serviceCredentialEnvironment(['OPENAI_API_KEY'],{env:{OPENAI_API_KEY_FILE:file}}));await fs.chmod(file,0o600);await fs.symlink(file,path.join(dir,'link'));await assert.rejects(serviceCredentialEnvironment(['OPENAI_API_KEY'],{env:{OPENAI_API_KEY_FILE:path.join(dir,'link')}}));}
  await assert.rejects(serviceCredentialEnvironment(['ARBITRARY_PRIVATE_FILE'],{env:{}}));
});
async function tunnelFixture(t){
  const dir=await temporary(t),client=path.join(dir,'native-client-fixture'),profiles=path.join(dir,'profiles'),lock=path.join(dir,'client.lock');await fs.mkdir(profiles);await fs.writeFile(client,'synthetic executable marker');await fs.writeFile(path.join(profiles,'living-universe.yaml'),'synthetic profile');
  const env={LU_MCP_TUNNEL_CLIENT:client,LU_MCP_PROFILE_DIRECTORY:profiles,LU_MCP_TUNNEL_LOCK:lock,LU_RUNTIME_HOME:dir,CONTROL_PLANE_API_KEY:'synthetic-tunnel-secret',OPENAI_API_KEY:'forbidden-provider-key',XAI_API_KEY:'forbidden-provider-key',SOGNI_API_KEY:'forbidden-provider-key',NODE_OPTIONS:'forbidden-preload',LU_MCP_CONFIG:'private-unrelated-path'};
  return {dir,client,profiles,lock,env};
}
test('native tunnel runs doctor before run, redacts split credentials, scopes environment and removes only its test lock',async t=>{
  const f=await tunnelFixture(t),calls=[],lines=[];
  const spawnImpl=(client,args,options)=>{
    assert.equal(client,f.client);assert.deepEqual(args.slice(1),['--profile','living-universe','--profile-dir',f.profiles]);assert.equal(options.env.CONTROL_PLANE_API_KEY,f.env.CONTROL_PLANE_API_KEY);
    for(const name of ['OPENAI_API_KEY','XAI_API_KEY','SOGNI_API_KEY','NODE_OPTIONS','LU_MCP_CONFIG'])assert.equal(options.env[name],undefined);
    calls.push(args[0]);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    setImmediate(()=>{child.stdout.write('synthetic-tunnel-');child.stdout.write('secret\n');child.stderr.write('sk-synthetic_test_value\n');child.emit('close',0);});return child;
  };
  assert.equal(await launchNativeTunnel({env:f.env,spawnImpl,onOutput:line=>lines.push(line)}),0);assert.deepEqual(calls,['doctor','run']);assert.ok(!lines.join('').includes(f.env.CONTROL_PLANE_API_KEY));assert.ok(!lines.join('').includes('sk-synthetic_test_value'));await assert.rejects(fs.stat(f.lock),{code:'ENOENT'});
});
test('native tunnel refuses a duplicate before credentials and failed doctor never starts transport',async t=>{
  const f=await tunnelFixture(t);await fs.writeFile(f.lock,'existing synthetic owner');
  await assert.rejects(launchNativeTunnel({env:{...f.env,CONTROL_PLANE_API_KEY:undefined,CONTROL_PLANE_API_KEY_FILE:'missing'},spawnImpl:()=>{throw Error('must not spawn');}}),/lock exists/);assert.equal(await fs.readFile(f.lock,'utf8'),'existing synthetic owner');await fs.unlink(f.lock);
  const calls=[];const spawnImpl=(client,args)=>{calls.push(args[0]);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};setImmediate(()=>child.emit('close',1));return child;};
  await assert.rejects(launchNativeTunnel({env:f.env,spawnImpl,onOutput:()=>{}}),/preflight failed/);assert.deepEqual(calls,['doctor']);await assert.rejects(fs.stat(f.lock),{code:'ENOENT'});
});
test('native launcher rejects GUI/new-key and invalid configuration without reading a credential',async()=>{
  await assert.rejects(launchNativeTunnel({newKey:true,env:{}}),/Provision/);await assert.rejects(launchNativeTunnel({selfTest:true,env:{}}),/Provision/);await assert.rejects(launchNativeTunnel({env:{LU_MCP_TUNNEL_CLIENT:'relative'}}),/absolute/);
});
