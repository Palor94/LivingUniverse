import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tagKey} from './taxonomy.mjs';

export function createLocationEditor({db,all,one,run,transaction,fail,createTag,resolve}){
  db.exec(readFileSync(new URL('./migrations/016-location-profiles.up.sql',import.meta.url),'utf8'));
  const limits={name:100,english_name:200,category:100,description:30000};
  function get(id){
    if(typeof id!=='string'||!id||id.length>200)throw fail('Invalid location identifier.');
    let row=one('SELECT l.id,l.name,l.tag_id,l.folder,t.name tag_name,p.english_name,p.category,p.description,p.parent_id FROM locations l LEFT JOIN structured_tags t ON t.id=l.tag_id LEFT JOIN location_profiles p ON p.location_id=l.id WHERE l.id=?',id);
    if(!row&&id.startsWith('tag:')){const tag=one("SELECT id,name FROM structured_tags WHERE id=? AND group_id='group-setting'",id.slice(4));if(tag){const linked=one('SELECT id FROM locations WHERE tag_id=?',tag.id);if(linked)return get(linked.id);row={id,name:tag.name,tag_id:tag.id,tag_name:tag.name,folder:null,tag_only:true};}}
    if(!row)throw fail('A helyszín nem található.',404);
    for(const field of ['english_name','category','description'])row[field]??='';row.parent_id??=null;row.tag_only=!!row.tag_only;
    row.version=createHash('sha256').update(JSON.stringify(row)).digest('hex');return row;
  }
  function list(){
    const rows=all('SELECT l.id,l.name,l.tag_id,p.english_name,p.category,p.parent_id FROM locations l LEFT JOIN location_profiles p ON p.location_id=l.id ORDER BY l.name LIMIT 2001');
    const used=new Set(all('SELECT tag_id FROM locations WHERE tag_id IS NOT NULL').map(p=>p.tag_id));
    for(const tag of all("SELECT id,name FROM structured_tags WHERE group_id='group-setting' ORDER BY name LIMIT 2001"))if(!used.has(tag.id))rows.push({id:'tag:'+tag.id,name:tag.name,tag_id:tag.id,tag_only:true});
    return {items:rows.slice(0,2000).map(r=>({...r,english_name:r.english_name||'',category:r.category||'',parent_id:r.parent_id||null})),truncated:rows.length>2000};
  }
  function save(id,body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['expected_version','fields'].includes(k))||!/^[a-f0-9]{64}$/.test(body.expected_version||''))throw fail('Töltsd be újra a helyszínt mentés előtt.');
    const patch=body.fields;if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw fail('Nincs menthető mező.');
    for(const[k,v]of Object.entries(patch)){
      if(k==='parent_id'){if(!(v===null||typeof v==='string'&&v.length<=200))throw fail('Érvénytelen kapcsolódó helyszín.');}
      else if(!Object.hasOwn(limits,k)||typeof v!=='string'||v.length>limits[k]||k!=='description'&&/[\x00-\x1f\x7f]/.test(v))throw fail('Érvénytelen vagy túl hosszú mező. A szöveget nem csonkoltuk.');
    }
    const normalized={...patch};for(const k of ['name','english_name','category'])if(Object.hasOwn(normalized,k))normalized[k]=normalized[k].trim().normalize('NFC');if(normalized.name==='')throw fail('Adj meg egy helyszínnevet.');
    return transaction(()=>{
      const current=get(id);if(Object.entries(normalized).every(([k,v])=>current[k]===v)&&(!normalized.name||current.tag_name===normalized.name))return current;
      if(current.version!==body.expected_version)throw fail('A helyszín közben megváltozott. Hasonlítsd össze a legfrissebb változattal; a piszkozatod megmaradt.',409);
      const desired={...current,...normalized},key=tagKey(desired.name);
      if(one('SELECT id FROM locations WHERE name_key=? AND id<>?',key,current.id))throw fail('Már van ilyen nevű helyszín. Az összevonás külön művelet lenne.',409);
      if(one("SELECT id FROM structured_tags WHERE group_id='group-setting' AND name_key=? AND id<>?",key,current.tag_id||''))throw fail('Már van ilyen nevű helyszíncímke. Válassz különböző nevet.',409);
      if(current.tag_id&&one('SELECT id FROM locations WHERE tag_id=? AND id<>?',current.tag_id,current.id))throw fail('Ezt a címkét több helyszín használja. Előbb rendezd az ütközést.',409);
      let seen=new Set([current.id]),parent=desired.parent_id;while(parent){if(seen.has(parent))throw fail('A helyszínek kapcsolata nem alkothat kört.');seen.add(parent);if(!one('SELECT id FROM locations WHERE id=?',parent))throw fail('Válassz meglévő konkrét helyszínt.');parent=one('SELECT parent_id FROM location_profiles WHERE location_id=?',parent)?.parent_id;}
      const actual=current.tag_only?resolve(current.id):current;
      run('UPDATE locations SET name=?,name_key=? WHERE id=?',desired.name,key,actual.id);
      if(actual.tag_id)run('UPDATE structured_tags SET name=?,name_key=? WHERE id=?',desired.name,key,actual.tag_id);
      run('INSERT INTO location_profiles VALUES(?,?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET english_name=excluded.english_name,category=excluded.category,description=excluded.description,parent_id=excluded.parent_id',actual.id,desired.english_name,desired.category,desired.description,desired.parent_id);
      return get(actual.id);
    });
  }
  function create(body){if(!body||Object.keys(body).length!==1||typeof body.name!=='string')throw fail('Csak egy helyszínnevet adj meg.');return get(createTag(body.name).id);}
  return {list,get,save,create};
}
