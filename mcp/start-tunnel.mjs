import {spawn} from 'node:child_process';
import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function launch({selfTest=false,newKey=false,unattended=false,onOutput=null}={}){
  if(process.platform!=='win32')throw Error('The private key window requires Windows.');
  const base=path.join(process.env.LOCALAPPDATA,'LivingUniverse','mcp-runtime');
  let client='';if(!selfTest){const versions=(await readdir(base)).filter(v=>/^v\d+\.\d+\.\d+$/.test(v)).sort((a,b)=>b.localeCompare(a,'en',{numeric:true}));
    if(!versions.length)throw Error('The official tunnel client has not been installed at '+base);client=path.join(base,versions[0],'tunnel-client.exe');await access(client);}
  const systemRoot=process.env.SystemRoot||'C:\\Windows';
  const powershell=path.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const source=await readFile(new URL('./run-tunnel.ps1',import.meta.url),'utf8');
  const command='& {\n'+source+'\n} -SaveKey';
  const env={...process.env,PSModulePath:path.join(systemRoot,'System32','WindowsPowerShell','v1.0','Modules'),LU_MCP_TUNNEL_CLIENT:client,LU_MCP_PROFILE_DIRECTORY:path.join(base,'profiles'),LU_MCP_SELF_TEST:selfTest?'1':'0',LU_MCP_NEW_KEY:newKey?'1':'0'};
  for(const key of ['CONTROL_PLANE_API_KEY','OPENAI_API_KEY','OPENAI_ADMIN_KEY','XAI_API_KEY','SOGNI_API_KEY'])delete env[key];
  env.LU_MCP_UNATTENDED=unattended?'1':'0';
  const child=spawn(powershell,['-NoProfile','-NonInteractive','-STA','-OutputFormat','Text','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  if(onOutput){child.stdout.on('data',onOutput);child.stderr.on('data',onOutput);}
  else{child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);}
  return new Promise((resolve,reject)=>{child.on('error',()=>reject(Error('The private key window could not start.')));child.on('close',code=>resolve(code??1));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // Ignore and suppress console input: key entry belongs only in the password window.
  if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stdin.resume();}
  try{const args=process.argv.slice(2);if(args.some(a=>!['--self-test','--new-key','--unattended'].includes(a))||(args.includes('--unattended')&&(args.includes('--new-key')||args.includes('--self-test'))))throw Error('Unsupported launcher option.');process.exitCode=await launch({selfTest:args.includes('--self-test'),newKey:args.includes('--new-key'),unattended:args.includes('--unattended')});}
  catch{process.stderr.write('TUNNEL_LAUNCH_FAILED: No key prompt is active. Do not paste a key here. Close this window and report this message.\n');process.exitCode=1;}
  finally{if(process.stdin.isTTY){process.stdin.setRawMode(false);process.stdin.pause();}}
}
