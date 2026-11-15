#!/usr/bin/env node
// Owner corrections to the place tree (2026-11-14, second round). Dry run by default; --apply
// backs up the tree and the database first and writes a new revision of the same kind.
//  - "Erdei parkoló – Fantasy Den" → "Erdei parkoló" (one arrives at the car park itself; the
//    forest is through it). "Mountain" → "Hegy".
//  - Pécs: "Kollégium – azonosítandó" → "Pécs - Kollégium" (its Közösségi tér is the way in).
//  - Budapest: "Stadion – azonosítandó" → "Budapest - Stadion", with a new "Budapest - Stadion -
//    Nézőtér" as its way in.
//  - "Palor  nappali" → "Palor lakása - Nappali"; "Budapest -András háza - konyha" → "András háza
//    - Konyha" (András háza's Nappali leads to it).
// A catalogue name (and so its "Helyszín hátterek" drop folder) changes only when that folder
// holds no files; otherwise the tree name changes and the catalogue name stays, so no file moves.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {normalizeCanvas} from '../app/public/location-canvas-model.js';
import {resolveDataDir} from '../app/server.mjs';
import {resourceRoot} from '../app/storage-layout.mjs';
import {tagKey} from '../app/taxonomy.mjs';

const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:d;};
const apply=process.argv.includes('--apply'),dataDir=path.resolve(arg('data-dir',resolveDataDir()));
const media=path.resolve(arg('media',path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..')));
const file=path.join(dataDir,'location-canvas.json'),lockFile=path.join(dataDir,'location-canvas.lock');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),iso=()=>new Date().toISOString();
const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim();
const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'));db.exec('PRAGMA busy_timeout=8000');
const one=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
const disk=JSON.parse(await fs.readFile(file,'utf8')),head=disk.revisions.at(-1),state=structuredClone(head.state);
const live=()=>state.nodes.filter(n=>!n.archived);
const byName=name=>{const h=live().filter(n=>n.name===name);if(h.length>1)throw new Error('Ambiguous: '+name);return h[0]||null;};
const nextOrder=id=>Math.max(-1,...live().filter(n=>n.parent_id===id).map(n=>n.order))+1;
const log=[],note=s=>{log.push(s);console.log(s);};
const catRenames=[],newTags=[];
async function folderHasFiles(name){try{const d=path.join(media,'20_SHARED_MEDIA','Helyszín hátterek',safeName(name));return (await fs.readdir(d)).length>0;}catch{return false;}}
async function rename(oldName,newName){
  const n=byName(oldName);if(!n){note('  ! nincs ilyen hely: '+oldName);return null;}
  n.name=newName;note(`  átnevezve a fában: ${oldName} → ${newName}`);
  if(n.source_id){const l=one('SELECT * FROM locations WHERE id=?',n.source_id);
    if(l&&l.name!==newName){
      if(one('SELECT 1 FROM locations WHERE name_key=? AND id<>?',tagKey(newName),l.id))note(`    katalógusnév marad (${l.name}): az új név már foglalt`);
      else if(await folderHasFiles(l.name))note(`    katalógusnév marad (${l.name}): a háttérmappájában képek vannak`);
      else{catRenames.push({id:l.id,tag_id:l.tag_id,name:newName});note(`    katalógusnév is: ${l.name} → ${newName}`);}}}
  return n;
}
function addPlace(name,parent){
  if(byName(name))return byName(name);
  const existing=one('SELECT id FROM locations WHERE name_key=?',tagKey(name)),id=existing?.id||randomUUID();
  if(!existing)newTags.push({id,tag_id:randomUUID(),name});
  const n={id,name,parent_id:parent.id,kind:'place',source_id:id,type_ids:[],placed:true,archived:false,order:0,note:'2026-11-14 tulajdonosi javítás: a hely bejárata (origó).',x:null,y:null};
  for(const c of live().filter(c=>c.parent_id===parent.id))c.order+=1;state.nodes.push(n);note(`  új hely: ${name} (${parent.name} alatt, bejárat)`);return n;
}

note(`Helyszín-javítások – ${apply?'ÉLES':'próbafuttatás'}`);
await rename('Erdei parkoló – Fantasy Den','Erdei parkoló');
await rename('Mountain','Hegy');
await rename('Kollégium – azonosítandó','Pécs - Kollégium');
const stadium=await rename('Stadion – azonosítandó','Budapest - Stadion');
if(stadium)addPlace('Budapest - Stadion - Nézőtér',stadium);
await rename('Palor  nappali','Palor lakása - Nappali');
await rename('Budapest -András háza - konyha','András háza - Konyha');
const normalized=normalizeCanvas(state);
if(!apply){note('Próbafuttatás: semmi nem változott. Élesben: --apply');process.exit(0);}

const stamp=iso().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');await fs.mkdir(bdir,{recursive:true});
await fs.copyFile(file,path.join(bdir,`location-canvas-before-place-fixes-${stamp}.json`));
await backup(db,path.join(bdir,`universe-before-place-fixes-${stamp}.sqlite`));
let lock;try{lock=await fs.open(lockFile,'wx');}catch{throw new Error('A helyszínterv mentése épp folyamatban van; próbáld újra.');}
try{
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const t of newTags){let tag=one("SELECT id FROM structured_tags WHERE group_id='group-setting' AND name_key=?",tagKey(t.name));
      if(!tag){run("INSERT INTO structured_tags VALUES(?,'group-setting',?,?)",t.tag_id,t.name,tagKey(t.name));tag={id:t.tag_id};}
      run('INSERT INTO locations VALUES(?,?,?,?,?,?)',t.id,t.name,tagKey(t.name),tag.id,null,iso());}
    for(const r of catRenames){run('UPDATE locations SET name=?,name_key=? WHERE id=?',r.name,tagKey(r.name),r.id);
      if(r.tag_id&&!one("SELECT 1 FROM structured_tags WHERE group_id='group-setting' AND name_key=? AND id<>?",tagKey(r.name),r.tag_id))run('UPDATE structured_tags SET name=?,name_key=? WHERE id=?',r.name,tagKey(r.name),r.tag_id);}
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const fresh=JSON.parse(await fs.readFile(file,'utf8'));if(fresh.head!==head.id)throw new Error('A helyszínfa közben megváltozott; futtasd újra.');
  const reason='Tulajdonosi javítások (2026-11-14): Erdei parkoló, Hegy, Pécs - Kollégium, Budapest - Stadion (Nézőtér bejárattal), Palor lakása - Nappali, András háza - Konyha.';
  const revision={id:randomUUID(),parent_id:head.id,kind:head.kind,actor:'local-creator',reason,created_at:iso(),catalogue_version:head.catalogue_version,state_hash:hash(normalized),request_key:randomUUID(),request_hash:hash({kind:head.kind,reason,state:normalized}),state:normalized};
  fresh.revisions.push(revision);fresh.head=revision.id;if(head.kind==='approved')fresh.approved_head=revision.id;
  const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(fresh),{flag:'wx'});
  await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));await fs.rename(tmp,file);
  note('Kész. Új fa-változat: '+revision.id);
}finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
await fs.writeFile(path.join(bdir,`place-fixes-journal-${stamp}.txt`),log.join('\n'),'utf8');
