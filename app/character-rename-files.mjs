import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {characterFolder,storageEntries} from './storage-layout.mjs';
import {digest} from './character-edit.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,status:409});};

// Directory moves are compensated if the single catalogue transaction fails.
// Persist the exact filesystem phase before each rename so interruption is visible.
export function createRenameFiles({root,db,all,one,run,transaction}){
  const inside=relative=>{if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).some(v=>!v||v==='.'||v==='..'))fail('UNSAFE_PATH','Érvénytelen karaktermappa.');const absolute=path.resolve(root,relative),r=path.relative(root,absolute);if(!r||r.startsWith('..')||path.isAbsolute(r))fail('UNSAFE_PATH','A mappa kívül esik a gyűjteményen.');return absolute;};
  async function checked(relative,missing=false){const absolute=inside(relative),parts=path.relative(root,absolute).split(path.sep);let probe=root;for(const part of parts){probe=path.join(probe,part);try{const stat=await fs.lstat(probe);if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_PATH','Csak valódi karaktermappa nevezhető át.');const real=await fs.realpath(probe),base=await fs.realpath(root),rel=path.relative(base,real);if(rel.startsWith('..')||path.isAbsolute(rel))fail('UNSAFE_PATH','A mappa kívülre mutat.');}catch(e){if(e.code==='ENOENT'&&missing)return absolute;throw e;}}return absolute;}
  async function exists(relative){try{await fs.lstat(inside(relative));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  async function inventory(relative){const items=[];async function walk(folder){for(const entry of await storageEntries(await checked(folder))){const file=path.join(folder,entry.name);if(entry.isSymbolicLink())fail('UNSAFE_PATH','A mappa szimbolikus linket tartalmaz.');const s=await fs.lstat(inside(file));items.push([path.relative(relative,file),s.isDirectory()?'directory':'file',s.size,s.mtimeMs,s.ino]);if(s.isDirectory())await walk(file);}}await walk(relative);return items.sort((a,b)=>a[0].localeCompare(b[0]));}
  function nameValid(name){if(!name||name.trim()!==name||name.length>200||/[\\/:*?"<>|\x00-\x1f]/.test(name)||/[. ]$/.test(name)||name.startsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name))fail('INVALID_FOLDER_NAME','Az új név nem használható Windows-mappanévként.');}
  async function prepare(cid,oldName,newName){
    nameValid(newName);const destination=characterFolder(root,newName),expected=characterFolder(root,oldName),owned=all('SELECT folder FROM sorted_folders WHERE character_id=?',cid).map(r=>r.folder);
    if(!owned.length&&await exists(expected)){if(!one('SELECT 1 FROM media m JOIN depictions d ON d.media_id=m.id WHERE m.folder=? AND d.character_id=? LIMIT 1',expected,cid))fail('FOLDER_OWNER_AMBIGUOUS','A régi mappa tulajdonosa nincs karakter-ID-val igazolva.');if(one('SELECT 1 FROM sorted_folders WHERE folder=? AND character_id<>?',expected,cid))fail('FOLDER_OWNER_CONFLICT','A régi mappa más karakterhez tartozik.');owned.push(expected);}
    if(owned.length>1)fail('MULTIPLE_FOLDERS','Több külön karaktermappa kapcsolódik az ID-hoz; összevonást nem végzünk névváltoztatásként.');
    if(all('SELECT folder,character_id FROM sorted_folders WHERE character_id<>?',cid).some(r=>r.folder.normalize('NFC').toLocaleLowerCase('hu')===destination.normalize('NFC').toLocaleLowerCase('hu')))fail('FOLDER_OWNER_CONFLICT','Az új mappanév más karakterhez tartozik.');
    await checked(destination,true);
    if(!owned.length){if(await exists(destination))fail('FOLDER_COLLISION','Az új mappa már létezik és nincs ehhez az ID-hoz kapcsolva.');return {character_id:cid,mode:'create',source:null,destination,inventory:[]};}
    const source=owned[0];nameValid(path.basename(source));if(path.dirname(source)!==path.dirname(destination))fail('UNSAFE_PATH','A régi karaktermappa nem a karakterek mappájában van.');
    await checked(source);const caseOnly=source.toLocaleLowerCase('hu')===destination.toLocaleLowerCase('hu');
    if(source!==destination&&await exists(destination)&&!caseOnly)fail('FOLDER_COLLISION','Az új mappa már létezik; felülírás vagy rejtett összevonás nem történik.');
    return {character_id:cid,mode:source===destination?'keep':'rename',source,destination,inventory:await inventory(source)};
  }
  async function reverse(plan,newName){if(plan.mode==='create')return prepare(plan.character_id,path.basename(plan.destination),newName);return prepare(plan.character_id,path.basename(plan.destination),path.basename(plan.source));}
  async function validate(plan){if(plan.mode==='create'){if(await exists(plan.destination))fail('STALE_FOLDER','Az új mappa időközben megjelent.');await checked(plan.destination,true);}else{if(digest(await inventory(plan.source))!==digest(plan.inventory))fail('STALE_FOLDER','A karaktermappa az előnézet óta megváltozott.');if(plan.mode==='rename'&&plan.source.toLocaleLowerCase('hu')!==plan.destination.toLocaleLowerCase('hu')&&await exists(plan.destination))fail('FOLDER_COLLISION','Az új mappanév időközben foglalttá vált.');}}
  function updatePaths(plan){
    const {source,destination,character_id}=plan;
    if(source&&source!==destination){
      const replace=v=>v===source||v.startsWith(source+path.sep)?destination+v.slice(source.length):v;
      for(const m of all('SELECT * FROM media')){const next=replace(m.relative_path);if(next!==m.relative_path){run('UPDATE media SET relative_path=?,folder=? WHERE id=?',next,replace(m.folder),m.id);run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',randomUUID(),m.id,m.relative_path,next,'folder_renamed',null,new Date().toISOString());}}
      for(const [table,id,column] of [['media_hidden','media_id','original_path'],['locations','id','folder'],['scan_candidates','relative_path','relative_path']])for(const row of all('SELECT * FROM '+table)){if(typeof row[column]!=='string')continue;const next=replace(row[column]);if(next!==row[column]){if(table==='scan_candidates')run('UPDATE scan_candidates SET relative_path=?,folder=? WHERE relative_path=?',next,replace(row.folder),row.relative_path);else run('UPDATE '+table+' SET '+column+'=? WHERE '+id+'=?',next,row[id]);}}
      run('DELETE FROM sorted_folders WHERE folder=? AND character_id=?',source,character_id);
    }
    run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO UPDATE SET character_id=excluded.character_id',destination,character_id);
  }
  async function execute(plan,planId,commit){
    await validate(plan);const operation=randomUUID(),at=new Date().toISOString(),manifest={character_rename:true,plan_id:planId,plan};
    run('INSERT INTO folder_changes VALUES(?,?,?,?,?,?,?,?,?)',operation,plan.character_id,plan.source||'',plan.destination,'rename_prepared',JSON.stringify(manifest),null,at,at);
    let moved=false,created=false,stage=null;
    const journal=(status,error=null)=>run('UPDATE folder_changes SET status=?,manifest_json=?,error=?,updated_at=? WHERE id=?',status,JSON.stringify({...manifest,stage}),error,new Date().toISOString(),operation);
    try{
      if(plan.mode==='create'){await fs.mkdir(path.dirname(inside(plan.destination)),{recursive:true});await checked(plan.destination,true);await fs.mkdir(inside(plan.destination));created=true;journal('rename_created');}
      else if(plan.mode==='rename'){
        if(plan.source.toLocaleLowerCase('hu')===plan.destination.toLocaleLowerCase('hu')){stage=path.join(path.dirname(plan.source),'.rename-'+operation);journal('rename_staging');await fs.rename(await checked(plan.source),inside(stage));await fs.rename(await checked(stage),inside(plan.destination));stage=null;}
        else {await checked(plan.destination,true);if(await exists(plan.destination))fail('FOLDER_COLLISION','Az új mappa már létezik.');await fs.rename(await checked(plan.source),inside(plan.destination));}
        moved=true;journal('rename_moved');
      }
      const result=transaction(()=>{const saved=commit();updatePaths(plan);journal('complete');return saved;});return {...result,folder:{status:'complete',operation_id:operation,mode:plan.mode,source:plan.source,destination:plan.destination}};
    }catch(error){
      try{if(stage){if(await exists(plan.source))fail('ROLLBACK_CONFLICT','A forrás újra megjelent.');await fs.rename(await checked(stage),inside(plan.source));}
        else if(moved){if(await exists(plan.source)||digest(await inventory(plan.destination))!==digest(plan.inventory))fail('ROLLBACK_CONFLICT','A mappa közben változott; kézi helyreállítás szükséges.');await fs.rename(await checked(plan.destination),inside(plan.source));}
        else if(created)await fs.rmdir(await checked(plan.destination));
        journal('failed_rolled_back',error.code||'RENAME_FAILED');
      }catch{journal('needs_review',error.code||'RENAME_FAILED');fail('FILESYSTEM_RECOVERY_REQUIRED','A mappaművelet megszakadt. A napló alapján helyreállítás szükséges; teljes sikert nem jelentünk.');}
      throw error;
    }
  }
  async function recover(plan,planId){
    const operations=all("SELECT * FROM folder_changes WHERE json_extract(manifest_json,'$.character_rename')=1 AND json_extract(manifest_json,'$.plan_id')=? AND status NOT IN ('complete','failed_rolled_back') ORDER BY rowid",planId);
    for(const op of operations){
      const record=JSON.parse(op.manifest_json),stage=record.stage;
      if(plan.mode==='create'){
        if(await exists(plan.destination)){if((await inventory(plan.destination)).length)fail('FILESYSTEM_RECOVERY_REQUIRED','A megszakadt művelet mappájában új adatok vannak; nem töröljük.');await fs.rmdir(await checked(plan.destination));}
      }else if(plan.mode==='rename'){
        if(stage&&await exists(stage)){if(await exists(plan.source))fail('FILESYSTEM_RECOVERY_REQUIRED','A régi mappa újra megjelent; nem írjuk felül.');await fs.rename(await checked(stage),inside(plan.source));}
        else if(!await exists(plan.source)&&await exists(plan.destination)){
          if(digest(await inventory(plan.destination))!==digest(plan.inventory))fail('FILESYSTEM_RECOVERY_REQUIRED','A megszakadt művelet célmappája megváltozott.');await fs.rename(await checked(plan.destination),inside(plan.source));
        }else if(!await exists(plan.source)||await exists(plan.destination)&&plan.source!==plan.destination)fail('FILESYSTEM_RECOVERY_REQUIRED','A megszakadt mappaművelet nem állítható helyre egyértelműen.');
      }
      run('UPDATE folder_changes SET status=?,updated_at=? WHERE id=?','failed_rolled_back',new Date().toISOString(),op.id);
    }
  }
  return {prepare,reverse,validate,execute,recover};
}
