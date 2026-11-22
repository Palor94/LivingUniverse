// Livelier characters (2026-11-12, NEXT_GEN_PLAN steps 2.4 and 2.5), used by the world engine.
//
// Who knows what (2.5, local, no AI call): the people in an event know it. Anyone else hears of
// it only when two people who know each other meet in a world round: each may pass on one recent
// thing the other has not heard (at most MAX_TOLD per round). The listener gets an ordinary
// memory ("X mesélte: …"), so recall puts it into his later prompts, and rewind undoes it with
// the round. Intimate scenes are never passed on.
//
// Reflection (2.4, one capped AI call): when a character has gathered enough new memories, they
// are condensed into a few subjective beliefs about people ("Palor megtartja a szavát"), each with
// the memories it rests on. Beliefs may be wrong, are kept apart from events, and enter only that
// character's own prompts. The owner sees them on the Élő világ page.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const MAX_TOLD=4,REFLECT_AFTER=8,REFLECT_PER_ROUND=2,BELIEFS_PER_REFLECTION=3;
// E8 (2026-11-21): reflection is due when the new memories weigh enough (importance 1–5, 3 when
// unknown), not by count: the same as 8 ordinary memories, sooner after turning points, later
// after small talk. After Generative Agents importance_trigger (Apache-2.0) and AI Town (MIT).
export const REFLECT_IMPORTANCE=REFLECT_AFTER*3;
const FRESH_DAYS=14;
const clip=(s,n)=>{s=String(s??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const parse=s=>{try{return JSON.parse(s||'{}')||{};}catch{return {};}};

export function installWorldSocial({db,one,all,run,remember,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/031-world-beliefs-knowledge.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  const name=id=>one('SELECT name FROM characters WHERE id=?',id)?.name||'?';
  const LIVE="rewound_at IS NULL AND status IN ('applied','accepted')";

  // ---- who knows what ----------------------------------------------------------------------
  // Recent events a character knows: his own, and what he was told.
  function knownEvents(cid,day){
    const from=addDays(day,-FRESH_DAYS);
    const own=all(`SELECT id,world_day,title,summary,payload_json,created_at FROM world_events WHERE ${LIVE} AND world_day BETWEEN ? AND ? AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?)`,from,day,cid);
    const told=all(`SELECT e.id,e.world_day,e.title,e.summary,e.payload_json,e.created_at FROM world_knowledge k JOIN world_events e ON e.id=k.event_id WHERE k.character_id=? AND k.rewound_at IS NULL AND e.rewound_at IS NULL AND e.status IN ('applied','accepted') AND e.world_day>=?`,cid,from);
    return [...own,...told];
  }
  const knows=(cid,eventId,payload)=>(payload.character_ids||[]).includes(cid)||!!one('SELECT 1 FROM world_knowledge WHERE event_id=? AND character_id=? AND rewound_at IS NULL',eventId,cid);
  const shareable=e=>{const p=parse(e.payload_json);return !p.intimate&&p.intimate_scene!==true;};

  // meetings: [{id, character_ids}] events of this round, already written. palorId is left out:
  // Palor's own knowledge is the player's.
  // Limited attention (2026-11-22, after Generative Agents att_bandwidth, Apache-2.0): attention(cid)
  // → {miss:0..1, extra:bool}. An upset or inattentive listener may not take a story in (a
  // deterministic draw per meeting, story and listener); an attentive one may hear a second one.
  const draw=key=>{let h=2166136261;for(const ch of key){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h/4294967296;};
  function spread(meetings,day,{palorId=null,attention=null}={}){
    const told=[];
    for(const m of meetings){
      const ids=[...new Set(m.character_ids||[])].filter(id=>id&&id!==palorId);
      for(const a of ids)for(const b of ids){
        if(a===b||told.length>=MAX_TOLD)continue;
        // Newest first; one thing per direction per meeting.
        const att=attention?.(b)||{miss:0,extra:false};
        const picks=knownEvents(a,day).filter(e=>e.id!==m.id&&shareable(e)&&!knows(b,e.id,parse(e.payload_json))).sort((x,y)=>y.created_at.localeCompare(x.created_at)).slice(0,att.extra?2:1);
        for(const pick of picks){
        if(told.length>=MAX_TOLD)break;
        if(att.miss>0&&draw(m.id+'|'+pick.id+'|'+b)<att.miss)continue;
        run('INSERT INTO world_knowledge(event_id,character_id,via_character_id,meeting_event_id,world_day,created_at,rewound_at) VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(event_id,character_id) DO UPDATE SET via_character_id=excluded.via_character_id,meeting_event_id=excluded.meeting_event_id,world_day=excluded.world_day,created_at=excluded.created_at,rewound_at=NULL',pick.id,b,a,m.id,day,iso());
        remember(b,`${name(a)} mesélte (${pick.world_day}): ${clip(pick.title,120)} – ${clip(pick.summary,240)}`,m.id);
        told.push({event_id:pick.id,from:a,to:b});
        }
      }
    }
    return told;
  }

  // ---- reflection ----------------------------------------------------------------------------
  // Opinions from conversations (E12) do not count as a reflection.
  const lastBeliefAt=cid=>one("SELECT max(created_at) t FROM world_beliefs WHERE character_id=? AND rewound_at IS NULL AND model<>'play-opinion'",cid)?.t||'';
  const newMemories=cid=>all("SELECT id,text FROM character_memories WHERE character_id=? AND status='approved' AND created_at>? ORDER BY rowid DESC LIMIT 20",cid,lastBeliefAt(cid)).reverse();
  const hasSalience=()=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_salience'");
  const weight=cid=>{const ms=newMemories(cid);if(!ms.length)return 0;if(!hasSalience())return ms.length*3;
    const imp=new Map(all(`SELECT memory_id,importance FROM memory_salience WHERE memory_id IN (${ms.map(()=>'?').join(',')})`,...ms.map(m=>m.id)).map(r=>[r.memory_id,r.importance]));
    return ms.reduce((n,m)=>n+(imp.get(m.id)??3),0);};
  const due=cast=>cast.filter(c=>weight(c.id)>=REFLECT_IMPORTANCE).slice(0,REFLECT_PER_ROUND);

  function reflectionPrompt(c,memories,people){
    const system=`${c.name} belső hangja vagy egy élő világban. A friss emlékei alapján fogalmazz meg legfeljebb ${BELIEFS_PER_REFLECTION} rövid, szubjektív véleményt emberekről, ahogy ő látja őket (tévedhet, lehet elfogult). Csak az emlékekben szereplő emberekről, csak abból, ami az emlékekben van; ne találj ki új tényt. Minden véleményhez add meg, mely emlékekre épül (sorszám). Csak JSON, magyarul: {"beliefs":[{"about":"név","text":"egy mondat","memories":[1,2]}]} Mielőtt válaszolsz, gondold végig (nem kell leírnod), mi most a legfontosabb kérdés az életében, és ebből indulj ki. Ha az emlékei alapján változott, ahogyan önmagát látja, add meg ezt is egy mondatban: "self":{"text":"...","memories":[sorszámok]} (különben hagyd el).`;
    const user='FRISS EMLÉKEID:\n'+memories.map((m,i)=>`${i+1}. ${clip(m.text,300)}`).join('\n')+'\n\nISMERT EMBEREK: '+people.join(', ');
    return {system,user,maxTokens:500};
  }
  // ask: the world engine's priced, capped call. Returns the beliefs written.
  async function reflect(cast,day,{ask,model='unknown',people}){
    const written=[];
    for(const c of due(cast)){
      const memories=newMemories(c.id),known=people();
      const byName=new Map(known.map(p=>[p.name.toLocaleLowerCase('hu'),p]));
      const prompt=reflectionPrompt(c,memories,known.map(p=>p.name));
      // A failed or timed-out call (possibly billed) is not retried on the next round: it falls
      // through to the empty marker below. Only a reached cap stops before anything was spent.
      let out=null;try{out=await ask(prompt.system,prompt.user,prompt.maxTokens);}catch(e){if(e.code==='CAP_REACHED')throw e;console.error('Reflection call failed: '+e.message);}
      const list=Array.isArray(out?.beliefs)?out.beliefs:[];
      for(const b of list.slice(0,BELIEFS_PER_REFLECTION)){
        const about=byName.get(String(b?.about||'').trim().toLocaleLowerCase('hu'));
        const refs=(Array.isArray(b?.memories)?b.memories:[]).map(Number).filter(i=>Number.isInteger(i)&&memories[i-1]).map(i=>memories[i-1].id);
        // A belief must be about a known person, other than himself, and rest on his memories.
        if(!about||about.id===c.id||typeof b.text!=='string'||!b.text.trim()||!refs.length)continue;
        const id=randomUUID();
        run('INSERT INTO world_beliefs(id,character_id,about_id,about_name,text,memory_ids_json,world_day,model,created_at,rewound_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',id,c.id,about.id,about.name,clip(b.text,300),JSON.stringify([...new Set(refs)]),day,model,iso());
        written.push({id,character_id:c.id,about:about.name});
      }
      // E8: how he sees himself now, resting on his memories like any belief.
      const self=out?.self,selfRefs=(Array.isArray(self?.memories)?self.memories:[]).map(Number).filter(i=>Number.isInteger(i)&&memories[i-1]).map(i=>memories[i-1].id);
      if(typeof self?.text==='string'&&self.text.trim()&&selfRefs.length){const id=randomUUID();
        run('INSERT INTO world_beliefs(id,character_id,about_id,about_name,text,memory_ids_json,world_day,model,created_at,rewound_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',id,c.id,c.id,'önmaga',clip(self.text,300),JSON.stringify([...new Set(selfRefs)]),day,model,iso());
        written.push({id,character_id:c.id,about:'önmaga'});}
      // Nothing usable still counts as a reflection (an empty marker row), so a broken answer is
      // not paid for again on every round; it waits for the next batch of new memories.
      if(!written.some(w=>w.character_id===c.id))run("INSERT INTO world_beliefs(id,character_id,about_id,about_name,text,memory_ids_json,world_day,model,created_at,rewound_at) VALUES(?,?,NULL,'','','[]',?,?,?,NULL)",randomUUID(),c.id,day,model,iso());
    }
    return written;
  }
  // The newest belief about each of the given people (Palor included), for his own prompt.
  function beliefsFor(cid,aboutIds=[]){
    const rows=all("SELECT about_id,about_name,text FROM world_beliefs WHERE character_id=? AND rewound_at IS NULL AND text<>'' ORDER BY created_at DESC LIMIT 40",cid);
    const seen=new Set(),out=[];
    // A topic opinion (E12) has no person id: it is kept apart by its name.
    for(const r of rows){if(r.about_id===cid)continue;const key=r.about_id||'topic:'+r.about_name.toLocaleLowerCase('hu');if(seen.has(key)||(aboutIds.length&&!aboutIds.includes(r.about_id)))continue;seen.add(key);out.push(r);if(out.length>=4)break;}
    return out;
  }
  // How he sees himself now (E8): the newest self-belief, or null.
  const selfView=cid=>one("SELECT text,world_day FROM world_beliefs WHERE character_id=? AND about_id=? AND rewound_at IS NULL AND text<>'' ORDER BY created_at DESC LIMIT 1",cid,cid)||null;
  // Opinions from a conversation (E12, 2026-11-21): what he thought of someone he talked about, or
  // of a recurring topic, from his side. After Generative Agents convo_to_thoughts /
  // keyword_to_thoughts (Apache-2.0). Stored beside reflection beliefs (model 'play-opinion'),
  // shown in his prompt as his opinion; never about himself; at most two per conversation.
  function addOpinions(cid,list,{day,people=[],eventId=null}={}){
    const byName=new Map(people.map(p=>[p.name.toLocaleLowerCase('hu'),p])),first=new Map();
    for(const p of people){const f=p.name.split(/[\s-]+/).pop().toLocaleLowerCase('hu');first.set(f,first.has(f)?null:p);}
    const written=[];
    for(const o of (Array.isArray(list)?list:[]).slice(0,2)){
      const name=String(o?.about||'').trim(),text=String(o?.text||'').trim();if(!name||!text)continue;
      const key=name.toLocaleLowerCase('hu'),person=byName.get(key)||first.get(key)||null;
      if(person?.id===cid)continue;
      const id=randomUUID();
      run('INSERT INTO world_beliefs(id,character_id,about_id,about_name,text,memory_ids_json,world_day,model,created_at,rewound_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)',id,cid,person?.id||null,person?.name||clip(name,80),clip(text,300),JSON.stringify(eventId?[eventId]:[]),day,'play-opinion',iso());
      written.push(id);
    }
    return written;
  }
  // For the owner: recent beliefs and who heard what.
  function overview(limit=40){
    return {beliefs:all("SELECT b.id,b.character_id,c.name character_name,b.about_name,b.text,b.world_day,b.memory_ids_json FROM world_beliefs b JOIN characters c ON c.id=b.character_id WHERE b.rewound_at IS NULL AND b.text<>'' ORDER BY b.created_at DESC LIMIT ?",limit).map(({memory_ids_json,...r})=>({...r,memory_count:JSON.parse(memory_ids_json).length})),
      told:all('SELECT k.world_day,e.title,a.name via_name,c.name character_name FROM world_knowledge k JOIN world_events e ON e.id=k.event_id JOIN characters a ON a.id=k.via_character_id JOIN characters c ON c.id=k.character_id WHERE k.rewound_at IS NULL ORDER BY k.created_at DESC LIMIT ?',limit)};
  }
  // Rewind support: everything created after the save point is marked rewound (and restored by undo).
  function rewindAfter(time,at){
    const beliefs=all('SELECT id FROM world_beliefs WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id);
    const knowledge=all('SELECT event_id,character_id FROM world_knowledge WHERE rewound_at IS NULL AND created_at>?',time);
    for(const id of beliefs)run('UPDATE world_beliefs SET rewound_at=? WHERE id=?',at,id);
    for(const k of knowledge)run('UPDATE world_knowledge SET rewound_at=? WHERE event_id=? AND character_id=?',at,k.event_id,k.character_id);
    return {beliefs,knowledge};
  }
  function undoRewind({beliefs=[],knowledge=[]}={}){
    for(const id of beliefs)run('UPDATE world_beliefs SET rewound_at=NULL WHERE id=?',id);
    for(const k of knowledge)run('UPDATE world_knowledge SET rewound_at=NULL WHERE event_id=? AND character_id=?',k.event_id,k.character_id);
  }
  return {spread,reflect,due,beliefsFor,selfView,addOpinions,overview,rewindAfter,undoRewind,knownEvents};
}
