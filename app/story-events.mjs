import {backup,DatabaseSync} from 'node:sqlite';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const error=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const identifier=value=>{if(typeof value!=='string'||!uuid.test(value))throw error('Use a stable catalogue UUID.');return value;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const statuses=['draft','proposed','approved','rejected','archived'];
const shape=(value,keys)=>{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw error('Unexpected event fields.');};
const text=(value,max=30000,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw error('Missing or oversized event text.');return value.trim();};
const literalText=(value,max)=>{text(value,max);return value;};
const array=(value,max)=>{if(!Array.isArray(value)||value.length>max)throw error('Invalid event list.');return value;};
const date=value=>{if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw error('Use a valid YYYY-MM-DD date, or leave it unknown.');return value;};
const unique=values=>{if(new Set(values).size!==values.length)throw error('Duplicate event links are not allowed.');return values;};

// Called before any startup schema changes. SQLite online backup includes WAL data.
export async function backupBeforeStoryMigration(db,dataDir){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_events'").get())return null;
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='characters'").get())return null;
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'before-story-events-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});
  try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw error('Pre-migration backup verification failed.',500);}finally{copy.close();}
  return file;
}

// Read-only projection is shared by HTTP and MCP. Filtering happens before counts,
// search, pagination and detail lookup, including unknown/private event references.
export function createEventReader(db,{creator=false}={}){
  const one=(sql,...args)=>db.prepare(sql).get(...args);
  const all=(sql,...args)=>db.prepare(sql).all(...args);
  const available=()=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_events'");
  function access(args){
    if(args.perspective_character_id!==undefined)identifier(args.perspective_character_id);
    if(args.creator!==undefined&&typeof args.creator!=='boolean')throw error('Invalid creator flag.');
    if(args.creator&&!creator)throw error('Creator event access is disabled in this connector.',403);
    if(args.creator&&args.perspective_character_id)throw error('Choose one knowledge perspective.');
    const clauses=[],params=[];
    if(!args.creator){
      clauses.push("r.status='approved'");
      let scope="json_extract(r.payload_json,'$.visibility')='public'";
      if(args.perspective_character_id){scope+=" OR (json_extract(r.payload_json,'$.visibility')='participants' AND EXISTS(SELECT 1 FROM story_event_participants kp WHERE kp.event_id=e.id AND kp.character_id=? AND kp.knows=1))";params.push(args.perspective_character_id);}
      clauses.push('('+scope+')');
    }
    return {clauses,params};
  }
  function present(row,args,details=false){
    const p=JSON.parse(row.payload_json),result={id:row.id,version:row.version,status:row.status,title:p.title,summary:p.summary,chronology:p.chronology,timeline:p.timeline,visibility:p.visibility,created_at:row.created_at,updated_at:row.revised_at};
    result.participants=all('SELECT p.character_id,c.name,p.role,p.knows FROM story_event_participants p JOIN characters c ON c.id=p.character_id WHERE event_id=? ORDER BY c.name,p.character_id',row.id).map(({knows,...p})=>({...p,...(args.creator?{knows:!!knows}:{})}));
    result.locations=all('SELECT l.id,l.name FROM story_event_locations el JOIN locations l ON l.id=el.location_id WHERE el.event_id=? ORDER BY l.name,l.id',row.id);
    if(details){result.details=p.details;result.consequences=p.consequences;result.sources=p.sources;result.tags=p.tags;result.chronology={...p.chronology};
      for(const field of ['before_event_id','after_event_id'])if(p.chronology[field]&&!visible(p.chronology[field],args))result.chronology[field]=null;
      result.related_event_ids=p.related_event_ids.filter(id=>visible(id,args));
      if(args.creator){result.actor=row.actor;result.reason=row.reason;}
    }else{result.chronology={...p.chronology};delete result.chronology.before_event_id;delete result.chronology.after_event_id;}
    return result;
  }
  const select='SELECT e.id,e.version,e.created_at,r.status,r.payload_json,r.actor,r.reason,r.created_at revised_at FROM story_events e JOIN story_event_revisions r ON r.event_id=e.id AND r.version=e.version';
  function visible(id,args){const {clauses,params}=access(args);return one(select+' WHERE e.id=?'+clauses.map(c=>' AND '+c).join(''),id,...params);}
  function get(id,args={}){identifier(id);access(args);const row=available()?visible(id,args):null;if(!row)throw error('Event not found in this knowledge scope.',404);return present(row,args,true);}
  function list(args={}){
    shape(args,['character_id','perspective_character_id','creator','search','status','location_id','source','timeline','tag','chronology','from','to','limit','offset']);
    const {clauses,params}=access(args);
    const page=(v,f,max)=>{if(v===undefined)return f;if(!Number.isInteger(v)||v<0||v>max)throw error('Invalid event pagination.');return v;};
    const limit=page(args.limit,20,50),offset=page(args.offset,0,100000);if(!limit)throw error('Limit must be positive.');
    for(const [key,table,column] of [['character_id','story_event_participants','character_id'],['location_id','story_event_locations','location_id']])if(args[key]){identifier(args[key]);clauses.push(`EXISTS(SELECT 1 FROM ${table} f WHERE f.event_id=e.id AND f.${column}=?)`);params.push(args[key]);}
    if(args.status){if(!statuses.includes(args.status))throw error('Unknown event status.');clauses.push('r.status=?');params.push(args.status);}
    for(const key of ['timeline','chronology'])if(args[key]){clauses.push(`json_extract(r.payload_json,'$.${key==='chronology'?'chronology.kind':key}')=?`);params.push(text(args[key],200));}
    for(const key of ['search','source','tag'])if(args[key]){
      const term=text(args[key],120).replace(/[\\%_]/g,'\\$&');
      clauses.push(key==='search'?"(json_extract(r.payload_json,'$.title') LIKE ? ESCAPE '\\' OR json_extract(r.payload_json,'$.summary') LIKE ? ESCAPE '\\' OR json_extract(r.payload_json,'$.details') LIKE ? ESCAPE '\\')":key==='tag'?"EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.tags') t WHERE t.value=?)":"EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.sources') s WHERE json_extract(s.value,'$.system') LIKE ? ESCAPE '\\')");
      params.push(...(key==='search'?Array(3).fill('%'+term+'%'):[key==='tag'?args[key]:'%'+term+'%']));
    }
    const from=date(args.from),to=date(args.to);if(from&&to&&from>to)throw error('Invalid date range.');
    if(from){clauses.push("COALESCE(json_extract(r.payload_json,'$.chronology.end'),json_extract(r.payload_json,'$.chronology.start'))>=?");params.push(from);}
    if(to){clauses.push("json_extract(r.payload_json,'$.chronology.start')<=?");params.push(to);}
    if(!available())return {items:[],total:0,next_offset:null,schema_available:false};
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=one('SELECT COUNT(*) n FROM ('+select+where+')',...params).n;
    const rows=all(select+where+" ORDER BY json_extract(r.payload_json,'$.chronology.start') IS NULL,json_extract(r.payload_json,'$.chronology.start'),e.created_at,e.id LIMIT ? OFFSET ?",...params,limit,offset);
    return {items:rows.map(row=>present(row,args)),total,next_offset:offset+limit<total?offset+limit:null,schema_available:true};
  }
  // One SQLite snapshot across visibility, counts, links and payload, including
  // concurrent desktop writes while a separate MCP process is reading.
  function snapshot(fn){db.exec('SAVEPOINT story_event_read');try{const result=fn();db.exec('RELEASE story_event_read');return result;}catch(e){db.exec('ROLLBACK TO story_event_read; RELEASE story_event_read');throw e;}}
  return {get:(...args)=>snapshot(()=>get(...args)),list:(...args)=>snapshot(()=>list(...args))};
}

export function installStoryEvents({db,transaction}){
  transaction(()=>db.exec(readFileSync(new URL('./migrations/017-story-events.up.sql',import.meta.url),'utf8')));
  const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  const reader=createEventReader(db,{creator:true});
  function normalize(input){
    shape(input,['title','summary','details','consequences','participants','location_ids','sources','chronology','timeline','visibility','tags','related_event_ids']);
    const p={title:text(input.title,200,true),summary:text(input.summary,3000,true),details:text(input.details??''),consequences:text(input.consequences??''),timeline:text(input.timeline??'main',200,true),visibility:input.visibility??'admin'};
    if(!['admin','participants','public'].includes(p.visibility))throw error('Unknown event visibility.');
    p.participants=array(input.participants??[],100).map(person=>{shape(person,['character_id','role','knows']);identifier(person.character_id);if(!one('SELECT 1 FROM characters WHERE id=?',person.character_id))throw error('Unknown participant.');if(person.knows!==undefined&&typeof person.knows!=='boolean')throw error('Invalid knowledge flag.');return {character_id:person.character_id,role:text(person.role??'participant',200,true),knows:person.knows===true};}).sort((a,b)=>a.character_id.localeCompare(b.character_id));
    unique(p.participants.map(person=>person.character_id));
    p.location_ids=unique(array(input.location_ids??[],30).map(id=>{identifier(id);if(!one('SELECT 1 FROM locations WHERE id=?',id))throw error('Unknown location.');return id;})).sort();
    p.sources=array(input.sources??[],30).map(source=>{shape(source,['system','external_id','url','locator','excerpt','sha256','imported_at']);const s={system:text(source.system,200,true),external_id:text(source.external_id??'',500),url:text(source.url??'',2000),locator:text(source.locator??'',1000),excerpt:literalText(source.excerpt??'',10000),sha256:text(source.sha256??'',64),imported_at:text(source.imported_at??'',40)};if(s.url){let u;try{u=new URL(s.url);}catch{throw error('Invalid source URL.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw error('Use an HTTP source URL without credentials.');}if(s.sha256&&!/^[a-f0-9]{64}$/i.test(s.sha256))throw error('Invalid source checksum.');if(s.imported_at&&!Number.isFinite(Date.parse(s.imported_at)))throw error('Invalid import timestamp.');return s;});
    if(!p.sources.length)throw error('Record at least one source, including creator-authored events.');
    const c=input.chronology??{kind:'unknown'};shape(c,['kind','start','end','label','before_event_id','after_event_id']);
    if(!['exact','approximate','range','relative','unknown'].includes(c.kind))throw error('Unknown chronology type.');
    p.chronology={kind:c.kind,start:date(c.start),end:date(c.end),label:text(c.label??'',1000),before_event_id:c.before_event_id??null,after_event_id:c.after_event_id??null};
    if(c.kind==='unknown'&&(p.chronology.start||p.chronology.end))throw error('Unknown chronology must not invent dates.');
    if(['exact','approximate','range'].includes(c.kind)&&!p.chronology.start)throw error('This chronology needs a start date.');
    if(c.kind==='range'&&!p.chronology.end)throw error('A range needs both dates.');
    if(c.kind==='exact'&&p.chronology.end&&p.chronology.end!==p.chronology.start)throw error('Use range for multiple dates.');
    if(p.chronology.end&&(!p.chronology.start||p.chronology.end<p.chronology.start))throw error('Chronology end precedes its start.');
    if(c.kind==='relative'&&!p.chronology.label&&!c.before_event_id&&!c.after_event_id)throw error('Describe the relative order.');
    p.tags=unique(array(input.tags??[],30).map(tag=>text(tag,100,true))).sort();
    p.related_event_ids=unique(array(input.related_event_ids??[],50).map(identifier)).sort();
    for(const id of [...p.related_event_ids,c.before_event_id,c.after_event_id].filter(Boolean)){identifier(id);if(!one('SELECT 1 FROM story_events WHERE id=?',id))throw error('Unknown linked event.');}
    if(Buffer.byteLength(JSON.stringify(p))>160*1024)throw error('This event is too large. Keep the account below 160 KB and reference longer source material with a locator.');
    return p;
  }
  function validateLinks(id,p){
    if([...p.related_event_ids,p.chronology.before_event_id,p.chronology.after_event_id].includes(id))throw error('An event cannot reference itself.');
    // Edges mean earlier -> later; unknown chronology stays unordered.
    const edges=new Map();const add=(a,b)=>{if(a&&b)edges.set(a,[...(edges.get(a)||[]),b]);};
    for(const row of all('SELECT e.id,r.payload_json FROM story_events e JOIN story_event_revisions r ON r.event_id=e.id AND r.version=e.version WHERE e.id<>?',id)){const c=JSON.parse(row.payload_json).chronology;add(row.id,c.before_event_id);add(c.after_event_id,row.id);}
    add(id,p.chronology.before_event_id);add(p.chronology.after_event_id,id);
    const done=new Set(),active=new Set();function visit(node){if(active.has(node))throw error('Relative chronology would create a cycle.');if(done.has(node))return;active.add(node);for(const next of edges.get(node)||[])visit(next);active.delete(node);done.add(node);}for(const node of edges.keys())visit(node);
  }
  function append(id,version,p,status,reason){
    validateLinks(id,p);
    for(const source of p.sources.filter(s=>s.external_id)){
      const key=hash([source.system,source.external_id]),owner=one('SELECT event_id FROM story_event_source_keys WHERE source_key=?',key);
      if(owner&&owner.event_id!==id)throw error('This source event already belongs to another shared record.',409);
      run('INSERT OR IGNORE INTO story_event_source_keys VALUES(?,?,?,?)',key,id,source.system,source.external_id);
    }
    const at=new Date().toISOString();
    run('INSERT INTO story_event_revisions VALUES(?,?,?,?,?,?,?)',id,version,status,JSON.stringify(p),'local-creator',text(reason,3000,true),at);
    run('UPDATE story_events SET version=? WHERE id=?',version,id);
    run('DELETE FROM story_event_participants WHERE event_id=?',id);run('DELETE FROM story_event_locations WHERE event_id=?',id);
    for(const person of p.participants)run('INSERT INTO story_event_participants VALUES(?,?,?,?)',id,person.character_id,person.role,+person.knows);
    for(const place of p.location_ids)run('INSERT INTO story_event_locations VALUES(?,?)',id,place);
    return reader.get(id,{creator:true});
  }
  function current(id,expected){identifier(id);const row=one('SELECT e.version,r.status,r.payload_json FROM story_events e JOIN story_event_revisions r ON r.event_id=e.id AND r.version=e.version WHERE e.id=?',id);if(!row)throw error('Event not found.',404);if(!Number.isInteger(expected)||row.version!==expected)throw error('This event changed. Reload and review the latest version; your draft is retained.',409);return row;}
  function create(body){
    shape(body,['request_key','event','status']);const key=text(body.request_key,200,true),p=normalize(body.event),status=body.status??'draft';if(!['draft','proposed'].includes(status))throw error('New events must be drafts or proposals.');
    const requestHash=hash({p,status}),source=p.sources.find(s=>s.external_id),importKey=source?hash([source.system,source.external_id]):null;
    return transaction(()=>{const previous=one('SELECT * FROM story_events WHERE request_key=?',key);if(previous){if(previous.request_hash!==requestHash)throw error('This request key already saved different content.',409);return reader.get(previous.id,{creator:true});}
      if(importKey&&one('SELECT 1 FROM story_events WHERE import_key=?',importKey))throw error('This source event already exists. Edit its shared record instead of importing another copy.',409);
      const id=randomUUID();run('INSERT INTO story_events VALUES(?,1,?,?,?,?)',id,key,requestHash,importKey,new Date().toISOString());return append(id,1,p,status,'Created event; approval is separate.');});
  }
  function update(id,body){shape(body,['expected_version','event','reason']);return transaction(()=>{const row=current(id,body.expected_version),p=normalize(body.event);return append(id,row.version+1,p,row.status==='approved'?'proposed':'draft',body.reason||'Edited event; requires review.');});}
  function decide(id,body){shape(body,['expected_version','status','reason']);if(!statuses.includes(body.status))throw error('Unknown event decision.');return transaction(()=>{const row=current(id,body.expected_version);if(row.status===body.status)throw error('This event already has that status.',409);return append(id,row.version+1,JSON.parse(row.payload_json),body.status,body.reason);});}
  function history(id){reader.get(id,{creator:true});return {items:all('SELECT version,status,actor,reason,created_at FROM story_event_revisions WHERE event_id=? ORDER BY version DESC',id)};}
  function revision(id,version){reader.get(id,{creator:true});const row=one('SELECT * FROM story_event_revisions WHERE event_id=? AND version=?',id,version);if(!row)throw error('Revision not found.',404);return {...row,event:JSON.parse(row.payload_json),payload_json:undefined};}
  function validateRestore(){
    for(const event of all('SELECT id,version FROM story_events')){
      const revisions=all('SELECT version,payload_json FROM story_event_revisions WHERE event_id=? ORDER BY version',event.id);
      if(revisions.length!==event.version||revisions.some((r,i)=>r.version!==i+1))throw error('Incomplete event revision history in backup.');
      for(const revision of revisions){const p=normalize(JSON.parse(revision.payload_json));
        if([...p.related_event_ids,p.chronology.before_event_id,p.chronology.after_event_id].includes(event.id))throw error('Invalid self-reference in event backup.');
        for(const source of p.sources.filter(s=>s.external_id)){
          const key=hash([source.system,source.external_id]),owner=one('SELECT event_id FROM story_event_source_keys WHERE source_key=?',key);
          if(owner&&owner.event_id!==event.id)throw error('Conflicting source identities in event backup.');
          run('INSERT OR IGNORE INTO story_event_source_keys VALUES(?,?,?,?)',key,event.id,source.system,source.external_id);
        }
        if(revision.version===event.version){
          validateLinks(event.id,p);
          const people=all('SELECT character_id,role,knows FROM story_event_participants WHERE event_id=? ORDER BY character_id',event.id).map(v=>({...v,knows:!!v.knows}));
          const places=all('SELECT location_id FROM story_event_locations WHERE event_id=? ORDER BY location_id',event.id).map(v=>v.location_id);
          if(hash(people)!==hash(p.participants)||hash(places)!==hash(p.location_ids))throw error('Event links do not match the current revision in backup.');
        }
      }
    }
  }
  function handle({p,req,body,url,json}){
    if(p==='/api/events'&&req.method==='GET'){const args=Object.fromEntries(url.searchParams);for(const key of ['limit','offset'])if(args[key]!==undefined)args[key]=Number(args[key]);args.creator=args.creator===undefined?true:args.creator==='true';if(args.perspective_character_id)args.creator=false;json(reader.list(args));return true;}
    if(p==='/api/events'&&req.method==='POST'){json(create(body),201);return true;}
    const timeline=p.match(/^\/api\/characters\/([^/]+)\/timeline$/);if(timeline&&req.method==='GET'){identifier(timeline[1]);if(!one('SELECT 1 FROM characters WHERE id=?',timeline[1]))throw error('Character not found.',404);json(reader.list({creator:true,...Object.fromEntries(url.searchParams),character_id:timeline[1],limit:Number(url.searchParams.get('limit')??20),offset:Number(url.searchParams.get('offset')??0)}));return true;}
    const route=p.match(/^\/api\/events\/([^/]+)(?:\/(decision|history|revisions\/([0-9]+)))?$/);if(!route)return false;
    if(req.method==='GET'&&!route[2])json(reader.get(route[1],{creator:true}));
    else if(req.method==='PUT'&&!route[2])json(update(route[1],body));
    else if(req.method==='POST'&&route[2]==='decision')json(decide(route[1],body));
    else if(req.method==='GET'&&route[2]==='history')json(history(route[1]));
    else if(req.method==='GET'&&route[3])json(revision(route[1],Number(route[3])));
    else throw error('Event operation not available.',405);
    return true;
  }
  return {handle,reader,validateRestore};
}
