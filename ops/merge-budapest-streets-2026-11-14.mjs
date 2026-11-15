#!/usr/bin/env node
// Owner request (2026-11-14): Budapest's two street places, "Utca" and "Budapest - street", become
// one. "Budapest - street" is kept (35 pictures; its catalogue name and its drop folder
// "Helyszín hátterek\Budapest - street" stay, so nothing on disk changes). In the tree it is named
// "Budapest - Utca"; the "Utca" place is archived (its id and history stay). The two pictures
// tagged "Utca" get "Budapest - street" instead. Dry run by default; --apply backs up first.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {normalizeCanvas} from '../app/public/location-canvas-model.js';
import {resolveDataDir} from '../app/server.mjs';

const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:d;};
const apply=process.argv.includes('--apply'),dataDir=path.resolve(arg('data-dir',resolveDataDir()));
const file=path.join(dataDir,'location-canvas.json'),lockFile=path.join(dataDir,'location-canvas.lock');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),iso=()=>new Date().toISOString();

const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'));db.exec('PRAGMA busy_timeout=8000');
const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
const keep=one("SELECT * FROM locations WHERE name='Budapest - street'"),drop=one("SELECT * FROM locations WHERE name='Utca'");
if(!keep||!drop)throw new Error('A két budapesti utca-hely nem található.');
const disk=JSON.parse(await fs.readFile(file,'utf8')),head=disk.revisions.at(-1),state=structuredClone(head.state);
const kNode=state.nodes.find(n=>n.id===keep.id&&!n.archived),dNode=state.nodes.find(n=>n.id===drop.id&&!n.archived);
if(!kNode||!dNode)throw new Error('A két utca nincs a helyszínfában.');
if(state.nodes.some(n=>n.parent_id===dNode.id&&!n.archived))throw new Error('Az "Utca" alatt még van hely.');
const pics=all('SELECT media_id FROM media_tags WHERE tag_id=?',drop.tag_id).map(r=>r.media_id);
console.log(`Megtartva: Budapest - street (a fában: Budapest - Utca). Archiválva: Utca. Átsorolt kép: ${pics.length}.`);
if(!apply){console.log('Próbafuttatás. Élesben: --apply');process.exit(0);}

const stamp=iso().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');await fs.mkdir(bdir,{recursive:true});
await fs.copyFile(file,path.join(bdir,`location-canvas-before-street-merge-${stamp}.json`));
await backup(db,path.join(bdir,`universe-before-street-merge-${stamp}.sqlite`));
kNode.name='Budapest - Utca';dNode.archived=true;dNode.placed=false;dNode.parent_id=null;dNode.x=null;dNode.y=null;
const normalized=normalizeCanvas(state);
let lock;try{lock=await fs.open(lockFile,'wx');}catch{throw new Error('A helyszínterv mentése épp folyamatban van; próbáld újra.');}
try{
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const mid of pics){run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',mid,keep.tag_id);run('DELETE FROM media_tags WHERE media_id=? AND tag_id=?',mid,drop.tag_id);}
    run('UPDATE media_locations SET location_id=? WHERE location_id=?',keep.id,drop.id);
    run('UPDATE OR IGNORE media_location_links SET location_id=? WHERE location_id=?',keep.id,drop.id);run('DELETE FROM media_location_links WHERE location_id=?',drop.id);
    run('UPDATE OR IGNORE world_places SET location_id=? WHERE location_id=?',keep.id,drop.id);run('DELETE FROM world_places WHERE location_id=?',drop.id);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const fresh=JSON.parse(await fs.readFile(file,'utf8'));if(fresh.head!==head.id)throw new Error('A helyszínfa közben megváltozott; futtasd újra.');
  const reason='Budapest két utcája egy hely lett (tulajdonosi kérés, 2026-11-14): Budapest - street (a fában Budapest - Utca) marad, az Utca archiválva.';
  const revision={id:randomUUID(),parent_id:head.id,kind:head.kind,actor:'local-creator',reason,created_at:iso(),catalogue_version:head.catalogue_version,state_hash:hash(normalized),request_key:randomUUID(),request_hash:hash({kind:head.kind,reason,state:normalized}),state:normalized};
  fresh.revisions.push(revision);fresh.head=revision.id;if(head.kind==='approved')fresh.approved_head=revision.id;
  const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(fresh),{flag:'wx'});
  await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));await fs.rename(tmp,file);
  console.log('Kész. Új fa-változat: '+revision.id+' · mentés: '+bdir);
}finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
