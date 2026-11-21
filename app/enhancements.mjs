import {raceValue} from './character-creation.mjs';
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
  character_crop_approvals:['id','character_id','media_id','role','reference_id','revision_id','operation','undo_of','request_hash','payload_json','actor','created_at'],
  character_reference_crops:['media_id','character_id','role','crop_json','source_sha256','version','updated_at'],
  media_image_edits:['id','media_id','status','original_sha256','cropped_sha256','crop_json','original_size','original_mtime','created_at','restored_at'],
  mcp_reference_changes:['id','request_key','request_hash','change_hash','character_id','payload_json','status','created_at','expires_at','approved_by','approved_at','applied_at','result_json'],
  mcp_changes:['id','request_key','request_hash','change_hash','operation','payload_json','status','created_at','expires_at','approved_by','approved_at','applied_at','result_json'],
  character_ui:['character_id','cover_crop','merged_into'],
  character_groups:['character_id','created_at'],
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
  image_generation_output_items:['run_id','item_index','media_id','sha256','size','receipt_json','created_at'],
  image_generation_events:['id','run_id','event','actor','detail','created_at'],
  world_places:['id','character_id','location_id','role','note','source','created_at'],
  world_relationship_levels:['source_id','target_id','level','updated_at'],
  world_level_revisions:['id','source_id','target_id','level','previous_level','reason','actor','event_id','created_at'],
  world_events:['id','world_day','kind','status','title','summary','payload_json','model','seen_at','decided_at','created_at','rewound_at'],
  world_messages:['id','from_character_id','text','world_day','event_id','read_at','created_at','rewound_at'],
  world_rewinds:['id','target_time','label','payload_json','created_at','undone_at'],
  world_usage:['day','calls','input_tokens','output_tokens','cost_usd','cached_tokens'],
  play_conversations:['id','character_id','location_id','channel','world_day','slot','status','summary_json','created_at','closed_at','rewound_at','mode','participants_json','memo_json'],
  world_threads:['id','character_id','promised_by','text','due_day','status','conversation_id','noted_at','created_at','updated_at','rewound_at'],
  play_line_speaker:['line_id','character_id'],
  play_guests:['id','conversation_id','name','description','image_file','image_status','image_note','saved_character_id','left_at','created_at','bare_file','bare_status','portrait_prompt'],
  // Character memories and their history were missing from the JSON backup (audit 2026-11-10).
  character_memories:['id','character_id','version','kind','text','related_event_id','visibility','status','belief_accuracy','reason','created_at','updated_at'],
  character_memory_revisions:['id','memory_id','version','kind','text','related_event_id','visibility','status','belief_accuracy','reason','actor','created_at'],
  generation_feedback:['id','request_key','request_hash','media_id','character_id','run_id','decision','rating','face_verdict','body_verdict','notes','created_at'],
  media_signal_distinct:['media_id','marked_at'],
  play_lines:['id','conversation_id','speaker','text','created_at'],
  play_seen:['media_id','character_id','seen_at'],
  play_content:['media_id','level','set_at'],
  play_inserts:['id','media_id','kind','source','character_id','location_id','created_at'],
  play_appointments:['id','character_id','location_id','world_day','slot','status','created_at'],
  play_invitations:['appointment_id','message_id','created_at'],
  play_items:['id','name','kind','node_id','carried','created_at','updated_at'],
  play_asset_sources:['media_id','target','placed_at'],
  play_media_feedback:['media_id','panel','cast_key','verdict','at'],
  play_event_media:['event_id','media_id','picked_at'],
  play_line_media:['line_id','media_id','kind','level','reasons_json','created_at'],
  play_turn_states:['reply_id','conversation_id','before_json','created_at'],
  play_turn_revisions:['id','request_key','conversation_id','reply_id','action','status','payload_json','created_at'],
  play_line_retractions:['line_id','revision_id'],
  play_line_meta:['line_id','beat','spark','choices_json','intimate'],
  play_conversation_flags:['conversation_id','intimate_at'],
  play_dates:['appointment_id','conversation_id','met_at','missed_noted_at','created_at'],
  play_line_scene:['line_id','media_id','kind','level','beat','start_at','display_json','created_at'],
  // Owner verdicts from the Képműhely and rejected figures are decisions, so they are backed up.
  workshop_checks:['item_key','target','character_id','location_id','verdict','face','body','note','job_id','created_at'],
  workshop_media_flags:['media_id','no_characters','set_at'],
  idea_box_notes:['media_id','note','updated_at'],
  workshop_dismissed:['key','created_at'],
  sprite_rejections:['sprite_id','sha256','note','rejected_at'],
  play_generation_jobs:['id','target','character_id','location_id','expression','time_of_day','status','brief_json','media_id','placed_media_id','note','model','created_at','updated_at'],
  world_runs:['id','world_day','slot','events','messages','dropped','cost_usd','created_at']
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
  function protagonist(){const setting=one("SELECT value FROM application_settings WHERE key='protagonist'");if(setting)return character(setting.value);const list=all('SELECT c.* FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL');return list.find(c=>c.name.toLowerCase()==='palor')||null;}
  function crop(cid){return one('SELECT cover_crop FROM character_ui WHERE character_id=?',cid)?.cover_crop||null;}
  async function handle({p,body,req,json}){
    let match;
    if((match=p.match(/^\/api\/characters\/([^/]+)\/profile-field$/))&&req.method==='POST'){
      const current=character(match[1]);if(!['name','aliases','biography','personality','sexuality','speech_style','appearance','notes','race'].includes(body.field))throw fail('Unknown profile field.');const value=body.field==='race'?raceValue(body.value):String(body.value??'').slice(0,body.field==='name'?200:30000);if(body.field==='name'&&!value.trim())throw fail('A character needs a name.');if(Object.hasOwn(body,'expected')&&current[body.field]!==body.expected&&current[body.field]!==value)throw fail('This field changed on another device. Your text is still in the editor; compare it with the latest saved version before retrying.',409);run(`UPDATE characters SET ${body.field}=? WHERE id=?`,value,match[1]);json({ok:true});return true;
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
      }finally{moving.delete(m.id);}
      // The file is gone: remove the catalogue record and its links too (owner request
      // 2026-11-10). A catalogue-only removal whose original still exists keeps its record.
      const purged=ctx.purgeErased?await ctx.purgeErased([m.id]):null;
      json({ok:true,physical:!!h.physical,record_removed:purged?.removed===1});return true;
    }
    if((match=p.match(/^\/api\/media\/([^/]+)\/restore-item$/))&&req.method==='POST'){
      if(one('SELECT 1 FROM application_settings WHERE key=?','erased_media:'+match[1]))throw fail('This removed item was permanently erased and cannot be restored here.',409);
      const h=one('SELECT * FROM media_hidden WHERE media_id=?',match[1]);if(!h)throw fail('Removed item not found.',404);let result={};if(h.physical)result=await relocate(h.media_id,h.original_path);run('DELETE FROM media_hidden WHERE media_id=?',h.media_id);json({...result,ok:true});return true;
    }
    const separateIdentities='Tibor the admin and Palor the character are unrelated identities and must not be merged, aliased or linked.';
    if(p==='/api/palor-merge/preview'&&req.method==='GET')throw fail(separateIdentities,400);
    if(p==='/api/palor-merge'&&req.method==='POST')throw fail(separateIdentities,400);
    return false;
  }
  return {handle,crop,protagonist,relocate,removeCatalogue};
}
