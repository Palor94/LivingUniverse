import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {planPathMigration,applyPathMigration} from '../../app/path-migration.mjs';
import {absoluteSetting} from '../../app/runtime-config.mjs';

// Explicit offline-copy tool. It never finds an existing installation by default.
const [mode,...args]=process.argv.slice(2),values={};
for(let i=0;i<args.length;i+=2){if(!['--database','--plan','--backup','--preserve-uncertain'].includes(args[i])||!args[i+1]||values[args[i]])throw Error('Explicit database/plan/backup options required.');values[args[i]]=args[i+1];}
if(!['preview','apply'].includes(mode)||!values['--database']||!values['--plan'])throw Error('Use preview --database ABSOLUTE_COPY --plan NEW_FILE, or apply with --backup NEW_FILE. All writers of this copy must be stopped.');
if(values['--preserve-uncertain']&&!['yes','no'].includes(values['--preserve-uncertain']))throw Error('--preserve-uncertain requires yes or no.');
if(mode==='apply'&&values['--preserve-uncertain'])throw Error('Apply uses only the preservation choice bound into the reviewed preview.');
const database=absoluteSetting(values['--database'],'database'),file=absoluteSetting(values['--plan'],'plan');
if(!(await fs.lstat(database)).isFile()||(await fs.lstat(database)).isSymbolicLink())throw Error('Existing ordinary database copy required.');
const db=new DatabaseSync(database,{readOnly:mode==='preview',allowExtension:false,timeout:1000});
try{
  if(mode==='preview'){
    const plan=planPathMigration(db,{preserveUncertain:values['--preserve-uncertain']==='yes'});await fs.writeFile(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({preview:true,changes:plan.changes.length,blockers:plan.blockers,preserved_uncertain_outcomes:plan.preserved_uncertain_outcomes,plan_hash:plan.plan_hash}));
  }else{
    if(!values['--backup'])throw Error('A new explicit backup path is required.');
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    if(saved.platform!==process.platform||planPathMigration(db,{preserveUncertain:saved.preserve_terminal_uncertain===true}).plan_hash!==saved.plan_hash||saved.blockers.length)throw Error('Stale, blocked, or different-platform plan.');
    const target=absoluteSetting(values['--backup'],'backup');
    // Reserve the destination before backup; never replace even an existing empty file.
    const reserve=await fs.open(target,'wx',0o600);await reserve.close();
    const temporary=target+'.'+randomUUID()+'.tmp';
    try{await backup(db,temporary);const check=new DatabaseSync(temporary,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup verification failed.');}finally{check.close();}await fs.copyFile(temporary,target);await fs.unlink(temporary);}
    catch(error){throw Error('Backup failed; no path conversion applied. '+error.message);}
    console.log(JSON.stringify({...applyPathMigration(db,saved),backup:target,original_media_modified:false}));
  }
}finally{db.close();}
