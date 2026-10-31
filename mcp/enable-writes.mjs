import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {databaseIdentity} from '../app/character-edit.mjs';

export async function enableWrites({configFile,checkpoint,checkOnly=false}){
  if(!path.isAbsolute(configFile)||!path.isAbsolute(checkpoint))throw Error('Use explicit local configuration and checkpoint paths.');
  const original=await fs.readFile(configFile),config=JSON.parse(original),database=await fs.realpath(config.database),dataDir=path.dirname(database),writeConfig=path.join(dataDir,'mcp-writes.json');
  const within=(root,file)=>{const rel=path.relative(root,file);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
  if(process.env.OneDrive&&(within(await fs.realpath(process.env.OneDrive),database)||within(await fs.realpath(process.env.OneDrive),await fs.realpath(configFile))||within(await fs.realpath(process.env.OneDrive),await fs.realpath(checkpoint))))throw Error('Keep active configuration and recovery files outside OneDrive.');
  if((await fs.lstat(configFile)).isSymbolicLink())throw Error('Configuration must be an ordinary local file.');
  const manifestBytes=await fs.readFile(path.join(checkpoint,'manifest.json')),manifest=JSON.parse(manifestBytes),checksums=JSON.parse(await fs.readFile(path.join(checkpoint,'SHA256SUMS.json'),'utf8'));
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  if(checksums['manifest.json']!==sha(manifestBytes)||databaseIdentity(manifest.database.source)!==databaseIdentity(database)||manifest.database.method!=='node:sqlite online backup API; read-only source transaction')throw Error('The verified online recovery checkpoint must match the authoritative catalogue.');
  const backup=path.join(checkpoint,'universe.sqlite');if(sha(await fs.readFile(backup))!==manifest.database.sha256||checksums['universe.sqlite']!==manifest.database.sha256)throw Error('Recovery backup integrity digest mismatch.');
  const db=new DatabaseSync(backup,{readOnly:true,allowExtension:false});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Recovery backup SQLite verification failed.');}finally{db.close();}
  const mobile=JSON.parse(await fs.readFile(path.join(dataDir,'mobile-access.json'),'utf8')),origin=new URL(mobile.origin);
  if(mobile.enabled!==true||origin.protocol!=='https:'||!origin.hostname.endsWith('.ts.net')||origin.port||origin.origin!==mobile.origin||typeof mobile.login!=='string'||!mobile.login.trim())throw Error('Enable the existing restricted Tailscale editor before enabling approvals.');
  const storage=await fetch('http://127.0.0.1:4317/api/storage',{redirect:'error',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Desktop application unavailable.');return r.json();});
  if(databaseIdentity(storage.database)!==databaseIdentity(database)||path.resolve(storage.resource_root)!==path.resolve(config.mediaRoot))throw Error('The running application and MCP catalogue disagree.');
  if(checkOnly)return {verified:true,backup_verified:true,approval_origin:origin.origin};
  if(config.writeConfig)throw Error('Write access is already configured. Existing configuration was left untouched.');
  const settings={enabled:true,token:randomBytes(32).toString('hex'),database_id:databaseIdentity(database),app_url:'http://127.0.0.1:4317',origin:origin.origin,login:mobile.login.trim().toLowerCase()};
  await fs.writeFile(writeConfig,JSON.stringify(settings,null,2)+'\n',{flag:'wx',mode:0o600});
  if(process.platform==='win32'){const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-\d+(?:-\d+)+/)?.[0];if(!sid)throw Error('Could not verify local credential permissions.');execFileSync('icacls.exe',[writeConfig,'/inheritance:r','/grant:r','*'+sid+':F','*S-1-5-18:F'],{windowsHide:true,stdio:'pipe'});}
  // Preserve the previous config and use an atomic replacement; never touch DB bytes.
  const stamp=Date.now();await fs.copyFile(configFile,configFile+'.before-writes-'+stamp,constants.COPYFILE_EXCL);
  const next=configFile+'.pending-'+stamp;await fs.writeFile(next,JSON.stringify({...config,writeConfig},null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(next,configFile);
  return {configured:true,backup_verified:true,approval_origin:origin.origin,restart_required:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=process.argv.slice(2),values={};for(let i=0;i<args.length;i++){if(args[i]==='--check-only'){values.checkOnly=true;continue;}if(!['--config','--checkpoint'].includes(args[i])||!args[i+1])throw Error('Use --config, --checkpoint and optional --check-only.');values[args[i]]=args[++i];}const result=await enableWrites({configFile:values['--config'],checkpoint:values['--checkpoint'],checkOnly:values.checkOnly});process.stdout.write(JSON.stringify(result)+'\n');}
  catch(e){process.stderr.write('WRITE_SETUP_NOT_COMPLETED: '+e.message+'\n');process.exitCode=1;}
}
