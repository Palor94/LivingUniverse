import {readFileSync,existsSync,lstatSync,promises as fs} from 'node:fs';
import path from 'node:path';

// Explicit opt-in keeps legacy portable catalogues and fixtures unchanged.
export function organized(root){
  const file=path.join(root,'00_SYSTEM','config','storage-layout.json');
  if(!existsSync(file))return false;
  if(lstatSync(file).isSymbolicLink())throw Error('Linked storage configuration refused.');
  const config=JSON.parse(readFileSync(file,'utf8'));
  if(config.layout_version!==1)throw Error('Unsupported storage layout.');
  return true;
}
export function resourceRoot(project){return path.basename(project)==='project'&&path.basename(path.dirname(project))==='00_SYSTEM'?path.resolve(project,'../..'):project;}
export function characterFolder(root,name){return organized(root)?path.join('10_CHARACTERS',name):name;}
export function characterParent(root){return organized(root)?path.join(root,'10_CHARACTERS'):root;}
export function catalogueFolder(root,relative){const parts=relative.split(/[\\/]/);return organized(root)&&['10_CHARACTERS','20_SHARED_MEDIA'].includes(parts[0])&&parts.length>2?path.join(...parts.slice(0,2)):parts.length>1?parts[0]:'';}
export function scanPathAllowed(root,relative){return !organized(root)||['10_CHARACTERS','20_SHARED_MEDIA'].includes(relative.split(/[\\/]/)[0]);}
export function trashFolder(root){return organized(root)?path.join('99_ARCHIVE','Removed'):'.living-universe-trash';}
export function mediaDestinationAllowed(root,relative){if(!organized(root))return true;const p=relative.split(/[\\/]/);return p[0]==='10_CHARACTERS'&&p.length>=3||p[0]==='20_SHARED_MEDIA'&&['Scenes','Locations','Unassigned'].includes(p[1])&&p.length>=3||p[0]==='99_ARCHIVE'&&p[1]==='Removed'&&p.length>=4;}

// Windows directory enumeration can label OneDrive cloud reparse entries as links.
// lstat distinguishes real symlinks/junctions without opening or downloading contents.
export async function storageEntries(directory){return Promise.all((await fs.readdir(directory)).map(async name=>{const s=await fs.lstat(path.join(directory,name));return {name,isSymbolicLink:()=>s.isSymbolicLink(),isDirectory:()=>s.isDirectory(),isFile:()=>s.isFile()};}));}
