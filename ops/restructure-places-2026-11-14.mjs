#!/usr/bin/env node
// One-time restructure of the place tree (owner request, 2026-11-14). Dry run by default:
//   node ops/restructure-places-2026-11-14.mjs                 shows what would change
//   node ops/restructure-places-2026-11-14.mjs --apply         backs up, then changes
//   --data-dir <folder>   another data folder (the sandbox copy, a test folder)
//
// What it does (a new approved revision of the location tree; IDs, media and links are kept,
// so every picture, event and character link of a moved place moves with it):
//  - Káloz határa (under Káloz) gets the countryside: Tó › Tópart (the shore is the way in),
//    Erdei parkoló › Erdő › Mountain › Kiránduló hely a hegyekben.
//  - Max háza and Laci háza move to Budapest; Budapest's Lángosozó moves out of "Utca".
//  - "Közlekedés és mozgó helyszínek" becomes "Közlekedési eszközök" (vehicles, station, train:
//    used by travelling, not a category on the map); a new "Átjárók" collection holds the shared
//    stairwell. Emptied category collections and the unidentified duplicate hospital are archived.
//  - Every home without a living room gets "<home> - Nappali" (a hostel or dormitory gets
//    "Közösségi tér"); a living room without a catalogue tag gets one.
//  - Budapest gets a hospital with a radiology ward, where Ács Bálint works as a radiologist
//    (his work links move there from the Székesfehérvár hospital).
// Backups: the tree file and the database go to <data>\backups\ first; a journal lists every change.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {normalizeCanvas,WORLD_ROOT} from '../app/public/location-canvas-model.js';
import {resolveDataDir} from '../app/server.mjs';
import {tagKey} from '../app/taxonomy.mjs';

const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:d;};
const apply=process.argv.includes('--apply');
const dataDir=path.resolve(arg('data-dir',resolveDataDir()));
const file=path.join(dataDir,'location-canvas.json'),lockFile=path.join(dataDir,'location-canvas.lock'),dbFile=path.join(dataDir,'universe.sqlite');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const iso=()=>new Date().toISOString();
const log=[];const note=s=>{log.push(s);console.log(s);};

const disk=JSON.parse(await fs.readFile(file,'utf8'));
const head=disk.revisions.at(-1);if(!head)throw new Error('No tree revision.');
if(disk.head!==head.id)throw new Error('Tree head mismatch.');
const state=structuredClone(head.state),nodes=state.nodes;
const live=()=>nodes.filter(n=>!n.archived);
const byName=name=>{const hits=live().filter(n=>n.name===name);if(hits.length>1)throw new Error('Ambiguous name: '+name);return hits[0]||null;};
const need=name=>{const n=byName(name);if(!n)throw new Error('Missing place: '+name);return n;};
const kids=id=>live().filter(n=>n.parent_id===id&&n.placed);
const nextOrder=id=>Math.max(-1,...kids(id).map(n=>n.order))+1;
function move(name,parentName){const n=byName(name),p=parentName===WORLD_ROOT?{id:WORLD_ROOT,name:'Living Universe'}:need(parentName);if(!n){note('  ! nincs ilyen hely: '+name);return;}
  if(n.parent_id===p.id)return;n.parent_id=p.id;n.placed=true;n.order=nextOrder(p.id);note(`  áthelyezve: ${name} → ${p.name}`);}
function archive(name){const n=byName(name);if(!n)return;if(kids(n.id).length){note(`  ! nem archiválom (van benne hely): ${name}`);return;}
  n.archived=true;n.placed=false;n.parent_id=null;n.x=null;n.y=null;note('  archiválva: '+name);}

const db=new DatabaseSync(dbFile);db.exec('PRAGMA busy_timeout=8000');
const one=(sql,...a)=>db.prepare(sql).get(...a),run=(sql,...a)=>db.prepare(sql).run(...a);
// A catalogue location (tag) for a new place, the same way the app makes one.
const newTags=[];
function ensureTag(name){
  const existing=one('SELECT id FROM locations WHERE name_key=?',tagKey(name));if(existing)return existing.id;
  const planned=newTags.find(t=>t.name===name);if(planned)return planned.id;
  const t={id:randomUUID(),tag_id:randomUUID(),name};newTags.push(t);return t.id;
}
function addPlace(name,parent,{source=true}={}){
  const found=byName(name);if(found)return found;
  const id=source?ensureTag(name):randomUUID();
  const n={id,name,parent_id:parent.id,kind:'place',source_id:source?id:null,type_ids:[],placed:true,archived:false,order:nextOrder(parent.id),note:'2026-11-14 átrendezés (tulajdonosi kérés).',x:null,y:null};
  nodes.push(n);note(`  új hely: ${name} (${parent.name} alatt)`);return n;
}

note(`Helyszínfa átrendezése – ${apply?'ÉLES':'próbafuttatás'} – ${dataDir}`);
note('1. Káloz határa: tó és erdőség');
move('Káloz határa','Káloz');
move('Tó','Káloz határa');move('Tópart','Tó');
move('Erdei parkoló – Fantasy Den','Káloz határa');move('Erdő','Erdei parkoló – Fantasy Den');
move('Mountain','Erdő');move('Kiránduló hely a hegyekben','Mountain');
note('2. Budapest');
move('Max háza','Budapest');move('Laci háza','Budapest');move('Budapest - Utca - Lángosozó','Budapest');
{const l=byName('Budapest - Utca - Lángosozó');if(l){l.name='Budapest - Lángosozó';note('  átnevezve a fában: Budapest - Utca - Lángosozó → Budapest - Lángosozó');}}
const bp=need('Budapest'),hospital=addPlace('Budapest - Kórház',bp);addPlace('Budapest - Kórház - Radiológia',hospital);
note('3. Közlekedés és átjárók');
const transport=need('Közlekedés és mozgó helyszínek');transport.name='Közlekedési eszközök';transport.note='Közlekedési eszközök és útközbeni helyek (vonat, vasútállomás, benzinkút, járművek): az utazás használja őket, a térképen nem kategória.';note('  átnevezve: Közlekedés és mozgó helyszínek → Közlekedési eszközök');
let passages=byName('Átjárók');
if(!passages){passages={id:'collection:atjarok-'+randomUUID().slice(0,8),name:'Átjárók',parent_id:WORLD_ROOT,kind:'collection',source_id:null,type_ids:[],placed:true,archived:false,order:nextOrder(WORLD_ROOT),note:'Átjáró helyek: a lépcsőház a város térképe és a lakások között. Nem úti cél; képei és eseményei az átjárásé.',x:null,y:null};nodes.push(passages);note('  új gyűjtemény: Átjárók');}
move('Emeletes ház lépcsőháza','Átjárók');
note('4. Kiürült kategóriák és a duplikált kórház');
archive('Kórház – azonosítandó');
for(const c of ['Lakóhelyek','Intézmények és munkahelyek','Természet és szabadtéri helyek','Szabadidő és vendéglátás','Építkezések és munkaterületek'])archive(c);
note('5. Nappali / Közösségi tér minden otthonhoz');
const TOWN_NAMES=['Budapest','Székesfehérvár','Káloz','Sárbogárd','Pécs','Gárdony','Balaton','M7-es autópálya'];
const towns=new Set(TOWN_NAMES.map(n=>byName(n)?.id).filter(Boolean));
const HOME=/háza|lakása|\blakás\b|albérlet|családi ház|szomszéd ház|munkásszálló|kollégium/i,SKIP=/sátra|rejtekhely|cigánytelep\b(?!.*háza)|műhely/i,ORIGIN=/(^|\s|-)\s*(nappali|közösségi tér|nagyszoba)$/i;
const cigany=byName('Káloz cigánytelep');
for(const h of live().filter(n=>n.kind==='place'&&n.placed&&(towns.has(n.parent_id)||n.parent_id===cigany?.id)&&HOME.test(n.name)&&!SKIP.test(n.name))){
  const entry=kids(h.id).find(c=>ORIGIN.test(c.name.trim()));
  // A living room without a catalogue tag cannot take one (a tagged place's id is its tag's id):
  // a tagged living room replaces it, and the untagged one is archived (nothing hangs on it).
  if(entry){if(!entry.source_id){const fresh=addPlace(h.name+' - Nappali',h);fresh.order=entry.order;for(const c of kids(entry.id))c.parent_id=fresh.id;entry.archived=true;entry.placed=false;entry.parent_id=null;entry.x=null;entry.y=null;note(`  archiválva: ${entry.name} (${h.name}; helyette a címkés nappali)`);}continue;}
  const base=h.name.replace(/\s*[–-]\s*azonosítandó$/i,'').trim(),town=nodes.find(t=>t.id===h.parent_id);
  addPlace(`${town&&!base.includes(town.name)&&base!==h.name?town.name+' - ':''}${base} - ${/szálló|kollégium/i.test(h.name)?'Közösségi tér':'Nappali'}`,h);
}

const normalized=normalizeCanvas(state);
note(`\nÚj katalógus-helyszínek: ${newTags.length}`);
const bal=one("SELECT id FROM characters WHERE name='Ács Bálint'");
const radiology=byName('Budapest - Kórház - Radiológia');
const oldWork=bal?db.prepare("SELECT p.id,l.name FROM world_places p JOIN locations l ON l.id=p.location_id WHERE p.character_id=? AND p.role='work'").all(bal.id):[];
note(`Ács Bálint munkahelye: ${oldWork.map(r=>r.name).join(', ')||'–'} → Budapest - Kórház - Radiológia (radiológus)`);

if(!apply){note('\nPróbafuttatás: semmi nem változott. Élesben: --apply');process.exit(0);}

// ---- apply ------------------------------------------------------------------------------
const stamp=iso().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');await fs.mkdir(bdir,{recursive:true});
await fs.copyFile(file,path.join(bdir,`location-canvas-before-restructure-${stamp}.json`));
await backup(db,path.join(bdir,`universe-before-restructure-${stamp}.sqlite`));
note('Mentés kész: '+bdir);
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
    if(bal&&radiology){for(const r of oldWork)run('DELETE FROM world_places WHERE id=?',r.id);
      run('INSERT INTO world_places(id,character_id,location_id,role,note,source,created_at) VALUES(?,?,?,?,?,?,?)',randomUUID(),bal.id,radiology.source_id,'work','radiológus','creator',iso());}
    // The changed town maps are ordered for redrawing (ChatGPT map orders; cleared by save_town_map).
    const redoKey='play:map-redo';let redo={};try{redo=JSON.parse(one('SELECT value FROM application_settings WHERE key=?',redoKey)?.value||'{}');}catch{}
    for(const [name,why] of [['Káloz','a településen belül az utca nem hely, és új hely lett Káloz határa (tó, erdőség)'],['Káloz határa','új tájtérkép: tó a tóparttal, erdei parkoló, nagy erdő, hegy'],['Budapest','új helyek: Max háza, Laci háza, Kórház, Lángosozó; az utca nem hely']]){const n=byName(name);if(n)redo[n.id]=why;}
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',redoKey,JSON.stringify(redo));
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const fresh=JSON.parse(await fs.readFile(file,'utf8'));if(fresh.head!==head.id)throw new Error('A helyszínfa közben megváltozott; futtasd újra.');
  const reason='Átrendezés a tulajdonos kérésére (2026-11-14): Káloz határa (tó, erdőség), Budapest (Max és Laci háza, kórház), közlekedési eszközök és átjárók, nappalik.';
  const revision={id:randomUUID(),parent_id:head.id,kind:'approved',actor:'local-creator',reason,created_at:iso(),catalogue_version:head.catalogue_version,state_hash:hash(normalized),request_key:randomUUID(),request_hash:hash({kind:'approved',reason,state:normalized}),state:normalized};
  fresh.revisions.push(revision);fresh.head=revision.id;fresh.approved_head=revision.id;
  const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(fresh),{flag:'wx'});
  await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));await fs.rename(tmp,file);
  note('Új jóváhagyott fa-változat: '+revision.id);
}finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
await fs.writeFile(path.join(bdir,`restructure-journal-${stamp}.txt`),log.join('\n'),'utf8');
note('Napló: '+path.join(bdir,`restructure-journal-${stamp}.txt`));
