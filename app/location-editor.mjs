import {createHash,randomUUID} from 'node:crypto';
import {tagKey} from './taxonomy.mjs';
import {validateLocationHierarchy} from './location-migration.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createLocationEditor({db,all,one,run,transaction,fail,createTag,resolve}){
  const limits={name:100,english_name:200,category:100,description:30000};
  const rows=()=>all('SELECT l.*,p.english_name,p.category,p.description FROM locations l LEFT JOIN location_profiles p ON p.location_id=l.id ORDER BY l.id');
  const treeVersion=()=>hash(rows());
  function pathFor(id){
    const path=[],seen=new Set();let current=id;
    while(current){if(seen.has(current)||seen.size>=128)throw fail('Kör vagy túl mély helyszínfa.',409);seen.add(current);const row=one('SELECT id,name,parent_id FROM locations WHERE id=?',current);if(!row)throw fail('Hiányzó szülőhelyszín.',409);path.unshift(row);current=row.parent_id;}
    return path;
  }
  function get(id){
    if(typeof id!=='string'||!id||id.length>200)throw fail('Érvénytelen helyszínazonosító.');
    let row=one('SELECT l.id,l.name,l.tag_id,l.folder,t.name tag_name,p.english_name,p.category,p.description,l.parent_id FROM locations l LEFT JOIN structured_tags t ON t.id=l.tag_id LEFT JOIN location_profiles p ON p.location_id=l.id WHERE l.id=?',id);
    if(!row&&id.startsWith('tag:')){const tag=one("SELECT id,name FROM structured_tags WHERE id=? AND group_id='group-setting'",id.slice(4));if(tag){const linked=all('SELECT id FROM locations WHERE tag_id=?',tag.id);if(linked.length>1)throw fail('A címkéhez több konkrét hely kapcsolódik; válassz helyszínazonosítót.',409);if(linked.length)return get(linked[0].id);row={id,name:tag.name,tag_id:tag.id,tag_name:tag.name,folder:null,tag_only:true};}}
    if(!row)throw fail('A helyszín nem található.',404);
    for(const field of ['english_name','category','description'])row[field]??='';row.parent_id??=null;row.tag_only=!!row.tag_only;
    const path=row.tag_only?[]:pathFor(row.id);row.path_ids=path.map(p=>p.id);row.breadcrumb=path.map(p=>p.name).join(' / ')||row.name;
    row.version=hash(row);return row;
  }
  function tree(){
    const current=rows();if(current.length>5000)throw fail('A helyszínfa meghaladja az 5000 elemes határt. Csonkolt fát nem szerkesztünk.',409);
    return {schema:2,tree_version:treeVersion(),items:current.map(r=>{const {description,...place}=get(r.id);return place;}),history:all('SELECT id,operation,location_id,undo_of,created_at FROM location_changes ORDER BY rowid DESC LIMIT 100')};
  }
  function list(){
    const actual=tree(),used=new Set(actual.items.map(p=>p.tag_id)),virtual=all("SELECT id,name FROM structured_tags WHERE group_id='group-setting' ORDER BY name LIMIT 5001").filter(t=>!used.has(t.id)).map(t=>({id:'tag:'+t.id,name:t.name,tag_id:t.id,tag_only:true,parent_id:null,english_name:'',category:'',breadcrumb:t.name}));
    return {items:[...actual.items,...virtual].slice(0,5000),tree_version:actual.tree_version,history:actual.history,truncated:actual.items.length+virtual.length>5000};
  }
  function fields(patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw fail('Nincs menthető mező.');
    for(const[k,v]of Object.entries(patch)){
      if(k==='parent_id'){if(!(v===null||typeof v==='string'&&v.length<=200))throw fail('Érvénytelen szülőhelyszín.');}
      else if(!Object.hasOwn(limits,k)||typeof v!=='string'||v.length>limits[k]||k!=='description'&&/[\x00-\x1f\x7f]/.test(v))throw fail('Érvénytelen vagy túl hosszú mező. A szöveget nem csonkoltuk.');
    }
    const normalized={...patch};for(const k of ['name','english_name','category'])if(Object.hasOwn(normalized,k))normalized[k]=normalized[k].trim().normalize('NFC');if(normalized.name==='')throw fail('Adj meg egy helyszínnevet.');return normalized;
  }
  function validParent(id,parent){
    if(parent!==null&&!one('SELECT 1 FROM locations WHERE id=?',parent))throw fail('Válassz meglévő konkrét szülőhelyszínt.');
    if(parent&&pathFor(parent).some(p=>p.id===id))throw fail('A helyszín nem kapcsolható saját maga vagy leszármazottja alá.');
  }
  function sibling(id,name,parent){if(one('SELECT id FROM locations WHERE parent_id IS ? AND name_key=? AND id<>?',parent,tagKey(name),id))throw fail('Ilyen nevű hely már van e szülő alatt. Válassz másik nevet vagy szülőt.',409);}
  function snapshot(id){const p=get(id);return Object.fromEntries(['id','name','parent_id','english_name','category','description','tag_id','tag_name','folder'].map(k=>[k,p[k]]));}
  function journal(operation,id,before,after,key=null,requestHash=null,undoOf=null){const change=randomUUID();run('INSERT INTO location_changes VALUES(?,?,?,?,?,?,?,?,?)',change,operation,id,key,requestHash,JSON.stringify(before),JSON.stringify(after),undoOf,new Date().toISOString());return change;}
  function write(id,desired){
    sibling(id,desired.name,desired.parent_id);validParent(id,desired.parent_id);
    const current=get(id);
    // Retain legacy labels; do not merge labels when homonymous places appear.
    if(current.tag_id&&current.tag_name===current.name&&desired.name!==current.name&&!one('SELECT 1 FROM locations WHERE tag_id=? AND id<>?',current.tag_id,id)&&!one('SELECT 1 FROM structured_tags WHERE group_id=(SELECT group_id FROM structured_tags WHERE id=?) AND name_key=? AND id<>?',current.tag_id,tagKey(desired.name),current.tag_id))run('UPDATE structured_tags SET name=?,name_key=? WHERE id=?',desired.name,tagKey(desired.name),current.tag_id);
    run('UPDATE locations SET name=?,name_key=?,parent_id=? WHERE id=?',desired.name,tagKey(desired.name),desired.parent_id,id);
    run('INSERT INTO location_profiles VALUES(?,?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET english_name=excluded.english_name,category=excluded.category,description=excluded.description,parent_id=excluded.parent_id',id,desired.english_name,desired.category,desired.description,desired.parent_id);
    validateLocationHierarchy(db);
  }
  function save(id,body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['expected_version','fields','expected_tree_version','request_key'].includes(k))||!/^[a-f0-9]{64}$/.test(body.expected_version||''))throw fail('Töltsd be újra a helyszínt mentés előtt.');
    const normalized=fields(body.fields);
    return transaction(()=>{
      const current=get(id);if(Object.entries(normalized).every(([k,v])=>current[k]===v))return current;
      if(current.version!==body.expected_version||body.expected_tree_version!==undefined&&body.expected_tree_version!==treeVersion())throw fail('A helyszínfa közben megváltozott. A piszkozatod megmaradt; friss összehasonlítás kell.',409);
      const actual=current.tag_only?get(resolve(current.id).id):current,before=snapshot(actual.id);
      write(actual.id,{...actual,...normalized});const change_id=journal('edit',actual.id,before,snapshot(actual.id));
      return {...get(actual.id),change_id};
    });
  }
  function create(body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','parent_id','english_name','category','description','request_key','expected_tree_version'].includes(k)))throw fail('Érvénytelen új helyszínadatok.');
    if(Object.keys(body).length===1&&typeof body.name==='string')return get(createTag(body.name).id);
    const desired={english_name:'',category:'',description:'',...fields(Object.fromEntries(Object.entries(body).filter(([k])=>Object.hasOwn(limits,k)||k==='parent_id')))};
    if(!Object.hasOwn(desired,'parent_id')||!desired.name)throw fail('Adj meg nevet és szülőhelyszínt (a világ gyökeréhez null).');
    if(body.request_key!==undefined&&(typeof body.request_key!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.request_key)))throw fail('Érvénytelen ismétlésvédelmi azonosító.');
    const requestHash=hash(desired);
    return transaction(()=>{
      const prior=body.request_key&&one('SELECT * FROM location_changes WHERE request_key=?',body.request_key);if(prior){if(prior.operation!=='create'||prior.request_hash!==requestHash)throw fail('Ez a műveleti azonosító más kéréshez tartozik.',409);return get(prior.location_id);}
      if(body.expected_tree_version!==undefined&&body.expected_tree_version!==treeVersion())throw fail('A helyszínfa megváltozott. Frissítsd a listát.',409);
      validParent(null,desired.parent_id);sibling('',desired.name,desired.parent_id);
      const id=randomUUID();run('INSERT INTO locations(id,name,name_key,tag_id,folder,created_at,parent_id) VALUES(?,?,?,NULL,NULL,?,?)',id,desired.name,tagKey(desired.name),new Date().toISOString(),desired.parent_id);
      run('INSERT INTO location_profiles VALUES(?,?,?,?,?)',id,desired.english_name,desired.category,desired.description,desired.parent_id);validateLocationHierarchy(db);
      const change_id=journal('create',id,null,snapshot(id),body.request_key||null,requestHash);return {...get(id),change_id};
    });
  }
  function undo(body){
    if(!body||typeof body.change_id!=='string'||typeof body.expected_tree_version!=='string')throw fail('Frissítsd a helyszínfa előnézetét.');
    return transaction(()=>{
      const change=one('SELECT * FROM location_changes WHERE id=?',body.change_id);if(!change)throw fail('A helyszínművelet nem található.',404);
      const undone=one('SELECT id FROM location_changes WHERE undo_of=?',change.id);if(undone)return {change_id:undone.id,replayed:true};
      if(treeVersion()!==body.expected_tree_version||JSON.stringify(snapshot(change.location_id))!==change.after_json)throw fail('A helyszínfa megváltozott; a későbbi módosításokat nem írjuk felül.',409);
      if(change.operation!=='edit')throw fail('Létrehozott helyet nem törlünk automatikusan. A helyszín megmaradt.',409);
      const before=JSON.parse(change.before_json),after=snapshot(change.location_id);write(change.location_id,before);
      if(before.tag_id&&before.tag_name!==get(change.location_id).tag_name)throw fail('A kapcsolt címke azóta megváltozott. Kézi összehasonlítás szükséges.',409);
      const change_id=journal('undo',change.location_id,after,snapshot(change.location_id),null,null,change.id);return {change_id,place:get(change.location_id)};
    });
  }
  function prepareRestore(body){if(body.location_schema_version!==undefined&&(body.location_schema_version!==2||!Array.isArray(body.location_changes)||!Array.isArray(body.locations)||!Array.isArray(body.location_profiles)))throw fail('Hiányos vagy ismeretlen helyszínséma a mentésben.');for(const p of body.location_profiles||[]){const row=(body.locations||[]).find(l=>l.id===p.location_id);if(row&&Object.hasOwn(row,'parent_id')&&row.parent_id!==p.parent_id)throw fail('Eltérő szülőhelyszínek a mentésben.');}}
  function validateRestore(){validateLocationHierarchy(db);for(const row of all('SELECT * FROM location_changes')){for(const key of ['before_json','after_json']){const value=JSON.parse(row[key]);if(value===null&&row.operation==='create'&&key==='before_json')continue;if(!value||value.id!==row.location_id||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||!Object.hasOwn(value,'parent_id'))throw fail('Érvénytelen helyszín-előzmény a mentésben.');}}}
  return {list,get,save,create,tree,undo,prepareRestore,validateRestore};
}
