#!/usr/bin/env node
// Owner request (2026-11-15): Jessi lives with Jonas and gets his own room in Jonas's house;
// Gyuszi gets a house in Káloz. Their backgrounds and doors are ordered from ChatGPT (per-place
// worker override, key play:order-worker; Káloz would otherwise go to Grok).
// Dry run by default; --apply backs up the tree and the database first, journal in <data>/backups.
//   - New tree places (new approved revision, same way as the 2026-11-14 restructure):
//     "Jonas háza - Jessi szobája" under Jonas háza; "Gyuszi háza" under Káloz with its entry
//     room "Gyuszi háza - Nappali". Each gets a catalogue location (tag) like the app makes.
//   - Home links (source creator: the owner said so): Jessi → Jonas háza (the night rule puts him
//     in the room carrying his name, by day in the living room); Gyuszi → Gyuszi háza.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {normalizeCanvas} from '../app/public/location-canvas-model.js';
import {resolveDataDir} from '../app/server.mjs';
import {tagKey} from '../app/taxonomy.mjs';

const apply=process.argv.includes('--apply'),dataDir=resolveDataDir();
const file=path.join(dataDir,'location-canvas.json'),lockFile=path.join(dataDir,'location-canvas.lock'),dbFile=path.join(dataDir,'universe.sqlite');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),iso=()=>new Date().toISOString(),log=[],note=s=>{log.push(s);console.log(s);};
const NOTE='2026-11-15 tulajdonosi kérés.';

const disk=JSON.parse(await fs.readFile(file,'utf8')),head=disk.revisions.at(-1);
if(disk.head!==head.id)throw new Error('Tree head mismatch.');
const state=structuredClone(head.state),nodes=state.nodes,live=()=>nodes.filter(n=>!n.archived);
const byName=name=>{const hits=live().filter(n=>n.name===name);if(hits.length>1)throw new Error('Ambiguous: '+name);return hits[0]||null;};
const need=name=>{const n=byName(name);if(!n)throw new Error('Missing place: '+name);return n;};
const nextOrder=id=>Math.max(-1,...live().filter(n=>n.parent_id===id&&n.placed).map(n=>n.order))+1;
const db=new DatabaseSync(dbFile);db.exec('PRAGMA busy_timeout=8000');
const one=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
const newTags=[];
function addPlace(name,parent){
  const found=byName(name);if(found){note('  megvan: '+name);return found;}
  if(one('SELECT 1 FROM locations WHERE name_key=?',tagKey(name)))throw new Error('Catalogue location already exists outside the tree: '+name);
  const t={id:randomUUID(),tag_id:randomUUID(),name};newTags.push(t);
  const n={id:t.id,name,parent_id:parent.id,kind:'place',source_id:t.id,type_ids:[],placed:true,archived:false,order:nextOrder(parent.id),note:NOTE,x:null,y:null};
  nodes.push(n);note(`  új hely: ${name} (${parent.name} alatt)`);return n;
}
note(`Jessi szobája és Gyuszi háza – ${apply?'ÉLES':'próbafuttatás'}`);
const jonas=need('Jonas háza'),room=addPlace('Jonas háza - Jessi szobája',jonas);
const kaloz=need('Káloz'),house=addPlace('Gyuszi háza',kaloz),living=addPlace('Gyuszi háza - Nappali',house);
const jessi=one("SELECT id FROM characters WHERE name='Jessi'"),gyuszi=one("SELECT id FROM characters WHERE name='Gyuszi'");
if(!jessi||!gyuszi)throw new Error('Character missing.');
const homes=[[jessi.id,'Jessi',jonas.source_id,'Jonas háza'],[gyuszi.id,'Gyuszi',house.source_id,'Gyuszi háza']];
for(const [,who,,where] of homes)note(`  otthon: ${who} → ${where}`);
const override=Object.fromEntries([room,house,living].map(n=>[n.id,'chatgpt']));
note('  rendelés: ChatGPT (háttér + ajtók): '+[room,house,living].map(n=>n.name).join(', '));
if(!apply){note('Próbafuttatás: semmi nem változott. Élesben: --apply');process.exit(0);}

const stamp=iso().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');await fs.mkdir(bdir,{recursive:true});
await fs.copyFile(file,path.join(bdir,`location-canvas-before-homes-${stamp}.json`));
await backup(db,path.join(bdir,`universe-before-homes-${stamp}.sqlite`));
const normalized=normalizeCanvas(state);
let lock;try{lock=await fs.open(lockFile,'wx');}catch{throw new Error('A helyszínterv mentése épp folyamatban van; próbáld újra.');}
try{
  db.exec('BEGIN IMMEDIATE');
  try{
    if(!one("SELECT 1 FROM tag_groups WHERE id='group-setting'"))run("INSERT INTO tag_groups VALUES('group-setting','Setting & location','setting & location')");
    for(const t of newTags){
      let tag=one("SELECT id FROM structured_tags WHERE group_id='group-setting' AND name_key=?",tagKey(t.name));
      if(!tag){run("INSERT INTO structured_tags VALUES(?,'group-setting',?,?)",t.tag_id,t.name,tagKey(t.name));tag={id:t.tag_id};}
      run('INSERT INTO locations VALUES(?,?,?,?,?,?)',t.id,t.name,tagKey(t.name),tag.id,null,iso());
    }
    for(const [cid,,lid] of homes)run('INSERT OR IGNORE INTO world_places(id,character_id,location_id,role,note,source,created_at) VALUES(?,?,?,?,?,?,?)',randomUUID(),cid,lid,'home','Tulajdonos: '+NOTE,'creator',iso());
    const key='play:order-worker';let cur={};try{cur=JSON.parse(one('SELECT value FROM application_settings WHERE key=?',key)?.value||'{}');}catch{}
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify({...cur,...override}));
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const fresh=JSON.parse(await fs.readFile(file,'utf8'));if(fresh.head!==head.id)throw new Error('A helyszínfa közben megváltozott; futtasd újra.');
  const reason='Tulajdonosi kérés (2026-11-15): Jessi szobája Jonas házában; Gyuszi háza Kálozon (nappalival).';
  const revision={id:randomUUID(),parent_id:head.id,kind:'approved',actor:'local-creator',reason,created_at:iso(),catalogue_version:head.catalogue_version,state_hash:hash(normalized),request_key:randomUUID(),request_hash:hash({kind:'approved',reason,state:normalized}),state:normalized};
  fresh.revisions.push(revision);fresh.head=revision.id;fresh.approved_head=revision.id;
  const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(fresh),{flag:'wx'});
  await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));await fs.rename(tmp,file);
  note('Új jóváhagyott fa-változat: '+revision.id);
}finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
await fs.writeFile(path.join(bdir,`homes-journal-${stamp}.txt`),log.join('\n'),'utf8');
note('Napló: '+path.join(bdir,`homes-journal-${stamp}.txt`));
