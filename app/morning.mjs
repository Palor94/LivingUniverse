// The morning step (S3, 2026-11-22). Once a world day, before its first round, ONE call looks at
// the few characters who have something going on – an important memory since yesterday (importance
// ≥3) or a plan due today – and gives each (1) how he woke up (inner state, from his previous
// state and those memories) and (2) only where today a due plan takes him somewhere else than
// usual, at one of the places he knows. Nothing is invented: no plan without a due reason.
// After Generative Agents revise_identity and daily planning (Apache-2.0), cut down to what is due.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {clip,SLOTS} from './world-common.mjs';
export const MAX_PEOPLE=6;

export function installMorning({db,one,all,run,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/036-day-plans.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  const doneKey=day=>'world:morning:'+day;
  const done=day=>!!one('SELECT 1 FROM application_settings WHERE key=?',doneKey(day));
  const planFor=(cid,day,slot)=>one('SELECT location_id,reason FROM day_plans WHERE character_id=? AND world_day=? AND slot=? AND rewound_at IS NULL ORDER BY created_at DESC LIMIT 1',cid,day,slot)||null;
  // Who has something going on: important memories in the last day, or an open plan due today.
  function due(cast,day){
    const since=new Date(now().getTime()-86400000).toISOString();
    const hasSal=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_salience'");
    return cast.map(c=>{
      const mems=hasSal?all("SELECT m.text FROM character_memories m JOIN memory_salience s ON s.memory_id=m.id WHERE m.character_id=? AND m.status='approved' AND s.importance>=3 AND m.created_at>=? ORDER BY m.rowid DESC LIMIT 4",c.id,since).map(r=>r.text):[];
      const threads=all("SELECT promised_by,text FROM world_threads WHERE character_id=? AND status='open' AND due_day=? AND rewound_at IS NULL LIMIT 3",c.id,day);
      return {c,mems,threads};}).filter(x=>x.mems.length||x.threads.length).slice(0,MAX_PEOPLE);
  }
  function prompt(list,day,{inner,places}){
    const system=`Egy élő világ reggeli áttekintését írod (${day}). Minden felsorolt szereplőnél: (1) "inner": hogyan ébredt, a korábbi belső állapota és a friss emlékei alapján, az ő szemszögéből {"mood":"1-3 szó","intensity":0-3,"reason":"egy mondat","concerns":["legfeljebb 3"],"wants_from_palor":"","palor_view":""}; (2) "plan": CSAK ha egy mára esedékes terv miatt egy napszakban máshol lesz, mint szokott: [{"slot":"${SLOTS.map(s=>s.id).join('|')}","place":"<az ISMERT HELYEI közül pontos névvel>","reason":"egy rövid mondat"}], különben üres lista. Ne találj ki új tényt, új helyet vagy új tervet. Csak JSON: {"people":[{"name":"...","inner":{},"plan":[]}]}`;
    const user=list.map(({c,mems,threads})=>[`## ${c.name}`,inner?.summaryContext(c.id)||'KORÁBBI BELSŐ ÁLLAPOTA: nincs adat',
      mems.length?'FRISS FONTOS EMLÉKEI:\n'+mems.map(m=>'- '+clip(m,240)).join('\n'):'',threads.length?'MÁRA ESEDÉKES TERVEK:\n'+threads.map(t=>`- ${t.promised_by==='palor'?'Palor ígérte':'ő ígérte'}: ${clip(t.text,200)}`).join('\n'):'',
      'ISMERT HELYEI: '+(places?.known(c.id).map(l=>l.name).join(', ')||'nincs')].filter(Boolean).join('\n')).join('\n\n');
    return {system,user,maxTokens:300+250*list.length};
  }
  // ask: the world engine's capped call. Marks the day done even when the answer is unusable
  // (a billed call is never repeated automatically).
  async function runFor(day,cast,{ask,inner,places}){
    if(done(day))return {skipped:true};
    const list=due(cast,day);
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',doneKey(day),JSON.stringify({at:iso(),people:list.length}));
    if(!list.length)return {people:0,plans:0};
    const p=prompt(list,day,{inner,places});let out=null;
    try{out=await ask(p.system,p.user,p.maxTokens);}catch(e){if(e.code==='CAP_REACHED')throw e;console.error('Morning step failed: '+e.message);return {people:0,plans:0,failed:true};}
    let plans=0,updated=0;
    for(const x of Array.isArray(out?.people)?out.people:[]){
      const hit=list.find(l=>l.c.name.toLocaleLowerCase('hu')===String(x?.name||'').trim().toLocaleLowerCase('hu'));if(!hit)continue;
      if(inner&&inner.record(hit.c.id,x.inner,{day}))updated++;
      const knownIds=new Map((places?.known(hit.c.id)||[]).map(l=>[l.name.toLocaleLowerCase('hu'),l.id]));
      for(const e of (Array.isArray(x.plan)?x.plan:[]).slice(0,3)){
        const loc=knownIds.get(String(e?.place||'').trim().toLocaleLowerCase('hu'));if(!loc||!SLOTS.some(s=>s.id===e.slot))continue;
        run('INSERT INTO day_plans VALUES(?,?,?,?,?,?,?,NULL)',randomUUID(),hit.c.id,day,e.slot,loc,clip(e.reason,200)||'napi terv',iso());plans++;}
    }
    return {people:list.length,updated,plans};
  }
  function rewindAfter(time,at){const ids=all('SELECT id FROM day_plans WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id);for(const id of ids)run('UPDATE day_plans SET rewound_at=? WHERE id=?',at,id);return ids;}
  function undoRewind(ids=[]){for(const id of ids)run('UPDATE day_plans SET rewound_at=NULL WHERE id=?',id);}
  return {due,runFor,planFor,done,rewindAfter,undoRewind};
}
