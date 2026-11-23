// Explicit creator folder intent, separate from model observations and story canon.
export const planningFolder='20_SHARED_MEDIA/Unassigned/Generation plans, ideas';
export const planningLabels={generation_plan:{hu:'Megvalósítandó terv',en:'Generation plan'},action_scheme:{hu:'Akcióséma',en:'Action scheme'},pose_reference:{hu:'Pózreferencia',en:'Pose reference'},composition_reference:{hu:'Kompozíciós referencia',en:'Composition reference'},scene_idea:{hu:'Jelenetötlet',en:'Scene idea'}};
function normalizedPath(value){
  if(typeof value!=='string'||/^[\\/]|^[A-Za-z]:|[\x00]/u.test(value))return null;
  const parts=value.normalize('NFC').replaceAll('\\','/').split('/');if(parts.some(p=>!p||p==='.'||p==='..'))return null;
  return parts.join('/').toLocaleLowerCase('en');
}
export function isPlanningSource(relativePath){const value=normalizedPath(relativePath),prefix=normalizedPath(planningFolder);return value!==null&&value.startsWith(prefix+'/');}
/** SQL predicate: media row alias must be `m`. Matches forward/backslash paths case-insensitively. */
export const planningSQL="lower(replace(m.relative_path,'\\','/')) LIKE (lower('"+planningFolder.replaceAll("'","''")+"') || '/%')";
/** Exclude drawn generation-plan / idea sheets from Needs sorting and machine categorize queues. */
export const notPlanningSQL='NOT ('+planningSQL+')';
/** Generated figure/background sources copied into Play folders (play-assets): game assets, never sorting work. Alias `m`. */
export const notPlayAssetSQL='NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id)';
/** The same, but harmless before Play mode created its table (standalone use): pass the db helper `one`. */
export const playAssetFilter=one=>one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_asset_sources'")?notPlayAssetSQL:'1';
/** Expression variants are intentional assets, not near-duplicate removal candidates. Alias `m`.
 * Check the source marker too: imported figure originals can live in ordinary catalogue folders.
 * Exact byte-duplicate checks remain separate and available.
 */
export function figureSimilarityFilter(one){
  const folder="instr('/' || lower(replace(m.relative_path,'\\','/')), '/szereplő-alakok/')=0";
  const source=one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_asset_sources'")
    ?"NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id AND pa.target='figure')":'1';
  return `(${folder} AND ${source})`;
}
export function describeMediaPurpose(relativePath,result){
  if(!isPlanningSource(relativePath))return {kind:'catalogue_media',realization_state:'unspecified',simulation_role:'scene_or_reference_candidate',basis:'default_media_scope',uses:[]};
  const uses=['generation_plan'];
  if(result?.scene_details?.activities?.length)uses.push('action_scheme');
  if(result?.scene_details?.activities?.some(a=>a.position?.en?.trim())||result?.world_details?.reference_coverage?.some(r=>r.usable_for.includes('pose_reference')))uses.push('pose_reference');
  if(result?.scene_details?.participants?.some(p=>p.region)||result?.tags?.some(t=>t.category==='reference_use'&&/composition/i.test(t.en)))uses.push('composition_reference');
  if(result?.background?.kind==='scene'||result?.scene_details?.compatible_settings?.length)uses.push('scene_idea');
  return {kind:'generation_plan',realization_state:'planned',simulation_role:'planning_only',basis:'explicit_user_folder_rule',visual_medium_hint:'illustration_or_comic',medium_hint_source:'user_group_description_not_per_image_recognition',uses,story_event_evidence:false,character_identity_evidence:false};
}
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderMediaPurpose(intent){
  if(intent?.kind!=='generation_plan')return '';
  return `<aside><strong>Megvalósítandó terv · generálási segédlet</strong><p>${intent.uses.map(k=>escape(planningLabels[k]?.hu||k)).join(' · ')}</p><p>Alkotói tervmappához rendelve. A képen látható akció és testhelyzet séma vagy ötlet; nem megtörtént világesemény vagy jóváhagyott karakterazonosság bizonyítéka.</p></aside>`;
}
