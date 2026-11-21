// Phone threads, the journal and Palor's relationship list for play mode (split from
// play-mode.mjs, 2026-11-11).
import {SLOTS,LEVELS} from '../world-common.mjs';

export function createPlayRecords({one,all,run,w,director,playSettings,iso,clock=null}){
  // Phone: one thread per contact, mixing his messages and phone conversations, oldest first.
  function phoneContacts(){
    const cast=new Set(w.meetable().map(a=>a.id));
    return all(`SELECT c.id,c.name,c.cover_id,max(t.at) last_at,sum(t.unread) unread FROM (
        SELECT from_character_id cid,created_at at,CASE WHEN read_at IS NULL THEN 1 ELSE 0 END unread FROM world_messages WHERE rewound_at IS NULL
        UNION ALL SELECT character_id,created_at,0 FROM play_conversations WHERE channel='phone' AND rewound_at IS NULL) t
      JOIN characters c ON c.id=t.cid GROUP BY c.id ORDER BY last_at DESC`).map(r=>({...r,can_talk:cast.has(r.id)}));
  }
  function phoneThread(cid){
    // A message that carries his invitation shows it with its state (answer buttons while open).
    const hasInvites=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_invitations'");
    const day=clock?.().day,slotIdx=clock?.().slot_index;
    const items=[...all(`SELECT m.id,m.text,m.created_at at${hasInvites?',a.id invite_id,a.world_day invite_day,a.slot invite_slot,a.status invite_status,l.name invite_place':''} FROM world_messages m${hasInvites?' LEFT JOIN play_invitations pi ON pi.message_id=m.id LEFT JOIN play_appointments a ON a.id=pi.appointment_id LEFT JOIN locations l ON l.id=a.location_id':''} WHERE m.rewound_at IS NULL AND m.from_character_id=?`,cid).map(m=>({who:'them',text:m.text,at:m.at,
      ...(m.invite_id&&m.invite_status!=='rewound'?{invitation:{id:m.invite_id,day:m.invite_day,slot:SLOTS.find(s=>s.id===m.invite_slot)?.label||m.invite_slot,place:m.invite_place||'',status:m.invite_status,
        passed:m.invite_status==='invited'&&!!day&&(m.invite_day<day||(m.invite_day===day&&SLOTS.findIndex(s=>s.id===m.invite_slot)<slotIdx))}}:{})}))];
    for(const l of all("SELECT l.speaker,l.text,l.created_at at,pm.media_id,pm.kind,pm.level FROM active_play_lines l JOIN play_conversations p ON p.id=l.conversation_id LEFT JOIN play_line_media pm ON pm.line_id=l.id WHERE p.character_id=? AND p.channel='phone' AND p.rewound_at IS NULL ORDER BY l.rowid",cid))
      items.push({who:l.speaker==='palor'?'me':'them',text:l.text,at:l.at,...(l.media_id&&(playSettings().adult||l.level==='non_intimate')?{media:{media_id:l.media_id,kind:l.kind,level:l.level,blur:l.level!=='non_intimate'}}:{})});
    run('UPDATE world_messages SET read_at=? WHERE read_at IS NULL AND rewound_at IS NULL AND from_character_id=?',iso(),cid);
    return items.sort((a,b)=>a.at.localeCompare(b.at));
  }
  // Journal with pictures: the newest 40 story events get the picture that fits them best
  // (all of the event's people in it, at that place, at the event's level of intimacy).
  async function journalWithMedia(){
    const j=journal();
    for(const e of j.events.slice(0,40)){
      if(e.status==='proposed')continue;
      const row=one('SELECT id,title,summary,payload_json FROM world_events WHERE id=?',e.id);
      try{e.media=row?await director.forEvent(row):null;}catch{e.media=null;}
    }
    return j;
  }
  // Journal: the world's recent story (newest first), with pending serious decisions.
  function journal(){
    const names=new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name])),adult=playSettings().adult;
    return {events:all("SELECT id,world_day,kind,status,title,summary,payload_json FROM world_events WHERE rewound_at IS NULL AND status<>'refused' ORDER BY world_day DESC,created_at DESC,rowid DESC LIMIT 80").map(e=>{const p=JSON.parse(e.payload_json);
      // With adult content off, intimate moments stay in the story but without details.
      const hide=p.intimate&&!adult;
      return {id:e.id,world_day:e.world_day,slot:SLOTS.find(s=>s.id===p.slot)?.label||(p.slot==='nap'?'egész nap':''),kind:e.kind,status:e.status,title:hide?'Intim pillanat':e.title,summary:hide?'(A részletek rejtve, mert a felnőtt tartalom ki van kapcsolva.)':e.summary,intimate:!!p.intimate,with_palor:!!p.with_palor,characters:(p.character_ids||[]).map(id=>names.get(id)||'?')};})};
  }
  // Relationships from Palor's side of the story: who he knows, how they stand.
  function relationships(){
    const pid=w.palor()?.id;if(!pid)return {people:[]};
    const cast=new Set(w.meetable().map(c=>c.id)),ids=new Set([...cast]);
    for(const r of all('SELECT source_id,target_id FROM relationships WHERE source_id=? OR target_id=?',pid,pid))ids.add(r.source_id===pid?r.target_id:r.source_id);
    for(const r of all('SELECT source_id,target_id FROM world_relationship_levels WHERE source_id=? OR target_id=?',pid,pid))ids.add(r.source_id===pid?r.target_id:r.source_id);
    ids.delete(pid);const groups=w.groupIds();
    const people=[...ids].filter(id=>!groups.has(id)).map(id=>{const c=one('SELECT id,name,cover_id FROM characters WHERE id=?',id);if(!c)return null;
      const last=one("SELECT summary_json,closed_at FROM play_conversations WHERE character_id=? AND status='closed' AND rewound_at IS NULL ORDER BY closed_at DESC LIMIT 1",id);
      let lastTalk=null;try{lastTalk=last?{...JSON.parse(last.summary_json||'{}'),at:last.closed_at}:null;}catch{}
      return {id:c.id,name:c.name,cover_id:c.cover_id,their_level:w.levelOf(id,pid)??null,palor_level:w.levelOf(pid,id)??null,can_talk:cast.has(id),last_talk:lastTalk?{title:lastTalk.title,summary:lastTalk.summary,at:lastTalk.at}:null};}).filter(Boolean);
    people.sort((a,b)=>(b.can_talk-a.can_talk)||((b.their_level??-9)-(a.their_level??-9))||a.name.localeCompare(b.name,'hu'));
    return {people,labels:LEVELS};
  }
  function markMessagesRead(){run('UPDATE world_messages SET read_at=? WHERE read_at IS NULL AND rewound_at IS NULL',iso());return {ok:true};}
  return {phoneContacts,phoneThread,journalWithMedia,journal,relationships,markMessagesRead};
}
