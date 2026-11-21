#!/usr/bin/env node
// Owner request (2026-11-15): "Kérlek generálj egy Budapesti szállodát minden olyan Karakter
// lakosztályával akit érint ez a szálloda. Add le a chatgpt-nek a szükséges rendeléseket. Tedd ezeket
// a karaktereket láthatóvá a heti illetve napirendjük szerint."
// The hotel guests are the characters whose profile says they live in a Budapest hotel while
// travelling: Raul (accepted residence), Doyoon (owner's words, kept as [Kánon] in his draft) and
// Wonjae (accepted residence, on tour). Valentin has his own flat in the tree and stays there.
// Dry run by default; --apply backs up the tree and the database first, journal in <data>/backups.
//   - New approved tree revision: "Budapest - Hotel" under Budapest with its entry room
//     "Budapest - Hotel - Recepció", "Budapest - Hotel - Étterem" and one suite per guest
//     (Nappali = entry, Hálószoba, Fürdőszoba). Doyoon's two existing catalogue rooms are reused.
//   - Home links (source creator) to each guest's suite living room and bedroom.
//   - Weekly schedules (world:schedule:<id>) drafted from each routine; Play places them by them.
//   - Backgrounds and doors become ChatGPT play orders by themselves (Budapest is ChatGPT's town);
//     the Budapest map gets a pin order for the hotel.
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
const NOTE='2026-11-15 tulajdonosi kérés (budapesti szálloda).';

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
  const loc=one('SELECT id FROM locations WHERE name_key=?',tagKey(name));
  if(loc){
    // An existing catalogue room (Doyoon's, made before the tree had a hotel) becomes a tree place.
    const old=nodes.find(n=>n.source_id===loc.id);
    if(old){Object.assign(old,{parent_id:parent.id,archived:false,placed:true,order:nextOrder(parent.id)});note(`  visszakerül a fába: ${name}`);return old;}
    const n={id:loc.id,name,parent_id:parent.id,kind:'place',source_id:loc.id,type_ids:[],placed:true,archived:false,order:nextOrder(parent.id),note:NOTE,x:null,y:null};
    nodes.push(n);note(`  meglévő katalógushely a fába: ${name}`);return n;
  }
  const t={id:randomUUID(),tag_id:randomUUID(),name};newTags.push(t);
  const n={id:t.id,name,parent_id:parent.id,kind:'place',source_id:t.id,type_ids:[],placed:true,archived:false,order:nextOrder(parent.id),note:NOTE,x:null,y:null};
  nodes.push(n);note(`  új hely: ${name} (${parent.name} alatt)`);return n;
}
note(`Budapesti szálloda – ${apply?'ÉLES':'próbafuttatás'}`);
const budapest=need('Budapest'),hotel=addPlace('Budapest - Hotel',budapest);
const H='Budapest - Hotel - ';
addPlace(H+'Recepció',hotel);const restaurant=addPlace(H+'Étterem',hotel);
const char=name=>{const c=one('SELECT id FROM characters WHERE name=?',name);if(!c)throw new Error('Character missing: '+name);return c.id;};
const guests=[['Raul - Brazil utazó','Raul'],['Doyoon','Doyoon'],['Wonjae','Wonjae']].map(([full,short])=>{
  const suite=addPlace(`${H}${short} lakosztály`,hotel);
  const rooms=Object.fromEntries(['Nappali','Hálószoba','Fürdőszoba'].map(r=>[r,addPlace(`${H}${short} lakosztály - ${r}`,suite)]));
  return {name:full,short,id:char(full),suite,rooms};
});
const loc=name=>need(name).source_id||(()=>{throw new Error('No catalogue location: '+name);})();
const WD=[1,2,3,4,5],WE=[6,0],ALL=[0,1,2,3,4,5,6];
const g=Object.fromEntries(guests.map(x=>[x.short,x])),room=(s,r)=>g[s].rooms[r].source_id;
const R='Raul',D='Doyoon',W='Wonjae';
const e=(days,slot,location_id,months)=>({days,slot,location_id,...(months?{months}:{})});
// Drafted from the routines (Raul, Wonjae accepted; Doyoon's draft pending). Earliest match wins.
const schedules={
  [R]:[e(WD,'reggel',loc('Budapest - Edzőterem')),e([1,3,5],'delutan',loc('Fotózás')),e([2,4],'delutan',loc('Budapest - Városliget')),
    e(WE,'reggel',restaurant.source_id),e(WE,'delutan',loc('Balaton - Strand'),[6,7,8]),e([6],'delutan',loc('Budapest - Városliget')),e([0],'delutan',loc('Budapest - Templom tér')),
    e(ALL,'este',loc('Budapest - Kocsma')),e(ALL,'ejszaka',room(R,'Hálószoba'))],
  [D]:[e(WD,'reggel',loc('Budapest - Kamionos cég')),e(WD,'delutan',loc('Budapest - Kamionos cég')),e([1,2,3,4],'este',loc('Budapest - Kávézó')),e([5],'este',restaurant.source_id),
    e(WE,'reggel',restaurant.source_id),e([6],'delutan',loc('Budapest - Városliget')),e([0],'delutan',loc('Budapest - Templom tér')),e(WE,'este',room(D,'Nappali')),
    e(ALL,'ejszaka',room(D,'Hálószoba'))],
  [W]:[e([2,3,4,5,6],'reggel',loc('Stadion - üres színpad')),e([2,3,4,5,6],'delutan',loc('Stadion - Backstage')),e([5,6],'este',loc('Budapest - Stadion - Nézőtér')),
    e([2,3,4],'este',room(W,'Nappali')),e([0,1],'reggel',room(W,'Nappali')),e([0],'delutan',loc('Budapest - Városliget')),e([1],'delutan',loc('Budapest - Kávézó')),
    e([0,1],'este',restaurant.source_id),e(ALL,'ejszaka',room(W,'Hálószoba'))]
};
const DAYS=['V','H','K','Sze','Cs','P','Szo'],nameOf=id=>nodes.find(n=>n.source_id===id)?.name||one('SELECT name FROM locations WHERE id=?',id)?.name||id;
for(const x of guests){note(`  otthon: ${x.name} → ${x.rooms.Nappali.name}, ${x.rooms.Hálószoba.name}`);
  for(const s of schedules[x.short])note(`    ${s.days.map(d=>DAYS[d]).join(',')} ${s.slot}${s.months?' (nyáron)':''}: ${nameOf(s.location_id)}`);}
if(!apply){note('Próbafuttatás: semmi nem változott. Élesben: --apply');process.exit(0);}

const stamp=iso().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');await fs.mkdir(bdir,{recursive:true});
await fs.copyFile(file,path.join(bdir,`location-canvas-before-hotel-${stamp}.json`));
await backup(db,path.join(bdir,`universe-before-hotel-${stamp}.sqlite`));
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
    for(const x of guests){
      for(const r of ['Nappali','Hálószoba'])run('INSERT OR IGNORE INTO world_places(id,character_id,location_id,role,note,source,created_at) VALUES(?,?,?,?,?,?,?)',randomUUID(),x.id,x.rooms[r].source_id,'home','Tulajdonos: '+NOTE,'creator',iso());
      const key='world:schedule:'+x.id;if(one('SELECT 1 FROM application_settings WHERE key=?',key))throw new Error('Schedule already exists: '+x.name);
      run('INSERT INTO application_settings(key,value) VALUES(?,?)',key,JSON.stringify({version:1,source:'Claude javaslat a heti rutinból (2026-11-15), tulajdonosi kérésre; szerkeszthető.',created_at:iso(),entries:schedules[x.short]}));
    }
    db.exec('COMMIT');
  }catch(err){db.exec('ROLLBACK');throw err;}
  const fresh=JSON.parse(await fs.readFile(file,'utf8'));if(fresh.head!==head.id)throw new Error('A helyszínfa közben megváltozott; futtasd újra.');
  const reason='Tulajdonosi kérés (2026-11-15): budapesti szálloda Raul, Doyoon és Wonjae lakosztályával.';
  const revision={id:randomUUID(),parent_id:head.id,kind:'approved',actor:'local-creator',reason,created_at:iso(),catalogue_version:head.catalogue_version,state_hash:hash(normalized),request_key:randomUUID(),request_hash:hash({kind:'approved',reason,state:normalized}),state:normalized};
  fresh.revisions.push(revision);fresh.head=revision.id;fresh.approved_head=revision.id;
  const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(fresh),{flag:'wx'});
  await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));await fs.rename(tmp,file);
  note('Új jóváhagyott fa-változat: '+revision.id);
}finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
await fs.writeFile(path.join(bdir,`hotel-journal-${stamp}.txt`),log.join('\n'),'utf8');
note('Napló: '+path.join(bdir,`hotel-journal-${stamp}.txt`));
