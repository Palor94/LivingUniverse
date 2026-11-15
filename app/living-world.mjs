import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {analyzeReferenceCoverage} from '../mcp/reference-coverage.mjs';
import {digest} from './character-edit.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOCK_KEY='story:clock';
const memoryKinds=['memory','belief','secret','mistake'];
const memoryVisibility=['private','participants','public'];
const beliefAccuracy=['unknown','accurate','uncertain','mistaken'];

export function createLivingWorldReader({one,all,events,fail}){
  const problem=(code,message,status=400)=>Object.assign(fail(message,status),{code});
  const shape=(value,keys)=>{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw problem('INVALID_ARGUMENT','Unexpected living-world fields.');};
  const id=value=>{if(typeof value!=='string'||!uuid.test(value))throw problem('INVALID_ID','Use a stable catalogue UUID.');return value;};
  const hasTable=name=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name);
  function profile(cid){const c=one('SELECT * FROM characters WHERE id=?',id(cid));if(!c||(hasTable('character_ui')&&one('SELECT 1 FROM character_ui WHERE character_id=? AND merged_into IS NOT NULL',cid)))throw problem('NOT_FOUND','The character is missing or merged.',404);return c;}
  function emptyFields(c){return ['aliases','biography','personality','appearance','sexuality','speech_style'].filter(key=>!String(c[key]??'').trim());}
  function readClock(){
    if(!hasTable('application_settings'))return {kind:'unknown',label:'Story clock not set',iso_date:null,updated_at:null};
    const row=one('SELECT value FROM application_settings WHERE key=?',CLOCK_KEY);
    if(!row)return {kind:'unknown',label:'Story clock not set',iso_date:null,updated_at:null};
    try{return JSON.parse(row.value);}catch{throw problem('CLOCK_INVALID','The stored story clock needs local review.',409);}
  }
  function scenePack(args={}){
    shape(args,['perspective_character_id','counterpart_ids','event_limit','include_reference_coverage']);
    const perspective=profile(args.perspective_character_id);
    if(args.counterpart_ids!==undefined&&(!Array.isArray(args.counterpart_ids)||args.counterpart_ids.length>10))throw problem('INVALID_ARGUMENT','counterpart_ids accepts at most 10 character IDs.');
    const counterparts=(args.counterpart_ids||[]).map(id);
    for(const cid of counterparts)profile(cid);
    const limit=args.event_limit===undefined?10:args.event_limit;if(!Number.isInteger(limit)||limit<1||limit>50)throw problem('INVALID_ARGUMENT','event_limit must be 1–50.');
    const includeCoverage=args.include_reference_coverage!==false;
    const relations=all('SELECT r.id,r.source_id,r.target_id,c.name target_name,r.description FROM relationships r JOIN characters c ON c.id=r.target_id WHERE r.source_id=? ORDER BY r.id LIMIT 51',perspective.id);
    const filtered=counterparts.length?relations.filter(r=>counterparts.includes(r.target_id)):relations;
    const canon=one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',perspective.id);
    let coverage=null,references=[];
    if(canon){try{references=JSON.parse(canon.references_json);}catch{throw problem('CANON_INVALID','The approved reference record needs local review.',409);}if(includeCoverage){
      // One query for every reference instead of one query per reference.
      const kinds=new Map(all('SELECT id,kind FROM media WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(references.map(ref=>ref.media_id))).map(row=>[row.id,row.kind]));
      coverage=analyzeReferenceCoverage(references.map(ref=>({...ref,media_kind:kinds.get(ref.media_id)||'missing'})));
    }}
    let known_events={items:[],total:0,next_offset:null,schema_available:false};
    if(events)known_events=events.list({perspective_character_id:perspective.id,character_id:perspective.id,limit});
    const hasMemories=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_memories'");
    const memories=hasMemories?all("SELECT id,kind,text,related_event_id,visibility,status,belief_accuracy,updated_at FROM character_memories WHERE character_id=? AND status='approved' AND visibility IN ('public','participants') ORDER BY rowid DESC LIMIT 21",perspective.id):[];
    return {
      perspective_character_id:perspective.id,
      name:perspective.name,
      aliases:perspective.aliases||'',
      biography:perspective.biography||'',
      personality:perspective.personality||'',
      appearance_working:perspective.appearance||'',
      sexuality:perspective.sexuality||'',
      speech_style:perspective.speech_style||'',
      empty_fields:emptyFields(perspective),
      administrator_notes_included:false,
      relationships:filtered.slice(0,50),
      more_relationships:filtered.length>50,
      approved_appearance:canon?.appearance||null,
      approved_revision_id:canon?.id||null,
      reference_roles:references.map(r=>({media_id:r.media_id,role:r.role,...(r.reference_id?{reference_id:r.reference_id}:{})})),
      reference_coverage:coverage,
      known_events,
      approved_memories:memories.slice(0,20),
      more_memories:memories.length>20,
      story_clock:readClock(),
      knowledge_boundary:'participant',
      message:'Pack contains only public profile text, directed relationships, knowledge-filtered events, and approved memories. Admin notes and drafts are excluded.'
    };
  }
  function listMemories(args={}){
    shape(args,['character_id','perspective_character_id','creator','kind','limit','offset']);
    const cid=id(args.character_id);profile(cid);
    if(args.perspective_character_id!==undefined)id(args.perspective_character_id);
    if(args.creator&&args.perspective_character_id)throw problem('INVALID_ARGUMENT','Choose one knowledge perspective.');
    // Creator access is gated by the caller (mcp/catalogue.mjs checks allowAdminNotes before passing creator:true).
    const page=(v,f,max)=>{if(v===undefined)return f;if(!Number.isInteger(v)||v<0||v>max)throw problem('INVALID_ARGUMENT','Invalid memory pagination.');return v;};
    const limit=page(args.limit,20,50),offset=page(args.offset,0,100000);if(!limit)throw problem('INVALID_ARGUMENT','Limit must be positive.');
    if(!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_memories'"))return {memories:[],next_offset:null,schema_available:false};
    const clauses=['character_id=?'],params=[cid];
    if(!args.creator){clauses.push("status='approved'");clauses.push("visibility IN ('public','participants')");if(args.perspective_character_id&&args.perspective_character_id!==cid)clauses.push("visibility='public'");}
    if(args.kind){if(!memoryKinds.includes(args.kind))throw problem('INVALID_ARGUMENT','Unknown memory kind.');clauses.push('kind=?');params.push(args.kind);}
    const rows=all('SELECT id,character_id,version,kind,text,related_event_id,visibility,status,belief_accuracy,reason,created_at,updated_at FROM character_memories WHERE '+clauses.join(' AND ')+' ORDER BY rowid DESC LIMIT ? OFFSET ?',...params,limit+1,offset);
    return {memories:rows.slice(0,limit),next_offset:rows.length>limit?offset+limit:null,schema_available:true};
  }
  function nextScenes(args={}){
    shape(args,['perspective_character_id','limit']);
    const perspective=args.perspective_character_id?profile(args.perspective_character_id):null;
    const limit=args.limit===undefined?10:args.limit;if(!Number.isInteger(limit)||limit<1||limit>50)throw problem('INVALID_ARGUMENT','limit must be 1–50.');
    const candidates=[];
    if(events&&perspective){
      const known=events.list({perspective_character_id:perspective.id,character_id:perspective.id,limit:50});
      for(const item of known.items||[]){
        const detail=events.get(item.id,{perspective_character_id:perspective.id});
        const consequences=String(detail.consequences||'').trim();
        if(consequences)candidates.push({kind:'unresolved_consequence',event_id:detail.id,title:detail.title,summary:detail.summary,consequences,participants:detail.participants,source:'known_event'});
      }
    }
    if(perspective){
      const relations=all('SELECT r.target_id,c.name target_name,r.description FROM relationships r JOIN characters c ON c.id=r.target_id WHERE r.source_id=? ORDER BY r.id LIMIT 20',perspective.id);
      for(const r of relations)candidates.push({kind:'relationship_thread',character_id:r.target_id,name:r.target_name,description:r.description,source:'relationship'});
      if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_memories'")){
        // Only approved memories may seed scenes, matching scenePack and listMemories.
        const memories=all("SELECT id,kind,text,related_event_id FROM character_memories WHERE character_id=? AND status='approved' ORDER BY rowid DESC LIMIT 20",perspective.id);
        for(const m of memories)candidates.push({kind:'memory_thread',memory_id:m.id,memory_kind:m.kind,text:m.text,related_event_id:m.related_event_id,source:'memory'});
      }
    }
    return {story_clock:readClock(),perspective_character_id:perspective?.id??null,candidates:candidates.slice(0,limit),total_candidates:candidates.length,invented:false,message:'Candidates are drawn only from known unresolved consequences, relationships and memories. No new biographies were invented.'};
  }
  return {scenePack,listMemories,readClock,nextScenes,profile};
}

export function installLivingWorld({db,one,all,run,transaction,fail,writeConfig=null,characterPolicy=null,storyEvents=null,clock=()=>Date.now()}){
  db.exec(readFileSync(new URL('./migrations/025-mcp-living-world.up.sql',import.meta.url),'utf8'));
  const approvalMode=writeConfig?.approval_mode??'review';
  const problem=(code,message,status=400)=>Object.assign(fail(message,status),{code});
  const shape=(value,keys)=>{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw problem('INVALID_ARGUMENT','Unexpected living-world fields.');};
  const id=value=>{if(typeof value!=='string'||!uuid.test(value))throw problem('INVALID_ID','Use a stable catalogue UUID.');return value;};
  const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw problem('INVALID_ARGUMENT','Missing or oversized living-world text.');return value;};
  const requireWrites=()=>{if(writeConfig?.enabled!==true||!['review','trusted'].includes(approvalMode))throw problem('WRITES_DISABLED','MCP living-world writes are not enabled locally.',403);};
  const canApplyTrusted=(row,p)=>approvalMode==='trusted'&&p.authorization_mode==='trusted'&&row.status==='pending';
  const reader=createLivingWorldReader({one,all,events:storyEvents?.reader||null,fail});
  const {scenePack,listMemories,readClock,nextScenes,profile}=reader;
  function memoryPayload(args){
    const c=profile(args.character_id);
    if(!memoryKinds.includes(args.kind))throw problem('INVALID_ARGUMENT','Choose memory, belief, secret, or mistake.');
    const visibility=args.visibility??'participants';if(!memoryVisibility.includes(visibility))throw problem('INVALID_ARGUMENT','Invalid memory visibility.');
    const accuracy=args.belief_accuracy??'unknown';if(!beliefAccuracy.includes(accuracy))throw problem('INVALID_ARGUMENT','Invalid belief_accuracy.');
    if(args.related_event_id!==undefined&&args.related_event_id!==null)id(args.related_event_id);
    return {character_id:c.id,name:c.name,kind:args.kind,text:text(args.text,10000,true),related_event_id:args.related_event_id??null,visibility,belief_accuracy:accuracy,reason:args.reason===undefined?'':text(args.reason,2000)};
  }
  function memoryView(row){const p=JSON.parse(row.payload_json);return {change_id:row.id,change_hash:row.change_hash,operation:'memory_create',status:['pending','approved'].includes(row.status)&&Date.parse(row.expires_at)<=clock()?'expired':row.status,character_id:p.character_id,proposed:p,approval_url:writeConfig.origin+'/mcp-change/'+row.id,authorization_mode:p.authorization_mode??'review',write_policy:approvalMode,approval_required:row.status!=='applied'&&!canApplyTrusted(row,p),result:row.result_json?JSON.parse(row.result_json):null,canon_changed:false};}
  function proposeMemory(args){
    requireWrites();shape(args,['request_key','character_id','kind','text','related_event_id','visibility','belief_accuracy','reason']);
    const requestKey=text(args.request_key,128,true);if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey))throw problem('INVALID_ARGUMENT','Use an 8–128 character idempotency key.');
    const after=memoryPayload(args),requestHash=digest({operation:'memory_create',args});
    return transaction(()=>{
      const existing=one('SELECT * FROM mcp_memory_changes WHERE request_key=?',requestKey);if(existing){if(existing.request_hash!==requestHash)throw problem('IDEMPOTENCY_CONFLICT','This request key already belongs to different memory text.',409);return memoryView(existing);}
      if(one("SELECT COUNT(*) n FROM mcp_memory_changes WHERE status IN ('pending','approved') AND expires_at>?",new Date(clock()).toISOString()).n>=100)throw problem('PROPOSAL_LIMIT','Review existing memory proposals first.',429);
      const p={...after,authorization_mode:approvalMode},changeId=randomUUID(),now=new Date(clock()).toISOString(),expires=new Date(clock()+24*60*60*1000).toISOString();
      run("INSERT INTO mcp_memory_changes(id,request_key,request_hash,change_hash,character_id,payload_json,status,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,?)",changeId,requestKey,requestHash,digest(p),p.character_id,JSON.stringify(p),now,expires);
      return memoryView(one('SELECT * FROM mcp_memory_changes WHERE id=?',changeId));
    });
  }
  function applyMemory(changeId){
    requireWrites();
    return transaction(()=>{
      const row=one('SELECT * FROM mcp_memory_changes WHERE id=?',id(changeId));if(!row)throw problem('NOT_FOUND','Memory proposal not found.',404);
      const p=JSON.parse(row.payload_json);if(digest(p)!==row.change_hash)throw problem('CHANGE_INVALID','Stored memory proposal failed integrity check.',409);
      if(row.status==='applied')return JSON.parse(row.result_json);
      const trusted=canApplyTrusted(row,p);if(!trusted&&(row.status!=='approved'||row.approved_by!==writeConfig.login))throw problem('APPROVAL_REQUIRED','Approve this memory proposal first.',403);
      if(Date.parse(row.expires_at)<=clock()){run("UPDATE mcp_memory_changes SET status='expired' WHERE id=?",row.id);throw problem('EXPIRED','This memory proposal expired.',409);}
      profile(p.character_id);
      const memoryId=randomUUID(),now=new Date(clock()).toISOString(),status='approved';
      run('INSERT INTO character_memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',memoryId,p.character_id,1,p.kind,p.text,p.related_event_id,p.visibility,status,p.belief_accuracy,p.reason||'MCP memory proposal',now,now);
      run('INSERT INTO character_memory_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),memoryId,1,p.kind,p.text,p.related_event_id,p.visibility,status,p.belief_accuracy,p.reason||'MCP memory proposal',trusted?'trusted_local_configuration':'human_review',now);
      const saved={change_id:row.id,status:'applied',authorization:trusted?'trusted_local_configuration':'human_review',memory_id:memoryId,character_id:p.character_id,memory_status:status,applied_at:now,message:'Subjective memory approved for this character. Objective story events and visual canon were not changed.'};
      run("UPDATE mcp_memory_changes SET status='applied',applied_at=?,result_json=? WHERE id=?",saved.applied_at,JSON.stringify(saved),row.id);return saved;
    });
  }
  function proposeEvent(args){
    requireWrites();if(!storyEvents?.create)throw problem('EVENTS_UNAVAILABLE','Story events are unavailable.',503);
    shape(args,['request_key','event','status','reason']);
    const requestKey=text(args.request_key,128,true);if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey))throw problem('INVALID_ARGUMENT','Use an 8–128 character idempotency key.');
    const status=args.status??'proposed';if(!['draft','proposed'].includes(status))throw problem('INVALID_ARGUMENT','New MCP events must be draft or proposed.');
    const requestHash=digest({operation:'event_create',args});
    return transaction(()=>{
      const existing=one('SELECT * FROM mcp_event_changes WHERE request_key=?',requestKey);if(existing){if(existing.request_hash!==requestHash)throw problem('IDEMPOTENCY_CONFLICT','This request key already belongs to a different event.',409);return eventView(existing);}
      if(one("SELECT COUNT(*) n FROM mcp_event_changes WHERE status IN ('pending','approved') AND expires_at>?",new Date(clock()).toISOString()).n>=100)throw problem('PROPOSAL_LIMIT','Review existing event proposals first.',429);
      // Validate by creating through the event service only on apply; store exact payload now.
      const p={event:args.event,status,reason:args.reason===undefined?'':text(args.reason,2000),authorization_mode:approvalMode};
      const changeId=randomUUID(),now=new Date(clock()).toISOString(),expires=new Date(clock()+24*60*60*1000).toISOString();
      run("INSERT INTO mcp_event_changes(id,request_key,request_hash,change_hash,payload_json,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)",changeId,requestKey,requestHash,digest(p),JSON.stringify(p),now,expires);
      return eventView(one('SELECT * FROM mcp_event_changes WHERE id=?',changeId));
    });
  }
  function eventView(row){const p=JSON.parse(row.payload_json);return {change_id:row.id,change_hash:row.change_hash,operation:'event_create',status:['pending','approved'].includes(row.status)&&Date.parse(row.expires_at)<=clock()?'expired':row.status,proposed:p,approval_url:writeConfig.origin+'/mcp-change/'+row.id,authorization_mode:p.authorization_mode??'review',write_policy:approvalMode,approval_required:row.status!=='applied'&&!canApplyTrusted(row,p),result:row.result_json?JSON.parse(row.result_json):null,story_canon_approved:false};}
  function applyEvent(changeId){
    requireWrites();if(!storyEvents?.create)throw problem('EVENTS_UNAVAILABLE','Story events are unavailable.',503);
    const row=one('SELECT * FROM mcp_event_changes WHERE id=?',id(changeId));if(!row)throw problem('NOT_FOUND','Event proposal not found.',404);
    const p=JSON.parse(row.payload_json);if(digest(p)!==row.change_hash)throw problem('CHANGE_INVALID','Stored event proposal failed integrity check.',409);
    if(row.status==='applied')return JSON.parse(row.result_json);
    const trusted=canApplyTrusted(row,p);if(!trusted&&(row.status!=='approved'||row.approved_by!==writeConfig.login))throw problem('APPROVAL_REQUIRED','Approve this event proposal first.',403);
    if(Date.parse(row.expires_at)<=clock()){run("UPDATE mcp_event_changes SET status='expired' WHERE id=?",row.id);throw problem('EXPIRED','This event proposal expired.',409);}
    const created=storyEvents.create({request_key:'mcp-event-'+row.id,event:p.event,status:p.status});
    const saved={change_id:row.id,status:'applied',authorization:trusted?'trusted_local_configuration':'human_review',event_id:created.id,event_status:created.status,applied_at:new Date(clock()).toISOString(),message:'Event stored without visual-canon change. Story approval remains a separate creator action when required.'};
    run("UPDATE mcp_event_changes SET status='applied',applied_at=?,result_json=? WHERE id=?",saved.applied_at,JSON.stringify(saved),row.id);return saved;
  }
  function proposeClock(args){
    requireWrites();shape(args,['request_key','kind','label','iso_date','reason']);
    const requestKey=text(args.request_key,128,true);if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey))throw problem('INVALID_ARGUMENT','Use an 8–128 character idempotency key.');
    const kind=args.kind;if(!['exact','approximate','unknown'].includes(kind))throw problem('INVALID_ARGUMENT','Clock kind must be exact, approximate, or unknown.');
    const iso=args.iso_date??null;if(iso!==null&&(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso)))throw problem('INVALID_ARGUMENT','iso_date must be YYYY-MM-DD or null.');
    const requestHash=digest({operation:'clock_update',args});
    return transaction(()=>{
      const existing=one('SELECT * FROM mcp_clock_changes WHERE request_key=?',requestKey);if(existing){if(existing.request_hash!==requestHash)throw problem('IDEMPOTENCY_CONFLICT','This request key already belongs to a different clock value.',409);return clockView(existing);}
      const before=readClock(),after={kind,label:text(args.label??'',200),iso_date:iso,updated_at:new Date(clock()).toISOString()};
      const p={before,after,reason:args.reason===undefined?'':text(args.reason,2000),authorization_mode:approvalMode};
      const changeId=randomUUID(),now=new Date(clock()).toISOString(),expires=new Date(clock()+24*60*60*1000).toISOString();
      run("INSERT INTO mcp_clock_changes(id,request_key,request_hash,change_hash,payload_json,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)",changeId,requestKey,requestHash,digest(p),JSON.stringify(p),now,expires);
      return clockView(one('SELECT * FROM mcp_clock_changes WHERE id=?',changeId));
    });
  }
  function clockView(row){const p=JSON.parse(row.payload_json);return {change_id:row.id,change_hash:row.change_hash,operation:'clock_update',status:['pending','approved'].includes(row.status)&&Date.parse(row.expires_at)<=clock()?'expired':row.status,original:p.before,proposed:p.after,approval_url:writeConfig.origin+'/mcp-change/'+row.id,authorization_mode:p.authorization_mode??'review',write_policy:approvalMode,approval_required:row.status!=='applied'&&!canApplyTrusted(row,p),result:row.result_json?JSON.parse(row.result_json):null};}
  function applyClock(changeId){
    requireWrites();
    return transaction(()=>{
      const row=one('SELECT * FROM mcp_clock_changes WHERE id=?',id(changeId));if(!row)throw problem('NOT_FOUND','Clock proposal not found.',404);
      const p=JSON.parse(row.payload_json);if(digest(p)!==row.change_hash)throw problem('CHANGE_INVALID','Stored clock proposal failed integrity check.',409);
      if(row.status==='applied')return JSON.parse(row.result_json);
      const trusted=canApplyTrusted(row,p);if(!trusted&&(row.status!=='approved'||row.approved_by!==writeConfig.login))throw problem('APPROVAL_REQUIRED','Approve this clock proposal first.',403);
      if(Date.parse(row.expires_at)<=clock()){run("UPDATE mcp_clock_changes SET status='expired' WHERE id=?",row.id);throw problem('EXPIRED','This clock proposal expired.',409);}
      if(JSON.stringify(readClock())!==JSON.stringify(p.before)){run("UPDATE mcp_clock_changes SET status='conflict' WHERE id=?",row.id);throw problem('STALE_CLOCK','The story clock changed. Prepare a new proposal.',409);}
      if(one('SELECT 1 FROM application_settings WHERE key=?',CLOCK_KEY))run('UPDATE application_settings SET value=? WHERE key=?',JSON.stringify(p.after),CLOCK_KEY);
      else run('INSERT INTO application_settings(key,value) VALUES(?,?)',CLOCK_KEY,JSON.stringify(p.after));
      const saved={change_id:row.id,status:'applied',authorization:trusted?'trusted_local_configuration':'human_review',clock:p.after,applied_at:new Date(clock()).toISOString()};
      run("UPDATE mcp_clock_changes SET status='applied',applied_at=?,result_json=? WHERE id=?",saved.applied_at,JSON.stringify(saved),row.id);return saved;
    });
  }
  async function service({p,body,req,json,authenticate}){
    if(p!=='/api/mcp-living-world')return false;
    try{
      authenticate(req.headers.authorization);
      if(req.method!=='POST'||!body||Object.keys(body).some(k=>!['operation','arguments'].includes(k)))throw problem('INVALID_ARGUMENT','Use a scoped living-world operation.');
      const args=body.arguments||{};let result;
      if(body.operation==='capabilities'){shape(args,[]);result={enabled:true,approval_mode:approvalMode,version:1};}
      else if(body.operation==='memory_propose')result=proposeMemory(args);
      else if(body.operation==='memory_apply'){shape(args,['change_id']);result=applyMemory(args.change_id);}
      else if(body.operation==='event_propose')result=proposeEvent(args);
      else if(body.operation==='event_apply'){shape(args,['change_id']);result=applyEvent(args.change_id);}
      else if(body.operation==='clock_propose')result=proposeClock(args);
      else if(body.operation==='clock_apply'){shape(args,['change_id']);result=applyClock(args.change_id);}
      else throw problem('UNKNOWN_OPERATION','This living-world operation is not available.');
      // Auto-apply trusted proposals for propose operations when approval not required.
      if(approvalMode==='trusted'&&result?.approval_required===false&&result?.change_id&&body.operation.endsWith('_propose')){
        const apply={memory_propose:applyMemory,event_propose:applyEvent,clock_propose:applyClock}[body.operation];
        if(apply)result={...result,...apply(result.change_id),approval_required:false};
      }
      json(result);
    }catch(e){json({error:e.status?e.message:'The living-world change could not be processed.',code:e.code||'LIVING_WORLD_UNAVAILABLE'},e.status||500);}
    return true;
  }
  return {scenePack,listMemories,readClock,nextScenes,proposeMemory,applyMemory,proposeEvent,applyEvent,proposeClock,applyClock,service};
}
