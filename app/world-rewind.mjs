// Save points and rewind (DECISIONS.md 2026-11-09). A save point is the end of a Play
// conversation or a world round. Rewinding to a save point undoes everything the world
// and Play mode did after it: events and messages are marked rewound, play memories get
// a "rewound" revision, relationship levels go back through new revisions, and the
// world clock steps back so the following day parts are lived again. Nothing is
// deleted; the latest rewind can be undone while nothing new has happened since.
import {randomUUID,createHash} from 'node:crypto';
import {SLOTS,slotLabel as labelOf} from './world-common.mjs';

export function installWorldRewind({db,one,all,run,transaction,fail,worldEngine,gameClock=null,now=()=>new Date()}){
  db.exec('CREATE TABLE IF NOT EXISTS world_rewinds(id TEXT PRIMARY KEY,target_time TEXT NOT NULL,label TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,undone_at TEXT)');
  const w=worldEngine.internals,iso=()=>now().toISOString();
  const slotLabel=id=>labelOf(id)||'';
  const hasTable=name=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name);
  // Rewound game timestamps may repeat. Database contents detect a new branch even
  // when its writes precede the old rewind's timestamp on the game clock.
  const guardTables=['world_events','world_messages','play_conversations','play_lines','play_appointments','play_dates','world_threads','narrative_runs','narrative_turns','world_fact_proposals','world_fact_commits','character_memories','world_relationship_levels','character_inner_states','social_experiences','world_beliefs','world_knowledge','hidden_event_reveals','day_plans'];
  const undoGuard=()=>createHash('sha256').update(JSON.stringify(guardTables.filter(hasTable).map(t=>[t,all(`SELECT * FROM ${t} ORDER BY rowid`)]))).digest('hex');
  // Clock activity heartbeats are presentation metadata, not a new story action.
  const clockToken=raw=>{const s=raw?JSON.parse(raw):{};return JSON.stringify({offset_ms:s.offset_ms??0,action_revision:s.action_revision??null});};

  // Newest first: one point per finished conversation and per world round.
  function savePoints(limit=40){
    const points=[];
    for(const c of all("SELECT p.id,p.closed_at,p.world_day,p.slot,p.summary_json,p.participants_json,c.name FROM play_conversations p JOIN characters c ON c.id=p.character_id WHERE p.status='closed' AND p.rewound_at IS NULL AND p.closed_at IS NOT NULL ORDER BY p.closed_at DESC LIMIT ?",limit)){
      let title='',names=c.name;try{title=JSON.parse(c.summary_json||'{}').title||'';}catch{}
      // Group scenes name everyone who took part, not only the first participant.
      try{const ids=JSON.parse(c.participants_json||'[]');if(ids.length>1)names=ids.map(id=>one('SELECT name FROM characters WHERE id=?',id)?.name).filter(Boolean).join(', ');}catch{}
      points.push({time:c.closed_at,kind:'conversation',label:`Beszélgetés: ${names}${title?' – '+title:''}`,world_day:c.world_day,slot:c.slot});
    }
    for(const r of all("SELECT world_day,json_extract(payload_json,'$.slot') slot,max(created_at) time,count(*) n FROM world_events WHERE rewound_at IS NULL AND model<>'play' GROUP BY world_day,slot ORDER BY time DESC LIMIT ?",limit))
      points.push({time:r.time,kind:'round',label:`Világ: ${r.world_day} ${slotLabel(r.slot)} (${r.n} esemény)`,world_day:r.world_day,slot:r.slot});
    return points.sort((a,b)=>b.time.localeCompare(a.time)).slice(0,limit);
  }

  function rewind(time,label=''){
    if(typeof time!=='string'||Number.isNaN(Date.parse(time)))throw fail('Choose a save point.');
    return transaction(()=>{
      const at=iso(),payload={events:[],messages:[],conversations:[],memories:[],levels:[],settings_before:null};
      if(Date.parse(time)>Date.parse(at))throw fail('A jövőbe nem lehet visszatekerni.',400);
      payload.event_decisions=all("SELECT id,status,decided_at FROM world_events WHERE rewound_at IS NULL AND created_at<=? AND decided_at>? AND status IN ('accepted','refused')",time,time);
      for(const e of payload.event_decisions)run("UPDATE world_events SET status='proposed',decided_at=NULL WHERE id=?",e.id);
      for(const e of all('SELECT id FROM world_events WHERE rewound_at IS NULL AND created_at>?',time)){run('UPDATE world_events SET rewound_at=? WHERE id=?',at,e.id);payload.events.push(e.id);}
      for(const m of all('SELECT id FROM world_messages WHERE rewound_at IS NULL AND created_at>?',time)){run('UPDATE world_messages SET rewound_at=? WHERE id=?',at,m.id);payload.messages.push(m.id);}
      for(const c of all('SELECT id FROM play_conversations WHERE rewound_at IS NULL AND created_at>?',time)){run('UPDATE play_conversations SET rewound_at=? WHERE id=?',at,c.id);payload.conversations.push(c.id);}
      // A talk that began before the save point but was saved after it: its save point (event,
      // memories, level) is undone below, so it is open again instead of closed without effects.
      payload.reopened=[];
      for(const c of all("SELECT id,closed_at,summary_json FROM play_conversations WHERE rewound_at IS NULL AND status='closed' AND created_at<=? AND closed_at>?",time,time)){run("UPDATE play_conversations SET status='open',closed_at=NULL,summary_json=NULL WHERE id=?",c.id);payload.reopened.push(c);}
      // Meetings agreed after the save point are cancelled too (and restored by undo).
      payload.appointments=[];
      if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_appointments'"))for(const a of all("SELECT id,status FROM play_appointments WHERE created_at>? AND status<>'rewound'",time)){run("UPDATE play_appointments SET status='rewound' WHERE id=?",a.id);payload.appointments.push(a);}
      // Dates met or noted as missed after the save point count as not yet happened (2026-11-12:
      // before, a rewound date still counted as met and could never be missed again).
      payload.dates=[];
      if(hasTable('play_dates'))for(const d of all('SELECT appointment_id,conversation_id,met_at,missed_noted_at FROM play_dates WHERE met_at>? OR missed_noted_at>?',time,time)){
        run('UPDATE play_dates SET met_at=CASE WHEN met_at>? THEN NULL ELSE met_at END,conversation_id=CASE WHEN met_at>? THEN NULL ELSE conversation_id END,missed_noted_at=CASE WHEN missed_noted_at>? THEN NULL ELSE missed_noted_at END WHERE appointment_id=?',time,time,time,d.appointment_id);payload.dates.push(d);}
      // Promises and plans: new ones are undone, ones kept/dropped/lapsed or brought up since are open again.
      payload.threads=[];
      if(hasTable('world_threads'))for(const t of all('SELECT id,status,noted_at,updated_at,created_at FROM world_threads WHERE rewound_at IS NULL AND (created_at>? OR updated_at>? OR noted_at>?)',time,time,time)){
        if(t.created_at>time)run('UPDATE world_threads SET rewound_at=? WHERE id=?',at,t.id);
        else run("UPDATE world_threads SET status=CASE WHEN updated_at>? THEN 'open' ELSE status END,noted_at=CASE WHEN noted_at>? THEN NULL ELSE noted_at END WHERE id=?",time,time,t.id);
        payload.threads.push(t);}
      for(const m of all("SELECT * FROM character_memories WHERE status='approved' AND (reason LIKE 'Világmotor esemény %' OR reason LIKE 'Meghívás válasza %') AND created_at>?",time)){
        run("UPDATE character_memories SET status='rewound',version=version+1,updated_at=? WHERE id=?",at,m.id);
        run('INSERT INTO character_memory_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),m.id,m.version+1,m.kind,m.text,m.related_event_id,m.visibility,'rewound',m.belief_accuracy,'Visszatekerés',`rewind`,at);
        payload.memories.push(m.id);
      }
      // Beliefs formed and news heard after the save point (031).
      payload.social=w.social?w.social.rewindAfter(time,at):null;
      // Inner states written after the save point (E2, 2026-11-21).
      payload.inner=w.inner?w.inner.rewindAfter(time,at):[];
      payload.experiences=w.experiences?w.experiences.rewindAfter(time,at):[];
      payload.fact_gate=w.factGate?w.factGate.rewindAfter(time,at):null;
      payload.narrative=w.narrative?w.narrative.rewindAfter(time,at):null;
      payload.places=w.knownPlaces?w.knownPlaces.rewindAfter(time,at):[];
      payload.day_plans=w.morning?w.morning.rewindAfter(time,at):[];
      payload.hidden=w.hiddenEvents?w.hiddenEvents.rewindAfter(time,at):[];
      payload.discoveries=w.secretDiscoveries?w.secretDiscoveries.rewindAfter(time,at):[];
      // Each pair changed after the save point goes back to its value at that moment.
      for(const pair of all('SELECT DISTINCT source_id,target_id FROM world_level_revisions WHERE created_at>?',time)){
        const before=one('SELECT level FROM world_relationship_levels WHERE source_id=? AND target_id=?',pair.source_id,pair.target_id)?.level??null;
        const earlier=one('SELECT level FROM world_level_revisions WHERE source_id=? AND target_id=? AND created_at<=? ORDER BY created_at DESC,rowid DESC LIMIT 1',pair.source_id,pair.target_id,time);
        const firstAfter=one('SELECT previous_level FROM world_level_revisions WHERE source_id=? AND target_id=? AND created_at>? ORDER BY created_at,rowid LIMIT 1',pair.source_id,pair.target_id,time);
        const target=earlier?earlier.level:(firstAfter?.previous_level??null);
        if(target===before)continue;
        if(target===null)run('DELETE FROM world_relationship_levels WHERE source_id=? AND target_id=?',pair.source_id,pair.target_id);
        else w.setLevel(pair.source_id,pair.target_id,target,{reason:'Visszatekerés',actor:'rewind'});
        payload.levels.push({source_id:pair.source_id,target_id:pair.target_id,before,after:target});
      }
      // The world clock steps back to the save point, so later day parts run again.
      const s=worldEngine.settings();payload.settings_before={last_day:s.last_day,last_slot:s.last_slot??null};
      const last=one("SELECT world_day,json_extract(payload_json,'$.slot') slot FROM world_events WHERE rewound_at IS NULL AND model<>'play' ORDER BY created_at DESC,rowid DESC LIMIT 1");
      const idx=last?(last.slot==='nap'?SLOTS.length-1:SLOTS.findIndex(x=>x.id===last.slot)):-1;
      worldEngine.writeSettings({...s,last_day:last?.world_day??null,last_slot:last?(idx<0?SLOTS.length-1:idx):null});
      if(gameClock){payload.clock_before=gameClock.snapshot();gameClock.rewindTo(time);payload.clock_after=gameClock.snapshot();payload.undo_guard=undoGuard();}
      const id=randomUUID();
      run('INSERT INTO world_rewinds VALUES(?,?,?,?,?,NULL)',id,time,String(label).slice(0,300),JSON.stringify(payload),at);
      return {id,undone:false,events:payload.events.length,messages:payload.messages.length,memories:payload.memories.length,levels:payload.levels.length,conversations:payload.conversations.length};
    });
  }

  function undo(){
    return transaction(()=>{
      const r=one('SELECT * FROM world_rewinds WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1');if(!r)throw fail('There is no rewind to undo.',404);
      const p=JSON.parse(r.payload_json);
      // Anything still live that started at or after the rewind means the story moved on.
      // Messages, meetings and plans made since count too: undoing would set them beside the old ones.
      const newer=one('SELECT 1 FROM world_events WHERE rewound_at IS NULL AND created_at>=? LIMIT 1',r.created_at)||one('SELECT 1 FROM play_conversations WHERE rewound_at IS NULL AND created_at>=? LIMIT 1',r.created_at)
        ||one('SELECT 1 FROM world_messages WHERE rewound_at IS NULL AND created_at>=? LIMIT 1',r.created_at)
        ||(hasTable('play_appointments')&&one("SELECT 1 FROM play_appointments WHERE status<>'rewound' AND created_at>=? LIMIT 1",r.created_at))
        ||(hasTable('world_threads')&&one('SELECT 1 FROM world_threads WHERE rewound_at IS NULL AND created_at>=? LIMIT 1',r.created_at))
        ||(hasTable('narrative_runs')&&one('SELECT 1 FROM narrative_runs WHERE rewound_at IS NULL AND (created_at>=? OR updated_at>=?) LIMIT 1',r.created_at,r.created_at))
        ||one('SELECT 1 FROM world_events WHERE rewound_at IS NULL AND decided_at>=? LIMIT 1',r.created_at)
        ||(hasTable('world_fact_proposals')&&one('SELECT 1 FROM world_fact_proposals WHERE rewound_at IS NULL AND (created_at>=? OR decided_at>=?) LIMIT 1',r.created_at,r.created_at));
      if(p.undo_guard?(p.undo_guard!==undoGuard()||clockToken(gameClock?.snapshot())!==clockToken(p.clock_after)):newer)throw fail('The world has moved on since this rewind, so it cannot be undone. Rewind again instead.',409);
      const at=iso();
      for(const id of p.events)run('UPDATE world_events SET rewound_at=NULL WHERE id=?',id);
      for(const e of p.event_decisions||[])run('UPDATE world_events SET status=?,decided_at=? WHERE id=?',e.status,e.decided_at,e.id);
      for(const id of p.messages)run('UPDATE world_messages SET rewound_at=NULL WHERE id=?',id);
      for(const id of p.conversations)run('UPDATE play_conversations SET rewound_at=NULL WHERE id=?',id);
      for(const c of p.reopened||[])run("UPDATE play_conversations SET status='closed',closed_at=?,summary_json=? WHERE id=?",c.closed_at,c.summary_json,c.id);
      for(const a of p.appointments||[])run('UPDATE play_appointments SET status=? WHERE id=?',a.status,a.id);
      for(const d of p.dates||[])run('UPDATE play_dates SET met_at=?,conversation_id=?,missed_noted_at=? WHERE appointment_id=?',d.met_at,d.conversation_id,d.missed_noted_at,d.appointment_id);
      for(const t of p.threads||[])run('UPDATE world_threads SET rewound_at=NULL,status=?,noted_at=? WHERE id=?',t.status,t.noted_at,t.id);
      if(p.social&&w.social)w.social.undoRewind(p.social);
      if(p.inner&&w.inner)w.inner.undoRewind(p.inner);
      if(p.experiences&&w.experiences)w.experiences.undoRewind(p.experiences);
      if(p.fact_gate&&w.factGate)w.factGate.undoRewind(p.fact_gate);
      if(p.narrative&&w.narrative)w.narrative.undoRewind(p.narrative);
      if(p.places&&w.knownPlaces)w.knownPlaces.undoRewind(p.places);
      if(p.day_plans&&w.morning)w.morning.undoRewind(p.day_plans);
      if(p.hidden&&w.hiddenEvents)w.hiddenEvents.undoRewind(p.hidden);
      if(p.discoveries&&w.secretDiscoveries)w.secretDiscoveries.undoRewind(p.discoveries);
      for(const id of p.memories){const m=one('SELECT * FROM character_memories WHERE id=?',id);if(!m||m.status!=='rewound')continue;
        run("UPDATE character_memories SET status='approved',version=version+1,updated_at=? WHERE id=?",at,id);
        run('INSERT INTO character_memory_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),id,m.version+1,m.kind,m.text,m.related_event_id,m.visibility,'approved',m.belief_accuracy,'Visszatekerés visszavonva','rewind_undo',at);}
      for(const l of p.levels){
        if(l.before===null)run('DELETE FROM world_relationship_levels WHERE source_id=? AND target_id=?',l.source_id,l.target_id);
        else w.setLevel(l.source_id,l.target_id,l.before,{reason:'Visszatekerés visszavonva',actor:'rewind_undo'});
      }
      worldEngine.writeSettings({...worldEngine.settings(),...p.settings_before});
      if(Object.hasOwn(p,'clock_before')&&gameClock)gameClock.restore(p.clock_before);
      run('UPDATE world_rewinds SET undone_at=? WHERE id=?',at,r.id);
      return {id:r.id,undone:true};
    });
  }
  const lastRewind=()=>one('SELECT id,target_time,label,created_at FROM world_rewinds WHERE undone_at IS NULL ORDER BY rowid DESC LIMIT 1')||null;

  async function handle({p,req,body,json}){
    if(p==='/api/play/save-points'&&req.method==='GET')return json({points:savePoints(),last_rewind:lastRewind()}),true;
    if(p==='/api/play/rewind'&&req.method==='POST')return json(rewind(body.time,body.label)),true;
    if(p==='/api/play/rewind/undo'&&req.method==='POST')return json(undo()),true;
    return false;
  }
  return {savePoints,rewind,undo,handle};
}
