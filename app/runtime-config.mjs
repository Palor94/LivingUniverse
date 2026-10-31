import path from 'node:path';
import os from 'node:os';
import {promises as fs} from 'node:fs';

export function absoluteSetting(value,name){
  if(typeof value!=='string'||!value||!path.isAbsolute(value)||value.includes('\0'))throw Error(name+' must be an absolute local path.');
  return path.resolve(value);
}
export function runtimeHome(env=process.env){
  if(env.LU_RUNTIME_HOME)return absoluteSetting(env.LU_RUNTIME_HOME,'LU_RUNTIME_HOME');
  const base=env.LOCALAPPDATA||env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share');
  return path.join(absoluteSetting(base,'Application data directory'),'LivingUniverse');
}
export const mcpConfigPath=(env=process.env)=>env.LU_MCP_CONFIG?absoluteSetting(env.LU_MCP_CONFIG,'LU_MCP_CONFIG'):path.join(runtimeHome(env),'mcp-config.json');
export const defaultDataDir=(env=process.env)=>env.LIVING_UNIVERSE_DATA?absoluteSetting(env.LIVING_UNIVERSE_DATA,'LIVING_UNIVERSE_DATA'):runtimeHome(env);
export function servicePort(value,fallback=4317){
  const port=value===undefined?fallback:Number(value);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid service port.');
  return port;
}
export async function verifyMediaRoot(root,expectedId){
  if(!(await fs.stat(root)).isDirectory()||(await fs.lstat(root)).isSymbolicLink())throw Error('Existing ordinary media root required.');
  if(expectedId!==undefined){
    if(typeof expectedId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(expectedId))throw Error('Invalid media root identity.');
    const marker=path.join(root,'.living-universe-storage.json'),info=await fs.lstat(marker);
    if(!info.isFile()||info.isSymbolicLink()||info.size>4096||JSON.parse(await fs.readFile(marker,'utf8')).storage_id!==expectedId)throw Error('Configured media root identity unavailable.');
  }
}
export async function readRuntimeConfig(file=mcpConfigPath()){
  file=absoluteSetting(file,'MCP configuration');
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>32768)throw Error('Ordinary bounded configuration required.');
  const config=JSON.parse(await fs.readFile(file,'utf8'));
  const database=absoluteSetting(config.database,'database'),mediaRoot=absoluteSetting(config.mediaRoot,'mediaRoot');
  if((process.platform==='win32'?path.basename(database).toLowerCase():path.basename(database))!=='universe.sqlite')throw Error('The application requires an existing universe.sqlite catalogue.');
  if(!(await fs.stat(database)).isFile()||!(await fs.stat(mediaRoot)).isDirectory())throw Error('Existing database and media root required.');
  if((await fs.lstat(database)).isSymbolicLink()||(await fs.lstat(mediaRoot)).isSymbolicLink())throw Error('Linked catalogue or media root refused.');
  if(process.platform!=='win32'&&!config.mediaRootId)throw Error('Linux service requires an explicit mediaRootId marker to detect a missing mount.');
  await verifyMediaRoot(mediaRoot,config.mediaRootId);
  return {...config,database,mediaRoot};
}
