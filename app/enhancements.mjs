import {catalogueFolder,trashFolder,mediaDestinationAllowed} from './storage-layout.mjs';
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const extraTables={
  media_imports:['id','request_key','request_hash','character_id','provenance_json','created_at','expires_at'],
  imported_media_blobs:['sha256','media_id'],
  media_import_items:['id','import_id','slot_key','status','sha256','media_id','filename','content_type','size','provenance_json','error_code','created_at'],
  media_import_events:['id','import_id','slot_key','event','error_code','created_at'],
  media_import_targets:['import_id','character_id'],
  media_import_metadata:['import_id','title','description','reference_candidate'],
  media_uploads:['id','import_id','slot_key','request_hash','filename','content_type','size','sha256','received_bytes','status','error_code','created_at','expires_at'],
  media_upload_chunks:['upload_id','offset','size','sha256'],
  media_image_edits:['id','media_id','status','original_sha256','cropped_sha256','crop_json','original_size','original_mtime','created_at','restored_at'],
  mcp_reference_changes:['id','request_key','request_hash','change_hash','character_id','payload_json','status','created_at','expires_at','approved_by','approved_at','applied_at','result_json'],
  mcp_changes:['id','request_key','request_hash','change_hash','operation','payload_json','status','created_at','expires_at','approved_by','approved_at','applied_at','result_json'],
  character_ui:['character_id','cover_crop','merged_into'],
  character_cover_frames:['character_id','media_id','time_seconds','data_url','source_crop_json','source_size','source_mtime','captured_at'],
  media_hidden:['media_id','original_path','physical','created_at'],
  application_settings:['key','value'],
  media_categorization:['media_id','complete','updated_at'],
  media_roles:['media_id','role','updated_at'],
  folder_changes:['id','character_id','source','destination','status','manifest_json','error','created_at','updated_at'],
  media_scan_state:['media_id','state','observed_size','observed_mtime','checked_at','error'],
  scan_candidates:['relative_path','folder','kind','size','modified_at','candidate_ids'],
  media_fingerprints:['media_id','signature','sha256','visual_hash','visual_version','width','height','checked_at'],
  tag_groups:['id','name','name_key'],
  structured_tags:['id','group_id','name','name_key'],
  locations:['id','name','name_key','tag_id','folder','created_at'],
  location_profiles:['location_id','english_name','category','description','parent_id'],
  media_locations:['media_id','location_id'],
  media_location_links:['media_id','location_id'],
  media_tags:['media_id','tag_id'],
  legacy_tag_mappings:['source_key','tag_id','source_text','created_at'],
  sorting_suggestions:['id','media_id','character_id','canon_id','method','target_signature','target_sha256','evidence_json','context_key','created_at'],
  suggestion_feedback:['id','suggestion_id','decision','notes','face_verdict','body_verdict','created_at'],
  story_events:['id','version','request_key','request_hash','import_key','created_at'],
  story_event_revisions:['event_id','version','status','payload_json','actor','reason','created_at'],
  story_event_participants:['event_id','character_id','role','knows'],
  story_event_locations:['event_id','location_id'],
  story_event_source_keys:['source_key','event_id','system','external_id'],
  image_generation_runs:['id','request_key','request_hash','manifest_json','manifest_hash','status','created_at','expires_at','approved_by','approved_at','error_code'],
  image_generation_outputs:['run_id','media_id','sha256','size','receipt_json','created_at'],
  image_generation_events:['id','run_id','event','actor','detail','created_at']
};
export function installEnhancements(ctx){
  const {db,root,dataDir,all,one,run,transaction,asset,character,canon,safeFile,fingerprint,moving,isScanning,fail}=ctx;
  db.exec(readFileSync(new URL('./migrations/002-media-categorization.up.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/007-location-references.up.sql',import.meta.url),'utf8'));
  db.exec(`CREATE TABLE IF NOT EXISTS character_ui(character_id TEXT PRIMARY KEY REFERENCES characters(id),cover_crop TEXT,merged_into TEXT REFERENCES characters(id));
    CREATE TABLE IF NOT EXISTS media_hidden(media_id TEXT PRIMARY KEY REFERENCES media(id),original_path TEXT NOT NULL,physical INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS application_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE VIEW IF NOT EXISTS active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);`);
  const now=()=>new Date().toISOString();
  function removeCatalogue(mid){const m=asset(mid);if(one('SELECT 1 FROM media_hidden WHERE media_id=?',mid))return {ok:true,already_removed:true};if(one("SELECT 1 FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,'$.media_id')=?)",mid))throw fail('This file is an approved identity reference.',409);transaction(()=>{run('INSERT INTO media_hidden VALUES(?,?,0,?)',mid,m.relative_path,now());run('UPDATE characters SET cover_id=NULL WHERE cover_id=?',mid);});return {ok:true};}
  const inside=(full)=>{const relative=path.relative(root,path.resolve(full));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw fail('Destination must stay inside the resource folder.',403);return path.resolve(full);};
  async function safeDestination(relative){
    const segments=relative.split(/[\\/]/);if(segments.some(s=>!s||s==='.'||s==='..'||/[<>:"|?*]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)))throw fail('Invalid destination name.');
    if(segments.some(s=>s.startsWith('.')&&s!=='.living-universe-trash'))throw fail('This application folder is reserved.');
    if(['app','tests','docs','node_modules','backups'].includes(segments[0].toLowerCase()))throw fail('Choose a media folder.');
    if(!mediaDestinationAllowed(root,relative))throw fail('Choose a media destination, not system, imports, exports or backups.');const full=inside(path.join(root,...segments));let parent=path.dirname(full);
    while(parent!==root){try{const real=await fs.realpath(parent);inside(real);break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
    return full;
  }
  async function relocate(mid,relative){
    const m=asset(mid);if(relative===m.relative_path)return {unchanged:true};
    if(moving.has(mid)||isScanning())throw fail('A file operation is running. Please retry.',409);
    moving.add(mid);const moveId=randomUUID();let logged=false;
    try{
      const source=await safeFile(m);const dest=await safeDestination(relative);
      if(one('SELECT id FROM media WHERE relative_path=? AND id<>?',relative,mid))throw fail('That filename is already in the catalogue.',409);
      try{await fs.lstat(dest);throw fail('A file with that name already exists. Nothing was overwritten.',409);}catch(e){if(e.code!=='ENOENT')throw e;}
      run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',moveId,mid,m.relative_path,relative,'preparing',null,now());logged=true;
      await fs.mkdir(path.dirname(dest),{recursive:true});await safeDestination(relative);
      await fs.copyFile(source,dest,constants.COPYFILE_EXCL);
      const hash=await fingerprint(source);if(hash!==await fingerprint(dest))throw fail('Copy verification failed; the original is retained.',409);
      transaction(()=>{run('UPDATE media SET relative_path=?,folder=? WHERE id=?',relative,catalogueFolder(root,relative),mid);run('UPDATE file_moves SET status=?,sha256=? WHERE id=?','catalogued',hash,moveId);});
      try{inside(source);await fs.unlink(source);}catch{run('UPDATE file_moves SET status=? WHERE id=?','source_retained',moveId);return {warning:'The new copy is verified, but the old source could not be removed. Both copies were kept.',from:m.relative_path,to:relative};}
      run('UPDATE file_moves SET status=? WHERE id=?','complete',moveId);return {from:m.relative_path,to:relative};
    }catch(e){if(logged)run("UPDATE file_moves SET status='needs_review' WHERE id=? AND status='preparing'",moveId);if(e.status)throw e;throw fail('The file operation could not finish. Check OneDrive availability and move history. The source or verified copy is retained.',409);}finally{moving.delete(mid);}
  }
  function protagonist(){const setting=one("SELECT value FROM application_settings WHERE key='protagonist'");if(setting)return character(setting.value);const list=all('SELECT c.* FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL');return list.find(c=>c.name.toLowerCase()==='palor')||list.find(c=>c.name.toLowerCase()==='tibor')||null;}
  function crop(cid){return one('SELECT cover_crop FROM character_ui WHERE character_id=?',cid)?.cover_crop||null;}
  async function handle({p,body,req,json}){
    let match;
    if((match=p.match(/^\/api\/characters\/([^/]+)\/profile-field$/))&&req.method==='POST'){
      const current=character(match[1]);if(!['name','aliases','biography','personality','sexuality','speech_style','appearance','notes'].includes(body.field))throw fail('Unknown profile field.');const value=String(body.value??'').slice(0,body.field==='name'?200:30000);if(body.field==='name'&&!value.trim())throw fail('A character needs a name.');if(Object.hasOwn(body,'expected')&&current[body.field]!==body.expected&&current[body.field]!==value)throw fail('This field changed on another device. Your text is still in the editor; compare it with the latest saved version before retrying.',409);run(`UPDATE characters SET ${body.field}=? WHERE id=?`,value,match[1]);json({ok:true});return true;
    }
    if(p==='/api/protagonist'&&req.method==='GET'){json({character:protagonist()});return true;}
    if((match=p.match(/^\/api\/characters\/([^/]+)\/cover-crop$/))&&req.method==='POST'){
      const c=character(match[1]);const m=asset(body.media_id);if(m.kind!=='image'||!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',m.id,c.id))throw fail('Choose an assigned picture for the cover.');
      const r=body.crop;if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<0.01||r.h<0.01||r.x+r.w>1.001||r.y+r.h>1.001)throw fail('Draw a valid cover crop inside the picture.');
      transaction(()=>{run('DELETE FROM character_cover_frames WHERE character_id=?',c.id);run('UPDATE characters SET cover_id=? WHERE id=?',m.id,c.id);run('INSERT INTO character_ui(character_id,cover_crop) VALUES(?,?) ON CONFLICT(character_id) DO UPDATE SET cover_crop=excluded.cover_crop',c.id,JSON.stringify({media_id:m.id,...r}));});json({ok:true});return true;
    }
    if((match=p.match(/^\/api\/media\/([^/]+)\/rename$/))&&req.method==='POST'){
      const m=asset(match[1]);const name=String(body.filename||'').trim();if(path.basename(name)!==name||/[\\/]/.test(name))throw fail('Enter a filename, without a folder path.');if(path.extname(name).toLowerCase()!==path.extname(m.relative_path).toLowerCase())throw fail('Keep the existing file extension.');
      json(await relocate(m.id,path.join(path.dirname(m.relative_path),name)));return true;
    }
    if((match=p.match(/^\/api\/media\/([^/]+)\/remove$/))&&req.method==='POST'){
      const m=asset(match[1]);if(one('SELECT 1 FROM media_hidden WHERE media_id=?',m.id))throw fail('This item is already in Removed items.');
      const protectedBy=all("SELECT character_id FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,'$.media_id')=?)",m.id);
      if(protectedBy.length)throw fail('This file is an approved identity reference. Remove it from the current approved identity first; earlier identity history will be retained.',409);
      if(!['catalogue','file'].includes(body.mode))throw fail('Choose catalogue only, or file and catalogue.');
      if(body.mode==='catalogue'){json(removeCatalogue(m.id));return true;}
      let result={};if(body.mode==='file')result=await relocate(m.id,path.join(trashFolder(root),m.id,path.basename(m.relative_path)));
      transaction(()=>{run('INSERT INTO media_hidden VALUES(?,?,?,?)',m.id,m.relative_path,body.mode==='file'?1:0,now());run('UPDATE characters SET cover_id=NULL WHERE cover_id=?',m.id);});json({...result,ok:true});return true;
    }
    if(p==='/api/removed'&&req.method==='GET'){json({capabilities:{permanent_erasure:true},items:all("SELECT m.*,h.original_path,h.physical,h.created_at removed_at,EXISTS(SELECT 1 FROM canon c,json_each(c.references_json) r WHERE json_extract(r.value,'$.media_id')=m.id) protected FROM media_hidden h JOIN media m ON m.id=h.media_id WHERE NOT EXISTS(SELECT 1 FROM application_settings s WHERE s.key='erased_media:'||m.id) ORDER BY h.created_at DESC")});return true;}
    if((match=p.match(/^\/api\/media\/([^/]+)\/erase-item$/))&&req.method==='POST'){
      const m=asset(match[1]),h=one('SELECT * FROM media_hidden WHERE media_id=?',m.id);
      if(!h)throw fail('Only items in Removed items can be erased.',409);
      if(body.confirm!==true||body.expected_path!==m.relative_path)throw fail('Review the item and confirm permanent erasure again.',409);
      if(one('SELECT 1 FROM application_settings WHERE key=?','erased_media:'+m.id)){json({ok:true,already_erased:true});return true;}
      if(one("SELECT 1 FROM canon c,json_each(c.references_json) r WHERE json_extract(r.value,'$.media_id')=? LIMIT 1",m.id))throw fail('This media is part of approved identity history and cannot be permanently erased.',409);
      if(moving.has(m.id)||isScanning())throw fail('A file operation is running. Please retry.',409);
      moving.add(m.id);
      try{
        if(h.physical){
          const expected=path.join(trashFolder(root),m.id,path.basename(h.original_path));
          if(m.relative_path!==expected)throw fail('The file is outside its recoverable trash location. Nothing was erased.',409);
          const full=inside(path.resolve(root,expected));
          const realRoot=await fs.realpath(root),realParent=await fs.realpath(path.dirname(full));
          if(realParent!==path.join(realRoot,trashFolder(root),m.id))throw fail('Trash location points elsewhere. Nothing was erased.',409);
          try{const info=await fs.lstat(full);if(!info.isFile()||info.isSymbolicLink())throw fail('Only regular files in application trash can be erased.',409);await fs.unlink(full);}catch(e){if(e.code!=='ENOENT')throw e;}
        }
        run('INSERT INTO application_settings(key,value) VALUES(?,?)','erased_media:'+m.id,JSON.stringify({erased_at:now(),physical:!!h.physical,path:m.relative_path}));
        json({ok:true,physical:!!h.physical});return true;
      }finally{moving.delete(m.id);}
    }
    if((match=p.match(/^\/api\/media\/([^/]+)\/restore-item$/))&&req.method==='POST'){
      if(one('SELECT 1 FROM application_settings WHERE key=?','erased_media:'+match[1]))throw fail('This removed item was permanently erased and cannot be restored here.',409);
      const h=one('SELECT * FROM media_hidden WHERE media_id=?',match[1]);if(!h)throw fail('Removed item not found.',404);let result={};if(h.physical)result=await relocate(h.media_id,h.original_path);run('DELETE FROM media_hidden WHERE media_id=?',h.media_id);json({...result,ok:true});return true;
    }
    if(p==='/api/palor-merge/preview'&&req.method==='GET'){
      const target=protagonist();const sources=all('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL').filter(c=>['palor','tibor'].includes(c.name.toLowerCase())&&c.id!==target?.id);
      json({target,sources,files:all("SELECT id,relative_path FROM active_media WHERE lower(folder)='tibor'"),destination:'Palor'});return true;
    }
    if(p==='/api/palor-merge'&&req.method==='POST'){
      if(moving.size||isScanning())throw fail('Wait for the current file operation before merging.',409);
      const snapshot=transaction(()=>Object.fromEntries(all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(t=>[t.name,all('SELECT * FROM '+t.name)])));
      const backupPath=path.join(dataDir,'before-palor-merge-'+Date.now()+'.json');await fs.writeFile(backupPath,JSON.stringify({schema_version:1,exported_at:now(),...snapshot}));
      let target=protagonist();if(!target){const cid=randomUUID();run('INSERT INTO characters(id,name,aliases,created_at) VALUES(?,?,?,?)',cid,'Palor','Tibor',now());target=character(cid);}
      const sources=all('SELECT c.* FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL').filter(c=>['palor','tibor'].includes(c.name.toLowerCase())&&c.id!==target.id);
      transaction(()=>{
        for(const source of sources){
          run('INSERT OR IGNORE INTO depictions SELECT media_id,? FROM depictions WHERE character_id=?',target.id,source.id);
          for(const r of all('SELECT * FROM relationships WHERE source_id=? OR target_id=?',source.id,source.id)){const from=r.source_id===source.id?target.id:r.source_id,to=r.target_id===source.id?target.id:r.target_id;if(from===to)continue;const old=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',from,to);run('INSERT INTO relationships VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET description=excluded.description',randomUUID(),from,to,old&&old.description!==r.description?old.description+'\n'+r.description:r.description);}
          run('UPDATE sorted_folders SET character_id=? WHERE character_id=?',target.id,source.id);
          run('INSERT INTO character_ui(character_id,merged_into) VALUES(?,?) ON CONFLICT(character_id) DO UPDATE SET merged_into=excluded.merged_into',source.id,target.id);
          for(const field of ['biography','personality','sexuality','speech_style','appearance','notes']){const current=character(target.id)[field];if(source[field]&&!current)run(`UPDATE characters SET ${field}=? WHERE id=?`,source[field],target.id);else if(source[field]&&current!==source[field])run('UPDATE characters SET notes=notes||? WHERE id=?','\nPreserved '+source.name+' '+field+': '+source[field],target.id);}
        }
        const aliases=[...new Set([target.aliases,'Tibor','Palor',...sources.map(c=>c.aliases)].filter(Boolean))].join(', ');run('UPDATE characters SET name=?,aliases=? WHERE id=?','Palor',aliases,target.id);
        run("INSERT INTO application_settings VALUES('protagonist',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",target.id);
      });
      const results=[],errors=[];for(const m of all("SELECT * FROM active_media WHERE lower(folder)='tibor'")){try{const suffix=m.relative_path.split(path.sep).slice(1);let dest=path.join('Palor',...suffix);try{await fs.lstat(path.join(root,dest));dest=path.join('Palor',path.basename(dest,path.extname(dest))+'-'+m.id.slice(0,8)+path.extname(dest));}catch(e){if(e.code!=='ENOENT')throw e;}
        const result=await relocate(m.id,dest);run('INSERT OR IGNORE INTO depictions VALUES(?,?)',m.id,target.id);results.push(result);}catch(e){errors.push({file:m.relative_path,error:e.message});}}
      const oldFolder=path.resolve(root,'Tibor');if(path.dirname(oldFolder)===root){try{const real=await fs.realpath(oldFolder);inside(real);await fs.rmdir(oldFolder);}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))errors.push({file:'Tibor',error:'Files were preserved, but the empty source folder could not be removed.'});}}
      json({target:character(target.id),merged:sources.length,moved:results.length,errors,backupPath});return true;
    }
    return false;
  }
  return {handle,crop,protagonist,relocate,removeCatalogue};
}
