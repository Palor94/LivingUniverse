import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

// DPAPI ciphertext stays in the existing local data directory, never in OneDrive.
export async function imageCredentialEnvironment(dataDir,env=process.env,{platform=process.platform,run=promisify(execFile)}={}){
  const result={...env};if(result.SOGNI_API_KEY||platform!=='win32')return result;
  try{const stat=await fs.lstat(path.join(dataDir,'sogni-key.dpapi'));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)return result;}
  catch{return result;}
  try{
    const psRoot=path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0');
    const {stdout}=await run(path.join(psRoot,'powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./sogni-key.ps1',import.meta.url)),'-Mode','Read','-DataDir',path.resolve(dataDir)],{windowsHide:true,timeout:15000,maxBuffer:32768,env:{...env,PSModulePath:path.join(psRoot,'Modules')}});
    const key=stdout.trim();if(key.length>=8&&key.length<=8192&&!/[\s\x00-\x1f]/.test(key))result.SOGNI_API_KEY=key;
  }catch{console.error('Sogni key unavailable: run Connect Sogni again under the Windows account that saved it.');}
  return result;
}
