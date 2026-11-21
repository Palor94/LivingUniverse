import {randomUUID} from 'node:crypto';

// Owner request 2026-11-16: a character's first conversation with Palor is a turning point. When
// it is saved, the app proposes (never applies) a story event and a relationship line for both
// directions. The owner accepts or dismisses them on the profile. Accepting a relationship line
// appends to the owner's text; it never rewrites what the owner wrote.
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const clip=(v,n)=>{const s=String(v??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const uuid=/^[a-f0-9-]{36}$/i;
export const FIRST_MEETING_HEADING='Első találkozás';

export function installFirstMeetings({db,transaction,storyEvents,palorId}){
  const one=(sql,...a)=>db.prepare(sql).get(...a),all=(sql,...a)=>db.prepare(sql).all(...a),run=(sql,...a)=>db.prepare(sql).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS relationship_suggestions(
    id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES characters(id),target_id TEXT NOT NULL REFERENCES characters(id),
    kind TEXT NOT NULL,text TEXT NOT NULL,world_event_id TEXT,story_event_id TEXT,status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,decided_at TEXT,UNIQUE(kind,source_id,target_id))`);
  const live="rewound_at IS NULL AND status IN ('applied','accepted') AND json_extract(payload_json,'$.with_palor')=1";
  // The earliest saved meeting with Palor for this character (world day, then insertion order).
  const firstEventOf=cid=>one(`SELECT rowid,id,world_day,title,summary,payload_json FROM world_events WHERE ${live} AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY world_day,rowid LIMIT 1`,cid);
  const placeName=id=>id?one('SELECT name FROM locations WHERE id=?',id)?.name||null:null;

  // Proposes for one character whose first meeting is the given world event. Idempotent.
  function propose(cid,event,pid){
    if(one("SELECT 1 FROM relationship_suggestions WHERE kind='first_meeting' AND source_id=? AND target_id=?",cid,pid))return false;
    const c=one('SELECT id,name FROM characters WHERE id=?',cid),p=one('SELECT id,name FROM characters WHERE id=?',pid);if(!c||!p)return false;
    let payload={};try{payload=JSON.parse(event.payload_json||'{}');}catch{}
    const locationId=typeof payload.location_id==='string'&&one('SELECT 1 FROM locations WHERE id=?',payload.location_id)?payload.location_id:null;
    const place=placeName(locationId),day=String(event.world_day||''),summary=clip(event.summary||event.title,600);
    let storyId=null;
    try{
      const created=storyEvents.create({request_key:'first-meeting:'+cid+':'+pid,status:'proposed',event:{
        title:clip(`${c.name} és ${p.name} első találkozása`,200),summary:summary||clip(event.title,600)||'Első beszélgetés a játékban.',
        details:clip(event.title,500),participants:[{character_id:cid,role:'participant',knows:true},{character_id:pid,role:'participant',knows:true}],
        location_ids:locationId?[locationId]:[],visibility:'participants',tags:['első találkozás','játék'],
        chronology:/^\d{4}-\d{2}-\d{2}$/.test(day)?{kind:'exact',start:day,label:'Játékbeli nap'}:{kind:'relative',label:'Az első közös beszélgetésük a játékban.'},
        sources:[{system:'living-universe-play',external_id:'first-meeting:'+cid+':'+pid,locator:'world_event:'+event.id,excerpt:clip(event.title,300)}]}});
      storyId=created?.id||null;
    }catch(e){if(e.status!==409)throw e;}
    const line=`${FIRST_MEETING_HEADING} (${day}${place?', '+place:''}): ${summary}`;
    const at=new Date().toISOString();
    for(const [source,target] of [[cid,pid],[pid,cid]])
      run("INSERT OR IGNORE INTO relationship_suggestions(id,source_id,target_id,kind,text,world_event_id,story_event_id,status,created_at) VALUES(?,?,?,'first_meeting',?,?,?,'pending',?)",randomUUID(),source,target,line,event.id,storyId,at);
    return true;
  }
  // Called right after the play mode saved a meeting with Palor.
  function afterMeeting(eventId){
    const pid=palorId();if(!pid)return 0;
    const event=one('SELECT rowid,id,world_day,title,summary,payload_json FROM world_events WHERE id=?',eventId);if(!event)return 0;
    let ids=[];try{ids=JSON.parse(event.payload_json||'{}').character_ids||[];}catch{}
    let n=0;for(const cid of ids)if(cid!==pid&&firstEventOf(cid)?.id===event.id&&propose(cid,event,pid))n++;return n;
  }
  // One-time catch-up for meetings saved before this feature existed.
  function backfill(){
    const pid=palorId();if(!pid)return {proposed:0};let proposed=0;
    for(const c of all('SELECT id FROM characters WHERE id<>?',pid)){const e=firstEventOf(c.id);if(e&&transaction(()=>propose(c.id,e,pid)))proposed++;}
    return {proposed};
  }
  function list(cid){return all("SELECT s.id,s.source_id,s.target_id,s.kind,s.text,s.story_event_id,s.created_at,t.name target_name FROM relationship_suggestions s JOIN characters t ON t.id=s.target_id WHERE s.source_id=? AND s.status='pending' ORDER BY s.created_at",cid);}
  function decide(id,body){
    if(!uuid.test(id))throw error('Invalid suggestion.');if(!['accept','dismiss'].includes(body?.decision))throw error('Choose accept or dismiss.');
    return transaction(()=>{
      const s=one('SELECT * FROM relationship_suggestions WHERE id=?',id);if(!s)throw error('Suggestion not found.',404);if(s.status!=='pending')throw error('This suggestion was already decided.',409);
      if(body.decision==='accept'){
        const current=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',s.source_id,s.target_id)?.description||'';
        // Owner text stays first and untouched; the line is only added once.
        const next=current.includes(s.text)?current:[current.trim(),s.text].filter(Boolean).join('\n\n');
        run('INSERT INTO relationships(id,source_id,target_id,description) VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET description=excluded.description',randomUUID(),s.source_id,s.target_id,next);
      }
      run('UPDATE relationship_suggestions SET status=?,decided_at=? WHERE id=?',body.decision==='accept'?'accepted':'dismissed',new Date().toISOString(),id);
      return {ok:true,status:body.decision==='accept'?'accepted':'dismissed'};
    });
  }
  function handle({p,req,body,json}){
    const m=p.match(/^\/api\/characters\/([^/]+)\/relationship-suggestions$/);
    if(m&&req.method==='GET'){json({items:list(m[1])});return true;}
    const d=p.match(/^\/api\/relationship-suggestions\/([^/]+)\/decision$/);
    if(d&&req.method==='POST'){json(decide(d[1],body));return true;}
    return false;
  }
  // Run the catch-up once per database. An empty catalogue (no Palor yet, e.g. before a restore)
  // writes nothing, so the restored settings never collide with this marker.
  if(palorId()&&!one("SELECT 1 FROM application_settings WHERE key='first-meetings:backfilled'")){
    try{const r=backfill();run("INSERT INTO application_settings VALUES('first-meetings:backfilled',?) ON CONFLICT(key) DO NOTHING",JSON.stringify({...r,at:new Date().toISOString()}));}catch(e){console.error('first-meetings backfill failed:',e.message);}
  }
  return {afterMeeting,backfill,list,decide,handle};
}
