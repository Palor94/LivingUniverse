import path from 'node:path';
import {promises as fs} from 'node:fs';
import {constants} from 'node:fs';
const allowed=new Set(['OPENAI_API_KEY','XAI_API_KEY','SOGNI_API_KEY','CONTROL_PLANE_API_KEY']);
const unavailable=()=>Error('Configured service credential unavailable. No secret value is included in this error.');

async function systemdCredential(file,env,st){
  const directory=env.CREDENTIALS_DIRECTORY;
  if(!directory||!path.isAbsolute(directory)||path.dirname(file)!==path.resolve(directory)||!/^\/run\/credentials\/[^/]+$/u.test(path.resolve(directory)))return false;
  if(st.uid!==0||(st.mode&0o337)!==0)return false;
  // systemd uses an ACL for the unit UID on root-owned 0440 files.
  // Only its read-only mount under a protected root-owned hierarchy qualifies.
  for(let current=path.resolve(directory);;current=path.dirname(current)){
    const info=await fs.lstat(current);
    if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o022)!==0)return false;
    if(current===path.resolve(directory)&&(info.mode&0o007)!==0)return false;
    if(current===path.dirname(current))break;
  }
  const mounts=await fs.readFile('/proc/self/mountinfo','utf8');
  return mounts.split('\n').some(line=>{const fields=line.split(' ');return fields[4]?.replace(/\\([0-7]{3})/gu,(_,octal)=>String.fromCharCode(parseInt(octal,8)))===path.resolve(directory)&&fields[5]?.split(',').includes('ro');});
}

// Operator-owned files/systemd credentials only; never model-supplied tool input.
export async function serviceCredentialEnvironment(names,{env=process.env}={}){
  const result={...env};
  for(const name of names){
    if(!allowed.has(name))throw unavailable();
    if(result[name])continue;
    const explicit=env[name+'_FILE'];
    const file=explicit||(env.CREDENTIALS_DIRECTORY?path.join(env.CREDENTIALS_DIRECTORY,name):null);
    if(!file)continue;
    let handle,bytes;
    try{
      if(!path.isAbsolute(file))throw unavailable();
      if((await fs.lstat(file)).isSymbolicLink())throw unavailable();
      handle=await fs.open(file,constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW));
      const st=await handle.stat();
      if(!st.isFile()||st.size<1||st.size>8192)throw unavailable();
      if(process.platform!=='win32'&&((st.mode&0o077)!==0||st.uid!==process.getuid())&&!await systemdCredential(file,env,st))throw unavailable();
      bytes=await handle.readFile();const after=await handle.stat();
      if(bytes.length!==st.size||st.size!==after.size||st.ctimeMs!==after.ctimeMs||st.mtimeMs!==after.mtimeMs)throw unavailable();
      const value=bytes.toString('utf8').trim();
      if(value.length<8||value.length>8192||/[\s\x00-\x1f]/u.test(value))throw unavailable();
      result[name]=value;
    }catch(error){if(!explicit&&error.code==='ENOENT')continue;throw unavailable();}
    finally{bytes?.fill(0);await handle?.close();}
  }
  return result;
}
