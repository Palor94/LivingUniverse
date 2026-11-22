// Talk history (2026-11-15): one read model over Palor's play talks and the world engine's own
// events, shared by the profile's events tab and the MCP catalogue. Read-only: the talks stay
// the single source; nothing is copied into story events (a talk is promoted only by hand, and
// the promoted event points back with its source key).
import {SLOTS} from './world-common.mjs';

export const TALK_SOURCE_SYSTEM='Living Universe játék';
export const talkSourceId=id=>'play-conversation:'+id;
const parse=s=>{try{const v=JSON.parse(s||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}};
const list=v=>Array.isArray(v)?v:[];
const str=v=>typeof v==='string'?v:'';

export function createTalkHistory({one,all:rawAll}){
  const all=(sql,...args)=>rawAll(one("SELECT 1 FROM sqlite_master WHERE name='active_play_lines' AND type='view'")?sql.replaceAll('FROM play_lines','FROM active_play_lines').replaceAll('JOIN play_lines','JOIN active_play_lines'):sql,...args);
  const has=t=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",t);
  const cols=t=>new Set(all(`PRAGMA table_info(${t})`).map(c=>c.name));
  const palorId=()=>one("SELECT id FROM characters WHERE lower(trim(name))='palor' LIMIT 1")?.id||null;
  const names=()=>new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name]));
  const person=(map,id)=>({id,name:map.get(id)||'?'});
  // Talks need the play-mode columns (added on the app's first start); an older catalogue has none.
  const talksReady=()=>has('play_conversations')&&['mode','participants_json','rewound_at'].every(c=>cols('play_conversations').has(c));
  const promoted=()=>has('story_event_source_keys')?new Map(all('SELECT external_id,event_id FROM story_event_source_keys WHERE system=?',TALK_SOURCE_SYSTEM).map(r=>[r.external_id,r.event_id])):new Map();

  // Raw talk rows: Palor sees all; anyone else the talks he was in or was mentioned in.
  function talkRows(cid,{everything=false,limit=500}={}){
    if(!talksReady())return [];
    const where=everything?'':`AND (c.character_id=? OR EXISTS(SELECT 1 FROM json_each(coalesce(c.participants_json,'[]')) WHERE value=?)
      OR EXISTS(SELECT 1 FROM json_each(coalesce(c.summary_json,'{}'),'$.mentioned_character_ids') WHERE value=?))`;
    return all(`SELECT c.id,c.character_id,c.world_day,c.slot,c.channel,coalesce(c.mode,'normal') mode,c.status,c.location_id,c.participants_json,c.summary_json,c.created_at,c.closed_at,
        (SELECT count(*) FROM play_lines l WHERE l.conversation_id=c.id) line_count
      FROM play_conversations c WHERE c.rewound_at IS NULL ${where} ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`,...(everything?[]:[cid,cid,cid]),limit);
  }
  function presentTalk(r,cid,map,places,links){
    const s=parse(r.summary_json),group=r.mode==='group';
    const ids=group?list(parse(r.participants_json)).filter(x=>typeof x==='string'):[r.character_id];
    const pid=palorId(),inIt=cid===pid||ids.includes(cid);
    return {kind:'talk',id:r.id,world_day:r.world_day,slot:r.slot,channel:r.channel,mode:r.mode,status:r.status,line_count:r.line_count,created_at:r.created_at,closed_at:r.closed_at,
      role:cid===pid?'palor':inIt?'participant':'mentioned',
      participants:[...(pid?[person(map,pid)]:[]),...ids.map(id=>person(map,id))],
      location:r.location_id?{id:r.location_id,name:places.get(r.location_id)||'?'}:null,
      title:str(s.title),summary:str(s.summary),tags:list(s.tags).filter(t=>typeof t==='string'),importance:Number.isInteger(s.importance)?s.importance:null,
      learned:s.learned&&typeof s.learned==='object'?{character:str(s.learned.character),palor:str(s.learned.palor)}:null,
      mood:s.mood&&typeof s.mood==='object'?{character:str(s.mood.character),palor:str(s.mood.palor)}:null,
      character_memory:group?'':str(s.character_memory),palor_memory:str(s.palor_memory),
      level_delta:Number.isInteger(s.level_delta)?s.level_delta:null,reason:str(s.reason),milestone:str(s.milestone),intimate:!!s.intimate,
      mentioned_people:list(s.mentioned_character_ids).filter(id=>map.has(id)).map(id=>person(map,id)),
      mentioned_places:list(s.mentioned_location_ids).filter(id=>places.has(id)).map(id=>({id,name:places.get(id)})),
      story_event_id:links.get(talkSourceId(r.id))||null};
  }
  // World-engine events of this character (everyday life, meetings without Palor). The meeting
  // a play talk writes for the world is left out: the talk itself is listed.
  function worldRows(cid,{everything=false,limit=500}={}){
    if(!has('world_events')||!cols('world_events').has('rewound_at'))return [];
    return all(`SELECT e.id,e.world_day,e.kind,e.title,e.summary,e.payload_json,e.created_at FROM world_events e
      WHERE e.rewound_at IS NULL AND e.status IN ('applied','accepted') AND json_extract(e.payload_json,'$.play_conversation_id') IS NULL
      ${everything?"AND json_extract(e.payload_json,'$.with_palor')=1":"AND EXISTS(SELECT 1 FROM json_each(e.payload_json,'$.character_ids') WHERE value=?)"}
      ORDER BY e.world_day DESC,e.rowid DESC LIMIT ?`,...(everything?[]:[cid]),limit);
  }
  function presentWorld(r,map,places){
    const p=parse(r.payload_json);
    return {kind:'world',id:r.id,world_day:r.world_day,slot:SLOTS.find(s=>s.id===p.slot)?.label||'',event_kind:r.kind,created_at:r.created_at,
      participants:list(p.character_ids).filter(id=>typeof id==='string').map(id=>person(map,id)),
      location:p.location_id?{id:p.location_id,name:places.get(p.location_id)||'?'}:null,title:str(r.title),summary:str(r.summary),with_palor:p.with_palor===true||p.with_palor===1};
  }
  // The running shared history he keeps of Palor: in the summary of the newest one-on-one talk,
  // so a rewound talk takes its version back with it.
  const sharedHistoryOf=cid=>talksReady()?one(`SELECT json_extract(summary_json,'$.shared_history') h FROM play_conversations WHERE character_id=? AND coalesce(mode,'normal')<>'group' AND status='closed' AND rewound_at IS NULL AND json_extract(summary_json,'$.shared_history') IS NOT NULL ORDER BY closed_at DESC LIMIT 1`,cid)?.h||'':'';

  // Everything that happened to one character, newest first. Filters run before pagination.
  function timeline(cid,{kinds=['talk','world'],from=null,to=null,tag=null,min_importance=null,search=null,limit=200,offset=0}={}){
    if(!one('SELECT 1 FROM characters WHERE id=?',cid))throw Object.assign(new Error('Character not found'),{status:404});
    const map=names(),places=has('locations')?new Map(all('SELECT id,name FROM locations').map(l=>[l.id,l.name])):new Map(),links=promoted();
    const everything=cid===palorId();
    let items=[...(kinds.includes('talk')?talkRows(cid,{everything}).map(r=>presentTalk(r,cid,map,places,links)):[]),
      ...(kinds.includes('world')?worldRows(cid,{everything}).map(r=>presentWorld(r,map,places)):[])];
    const low=search?String(search).toLocaleLowerCase('hu'):null;
    items=items.filter(i=>(!from||i.world_day>=from)&&(!to||i.world_day<=to)&&(!tag||(i.tags||[]).includes(tag))&&(min_importance==null||(i.importance??0)>=min_importance)
      &&(!low||[i.title,i.summary,...(i.tags||[])].join(' ').toLocaleLowerCase('hu').includes(low)));
    items.sort((a,b)=>b.world_day.localeCompare(a.world_day)||String(b.created_at).localeCompare(String(a.created_at)));
    return {character_id:cid,shared_history:everything?'':sharedHistoryOf(cid),total:items.length,items:items.slice(offset,offset+limit),next_offset:offset+limit<items.length?offset+limit:null};
  }
  // One talk in full: the record, its lines and the shared history written at its save point.
  function talk(id,{lines=true}={}){
    const r=talksReady()?one(`SELECT c.id,c.character_id,c.world_day,c.slot,c.channel,coalesce(c.mode,'normal') mode,c.status,c.location_id,c.participants_json,c.summary_json,c.created_at,c.closed_at,c.rewound_at,
      (SELECT count(*) FROM play_lines l WHERE l.conversation_id=c.id) line_count FROM play_conversations c WHERE c.id=?`,id):null;
    if(!r)throw Object.assign(new Error('Conversation not found'),{status:404});
    const map=names(),places=has('locations')?new Map(all('SELECT id,name FROM locations').map(l=>[l.id,l.name])):new Map();
    const view={...presentTalk(r,r.character_id,map,places,promoted()),rewound:!!r.rewound_at,shared_history:str(parse(r.summary_json).shared_history)};
    if(lines){const speaker=has('play_line_speaker');
      // Scene guests speak as 'guest:<id>' (2026-11-18); their names live in play_guests, not characters.
      if(has('play_guests'))for(const g of all('SELECT id,name FROM play_guests WHERE conversation_id=?',id))map.set('guest:'+g.id,g.name);
      view.lines=all(`SELECT l.speaker,l.text,l.created_at${speaker?',s.character_id speaker_id':''} FROM play_lines l${speaker?' LEFT JOIN play_line_speaker s ON s.line_id=l.id':''} WHERE l.conversation_id=? ORDER BY l.rowid`,id)
        .map(l=>({speaker:l.speaker,...(l.speaker_id?{speaker_id:l.speaker_id}:{}),name:l.speaker==='palor'?'Palor':map.get(l.speaker_id||r.character_id)||'?',text:l.text,created_at:l.created_at}));}
    return view;
  }
  return {timeline,talk,sharedHistoryOf,talkRows};
}
