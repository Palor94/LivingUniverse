import {organized,resourceRoot} from './storage-layout.mjs';
// Runs in the same Windows environment as the desktop launcher, not the coding host.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {preserveRecoveredSorting} from './legacy-sorting.mjs';

const tables=['characters','media','depictions','canon','reviews','media_notes'];
function inspect(file){const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Catalogue integrity check failed.');return Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));}finally{db.close();}}
export async function ensureDesktopCatalogue({dataDir,seed,manifest}){
  if(!dataDir||!path.isAbsolute(dataDir))throw Error('The launcher must specify an absolute local database folder.');
  const target=path.join(dataDir,'universe.sqlite');
  async function carryForwardSorting(){let saved;try{saved=JSON.parse(await fs.readFile(manifest,'utf8'));}catch(e){if(e.code==='ENOENT')return 0;throw e;}return saved.legacy_sorted_media_ids?preserveRecoveredSorting(target,saved.legacy_sorted_media_ids):0;}
  try{await fs.access(target);const counts=inspect(target);if(!counts.characters)throw Error('This catalogue has no characters. It was left untouched; recovery will not overwrite it.');return {database:target,created:false,counts,restored_sorted:await carryForwardSorting()};}catch(e){if(e.code!=='ENOENT')throw e;}
  const expected=JSON.parse(await fs.readFile(manifest,'utf8'));const hash=createHash('sha256').update(await fs.readFile(seed)).digest('hex');
  if(hash!==expected.sha256)throw Error('The recovery backup checksum does not match. No database was created.');
  if(!tables.every(t=>Number.isInteger(expected.counts?.[t])&&expected.counts[t]>=0)||!expected.counts.characters)throw Error('Invalid recovery manifest.');
  await fs.mkdir(dataDir,{recursive:true});
  // COPYFILE_EXCL refuses to replace any file, including a concurrent first launch.
  try{await fs.copyFile(seed,target,fs.constants.COPYFILE_EXCL);}catch(e){if(e.code==='EEXIST')return ensureDesktopCatalogue({dataDir,seed,manifest});throw e;}
  try{const counts=inspect(target);if(tables.some(t=>counts[t]!==expected.counts[t]))throw Error('Recovered catalogue record counts do not match.');return {database:target,created:true,counts,restored_sorted:await carryForwardSorting()};}
  catch(e){const failed=path.join(dataDir,'recovery-needs-review-'+randomUUID()+'.sqlite');await fs.rename(target,failed);throw Error(e.message+' The unverified copy was preserved at '+failed);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),mediaRoot=resourceRoot(root),seedRoot=organized(mediaRoot)?path.join(mediaRoot,'90_BACKUPS','Legacy','backups'):path.join(root,'backups');
  try{const result=await ensureDesktopCatalogue({dataDir:process.env.LIVING_UNIVERSE_DATA,seed:path.join(seedRoot,'desktop-recovery-20261025.sqlite'),manifest:path.join(seedRoot,'desktop-recovery-20261025.json')});console.log(result.created?'Recovered catalogue installed in Windows local storage.':'Existing desktop catalogue preserved.');console.log(`${result.counts.characters} character records; ${result.counts.media} media records.`);console.log(result.database);}
  catch(e){console.error('Living Universe could not open its catalogue: '+e.message);process.exitCode=1;}
}
