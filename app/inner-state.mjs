// Inner state (E2, 2026-11-21): what a character feels, what occupies him and what he wants
// from Palor, carried from one conversation to the next. Written at a save point from his own
// point of view (the existing summary call, no extra request). Patterns: Generative Agents
// scratch "currently" and the nightly revise_identity status (Apache-2.0, Park et al.); AI Town
// conversation summaries from the participant's own perspective (MIT); Covel memory "blocks"
// (present state, rewritten) beside "facts" (appended) (MIT). Rewritten for this project.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {clip} from './world-common.mjs';

export const MAX_CONCERNS=3,CONCERN_DAYS=21;
const LEVEL=['alig','kissé','eléggé','nagyon'];
const dayNumber=d=>Math.floor(Date.parse(String(d)+'T00:00:00Z')/86400000);

// How fast his mood fades (half-life in world days): calm people let go quickly, people whose
// mood swings or who are easily shaken carry it longer. Unknown scales → 2 days.
export function halfLife(profile){
  const v=id=>{const x=profile?.values?.[id]?.value;return Number.isFinite(x)?x:null;};
  const stability=v('emotional_stability'),react=v('mood_reactivity');
  if(stability===null&&react===null)return 2;
  let h=2;if(stability!==null)h+=(5-stability)*0.3;if(react!==null)h+=(react-5)*0.2;
  return Math.max(0.75,Math.min(5,h));
}
export function effectiveIntensity(state,today,profile){
  if(!state)return 0;const days=Math.max(0,dayNumber(today)-dayNumber(state.world_day));
  return state.intensity*Math.pow(0.5,days/halfLife(profile));
}

// The model's "inner" answer → a clean row, or null when there is nothing usable.
export function cleanInner(x){
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  const mood=clip(String(x.mood||'').replace(/\s+/g,' ').trim(),60),reason=clip(String(x.reason||'').trim(),300);
  const intensity=Math.max(0,Math.min(3,Math.round(Number(x.intensity)||0)));
  const concerns=(Array.isArray(x.concerns)?x.concerns:[]).map(c=>clip(String(c||'').trim(),200)).filter(Boolean).slice(0,MAX_CONCERNS);
  const wants=clip(String(x.wants_from_palor||'').trim(),300);
  if(!mood&&!concerns.length&&!wants)return null;
  return {mood:mood||'kiegyensúlyozott',intensity:mood?intensity:0,reason,concerns,wants_from_palor:wants};
}

// Instruction for the save-point summary: the field the model fills, from his point of view.
export function innerInstruction(name){
  return `"inner": ${name} belső állapota a beszélgetés UTÁN, az ő szemszögéből (a profilja, a korábbi állapota és ez a beszélgetés alapján; ne találj ki új tényt): {"mood":"1-3 szó (pl. megbántott, felvillanyozott, nyugtalan)","intensity":0-3,"reason":"egy mondat: miért","concerns":["ami most foglalkoztatja az életében, legfeljebb 3; a korábbiakat vidd tovább, ha még igazak, ami megoldódott, maradjon el"],"wants_from_palor":"mit szeretne most Palortól (lehet üres)"}.`;
}

export function installInnerState({db,one,all,run,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/033-inner-state.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  const row2state=r=>r?{...r,concerns:JSON.parse(r.concerns_json||'[]')}:null;
  const current=cid=>row2state(one('SELECT * FROM character_inner_states WHERE character_id=? AND rewound_at IS NULL ORDER BY created_at DESC,rowid DESC LIMIT 1',cid));
  function record(cid,inner,{day,eventId=null,conversationId=null}={}){
    const s=cleanInner(inner);if(!s||!day)return null;const id=randomUUID();
    run('INSERT INTO character_inner_states VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)',id,cid,s.mood,s.intensity,s.reason,JSON.stringify(s.concerns),s.wants_from_palor,day,eventId,conversationId,iso());
    return {id,...s};
  }
  // For the summary call: his previous state, so concerns carry over.
  function summaryContext(cid){
    const s=current(cid);if(!s)return '';
    return `KORÁBBI BELSŐ ÁLLAPOTA (${s.world_day}): ${s.mood}${s.reason?' – '+s.reason:''}`+(s.concerns.length?`; foglalkoztatja: ${s.concerns.join('; ')}`:'')+(s.wants_from_palor?`; Palortól: ${s.wants_from_palor}`:'');
  }
  // Prompt lines for his own conversation (second person). Faded mood is said to be faded.
  function promptLines(cid,today,profile,{person='te'}={}){
    const s=current(cid);if(!s)return [];
    const you=person==='te',out=[],e=effectiveIntensity(s,today,profile),fresh=s.world_day===today;
    if(e>=0.5)out.push(`${you?'HANGULATOD':'HANGULATA'}: ${LEVEL[Math.min(3,Math.round(e))]} ${s.mood}${s.reason?` (${s.reason})`:''}${fresh?'':' – ez még benne van, de már halványul'}.`);
    else if(s.intensity>0)out.push(`${you?'HANGULATOD':'HANGULATA'}: a korábbi ${s.mood} hangulat${you?'od':'a'} már elmúlt, kiegyensúlyozott${you?' vagy':''}.`);
    const days=dayNumber(today)-dayNumber(s.world_day);
    if(s.concerns.length&&days<=CONCERN_DAYS)out.push(`${you?'AMI MOST FOGLALKOZTAT':'AMI MOST FOGLALKOZTATJA'} (a saját életed${you?'':'ében'}; szóba hozhat${you?'od':'ja'}, ha illik, vagy épp kerül${you?'öd':'i'} – a természete${you?'d':''} szerint):\n`+s.concerns.map(c=>'- '+c).join('\n'));
    if(s.wants_from_palor&&days<=CONCERN_DAYS)out.push(`${you?'AMIT PALORTÓL SZERETNÉL':'AMIT PALORTÓL SZERETNE'}: ${s.wants_from_palor} (nem biztos, hogy kimond${you?'od':'ja'}; a természete${you?'d':''} dönt).`);
    return out;
  }
  function rewindAfter(time,at){
    const ids=all('SELECT id FROM character_inner_states WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id);
    for(const id of ids)run('UPDATE character_inner_states SET rewound_at=? WHERE id=?',at,id);return ids;
  }
  function undoRewind(ids=[]){for(const id of ids)run('UPDATE character_inner_states SET rewound_at=NULL WHERE id=?',id);}
  const history=(cid,limit=20)=>all('SELECT * FROM character_inner_states WHERE character_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?',cid,limit).map(row2state);
  return {current,record,summaryContext,promptLines,rewindAfter,undoRewind,history};
}
