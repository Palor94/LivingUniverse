// Routine batches (2026-11-22): build a task sheet per batch and check written batches against the
// digest and the social skeleton. No AI, no network, no writes outside 30_IMPORTS/rutin-*.
//   node ops/routine-check.mjs <dir> sheet <batch>   → <dir>/lap-<batch>.md (what to write it from)
//   node ops/routine-check.mjs <dir> check           → checks every <dir>/javaslat-*.json
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const [dir,cmd,batch]=process.argv.slice(2);
const K=JSON.parse(readFileSync(path.join(dir,'kivonat.json'),'utf8')),V=JSON.parse(readFileSync(path.join(dir,'tarsasagi-vaz.json'),'utf8'));
const md=readFileSync(path.join(dir,'kivonat.md'),'utf8');
const SLOTS=['reggel','delutan','este','ejszaka'],PRIV=['public','private','secret'],DAYS=['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'];
const errors=[],warn=[];
const byName=new Map(K.people.map(p=>[p.name,p])),person=n=>{const p=byName.get(n);if(!p)errors.push('ismeretlen szereplő a vázban: '+n);return p;};
const last=s=>String(s).split(' › ').at(-1);
function loc(name){const hits=K.locations.filter(l=>l.name===name);const h=hits.length?hits:K.locations.filter(l=>last(l.path)===name);
  if(h.length!==1){errors.push(`hely nem egyértelmű vagy nem létezik: ${name} (${h.length})`);return null;}return h[0];}
// The skeleton itself.
const inBatch=new Map();for(const [b,list] of Object.entries(V.batches))for(const n of list){person(n);if(inBatch.has(n))errors.push('két csomagban is: '+n);inBatch.set(n,b);}
for(const p of K.people)if(!inBatch.has(p.name))errors.push('egyik csomagban sincs: '+p.name);
const links=V.links.map(([n,l,role])=>({p:person(n),l:loc(l),role})).filter(x=>x.p&&x.l);
const shared=V.shared.map(s=>({...s,l:loc(s.where)}));for(const s of shared)for(const n of s.people)person(n);
const allowed=p=>new Set([...p.places.map(x=>x.location_id),...links.filter(x=>x.p.id===p.id).map(x=>x.l.id)]);
if(cmd==='sheet'){
  const names=V.batches[batch];if(!names)throw new Error('nincs ilyen csomag: '+batch);
  const parts=md.split(/\n(?=## )/),out=[`# Feladatlap: ${batch} (${names.length} szereplő)\n`];
  for(const n of names){const p=byName.get(n);const sec=parts.find(x=>x.startsWith('## '+n+'  (id:'))||'';out.push(sec.trim());
    const own=links.filter(x=>x.p.id===p.id);if(own.length)out.push('ÚJ HELYKAPCSOLAT (a vázból, ezt is használhatod): '+own.map(x=>`${x.l.name} [${x.role}] (${x.l.id})`).join('; '));
    const sh=shared.filter(s=>s.people.includes(n));if(sh.length)out.push('KÖTELEZŐ KÖZÖS CELLÁK:\n'+sh.map(s=>`- ${s.days.map(d=>DAYS[d]).join(', ')} ${s.slots.join('+')} @ ${s.where} (${s.l?.id}) – privacy: ${s.privacy?.[n]||'public'} – ${s.note}; vele: ${s.people.filter(x=>x!==n).join(', ')||'egyedül'}`).join('\n'));
    out.push('');}
  writeFileSync(path.join(dir,`lap-${batch}.md`),out.join('\n'));console.log('kész: lap-'+batch+'.md');
}
if(cmd==='check'){
  const files=readdirSync(dir).filter(f=>/^javaslat-.*\.json$/.test(f)),cells=new Map();
  for(const f of files){let d;try{d=JSON.parse(readFileSync(path.join(dir,f),'utf8'));}catch(e){errors.push(f+': nem érvényes JSON');continue;}
    for(const pp of d.people||[]){const p=K.people.find(x=>x.id===pp.character_id);if(!p){errors.push(`${f}: ismeretlen id ${pp.character_id} (${pp.name})`);continue;}
      const ok=allowed(p);for(const l of d.links||[])if(l.character_id===p.id)ok.add(l.location_id);
      const g=pp.grid||{};if(!Object.keys(g).length)warn.push(`${p.name}: üres rács`);
      for(const [k,c] of Object.entries(g)){const [dd,sl]=k.split('|');
        if(!/^[0-6]$/.test(dd)||!SLOTS.includes(sl))errors.push(`${p.name}: hibás cella ${k}`);
        if(!ok.has(c.location_id))errors.push(`${p.name} ${k}: nem az ő helye (${c.location_id})`);
        if(c.privacy&&!PRIV.includes(c.privacy))errors.push(`${p.name} ${k}: hibás privacy ${c.privacy}`);
        if(!c.activity)warn.push(`${p.name} ${k}: nincs tevékenység`);else if(c.activity.length>200)errors.push(`${p.name} ${k}: túl hosszú tevékenység`);
        cells.set(p.name+'|'+k,c);}
    }}
  const written=new Set([...cells.keys()].map(k=>k.split('|')[0]));
  for(const s of shared)for(const n of s.people){if(!written.has(n)||!s.l)continue;
    for(const d of s.days)for(const sl of s.slots){const c=cells.get(`${n}|${d}|${sl}`);
      if(!c||c.location_id!==s.l.id)errors.push(`${n}: hiányzik a közös cella ${s.id} (${DAYS[d]} ${sl} @ ${s.where})`);
      else if((c.privacy||'public')!==(s.privacy?.[n]||'public'))warn.push(`${n} ${s.id}: privacy ${c.privacy||'public'} ≠ váz ${s.privacy?.[n]||'public'}`);}}
  console.log(`${files.length} fájl, ${written.size} szereplő, ${cells.size} cella`);
}
for(const e of errors)console.log('HIBA: '+e);for(const w of warn.slice(0,40))console.log('figyelem: '+w);if(warn.length>40)console.log(`… még ${warn.length-40} figyelmeztetés`);
process.exitCode=errors.length?1:0;
