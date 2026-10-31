// Local maintenance only; no public endpoint and no implicit startup migration.
import {DatabaseSync,backup} from 'node:sqlite';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cleanExistingReferenceHistory} from './reference-retention.mjs';

const args=process.argv.slice(2);
if(args.length!==6||args[0]!=='--database'||args[2]!=='--backup'||args[4]!=='--report')throw Error('Use --database ABSOLUTE --backup ABSOLUTE --report ABSOLUTE.');
const [database,backupFile,reportFile]=[args[1],args[3],args[5]].map(p=>{if(!path.isAbsolute(p))throw Error('Absolute paths required.');return path.resolve(p);});
if(database===backupFile||database===reportFile||backupFile===reportFile)throw Error('Distinct database, backup and report paths required.');
if(!(await fs.stat(database)).isFile())throw Error('Existing database required.');
for(const p of [backupFile,reportFile]){try{await fs.access(p);throw Error('Refusing to overwrite existing output.');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.mkdir(path.dirname(p),{recursive:true});}
const db=new DatabaseSync(database);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
const all=(q,...args)=>db.prepare(q).all(...args),run=(q,...args)=>db.prepare(q).run(...args);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try{
  await backup(db,backupFile);const verified=new DatabaseSync(backupFile,{readOnly:true});
  try{if(verified.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity failed.');}finally{verified.close();}
  db.exec('BEGIN IMMEDIATE');let report;
  try{
    const protectedTables=['characters','media','depictions','media_notes','reviews','relationships','image_generation_runs','image_generation_outputs','image_generation_events'];
    const protectedHashes=Object.fromEntries(protectedTables.map(t=>[t,hash(all('SELECT * FROM '+t+' ORDER BY rowid'))]));
    const appearances=hash(all('SELECT id,character_id,parent_id,appearance,created_at FROM canon ORDER BY rowid'));
    const current=()=>all('SELECT c.* FROM canon c WHERE c.rowid=(SELECT MAX(p.rowid) FROM canon p WHERE p.character_id=c.character_id) ORDER BY c.character_id');
    const currentHash=hash(current());
    const result=cleanExistingReferenceHistory({all,run});
    if(hash(current())!==currentHash||hash(all('SELECT id,character_id,parent_id,appearance,created_at FROM canon ORDER BY rowid'))!==appearances)throw Error('Protected identity data changed; rolled back.');
    for(const [table,before] of Object.entries(protectedHashes))if(hash(all('SELECT * FROM '+table+' ORDER BY rowid'))!==before)throw Error('Protected records changed; rolled back: '+table);
    if(all('PRAGMA foreign_key_check').length||all('PRAGMA integrity_check')[0].integrity_check!=='ok')throw Error('Database integrity failed; rolled back.');
    report={completed_at:new Date().toISOString(),...result,protected_data_unchanged:true,backup:backupFile};
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  await fs.writeFile(reportFile,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}finally{db.close();}
