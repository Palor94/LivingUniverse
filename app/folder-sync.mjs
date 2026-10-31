import {promises as fs,constants,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const key=s=>s.normalize('NFC').toLocaleLowerCase('hu');
export function installFolderSync({db,root,dataDir,all,one,run,transaction,fail,fingerprint,moving,isScanning}){
  db.exec(readFileSync(new URL('./migrations/008-folder-name-sync.up.sql',import.meta.url),'utf8'));
  let busy=false;const previews=new Map();
  const signature=r=>createHash('sha256').update(JSON.stringify(r.plans.map(p=>[p.source,p.destination,p.character_id,p.blocked,p.files,p.dirs]))).digest('hex');
  const now=()=>new Date().toISOString();
  const characters=()=>all('SELECT c.* FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL');
  function validFolder(name){if(typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>200||name.startsWith('.')||/[\\/:*?"<>|\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)||['app','tests','docs','backups','node_modules'].includes(name.toLowerCase()))throw fail('The character name must also be a valid Windows folder name (no /, :, trailing dots, or reserved names).');return name;}
  async function checked(relative,exists=true){const full=path.resolve(root,relative),rel=path.relative(root,full);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw fail('Folder must stay inside the resource directory.',403);let probe=full;while(probe!==root){try{const stat=await fs.lstat(probe);if(stat.isSymbolicLink())throw fail('Linked folders or files cannot be renamed.',403);const real=await fs.realpath(probe),realRoot=await fs.realpath(root),r=path.relative(realRoot,real);if(r.startsWith('..')||path.isAbsolute(r))throw fail('Folder points outside the resource directory.',403);return full;}catch(e){if(e.code!=='ENOENT'||(exists&&probe===full))throw e;probe=path.dirname(probe);}}return full;}
  async function inventory(folder){const files=[],dirs=[];async function walk(relative){const full=await checked(relative);for(const e of await fs.readdir(full,{withFileTypes:true})){const rel=path.join(relative,e.name);if(e.isSymbolicLink())throw fail('A folder contains a symbolic link. Review it before synchronizing.',409);if(e.isDirectory()){dirs.push(rel);await walk(rel);}else if(e.isFile()){const s=await fs.stat(await checked(rel));files.push({from:rel,size:s.size,mtime:s.mtimeMs});}else throw fail('A folder contains an unsupported filesystem entry.',409);}}await walk(folder);return {files,dirs};}
  function candidates(c,folder){const k=key(folder),aliases=[c.aliases,...String(c.aliases||'').split(/[,\n]/)].filter(Boolean);return key(c.name)===k||aliases.some(a=>key(a.trim())===k)||key(c.name).endsWith(' - '+k);}
  function ownership(){const chars=characters(),owners=new Map(all('SELECT * FROM sorted_folders').filter(o=>chars.some(c=>c.id===o.character_id)).map(o=>[o.folder,o.character_id]));
    for(const {folder} of all("SELECT DISTINCT folder FROM media WHERE folder<>''")){if(owners.has(folder))continue;const matches=chars.filter(c=>candidates(c,folder)&&one('SELECT 1 FROM depictions d JOIN media m ON m.id=d.media_id WHERE d.character_id=? AND m.folder=? LIMIT 1',c.id,folder));if(matches.length===1)owners.set(folder,matches[0].id);}
    return {chars,owners};
  }
  async function plansFor(cid=null,newName=null){const {chars,owners}=ownership(),plans=[],unmapped=[];const allFolders=all("SELECT folder,COUNT(*) count FROM media WHERE folder<>'' GROUP BY folder");
    for(const {folder,count} of allFolders){const owner=owners.get(folder);if(!owner){if(!cid)unmapped.push({folder,count,reason:'No unique established character ownership'});continue;}if(cid&&owner!==cid)continue;const c=chars.find(c=>c.id===owner),destination=cid&&newName!==null?newName:c.name;if(folder===destination)continue;const p={source:folder,destination,character_id:owner,character_name:c.name,count,files:[],dirs:[],blocked:null};
      try{validFolder(folder);validFolder(destination);if(chars.some(other=>other.id!==owner&&key(other.name)===key(destination)))throw fail('Another character has this folder name. Rename one character first.',409);if([...owners].some(([f,id])=>id!==owner&&key(f)===key(destination)))throw fail('The receiving folder belongs to another character.',409);
        if(all('SELECT relative_path FROM media WHERE folder=?',folder).some(m=>!m.relative_path.startsWith(folder+path.sep)))throw fail('Catalogue folder metadata needs reconciliation before renaming.',409);
        const entries=await inventory(folder);p.files=entries.files;p.dirs=entries.dirs; // Metadata only; no OneDrive content downloads.
        for(const file of p.files){file.to=path.join(destination,path.relative(folder,file.from));const existing=one('SELECT id FROM media WHERE relative_path=?',file.to);if(existing&&file.to!==file.from&&key(folder)!==key(destination))throw fail('A receiving path already has a catalogue record: '+file.to,409);}
        if(key(folder)!==key(destination)){let destStat;try{destStat=await fs.lstat(await checked(destination,false));}catch(e){if(e.code!=='ENOENT')throw e;}if(destStat&&!destStat.isDirectory())throw fail('The destination is not a folder.',409);p.merge=!!destStat;
          for(const file of p.files){try{await fs.lstat(await checked(file.to,false));throw fail('Filename collision; nothing will be overwritten: '+file.to,409);}catch(e){if(e.code!=='ENOENT')throw e;}}
        }
      }catch(e){p.blocked=e.status?e.message:e.code==='ENOENT'?'Source folder is missing or temporarily unavailable.':e.message;}
      plans.push(p);
    }
    const targets=new Map();for(const p of plans.filter(p=>!p.blocked))for(const f of p.files){const k=key(f.to);if(targets.has(k)){p.blocked='Several source folders contain the same receiving filename: '+f.to;targets.get(k).blocked=p.blocked;}else targets.set(k,p);}
    return {plans,unmapped,owners};
  }
  async function backup(){const snapshot=transaction(()=>Object.fromEntries(all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(t=>[t.name,all('SELECT * FROM '+t.name)])));const file=path.join(dataDir,'before-folder-sync-'+randomUUID()+'.json');await fs.writeFile(file,JSON.stringify({schema_version:1,exported_at:now(),...snapshot}),{flag:'wx'});return file;}
  function updatePaths(p){
    const rows=all('SELECT * FROM media WHERE folder=?',p.source);for(const m of rows){const to=path.join(p.destination,path.relative(p.source,m.relative_path));run('UPDATE media SET relative_path=?,folder=? WHERE id=?',to,p.destination,m.id);run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',randomUUID(),m.id,m.relative_path,to,'folder_renamed',null,now());}
    for(const h of all('SELECT media_id,original_path FROM media_hidden'))if(h.original_path.startsWith(p.source+path.sep))run('UPDATE media_hidden SET original_path=? WHERE media_id=?',path.join(p.destination,path.relative(p.source,h.original_path)),h.media_id);
    for(const l of all('SELECT id,folder FROM locations WHERE folder IS NOT NULL'))if(l.folder===p.source||l.folder.startsWith(p.source+path.sep))run('UPDATE locations SET folder=? WHERE id=?',path.join(p.destination,path.relative(p.source,l.folder)),l.id);
    for(const candidate of all('SELECT relative_path FROM scan_candidates WHERE folder=?',p.source))run('UPDATE scan_candidates SET relative_path=?,folder=? WHERE relative_path=?',path.join(p.destination,path.relative(p.source,candidate.relative_path)),p.destination,candidate.relative_path);
    run('DELETE FROM sorted_folders WHERE folder=?',p.source);run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO UPDATE SET character_id=excluded.character_id',p.destination,p.character_id);
  }
  async function apply(p){const op=randomUUID();let renamed=false,temp=null;const moved=[];const journal=(status,error=null)=>run('UPDATE folder_changes SET status=?,manifest_json=?,error=?,updated_at=? WHERE id=?',status,JSON.stringify({files:p.files,dirs:p.dirs,temp,moved}),error,now(),op);
    run('INSERT INTO folder_changes VALUES(?,?,?,?,?,?,?,?,?)',op,p.character_id,p.source,p.destination,'preparing',JSON.stringify({files:p.files,dirs:p.dirs}),null,now(),now());
    try{const source=await checked(p.source),destination=await checked(p.destination,false);const current=await inventory(p.source);if(JSON.stringify(current.files.map(f=>[f.from,f.size,f.mtime]))!==JSON.stringify(p.files.map(f=>[f.from,f.size,f.mtime])))throw fail('Folder changed during preparation; retry synchronization.',409);
      let targetExists=false;try{await fs.lstat(destination);targetExists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
      if(!targetExists||key(p.source)===key(p.destination)){
        if(key(p.source)===key(p.destination)){temp='.living-universe-folder-'+op;journal('preparing');await fs.rename(source,await checked(temp,false));try{await fs.lstat(destination);throw fail('Destination appeared during rename.',409);}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(await checked(temp),destination);temp=null;}
        else await fs.rename(source,destination);renamed=true;journal('moved');
      }else{
        if(!(await fs.stat(destination)).isDirectory())throw fail('Destination is not a directory.',409);
        for(const file of p.files){const from=await checked(file.from),to=await checked(file.to,false);await fs.mkdir(path.dirname(to),{recursive:true});await checked(path.dirname(file.to));await fs.copyFile(from,to,constants.COPYFILE_EXCL);const entry={from:file.from,to:file.to,hash:null,removed:false};moved.push(entry);journal('copied');const hash=await fingerprint(from);if(hash!==await fingerprint(to))throw fail('Copy verification failed; originals were kept.',409);entry.hash=hash;journal('copy_verified');await fs.unlink(from);entry.removed=true;journal('moving');}
      }
      transaction(()=>{updatePaths(p);journal('complete');});
      if(!renamed)for(const dir of [...p.dirs].reverse().concat(p.source)){try{await fs.rmdir(await checked(dir));}catch(e){if(!['ENOENT','ENOTEMPTY'].includes(e.code))journal('complete_source_directory_retained',e.message);}}
      return {source:p.source,destination:p.destination,files:p.files.length,status:'complete'};
    }catch(e){let rollback=true;
      try{if(renamed){await fs.lstat(await checked(p.source,false)).then(()=>{throw Error('Source reappeared; refusing overwrite');},err=>{if(err.code!=='ENOENT')throw err;});await fs.rename(await checked(p.destination),await checked(p.source,false));}
        else if(temp)await fs.rename(await checked(temp),await checked(p.source,false));
        else for(const entry of moved.reverse()){if(entry.removed){if(await fingerprint(await checked(entry.to))!==entry.hash)throw Error('Moved file changed; manual review needed');await fs.copyFile(await checked(entry.to),await checked(entry.from,false),constants.COPYFILE_EXCL);}await fs.unlink(await checked(entry.to));}
      }catch{rollback=false;}journal(rollback?'failed_rolled_back':'needs_review',e.message);throw fail(e.message+(rollback?' No existing files were overwritten.':' Check the folder-change journal before retrying.'),409);
    }
  }
  async function synchronize({expectedSignature=null}={}){
    if(busy||moving.size||isScanning())throw fail('Wait for the current scan or file operation.',409);busy=true;moving.add('folder-name-sync');
    try{const result=await plansFor();if(expectedSignature&&signature(result)!==expectedSignature)throw fail('Folders or character names changed since preview. Review a fresh preview before synchronizing.',409);const ready=result.plans.filter(p=>!p.blocked),backupPath=ready.length?await backup():null,completed=[],errors=result.plans.filter(p=>p.blocked).map(p=>({source:p.source,error:p.blocked}));
      for(const p of ready){try{completed.push(await apply(p));}catch(e){errors.push({source:p.source,error:e.message});break;}}
      return {completed,errors,unmapped:result.unmapped,backupPath};
    }finally{busy=false;moving.delete('folder-name-sync');}
  }
  async function createCharacterWithFolder(cid,name){
    validFolder(name);
    if(busy||moving.size||isScanning())throw fail('Wait for the current scan or file operation.',409);
    busy=true;let created=false,createdStat=null,folder=name,full=null;
    function validate(){
      const existing=one('SELECT * FROM characters WHERE id=?',cid);
      if(existing&&(existing.name!==name||one('SELECT 1 FROM character_ui WHERE character_id=? AND merged_into IS NOT NULL',cid)))throw fail('This creation request belongs to another character. Reload the character list.',409);
      if(characters().some(c=>c.id!==cid&&key(c.name.trim())===key(name)))throw fail('A character already has this name. Choose the existing character or use a distinct name.',409);
      if(all('SELECT * FROM sorted_folders').some(o=>key(o.folder)===key(folder)&&o.character_id!==cid))throw fail('This folder already belongs to another character. Choose a distinct name.',409);
      if(all('SELECT folder FROM locations WHERE folder IS NOT NULL').some(l=>key(l.folder.split(/[\\/]/)[0])===key(folder)))throw fail('This folder is used for locations. Choose a distinct character name.',409);
      return existing;
    }
    try{
      const entries=(await fs.readdir(root,{withFileTypes:true})).filter(e=>key(e.name)===key(name));
      if(entries.length>1)throw fail('Several folders match this name. Review them on the laptop.',409);
      if(entries.length)folder=entries[0].name;
      validate();full=await checked(folder,false);
      try{await fs.mkdir(full);created=true;}catch(e){if(e.code!=='EEXIST')throw e;}
      await checked(folder);const stat=await fs.lstat(full);if(!stat.isDirectory())throw fail('A file already uses this name. Choose a distinct character name.',409);if(created)createdStat=stat;
      transaction(()=>{const existing=validate();if(!existing)run('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)',cid,name,now());run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO NOTHING',folder,cid);});
      return {folder,folder_created:created};
    }catch(e){
      // Only remove our own still-empty directory after a database failure.
      // Existing folders and any files added concurrently are never removed.
      if(createdStat){try{await checked(folder);const current=await fs.lstat(full);if(current.ino===createdStat.ino&&current.isDirectory()&&!current.isSymbolicLink())await fs.rmdir(full);}catch{}}
      if(e.status)throw e;throw fail('The character folder could not be created. Check OneDrive availability and retry; existing files were not changed.',409);
    }finally{busy=false;}
  }
  async function handle({p,body,req,json}){
    if(p==='/api/folder-names'&&req.method==='GET'){const r=await plansFor(),token=randomUUID();for(const [k,v] of previews)if(v.expires<Date.now())previews.delete(k);previews.set(token,{signature:signature(r),expires:Date.now()+900000});json({token,plans:r.plans.map(({files,dirs,...p})=>({...p,file_count:files.length})),unmapped:r.unmapped,history:all('SELECT id,source,destination,status,error,created_at FROM folder_changes ORDER BY rowid DESC LIMIT 50')});return true;}
    if(p==='/api/folder-names/sync'&&req.method==='POST'){const preview=previews.get(body.token);if(!preview||preview.expires<Date.now())throw fail('Open a fresh folder-name preview before synchronizing.',409);const result=await synchronize({expectedSignature:preview.signature});previews.delete(body.token);json(result);return true;}
    const match=p.match(/^\/api\/characters\/([^/]+)\/profile-field$/);if(match&&req.method==='POST'&&body.field==='name'){const name=String(body.value??'').trim();if(!name||name.length>200||/[\\/:*?"<>|]/.test(name))throw fail('Enter a valid character name of 1–200 characters.');throw fail('A név módosításához nyisd meg az Átnevezés előnézettel oldalt.',409);}
    return false;
  }
  return {handle,synchronize,createCharacterWithFolder,isBusy:()=>busy};
}
