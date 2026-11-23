// The only projection here is typed memory/relationship effects from an authoritative source.
// Narration can stage proposals; an explicit local creator decision is required to apply them.
import {createHash,randomUUID} from 'node:crypto';
import {worldDayAt} from './world-common.mjs';
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clip=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const issue=message=>{throw Object.assign(Error(message),{status:409});};

export async function backupBeforeWorldFactGate(db,dataDir){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='characters'").get()||db.prepare("SELECT 1 FROM sqlite_master WHERE name='world_fact_commits'").get())return;
  const dir=path.join(dataDir,'backups');await mkdir(dir,{recursive:true});const file=path.join(dir,'before-world-fact-gate-'+randomUUID()+'.sqlite');await backup(db,file);
  const check=new DatabaseSync(file,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Fact gate backup verification failed');}finally{check.close();}
}
export function installWorldFactGate({db,one,all,run,transaction,remember,setLevel,levelOf,palorId,experiences=null,policy=null,now=()=>new Date()}){
  db.exec(`CREATE TABLE IF NOT EXISTS world_fact_commits(id TEXT PRIMARY KEY,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,event_id TEXT NOT NULL,actor TEXT NOT NULL,plan_json TEXT NOT NULL,created_at TEXT NOT NULL,rewound_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS world_fact_commits_source ON world_fact_commits(source_type,source_id) WHERE rewound_at IS NULL;
    CREATE TABLE IF NOT EXISTS world_fact_proposals(id TEXT PRIMARY KEY,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,source_hash TEXT NOT NULL,fact_json TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,decided_at TEXT,rewound_at TEXT)`);
  const iso=()=>now().toISOString(),atomic=fn=>db.isTransaction?fn():transaction(fn);
  const person=id=>typeof id==='string'&&!!one('SELECT 1 FROM characters WHERE id=?',id);
  function event(id){const e=one("SELECT * FROM world_events WHERE id=? AND rewound_at IS NULL AND status IN ('applied','accepted')",id);if(!e)issue('Nincs alkalmazható, jóváhagyott forrásesemény.');return e;}
  function commit(type,e,plan,actor){return atomic(()=>{
    const interactions=JSON.parse(e.payload_json).interactions;
    const fingerprint=digest({id:e.id,status:e.status,payload:e.payload_json,plan,...(type==='simulation'&&Array.isArray(interactions)&&interactions.length?{summary:e.summary}:{})});
    const prior=one('SELECT * FROM world_fact_commits WHERE source_type=? AND source_id=? AND rewound_at IS NULL',type,e.id);
    if(prior){if(prior.source_hash!==fingerprint)issue('A korábban alkalmazott tényforrás megváltozott.');return JSON.parse(prior.plan_json).result;}
    const allowed=new Set(plan.participants);if([...allowed].some(id=>!person(id)))issue('Ismeretlen résztvevő a tényforrásban.');
    for(const m of plan.memories)if(!allowed.has(m.character_id)||typeof m.text!=='string'||!m.text.trim())issue('Az emlék nem a forrás résztvevőjéhez tartozik.');
    for(const l of plan.levels)if(!allowed.has(l.source_id)||l.source_id===palorId()||!person(l.target_id)||!Number.isInteger(l.delta)||Math.abs(l.delta)>plan.maxDelta||l.source_id===l.target_id)issue('Nem megengedett irányú vagy mértékű kapcsolatváltozás.');
    const result={memory_ids:{}};
    for(const pair of plan.acquaintances||[]){if(pair.length!==2||pair[0]===pair[1]||pair.some(id=>!allowed.has(id)||id===palorId()))issue('Érvénytelen első találkozás.');for(const [a,b] of [pair,[pair[1],pair[0]]])if(levelOf(a,b)===undefined)setLevel(a,b,1,{reason:'Első találkozás',actor,eventId:e.id});}
    for(const m of plan.memories)result.memory_ids[m.character_id]=remember(m.character_id,clip(m.text,1000),e.id,{importance:plan.importance});
    for(const l of plan.levels)setLevel(l.source_id,l.target_id,(levelOf(l.source_id,l.target_id)??0)+l.delta,{reason:clip(l.reason,300)||'Forrásesemény',actor,eventId:e.id});
    if(type==='simulation'&&experiences){const written=experiences.recordWorldEvent(e.id,result.memory_ids,palorId());if(written.length)result.experience_ids=written.map(r=>r.id);}
    run('INSERT INTO world_fact_commits VALUES(?,?,?,?,?,?,?,?,NULL)',randomUUID(),type,e.id,fingerprint,e.id,actor,JSON.stringify({...plan,result}),iso());return result;
  });}
  function commitSimulation(eventId,actor){
    const e=event(eventId),p=JSON.parse(e.payload_json),participants=p.character_ids||[];
    const levels=p.level_changes||[];for(const l of levels)if(!participants.includes(l.target_id)&&!one('SELECT 1 FROM world_relationship_levels WHERE (source_id=? AND target_id=?) OR (source_id=? AND target_id=?)',l.source_id,l.target_id,l.target_id,l.source_id)&&!one('SELECT 1 FROM relationships WHERE (source_id=? AND target_id=?) OR (source_id=? AND target_id=?)',l.source_id,l.target_id,l.target_id,l.source_id))issue('Ismeretlen személyhez nem írható kapcsolat.');
    return commit('simulation',e,{participants,memories:p.memories||[],levels,acquaintances:p.acquaintances||[],maxDelta:e.kind==='serious'?2:1},actor);
  }
  function commitConversation(eventId){
    const e=event(eventId),p=JSON.parse(e.payload_json),c=one("SELECT * FROM play_conversations WHERE id=? AND status='closed' AND rewound_at IS NULL",p.play_conversation_id);if(!c)issue('Nincs lezárt beszélgetési forrás.');
    const s=JSON.parse(c.summary_json||'{}'),pid=palorId(),participants=[...(p.character_ids||[]),...(pid?[pid]:[])],memories=[];
    if(s.group){for(const m of s.participant_memories||[])memories.push({character_id:m.character_id,text:m.text});}
    else if(s.character_memory)memories.push({character_id:c.character_id,text:s.character_memory});
    if(s.palor_memory&&pid)memories.push({character_id:pid,text:s.palor_memory});
    const delta=Number(s.level_delta)||0,levels=!s.group&&delta&&pid?[{source_id:c.character_id,target_id:pid,delta,reason:s.reason}]:[];
    return commit('conversation',e,{participants,memories,levels,maxDelta:1,importance:s.importance,scope:'subjective_conversation_summary'},'play');
  }
  function source(type,id){
    if(type==='narrative'){
      const r=one('SELECT * FROM narrative_runs WHERE id=? AND rewound_at IS NULL',id);if(!r)issue('A narráció forrása nem elérhető.');const c=JSON.parse(r.context_json);
      return {version:r.version,hash:digest({context:r.context_json,state:r.state_json,version:r.version}),ids:c.cast.map(p=>p.id),location_id:c.location_id,day:c.day};
    }
    if(type==='narrator'){
      const r=one('SELECT * FROM play_narrations WHERE id=?',id);if(!r)issue('A narrátori forrás nem elérhető.');
      const conv=r.conversation_id?one('SELECT * FROM play_conversations WHERE id=? AND rewound_at IS NULL',r.conversation_id):null;
      if(r.conversation_id&&!conv)issue('A forrásbeszélgetést visszatekerték.');
      if(one('SELECT 1 FROM world_rewinds WHERE target_time<? AND created_at>=? AND undone_at IS NULL',r.created_at,r.created_at))issue('A narrátori forrást visszatekerték.');
      return {version:1,hash:digest(r),ids:[r.character_id],location_id:conv?.location_id||null,day:conv?.world_day||worldDayAt(now())};
    }issue('Ez a szöveg nem támogatott tényforrás.');
  }
  function normalizeFact(f,s){
    if(!f||typeof f!=='object'||Array.isArray(f)||!['memory','relationship_delta','world_event'].includes(f.type))return null;
    const allowed=new Set([...s.ids,palorId()].filter(person));
    if(f.type==='memory'&&allowed.has(f.character_id)&&clip(f.text,1000))return {type:f.type,character_id:f.character_id,text:clip(f.text,1000)};
    if(f.type==='relationship_delta'&&s.ids.includes(f.source_id)&&f.source_id!==palorId()&&allowed.has(f.target_id)&&f.source_id!==f.target_id&&Number.isInteger(f.delta)&&Math.abs(f.delta)<=1&&clip(f.reason,300))return {type:f.type,source_id:f.source_id,target_id:f.target_id,delta:f.delta,reason:clip(f.reason,300)};
    if(f.type==='world_event'&&clip(f.title,120)&&clip(f.summary,1000)&&Array.isArray(f.character_ids)&&f.character_ids.length&&f.character_ids.every(id=>allowed.has(id)))return {type:f.type,title:clip(f.title,120),summary:clip(f.summary,1000),character_ids:[...new Set(f.character_ids)]};
    return null;
  }
  function stage(type,id,facts){
    const s=source(type,id),out=[];
    for(const candidate of (Array.isArray(facts)?facts:[]).slice(0,6)){
      const f=normalizeFact(candidate,s),fact=f||{type:'unsupported'},json=JSON.stringify(fact);
      const old=one('SELECT id,status FROM world_fact_proposals WHERE source_type=? AND source_id=? AND source_hash=? AND fact_json=? AND rewound_at IS NULL',type,id,s.hash,json);if(old){out.push(old);continue;}
      const key=randomUUID(),status=f?'proposed':'abstained';run('INSERT INTO world_fact_proposals VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)',key,type,id,s.version,s.hash,json,status,f?'':'UNSUPPORTED_OR_OUT_OF_SCOPE','machine-proposal',iso());out.push({id:key,status});
    }return out;
  }
  function approve(id,expectedHash){return atomic(()=>{
    const p=one("SELECT * FROM world_fact_proposals WHERE id=? AND rewound_at IS NULL",id);if(!p||p.status!=='proposed')issue('Nincs jóváhagyható tényjavaslat.');
    const s=source(p.source_type,p.source_id);if(expectedHash!==p.source_hash||s.hash!==p.source_hash||s.version!==p.source_version)issue('A tényjavaslat forrása megváltozott.');
    const f=normalizeFact(JSON.parse(p.fact_json),s);if(!f)issue('A tényjavaslat már nem alkalmazható.');
    policy?.assertPrompt?.([f.title,f.summary,f.text,f.reason].filter(Boolean).join('\n'));
    const eventId=randomUUID(),participants=f.type==='world_event'?f.character_ids:[...s.ids,...(palorId()?[palorId()]:[])];
    if(participants.some(id=>!person(id)))issue('A forrás résztvevője nem elérhető.');
    const payload={character_ids:participants,location_id:s.location_id,private:true,memories:f.type==='memory'?[{character_id:f.character_id,text:f.text}]:[],level_changes:f.type==='relationship_delta'?[f]:[],fact_proposal_id:p.id};
    run('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)',eventId,s.day,'everyday','accepted',f.title||'Jóváhagyott narrátori javaslat',f.summary||f.text||f.reason,JSON.stringify(payload),'creator-approved-proposal',iso());
    commitSimulation(eventId,'local-creator');run("UPDATE world_fact_proposals SET status='approved',actor='local-creator',decided_at=? WHERE id=?",iso(),id);return {id,event_id:eventId,canon_changed:false};
  });}
  function rewindAfter(time,at){const result={commits:[],proposals:[],decisions:all('SELECT id,status,actor,decided_at FROM world_fact_proposals WHERE rewound_at IS NULL AND created_at<=? AND decided_at>?',time,time)};
    for(const p of result.decisions)run("UPDATE world_fact_proposals SET status='proposed',actor='machine-proposal',decided_at=NULL WHERE id=?",p.id);
    for(const [key,table] of [['commits','world_fact_commits'],['proposals','world_fact_proposals']]){result[key]=all(`SELECT id FROM ${table} WHERE rewound_at IS NULL AND created_at>?`,time).map(r=>r.id);for(const id of result[key])run(`UPDATE ${table} SET rewound_at=? WHERE id=?`,at,id);}return result;}
  function undoRewind(p){for(const [key,table] of [['commits','world_fact_commits'],['proposals','world_fact_proposals']])for(const id of p[key]||[])run(`UPDATE ${table} SET rewound_at=NULL WHERE id=?`,id);for(const d of p.decisions||[])run('UPDATE world_fact_proposals SET status=?,actor=?,decided_at=? WHERE id=?',d.status,d.actor,d.decided_at,d.id);}
  const list=()=>all("SELECT * FROM world_fact_proposals WHERE rewound_at IS NULL AND status='proposed' ORDER BY created_at DESC LIMIT 40").map(({fact_json,...p})=>{
    const fact=JSON.parse(fact_json),name=id=>one('SELECT name FROM characters WHERE id=?',id)?.name||'';let stale=false;try{stale=source(p.source_type,p.source_id).hash!==p.source_hash;}catch{stale=true;}
    return {...p,fact,stale,people:[fact.character_id,fact.source_id,fact.target_id,...(fact.character_ids||[])].filter(Boolean).map(name).join(' → ')};
  });
  function reject(id,expectedHash){const p=one("SELECT * FROM world_fact_proposals WHERE id=? AND rewound_at IS NULL AND status='proposed'",id);if(!p||p.source_hash!==expectedHash)issue('A javaslat megváltozott.');run("UPDATE world_fact_proposals SET status='rejected',actor='local-creator',decided_at=? WHERE id=?",iso(),id);return {id,rejected:true};}
  async function handle({p,req,body,json}){if(p==='/api/play/facts'&&req.method==='GET'){json({proposals:list()});return true;}const x=p.match(/^\/api\/play\/facts\/([a-f0-9-]{36})\/(approve|reject)$/);if(x&&req.method==='POST'){json(x[2]==='approve'?approve(x[1],body.source_hash):reject(x[1],body.source_hash));return true;}return false;}
  return {commitSimulation,commitConversation,stage,approve,list,handle,rewindAfter,undoRewind,commitNarrative:scene=>stage('narrative',scene.id,scene.state.proposed_facts)};
}
