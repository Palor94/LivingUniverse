// Routine digest (2026-11-22): a compact, read-only extract of what the weekly routines are written
// from – per character the routine-relevant profile fields (clipped), his places, whom he knows and
// how well – plus the venues of the world. Reads a COPY of the catalogue (never the live file).
// Usage: node ops/routine-digest.mjs <copy of universe.sqlite> <location-canvas.json> <out dir>
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const [dbFile,canvasFile,outDir]=process.argv.slice(2);
const db=new DatabaseSync(dbFile,{readOnly:true}),q=(s,...a)=>db.prepare(s).all(...a),one=(s,...a)=>db.prepare(s).get(...a);
const LEVELS={'-2':'ellenséges','-1':'feszült','0':'idegen','1':'ismerős','2':'barátságos','3':'barát','4':'bizalmas','5':'szerető'};
const clip=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const canvas=JSON.parse(readFileSync(canvasFile,'utf8')),rev=canvas.revisions.find(r=>r.id===canvas.approved_head)||canvas.revisions.at(-1);
const nodes=rev.state.nodes.filter(n=>!n.archived),byId=new Map(nodes.map(n=>[n.id,n]));
const pathOf=n=>{const p=[];for(let x=n;x;x=byId.get(x.parent_id))p.unshift(x.name);return p.join(' › ');};
const nodeOfLoc=new Map(nodes.filter(n=>n.source_id).map(n=>[n.source_id,n]));
const locName=id=>{const n=nodeOfLoc.get(id);return n?pathOf(n):one('SELECT name FROM locations WHERE id=?',id)?.name||id;};
const hasGroups=!!one("SELECT 1 FROM sqlite_master WHERE name='character_groups'");
const people=q('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL'+(hasGroups?' AND c.id NOT IN (SELECT character_id FROM character_groups)':''))
  .filter(c=>one('SELECT 1 FROM application_settings WHERE key=?','ghost:character:'+c.id));
const palor=people.find(c=>c.name.trim().toLowerCase()==='palor');
const names=new Map(q('SELECT id,name FROM characters').map(c=>[c.id,c.name]));
const F=[['occupation','Foglalkozás',220],['residence','Lakóhely',160],['weekly_routine','Heti rutin',600],['habits','Szokások',300],['goals','Célok',200],['conflicts','Belső konfliktus',200],
  ['sexuality','Szexualitás',600],['intimacy','Intimitás',350],['attraction','Vonzalmak',300],['presented_sexuality','Mások felé',200],['secrets','Titkok',600],['play_voice','Hang',150]];
const out=[],json=[],brief=[];
for(const c of people.filter(p=>p!==palor).sort((a,b)=>a.name.localeCompare(b.name,'hu'))){
  let g={};try{g=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+c.id).value).values||{};}catch{}
  const v=f=>{const e=g[f];return e&&typeof e==='object'?e.value:e;};
  const places=q('SELECT location_id,role,note FROM world_places WHERE character_id=? ORDER BY role',c.id);
  const rel=new Map();
  for(const r of q('SELECT source_id,target_id,level FROM world_relationship_levels WHERE source_id=? OR target_id=?',c.id,c.id)){const o=r.source_id===c.id?r.target_id:r.source_id;const x=rel.get(o)||{};x[r.source_id===c.id?'out':'in']=r.level;rel.set(o,x);}
  for(const r of q('SELECT source_id,target_id,description FROM relationships WHERE source_id=? OR target_id=?',c.id,c.id)){const o=r.source_id===c.id?r.target_id:r.source_id;const x=rel.get(o)||{};if(r.source_id===c.id)x.desc=r.description;rel.set(o,x);}
  let sched=null;try{sched=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','world:schedule:'+c.id)?.value||'null');}catch{}
  const lines=[`## ${c.name}  (id: ${c.id})`];
  for(const [f,label,n] of F){const t=clip(v(f),n);if(t)lines.push(`${label}: ${t}`);}
  lines.push('Helyei: '+(places.map(p=>`${locName(p.location_id)} [${p.role}${p.note?': '+clip(p.note,60):''}] (${p.location_id})`).join('; ')||'—'));
  const rs=[...rel].filter(([o])=>names.has(o)).map(([o,x])=>`${o===palor?.id?'Palor':names.get(o)} ${x.out!==undefined?LEVELS[x.out]:'?'}${x.in!==undefined&&x.in!==x.out?'/'+LEVELS[x.in]:''}${x.desc?': '+clip(x.desc,90):''}`);
  lines.push('Ismeri: '+(rs.join(' | ')||'—'));
  if(sched?.entries?.length)lines.push('Meglévő rutin: '+sched.entries.length+' bejegyzés');
  out.push(lines.join('\n'));
  // The short form for planning who meets whom: essence, places, acquaintances (no ids, no long texts).
  brief.push(`## ${c.name}: ${clip(v('occupation'),70)}${v('residence')?' · '+clip(v('residence'),50):''}\n`
    +`Szex/titok: ${clip([v('sexuality'),v('secrets')].filter(Boolean).join(' | '),170)||'—'}\n`
    +`Helyek: ${[...new Set(places.map(p=>(nodeOfLoc.get(p.location_id)?.name||locName(p.location_id))+'('+p.role[0]+')'))].join(', ')||'—'}\n`
    +`Ismeri: ${[...rel].filter(([o])=>names.has(o)&&o!==palor?.id).map(([o,x])=>names.get(o)+' '+(x.out??x.in??'?')).join(', ')||'—'}`);
  json.push({id:c.id,name:c.name,places:places.map(p=>({location_id:p.location_id,role:p.role})),knows:[...rel.keys()].filter(o=>names.has(o))});
}
const used=new Set(q('SELECT location_id FROM world_places').map(r=>r.location_id));
const venues=q('SELECT id FROM locations').map(r=>r.id).filter(id=>!/\b(ház|lakás|szoba|háló|nappali|konyha|fürdő|előszoba|udvar|lépcső)/i.test(locName(id)));
mkdirSync(outDir,{recursive:true});
writeFileSync(path.join(outDir,'kivonat.md'),`# Rutin-kivonat (${new Date().toISOString().slice(0,10)}), ${out.length} szereplő\nSzintek: ${Object.values(LEVELS).join(', ')} (A→B / B→A). Palor kihagyva (a játékos viszi).\n\n`+out.join('\n\n')
  +`\n\n# Nem otthoni helyek a világban (${venues.length})\n`+venues.map(id=>`- ${locName(id)}${used.has(id)?'':' (senkihez nincs kötve)'} (${id})`).join('\n')+'\n');
writeFileSync(path.join(outDir,'vaz-kivonat.md'),`# Váz-kivonat: ki kit ismer (szint -2…5), hol jár. (h=otthon, w=munka, r=rutin, o=egyéb)\n\n`+brief.join('\n\n')+`\n\n# Közös helyszínek\n`+venues.map(id=>'- '+locName(id)+(used.has(id)?'':' *')).join('\n')+'\n');
writeFileSync(path.join(outDir,'kivonat.json'),JSON.stringify({people:json,venues,locations:q('SELECT id,name FROM locations').map(l=>({id:l.id,name:l.name,path:locName(l.id)}))},null,1));
console.log(out.length,'people,',venues.length,'venues');
