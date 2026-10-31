import path from 'node:path';
import {promises as fs} from 'node:fs';
const allowed=new Set(['OPENAI_API_KEY','XAI_API_KEY','SOGNI_API_KEY','CONTROL_PLANE_API_KEY']);
const unavailable=()=>Error('Configured service credential unavailable. No secret value is included in this error.');

// Operator-owned files/systemd credentials only; never model-supplied tool input.
export async function serviceCredentialEnvironment(names,{env=process.env}={}){
  const result={...env};
  for(const name of names){
    if(!allowed.has(name))throw unavailable();
    if(result[name])continue;
    const explicit=env[name+'_FILE'];
    const file=explicit||(env.CREDENTIALS_DIRECTORY?path.join(env.CREDENTIALS_DIRECTORY,name):null);
    if(!file)continue;
    try{
      if(!path.isAbsolute(file))throw unavailable();
      const st=await fs.lstat(file);
      if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>8192)throw unavailable();
      if(process.platform!=='win32'&&((st.mode&0o077)!==0||st.uid!==process.getuid()))throw unavailable();
      const value=(await fs.readFile(file,'utf8')).trim();
      if(value.length<8||value.length>8192||/[\s\x00-\x1f]/u.test(value))throw unavailable();
      result[name]=value;
    }catch(error){if(!explicit&&error.code==='ENOENT')continue;throw unavailable();}
  }
  return result;
}
