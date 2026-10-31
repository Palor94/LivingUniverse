import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runtimeHome,absoluteSetting} from '../app/runtime-config.mjs';
import {serviceCredentialEnvironment} from '../app/service-credentials.mjs';

export async function launchNativeTunnel({env=process.env,onOutput=value=>process.stdout.write(value),spawnImpl=spawn,selfTest=false,newKey=false}={}){
  if(selfTest||newKey)throw Error('Provision native credentials outside the launcher; no password GUI or new-key action is available.');
  const client=absoluteSetting(env.LU_MCP_TUNNEL_CLIENT,'LU_MCP_TUNNEL_CLIENT');
  const profiles=absoluteSetting(env.LU_MCP_PROFILE_DIRECTORY||path.join(runtimeHome(env),'mcp-runtime','profiles'),'profile directory');
  const profile=env.LU_MCP_TUNNEL_PROFILE||'living-universe';if(!/^[a-z0-9_-]{1,80}$/i.test(profile))throw Error('Invalid tunnel profile.');
  const info=await fs.lstat(client);if(!info.isFile()||info.isSymbolicLink())throw Error('Ordinary native tunnel executable required.');
  const profileInfo=await fs.lstat(path.join(profiles,profile+'.yaml'));if(!profileInfo.isFile()||profileInfo.isSymbolicLink())throw Error('Ordinary provisioned tunnel profile required.');
  const lockFile=absoluteSetting(env.LU_MCP_TUNNEL_LOCK||path.join(runtimeHome(env),'mcp-runtime','native-tunnel.lock'),'tunnel lock');
  await fs.mkdir(path.dirname(lockFile),{recursive:true,mode:0o700});
  let lock;
  try{lock=await fs.open(lockFile,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('Native tunnel lock exists. Verify the test/service instance before recovery; credentials were not loaded.');throw error;}
  let active=null;
  const stop=signal=>{if(active)active.kill(signal);};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid,profile}));
    const loaded=await serviceCredentialEnvironment(['CONTROL_PLANE_API_KEY'],{env});
    const secret=loaded.CONTROL_PLANE_API_KEY;
    if(!secret)throw Error('Native tunnel credential required.');
    const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','LANG','LC_ALL','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR'].includes(key.toUpperCase())));
    childEnv.CONTROL_PLANE_API_KEY=secret;
    const emit=value=>onOutput(String(value).split(secret).join('[redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@'));
    const run=(command,timeout)=>new Promise((resolve,reject)=>{
      const child=spawnImpl(client,[command,'--profile',profile,'--profile-dir',profiles],{env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});active=child;
      let timer,done=false,pending='';
      const finish=(error,code)=>{if(done)return;done=true;if(timer)clearTimeout(timer);active=null;if(pending)emit(pending);error?reject(error):resolve(code??1);};
      // Buffer complete lines so a secret split across stream chunks is redacted.
      const output=chunk=>{pending+=String(chunk);if(pending.length>65536){child.kill();return finish(Error('Native tunnel diagnostic bound exceeded.'));}let at;while((at=pending.indexOf('\n'))>=0){emit(pending.slice(0,at+1));pending=pending.slice(at+1);}};
      child.stdout.on('data',output);child.stderr.on('data',output);
      child.once('error',()=>finish(Error('Native tunnel client could not start.')));child.once('close',code=>finish(null,code));
      if(timeout)timer=setTimeout(()=>{child.kill();finish(Error('Native tunnel preflight timed out.'));},timeout);
    });
    if(await run('doctor',30000)!==0)throw Error('Native tunnel preflight failed.');
    return await run('run',0);
  }finally{
    process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
    if(active)active.kill();await lock.close();await fs.unlink(lockFile);
  }
}
