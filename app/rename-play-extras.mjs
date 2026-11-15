// Character rename, game side (owner request 2026-11-10): besides the character's own folder
// (character-rename-files.mjs) the game keeps folders and file names keyed by name:
//   Szereplő-alakok/<name>, Közös jelenetek/<name>      – figures and shared scenes
//   Helyszín hátterek/<place>                            – places whose name changed with him
//   file names inside them ("Sanyi háza - 1.png")
//   the location tree (location-canvas.json node names)
// They follow the rename, with catalogue paths, figure records and the move journal updated.
// Never overwrites: a destination that already holds files is skipped and reported. The undo
// of a rename runs the same steps with the names swapped.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {organized} from './storage-layout.mjs';
import {findNameMentions} from './hungarian-names.mjs';
import {SPRITE_FOLDER} from './character-sprites.mjs';
import {SCENE_FOLDER} from './scene-images.mjs';

const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80);
const exists=p=>fs.lstat(p).then(()=>true,()=>false);
// When the new name contains the old one ("Péter" → "Pákozdi Péter"), text that already has
// the new name is protected first, so it never becomes "Pákozdi Pákozdi Péter".
// `others`: other characters' names/aliases that contain the old name ("Kis Ádám" when renaming
// "Ádám"); they stay untouched, so only unambiguous mentions change (owner decision 2026-11-11).
export function renameText(text,oldName,newName,others=[]){
  let value=String(text);const guard='\u0000LU\u0000',held=[];
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Inflected forms lengthen a final vowel ("Kis Bencének"), so the stem is matched both ways.
  const stems=name=>[...new Set([name,name.replace(/a$/u,'á').replace(/e$/u,'é')])].map(escape).join('|');
  for(const name of [...others].sort((a,b)=>b.length-a.length))value=value.replace(new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])(?:'+stems(name)+')[\\p{L}\\p{M}]*','giu'),m=>{held.push(m);return '\u0000P'+(held.length-1)+'\u0000';});
  const protect=newName.toLocaleLowerCase('hu').includes(oldName.toLocaleLowerCase('hu'))&&value.includes(newName);
  if(protect)value=value.split(newName).join(guard);
  for(const m of findNameMentions(value,oldName,newName).filter(m=>m.after!==null).sort((a,b)=>b.start-a.start))value=value.slice(0,m.start)+m.after+value.slice(m.end);
  if(protect)value=value.split(guard).join(newName);
  return held.length?value.replace(/\u0000P(\d+)\u0000/g,(_,i)=>held[Number(i)]):value;
}
// Other characters' names/aliases that contain the old name.
export function overlappingNames(all,characterId,oldName){
  const key=oldName.toLocaleLowerCase('hu');
  return [...new Set(all('SELECT name,aliases FROM characters WHERE id<>?',characterId).flatMap(c=>[c.name,...String(c.aliases||'').split(/[,;\n]/u)]).map(n=>n.trim()).filter(n=>n&&n.toLocaleLowerCase('hu')!==key&&n.toLocaleLowerCase('hu').includes(key)))];
}

export function createRenameExtras({root,all,one,run,transaction,canvas=null}){
  const shared=f=>organized(root)?path.join('20_SHARED_MEDIA',f):f;
  async function inside(relative){
    const abs=path.resolve(root,relative),realRoot=await fs.realpath(root);
    if(!abs.startsWith(path.resolve(root)+path.sep))throw Object.assign(new Error('Invalid folder.'),{status:403});
    const parent=await fs.realpath(path.dirname(abs)).catch(()=>null);if(parent&&!(parent+path.sep).startsWith(realRoot+path.sep)&&parent!==realRoot)throw Object.assign(new Error('Folder outside the resource folder.'),{status:403});
    return abs;
  }
  // Catalogue paths, figure records and the move journal follow a moved file or folder.
  function relink(from,to,{folder=false}={}){
    const now=new Date().toISOString(),sep=path.sep;
    const match=p=>folder?p.startsWith(from+sep):p===from,swap=p=>to+p.slice(from.length);
    for(const m of all('SELECT id,relative_path,folder FROM media')){if(!match(m.relative_path))continue;const next=swap(m.relative_path);
      run('UPDATE media SET relative_path=?,folder=? WHERE id=?',next,path.dirname(next),m.id);
      run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',randomUUID(),m.id,m.relative_path,next,'character_renamed',null,now);}
    const has=t=>one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",t);
    if(has('character_sprites'))
      for(const s of all('SELECT id,relative_path FROM character_sprites')){if(match(s.relative_path))run('UPDATE character_sprites SET relative_path=? WHERE id=?',swap(s.relative_path),s.id);}
    // Other stored paths: restore targets, place folders, scan candidates, review sources.
    const follow=p=>typeof p==='string'&&(p===from||p.startsWith(from+sep));
    if(has('media_hidden'))for(const r of all('SELECT media_id,original_path FROM media_hidden'))if(follow(r.original_path))run('UPDATE media_hidden SET original_path=? WHERE media_id=?',swap(r.original_path),r.media_id);
    if(has('locations')&&all("PRAGMA table_info(locations)").some(c=>c.name==='folder'))for(const r of all('SELECT id,folder FROM locations'))if(follow(r.folder))run('UPDATE locations SET folder=? WHERE id=?',swap(r.folder),r.id);
    if(has('scan_candidates'))for(const r of all('SELECT relative_path,folder FROM scan_candidates'))if(follow(r.relative_path))run('UPDATE scan_candidates SET relative_path=?,folder=? WHERE relative_path=?',swap(r.relative_path),follow(r.folder)?swap(r.folder):r.folder,r.relative_path);
  }
  async function moveFolder(from,to,report){
    const a=await inside(from),b=await inside(to);
    if(!await exists(a))return;
    if(await exists(b)){const left=await fs.readdir(b).catch(()=>['?']);if(left.length){report.skipped.push({from,to,reason:'destination already has files'});return;}await fs.rmdir(b);}
    await fs.rename(a,b);
    try{transaction(()=>relink(from,to,{folder:true}));}catch(e){await fs.rename(b,a).catch(()=>{});throw e;}
    report.moved.push({from,to});
  }
  // One file or folder name that carries the name ("Sanyi háza - 1.png"); never overwrites.
  const nextName=(name,oldName,newName,others)=>{const n=renameText(name,oldName,newName,others);if(n===name)return null;const ext=path.extname(name),s=safeName(n);return s&&s!==name&&path.extname(s)===ext?s:null;};
  async function renameEntry(folder,name,isDir,oldName,newName,others,report){
    const next=nextName(name,oldName,newName,others);if(!next)return name;
    const from=path.join(folder,name),to=path.join(folder,next);
    if(isDir){const before=report.moved.length;await moveFolder(from,to,report);return report.moved.length>before?next:name;}
    const a=await inside(from),b=await inside(to);
    if(await exists(b)){report.skipped.push({from,to,reason:'a file with that name exists'});return name;}
    await fs.rename(a,b);
    try{transaction(()=>relink(from,to));}catch(e){await fs.rename(b,a).catch(()=>{});throw e;}
    report.moved.push({from,to});return next;
  }
  // Every file and subfolder name under a folder (his own folder, figures, shared scenes).
  async function renameTree(folder,oldName,newName,others,report,depth=0){
    const dir=await inside(folder);if(depth>12||!await exists(dir))return;
    for(const f of await fs.readdir(dir,{withFileTypes:true})){
      if(f.isSymbolicLink()||f.name.startsWith('.'))continue;
      const name=await renameEntry(folder,f.name,f.isDirectory(),oldName,newName,others,report);
      if(f.isDirectory())await renameTree(path.join(folder,name),oldName,newName,others,report,depth+1);
    }
  }
  // The rest of the library (shared media, removed items): every catalogued file whose path
  // carries the name. Folders first, shallowest first, so their content follows in one move.
  async function renameCatalogue(oldName,newName,others,report){
    const system=p=>/^(00_SYSTEM|90_BACKUPS)([\\/]|$)/.test(p);
    const paths=()=>[...all('SELECT relative_path FROM media').map(r=>r.relative_path),...(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_sprites'")?all('SELECT relative_path FROM character_sprites').map(r=>r.relative_path):[])].filter(p=>p&&!system(p));
    const tried=new Set();
    for(let guard=0;guard<10000;guard++){
      let target=null;
      for(const p of paths()){const parts=p.split(/[\\/]/);for(let i=0;i<parts.length-1;i++){const dir=parts.slice(0,i+1).join(path.sep);if(!tried.has(dir)&&nextName(parts[i],oldName,newName,others)&&(!target||i<target.depth))target={dir,depth:i};}}
      if(!target)break;tried.add(target.dir);
      await renameEntry(path.dirname(target.dir)==='.'?'':path.dirname(target.dir),path.basename(target.dir),true,oldName,newName,others,report);
    }
    for(const p of paths()){const name=path.basename(p);if(!nextName(name,oldName,newName,others))continue;if(!await exists(await inside(p)))continue;await renameEntry(path.dirname(p)==='.'?'':path.dirname(p),name,false,oldName,newName,others,report);}
    // Restore targets of removed items take the new names too, unless that place is taken.
    if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_hidden'"))for(const h of all('SELECT media_id,original_path FROM media_hidden')){
      const next=h.original_path.split(/[\\/]/).map(s=>nextName(s,oldName,newName,others)||s).join(path.sep);
      if(next!==h.original_path&&!await exists(await inside(next))&&!one('SELECT 1 FROM media WHERE relative_path=?',next))run('UPDATE media_hidden SET original_path=? WHERE media_id=?',next,h.media_id);
    }
  }
  // Before the database changes: would anything be blocked?
  async function check(oldName,newName){
    const blocked=[];
    for(const base of [shared(SPRITE_FOLDER),shared(SCENE_FOLDER)]){
      const a=path.join(base,safeName(oldName)),b=path.join(base,safeName(newName));
      if(a!==b&&await exists(await inside(a))&&await exists(await inside(b))&&(await fs.readdir(await inside(b))).length)blocked.push({from:a,to:b});
    }
    return blocked;
  }
  // After the database rename: move folders, rename files, follow renamed places, update the tree.
  // Owner decision 2026-11-11: every file and folder name follows, the shared library included.
  async function apply({oldName,newName,characterId=null,characterFolder:own=null,locationRenames=[],reason}){
    const report={moved:[],skipped:[],tree:null},others=characterId?overlappingNames(all,characterId,oldName):[];
    for(const base of [shared(SPRITE_FOLDER),shared(SCENE_FOLDER)]){
      const from=path.join(base,safeName(oldName)),to=path.join(base,safeName(newName));
      if(from!==to)await moveFolder(from,to,report);
      await renameTree(to,oldName,newName,others,report);
    }
    const bg=shared('Helyszín hátterek');
    for(const l of locationRenames){const from=path.join(bg,safeName(l.before)||'Helyszín'),to=path.join(bg,safeName(l.after)||'Helyszín');if(from!==to)await moveFolder(from,to,report);}
    if(own)await renameTree(own,oldName,newName,others,report);
    await renameCatalogue(oldName,newName,others,report);
    if(canvas)report.tree=await canvas.renameMentions(oldName,newName,reason||`Karakter átnevezése: ${oldName} → ${newName}`,others);
    return report;
  }
  return {check,apply};
}
