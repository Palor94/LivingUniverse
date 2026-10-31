import {randomUUID,randomBytes} from 'node:crypto';
import {digest} from './character-edit.mjs';
import {tagKey} from './taxonomy.mjs';
import {findNameMentions} from './hungarian-names.mjs';


const problem=(code,message,status=400)=>{throw Object.assign(new Error(message),{code,status});};
const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))problem('INVALID_ARGUMENT','Érvénytelen átnevezési kérés.');};
const q=s=>'"'+s.replaceAll('"','""')+'"';
const prefix='rename:v1:';
const fields={characters:['biography','personality','appearance','sexuality','speech_style','notes'],relationships:['description'],media_notes:['notes','tags'],locations:['name'],location_profiles:['english_name','category','description']};
const pathValue=(v,path)=>path.reduce((o,k)=>o[k],v);
const setValue=(v,path,value)=>{let o=v;for(const k of path.slice(0,-1))o=o[k];o[path.at(-1)]=value;};
const keyOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);

// Uses the existing portable application_settings table. Preparing never changes
// domain records. Exact plans, decisions and compensating receipts survive restart.
export function installCharacterRename({db,all,one,run,transaction,isBusy=()=>false,clock=()=>Date.now(),validateLocations=()=>{}}){
  const csrf=randomBytes(32).toString('hex');
  const read=id=>{const row=one('SELECT value FROM application_settings WHERE key=?',prefix+'plan:'+id);if(!row)problem('NOT_FOUND','Nincs ilyen átnevezési előnézet.',404);const p=JSON.parse(row.value);if(p.hash!==digest(p.payload))problem('PLAN_CORRUPT','Az előnézet sérült.',409);return p;};
  const store=p=>run('INSERT INTO application_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',prefix+'plan:'+p.id,JSON.stringify(p));
  const audit=(id,event,actor,detail)=>run('INSERT INTO application_settings VALUES(?,?)',prefix+'audit:'+randomUUID(),JSON.stringify({plan_id:id,event,actor,detail,at:new Date(clock()).toISOString()}));
  function character(id){const c=one('SELECT * FROM characters WHERE id=?',id);if(!c||id.startsWith('system:')||one('SELECT 1 FROM character_ui WHERE character_id=? AND merged_into IS NOT NULL',id))problem('NOT_FOUND','Válassz meglévő, aktív karaktert.',404);return c;}
  function collision(id,name){
    const nameKey=v=>tagKey(v).replace(/\s+/gu,' '),normalized=nameKey(name);
    for(const c of all('SELECT id,name,aliases FROM characters WHERE id<>?',id))if([c.name,...c.aliases.split(/[,;\n]/u)].some(n=>nameKey(n)===normalized))problem('NAME_COLLISION','A név egy másik karakter neve vagy aliasa.',409);
  }
  function capture(){
    const sources=[],snapshot=[];let bytes=0,rows=0;
    for(const {name:table} of all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")){
      const columns=all('PRAGMA table_info('+q(table)+')'),pk=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
      if(!pk.length)problem('UNSUPPORTED_SCHEMA','Hiányzó stabil rekordkulcs: '+table,409);
      const data=all('SELECT * FROM '+q(table)+' ORDER BY '+pk.map(q).join(','));
      for(const row of data){
        if(table==='application_settings'&&row.key.startsWith(prefix))continue;
        if(table==='folder_changes'&&JSON.parse(row.manifest_json||'{}').character_rename===true)continue;
        rows++;bytes+=Buffer.byteLength(JSON.stringify(row));if(rows>100000||bytes>40*1024*1024)problem('SCAN_LIMIT','A teljes keresés túl nagy; nem készítünk csonkolt előnézetet.',413);
        snapshot.push([table,row]);
        const locator={table,pk:Object.fromEntries(pk.map(k=>[k,row[k]]))};
        for(const c of columns){
          const value=row[c.name];if(typeof value!=='string'||pk.includes(c.name)||c.name==='data_url'||/sha256|_hash|_token|password|secret/i.test(c.name))continue;
          let parsed;try{if(/^[\[{]/u.test(value.trim()))parsed=JSON.parse(value);}catch{}
          const event=table==='story_event_revisions',current=event&&one('SELECT version FROM story_events WHERE id=?',row.event_id)?.version===row.version;
          const ghost=table==='application_settings'&&row.key.startsWith('ghost:character:');
          function add(text,path=[]){
            let editable=!!fields[table]?.includes(c.name)&&!path.length;
            if(event&&c.name==='payload_json'&&current)editable=['title','summary','details','consequences'].includes(path[0])&&path.length===1||path[0]==='chronology'&&path[1]==='label'||path[0]==='participants'&&path[2]==='role'||path[0]==='tags';
            if(ghost)editable=path[0]==='values'&&['value','interpretation'].includes(path[2])&&path.length===3;
            const links=table==='characters'?[row.id]:table==='relationships'?[row.source_id,row.target_id]:event?all('SELECT character_id FROM story_event_participants WHERE event_id=?',row.event_id).map(p=>p.character_id):table==='media_notes'?all('SELECT character_id FROM depictions WHERE media_id=?',row.media_id).map(p=>p.character_id):ghost?[row.key.slice('ghost:character:'.length)]:[];
            sources.push({locator,column:c.name,path,text,editable,links,kind:event&&current?'event':ghost?'ghost':'row',reason:editable?null:'Védett történet, kánon, alias, eredetadat, azonosító vagy fájlútvonal; külön szerkesztést igényel.'});
          }
          function walk(v,path=[]){if(typeof v==='string')add(v,path);else if(v&&typeof v==='object')for(const [k,item] of Object.entries(v))walk(item,[...path,k]);}
          if(parsed)walk(parsed);else add(value);
        }
      }
    }
    return {sources,version:digest(snapshot)};
  }
  function present(p,{offset=0,limit=100,privateView=false}={}){
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)problem('INVALID_ARGUMENT','Érvénytelen lapozás.');
    const items=p.payload.items.slice(offset,offset+limit).map(({source,...item})=>({...item,...(privateView?{text:p.payload.sources[source]?.text}:{}),...(privateView?{}:{context:undefined,...(p.payload.operation==='undo'&&item.id!=='primary-name'?{before:'[privát diff a jóváhagyási oldalon]',after:'[privát diff a jóváhagyási oldalon]'}:{})})}));
    return {plan_id:p.id,plan_hash:p.hash,character_id:p.payload.character_id,old_name:p.payload.old_name,new_name:p.payload.new_name,operation:p.payload.operation,status:p.status,approval_required:p.status==='pending',total:p.payload.items.length,items,next_offset:offset+limit<p.payload.items.length?offset+limit:null,created_at:p.created_at,expires_at:p.expires_at,result:p.result??null,undo_of:p.payload.undo_of??null,undone_by:one('SELECT value FROM application_settings WHERE key=?',prefix+'undone:'+p.id)?.value??null,history:p.history||[],review_path:'/character-rename.html?plan='+p.id};
  }
  function get(args,privateView=false){shape(args,['plan_id','offset','limit']);return present(read(args.plan_id),{...args,privateView});}
  function requestReplay(args,operation){if(!keyOK(args.request_key))problem('INVALID_ARGUMENT','Adj meg 8–128 karakteres request_key értéket.');const requestHash=digest({operation,args});const prior=one('SELECT value FROM application_settings WHERE key=?',prefix+'request:'+args.request_key);if(prior){const r=JSON.parse(prior.value);if(r.hash!==requestHash)problem('IDEMPOTENCY_CONFLICT','A kérésazonosító már más tartalomhoz tartozik.',409);return {prior:read(r.id)};}return {requestHash};}
  function savePlan(payload,args,requestHash){
    if(payload.items.length>3000||Buffer.byteLength(JSON.stringify(payload))>8*1024*1024)problem('PLAN_LIMIT','Túl sok találat; csonkolt előnézetet nem mentünk.',413);
    const p={id:randomUUID(),hash:digest(payload),payload,status:'pending',created_at:new Date(clock()).toISOString(),expires_at:new Date(clock()+24*3600e3).toISOString(),history:[]};store(p);
    run('INSERT INTO application_settings VALUES(?,?)',prefix+'request:'+args.request_key,JSON.stringify({hash:requestHash,id:p.id}));audit(p.id,'prepared','service',{operation:payload.operation});return present(p);
  }
  function prepare(args){
    shape(args,['request_key','character_id','new_name']);
    return transaction(()=>{
      const replay=requestReplay(args,'rename');if(replay.prior)return present(replay.prior);
      const c=character(args.character_id),name=args.new_name;
      if(typeof name!=='string'||!name.trim()||name.length>200||/[\x00-\x1f\x7f]/u.test(name))problem('INVALID_ARGUMENT','A név 1–200 karakter lehet.');
      const newName=name.trim().normalize('NFC').replace(/\s+/gu,' ');if(c.name===newName)problem('NO_CHANGE','Ez már a karakter neve.');collision(c.id,newName);
      const captureData=capture(),sources=[],items=[];
      const names=all('SELECT id,name,aliases FROM characters WHERE id<>?',c.id);
      for(const s of captureData.sources){
        if(s.locator.table==='characters'&&s.locator.pk.id===c.id&&s.column==='name')continue;
        const mentions=findNameMentions(s.text,c.name,newName);if(!mentions.length)continue;
        const source=sources.push(s)-1;
        for(const mention of mentions){
          // Homonyms and full-name contexts can refer to another catalogue person.
          const others=names.filter(n=>[n.name,...n.aliases.split(/[,;\n]/u)].some(v=>v.trim()&&v.toLocaleLowerCase('hu').includes(c.name.toLocaleLowerCase('hu'))));
          const other=others.some(n=>s.links.includes(n.id)||s.text.toLocaleLowerCase('hu').includes(n.name.toLocaleLowerCase('hu')));
          const ambiguous=other||others.length>0||!s.links.includes(c.id)||mention.after===null;
          const editable=s.editable&&mention.after!==null;
          items.push({id:'hit-'+items.length,source,table:s.locator.table,record_key:s.locator.pk,field:[s.column,...s.path].join('.'),...mention,editable,classification:!editable?'protected':other?'other_person':ambiguous?'uncertain':'linked',reason:!editable?s.reason||'A toldalék vagy az új név ragozása külön kézi ellenőrzést igényel.':other?'Másik karakterre is utalhat.':ambiguous?'A szöveg személyazonossága nem bizonyítható; egyenként ellenőrizd.':'A rekord stabil ID-val kapcsolódik a karakterhez.',context:s.text.slice(Math.max(0,mention.start-90),mention.end+90)});
        }
      }
      items.unshift({id:'primary-name',source:-1,table:'characters',record_key:{id:c.id},field:'name',start:0,end:c.name.length,before:c.name,after:newName,editable:true,classification:'required',reason:'A karakter stabil ID-ja változatlan marad.'});
      const aliases=c.aliases.split(/[,;\n]/u).map(v=>v.trim()).filter(Boolean);
      if(!aliases.some(v=>tagKey(v)===tagKey(c.name))){
        const next=[...aliases,c.name].join('; ');if(next.length>1000)problem('ALIAS_LIMIT','A korábbi név megőrzéséhez az aliaslista túl hosszú.');
        const source=sources.push({locator:{table:'characters',pk:{id:c.id}},column:'aliases',path:[],text:c.aliases,kind:'row'})-1;
        items.push({id:'previous-name-alias',source,table:'characters',record_key:{id:c.id},field:'aliases',start:0,end:c.aliases.length,before:c.aliases,after:next,editable:true,classification:'linked',reason:'A korábbi név kereshető aliasként megmarad.'});
      }
      return savePlan({operation:'rename',character_id:c.id,old_name:c.name,new_name:newName,scope_version:captureData.version,sources,items},args,replay.requestHash);
    });
  }
  function locate(locator){
    // Locators originate from an exact hashed plan; identifiers are still checked
    // against the current schema before any SQL is constructed (including restore).
    const cols=all('PRAGMA table_info('+q(locator.table)+')');const pk=cols.filter(c=>c.pk).map(c=>c.name);
    if(!pk.length||pk.length!==Object.keys(locator.pk).length||pk.some(k=>!Object.hasOwn(locator.pk,k)))problem('PLAN_CORRUPT','Érvénytelen rekordkulcs.',409);
    return one('SELECT * FROM '+q(locator.table)+' WHERE '+pk.map(k=>q(k)+' IS ?').join(' AND '),...pk.map(k=>locator.pk[k]));
  }
  function writeRow(s,before,after,actor){
    if(s.kind==='event'){
      const e=one('SELECT * FROM story_events WHERE id=?',before.event_id);if(e.version!==before.version)problem('STALE_PLAN','Az esemény közben változott.',409);
      const version=e.version+1,status=before.status==='approved'?'proposed':before.status;
      run('INSERT INTO story_event_revisions VALUES(?,?,?,?,?,?,?)',e.id,version,status,after.payload_json,actor,'Character rename; previous revision preserved.',new Date(clock()).toISOString());run('UPDATE story_events SET version=? WHERE id=?',version,e.id);
      const payload=JSON.parse(after.payload_json);for(const p of payload.participants)run('UPDATE story_event_participants SET role=? WHERE event_id=? AND character_id=?',p.role,e.id,p.character_id);
      return {locator:{table:s.locator.table,pk:{event_id:e.id,version}},after:one('SELECT * FROM story_event_revisions WHERE event_id=? AND version=?',e.id,version)};
    }
    if(s.kind==='ghost'){
      const old=JSON.parse(before.value),value=JSON.parse(after.value);value.history??=[];value.history.push({version:old.version,values:old.values,actor,at:new Date(clock()).toISOString(),operation:'character-rename'});value.version=(old.version||0)+1;after.value=JSON.stringify(value);
    }
    if(s.locator.table==='locations'&&before.name!==after.name){
      after.name_key=tagKey(after.name);if(Object.hasOwn(after,'parent_id')?one('SELECT 1 FROM locations WHERE parent_id IS ? AND name_key=? AND id<>?',after.parent_id,after.name_key,after.id):one('SELECT 1 FROM locations WHERE name_key=? AND id<>?',after.name_key,after.id))problem('LOCATION_COLLISION','Az új helyszínnév ütközik egy testvérhelyszínnel.',409);
      if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='location_changes'"))run('INSERT INTO location_changes VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),'edit',after.id,null,null,JSON.stringify(before),JSON.stringify(after),null,new Date(clock()).toISOString());
    }
    const changed=Object.keys(after).filter(k=>after[k]!==before[k]),pk=Object.keys(s.locator.pk);
    if(changed.length)run('UPDATE '+q(s.locator.table)+' SET '+changed.map(k=>q(k)+'=?').join(',')+' WHERE '+pk.map(k=>q(k)+' IS ?').join(' AND '),...changed.map(k=>after[k]),...pk.map(k=>s.locator.pk[k]));
    return {locator:s.locator,after:locate(s.locator)};
  }
  function decide(id,args,actor){
    shape(args,['plan_hash','decision','selected_ids','confirmed_ids']);
    if(!['approve','reject'].includes(args.decision)||typeof actor!=='string'||!actor)problem('INVALID_ARGUMENT','Hiányzó döntés.');
    return transaction(()=>{
      if(isBusy())problem('BUSY','Más katalógusművelet fut. Próbáld újra később.',409);
      const p=read(id);if(args.plan_hash!==p.hash)problem('STALE_PLAN','Töltsd be a pontos előnézetet.',409);
      const decisionHash=digest(args);if(p.status!=='pending'){if(p.decision_hash===decisionHash)return present(p);problem('ALREADY_DECIDED','Ehhez az előnézethez már más döntés tartozik.',409);}
      if(Date.parse(p.expires_at)<=clock())problem('EXPIRED','Az előnézet lejárt. Készíts újat.',409);
      if(args.decision==='reject'){p.status='rejected';p.decision_hash=decisionHash;store(p);audit(id,'rejected',actor,{});return present(p);}
      const selected=args.selected_ids,confirmed=args.confirmed_ids??[];
      if(!Array.isArray(selected)||new Set(selected).size!==selected.length||!Array.isArray(confirmed)||new Set(confirmed).size!==confirmed.length||confirmed.some(v=>!selected.includes(v)))problem('INVALID_ARGUMENT','Érvénytelen kijelölés.');
      const map=new Map(p.payload.items.map(i=>[i.id,i]));
      if(selected.some(v=>!map.get(v)?.editable))problem('PROTECTED_MATCH','Védett vagy ismeretlen találat nem hagyható jóvá.');
      if(!selected.includes('primary-name')||p.payload.operation==='undo'&&selected.length!==p.payload.items.length)problem('INVALID_SELECTION','A név kötelező; visszavonásnál minden eredeti módosítás együtt áll vissza.');
      if(selected.some(v=>['uncertain','other_person'].includes(map.get(v).classification)&&!confirmed.includes(v)))problem('AMBIGUOUS_MATCH','A kétes találatokat egyenként is meg kell erősíteni.');
      if(capture().version!==p.payload.scope_version)problem('STALE_PLAN','A katalógus közben változott. Készíts új előnézetet; semmit nem mentettünk.',409);
      character(p.payload.character_id);collision(p.payload.character_id,p.payload.new_name);
      const groups=new Map();
      for(const hit of selected.map(v=>map.get(v))){
        const s=hit.source===-1?{locator:{table:'characters',pk:{id:p.payload.character_id}},column:'name',path:[],text:p.payload.old_name,kind:'row'}:p.payload.sources[hit.source];
        const key=digest(s.locator);let g=groups.get(key);if(!g){const before=locate(s.locator);if(!before)problem('STALE_PLAN','A rekord már nem létezik.',409);g={s,before,after:structuredClone(before),hits:[]};groups.set(key,g);}g.hits.push({hit,s});
      }
      const mutations=[];
      for(const g of groups.values()){
        const fieldGroups=new Map();for(const h of g.hits){const key=JSON.stringify([h.s.column,h.s.path]);if(!fieldGroups.has(key))fieldGroups.set(key,[]);fieldGroups.get(key).push(h);}
        for(const hs of fieldGroups.values()){
          const s=hs[0].s;let value=s.text;for(const {hit} of hs.sort((a,b)=>b.hit.start-a.hit.start)){if(value.slice(hit.start,hit.end)!==hit.before)problem('PLAN_CORRUPT','Eltérő diff.',409);value=value.slice(0,hit.start)+hit.after+value.slice(hit.end);}
          if(s.path.length){const json=JSON.parse(g.after[s.column]);setValue(json,s.path,value);g.after[s.column]=JSON.stringify(json);}else g.after[s.column]=value;
        }
        const written=writeRow(g.s,g.before,g.after,actor);mutations.push({kind:g.s.kind,original_locator:g.s.locator,locator:written.locator,before:g.before,after:written.after,fields:[...fieldGroups.values()].map(hs=>({column:hs[0].s.column,path:hs[0].s.path}))});
      }
      validateLocations();
      p.status='applied';p.decision_hash=decisionHash;p.mutations=mutations;p.result={applied:true,character_id:p.payload.character_id,name:p.payload.new_name,changed_occurrences:selected.length,actor,applied_at:new Date(clock()).toISOString()};p.history.push({actor,selected_ids:selected,confirmed_ids:confirmed,decision:'approve',at:p.result.applied_at});store(p);audit(id,'applied',actor,p.result);
      if(p.payload.operation==='undo')run('INSERT INTO application_settings VALUES(?,?)',prefix+'undone:'+p.payload.undo_of,p.id);
      return present(p);
    });
  }
  function prepareUndo(args){
    shape(args,['plan_id','request_key']);return transaction(()=>{
      const replay=requestReplay(args,'undo');if(replay.prior)return present(replay.prior);
      const original=read(args.plan_id);if(original.status!=='applied'||original.payload.operation!=='rename')problem('NOT_APPLIED','Csak végrehajtott átnevezés vonható vissza.',409);
      if(one('SELECT 1 FROM application_settings WHERE key=?',prefix+'undone:'+original.id))problem('ALREADY_UNDONE','Ezt az átnevezést már visszavonták.',409);
      for(const m of original.mutations){if(digest(locate(m.locator))!==digest(m.after))problem('UNDO_CONFLICT','Az érintett rekord azóta változott. A későbbi adatot nem írjuk felül.',409);if(m.kind==='event'&&one('SELECT version FROM story_events WHERE id=?',m.after.event_id)?.version!==m.after.version)problem('UNDO_CONFLICT','Az esemény újabb változata már létezik.',409);}
      collision(original.payload.character_id,original.payload.old_name);
      const sources=[],items=[];
      for(const m of original.mutations)for(const f of m.fields){
        const before=f.path.length?pathValue(JSON.parse(m.after[f.column]),f.path):m.after[f.column],after=f.path.length?pathValue(JSON.parse(m.before[f.column]),f.path):m.before[f.column];
        const primary=m.locator.table==='characters'&&f.column==='name'&&m.locator.pk.id===original.payload.character_id;
        const source=primary?-1:sources.push({locator:m.locator,...f,text:before,kind:m.kind})-1;
        items.push({id:primary?'primary-name':'undo-'+items.length,source,table:m.locator.table,record_key:m.locator.pk,field:[f.column,...f.path].join('.'),start:0,end:before.length,before,after,editable:true,classification:primary?'required':'linked',reason:'Az eredeti, jóváhagyott változtatás pontos visszavonása.'});
      }
      return savePlan({operation:'undo',undo_of:original.id,character_id:original.payload.character_id,old_name:original.payload.new_name,new_name:original.payload.old_name,scope_version:capture().version,sources,items},args,replay.requestHash);
    });
  }
  function applyApproved(args){shape(args,['plan_id','plan_hash']);const p=read(args.plan_id);if(p.hash!==args.plan_hash||p.status!=='applied')problem('HUMAN_REVIEW_REQUIRED','A pontos előnézetet a privát oldalon kell jóváhagyni és menteni.',403);return present(p);}
  return {csrf,prepare,prepareUndo,get,applyApproved,decide,context:()=>({csrf}),history:cid=>all('SELECT value FROM application_settings WHERE key LIKE ?',prefix+'plan:%').map(r=>JSON.parse(r.value)).filter(p=>p.payload.character_id===cid).map(p=>({plan_id:p.id,status:p.status,old_name:p.payload.old_name,new_name:p.payload.new_name,operation:p.payload.operation,created_at:p.created_at})).slice(-50).reverse()};
}
