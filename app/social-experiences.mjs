// Evidence -> personal interpretation -> directed, bounded change. No model call here.
// A summary proposes a classification of a full spoken line; conservative local checks
// abstain on questions, reported/conditional/future deeds, unknown kinds and absent evidence.
import {readFileSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {backup,DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {appraiseEvent,appraiseHeardEvent} from './appraisal.mjs';

export const EXPERIENCE_METHOD='social-experience-v1';
export const WORLD_EXPERIENCE_METHOD='world-social-experience-v1';
export const WORLD_EXPERIENCE_INSTRUCTION='Opcionális "interactions": legfeljebb 6 világos, megtörtént beszédaktus/cselekvés az esemény tényleges résztvevői között: {"actor_id":"beszélő/cselekvő ID","recipient_id":"címzett ID","kind":"praise|criticism|rejection|help|boundary_respected|attraction","quote":"teljes, pontos megszólalás"}. Csak ha a summary külön sorában pontosan szerepel: Beszélő teljes neve: Címzett teljes neve, megszólalás. Például: Teszt Béla: Teszt Aladár, *Segítek elpakolni.* A quote ekkor *Segítek elpakolni.* A dicséret: Ügyes vagy.; kritika: Ez hibás.; elutasítás: Nem szeretnék veled találkozni.; határ: Tiszteletben tartom a döntésedet.; saját vonzalom: Vonzódom hozzád. Csak a jelenetből indokolt eseteket használd, ne erőltesd ezeket a mondatokat; különben üres lista. Kérdés, idézett hír, jövőbeli ígéret nem megtörtént tett. Vonzalom csak a beszélő saját irányában, soha nem beleegyezés. Ne adj dimenziópontokat, azokat a program számolja.';
export const DIMENSIONS={trust:'bizalom',familiarity:'ismerősség',resentment:'sérelem',loyalty:'számíthatok rá',attraction:'vonzalom',boundaries:'határaim tisztelete'};
export const EXPERIENCE_KINDS=['praise','criticism','rejection','help','boundary_respected','attraction'];
const PATTERNS={
  praise:/ügyes vagy|jól csináltad|büszke vagyok rád|remek munkát végeztél/iu,
  criticism:/rosszul csináltad|ez hibás|nem végeztél jó munkát/iu,
  rejection:/nem (?:szeretnék|akarok) veled (?:találkozni|randizni)|nem vonzódom hozzád/iu,
  help:/\*[^*]*(?:segítek (?:neked|elpakolni|cipelni)|átadom (?:neked )?a (?:csomagot|szerszámot))[^*]*\*/iu,
  boundary_respected:/tiszteletben tartom a (?:döntésedet|határaidat)|rendben, nem erőltetem/iu,
  attraction:/vonzódom hozzád|tetszel nekem/iu
};
const text=x=>typeof x==='string'?x.trim():'';
const uncertain=/[?？„”"«»]|(?:^|[^\p{L}])(?:ha|talán|majd|holnap|később|fogok|mondta|mondtam|mondtad|mesélte|szerinte|ígérem|próbálok)(?=$|[^\p{L}])/iu;
export const EXPERIENCE_INSTRUCTION='"experiences": legfeljebb 3 tényleges, világos beszédaktus, csak az alábbi típusok: praise (dicséret), criticism (kritika), rejection (elutasítás), help (megtörtént segítség *cselekvésként*), boundary_respected (határ elfogadása), attraction (a szereplő saját kifejezett vonzalma). {"kind":"...","quote":"a beszélgetés egy teljes sorának pontos szövege, beszélőnév nélkül"}. Az első öt csak Palor tettéről a szereplő felé; attraction csak a szereplő saját mondatából. Kérdés, idézett hír, feltétel, jövőbeli ígéret vagy beleegyezés kitalálása tilos. Ha nem világos, üres lista; nem kötelező találni eseményt.';

export async function backupBeforeSocialExperiences(db,dataDir){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='characters'").get()||db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='social_experiences'").get())return null;
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'before-social-experiences-'+randomUUID()+'.sqlite');await backup(db,file);
  const check=new DatabaseSync(file,{readOnly:true});
  try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Social experience migration backup verification failed');}finally{check.close();}
  return file;
}

export function validateExperienceText(x){
  const quote=text(x?.quote),kind=x?.kind;
  if(typeof kind!=='string'||!Object.hasOwn(PATTERNS,kind)||!quote||quote.length>600||uncertain.test(quote)||!PATTERNS[kind].test(quote))return null;
  if(['praise','help','attraction'].includes(kind)&&/(?:^|[^\p{L}])(?:nem|soha|mégsem)(?=$|[^\p{L}])/iu.test(quote))return null;
  return {kind,quote};
}
export function validateExperience(x,lines,{name,group=false}={}){
  const valid=validateExperienceText(x);if(!valid)return null;
  const {kind,quote}=valid;
  const line=lines.find(l=>l.text===quote&&(kind==='attraction'?l.speaker==='character'&&!String(l.speaker_id||'').startsWith('guest:')&&(!group||l.speaker_name===name):l.speaker==='palor'));
  if(!line)return null;
  if(group&&kind!=='attraction'&&!quote.toLocaleLowerCase('hu').includes(name.toLocaleLowerCase('hu')))return null;
  return {kind,quote,line_id:line.id};
}

export function experienceDeltas(kind,profile){
  const scale=id=>profile?.values?.[id]?.value;
  const hurt=scale('attachment')>=7||scale('recognition')>=7||scale('grievances')>=7;
  switch(kind){
    case 'praise':return {familiarity:1}; // praise alone cannot create trust or attraction
    case 'criticism':return {resentment:hurt?2:1,...(scale('recognition')>=7?{trust:-1}:{})};
    case 'rejection':return {resentment:scale('attachment')>=7?1:0};
    case 'help':return {trust:2,loyalty:1,familiarity:1};
    case 'boundary_respected':return {trust:1,boundaries:2};
    case 'attraction':return {attraction:1};
    default:return {};
  }
}

export function installSocialExperiences({db,one,all,run,profile,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/039-social-experiences.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  function record({cid,targetId,eventId,conversationId=null,memoryId=null,kind,quote,line_id=null,day,via='',method=EXPERIENCE_METHOD}){
    if(!EXPERIENCE_KINDS.includes(kind)||cid===targetId||!one('SELECT 1 FROM characters WHERE id=?',cid)||!one('SELECT 1 FROM characters WHERE id=?',targetId))return null;
    const e=one("SELECT payload_json,world_day FROM world_events WHERE id=? AND rewound_at IS NULL AND status IN ('applied','accepted')",eventId);
    if(!e||e.world_day>day||!via&&e.world_day!==day)return null;
    const payload=JSON.parse(e.payload_json);
    if(via){
      if(payload.private||payload.intimate||payload.intimate_scene||!one('SELECT 1 FROM world_knowledge WHERE character_id=? AND event_id=? AND via_character_id=? AND world_day=? AND rewound_at IS NULL',cid,eventId,via,day))return null;
    }else if(!(payload.character_ids||[]).includes(cid))return null;
    if(memoryId&&!one("SELECT 1 FROM character_memories WHERE id=? AND character_id=? AND status='approved'",memoryId,cid))return null;
    const p=profile(cid),reading=via?appraiseHeardEvent(p,kind):appraiseEvent(p,kind),deltas=via?{}:experienceDeltas(kind,p),id=randomUUID();
    const result=run('INSERT OR IGNORE INTO social_experiences(id,character_id,target_id,event_id,conversation_id,memory_id,kind,quote,line_id,reading,deltas_json,via_character_id,method,world_day,created_at,rewound_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)',id,cid,targetId,eventId,conversationId,memoryId,kind,quote,line_id,reading,JSON.stringify(deltas),via,method,day,iso());
    return result.changes?{id,kind,reading,deltas}:null;
  }
  function recordConversation(cid,pid,eventId,conversationId,list,lines,{day,memoryId=null,group=false,name}={}){
    const written=[];
    for(const x of (Array.isArray(list)?list:[]).slice(0,3)){
      const valid=validateExperience(x,lines,{name,group});if(!valid)continue;
      const r=record({cid,targetId:pid,eventId,conversationId,memoryId,...valid,day});if(r)written.push(r);
    }
    return written;
  }
  // Only called inside the fact gate's transaction, after the persisted event is applied.
  // Stable IDs plus an exact, separately attributed summary line disambiguate the direction.
  function recordWorldEvent(eventId,memoryIds={},palorId=null){
    const e=one("SELECT * FROM world_events WHERE id=? AND rewound_at IS NULL AND status IN ('applied','accepted')",eventId);if(!e)return [];
    const p=JSON.parse(e.payload_json),ids=p.character_ids||[],written=[],seen=new Set();
    for(const x of (Array.isArray(p.interactions)?p.interactions:[]).slice(0,6)){
      const valid=validateExperienceText(x);if(!valid||x.actor_id===x.recipient_id||[x.actor_id,x.recipient_id].some(id=>id===palorId||!ids.includes(id)))continue;
      const actor=one('SELECT name FROM characters WHERE id=?',x.actor_id),recipient=one('SELECT name FROM characters WHERE id=?',x.recipient_id);
      if(!actor||!recipient||[actor,recipient].some(c=>one('SELECT count(*) n FROM characters WHERE name=? COLLATE NOCASE',c.name).n!==1))continue;
      const quote=actor.name+': '+recipient.name+', '+valid.quote;
      if(!e.summary.split(/\r?\n/).some(line=>line.trim()===quote))continue;
      const cid=valid.kind==='attraction'?x.actor_id:x.recipient_id,targetId=valid.kind==='attraction'?x.recipient_id:x.actor_id,key=cid+'|'+targetId+'|'+valid.kind;
      if(seen.has(key))continue;seen.add(key);
      const memoryId=memoryIds[cid]||null;
      if(memoryId&&!one("SELECT 1 FROM character_memories WHERE id=? AND character_id=? AND reason=? AND status='approved'",memoryId,cid,'Világmotor esemény '+eventId))continue;
      const r=record({cid,targetId,eventId,memoryId,kind:valid.kind,quote,day:e.world_day,method:WORLD_EXPERIENCE_METHOD});if(r)written.push(r);
    }return written;
  }
  const rows=(cid,targetId)=>all("SELECT s.* FROM social_experiences s JOIN world_events e ON e.id=s.event_id WHERE s.character_id=? AND s.target_id=? AND s.rewound_at IS NULL AND e.rewound_at IS NULL AND e.status IN ('applied','accepted') ORDER BY s.created_at,s.rowid",cid,targetId);
  function state(cid,targetId){
    const scores={},evidence=rows(cid,targetId).filter(r=>!r.via_character_id);
    for(const r of evidence)for(const [key,delta] of Object.entries(JSON.parse(r.deltas_json))){if(!Object.hasOwn(DIMENSIONS,key)||!delta)continue;scores[key]=Math.max(['resentment','familiarity'].includes(key)?0:-10,Math.min(10,(scores[key]||0)+delta));}
    return {source_id:cid,target_id:targetId,scores,evidence:evidence.slice(-12).reverse().map(({id,event_id,memory_id,line_id,kind,quote,created_at,deltas_json,method})=>({id,event_id,memory_id,line_id,kind,quote,created_at,method,deltas:JSON.parse(deltas_json)}))};
  }
  function prompt(cid,{targetId=null,person='te'}={}){
    const recent=all('SELECT s.*,c.name target_name,v.name via_name FROM social_experiences s JOIN world_events e ON e.id=s.event_id JOIN characters c ON c.id=s.target_id LEFT JOIN characters v ON v.id=s.via_character_id WHERE s.character_id=? AND s.rewound_at IS NULL AND e.rewound_at IS NULL ORDER BY s.created_at DESC,s.rowid DESC LIMIT 3',cid);
    const out=recent.map(r=>`${person==='te'?'AHOGY RÁD HATOTT':'AHOGY RÁ HATOTT'} (${r.world_day}, ${r.target_name}; ${r.via_character_id?'hallottad '+r.via_name+' elbeszéléséből, nem saját élmény':'saját tapasztalat'}): ${r.quote} ${r.reading}`);
    if(targetId){const s=state(cid,targetId);if(Object.keys(s.scores).length)out.push('A KAPCSOLATBAN GYŰLT VÁLTOZÁSOK (csak az ismert események óta, nem teljes személyiségleírás; vonzalom ≠ bizalom vagy beleegyezés): '+Object.entries(s.scores).map(([key,v])=>`${DIMENSIONS[key]} ${v>0?'+':''}${v}`).join('; '));}
    return out.join('\n');
  }
  function pairs({sourceId=null,targetIds=null,excludeId=null,limit=60}={}){
    const ids=targetIds?new Set(targetIds):null;
    return all("SELECT s.character_id,s.target_id,c.name source_name,t.name target_name,max(s.created_at) latest FROM social_experiences s JOIN world_events e ON e.id=s.event_id JOIN characters c ON c.id=s.character_id JOIN characters t ON t.id=s.target_id WHERE s.rewound_at IS NULL AND s.via_character_id='' AND e.rewound_at IS NULL AND e.status IN ('applied','accepted') AND (? IS NULL OR s.character_id=?) AND (? IS NULL OR (s.character_id<>? AND s.target_id<>?)) GROUP BY s.character_id,s.target_id ORDER BY latest DESC,s.character_id,s.target_id",sourceId,sourceId,excludeId,excludeId,excludeId)
      .filter(p=>!ids||ids.has(p.target_id)).slice(0,limit).map(p=>({...p,...state(p.character_id,p.target_id)}));
  }
  function pairPrompt(cid,targetIds){
    const known=pairs({sourceId:cid,targetIds,limit:8});
    return known.length?'SAJÁT IRÁNYÍTOTT KAPCSOLATVÁLTOZÁSAID (csak saját tapasztalat; vonzalom ≠ bizalom vagy beleegyezés; a másik irány ismeretlen):\n'+known.map(p=>p.target_name+': '+Object.entries(p.scores).map(([k,v])=>`${DIMENSIONS[k]} ${v>0?'+':''}${v}`).join('; ')).join('\n'):'';
  }
  function heard({cid,eventId,via,memoryId,day}){
    const e=one('SELECT world_day,summary FROM world_events WHERE id=?',eventId);if(!e)return;
    // Only previously validated direct experiences may propagate; never invent a new event type.
    const originals=all("SELECT * FROM social_experiences WHERE event_id=? AND via_character_id='' AND rewound_at IS NULL ORDER BY rowid LIMIT 3",eventId);
    for(const r of originals){
      // A listener heard only the shareable event summary, never the private transcript.
      if(!e.summary.includes(r.quote)||r.kind==='attraction')continue;
      record({cid,targetId:r.target_id,eventId,kind:r.kind,quote:r.quote,line_id:r.line_id,day,via,memoryId});
    }
  }
  function rewindAfter(time,at){const ids=all('SELECT id FROM social_experiences WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id);for(const id of ids)run('UPDATE social_experiences SET rewound_at=? WHERE id=?',at,id);return ids;}
  function undoRewind(ids=[]){for(const id of ids)run('UPDATE social_experiences SET rewound_at=NULL WHERE id=?',id);}
  const priority=eventId=>one("SELECT count(*) n FROM social_experiences WHERE event_id=? AND via_character_id='' AND rewound_at IS NULL",eventId)?.n||0;
  return {recordConversation,recordWorldEvent,state,prompt,pairs,pairPrompt,heard,priority,rewindAfter,undoRewind};
}
