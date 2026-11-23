// Prompt texts and answer validation for the world engine. Pure functions: no database,
// no network. Keeping them here makes the engine readable and the rules testable.
import {LEVELS,clip,pairKey} from './world-common.mjs';
import {WORLD_EXPERIENCE_INSTRUCTION} from './social-experiences.mjs';

// Anything sounding like a death is never applied automatically: it becomes a proposal.
const DEATH=/(meghal|halál|halott|megöl|gyilkol|gyilkos|öngyilk|elhuny)/iu;
const MAX_EVENTS_PER_ROUND=8;

export const LEVELS_SYSTEM='Kapcsolati jegyzetekből becsülsz kezdő közelségi szintet. Skála: -2 ellenséges, -1 feszült, 0 idegen, 1 ismerős, 2 barátságos, 3 barát, 4 bizalmas, 5 szerető. A szint azt méri, ahogy a FORRÁS a CÉLHOZ viszonyul a köztük lévő valós kapcsolatban (egy titkos, viszonzatlan vonzalom nem tesz valakit baráttá). Csak JSON: {"levels":[{"i":0,"level":0}]}';

// Agent turn: one character decides what he wants in this day part, from his own view.
// Fixed rules first and the changing day last (2026-11-12), so the provider's prompt cache can
// reuse the unchanged start of the system message between rounds.
export function agentPrompt({name,when,profile,places,relations,known,memories,relationshipChanges='',doneToday=[],palorTalk='',threads={open:[],lapsed:[]},messaging=true,canInvite=false}){
  const palorRule=messaging?'Palorral most nem találkozhatsz ebben a körben, de írhatsz neki üzenetet, ha a kapcsolatotok indokolja (ritkán).'+(canInvite?' Ha szeretnéd látni, meg is hívhatod egy saját helyedre egy későbbi napszakra ("invite_palor"; ritkán, csak ha tényleg kedved van hozzá).':''):'Ebben a körben Palornak nem írsz.';
  const shape=`{"intention":"1-2 mondat","location_id":"azonosító vagy null","wants_to_meet":["azonosító"],"message_to_palor":"szöveg vagy null"${canInvite?',"invite_palor":{"location_id":"a helyeid egyike","slot":"reggel|delutan|este|ejszaka","text":"a meghívás szövege"} vagy null':''}}`;
  // The same rules start every character's call; his name and the variable parts come last
  // (2026-11-13: the name used to open the message, so 38 calls of a round shared no prefix and
  // the provider cached almost nothing).
  const system=`Egy élő világ szimulációjában egy szereplőt alakítasz; hogy kit, azt az üzenet végén olvasod. Csak a megadott profilból, kapcsolatokból és emlékekből dolgozz. Ne találj ki új szereplőt, rokont vagy életrajzi tényt; ami ismeretlen, maradjon ismeretlen. Senki nem hal meg. A terved illeszkedjen a napszakhoz és a rutinodhoz, és ne ismételd, amit ma már csináltál. Ha Palorral megbeszélt tervetek vagy ígéretetek van, az befolyásolhatja a napodat. Felnőtt világ: a vágyaid és a szexuális terveid is lehetnek a szándékod részei, ha a profilod szerint ilyen vagy. Csak JSON-ban válaszolj, magyarul.\n\nTe most ${name} vagy. ${palorRule} A válasz formája: ${shape}`;
  const threadLines=[...threads.open.map(t=>`- ${t.promised_by==='palor'?'Palor ígérte':'Te ígérted'}: ${clip(t.text,200)}${t.due_day?' (esedékes: '+t.due_day+')':''}`),...threads.lapsed.map(t=>`- ELMARADT (${t.promised_by==='palor'?'Palor nem tartotta meg':'te nem tartottad meg'}): ${clip(t.text,200)}`)];
  const user=['PROFIL:\n'+profile,
    'HELYEID:\n'+(places.map(p=>`${p.location_id} = ${p.location_name} (${p.role})`).join('\n')||'nincs megadva'),
    'KAPCSOLATAID:\n'+(relations.map(r=>`${r.target_id} = ${r.name} [${LEVELS[r.level??0]}]: ${clip(r.description,300)}`).join('\n')||'nincs'),
    'ISMERT SZEREPLŐK:\n'+[...known].map(([id,n])=>`${id} = ${n}`).join('\n'),
    'LEGUTÓBBI EMLÉKEID:\n'+(memories.map(m=>'- '+clip(m,300)).join('\n')||'nincs'),
    ...(relationshipChanges?[relationshipChanges]:[]),
    ...(palorTalk?['LEGUTÓBBI BESZÉLGETÉSED PALORRAL: '+clip(palorTalk,300)]:[]),
    ...(threadLines.length?['TERVEK ÉS ÍGÉRETEK PALORRAL:\n'+threadLines.join('\n')]:[]),
    when,
    'MA MÁR CSINÁLTAD (ne ismételd):\n'+(doneToday.map(t=>'- '+clip(t,120)).join('\n')||'még semmit')].join('\n\n');
  return {system,user,maxTokens:canInvite?380:300};
}

// Game-master turn: resolves the intentions into what actually happens.
export function gmPrompt({when,slotLabel,pacing,today,knownList,intentions,cast,levels,extras,places,recent,relationshipChanges=''}){
  // The system message is the same in every round (prompt cache); day part and pacing go last.
  const system=`Te vagy a játékmester egy élő világban. A szereplők szándékaiból döntöd el, mi történik a megadott napszakban. Ne ismételd a ma már megtörtént vagy korábbi eseményeket; legyen változatos (munka, találkozás, apró konfliktus, váratlan apróság, érzelmi pillanat), és illeszkedjen a napszakhoz. Ha két olyan szereplő találkozik, aki még nem ismeri egymást, az esemény az első találkozásuk legyen, és vedd fel a párt a "new_acquaintances" listába; enélkül ismeretlenek nem szerepelhetnek együtt. Az élet gyorsabban és érdekesebben halad, mint a valóságban (drámai sűrítés), de hihetően, a szereplők saját céljaiból és konfliktusaiból. Szabályok: senki nem hal meg; ne találj ki új megnevezett szereplőt, csak a listában szereplő azonosítókat használd; Palor otthon van és nem vesz részt, róla és a kapcsolatairól ne állíts új tényt (titok, viszony, múltbeli esemény). Ne találj ki új tényt a meglévő kapcsolatokról sem: csak a megadott célokból, szándékokból és a korábbi eseményekből dolgozz. Két szereplő csak akkor ismeri egymást, ha a szintek között szerepelnek, vagy ma ismerkednek meg. Minden szereplőnek legyen legalább egy (akár hétköznapi) eseménye; komoly esemény legfeljebb egy legyen naponta. Komoly esemény (szakítás, bűncselekmény, súlyos konfliktus vagy sérülés, munkahely elvesztése, titok kiderülése, költözés) kind="serious". Ez egy felnőtt, szexuálisan nyílt világ: a flört, a titkos vágyak, a testi kapcsolatok és a szex a hétköznapok része lehet, ha a szereplők profilja, vágyai és kapcsolata indokolja; írd nyíltan, és az ilyen eseménynél legyen "intimate":true. Az ütemet a felhasználói üzenet végén kapod. Csak JSON, magyarul: {"events":[{"kind":"everyday|meeting|serious","title":"rövid cím","summary":"2-4 mondat","intimate":false,"character_ids":["azonosító"],"location_id":"azonosító vagy null","memories":[{"character_id":"azonosító","text":"egy mondat a szereplő szemszögéből"}],"level_changes":[{"source_id":"azonosító","target_id":"azonosító","delta":1,"reason":"miért"}],"new_acquaintances":[["azonosító","azonosító"]]}]}`;
  const user=[when,
    WORLD_EXPERIENCE_INSTRUCTION,
    ...(relationshipChanges?['IRÁNYÍTOTT KAPCSOLATVÁLTOZÁSOK (nem kölcsönösek):\n'+relationshipChanges]:[]),
    'MA EDDIG TÖRTÉNT:\n'+(today.map(e=>`- ${e.title}: ${clip(e.summary,200)}`).join('\n')||'semmi'),
    'ISMERIK EGYMÁST:\n'+(knownList.join('\n')||'senki'),
    'SZEREPLŐK ÉS SZÁNDÉKAIK:\n'+intentions.map(i=>`${i.id} = ${i.name}: ${i.intention||'nincs külön terv'}${i.place?' | hely: '+i.place.id+' ('+i.place.name+')':''}${i.wants_to_meet.length?' | találkozna: '+i.wants_to_meet.join(', '):''}`).join('\n'),
    // Fears added 2026-11-15: material for believable tension and story threads.
    'CÉLOK, KONFLIKTUSOK, FÉLELMEK:\n'+cast.map(c=>{const v=c.profile.values||{},fear=clip(v.fears?.value,200);return `${c.name}: ${clip(v.goals?.value,300)} / ${clip(v.conflicts?.value,300)}${fear?' / fél: '+fear:''}`;}).join('\n'),
    'EGYMÁS KÖZTI SZINTEK:\n'+levels.join('\n'),
    'TOVÁBBI LÉTEZŐ SZEREPLŐK (passzívan megjelenhetnek):\n'+extras.map(c=>`${c.id} = ${c.name}`).join('\n'),
    'HELYSZÍNEK:\n'+places.map(p=>`${p.id} = ${p.name}`).join('\n'),
    'KORÁBBAN TÖRTÉNT:\n'+(recent.map(e=>`${e.world_day}: ${e.title} – ${clip(e.summary,200)}`).join('\n')||'semmi'),
    `NAPSZAK: ${slotLabel}. ÜTEM: ${pacing}`].join('\n\n');
  return {system,user,maxTokens:GM_TOKENS};
}
// Game-master answer budget: 1800 cut a full round off on 2026-11-13 (8 events with memories and
// level changes need more). 3000 leaves room; a cut answer still keeps its complete events.
export const GM_TOKENS=3000;
// The complete event objects of a JSON answer that was cut off mid-way: {"events":[{…},{…},{…
// → the first two. Pure; strings and nesting are followed character by character.
export function salvageEvents(raw){
  const text=String(raw||''),start=text.search(/"events"\s*:\s*\[/);if(start<0)return [];
  let i=text.indexOf('[',start)+1,depth=0,inString=false,escaped=false,from=-1;const out=[];
  for(;i<text.length;i++){const ch=text[i];
    if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;continue;}
    if(ch==='{'){if(depth===0)from=i;depth++;}
    else if(ch==='}'){depth--;if(depth===0&&from>=0){try{out.push(JSON.parse(text.slice(from,i+1)));}catch{}from=-1;}}
    else if(ch===']'&&depth===0)break;
  }
  return out;
}

// What the pacing hint asks for, from the recent history.
export function pacingHint({day,recent,firstDay}){
  const gap=d=>d?Math.round((new Date(day)-new Date(d))/864e5):99;
  const lastNotable=recent.find(e=>e.kind!=='everyday')?.world_day,lastSerious=recent.find(e=>e.kind==='serious')?.world_day;
  // A young world has no history yet: introduce everyday life before any turning point.
  if(!recent.length)return 'Első nap: mutasd be a szereplők hétköznapjait, legyen benne egy-két apró meglepetés; komoly esemény ne legyen.';
  if(gap(firstDay)<7)return 'A világ még fiatal: hétköznapok, ismerkedés, apró súrlódások, kisebb meglepetések, érzelmi pillanatok; komoly esemény még ne legyen.';
  if(gap(lastSerious)>=10)return 'Ideje egy fordulópontnak: a szereplők céljai vagy konfliktusai most ütközzenek (ez lehet komoly esemény).';
  if(gap(lastNotable)>=2)return 'Mozgalmas nap legyen: legalább egy találkozás vagy érdekes fordulat.';
  if(gap(lastNotable)<=1)return 'Csendesebb nap: hétköznapi apróságok, a tegnapi események utóhatásai.';
  return 'Átlagos nap.';
}

// Validate the game master's answer against real records. Everything that does not refer
// to existing characters/places is dropped; strangers may only meet as a declared first
// meeting; at most one serious proposal per day; level steps are clamped.
export function normalizeEvents(plan,{allowed,knownPairs,locationExists,slotId,seriousSoFar=0}){
  const known=new Set(knownPairs),out=[];let serious=seriousSoFar;
  for(const raw of (Array.isArray(plan?.events)?plan.events:[]).slice(0,MAX_EVENTS_PER_ROUND)){
    if(!raw||typeof raw!=='object')continue;
    const ids=[...new Set((Array.isArray(raw.character_ids)?raw.character_ids:[]).filter(id=>allowed.has(id)))];if(!ids.length)continue;
    const title=clip(raw.title,120),summary=clip(raw.summary,2000);if(!title||!summary)continue;
    const declared=new Set((Array.isArray(raw.new_acquaintances)?raw.new_acquaintances:[]).filter(p=>Array.isArray(p)&&p.length===2&&p[0]!==p[1]&&ids.includes(p[0])&&ids.includes(p[1])).map(p=>pairKey(p[0],p[1])));
    let strangers=false;for(const a of ids)for(const b of ids)if(a<b&&!known.has(pairKey(a,b))&&!declared.has(pairKey(a,b)))strangers=true;
    if(strangers)continue;
    const isSerious=raw.kind==='serious'||DEATH.test(title+' '+summary);
    if(isSerious&&++serious>1)continue;
    const kind=isSerious?'serious':raw.kind==='meeting'||ids.length>1?'meeting':'everyday';
    const step=isSerious?2:1;
    const payload={slot:slotId,acquaintances:[...declared].map(k=>k.split('|')),character_ids:ids,
      location_id:typeof raw.location_id==='string'&&locationExists(raw.location_id)?raw.location_id:null,
      memories:(Array.isArray(raw.memories)?raw.memories:[]).filter(m=>ids.includes(m?.character_id)&&typeof m.text==='string'&&m.text.trim()).slice(0,6).map(m=>({character_id:m.character_id,text:clip(m.text,1000)})),
      ...(Array.isArray(raw.interactions)?{interactions:raw.interactions.filter(x=>x&&ids.includes(x.actor_id)&&ids.includes(x.recipient_id)&&x.actor_id!==x.recipient_id&&typeof x.quote==='string'&&x.quote.length<=600).slice(0,6).map(x=>({actor_id:x.actor_id,recipient_id:x.recipient_id,kind:x.kind,quote:x.quote}))}:{}),
      // A level moves only for someone who took part, towards another participant or someone he
      // already knows (2026-11-12): before, any two people could get a level from any event,
      // which also made strangers count as acquainted from then on.
      level_changes:(Array.isArray(raw.level_changes)?raw.level_changes:[]).filter(l=>allowed.has(l?.source_id)&&allowed.has(l?.target_id)&&l.source_id!==l.target_id&&Number.isFinite(l.delta)
        &&ids.includes(l.source_id)&&(ids.includes(l.target_id)||known.has(pairKey(l.source_id,l.target_id)))).slice(0,6).map(l=>({source_id:l.source_id,target_id:l.target_id,delta:Math.max(-step,Math.min(step,Math.round(l.delta))),reason:clip(l.reason,300)})).filter(l=>l.delta!==0),
      // Sexual events between characters are part of this adult world; flagged for the journal and pictures.
      ...(raw.intimate===true&&ids.length>1?{intimate:true}:{})};
    // A first meeting that is applied makes the pair known for later events this round.
    if(!isSerious)for(const k of declared)known.add(k);
    out.push({kind,serious:isSerious,title,summary,payload});
  }
  return out;
}
