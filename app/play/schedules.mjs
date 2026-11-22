// S2 (2026-11-22): weekly schedules. The owner edits a week × day-part grid per character; the
// optional proposal reads only his own Szellemprofil (weekly routine, habits, occupation) and only
// his known places, and is applied only when the owner accepts it. The previous schedule is kept,
// so one step back is always possible. After Generative Agents daily planning (Apache-2.0), cut down
// to "where is he usually" – the world never invents a routine on its own.
import {SLOTS} from '../world-common.mjs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
// Routine batches written outside the app (2026-11-22) live in <project>/30_IMPORTS/rutin-*/.
const IMPORTS=new URL('../../30_IMPORTS/',import.meta.url);
const KEY='world:schedule:',PREV='world:schedule-prev:',PROP='world:schedule-proposal:';
// Owner 2026-11-22: a cell may also say what he does there (activity) and who may know about it
// (privacy): public – anyone; private – only those close to him (level ≥ 2 with Palor); secret –
// only he knows. Palor can catch him at a private or secret one (see play-mode discoveries).
export const PRIVACY=['public','private','secret'];
const cleanText=(v,max)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export function cellOf(v){
  if(!v)return null;
  if(typeof v==='string')return {location_id:v,activity:'',privacy:'public'};
  if(typeof v!=='object'||typeof v.location_id!=='string'||!v.location_id)return null;
  return {location_id:v.location_id,activity:cleanText(v.activity,200),privacy:PRIVACY.includes(v.privacy)?v.privacy:'public'};
}

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
    for(const [cell,raw] of Object.entries(grid||{})){const c=cellOf(raw);if(!c)continue;const loc=c.location_id;const [d,slot]=cell.split('|');const day=Number(d);
      if(!Number.isInteger(day)||day<0||day>6||!SLOTS.some(s=>s.id===slot))throw fail('Hibás napirend-cella: '+cell,400);
      if(!one('SELECT 1 FROM locations WHERE id=?',loc))throw fail('A napirend nem létező helyre mutat.',400);
      const k=[slot,loc,c.activity,c.privacy].join('|');if(!groups.has(k))groups.set(k,{days:[],slot,location_id:loc,...(c.activity?{activity:c.activity}:{}),...(c.privacy!=='public'?{privacy:c.privacy}:{})});groups.get(k).days.push(day);}
    return [...keep,...[...groups.values()].map(g=>({...g,days:g.days.sort()}))];
  }
  function toGrid(entries){const grid={};for(const e of (entries||[]).filter(e=>!Array.isArray(e.months)))for(const d of e.days||[]){const k=d+'|'+e.slot;if(!(k in grid))grid[k]=cellOf(e);}return grid;}
  function entryAt(cid,day,slotId,weekday,month){const s=read(KEY+cid);if(!Array.isArray(s?.entries))return null;
    return s.entries.find(e=>e.slot===slotId&&Array.isArray(e.days)&&e.days.includes(weekday)&&(!Array.isArray(e.months)||e.months.includes(month)))||null;}
  function get(cid){const c=person(cid),s=read(KEY+cid),entries=Array.isArray(s?.entries)?s.entries:[];
    return {character:c,slots:SLOTS.map(s=>({id:s.id,label:s.label})),grid:toGrid(entries),seasonal:entries.filter(e=>Array.isArray(e.months)),places:places(cid),
      routine:ghostValue(cid,'weekly_routine'),has_previous:!!read(PREV+cid),proposal:read(PROP+cid)};}
  function save(cid,body,{actor='owner'}={}){person(cid);const cur=read(KEY+cid),keep=(cur?.entries||[]).filter(e=>Array.isArray(e.months));
    const entries=toEntries(body?.grid,keep);if(cur)write(PREV+cid,cur);write(KEY+cid,{entries,updated_at:iso(),actor});return get(cid);}
  function undo(cid){person(cid);const prev=read(PREV+cid);if(!prev)throw fail('Nincs korábbi napirend.',409);write(KEY+cid,prev);drop(PREV+cid);return get(cid);}
  async function propose(cid){
    const c=person(cid),routine=ghostValue(cid,'weekly_routine'),habits=ghostValue(cid,'habits'),job=ghostValue(cid,'occupation'),list=places(cid);
    const intimate=['sexuality','intimacy','attraction','presented_sexuality','secrets'].map(f=>[f,ghostValue(cid,f)]).filter(x=>x[1]);
    if(!routine&&!habits&&!job)throw fail('A Szellemprofiljában nincs heti rutin, szokás vagy foglalkozás, amiből javasolni lehetne.',409);
    if(!list.length)throw fail('Nincs ismert helye; előbb kapcsolj hozzá helyeket.',409);
    const sys='Egy szereplő szokásos heti napirendjét javasolod. Csak a megadott szövegekből dolgozz, semmit ne találj ki; ahol a szöveg nem mond semmit, hagyd üresen a cellát. '
      +'Napok: 0 = vasárnap … 6 = szombat. Napszakok: '+SLOTS.map(s=>s.id).join(', ')+'. Csak a felsorolt helyek nevét használhatod. '
      +'Felnőtt játék, mindenki felnőtt férfi: a szexualitásból, intimitásból és titkokból fakadó szokások (ismerkedés, alkalmi kalandok, rejtett viszony, szauna, klub) is a rutin részei lehetnek, ha a szöveg alátámasztja. '
      +'Minden cellához: activity = mit csinál ott, egy rövid mondat; privacy = public (bárki tudhatja), private (csak a hozzá közel állók tudják), secret (csak ő tudja). '
      +'Csak JSON: {"cells":[{"day":1,"slot":"delutan","place":"pontos helynév","activity":"","privacy":"public","why":"melyik mondatból"}]}';
    const LABEL={sexuality:'SZEXUALITÁS ÉS INTIMITÁS',intimacy:'INTIMITÁSHOZ VALÓ HOZZÁÁLLÁS',attraction:'MEGÉLT VONZALMAK',presented_sexuality:'MÁSOK FELÉ MUTATOTT ÖNKÉP',secrets:'TITKAI'};
    const user=[`SZEREPLŐ: ${c.name}`,routine&&'HETI RUTIN:\n'+routine,habits&&'SZOKÁSOK:\n'+habits,job&&'FOGLALKOZÁS:\n'+job,...intimate.map(([f,v])=>LABEL[f]+':\n'+v.slice(0,2500)),'ISMERT HELYEI: '+list.map(p=>p.name).join(', ')].filter(Boolean).join('\n\n');
    const out=await w.ask(sys,user,1200,{purpose:'world'}),byName=new Map(list.map(p=>[p.name.toLocaleLowerCase('hu').trim(),p.id])),grid={},why={};
    for(const x of Array.isArray(out?.cells)?out.cells.slice(0,28):[]){const d=Number(x?.day),loc=byName.get(String(x?.place||'').toLocaleLowerCase('hu').trim());
      if(!Number.isInteger(d)||d<0||d>6||!SLOTS.some(s=>s.id===x?.slot)||!loc)continue;grid[d+'|'+x.slot]=cellOf({location_id:loc,activity:x.activity,privacy:x.privacy});why[d+'|'+x.slot]=String(x.why||'').slice(0,200);}
    if(!Object.keys(grid).length)throw fail('A javaslatból nem maradt használható cella.',502);
    write(PROP+cid,{grid,why,created_at:iso()});return get(cid);
  }
  // A proposal from outside the app (owner-run assistant): only his known places, never applied here.
  function storeProposal(cid,body,{source='external'}={}){
    person(cid);const known=new Set(places(cid).map(p=>p.id)),grid={},why={};
    for(const [k,raw] of Object.entries(body?.grid||{})){const c=cellOf(raw);const [d,slot]=k.split('|');
      if(!c||!known.has(c.location_id)||!/^[0-6]$/.test(d)||!SLOTS.some(s=>s.id===slot))continue;grid[k]=c;if(body.why?.[k])why[k]=cleanText(body.why[k],200);}
    if(!Object.keys(grid).length)throw fail('A javaslatból nem maradt használható cella.',400);
    write(PROP+cid,{grid,why,source:cleanText(source,60),created_at:iso()});return get(cid);
  }
  // A batch file: {links:[{character_id,location_id,role,note}], people:[{character_id,grid,why}]}.
  // Links are added as suggested place links first (so the places become his), then every grid is
  // stored as a proposal for the owner – nothing goes live here.
  function importFile(file){
    if(typeof file!=='string'||!/^rutin-[\w-]+\/javaslat-[\w-]+\.json$/.test(file))throw fail('Csak 30_IMPORTS/rutin-…/javaslat-….json tölthető be.',400);
    let data;try{data=JSON.parse(readFileSync(new URL(file,IMPORTS),'utf8'));}catch(e){throw fail('A fájl nem olvasható vagy nem érvényes JSON: '+e.message,400);}
    const result={links:0,stored:[],failed:[]};
    for(const l of Array.isArray(data?.links)?data.links:[]){
      if(!one('SELECT 1 FROM characters WHERE id=?',l?.character_id)||!one('SELECT 1 FROM locations WHERE id=?',l?.location_id)||!['routine','other','work','home'].includes(l?.role)){result.failed.push({link:l,error:'hibás helykapcsolat'});continue;}
      result.links+=Number(run('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?)',randomUUID(),l.character_id,l.location_id,l.role,cleanText(l.note,300),'suggested',iso()).changes);}
    for(const p of Array.isArray(data?.people)?data.people:[]){
      try{const r=storeProposal(p.character_id,p,{source:'rutin-import '+file});result.stored.push({id:p.character_id,name:r.character.name,cells:Object.keys(r.proposal.grid).length,given:Object.keys(p.grid||{}).length});}
      catch(e){result.failed.push({id:p?.character_id,name:p?.name,error:e.message});}}
    return result;
  }
  function decide(cid,accept){person(cid);const p=read(PROP+cid);if(!p)throw fail('Nincs függő javaslat.',409);drop(PROP+cid);
    return accept?save(cid,{grid:p.grid},{actor:'proposal-accepted'}):get(cid);}
  return {get,save,undo,propose,storeProposal,importFile,decide,toEntries,toGrid,entryAt};
}
