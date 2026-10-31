// Rebuildable local projection. The shared analysis result remains the source of truth.
import {analysisDigest} from './analysis-model.mjs';
import {describeMediaPurpose,planningLabels} from './media-purpose.mjs';
export function installWorldIndex(db){
  db.exec(`CREATE TABLE IF NOT EXISTS world_assets(media_id TEXT PRIMARY KEY,source_sha256 TEXT NOT NULL,result_item_id TEXT NOT NULL,content_level TEXT NOT NULL,scope TEXT NOT NULL,narration_only INTEGER NOT NULL,camera_direction TEXT NOT NULL,camera_elevation TEXT NOT NULL,framing TEXT NOT NULL,review_state TEXT NOT NULL DEFAULT 'proposed',result_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS world_labels(media_id TEXT NOT NULL,facet TEXT NOT NULL,concept_key TEXT NOT NULL,hu TEXT NOT NULL,en TEXT NOT NULL,evidence TEXT NOT NULL,uncertain INTEGER NOT NULL,basis TEXT NOT NULL,participant_id TEXT NOT NULL,activity_id TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS world_label_lookup ON world_labels(facet,concept_key,media_id);
  CREATE TABLE IF NOT EXISTS world_asset_characters(media_id TEXT NOT NULL,character_id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(media_id,character_id));
  CREATE TABLE IF NOT EXISTS world_asset_purposes(media_id TEXT PRIMARY KEY,purpose TEXT NOT NULL,payload_json TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS world_search USING fts5(media_id UNINDEXED,hu,en,tokenize='unicode61 remove_diacritics 2');`);
}
export const worldConceptKey=(facet,label)=>facet+':'+analysisDigest(label.normalize('NFC').trim().toLocaleLowerCase('en')).slice(0,20);
const key=worldConceptKey;
export function indexWorldResult(db,{media_id,source_sha256,result_item_id,result,characters=[],source_relative_path=''}){
  const scene=result.scene_details,world=result.world_details;if(!scene||!world)throw Error('World result required');
  const purpose=describeMediaPurpose(source_relative_path,result);
  const labels=[];
  const add=(facet,label,evidence='',uncertain=false,basis='visible_cues',participant_id='',activity_id='')=>labels.push({facet,concept_key:key(facet,label.en),hu:label.hu,en:label.en,evidence,uncertain:uncertain?1:0,basis,participant_id,activity_id});
  add('environment',scene.environment.observed_function,scene.environment.evidence,scene.environment.uncertain);
  for(const setting of scene.compatible_settings)add('compatible_setting',setting.label,setting.evidence,setting.uncertain,setting.basis);
  for(const activity of scene.activities){add('activity',activity.activity,activity.evidence,activity.uncertain,'visible_cues','',activity.id);add('position',activity.position,activity.evidence,activity.uncertain,'visible_cues','',activity.id);for(const role of activity.roles)add('role',{hu:role.role,en:role.role},role.evidence,activity.uncertain||role.uncertain,'visible_cues',role.participant_id,activity.id);}
  for(const coverage of world.reference_coverage)for(const use of coverage.usable_for)add('reference_use',{hu:use,en:use},coverage.limitations,coverage.uncertain,'visible_cues',coverage.participant_id);
  for(const feature of world.scene_requirements.visible_features)add('visible_feature',feature,world.scene_requirements.evidence,world.scene_requirements.uncertain);
  for(const conflict of world.scene_requirements.incompatible_uses)add('incompatible_use',conflict,world.scene_requirements.evidence,true);
  for(const tag of result.tags)add('tag:'+tag.category,{hu:tag.hu,en:tag.en},tag.evidence,tag.uncertain);
  for(const use of purpose.uses)add('usage_intent',planningLabels[use],'Alkotói tervmappa és az elemzésben megfigyelt felhasználhatóság.',false,'creator_intent');
  db.exec('BEGIN IMMEDIATE');try{
    // A refreshed model projection never silently preserves an earlier human approval.
    db.prepare("INSERT OR REPLACE INTO world_assets VALUES(?,?,?,?,?,?,?,?,?,'proposed',?)").run(media_id,source_sha256,result_item_id,world.content.level,scene.simulation_use.suggested_scope,scene.simulation_use.narration_only?1:0,world.camera.direction,world.camera.elevation,world.camera.framing,JSON.stringify(result));
    db.prepare('INSERT OR REPLACE INTO world_asset_purposes VALUES(?,?,?)').run(media_id,purpose.kind,JSON.stringify(purpose));
    for(const table of ['world_labels','world_asset_characters','world_search'])db.prepare(`DELETE FROM ${table} WHERE media_id=?`).run(media_id);
    const insert=db.prepare('INSERT INTO world_labels VALUES(?,?,?,?,?,?,?,?,?,?)');for(const label of labels)insert.run(media_id,label.facet,label.concept_key,label.hu,label.en,label.evidence,label.uncertain,label.basis,label.participant_id,label.activity_id);
    for(const c of characters)db.prepare('INSERT OR IGNORE INTO world_asset_characters VALUES(?,?,?)').run(media_id,c.id,c.name);
    db.prepare('INSERT INTO world_search(media_id,hu,en) VALUES(?,?,?)').run(media_id,[result.description.hu,...labels.map(l=>l.hu)].join(' '),[result.description.en,...labels.map(l=>l.en)].join(' '));db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function searchWorldIndex(db,{query='',scope='',content='',direction='',elevation='',framing='',character_id='',character_ids=[],facets={},active_media_ids=null,excludePlanning=false,includeUnreviewed=false,limit=20,offset=0}={}){
  const clauses=[],params=[];
  if(!includeUnreviewed)clauses.push("a.review_state='accepted'");
  if(scope==='generation_plan')clauses.push("EXISTS(SELECT 1 FROM world_asset_purposes p WHERE p.media_id=a.media_id AND p.purpose='generation_plan')");
  else{
    if(scope||!includeUnreviewed||excludePlanning)clauses.push("NOT EXISTS(SELECT 1 FROM world_asset_purposes p WHERE p.media_id=a.media_id AND p.purpose='generation_plan')");
    if(scope==='scene_illustration')clauses.push("a.scope='scene_illustration' AND a.narration_only=0");else if(scope){clauses.push('a.scope=?');params.push(scope);}
  }
  for(const [column,value]of [['content_level',content],['camera_direction',direction],['camera_elevation',elevation],['framing',framing]])if(value){clauses.push(`a.${column}=?`);params.push(value);}
  if(!Array.isArray(character_ids)||character_ids.length>8||character_ids.some(id=>typeof id!=='string'))throw Error('Invalid character criteria');
  for(const id of new Set([character_id,...character_ids].filter(Boolean))){clauses.push('EXISTS(SELECT 1 FROM world_asset_characters c WHERE c.media_id=a.media_id AND c.character_id=?)');params.push(id);}
  const facetNames=['environment','compatible_setting','activity','position','role','reference_use','visible_feature','usage_intent'];
  if(!facets||typeof facets!=='object'||Array.isArray(facets))throw Error('Invalid facet criteria');
  for(const [facet,values]of Object.entries(facets)){
    if(!facetNames.includes(facet)||!Array.isArray(values)||values.length>8||values.some(v=>typeof v!=='string'||!v.trim()||v.length>120))throw Error('Invalid facet criteria');
    if(values.length){clauses.push(`EXISTS(SELECT 1 FROM world_labels l WHERE l.media_id=a.media_id AND l.facet=? AND l.concept_key IN (${values.map(()=>'?').join(',')}))`);params.push(facet,...values.map(v=>worldConceptKey(facet,v)));}
  }
  if(active_media_ids!==null){const ids=[...active_media_ids];if(ids.length>20000||ids.some(id=>typeof id!=='string'))throw Error('Invalid active media criteria');if(!ids.length)clauses.push('0');else{clauses.push('a.media_id IN ('+ids.map(()=>'?').join(',')+')');params.push(...ids);}}
  const tokens=query.normalize('NFC').match(/[\p{L}\p{N}_-]+/gu)?.slice(0,12)||[];
  if(tokens.length){clauses.push('a.media_id IN (SELECT media_id FROM world_search WHERE world_search MATCH ?)');params.push(tokens.map(t=>'"'+t+'"').join(' AND '));}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const total=db.prepare('SELECT count(*) n FROM world_assets a'+where).get(...params).n;
  return {total,items:db.prepare('SELECT a.* FROM world_assets a'+where+' ORDER BY a.media_id LIMIT ? OFFSET ?').all(...params,Math.max(1,Math.min(50,Math.floor(limit)||20)),Math.max(0,Math.floor(offset)||0))};
}
