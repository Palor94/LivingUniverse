// N1 (2026-11-22): hidden conditional events. The owner writes a short brief and a condition tree;
// when the conditions hold, the event opens in the next scene with a character it names (at most
// one per day part) and that character gets the brief – a sketch, not finished prose. No model call
// decides anything here (Covel story-events conditions/select, MIT, rewritten). The optional AI
// planner only writes 'proposed' drafts and is off unless the owner turns it on.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const LEAVES=['day_gte','day_lte','weekday_in','slot_in','level','thread','revealed','with'];
const dayNo=d=>Math.round(Date.parse(d+'T00:00:00Z')/864e5);

// Validates the tree's shape; returns a Hungarian problem or null.
export function conditionProblem(node,depth=0){
  if(depth>8)return 'A feltétel túl mélyen egymásba ágyazott.';
  if(!node||typeof node!=='object'||Array.isArray(node))return 'A feltétel csak objektum lehet.';
  if(Array.isArray(node.all)||Array.isArray(node.any)){const list=node.all||node.any;if(!list.length)return 'Az „all”/„any” lista nem lehet üres.';for(const x of list){const p=conditionProblem(x,depth+1);if(p)return p;}return null;}
  if(Object.hasOwn(node,'not'))return conditionProblem(node.not,depth+1);
  const keys=Object.keys(node).filter(k=>LEAVES.includes(k));
  if(keys.length!==1)return 'Egy feltétellevél pontosan egyet tartalmaz ezekből: '+LEAVES.join(', ')+'.';
  return null;
}

// state: {day, weekday, slot, slotIndex, slots, partner, levelOf(cid), threadStatus(id), revealed(eventId)→{day,slotIndex}|null}
// Returns true/false, or null when a leaf cannot be judged (stays undecided through `not`).
export function evaluate(node,state,issues=[]){
  const visit=n=>{
    if(!n||typeof n!=='object'||Array.isArray(n)){issues.push('hibás feltétel');return null;}
    if(Array.isArray(n.all)){const r=n.all.map(visit);return r.includes(false)?false:r.includes(null)?null:true;}
    if(Array.isArray(n.any)){const r=n.any.map(visit);return r.includes(true)?true:r.includes(null)?null:false;}
    if(Object.hasOwn(n,'not')){const r=visit(n.not);return r===null?null:!r;}
    if(typeof n.day_gte==='string')return state.day>=n.day_gte;
    if(typeof n.day_lte==='string')return state.day<=n.day_lte;
    if(Array.isArray(n.weekday_in))return n.weekday_in.includes(state.weekday);
    if(Array.isArray(n.slot_in))return n.slot_in.includes(state.slot);
    if(typeof n.with==='string')return state.partner===n.with;
    if(typeof n.level==='string'){const l=state.levelOf(n.level);if(l===null||l===undefined){issues.push('ismeretlen szint: '+n.level);return null;}
      if(Number.isInteger(n.gte)&&l<n.gte)return false;if(Number.isInteger(n.lte)&&l>n.lte)return false;return true;}
    if(typeof n.thread==='string'){const s=state.threadStatus(n.thread);if(!s){issues.push('ismeretlen szál: '+n.thread);return null;}return Array.isArray(n.in)?n.in.includes(s):s===(n.status||'kept');}
    if(typeof n.revealed==='string'){const r=state.revealed(n.revealed);if(!r)return false;
      const since=(dayNo(state.day)-dayNo(r.day))*state.slots.length+(state.slotIndex-r.slotIndex);
      return !(Number.isInteger(n.slots_since_gte)&&since<n.slots_since_gte);}
    issues.push('ismeretlen feltétellevél');return null;
  };
  return visit(node);
}

export function installHiddenEvents({db,one,all,run,now=()=>new Date(),slots,levelOf,palorId}){
  db.exec(readFileSync(new URL('./migrations/037-hidden-events.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  const parse=(s,d)=>{try{return JSON.parse(s);}catch{return d;}};
  const shape=r=>r&&({id:r.id,title:r.title,brief:r.brief,condition:parse(r.condition_json,{}),character_ids:parse(r.character_ids_json,[]),priority:r.priority,status:r.status,actor:r.actor,created_at:r.created_at,updated_at:r.updated_at,
    revealed:one('SELECT world_day,slot,character_id FROM hidden_event_reveals WHERE event_id=? AND rewound_at IS NULL ORDER BY created_at LIMIT 1',r.id)||null});
  const list=()=>all('SELECT * FROM hidden_events ORDER BY created_at').map(shape);
  const slotIndex=id=>slots.findIndex(s=>s.id===id);
  function check(body){
    const title=String(body?.title||'').trim(),brief=String(body?.brief||'').trim();
    if(!title||title.length>120)throw Object.assign(new Error('A cím 1–120 karakter legyen.'),{status:400});
    if(!brief||brief.length>1200)throw Object.assign(new Error('A vázlat 1–1200 karakter legyen.'),{status:400});
    const p=conditionProblem(body?.condition);if(p)throw Object.assign(new Error(p),{status:400});
    const ids=Array.isArray(body?.character_ids)?body.character_ids.map(String).slice(0,6):[];
    for(const id of ids){if(id===palorId?.())throw Object.assign(new Error('Palort a játékos viszi, neki nem adható rejtett esemény.'),{status:400});
      if(!one('SELECT 1 FROM characters WHERE id=?',id))throw Object.assign(new Error('Ismeretlen szereplő.'),{status:400});}
    return {title,brief,condition:body.condition,ids,priority:Number.isInteger(body?.priority)?Math.max(-10,Math.min(10,body.priority)):0};
  }
  function create(body,{actor='owner',status='draft'}={}){
    const x=check(body),id=randomUUID(),t=iso();
    run('INSERT INTO hidden_events VALUES(?,?,?,?,?,?,?,?,?,?)',id,x.title,x.brief,JSON.stringify(x.condition),JSON.stringify(x.ids),x.priority,status,actor,t,t);
    return shape(one('SELECT * FROM hidden_events WHERE id=?',id));
  }
  function setStatus(id,status){
    const r=one('SELECT * FROM hidden_events WHERE id=?',id);if(!r)throw Object.assign(new Error('A rejtett esemény nem található.'),{status:404});
    run('UPDATE hidden_events SET status=?,updated_at=? WHERE id=?',status,iso(),id);return shape(one('SELECT * FROM hidden_events WHERE id=?',id));
  }
  const revealedRec=id=>{const r=one('SELECT world_day,slot FROM hidden_event_reveals WHERE event_id=? AND rewound_at IS NULL ORDER BY created_at LIMIT 1',id);return r?{day:r.world_day,slotIndex:slotIndex(r.slot)}:null;};
  // The event open for this character in this day part; opens one when none opened yet this part.
  function openFor(cid,{day,weekday,slot},{open=true}={}){
    const current=one('SELECT r.*,e.title,e.brief,e.character_ids_json FROM hidden_event_reveals r JOIN hidden_events e ON e.id=r.event_id WHERE r.world_day=? AND r.slot=? AND r.rewound_at IS NULL ORDER BY r.created_at LIMIT 1',day,slot);
    if(current)return current.character_id===cid?{id:current.event_id,title:current.title,brief:current.brief}:null;
    const state={day,weekday,slot,slotIndex:slotIndex(slot),slots,partner:cid,levelOf:id=>one('SELECT 1 FROM characters WHERE id=?',id)?(levelOf(id,palorId?.())??0):null,
      threadStatus:id=>one('SELECT status FROM world_threads WHERE id=? AND rewound_at IS NULL',id)?.status||null,revealed:revealedRec};
    const candidates=all("SELECT * FROM hidden_events WHERE status='approved' ORDER BY priority DESC,id")
      .filter(e=>!revealedRec(e.id)).filter(e=>{const ids=parse(e.character_ids_json,[]);return !ids.length||ids.includes(cid);})
      .filter(e=>evaluate(parse(e.condition_json,{}),state)===true);
    const e=candidates[0];if(!e||!open)return e?{id:e.id,title:e.title,brief:e.brief}:null;
    run('INSERT INTO hidden_event_reveals VALUES(?,?,?,?,?,?,NULL)',randomUUID(),e.id,day,slot,cid,iso());
    return {id:e.id,title:e.title,brief:e.brief};
  }
  // Already open for him in this day part (the narrator uses this; it never opens one).
  function currentFor(cid,{day,slot}){const r=one('SELECT e.id,e.title,e.brief FROM hidden_event_reveals r JOIN hidden_events e ON e.id=r.event_id WHERE r.world_day=? AND r.slot=? AND r.character_id=? AND r.rewound_at IS NULL LIMIT 1',day,slot,cid);return r||null;}
  function promptLine(ev){return ev?'MOST TÖRTÉNIK VELED (rejtett fordulat, csak vázlat: a saját szavaiddal, a természeted szerint hozd elő ebben a beszélgetésben, fokozatosan, ne egyszerre mindent; ne mondd, hogy ez egy esemény):\n'+ev.brief:'';}
  function rewindAfter(time,at){const ids=all('SELECT id FROM hidden_event_reveals WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id);
    for(const id of ids)run('UPDATE hidden_event_reveals SET rewound_at=? WHERE id=?',at,id);return ids;}
  function undoRewind(ids=[]){for(const id of ids)run('UPDATE hidden_event_reveals SET rewound_at=NULL WHERE id=?',id);}
  return {list,create,setStatus,openFor,currentFor,promptLine,rewindAfter,undoRewind,evaluate};
}
