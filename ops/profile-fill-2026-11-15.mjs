#!/usr/bin/env node
// Owner plan docs/PROFIL_TERV_2026-11-15.md, steps 1–2: the 22 characters with a Szellemprofil
// but no routine get drafts for their missing fields, as PROPOSALS (kind hypothesis) for the
// owner to accept in the app. Nothing is accepted here.
//   backup               consistent copy of the live database into <data>/backups
//   export <out.json>    read-only: each character's current values, older text, relations, places
//   propose <drafts.json> [--apply]   dry run by default; --apply posts through the running app's
//                        proposal API (validation + character policy), journal in <data>/backups
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {resolveDataDir} from '../app/server.mjs';

const NAMES=['Albert','Ghor-Ka','Gyuszi','Gábor','Jessi','Jocó bácsi','Kazuto','Kevin','Kristóf','Krisztián','Laci','Matt','Raul - Brazil utazó','Ren','Ricsi','Serge','Tamás','Valentin','Zsolti','Zsombor','Zzap','Ádám'];
// Second batch (owner, 2026-11-15 "Igen, írd meg"): the 13 characters that had no profile at all.
NAMES.push('Csanád','Dávid','Grix','Doyoon','Gunwoo','Matyi','Szilárd','Hajun','Máté','Wonjae','Moon Ihan','Jiwan','Tóni');
const MODEL='Claude (claude-opus-5-5) vázlat a meglévő profilból, 2026-11-15';
const APP=process.env.LU_APP||'http://127.0.0.1:4317';
const [cmd,file]=process.argv.slice(2),apply=process.argv.includes('--apply');
const dataDir=resolveDataDir(),stamp=new Date().toISOString().replace(/[:.]/g,'-'),bdir=path.join(dataDir,'backups');
const filled=v=>v!==undefined&&v!==null&&String(v).trim()!=='';

if(cmd==='backup'){
  const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'),{readOnly:true});await fs.mkdir(bdir,{recursive:true});
  const target=path.join(bdir,`universe-before-profile-fill-${stamp}.sqlite`);
  try{await backup(db,target);}finally{db.close();}
  const check=new DatabaseSync(target,{readOnly:true});const ok=check.prepare('PRAGMA integrity_check').get();const n=check.prepare('SELECT count(*) n FROM characters').get().n;check.close();
  console.log(JSON.stringify({backup:target,integrity:Object.values(ok)[0],characters:n}));
}else if(cmd==='export'){
  const db=new DatabaseSync(path.join(dataDir,'universe.sqlite'),{readOnly:true});
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a);
  const template=JSON.parse(one("SELECT value FROM application_settings WHERE key='ghost:template'")?.value||'null');
  const label=new Map((template?.fields||[]).map(f=>[f.id,f]));
  const canvas=JSON.parse(await fs.readFile(path.join(dataDir,'location-canvas.json'),'utf8')),nodes=canvas.revisions.at(-1).state.nodes.filter(n=>!n.archived);
  const byId=new Map(nodes.map(n=>[n.id,n])),pathOf=n=>{const p=[];for(let x=n;x;x=byId.get(x.parent_id))p.unshift(x.name);return p.join(' › ');};
  const out={places:nodes.filter(n=>(n.source_id||n.location_id)&&n.placed!==false).map(pathOf).sort(),characters:[]};
  for(const name of NAMES){
    const c=one('SELECT id,name,biography,personality,speech_style,sexuality,appearance FROM characters WHERE name=?',name);
    const rec=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+c.id).value);
    const values={};for(const [id,e] of Object.entries(rec.values||{}))if(filled(e?.value)&&!/^sexual_|^anatomy$|^appearance_detail$|^intimacy$/.test(id))values[label.get(id)?.label||id]=e.value;
    const rels=all('SELECT r.source_id,r.target_id,r.description,a.name an,b.name bn FROM relationships r JOIN characters a ON a.id=r.source_id JOIN characters b ON b.id=r.target_id WHERE r.source_id=? OR r.target_id=?',c.id,c.id).map(r=>`${r.an} → ${r.bn}: ${r.description}`);
    out.characters.push({id:c.id,name,legacy:{biography:c.biography,personality:c.personality,speech_style:c.speech_style},values,relationships:rels});
  }
  await fs.writeFile(file,JSON.stringify(out,null,1));console.log(`${out.characters.length} characters, ${out.places.length} places → ${file}`);
}else if(cmd==='propose'){
  const drafts=JSON.parse(await fs.readFile(file,'utf8'));const journal={at:new Date().toISOString(),model:MODEL,apply,results:[]};
  const get=async route=>{const r=await fetch(APP+route);if(!r.ok)throw new Error(route+' '+r.status);return r.json();};
  for(const d of drafts){
    if(!NAMES.includes(d.name))throw new Error('Not in the plan: '+d.name);
    const cur=await get(`/api/characters/${d.id}/ghost`);
    const values={};
    for(const [id,text] of Object.entries(d.values)){
      if(!cur.template.fields.some(f=>f.id===id&&f.type==='text'))throw new Error(d.name+': unknown text field '+id);
      if(filled(cur.values?.[id]?.value)){journal.results.push({name:d.name,skipped:id,reason:'already filled'});continue;}
      values[id]={value:text,interpretation:d.basis?.[id]||'Vázlat: a meglévő profilból kikövetkeztetve, ahol az hallgat, kitalált javaslat (tulajdonosi döntés D1, 2026-11-15).',kind:'hypothesis',source:MODEL,visibility:'creator'};
    }
    if(!Object.keys(values).length){journal.results.push({name:d.name,proposed:0});continue;}
    const body={expected_version:cur.version,template_version:cur.template.version,profile_version:cur.profile_version,values,model:MODEL};
    if(!apply){journal.results.push({name:d.name,would_propose:Object.keys(values)});continue;}
    const r=await fetch(`${APP}/api/characters/${d.id}/ghost/proposals`,{method:'POST',headers:{'Content-Type':'application/json','Origin':APP},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>null);
    journal.results.push({name:d.name,status:r.status,proposal_id:data?.id||null,fields:Object.keys(values),error:r.ok?null:data});
  }
  if(apply){await fs.mkdir(bdir,{recursive:true});await fs.copyFile(file,path.join(bdir,`profile-fill-drafts-${stamp}.json`));const j=path.join(bdir,`profile-fill-journal-${stamp}.json`);await fs.writeFile(j,JSON.stringify(journal,null,1));console.log('journal: '+j);}
  console.log(JSON.stringify(journal.results,null,1));
}else{console.log('Usage: backup | export <out.json> | propose <drafts.json> [--apply]');process.exit(1);}
