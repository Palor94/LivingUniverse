import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {organized,resourceRoot} from '../app/storage-layout.mjs';

// Run in the actual tunnel service account before the native client reads its
// profile. Repair only this installation's legacy server path; keep identity,
// credentials, URLs and all other operator configuration byte-for-byte.
export async function refreshTunnelProfileSource({project,profileDirectory}){
 const root=resourceRoot(project);if(!organized(root))return {changed:false};
 const file=path.join(profileDirectory,'living-universe.yaml'),stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Ordinary tunnel profile required.');
 const bytes=await fs.readFile(file),text=bytes.toString('utf8'),legacy=path.join(root,'mcp','server.mjs'),current=path.join(project,'mcp','server.mjs'),slash=s=>s.replaceAll('\\','/');
 const updated=text.split(slash(legacy)).join(slash(current)).split(legacy).join(current);if(updated===text)return {changed:false};
 const backupDir=path.join(path.dirname(profileDirectory),'profile-path-backups');await fs.mkdir(backupDir,{recursive:true});const id=randomUUID(),backup=path.join(backupDir,id+'.yaml'),temp=path.join(profileDirectory,'living-universe.'+id+'.tmp');
 await fs.writeFile(backup,bytes,{flag:'wx',mode:0o600});await fs.writeFile(temp,updated,{flag:'wx',mode:0o600});await fs.rename(temp,file);return {changed:true,backup};
}
