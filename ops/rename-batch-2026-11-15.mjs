#!/usr/bin/env node
// Owner request (2026-11-15): give the two unnamed figures proper names (the goblin from the goblin
// name pool, app/character-names.mjs) and replace names that match real people with other fictional
// names from the same culture. Uses the app's complete rename (docs/COMPLETE_CHARACTER_RENAME.md):
// each rename is backed up and journaled by the app itself; IDs, media and links stay.
//   preview (default): prepares each plan and prints its hits by classification (nothing saved)
//   --apply: approves the clear hits (linked/required), like "Összes egyértelmű kijelölése"
import {randomUUID} from 'node:crypto';
const APP=process.env.LU_APP||'http://127.0.0.1:4317',apply=process.argv.includes('--apply');
const RENAMES=[
  ['a0d725ed-febb-49c1-b002-d5da3673c350','Metro kopasz srác','Szilárd'],
  ['8ca55d78-7c17-4246-85b2-d16a29154309','Goblin harcos','Grix'],
  ['32256b5e-3a4a-44dd-b234-89a32e0e33c2','Hyunjin','Doyoon'],
  ['bd4bbcb3-6217-4b9a-b269-6df6659f3d3a','Jinu','Gunwoo'],
  ['81199410-1202-4886-848e-12f4e6f7c419','Mingi','Hajun'],
  ['c9a5bbb9-3499-4590-9d18-dc21d383c75d','Namjoon','Wonjae'],
  ['917a2a54-e741-4222-8c6e-43de61673c0c','Seo Kang Joon','Moon Ihan'],
  ['fc62d28f-1506-4d37-9796-b0c90ea5f227','Soobin','Jiwan']
];
const {csrf}=await (await fetch(APP+'/api/character-renames')).json();
const H={'Content-Type':'application/json','Origin':APP,'X-LU-Rename-CSRF':csrf,'X-LU-CSRF':csrf};
const put=async(p,body)=>{const r=await fetch(APP+p,{method:'PUT',headers:H,body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(p+': '+(d.error||r.status));return d;};
// ONLY=<old name> limits the run to one entry (e.g. after an interrupted batch).
for(const [id,from,to] of RENAMES.filter(r=>!process.env.ONLY||r[1]===process.env.ONLY)){
  const plan=await put('/api/character-renames',{request_key:'owner-rename-2026-11-15-'+(apply?'apply-':'preview-')+id.slice(0,8)+'-'+to.replace(/\W/g,''),character_id:id,new_name:to});
  let items=[],off=0;do{const page=await (await fetch(`${APP}/api/character-renames/${plan.plan_id}?offset=${off}`)).json();items.push(...page.items);off=page.next_offset;}while(off!==null&&off!==undefined);
  const by={};for(const h of items)(by[h.classification]??=[]).push(h);
  console.log(`\n${from} → ${to}: ${items.length} hits `+Object.entries(by).map(([k,v])=>k+' '+v.length).join(', ')+` | folder: ${plan.folder?.source||'(new)'} → ${plan.folder?.destination}`);
  for(const h of items.filter(h=>!['linked','required'].includes(h.classification)))console.log(`   [${h.classification}] ${h.table}.${h.field}: ${String(h.before).slice(0,140)}`);
  if(!apply){await put(`/api/character-renames/${plan.plan_id}/decision`,{plan_hash:plan.plan_hash,decision:'reject'}).catch(()=>{});continue;}
  // A catalogue location named exactly the old name follows the rename (owner rule: everything is renamed).
  const confirmed_ids=items.filter(h=>h.editable&&h.classification==='uncertain'&&h.table==='locations'&&h.field==='name'&&h.before===from).map(h=>h.id);
  const selected_ids=[...items.filter(h=>h.editable&&['linked','required'].includes(h.classification)).map(h=>h.id),...confirmed_ids];
  const done=await put(`/api/character-renames/${plan.plan_id}/decision`,{plan_hash:plan.plan_hash,decision:'approve',selected_ids,confirmed_ids});
  console.log(`   saved: ${done.old_name} → ${done.new_name}${done.result?.game?.skipped?.length?' | skipped (name taken): '+done.result.game.skipped.map(s=>s.from).join(', '):''}${done.result?.game?.error?' | file error: '+done.result.game.error:''}`);
}
