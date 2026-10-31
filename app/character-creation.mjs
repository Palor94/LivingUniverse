import {randomInt,randomUUID} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {races} from './public/character-options.js';

const firstNames='Adam Adrian Alexander Andras Aron Balazs Bence Benjamin Daniel David Elias Emil Erik Felix Gabriel Gabor Henrik Hugo Isaac Istvan Jacob James Jonas Jonathan Joseph Julian Kristof Laszlo Leo Liam Lorant Lucas Mark Martin Mate Matthew Milan Nicholas Noah Oliver Oscar Peter Rafael Richard Robert Samuel Sebastian Simon Stephen Tamas Theodore Thomas Tobias Tristan Victor Vincent William Zoltan'.split(' ');
const familyNames='Archer Bennett Brooks Carter Collins Cooper Davis Farkas Fischer Foster Hayes Horvath Hunter Kovacs Lawson Morgan Nagy Novak Parker Reed Spencer Szabo Varga Walker'.split(' ');
export const maleNameCandidates=Object.freeze(firstNames.flatMap(first=>familyNames.map(last=>`${first} ${last}`)));
export const normalizeName=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en');
export function raceValue(value){
  if(value===undefined||value===null||value==='')return 'human';
  if(typeof value!=='string'||!races.some(([key])=>key===value))throw Object.assign(new Error('Choose a race from the list.'),{status:400});
  return value;
}
export function suggestMaleName(existing,exclude=[],candidates=maleNameCandidates,pick=randomInt){
  if(!Array.isArray(exclude)||exclude.length>5000||exclude.some(n=>typeof n!=='string'||n.length>200))throw Object.assign(new Error('Provide a valid list of previous name suggestions.'),{status:400});
  const used=new Set(existing.map(normalizeName)),seen=new Set(exclude.map(normalizeName));
  const eligible=candidates.filter(n=>!used.has(normalizeName(n)));
  if(!eligible.length)return {name:null,exhausted:true,message:'All suggested names are already in the database. Enter a name manually.'};
  const fresh=eligible.filter(n=>!seen.has(normalizeName(n)));
  // Repeat only after the session has shown every available candidate, avoiding the current input.
  const current=normalizeName(exclude.at(-1)),pool=fresh.length?fresh:eligible.filter(n=>normalizeName(n)!==current);
  if(!pool.length)return {name:null,exhausted:true,message:'No other unused suggestion is available. Keep this name or edit it manually.'};
  return {name:pool[pick(pool.length)],exhausted:false,recycled:!fresh.length,message:fresh.length?'Name suggested. You can edit it before creating the character.':'All available suggestions have been shown. Starting another round.'};
}
export async function migrateCharacterRace(db,dataDir){
  if(db.prepare('PRAGMA table_info(characters)').all().some(c=>c.name==='race'))return;
  if(db.prepare('SELECT 1 FROM characters LIMIT 1').get()){
    const folder=path.join(dataDir,'backups');await fs.mkdir(folder,{recursive:true});
    const file=path.join(folder,'before-character-race-'+randomUUID()+'.sqlite');await backup(db,file);
    const copy=new DatabaseSync(file,{readOnly:true});
    try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Character race migration backup failed verification.');}finally{copy.close();}
  }
  db.exec(readFileSync(new URL('./migrations/022-character-race.up.sql',import.meta.url),'utf8'));
}
