// "Új képek" intake (2026-11-12): one drop folder for newly generated pictures and videos.
// The file name (or the sub-folder it sits in) says who is in it, so the owner never has to tag
// by hand:
//   20_SHARED_MEDIA/Új képek/Norbi - Kávézó - hetkoznapi - 1.png
//   20_SHARED_MEDIA/Új képek/Palor + Norbi - Strand - 2.png
//   20_SHARED_MEDIA/Új képek/Norbi + Péter/bármi.png            (folder gives the people)
// Parts are separated by " - ". The people part lists existing character names joined by "+"
// (accents and case do not matter). Optional parts: a place from the location tree and a
// content level (hetkoznapi / meztelen / szex). Everything else is free text.
// One owner click links the people (+ place tag + content level) and moves the file by the
// placement rule (one character → his folder, more → Scenes\A + B; Palor not counted), with
// the journaled mover. Unreadable names stay in the folder and are reported. Nothing creates
// characters, changes canon or overwrites a file.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {organized,catalogueFolder} from './storage-layout.mjs';
import {folderFor,createMediaMover,MAX_PER_RUN} from './media-placement.mjs';

export const INTAKE_FOLDER='Új képek';
const KIND={'.png':'image','.jpg':'image','.jpeg':'image','.webp':'image','.mp4':'video','.mov':'video'};
const CONTENT={hetkoznapi:'non_intimate',meztelen:'nudity',szex:'sexual_activity',szexualis:'sexual_activity'};
export const fold=s=>String(s).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').replace(/\s+/g,' ').trim();

// Pure reading of one file. tokens: sub-folder names then the file name's " - " parts.
// characters: [{id,name}]; places: [{id,names:[…]}]. Returns {people,location_id,content,problem}.
export function readName({folders=[],file,characters,places=[]}){
  const stem=file.replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)$/,'');
  // Full names, plus the short form of names like "Dávid - ikea mellizmos srác" → "Dávid".
  // A key two characters share is null (ambiguous), never a guess.
  const byName=new Map(),add=(k,c)=>{if(!k)return;const had=byName.get(k);byName.set(k,had===undefined||had?.id===c.id?c:null);};
  for(const c of characters)add(fold(c.name),c);
  for(const c of characters){const short=fold(c.name.split(/\s+-\s+/)[0]);if(short!==fold(c.name)&&!characters.some(o=>o.id!==c.id&&fold(o.name)===short))add(short,c);}
  const isPeople=t=>t.split(/\s*[+&]\s*/).filter(Boolean).every(p=>byName.get(fold(p)));
  // " - " separates parts, but may also sit inside a long name: join neighbours greedily.
  const tokens=[];for(const piece of [...folders.map(f=>[f]),stem.split(/\s+-\s+/)]){
    for(let i=0;i<piece.length;){let j=piece.length;while(j>i+1&&!isPeople(piece.slice(i,j).join(' - ')))j--;tokens.push(piece.slice(i,j).join(' - ').trim());i=j;}}
  const people=new Map();let location_id=null,content=null;const unknown=[],ambiguous=[];
  for(const token of tokens.filter(Boolean)){
    const f=fold(token);
    if(!content&&CONTENT[f]){content=CONTENT[f];continue;}
    const parts=token.split(/\s*[+&]\s*/).filter(Boolean),hits=parts.map(p=>byName.get(fold(p)));
    if(hits.every(h=>h)){for(const h of hits)people.set(h.id,h);continue;}
    // "A + B" with a name the program does not know is a typo, not free text.
    if(parts.length>1){parts.forEach((p,i)=>{if(hits[i]===null)ambiguous.push(p);else if(!hits[i])unknown.push(p);});continue;}
    if(hits[0]===null){ambiguous.push(token);continue;}
    if(!location_id){const place=places.find(p=>p.names.some(n=>fold(n)===f));if(place){location_id=place.id;continue;}}
  }
  const problem=ambiguous.length?{code:'ambiguous',names:ambiguous}:unknown.length?{code:'unknown',names:unknown}:!people.size?{code:'no_people',names:[]}:null;
  return {people:[...people.values()],location_id,content,problem};
}

export function installNewImages({root,one,all,run,transaction,fail,fingerprint,moving,locationTree,isBusy=()=>false,now=()=>new Date().toISOString()}){
  run(`CREATE TABLE IF NOT EXISTS new_image_intake(id TEXT PRIMARY KEY,media_id TEXT NOT NULL,file TEXT NOT NULL,people_json TEXT NOT NULL,location_id TEXT,content TEXT,created_at TEXT NOT NULL)`);
  const base=path.join('20_SHARED_MEDIA',INTAKE_FOLDER);
  const {moveOne}=createMediaMover({root,one,run,transaction,fingerprint,moving,now});
  async function files(){
    if(!organized(root))return [];
    const dir=path.join(root,base);await fs.mkdir(dir,{recursive:true});
    const realRoot=await fs.realpath(root);if(!(await fs.realpath(dir)).startsWith(realRoot+path.sep))throw fail('The Új képek folder points outside your resource folder.',403);
    const out=[];
    async function walk(rel,depth){
      for(const e of await fs.readdir(path.join(root,rel),{withFileTypes:true})){
        if(e.name.startsWith('.')||e.isSymbolicLink())continue;const r=path.join(rel,e.name);
        if(e.isDirectory()){if(depth<2)await walk(r,depth+1);continue;}
        const kind=KIND[path.extname(e.name).toLowerCase()];if(!e.isFile()||!kind)continue;
        out.push({relative:r,file:e.name,kind,folders:path.relative(base,rel).split(path.sep).filter(Boolean)});
      }
    }
    await walk(base,0);return out.sort((a,b)=>a.relative.localeCompare(b.relative,'hu'));
  }
  async function context(){
    const characters=all('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL');
    const places=new Map();for(const l of all('SELECT id,name FROM locations'))places.set(l.id,{id:l.id,names:[l.name]});
    try{for(const n of (await locationTree.load()).nodes)if(n.location_id&&places.has(n.location_id))places.get(n.location_id).names.push(...[n.short_name,n.name].filter(Boolean));}catch{}
    const palorId=one("SELECT id FROM characters WHERE lower(trim(name))='palor' LIMIT 1")?.id||null;
    const owned=new Map();for(const s of all("SELECT folder,character_id FROM sorted_folders WHERE folder LIKE '10\\_CHARACTERS%' ESCAPE '\\'"))if(!owned.has(s.character_id))owned.set(s.character_id,s.folder.replace(/\//g,'\\'));
    return {characters,places:[...places.values()],palorId,ownFolder:id=>owned.get(id)||null};
  }
  async function plan(){
    const list=await files();if(!list.length)return {folder:base,items:[]};
    const ctx=await context(),placeName=new Map(ctx.places.map(p=>[p.id,p.names[0]]));
    return {folder:base,items:list.map(f=>{
      const r=readName({folders:f.folders,file:f.file,characters:ctx.characters,places:ctx.places});
      const folder=r.problem?null:folderFor({people:r.people,palorId:ctx.palorId,ownFolder:ctx.ownFolder});
      return {...f,people:r.people.map(p=>p.name),people_ids:r.people.map(p=>p.id),location_id:r.location_id,place:r.location_id?placeName.get(r.location_id):null,content:r.content,
        problem:r.problem||(folder?null:{code:'unsafe',names:[]}),folder};
    })};
  }
  // A free name in the destination: "x.png", then "x (2).png", … (never overwrite).
  async function freeName(folder,file){
    const ext=path.extname(file),stem=file.slice(0,file.length-ext.length);
    for(let n=1;n<1000;n++){const name=n===1?file:`${stem} (${n})${ext}`,rel=folder+'\\'+name;
      if(one('SELECT 1 FROM media WHERE relative_path=? COLLATE NOCASE',rel.split('\\').join(path.sep)))continue;
      try{await fs.lstat(path.join(root,...rel.split('\\')));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
      return rel;}
    return null;
  }
  async function apply(){
    if(isBusy()||moving.size)throw fail('A move or scan is running. Please retry when it finishes.',409);
    const {items}=await plan(),ready=items.filter(i=>!i.problem),batch=ready.slice(0,MAX_PER_RUN);
    const result={moved:0,skipped:items.filter(i=>i.problem).map(i=>({file:i.relative,reason:i.problem.code,names:i.problem.names})),remaining:Math.max(0,ready.length-batch.length)};
    const hasContent=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_content'"),hasInserts=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_inserts'");
    const palorId=one("SELECT id FROM characters WHERE lower(trim(name))='palor' LIMIT 1")?.id||null;
    for(const item of batch){
      try{
        const full=path.join(root,item.relative),stat=await fs.lstat(full);if(!stat.isFile())throw Error('not a file');
        const to=await freeName(item.folder,item.file);if(!to){result.skipped.push({file:item.relative,reason:'name taken',names:[]});continue;}
        const mediaId=transaction(()=>{
          const existing=one('SELECT id FROM media WHERE relative_path=?',item.relative)?.id;
          if(existing&&one('SELECT 1 FROM media_hidden WHERE media_id=?',existing))return null;
          const id=existing||randomUUID();
          if(!existing)run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',id,item.relative,catalogueFolder(root,item.relative),item.kind,stat.size,stat.mtime.toISOString(),now());
          for(const cid of item.people_ids)run('INSERT OR IGNORE INTO depictions VALUES(?,?)',id,cid);
          const tag=item.location_id?one('SELECT tag_id FROM locations WHERE id=?',item.location_id)?.tag_id:null;if(tag)run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,tag);
          if(item.content&&hasContent)run('INSERT INTO play_content VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET level=excluded.level,set_at=excluded.set_at',id,item.content,now());
          run('INSERT INTO new_image_intake VALUES(?,?,?,?,?,?,?)',randomUUID(),id,item.relative,JSON.stringify(item.people_ids),item.location_id,item.content,now());
          // Palor + one character counts as a shared scene for the game's "what is missing" list.
          const others=item.people_ids.filter(c=>c!==palorId);
          if(hasInserts&&palorId&&item.people_ids.includes(palorId)&&others.length===1&&!existing)run('INSERT INTO play_inserts VALUES(?,?,?,?,?,?,?)',randomUUID(),id,'scene','Új képek',others[0],item.location_id,now());
          return id;});
        if(!mediaId){result.skipped.push({file:item.relative,reason:'removed',names:[]});continue;}
        const r=await moveOne({media_id:mediaId,from:item.relative,to});
        if(r==='moved')result.moved++;else result.skipped.push({file:item.relative,reason:r,names:[]});
      }catch(e){result.skipped.push({file:item.relative,reason:'failed',names:[]});}
    }
    // Emptied person sub-folders inside Új képek go away; the drop folder itself stays.
    for(const d of [...new Set(batch.map(i=>path.dirname(path.join(root,i.relative))))].sort((a,b)=>b.length-a.length)){
      let dir=d;while(dir!==path.join(root,base)&&dir.startsWith(path.join(root,base)+path.sep)){
        try{const left=(await fs.readdir(dir)).filter(n=>n.toLowerCase()!=='desktop.ini');if(left.length)break;for(const n of await fs.readdir(dir))await fs.unlink(path.join(dir,n));await fs.rmdir(dir);}catch{break;}
        dir=path.dirname(dir);}
    }
    return result;
  }
  async function handle({p,req,json}){
    if(p==='/api/new-images'&&req.method==='GET'){const r=await plan();return json({folder:r.folder,count:r.items.length,ready:r.items.filter(i=>!i.problem).length,items:r.items.slice(0,60).map(({people_ids,...i})=>i)}),true;}
    if(p==='/api/new-images/apply'&&req.method==='POST')return json(await apply()),true;
    return false;
  }
  return {plan,apply,handle};
}
