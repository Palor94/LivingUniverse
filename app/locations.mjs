import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {tagKey} from './taxonomy.mjs';

export function installLocations({db,root,all,one,run,transaction,fail,setLocation,relocate}){
  db.exec(readFileSync(new URL('./migrations/010-specific-locations.up.sql',import.meta.url),'utf8'));
  const previews=new Map();
  async function folderPath(relative){
    if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative))throw fail('Choose a relative location folder.');const parts=relative.split(/[\\/]/);
    if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p)))throw fail('Use valid Windows folder names.');
    if(['app','tests','docs','backups','node_modules'].includes(parts[0].toLowerCase()))throw fail('Choose a media folder.');
    const full=path.resolve(root,...parts),rel=path.relative(root,full);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw fail('Location folder must stay inside your resource folder.',403);
    let probe=root;const realRoot=await fs.realpath(root);for(const part of parts){probe=path.join(probe,part);try{const st=await fs.lstat(probe);if(st.isSymbolicLink()||!st.isDirectory())throw fail('Location folders must be ordinary directories.',409);const real=await fs.realpath(probe),r=path.relative(realRoot,real);if(r.startsWith('..')||path.isAbsolute(r))throw fail('Location folder points outside your resource directory.',403);}catch(e){if(e.code!=='ENOENT')throw e;break;}}
    return {full,relative:parts.join(path.sep)};
  }
  const get=id=>one('SELECT l.*,t.name tag_name FROM locations l LEFT JOIN structured_tags t ON t.id=l.tag_id WHERE l.id=?',id);
  const details=mid=>one('SELECT l.id,l.name,l.tag_id,l.folder FROM media_locations ml JOIN locations l ON l.id=ml.location_id WHERE ml.media_id=?',mid)||null;
  function ensureRecord(name,folder){return transaction(()=>{let place=one('SELECT * FROM locations WHERE name_key=?',tagKey(name));if(place){if(folder&&place.folder&&place.folder!==folder)throw fail('Another location uses this name with a different folder. Choose a distinct location name.',409);if(folder)run('UPDATE locations SET folder=? WHERE id=?',folder,place.id);return get(place.id);}if(!one("SELECT 1 FROM tag_groups WHERE id='group-setting'"))run("INSERT INTO tag_groups VALUES('group-setting','Setting & location','setting & location')");let tag=one("SELECT id FROM structured_tags WHERE group_id='group-setting' AND name_key=?",tagKey(name));if(!tag){tag={id:randomUUID()};run("INSERT INTO structured_tags VALUES(?,'group-setting',?,?)",tag.id,name,tagKey(name));}const id=randomUUID();run('INSERT INTO locations VALUES(?,?,?,?,?,?)',id,name,tagKey(name),tag.id,folder,new Date().toISOString());return get(id);});}
  async function prepare(value){if(typeof value!=='string'||!value.startsWith('folder:'))return value;const selected=await folderPath(value.slice(7));if(!(await fs.stat(selected.full)).isDirectory())throw fail('Location folder is unavailable.');if(one('SELECT 1 FROM sorted_folders WHERE folder=?',selected.relative))throw fail('Choose a location folder, not a character folder.');const existing=one('SELECT id FROM locations WHERE folder=?',selected.relative);return existing?.id||ensureRecord(path.basename(selected.relative),selected.relative).id;}
  function resolve(value){
    if(typeof value!=='string')throw fail('Choose an existing location.');let place=get(value);if(place)return place;
    if(value.startsWith('tag:')){const tid=value.slice(4),tag=one("SELECT * FROM structured_tags WHERE id=? AND group_id='group-setting'",tid);if(!tag)throw fail('Choose an existing location tag.');place=one('SELECT * FROM locations WHERE tag_id=?',tid);if(place)return place;const duplicate=one('SELECT * FROM locations WHERE name_key=?',tagKey(tag.name));if(duplicate)return duplicate;const id=randomUUID();run('INSERT INTO locations VALUES(?,?,?,?,?,?)',id,tag.name,tagKey(tag.name),tid,null,new Date().toISOString());return get(id);}
    throw fail('Choose an existing location.');
  }
  function set(mid,value){if(value===null||value===''){run('DELETE FROM media_locations WHERE media_id=?',mid);return;}const place=resolve(value);run('INSERT INTO media_locations VALUES(?,?) ON CONFLICT(media_id) DO UPDATE SET location_id=excluded.location_id',mid,place.id);setLocation(mid,true);if(place.tag_id)run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',mid,place.tag_id);}
  async function folderOptions(){const folders=[];async function walk(relative,depth){if(depth>3||folders.length>=200)return;try{const dir=await folderPath(relative);await fs.access(dir.full);folders.push(dir.relative);for(const e of await fs.readdir(dir.full,{withFileTypes:true}))if(e.isDirectory()&&!e.isSymbolicLink()&&!e.name.startsWith('.'))await walk(path.join(relative,e.name),depth+1);}catch{}}
    for(const base of ['Helyszín','Locations','Location references'])await walk(base,0);return folders;
  }
  async function handle({p,body,req,json}){
    if(p==='/api/locations'&&req.method==='GET'){json({items:all('SELECT l.*,(SELECT COUNT(*) FROM media_locations ml JOIN active_media m ON m.id=ml.media_id WHERE ml.location_id=l.id) media_count FROM locations l ORDER BY name'),tags:all("SELECT * FROM structured_tags WHERE group_id='group-setting' ORDER BY name"),folders:await folderOptions()});return true;}
    if(p==='/api/locations'&&req.method==='POST'){
      const name=typeof body.name==='string'?body.name.trim().normalize('NFC'):'';if(!name||name.length>100)throw fail('Enter a location name of 1–100 characters.');if(!['tag','folder'].includes(body.kind||'tag'))throw fail('Choose a location tag or folder.');let folder=null;
      if(body.kind==='folder'){const selected=await folderPath(body.folder||path.join('Helyszín',name));if(one('SELECT 1 FROM sorted_folders WHERE folder=?',selected.relative)||one('SELECT 1 FROM characters WHERE name=?',selected.relative))throw fail('This folder belongs to a character. Choose a location folder.');await fs.mkdir(selected.full,{recursive:true});await folderPath(selected.relative);folder=selected.relative;}
      json(ensureRecord(name,folder));return true;
    }
    if(p==='/api/locations/assign'&&req.method==='POST'){
      if(!Array.isArray(body.media_ids)||!body.media_ids.length||body.media_ids.length>1000||body.media_ids.some(id=>typeof id!=='string'||!one('SELECT 1 FROM active_media WHERE id=?',id)))throw fail('Choose active media.');const ids=[...new Set(body.media_ids)],selected=await prepare(body.location_id??null);transaction(()=>{for(const mid of ids){setLocation(mid,true);set(mid,selected);}});json({selected:ids.length,updated:ids.length});return true;
    }
    if(p==='/api/locations/move/preview'&&req.method==='POST'){
      const m=one('SELECT * FROM active_media WHERE id=?',body.media_id),place=m&&details(m.id);if(!m||!place?.folder)throw fail('Save a location with a folder before moving the original.');const folder=await folderPath(place.folder),destination=path.join(folder.relative,path.basename(m.relative_path));const token=randomUUID();for(const [key,p] of previews)if(p.expires<Date.now())previews.delete(key);previews.set(token,{mid:m.id,from:m.relative_path,to:destination,place:place.id,expires:Date.now()+600000});json({token,from:m.relative_path,to:destination,unchanged:m.relative_path===destination});return true;
    }
    if(p==='/api/locations/move/confirm'&&req.method==='POST'){
      const preview=previews.get(body.token);if(!preview||preview.expires<Date.now())throw fail('Preview the location move again.',409);const m=one('SELECT * FROM active_media WHERE id=?',preview.mid),place=details(preview.mid);if(!m||m.relative_path!==preview.from||place?.id!==preview.place||!place.folder||path.join(place.folder,path.basename(m.relative_path))!==preview.to)throw fail('The media or selected location changed. Preview again.',409);await folderPath(place.folder);json(await relocate(m.id,preview.to));previews.delete(body.token);return true;
    }
    return false;
  }
  return {handle,details,set,prepare};
}
