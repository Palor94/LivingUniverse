import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {installNoteTags,digest} from './note-tags.mjs';
export const tagKey=value=>value.trim().normalize('NFC').toLocaleLowerCase('hu');
const tokens=text=>String(text||'').split(/[,\n]/).map(t=>t.trim()).filter(Boolean);
const starters={
  reference:['Reference role (media label)','face','body','detail','general'],
  angle:['Camera angle','frontal','profile','three-quarter','rear'],
  framing:['Framing','portrait','upper body','full body'],
  expression:['Expression','neutral','smiling','angry','tired'],
  clothing:['Clothing & accessories'],pose:['Pose & activity'],setting:['Setting & location'],
  source:['Source / generation provider'],quality:['Visual quality & fidelity']
};
export function installTaxonomy({db,all,one,run,transaction,fail}){
  db.exec(readFileSync(new URL('./migrations/005-structured-tags.up.sql',import.meta.url),'utf8'));
  // Seed once; imports can replace this starter vocabulary without conflict.
  if(!one("SELECT 1 FROM application_settings WHERE key='taxonomy_initialized'")||!one('SELECT 1 FROM tag_groups LIMIT 1'))transaction(()=>{
    for(const [slug,[name,...tags]] of Object.entries(starters)){const gid='group-'+slug;run('INSERT OR IGNORE INTO tag_groups VALUES(?,?,?)',gid,name,tagKey(name));for(const name of tags)run('INSERT OR IGNORE INTO structured_tags VALUES(?,?,?,?)',gid+'-'+name,gid,name,tagKey(name));}
    run("INSERT INTO application_settings VALUES('taxonomy_initialized','true') ON CONFLICT(key) DO UPDATE SET value='true'");
  });
  function label(value){if(typeof value!=='string'||!value.trim()||value.trim().length>100)throw fail('Use a name of 1–100 characters.');return value.trim().normalize('NFC');}
  function validateTags(ids){if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>typeof id!=='string'||!one('SELECT 1 FROM structured_tags WHERE id=?',id)))throw fail('Choose existing structured tags.');return [...new Set(ids)];}
  function validateMedia(ids){if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string'||!one('SELECT 1 FROM active_media WHERE id=?',id)))throw fail('Choose 1–1000 active media records.');return [...new Set(ids)];}
  const adoptTag=(mid,tid)=>{run('DELETE FROM note_tag_links WHERE media_id=? AND tag_id=?',mid,tid);run('DELETE FROM media_analysis_tag_links WHERE media_id=? AND tag_id=?',mid,tid);};
  function set(mid,ids){const tags=validateTags(ids);run('DELETE FROM media_tags WHERE media_id=?',mid);for(const tid of tags)run('INSERT INTO media_tags VALUES(?,?)',mid,tid);}
  const noteTags=installNoteTags({db,all,one,run,transaction,fail,validateMedia,validateTags});
  const details=mid=>all('SELECT t.id,COALESCE(NULLIF(l.hu_name,\'\'),t.name) name,t.name original_name,l.en_name english_name,t.group_id,g.name group_name FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id JOIN tag_groups g ON g.id=t.group_id LEFT JOIN tag_localizations l ON l.tag_id=t.id WHERE mt.media_id=? ORDER BY g.name,t.name',mid);
  function prepareRestore(body){noteTags.checkRestore(body);noteTags.clearRestore();if(body.tag_groups===undefined)return;for(const t of ['tag_groups','structured_tags','media_tags','legacy_tag_mappings'])if(!Array.isArray(body[t]))throw fail('Incomplete structured-tag backup');for(const t of ['location_changes','location_profiles','media_location_links','media_locations','locations','legacy_tag_mappings','media_tags','structured_tags','tag_groups'])run('DELETE FROM '+t);run("DELETE FROM application_settings WHERE key='taxonomy_initialized'");}
  async function handle({p,body,req,json}){
    if(await noteTags.handle({p,body,req,json}))return true;
    if(p==='/api/taxonomy'&&req.method==='GET'){json({groups:all('SELECT * FROM tag_groups ORDER BY name'),tags:noteTags.vocabulary().map(t=>({...t,display_name:t.hu_name||t.name,english_name:t.en_name||'',version:digest(t),usage:one('SELECT COUNT(*) n FROM media_tags mt JOIN active_media m ON m.id=mt.media_id WHERE mt.tag_id=?',t.id).n})),mappings:all('SELECT * FROM legacy_tag_mappings')});return true;}
    if(['/api/taxonomy/groups','/api/taxonomy/tags'].includes(p)&&req.method==='POST'){
      const name=label(body.name),key=tagKey(name),isGroup=p.endsWith('/groups'),table=isGroup?'tag_groups':'structured_tags',id=body.id||randomUUID();
      if(body.id&&!one('SELECT 1 FROM '+table+' WHERE id=?',body.id))throw fail('Vocabulary entry not found',404);
      if(!isGroup&&!one('SELECT 1 FROM tag_groups WHERE id=?',body.group_id))throw fail('Choose a tag group');
      const duplicate=isGroup?one('SELECT id FROM tag_groups WHERE name_key=?',key):one('SELECT id FROM structured_tags WHERE group_id=? AND name_key=?',body.group_id,key);if(duplicate&&duplicate.id!==id)throw fail('This name already exists in the chosen group.',409);
      if(!isGroup&&noteTags.duplicate(body.group_id,name,id))throw fail('This name or alias already exists in the chosen group.',409);
      transaction(()=>{
        if(body.language&&(isGroup||typeof body.language!=='object'||body.language.expected_version!==(body.id?noteTags.languageVersion(id):null)))throw fail('Vocabulary changed. Review the tag again.',409);
        if(isGroup)run('INSERT INTO tag_groups VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key',id,name,key);
        else run('INSERT INTO structured_tags VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,name_key=excluded.name_key',id,body.group_id,name,key);
        if(body.language)noteTags.saveLanguage({...body.language,tag_id:id,expected_version:noteTags.languageVersion(id)},{inTransaction:true});
      });
      json({id});return true;
    }
    if(p==='/api/taxonomy/apply'&&req.method==='POST'){
      const ids=validateMedia(body.media_ids),tags=validateTags(body.tag_ids);if(!['add','remove','set'].includes(body.operation))throw fail('Choose add, remove, or replace.');if(body.operation==='set'&&ids.length!==1)throw fail('Replace applies only to one media item. Use additive bulk tags.');
      let updated=0;transaction(()=>{for(const mid of ids){const before=details(mid).map(t=>t.id).sort().join('|');if(body.operation==='set')set(mid,tags);else for(const tid of tags){if(body.operation==='add'){run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',mid,tid);adoptTag(mid,tid);}else run('DELETE FROM media_tags WHERE media_id=? AND tag_id=?',mid,tid);}if(details(mid).map(t=>t.id).sort().join('|')!==before)updated++;}});json({updated,selected:ids.length});return true;
    }
    if(p==='/api/taxonomy/legacy'&&req.method==='GET'){
      const map=new Map();for(const row of all('SELECT n.tags FROM media_notes n JOIN active_media m ON m.id=n.media_id'))for(const token of new Map(tokens(row.tags).map(t=>[tagKey(t),t])).values()){const key=tagKey(token),entry=map.get(key)||{text:token,key,count:0};entry.count++;map.set(key,entry);}json({items:[...map.values()].sort((a,b)=>b.count-a.count)});return true;
    }
    if(p==='/api/taxonomy/migrate'&&req.method==='POST'){
      const source=label(body.source),tid=validateTags([body.tag_id])[0];const ids=all('SELECT n.media_id,n.tags FROM media_notes n JOIN active_media m ON m.id=n.media_id').filter(r=>tokens(r.tags).some(t=>tagKey(t)===tagKey(source))).map(r=>r.media_id);
      if(body.confirm!==true){json({matched:ids.length,source,tag_id:tid});return true;}
      if(body.expected_count!==ids.length)throw fail('The matching file count changed. Preview the mapping again.',409);
      let added=0;transaction(()=>{for(const mid of ids){added+=Number(run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',mid,tid).changes);adoptTag(mid,tid);}run('INSERT INTO legacy_tag_mappings VALUES(?,?,?,?) ON CONFLICT(source_key,tag_id) DO UPDATE SET source_text=excluded.source_text,created_at=excluded.created_at',tagKey(source),tid,source,new Date().toISOString());});json({matched:ids.length,added});return true;
    }
    return false;
  }
  return {handle,details,set,validateTags,prepareRestore,noteTags,adoptTag};
}
