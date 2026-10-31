import {DatabaseSync,backup} from 'node:sqlite';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const error=(message,status=409)=>Object.assign(Error(message),{status});
export function validateLocationHierarchy(db){
  const rows=db.prepare('SELECT id,name,name_key,parent_id FROM locations').all(),byId=new Map(rows.map(r=>[r.id,r]));
  const keys=new Set();for(const row of rows){
    if(typeof row.name!=='string'||!row.name.trim()||row.name.length>100||row.name_key!==row.name.trim().normalize('NFC').toLocaleLowerCase('hu'))throw error('Érvénytelen helyszínnév vagy névkulcs.');
    const key=JSON.stringify([row.parent_id,row.name_key]);if(keys.has(key))throw error('Azonos nevű helyszínek ugyanazon szülő alatt.');keys.add(key);
    let current=row,seen=new Set();while(current){if(seen.has(current.id)||seen.size>=128)throw error('Kör vagy 128 szintnél mélyebb helyszínfa.');seen.add(current.id);if(current.parent_id&&!byId.has(current.parent_id))throw error('Hiányzó szülőhelyszín.');current=current.parent_id?byId.get(current.parent_id):null;}
  }
  for(const p of db.prepare('SELECT location_id,parent_id FROM location_profiles').all())if(byId.get(p.location_id)?.parent_id!==p.parent_id)throw error('Eltérő helyszín- és profilkapcsolat.');
  return rows;
}
async function verifiedBackup(db,dataDir,prefix){
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,prefix+'-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{
    if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw error('Az adatbázismentés ellenőrzése sikertelen.');
  }finally{copy.close();}return file;
}
function rebuild(db,script,check){
  if(db.isTransaction)throw error('A helyszínmigráció külön adatbázis-tranzakciót igényel.');
  db.exec('PRAGMA foreign_keys=OFF');
  try{
    db.exec('BEGIN EXCLUSIVE');db.exec(readFileSync(new URL('./migrations/'+script,import.meta.url),'utf8'));
    check();if(db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw error('A helyszínmigráció integritásellenőrzése sikertelen.');
    db.exec('COMMIT');
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.exec('PRAGMA foreign_keys=ON');}
}
export async function migrateLocationHierarchy(db,dataDir,{backupRequired=true}={}){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='location_schema'").get()){
    if(db.prepare('SELECT version FROM location_schema WHERE id=1').get()?.version!==2)throw error('Ismeretlen helyszín-adatbázisverzió.');return null;
  }
  const before=db.prepare('SELECT * FROM locations ORDER BY id').all(),profiles=db.prepare('SELECT * FROM location_profiles ORDER BY location_id').all();
  const file=backupRequired?await verifiedBackup(db,dataDir,'before-location-hierarchy'):null;
  rebuild(db,'022-location-hierarchy.up.sql',()=>{
    validateLocationHierarchy(db);
    const after=db.prepare('SELECT id,name,name_key,tag_id,folder,created_at FROM locations ORDER BY id').all();
    if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(profiles)!==JSON.stringify(db.prepare('SELECT * FROM location_profiles ORDER BY location_id').all()))throw error('A migráció megváltoztatná a meglévő helyszínadatokat.');
  });return file;
}
export async function rollbackLocationHierarchy(db,dataDir){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='location_schema'").get())return null;
  if(db.prepare('SELECT 1 FROM locations GROUP BY name_key HAVING COUNT(*)>1 LIMIT 1').get())throw error('A régi séma nem támogatja az azonos nevű helyeket. A visszalépés adatvesztés nélkül nem végezhető el.');
  if(db.prepare('SELECT 1 FROM location_changes LIMIT 1').get())throw error('Megőrzendő helyszín-előzmények vannak. Exportálj, és használj sémakompatibilis kódot; az előzményeket nem töröljük.');
  const file=await verifiedBackup(db,dataDir,'before-location-hierarchy-rollback');
  rebuild(db,'022-location-hierarchy.down.sql',()=>{});return file;
}
