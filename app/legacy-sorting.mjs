import {DatabaseSync} from 'node:sqlite';

// Only IDs captured from the pre-upgrade catalogue qualify. New assignments never
// establish completion automatically, and an explicit Needs review choice wins.
export function preserveRecoveredSorting(database,mediaIds){
  if(!Array.isArray(mediaIds)||mediaIds.length>50000||mediaIds.some(id=>typeof id!=='string'))throw Error('Invalid legacy sorting manifest.');
  const db=new DatabaseSync(database);const key='preserved_legacy_sorting_20261025';
  try{db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    if(db.prepare('SELECT 1 FROM application_settings WHERE key=?').get(key)){db.exec('COMMIT');return 0;}
    const insert=db.prepare(`INSERT OR IGNORE INTO media_categorization(media_id,complete,updated_at)
      SELECT m.id,1,? FROM media m WHERE m.id=?
      AND NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id)
      AND EXISTS(SELECT 1 FROM depictions d LEFT JOIN character_ui u ON u.character_id=d.character_id WHERE d.media_id=m.id AND u.merged_into IS NULL)`);
    let restored=0;for(const mid of new Set(mediaIds))restored+=Number(insert.run(new Date().toISOString(),mid).changes);
    db.prepare('INSERT INTO application_settings VALUES(?,?)').run(key,JSON.stringify({restored,at:new Date().toISOString()}));db.exec('COMMIT');return restored;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
