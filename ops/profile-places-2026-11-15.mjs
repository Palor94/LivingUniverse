#!/usr/bin/env node
// Plan docs/PROFIL_TERV_2026-11-15.md, step 3. (1) Undo the keyword place suggester run of
// 2026-11-15 09:47 (81 links, too broad: wrong-city rooms, gym for an orc, 25 characters outside the
// plan). (2) Link the 22 plan characters to the tree places named in their accepted routines,
// source "suggested" (editable, removable in Élő világ). Dry run by default; --apply writes in one
// transaction after a backup made by profile-fill-2026-11-15.mjs, journal in <data>/backups.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolveDataDir} from '../app/server.mjs';

// The app stamps world_places with its game clock: the run is the 81 rows of this one second.
const UNDO_SINCE='2026-11-17T09:55:06',UNDO_UNTIL='2026-11-17T09:55:07';
// name → [[role, tree node name], …]
const LINKS={
  'Albert':[['home','Budapest - Albert háza - Nappali'],['routine','Budapest - Városliget']],
  'Ghor-Ka':[['home','Palor szobája - szekrény - Ork falu'],['routine','Palor szobája - szekrény - Goblin falu']],
  'Gyuszi':[['work','Káloz - Műhely'],['routine','Káloz - Kocsma'],['routine','Káloz - Szőlőhegy - Présház']],
  'Gábor':[['routine','Park'],['routine','Székesfehérvár - Alba Pláza - Pláza előtti tér'],['routine','Székesfehérvár - Kávézó']],
  'Jessi':[['routine','Budapest - Edzőterem'],['routine','Jonas háza - Nappali'],['routine','Fotózás'],['routine','Budapest - Városliget']],
  'Jocó bácsi':[['home','Káloz - Szomszéd ház - nappali'],['work','Káloz - Műhely'],['routine','Káloz - Kocsma'],['routine','Káloz - Szőlőhegy - Présház']],
  'Kazuto':[['home','Budapest - Kollégium - Ren és Kazuto szobája'],['work','Budapest - Egyetem'],['routine','Budapest - Könyvtár'],['routine','Budapest - Kollégium - Közösségi tér'],['routine','Budapest - Kávézó']],
  'Kevin':[['work','Budapest - Egyetem'],['routine','Budapest - Városliget'],['routine','Budapest - Edzőterem'],['routine','Budapest - Kávézó']],
  'Kristóf':[['work','Budapest - Edzőterem'],['routine','Erdő'],['routine','Kiránduló hely a hegyekben']],
  'Krisztián':[['routine','Budapest - Edzőterem'],['routine','Budapest - Városliget'],['routine','Budapest - Kocsma']],
  'Laci':[['home','Laci háza - Nappali'],['routine','Budapest - Városliget'],['routine','Budapest - Kávézó'],['routine','Balaton - Strand']],
  'Matt':[['work','Budapest - Egyetem'],['routine','Budapest - Városliget'],['routine','Budapest - Kocsma']],
  'Raul - Brazil utazó':[['routine','Budapest - Edzőterem'],['routine','Fotózás'],['routine','Budapest - Városliget'],['routine','Budapest - Templom tér'],['routine','Budapest - Kocsma'],['routine','Balaton - Strand']],
  'Ren':[['home','Budapest - Kollégium - Ren és Kazuto szobája'],['work','Budapest - Egyetem'],['work','Budapest - Kórház'],['routine','Budapest - Kollégium - Közösségi tér'],['routine','Budapest - Könyvtár']],
  'Ricsi':[['routine','Budapest - Lángosozó'],['routine','Budapest - Utca'],['routine','Budapest - Kocsma'],['routine','Kelenfüld']],
  'Serge':[['work','Budapest - Utca'],['routine','Budapest - Templom tér'],['routine','Budapest - Városliget'],['routine','Budapest - Kávézó'],['routine','Budapest - Stadion - Nézőtér']],
  'Tamás':[['work','Fotózás'],['routine','Vasútállomás'],['routine','Vonat'],['routine','Kelenfüld'],['routine','Budapest - Edzőterem'],['routine','Budapest - Kocsma']],
  'Valentin':[['home','Valentin lakása - nappali'],['home','Valentin lakása - hálószoba'],['routine','Budapest - Edzőterem'],['routine','Budapest - Kocsma'],['routine','Budapest - Kávézó'],['routine','Budapest - Városliget'],['routine','Budapest - Templom tér'],['routine','Balaton - Strand']],
  'Zsolti':[['work','Budapest - Edzőterem'],['routine','Budapest - Városliget'],['routine','Budapest - Kocsma']],
  'Zsombor':[['home','Budapest - Kollégium - Zsombor szobája'],['work','Budapest - Egyetem'],['routine','Budapest - Könyvtár'],['routine','Budapest - Kávézó']],
  'Zzap':[['home','Palor szobája - szekrény - Goblin falu'],['routine','Palor szobája - szekrény - Ork falu']],
  'Ádám':[['routine','Supermarket'],['routine','Káloz - Edzőterem'],['routine','Park'],['routine','Székesfehérvár - Kávézó']]
};
const apply=process.argv.includes('--apply'),dataDir=resolveDataDir(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'));db.exec('PRAGMA busy_timeout=8000');
const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
const canvas=JSON.parse(await fs.readFile(path.join(dataDir,'location-canvas.json'),'utf8'));
const nodes=canvas.revisions.at(-1).state.nodes.filter(n=>!n.archived&&n.source_id);
const loc=name=>{const hits=nodes.filter(n=>n.name===name);if(hits.length!==1)throw new Error(`Tree place "${name}": ${hits.length} matches`);if(!one('SELECT 1 FROM locations WHERE id=?',hits[0].source_id))throw new Error('No location for '+name);return hits[0].source_id;};
const undo=all("SELECT p.*,c.name character_name,l.name location_name FROM world_places p JOIN characters c ON c.id=p.character_id JOIN locations l ON l.id=p.location_id WHERE p.source='suggested' AND p.created_at>=? AND p.created_at<?",UNDO_SINCE,UNDO_UNTIL);
const add=[];
for(const [name,links] of Object.entries(LINKS)){
  const c=one('SELECT id FROM characters WHERE name=?',name);if(!c)throw new Error('No character '+name);
  for(const [role,place] of links)add.push({character_id:c.id,character_name:name,location_id:loc(place),place,role});
}
console.log(JSON.stringify({undo:undo.length,add:add.length}));
if(!apply){console.log('Dry run. Use --apply.');process.exit(0);}
const at=new Date().toISOString();let added=0;
db.exec('BEGIN IMMEDIATE');
try{
  for(const r of undo)run('DELETE FROM world_places WHERE id=?',r.id);
  for(const a of add){a.id=randomUUID();a.inserted=Number(run('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?)',a.id,a.character_id,a.location_id,a.role,'Profil-rutin alapján (2026-11-15)','suggested',at).changes);added+=a.inserted;}
  db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
const j=path.join(dataDir,'backups',`profile-places-journal-${stamp}.json`);
await fs.writeFile(j,JSON.stringify({at,removed:undo,added:add},null,1));
console.log(JSON.stringify({removed:undo.length,added,journal:j}));
