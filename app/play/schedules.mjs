// S2 (2026-11-22): weekly schedules. The owner edits a week × day-part grid per character; the
// optional proposal reads only his own Szellemprofil (weekly routine, habits, occupation) and only
// his known places, and is applied only when the owner accepts it. The previous schedule is kept,
// so one step back is always possible. After Generative Agents daily planning (Apache-2.0), cut down
// to "where is he usually" – the world never invents a routine on its own.
import {SLOTS} from '../world-common.mjs';
const KEY='world:schedule:',PREV='world:schedule-prev:',PROP='world:schedule-proposal:';

export function createSchedules({one,run,fail,w,iso=()=>new Date().toISOString()}){
  const read=key=>{try{return JSON.parse(one('SELECT value FROM application_settings WHERE key=?',key)?.value||'null');}catch{return null;}};
  const write=(key,value)=>run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
  const drop=key=>run('DELETE FROM application_settings WHERE key=?',key);
  const person=cid=>{const c=one('SELECT id,name FROM characters WHERE id=?',cid);if(!c)throw fail('A szereplő nem található.',404);
    if(c.id===w.palor()?.id)throw fail('Palort a játékos viszi, neki nincs heti rutinja.',400);return c;};
  const ghostValue=(cid,field)=>{const g=read('ghost:character:'+cid);const v=g?.values?.[field];return String((v&&typeof v==='object'?v.value:v)||'').trim();};
  const places=cid=>{const ids=new Set((w.knownPlaces?.known(cid)||[]).map(p=>p.id));for(const p of w.placesOf(cid))ids.add(p.location_id);
    return [...ids].map(id=>one('SELECT id,name FROM locations WHERE id=?',id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'hu'));};
  // grid: {"<day 0-6>|<slot id>": location_id}; entries with months stay as they are, ahead of the grid.
  function toEntries(grid,keep=[]){
    const groups=new Map();
    for(const [cell,loc] of Object.entries(grid||{})){if(!loc)continue;const [d,slot]=cell.split('|');const day=Number(d);
      if(!Number.isInteger(day)||day<0||day>6||!SLOTS.some(s=>s.id===slot))throw fail('Hibás napirend-cella: '+cell,400);
      if(!one('SELECT 1 FROM locations WHERE id=?',loc))throw fail('A napirend nem létező helyre mutat.',400);
      const k=slot+'|'+loc;if(!groups.has(k))groups.set(k,{days:[],slot,location_id:loc});groups.get(k).days.push(day);}
    return [...keep,...[...groups.values()].map(g=>({...g,days:g.days.sort()}))];
  }
  function toGrid(entries){const grid={};for(const e of (entries||[]).filter(e=>!Array.isArray(e.months)))for(const d of e.days||[]){const k=d+'|'+e.slot;if(!(k in grid))grid[k]=e.location_id;}return grid;}
  function get(cid){const c=person(cid),s=read(KEY+cid),entries=Array.isArray(s?.entries)?s.entries:[];
    return {character:c,slots:SLOTS.map(s=>({id:s.id,label:s.label})),grid:toGrid(entries),seasonal:entries.filter(e=>Array.isArray(e.months)),places:places(cid),
      routine:ghostValue(cid,'weekly_routine'),has_previous:!!read(PREV+cid),proposal:read(PROP+cid)};}
  function save(cid,body,{actor='owner'}={}){person(cid);const cur=read(KEY+cid),keep=(cur?.entries||[]).filter(e=>Array.isArray(e.months));
    const entries=toEntries(body?.grid,keep);if(cur)write(PREV+cid,cur);write(KEY+cid,{entries,updated_at:iso(),actor});return get(cid);}
  function undo(cid){person(cid);const prev=read(PREV+cid);if(!prev)throw fail('Nincs korábbi napirend.',409);write(KEY+cid,prev);drop(PREV+cid);return get(cid);}
  async function propose(cid){
    const c=person(cid),routine=ghostValue(cid,'weekly_routine'),habits=ghostValue(cid,'habits'),job=ghostValue(cid,'occupation'),list=places(cid);
    if(!routine&&!habits&&!job)throw fail('A Szellemprofiljában nincs heti rutin, szokás vagy foglalkozás, amiből javasolni lehetne.',409);
    if(!list.length)throw fail('Nincs ismert helye; előbb kapcsolj hozzá helyeket.',409);
    const sys='Egy szereplő szokásos heti napirendjét javasolod. Csak a megadott szövegekből dolgozz, semmit ne találj ki; ahol a szöveg nem mond semmit, hagyd üresen a cellát. '
      +'Napok: 0 = vasárnap … 6 = szombat. Napszakok: '+SLOTS.map(s=>s.id).join(', ')+'. Csak a felsorolt helyek nevét használhatod. '
      +'Csak JSON: {"cells":[{"day":1,"slot":"delutan","place":"pontos helynév","why":"melyik mondatból"}]}';
    const user=[`SZEREPLŐ: ${c.name}`,routine&&'HETI RUTIN:\n'+routine,habits&&'SZOKÁSOK:\n'+habits,job&&'FOGLALKOZÁS:\n'+job,'ISMERT HELYEI: '+list.map(p=>p.name).join(', ')].filter(Boolean).join('\n\n');
    const out=await w.ask(sys,user,1200,{purpose:'world'}),byName=new Map(list.map(p=>[p.name.toLocaleLowerCase('hu').trim(),p.id])),grid={},why={};
    for(const x of Array.isArray(out?.cells)?out.cells.slice(0,28):[]){const d=Number(x?.day),loc=byName.get(String(x?.place||'').toLocaleLowerCase('hu').trim());
      if(!Number.isInteger(d)||d<0||d>6||!SLOTS.some(s=>s.id===x?.slot)||!loc)continue;grid[d+'|'+x.slot]=loc;why[d+'|'+x.slot]=String(x.why||'').slice(0,200);}
    if(!Object.keys(grid).length)throw fail('A javaslatból nem maradt használható cella.',502);
    write(PROP+cid,{grid,why,created_at:iso()});return get(cid);
  }
  function decide(cid,accept){person(cid);const p=read(PROP+cid);if(!p)throw fail('Nincs függő javaslat.',409);drop(PROP+cid);
    return accept?save(cid,{grid:p.grid},{actor:'proposal-accepted'}):get(cid);}
  return {get,save,undo,propose,decide,toEntries,toGrid};
}
