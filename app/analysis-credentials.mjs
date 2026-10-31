import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const unavailable=()=>Object.assign(Error('A külön helyi OpenAI-tesztkulcs nem tölthető be. A titkos érték nem része a hibaüzenetnek.'),{code:'CREDENTIAL_REQUIRED'});

// Explicit manual-pilot use only; never mutates process.env or enables a production provider.
export async function pilotCredentialEnvironment({env=process.env,run=promisify(execFile),platform=process.platform}={}){
  if(platform!=='win32'||!env.USERPROFILE)throw unavailable();
  const file=path.join(env.USERPROFILE,'AppData','Local','LivingUniverse','analysis-trial','credentials','openai-analysis-key.dpapi');
  try{
    const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>32768)throw unavailable();
    const psRoot=path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0');
    const script="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';try{$s=ConvertTo-SecureString ([IO.File]::ReadAllText($env:LU_PILOT_KEY_FILE).Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p);$s.Dispose()}}catch{exit 1}";
    const childEnv={...env,LU_PILOT_KEY_FILE:file,PSModulePath:path.join(psRoot,'Modules')};for(const k of ['OPENAI_API_KEY','OPENAI_ADMIN_KEY','CONTROL_PLANE_API_KEY','XAI_API_KEY','SOGNI_API_KEY'])delete childEnv[k];
    const {stdout}=await run(path.join(psRoot,'powershell.exe'),['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:childEnv,windowsHide:true,timeout:15000,maxBuffer:32768});
    const key=stdout.trim();if(key.length<20||key.length>8192||/[\s\x00-\x1f]/u.test(key))throw unavailable();return {...env,OPENAI_API_KEY:key};
  }catch{throw unavailable();}
}
