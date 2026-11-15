// Where a picture belongs (owner rule 2026-11-11, docs/STORAGE_LAYOUT.md), so new pictures
// do not scatter the collection again:
//   one character in it (Palor not counted)  → 10_CHARACTERS/<his folder>/
//   two or more characters                   → 20_SHARED_MEDIA/Scenes/<A + B>/
// Files already inside the right folder (any subfolder), game assets, generation plans,
// place-only pictures and pictures with nobody recognised stay where they are.
// Moving is the owner's click on the home task; each file is copied exclusively, verified by
// sha256, re-linked in the catalogue and only then removed, with a file_moves journal row.
// IDs, depictions, canon and history never change. Nothing is overwritten.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {promises as fs,constants} from 'node:fs';
import {organized,catalogueFolder,mediaDestinationAllowed} from './storage-layout.mjs';
import {planningFolder} from './media-purpose.mjs';

const BAD_NAME=/[\\/:*?"<>|\u0000-\u001f]|^[. ]|[. ]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const SHARED_KINDS=['Scenes','Locations','Unassigned'];
export const MAX_PER_RUN=300;

// Pure rule, kept separate so it can be tested without files.
// people: [{id,name}] depicted; palorId; ownFolder(characterId) → '10_CHARACTERS\\X' or null.
export function placementOf({relative,people,palorId,isAsset,ownFolder}){
  const parts=relative.split(/[\\/]/),file=parts.at(-1),norm=s=>s.replace(/\//g,'\\').toLowerCase();
  if(parts[0]==='20_SHARED_MEDIA'&&!SHARED_KINDS.includes(parts[1]))return null;      // game folders
  if(isAsset)return null;
  if(norm(relative).startsWith(norm(planningFolder)+'\\'))return null;
  const folder=folderFor({people,palorId,ownFolder});if(!folder)return null;
  if(norm(relative).startsWith(norm(folder)+'\\'))return null;                        // already there
  return {folder,to:folder+'\\'+file};
}
// The folder alone (also used by the "Új képek" intake): null when nobody or an unsafe name.
export function folderFor({people,palorId,ownFolder}){
  const others=people.filter(p=>p.id!==palorId);
  if(others.length===1||(!others.length&&people.length===1)){const c=others[0]||people[0];if(BAD_NAME.test(c.name))return null;return ownFolder(c.id)||'10_CHARACTERS\\'+c.name;}
  if(others.length>1){const names=others.map(o=>o.name).sort((a,b)=>a.localeCompare(b,'hu'));const name=names.join(' + ');if(names.some(n=>BAD_NAME.test(n))||name.length>120)return null;return '20_SHARED_MEDIA\\Scenes\\'+name;}
  return null;
}


// Journaled single-file move inside the resource folder (shared by placement and the Ötletláda):
// exclusive copy → sha256 check → catalogue update (+ owner row for a character folder) → source
// removed. Returns 'moved' or why not ('changed','not allowed','name taken','busy','not verified','failed').
export function createMediaMover({root,one,run,transaction,fingerprint,moving,now=()=>new Date().toISOString()}){
  const inside=full=>{const rel=path.relative(root,full);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
  async function moveOne(item){
    const m=one('SELECT id,relative_path FROM active_media WHERE id=?',item.media_id);
    if(!m||m.relative_path!==item.from)return 'changed';
    const to=item.to.split('\\').join(path.sep),src=path.join(root,m.relative_path),dst=path.join(root,to);
    if(!inside(src)||!inside(dst)||!mediaDestinationAllowed(root,to))return 'not allowed';
    if(one('SELECT 1 FROM media WHERE relative_path=? COLLATE NOCASE',to))return 'name taken';
    try{await fs.lstat(dst);return 'name taken';}catch(e){if(e.code!=='ENOENT')throw e;}
    // The destination folder must resolve inside the resource folder (no links out).
    await fs.mkdir(path.dirname(dst),{recursive:true});
    const realDir=await fs.realpath(path.dirname(dst)),realRoot=await fs.realpath(root);
    if(!realDir.startsWith(realRoot+path.sep))return 'not allowed';
    if(moving.has(m.id))return 'busy';
    moving.add(m.id);const moveId=randomUUID();
    run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',moveId,m.id,m.relative_path,to,'preparing',null,now());
    try{
      await fs.copyFile(src,dst,constants.COPYFILE_EXCL);
      const a=await fingerprint(src),b=await fingerprint(dst);
      if(a!==b){run("UPDATE file_moves SET status='needs_review' WHERE id=?",moveId);return 'not verified';}
      run('UPDATE file_moves SET status=?,sha256=? WHERE id=?','verified',a,moveId);
      transaction(()=>{run('UPDATE media SET relative_path=?,folder=? WHERE id=?',to,catalogueFolder(root,to),m.id);run("UPDATE file_moves SET status='catalogued' WHERE id=?",moveId);
        // A character folder that had no owner row gets one, so the folder sync knows it.
        const parts=to.split(path.sep);if(parts[0]==='10_CHARACTERS'){const c=one('SELECT id FROM characters WHERE name=?',parts[1]);if(c)run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO NOTHING',path.join(parts[0],parts[1]),c.id);}});
      try{await fs.unlink(src);run("UPDATE file_moves SET status='complete' WHERE id=?",moveId);}catch{run("UPDATE file_moves SET status='source_retained' WHERE id=?",moveId);}
      return 'moved';
    }catch(e){run("UPDATE file_moves SET status='needs_review' WHERE id=? AND status IN ('preparing','verified')",moveId);return 'failed';}
    finally{moving.delete(m.id);}
  }
  // Emptied old folders go away (only inside the shared kinds, never the base folders).
  async function pruneEmpty(dirs){
    for(const d of [...dirs].sort((a,b)=>b.length-a.length)){let dir=d;
      for(;;){const rel=path.relative(root,dir).split(path.sep);if(!(rel[0]==='20_SHARED_MEDIA'&&SHARED_KINDS.includes(rel[1])&&rel.length>2))break;
        try{const left=(await fs.readdir(dir)).filter(n=>n.toLowerCase()!=='desktop.ini');if(left.length)break;for(const n of await fs.readdir(dir))await fs.unlink(path.join(dir,n));await fs.rmdir(dir);}catch{break;}
        dir=path.dirname(dir);}}
  }
  return {moveOne,pruneEmpty};
}

export function installMediaPlacement({root,one,all,run,transaction,fail,fingerprint,moving,isBusy=()=>false,now=()=>new Date().toISOString()}){
  function plan(){
    if(!organized(root))return [];
    const hasAssets=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_asset_sources'");
    const palorId=one("SELECT id FROM characters WHERE lower(trim(name))='palor' LIMIT 1")?.id||null;
    const owned=new Map();for(const s of all("SELECT folder,character_id FROM sorted_folders WHERE folder LIKE '10\\_CHARACTERS%' ESCAPE '\\'"))if(!owned.has(s.character_id))owned.set(s.character_id,s.folder.replace(/\//g,'\\'));
    const rows=all(`SELECT m.id,m.relative_path,(SELECT group_concat(c.id||char(31)||c.name,char(30)) FROM depictions d JOIN characters c ON c.id=d.character_id WHERE d.media_id=m.id) who,
      ${hasAssets?'EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id)':'0'} asset FROM active_media m ORDER BY m.relative_path`);
    const out=[];
    for(const r of rows){
      const people=(r.who||'').split('\u001e').filter(Boolean).map(x=>{const [id,name]=x.split('\u001f');return {id,name};});
      const p=placementOf({relative:r.relative_path,people,palorId,isAsset:!!r.asset,ownFolder:id=>owned.get(id)||null});
      if(p)out.push({media_id:r.id,from:r.relative_path,to:p.to,folder:p.folder});
    }
    return out;
  }
  const {moveOne,pruneEmpty}=createMediaMover({root,one,run,transaction,fingerprint,moving,now});
  async function apply(){
    if(isBusy())throw fail('A move or scan is running. Please retry when it finishes.',409);
    const items=plan(),batch=items.slice(0,MAX_PER_RUN),result={moved:0,skipped:[],remaining:0},dirs=new Set();
    for(const item of batch){const r=await moveOne(item);if(r==='moved'){result.moved++;dirs.add(path.dirname(path.join(root,item.from)));}else result.skipped.push({from:item.from,reason:r});}
    await pruneEmpty(dirs);
    result.remaining=Math.max(0,items.length-batch.length);
    return result;
  }
  async function handle({p,req,json}){
    if(p==='/api/media/placement'&&req.method==='GET'){const items=plan();return json({count:items.length,items:items.slice(0,50)}),true;}
    if(p==='/api/media/placement/apply'&&req.method==='POST')return json(await apply()),true;
    return false;
  }
  return {plan,apply,handle};
}
