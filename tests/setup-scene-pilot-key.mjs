// Local private key entry only. No network calls, provider enablement or live configuration writes.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function launchPilotKeySetup({selfTest=false,onOutput=chunk=>process.stdout.write(chunk)}={}){
  if(process.platform!=='win32')throw Error('This private key window requires Windows.');
  const systemRoot=process.env.SystemRoot||'C:\\Windows',psRoot=path.join(systemRoot,'System32','WindowsPowerShell','v1.0');
  const source=await readFile(new URL('./scene-pilot-key.ps1',import.meta.url),'utf8');
  const env={...process.env,PSModulePath:path.join(psRoot,'Modules'),LU_SCENE_PILOT_CREDENTIAL_DIR:path.join(process.env.USERPROFILE,'AppData','Local','LivingUniverse','analysis-trial','credentials')};
  for(const key of ['OPENAI_API_KEY','OPENAI_ADMIN_KEY','CONTROL_PLANE_API_KEY','XAI_API_KEY','SOGNI_API_KEY'])delete env[key];
  const command='& {\n'+source+'\n} -Mode '+(selfTest?'SelfTest':'Setup')+' -DataDir $env:LU_SCENE_PILOT_CREDENTIAL_DIR';
  const child=spawn(path.join(psRoot,'powershell.exe'),['-NoProfile','-NonInteractive','-STA','-OutputFormat','Text','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',onOutput);child.stderr.on('data',onOutput);
  return new Promise((resolve,reject)=>{child.on('error',()=>reject(Error('Private key window could not start.')));child.on('close',code=>resolve(code??1));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=process.argv.slice(2);if(args.length>1||args.some(a=>a!=='--self-test'))throw Error('Unsupported option');process.exitCode=await launchPilotKeySetup({selfTest:args.includes('--self-test')});}
  catch{process.stderr.write('PILOT_KEY_SETUP_FAILED: Do not paste a key into this console or the chat.\n');process.exitCode=1;}
}
