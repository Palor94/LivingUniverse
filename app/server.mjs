import {installWorldReview,backupBeforeWorldReview,worldReviewTables} from './world-review.mjs';
import {installCompleteCharacterRename} from './complete-character-rename.mjs';
import {createRenameRoutes} from './character-rename-routes.mjs';
import {migrateCharacterRace,raceValue,suggestMaleName,nameCandidates} from './character-creation.mjs';
import {installCharacterPolicy} from './character-policy.mjs';
import {resourceRoot,characterFolder,characterParent} from './storage-layout.mjs';
import {defaultDataDir,verifyMediaRoot} from './runtime-config.mjs';
import {resolveMediaPath} from './media-paths.mjs';
import {assertNativeCataloguePaths} from './path-migration.mjs';
import {serviceCredentialEnvironment} from './service-credentials.mjs';
import {forgetRemovedReferences} from './reference-retention.mjs';
import {installGhostProfiles} from './ghost-profile.mjs';
import {installLocationCanvas} from './location-canvas.mjs';
import {installPermanentMediaDelete} from './permanent-media-delete.mjs';
import http from 'node:http';
import {digest as referenceDigest} from './character-edit.mjs';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs, createReadStream, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import {installEnhancements,extraTables} from './enhancements.mjs';
import {installCatalogueActions} from './catalogue-actions.mjs';
import {installReconciliation} from './reconciliation.mjs';
import {installDuplicates} from './duplicates.mjs';
import {installTaxonomy} from './taxonomy.mjs';
import {installSuggestions} from './suggestions.mjs';
import {installFolderSync} from './folder-sync.mjs';
import {installVideoCovers} from './video-covers.mjs';
import {installLocations} from './locations.mjs';
import {createMobileServer} from './mobile.mjs';
import {createMobileSorting} from './mobile-sorting.mjs';
import {installMcpChanges} from './mcp-changes.mjs';
import {databaseIdentity} from './character-edit.mjs';
import {installCharacterReferenceCrops,backupBeforeCharacterCrops} from './character-reference-crops.mjs';
import {referenceCrop,selectedCrop,referenceKey,referenceSnapshot,previousReference} from './reference-crop.mjs';
import {installImageCrops} from './image-crops.mjs';
import {installMediaImports} from './media-imports.mjs';
import {backupBeforeMediaUploads} from './media-uploads.mjs';
import {installImageGeneration,backupBeforeImageGeneration} from './image-generation.mjs';
import {createGrokConnections} from './grok-connections.mjs';
import {imageCredentialEnvironment} from './sogni-credentials.mjs';
import {installDesktopGeneration} from './desktop-generation.mjs';
import {createCatalogue as openMcpCatalogue} from '../mcp/catalogue.mjs';
import {backupBeforeStoryMigration,installStoryEvents} from './story-events.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = resourceRoot(path.resolve(appDir, '..'));
const types = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.bmp':'image/bmp','.mp4':'video/mp4','.mov':'video/quicktime','.m4v':'video/mp4','.webm':'video/webm'};
const ignored = new Set(['.git','.codex','.agents','node_modules','app','tests','docs','backups']);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const fail = (message, status=400) => Object.assign(new Error(message), {status});
const str = (value, max=30000) => String(value ?? '').slice(0,max);

export async function createApp(options={}) {
  const root = path.resolve(options.root || defaultRoot);
  const dataDir = options.dataDir || defaultDataDir();
  await verifyMediaRoot(root,options.mediaRootId);
  await fs.mkdir(dataDir,{recursive:true});
  const db = new DatabaseSync(path.join(dataDir,'universe.sqlite'));
  try{assertNativeCataloguePaths(db);}catch(error){db.close();throw error;}
  let storyMigrationBackup,characterCropMigrationBackup;
  try{characterCropMigrationBackup=await backupBeforeCharacterCrops(db,dataDir);storyMigrationBackup=await backupBeforeStoryMigration(db,dataDir);}catch(e){db.close();throw e;}
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,name TEXT NOT NULL,aliases TEXT NOT NULL DEFAULT '',biography TEXT NOT NULL DEFAULT '',personality TEXT NOT NULL DEFAULT '',appearance TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',cover_id TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,relative_path TEXT NOT NULL UNIQUE,folder TEXT NOT NULL,kind TEXT NOT NULL,size INTEGER,modified_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS depictions(media_id TEXT NOT NULL REFERENCES media(id),character_id TEXT NOT NULL REFERENCES characters(id),PRIMARY KEY(media_id,character_id));
    CREATE TABLE IF NOT EXISTS media_notes(media_id TEXT PRIMARY KEY REFERENCES media(id),tags TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id),character_id TEXT NOT NULL REFERENCES characters(id),decision TEXT NOT NULL,rating INTEGER,notes TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canon(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),parent_id TEXT REFERENCES canon(id),appearance TEXT NOT NULL,references_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS relationships(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES characters(id),target_id TEXT NOT NULL REFERENCES characters(id),description TEXT NOT NULL,UNIQUE(source_id,target_id));
    CREATE TABLE IF NOT EXISTS sorted_folders(folder TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id));
    CREATE TABLE IF NOT EXISTS file_moves(id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id),from_path TEXT NOT NULL,to_path TEXT NOT NULL,status TEXT NOT NULL,sha256 TEXT,created_at TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const profileColumns=new Set(db.prepare('PRAGMA table_info(characters)').all().map(c=>c.name));
  const profileMigration=readFileSync(new URL('./migrations/011-character-expression.up.sql',import.meta.url),'utf8');
  db.exec('BEGIN IMMEDIATE');
  try{for(const sql of profileMigration.split(';').filter(s=>s.trim())){const field=sql.match(/ADD COLUMN (sexuality|speech_style)/)?.[1];if(field&&!profileColumns.has(field))db.exec(sql);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  try{await migrateCharacterRace(db,dataDir);}catch(error){db.close();throw error;}
  const all = (q,...args) => db.prepare(q).all(...args);
  const one = (q,...args) => db.prepare(q).get(...args);
  const run = (q,...args) => db.prepare(q).run(...args);
  function transaction(fn) {db.exec('BEGIN IMMEDIATE');try {const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  function character(cid) {const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)throw fail('Character not found',404);return {...c,cover_frame:videoCovers.details(c.id,c.cover_id),cover_crop:one('SELECT cover_crop FROM character_ui WHERE character_id=?',cid)?.cover_crop||null};}
  function asset(mid) {const m=one('SELECT * FROM media WHERE id=?',mid);if(!m)throw fail('Media not found',404);return m;}
  function canon(cid) {return one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);}
  function characterDeletionBlock(cid){
    if(one("SELECT 1 FROM application_settings WHERE key LIKE 'rename:v1:plan:%' AND json_extract(value,'$.status')='applied' AND json_extract(value,'$.payload.character_id')=? LIMIT 1",cid))return 'This character has rename audit history that must be preserved.';
    if(one('SELECT 1 FROM application_settings WHERE key=?','ghost:character:'+cid))return 'This character has structured profile history that must be preserved.';
    if(one('SELECT 1 FROM media_imports WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM media_import_targets WHERE character_id=? LIMIT 1',cid))return 'This character has media import history that must be preserved.';
    if(one('SELECT 1 FROM story_event_participants WHERE character_id=? LIMIT 1',cid)||one("SELECT 1 FROM story_event_revisions r,json_each(r.payload_json,'$.participants') p WHERE json_extract(p.value,'$.character_id')=? LIMIT 1",cid))return 'This character has recorded story history and must be preserved.';
    if(one("SELECT 1 FROM depictions d WHERE d.character_id=? AND NOT EXISTS(SELECT 1 FROM application_settings s WHERE s.key='erased_media:'||d.media_id) LIMIT 1",cid))return 'This character still has assigned media, including recoverable copies in Removed items. Unassign or permanently erase that media first.';
    if(one('SELECT 1 FROM canon WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM reviews WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM sorting_suggestions WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM folder_changes WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM character_cover_frames WHERE character_id=? LIMIT 1',cid)||one('SELECT 1 FROM character_ui WHERE merged_into=? OR (character_id=? AND merged_into IS NOT NULL) LIMIT 1',cid,cid))return 'This character has identity, review, or other recorded history that must be preserved and cannot be deleted here.';
    return null;
  }
  function mediaDetails(m) {
    return {...m,character_crops:characterCrops.drafts(m.id),location:locations.details(m.id),locations:locations.allDetails(m.id),structured_tags:taxonomy.details(m.id),scan:reconciliation.details(m.id),...catalogue.details(m.id), ...one('SELECT tags,notes FROM media_notes WHERE media_id=?',m.id),characters:all('SELECT c.id,c.name FROM characters c JOIN depictions d ON c.id=d.character_id LEFT JOIN character_ui u ON u.character_id=c.id WHERE d.media_id=? AND u.merged_into IS NULL',m.id),reviews:all('SELECT * FROM reviews WHERE media_id=? ORDER BY rowid',m.id),moves:all('SELECT * FROM file_moves WHERE media_id=? ORDER BY rowid DESC',m.id),canonicalFor:all('SELECT character_id FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,\'$.media_id\')=?)',m.id).map(c=>c.character_id)};
  }
  let scanning=false;
  let lastScan=null;
  async function scan() {
    if(options.mediaRootId!==undefined)await verifyMediaRoot(root,options.mediaRootId);
    if(scanning||moving.size||reconciliation.isRelinking())throw fail('A scan or file move is already running. Please wait.',409);
    scanning=true;
    try{lastScan=await reconciliation.scan();return lastScan;}finally{scanning=false;}
  }
  async function safeFile(m) {
    const full=resolveMediaPath(root,m.relative_path);
    if(!full.startsWith(root+path.sep))throw fail('Invalid media path',403);
    let real;try{real=await fs.realpath(full);}catch{throw fail('This file is missing or unavailable in OneDrive. Make it available on this device, then retry.',404);}
    const realRoot=await fs.realpath(root);
    if(!real.startsWith(realRoot+path.sep))throw fail('Media is outside the resource folder',403);
    return real;
  }
  const moving=new Set();
  run("UPDATE file_moves SET status='interrupted' WHERE status IN ('preparing','verified','catalogued')");
  async function fingerprint(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
  async function destinationFor(m,folder){
    if(typeof folder!=='string'||!folder.trim()||folder!==folder.trim()||folder==='.'||folder==='..'||/[\\/:*?"<>|]/.test(folder)||/[. ]$/.test(folder)||ignored.has(folder.toLowerCase())||folder.startsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(folder))throw fail('Choose a valid character folder name.');
    folder=characterFolder(root,folder);const dir=path.resolve(root,folder);if(!dir.startsWith(root+path.sep)||path.dirname(dir)!==characterParent(root))throw fail('The destination must be inside your resource folder.');
    try{const real=await fs.realpath(dir);const realRoot=await fs.realpath(root);if(!real.startsWith(realRoot+path.sep))throw fail('The destination points outside your resource folder.',403);if(!(await fs.stat(real)).isDirectory())throw fail('The destination is not a folder.');}catch(e){if(e.code!=='ENOENT')throw e;}
    return {dir,full:path.join(dir,path.basename(m.relative_path)),relative:path.join(folder,path.basename(m.relative_path)),folder};
  }
  const enhancements=installEnhancements({db,root,dataDir,all,one,run,transaction,asset,character,canon,safeFile,fingerprint,moving,isScanning:()=>scanning,fail});
  const catalogue=installCatalogueActions({all,one,run,transaction,fail});
  const reconciliation=installReconciliation({db,root,dataDir,types,ignored,all,one,run,transaction,fail,fingerprint,removeCatalogue:enhancements.removeCatalogue,isBusy:()=>scanning||moving.size>0||folderSync.isBusy()});
  const duplicates=installDuplicates({db,all,one,run,fail,safeFile,fingerprint,isBusy:()=>scanning||moving.size>0,availability:options.duplicateAvailability});
  const taxonomy=installTaxonomy({db,all,one,run,transaction,fail});
  const suggestions=installSuggestions({db,all,one,run,transaction,fail,safeFile});
  const folderSync=installFolderSync({db,root,dataDir,all,one,run,transaction,fail,fingerprint,moving,isScanning:()=>scanning});
  const videoCovers=installVideoCovers({db,all,one,run,transaction,fail,safeFile});
  const characterCrops=installCharacterReferenceCrops({db,one,all,run,transaction,asset,safeFile,fingerprint,isBusy:()=>scanning||moving.size>0||folderSync.isBusy()||imageGeneration.isBusy(),fail,saveCanon,beforeApprovalCommit:options.cropApprovalTestOptions?.beforeCommit});
  const imageCrops=installImageCrops({db,root,dataDir,one,all,run,transaction,asset,safeFile,fingerprint,moving,isScanning:()=>scanning,fail});
  const locations=installLocations({db,root,all,one,run,transaction,fail,setLocation:catalogue.setLocation,relocate:enhancements.relocate});
  const storyEvents=installStoryEvents({db,transaction});
  const characterPolicy=installCharacterPolicy({db,dataDir,config:options.characterPolicy,one});
  const ghostProfiles=installGhostProfiles({one,run,transaction,characterPolicy});
  const worldReviewMigrationBackup=await backupBeforeWorldReview(db,dataDir);
  const worldReview=installWorldReview({db,root,isBusy:()=>folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking(),availability:options.worldReviewAvailability});
  const locationCanvas=installLocationCanvas({dataDir,editor:locations.editor,transaction});
  let mcpWriteConfig=options.mcpWrites;
  try{
    if(mcpWriteConfig===undefined){try{mcpWriteConfig=JSON.parse(await fs.readFile(path.join(dataDir,'mcp-writes.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
    if(mcpWriteConfig?.enabled===true){const origin=new URL(mcpWriteConfig.origin);if(!['review','trusted'].includes(mcpWriteConfig.approval_mode??'review')||!/^[a-f0-9]{64}$/.test(mcpWriteConfig.token)||mcpWriteConfig.database_id!==databaseIdentity(path.join(dataDir,'universe.sqlite'))||origin.protocol!=='https:'||!origin.hostname.endsWith('.ts.net')||origin.origin!==mcpWriteConfig.origin||typeof mcpWriteConfig.login!=='string'||!mcpWriteConfig.login)throw Error();}
  }catch{mcpWriteConfig=null;console.error('MCP changes disabled: invalid local configuration. Desktop and read-only access remain available.');}
  let previewMedia=null;
  const canonBeforeCommit=options.canonTestOptions?.beforeCommit;
  async function saveCanon(options){
    const {characterId,appearance='',references,reason='',expectedRevisionId,expectedReferences,expectedFingerprints,afterSave}=options;
    character(characterId);
    // Reference-only changes retain the appearance revision ID, so both snapshots
    // are required. A missing comparison must never silently disable this guard.
    if(!Object.hasOwn(options,'expectedRevisionId')||!(expectedRevisionId===null||typeof expectedRevisionId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedRevisionId)))throw fail('Provide expected_revision_id from the current character, or null for its first approval.');
    if(!Array.isArray(expectedReferences)||expectedReferences.some(ref=>!ref||typeof ref.media_id!=='string'||!['face','body','detail','general'].includes(ref.role)||!(ref.sha256===undefined||typeof ref.sha256==='string'&&/^[0-9a-f]{64}$/.test(ref.sha256))))throw fail('Provide expected_references from the current character, or [] for its first approval.');
    const expectedSnapshot=expectedReferences.map(referenceSnapshot);
    if(!Array.isArray(references))throw fail('Invalid reference selection');
    for(const r of references){if(!r||!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',r.media_id,characterId)&&!options.assignMedia?.includes(r.media_id))throw fail('References must be assigned to this character.');if(!['face','body','detail','general'].includes(r.role))throw fail('Choose a reference role.');}
    const keys=new Set();for(const ref of references){const key=referenceKey(ref);if(keys.has(key))throw fail('Each approved reference must have a distinct identifier.');keys.add(key);if(ref.reference_id&&!/^[a-f0-9-]{36}$/i.test(ref.reference_id))throw fail('Invalid reference identifier.');}
    const prior=canon(characterId);if((prior?.id??null)!==expectedRevisionId)throw fail('The approved identity changed. Retrieve the character and prepare the proposal again.',409);const previous=prior?JSON.parse(prior.references_json):[],snapshots=[];
    for(const r of references){const m=asset(r.media_id);if(m.kind!=='image'||!one('SELECT 1 FROM active_media WHERE id=?',r.media_id))throw fail('References must be active images.');const sha256=await fingerprint(await safeFile(m)),expected=previous.find(x=>x.media_id===r.media_id)?.sha256;if(expected&&expected!==sha256)throw fail('An approved reference file has changed. Restore the original, or explicitly remove the reference before approving its replacement.');if(expectedFingerprints&&Object.hasOwn(expectedFingerprints,r.media_id)&&expectedFingerprints[r.media_id]!==sha256)throw fail('A selected image changed after human approval. Prepare a new reference proposal.',409);const crop=selectedCrop(r,previous);const old=previousReference(r,previous),metadata=old?.reference_id?referenceSnapshot(old):options.newReference?.reference_id===r.reference_id?options.newReference:r.reference_id?{reference_id:r.reference_id}:{};if(r.reference_id&&!old&&options.newReference?.reference_id!==r.reference_id)throw fail('New crop approvals require the authenticated administrator endpoint.',403);const snapshot={...metadata,media_id:r.media_id,role:r.role,sha256,...(crop?{crop}:{})};if(!crop)delete snapshot.crop;await characterCrops.validateSelection(snapshot);snapshots.push(snapshot);}
    if(canonBeforeCommit)await canonBeforeCommit();
    return transaction(()=>{if(moving.size)throw fail('Várd meg a folyamatban lévő fájlművelet végét a referencia jóváhagyásával.',409);for(const mid of options.assignMedia||[])run('INSERT OR IGNORE INTO depictions VALUES(?,?)',mid,characterId);for(const ref of snapshots)if(!one('SELECT 1 FROM active_media m JOIN depictions d ON d.media_id=m.id WHERE m.id=? AND d.character_id=?',ref.media_id,characterId))throw fail('A kiválasztott referencia közben törlődött vagy a hozzárendelése megváltozott.',409);const latest=canon(characterId);if((latest?.id??null)!==(prior?.id??null))throw fail('The approved identity changed while saving. Prepare the proposal again.',409);const liveRefs=latest?JSON.parse(latest.references_json):[];if(referenceDigest(liveRefs)!==referenceDigest(expectedSnapshot))throw fail('The approved references changed while saving. Retrieve the character and try again.',409);let saved;if(!options.forceRevision&&latest&&(latest.appearance??'')===str(appearance,30000)){run('UPDATE canon SET references_json=?,reason=? WHERE id=?',JSON.stringify(snapshots),previous.some(ref=>!snapshots.some(next=>next.media_id===ref.media_id))?'Reference data removed by creator':latest.reason,latest.id);saved=canon(characterId);}else{const revision=id();run('INSERT INTO canon VALUES(?,?,?,?,?,?,?)',revision,characterId,latest?.id||null,str(appearance,30000),JSON.stringify(snapshots),str(reason,1000)||'Explicit approval by Tibor',now());saved=canon(characterId);}if(typeof afterSave==='function')afterSave(saved);if(!options.preserveReferenceHistory)forgetRemovedReferences({all,run,characterId,retainedIds:snapshots.map(ref=>ref.media_id),previousReferences:previous});return saved;});
  }
  const mcpChanges=installMcpChanges({db,one,all,run,transaction,fail,characterPolicy,config:mcpWriteConfig,isBusy:()=>folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking(),asset,safeFile,fingerprint,saveCanon,previewMedia:(mediaId,ref)=>ref?characterCrops.preview(mediaId,ref):previewMedia?.(mediaId)});
  const mediaUploadMigrationBackup=await backupBeforeMediaUploads(db,dataDir);
  const mediaImports=installMediaImports({db,root,dataDir,one,all,run,transaction,config:mcpWriteConfig,isBusy:()=>folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking(),...(options.importTestOptions||{})});
  await mediaImports.uploads.cleanup();
  let imageConfig=options.imageGeneration;
  if(imageConfig===undefined){try{imageConfig=JSON.parse(await fs.readFile(path.join(dataDir,'image-generation.json'),'utf8'));}catch{imageConfig={};}}
  const imageMigrationBackup=await backupBeforeImageGeneration(db,dataDir);
  const imageGeneration=installImageGeneration({db,root,dataDir,one,all,run,transaction,mediaImports,characterPolicy,writeConfig:mcpWriteConfig,config:imageConfig,env:await imageCredentialEnvironment(dataDir,await serviceCredentialEnvironment(['OPENAI_API_KEY','XAI_API_KEY','SOGNI_API_KEY'])),isBusy:()=>mediaImports.isBusy()||folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking(),...(options.generationTestOptions||{})});
  const permanentDelete=installPermanentMediaDelete({db,root,dataDir,one,all,run,transaction,moving,isBusy:()=>scanning||folderSync.isBusy()||reconciliation.isRelinking()||mediaImports.isBusy()||imageGeneration.isBusy(),...(options.permanentDeleteTestOptions||{})});
  const desktopGeneration=installDesktopGeneration({imageGeneration,one,all});
  const characterRename=installCompleteCharacterRename({db,all,one,run,transaction,root,dataDir,characterPolicy,isBusy:()=>folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking()||mediaImports.isBusy()||imageGeneration.isBusy()});
  const renameRoutes=createRenameRoutes({rename:characterRename,authenticate:h=>mcpChanges.authenticate(h),privateOrigin:mcpWriteConfig?.origin,approvalMode:mcpWriteConfig?.approval_mode??'review'});
  const server=http.createServer(async(req,res)=>{
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      // Only same-origin loopback requests may read the private catalogue or change it.
      const host=req.headers.host;
      if(!/^127\.0\.0\.1:\d+$/.test(host||''))throw fail('Use the local application address',403);
      if(req.headers.origin && req.headers.origin!==`http://${host}`)throw fail('Cross-site requests are blocked',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw fail('Cross-site requests are blocked',403);
      const url=new URL(req.url,`http://${host}`);const p=url.pathname;
      const importUpload=p.match(/^\/api\/mcp-imports\/([a-f0-9-]{36})\/items\/([A-Za-z0-9_-]{8,128})$/i);
      if(importUpload&&req.method==='PUT'){
        mcpChanges.authenticate(req.headers.authorization);
        if(imageGeneration.isBusy())throw fail('An approved generation is running. Retry the upload shortly.',409);
        if(mcpWriteConfig.approval_mode!=='trusted')throw fail('Use the private upload page in review mode.',403);
        return json(await mediaImports.receive(importUpload[1],importUpload[2],req,{name:decodeURIComponent(req.headers['x-lu-filename']||'selected media'),contentType:req.headers['content-type'],expectedSha256:req.headers['x-lu-sha256']}));
      }
      let body={};
      if(['POST','PUT'].includes(req.method)){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw fail('Expected JSON',415);
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(p==='/api/restore'?50e6:/^\/api\/media\/[^/]+\/image-crop$/.test(p)?34*1024*1024:2e6))throw fail('Request is too large',413);}try{body=JSON.parse(raw||'{}');}catch{throw fail('Invalid JSON');}
      }
      if(characterRename.isBusy()&&['POST','PUT','PATCH','DELETE'].includes(req.method))throw fail('A teljes átnevezés folyamatban van. Várd meg a végét.',409);
      if((folderSync.isBusy()||reconciliation.isRelinking())&&['POST','PUT','PATCH','DELETE'].includes(req.method))throw fail('Folder synchronization or file reconciliation is running. Please wait before editing or scanning.',409);
      const scopedRead=(p==='/api/mcp-rename'&&['capabilities','get'].includes(body.operation))||(p==='/api/mcp-ghost'&&body.operation==='capabilities')||(p==='/api/mcp-changes'&&['status','get'].includes(body.operation))||(p==='/api/mcp-imports'&&['capabilities','get','upload_get','list'].includes(body.operation));
      const desktopGenerationRoute=/^\/api\/characters\/[a-f0-9-]{36}\/generation(?:\/|$)/i.test(p);
      if(mediaImports.isBusy()&&['POST','PUT','PATCH','DELETE'].includes(req.method)&&p!=='/api/mcp-imports'&&p!=='/api/mcp-generation'&&!desktopGenerationRoute&&!scopedRead)throw fail('A verified media import is running. Retry shortly.',409);
      if(imageGeneration.isBusy()&&['POST','PUT','PATCH','DELETE'].includes(req.method)&&p!=='/api/mcp-generation'&&!desktopGenerationRoute&&!scopedRead)throw fail('An approved image generation is running. Retry shortly.',409);
      if(permanentDelete.isBusy()&&['POST','PUT','PATCH','DELETE'].includes(req.method))throw fail('A végleges törlés folyamatban van. Várd meg a végét.',409);
      if(await permanentDelete.handle({p,body,req,json}))return;
      if(await worldReview.handle({p,body,req,url,json}))return;
      if(await locationCanvas.handle({p,body,req,json}))return;
      if(await desktopGeneration.handle({p,body,req,json}))return;
      if(p==='/api/mcp-generation'){
        try{
          mcpChanges.authenticate(req.headers.authorization);
          if(req.method!=='POST'||!body||Object.keys(body).some(k=>!['operation','arguments'].includes(k)))throw fail('Use a scoped generation operation.');
          const args=body.arguments||{};
          if(body.operation==='capabilities'){if(Object.keys(args).length)throw fail('Unexpected capability arguments.');return json(imageGeneration.capabilities());}
          if(body.operation==='prepare')return json(await imageGeneration.prepare(args));
          if(Object.keys(args).length!==1||!Object.hasOwn(args,'run_id'))throw fail('Use one generation run ID.');
          if(body.operation==='get')return json(imageGeneration.view(args.run_id));
          if(body.operation==='execute')return json(await imageGeneration.execute(args.run_id));
          throw fail('This generation operation is unavailable.');
        }catch(e){return json({code:e.code||'GENERATION_UNAVAILABLE',error:e.status?e.message:'Generation could not be processed.'},e.status||500);}
      }
      if(moving.size&&req.method==='POST'&&p.endsWith('/canon'))throw fail('Wait for the picture/file operation to finish before approving references.',409);
      if(await mcpChanges.service({p,body,req,json}))return;
      if(p==='/api/mcp-imports'){
        try{
          mcpChanges.authenticate(req.headers.authorization);
          if(req.method!=='POST'||!body||Object.keys(body).some(k=>!['operation','arguments'].includes(k)))throw fail('Use a scoped media import operation.',400);
          const args=body.arguments||{};
          if(body.operation==='capabilities'){if(Object.keys(args).length)throw fail('Unexpected capability arguments.');return json({enabled:true,version:3,import_management:{list:true,cancel:true,preserves_committed_media:true},formats:['image/jpeg','image/png','video/mp4','video/quicktime'],image_uploads:{native_file_params:true,chunks:true,chunk_bytes:262144,max_bytes:20971520,multiple_characters:true},approval_mode:mcpWriteConfig.approval_mode??'review'});}
          if(body.operation==='list')return json(mediaImports.list(args));
          if(body.operation==='cancel'){if(mcpWriteConfig.approval_mode!=='trusted')throw fail('Use the private import management page in review mode.',403);return json(await mediaImports.cancel(args));}
          if(body.operation==='begin')return json(mediaImports.begin(args));
          if(body.operation==='get'){if(Object.keys(args).length!==1||!Object.hasOwn(args,'import_id'))throw fail('Use one import ID.');return json(mediaImports.view(args.import_id));}
          if(body.operation==='upload_get'){if(Object.keys(args).length!==1||!Object.hasOwn(args,'upload_id'))throw fail('Use one upload ID.');return json(mediaImports.uploads.inspect(args.upload_id));}
          if(['upload_begin','upload_chunk','upload_finalize','files'].includes(body.operation)){
            if(mcpWriteConfig.approval_mode!=='trusted')throw fail('Use the private upload page in review mode.',403);
            const handler={upload_begin:mediaImports.uploads.begin,upload_chunk:mediaImports.uploads.chunk,upload_finalize:mediaImports.uploads.finalize,files:mediaImports.files}[body.operation];return json(await handler(args));
          }
          if(body.operation==='url'){if(mcpWriteConfig.approval_mode!=='trusted')throw fail('Use the private upload page in review mode.',403);return json(await mediaImports.fromUrl(args));}
          throw fail('This import operation is unavailable.',400);
        }catch(e){return json({code:e.code||'IMPORT_UNAVAILABLE',error:e.status?e.message:'The import could not be processed.'},e.status||500);}
      }
      if(await renameRoutes.handle({p,body,req,json,url}))return;
      if(await folderSync.handle({p,body,req,json}))return;
      if(await videoCovers.handle({p,body,req,res,json}))return;
      if(await characterCrops.handle({p,url,body,req,json,res}))return;
      if(await imageCrops.handle({p,body,req,json}))return;
      if(await locations.handle({p,body,req,json}))return;
      if(p==='/api/mcp-ghost'){
        try{
          mcpChanges.authenticate(req.headers.authorization);
          if(req.method!=='POST'||!body||Object.keys(body).some(k=>!['operation','arguments'].includes(k))||!body.arguments||typeof body.arguments!=='object'||Array.isArray(body.arguments))throw fail('Use a scoped ghost-profile operation.');
          if(body.operation==='capabilities'){if(Object.keys(body.arguments).length)throw fail('Unexpected capability arguments.');return json({enabled:true,template_editing_version:1,approval_mode:mcpWriteConfig.approval_mode??'review'});}
          if(body.operation==='template_update'){
            if(mcpWriteConfig.approval_mode!=='trusted')return json({code:'TEMPLATE_REVIEW_REQUIRED',error:'Shared-template editing requires the private creator template editor in review mode. Open the Szellemprofil template character there.'},403);
            return json(ghostProfiles.updateTemplate(body.arguments,'mcp-trusted'));
          }
          if(body.operation!=='propose')throw fail('Use a ghost-profile proposal or supported template operation.');
          const {character_id,...args}=body.arguments;return json(ghostProfiles.propose(character_id,args));
        }catch(e){return json({code:e.code||'GHOST_CHANGE_REJECTED',error:e.status?e.message:'The ghost-profile operation could not be completed.'},e.status||500);}
      }
      if(ghostProfiles.handle({p,body,req,json}))return;
      if(storyEvents.handle({p,body,req,url,json}))return;
      if(await reconciliation.handle({p,body,req,url,json}))return;
      if(await duplicates.handle({p,body,req,url,json}))return;
      if(await taxonomy.handle({p,body,req,url,json}))return;
      if(await suggestions.handle({p,body,req,url,json}))return;
      if(await enhancements.handle({p,body,req,json}))return;
      if(await catalogue.handle({p,body,req,json}))return;
      if(p==='/api/storage'&&req.method==='GET')return json({data_directory:path.resolve(dataDir),database:path.resolve(dataDir,'universe.sqlite'),resource_root:root,characters:one('SELECT COUNT(*) n FROM characters').n,media:one('SELECT COUNT(*) n FROM media').n});
      if(p==='/api/state'&&req.method==='GET')return json({characters:all(`SELECT c.*,u.cover_crop,(SELECT COUNT(*) FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE d.character_id=c.id) media_count FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY name COLLATE NOCASE`).map(c=>({...c,cover_frame:videoCovers.details(c.id,c.cover_id)})),protagonist:enhancements.protagonist(),folder_owners:all('SELECT * FROM sorted_folders'),folders:all('SELECT folder,COUNT(*) count FROM active_media GROUP BY folder ORDER BY folder'),stats:{media:one('SELECT COUNT(*) n FROM active_media').n,images:one("SELECT COUNT(*) n FROM active_media WHERE kind='image'").n,videos:one("SELECT COUNT(*) n FROM active_media WHERE kind='video'").n,inbox:one('SELECT COUNT(*) n FROM active_media m WHERE NOT EXISTS(SELECT 1 FROM media_categorization s WHERE s.media_id=m.id AND s.complete=1) AND NOT '+catalogue.locationSQL).n},scanning,lastScan});
      if(p==='/api/scan'&&req.method==='POST')return json(await scan());
      if(p==='/api/character-name-suggestion'&&req.method==='POST')return json(suggestMaleName(all('SELECT name FROM characters').map(c=>c.name),body.exclude??[],nameCandidates(body.race)));
      if(p==='/api/characters'&&req.method==='POST'){
        const name=str(body.name,200).trim();if(!name)throw fail('Please enter a name or working title.');const cid=id(),biography=body.gender?'Nem: '+str(body.gender,100)+'.':'';run('INSERT INTO characters(id,name,biography,created_at,race) VALUES(?,?,?,?,?)',cid,name,biography,now(),raceValue(body.race));return json(character(cid),201);
      }
      const cm=p.match(/^\/api\/characters\/([^/]+)$/);
      if(cm){const cid=cm[1];const c=character(cid);
        if(req.method==='GET')return json({...c,deletion_block:characterDeletionBlock(cid),canon:canon(cid)||null,history:all('SELECT current.* FROM canon current LEFT JOIN canon parent ON parent.id=current.parent_id WHERE current.character_id=? AND ((current.parent_id IS NULL AND length(trim(current.appearance))>0) OR (current.parent_id IS NOT NULL AND current.appearance<>parent.appearance)) ORDER BY current.rowid DESC',cid),relationships:all('SELECT r.*,c.name target_name FROM relationships r JOIN characters c ON c.id=r.target_id WHERE source_id=?',cid)});
        if(req.method==='DELETE'){
          transaction(()=>{
            const blocked=characterDeletionBlock(cid);if(blocked)throw fail(blocked,409);
            const snapshot={character:c,relationships:all('SELECT * FROM relationships WHERE source_id=? OR target_id=?',cid,cid),folders:all('SELECT * FROM sorted_folders WHERE character_id=?',cid),erased_media_links:all('SELECT * FROM depictions WHERE character_id=?',cid),deleted_at:now()};
            run('INSERT INTO application_settings(key,value) VALUES(?,?)','deleted_character:'+cid,JSON.stringify(snapshot));
            run('DELETE FROM relationships WHERE source_id=? OR target_id=?',cid,cid);
            run('DELETE FROM sorted_folders WHERE character_id=?',cid);
            run('DELETE FROM depictions WHERE character_id=?',cid);
            run('DELETE FROM character_ui WHERE character_id=?',cid);
            run("DELETE FROM application_settings WHERE key='protagonist' AND value=?",cid);
            run('DELETE FROM characters WHERE id=?',cid);
          });return json({ok:true});
        }
        if(req.method==='PUT'){
          const name=str(body.name,200).trim();if(!name)throw fail('A character needs a name or title.');const race=Object.hasOwn(body,'race')?raceValue(body.race):undefined;
          const checkExpected=()=>{if(body.expected){const current=character(cid);for(const key of ['aliases','biography','personality','sexuality','speech_style','appearance','notes','race'])if(Object.hasOwn(body.expected,key)&&current[key]!==body.expected[key]&&current[key]!==str(body[key],key==='aliases'?1000:30000))throw fail('Profile text changed on another device. Keep your draft and compare with the latest saved version.',409);}};checkExpected();
          if(body.cover_id){asset(body.cover_id);if(!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',body.cover_id,cid))throw fail('Assign this character to the cover first.');}
          if(name!==c.name)throw fail('A névhez használd a teljes átnevezési műveletet.',409);await folderSync.renameCharacter(cid,name);checkExpected();transaction(()=>{if(race!==undefined)run('UPDATE characters SET race=? WHERE id=?',race,cid);run('UPDATE characters SET name=?,aliases=?,biography=?,personality=?,appearance=?,notes=?,cover_id=? WHERE id=?',name,str(body.aliases,1000),str(body.biography),str(body.personality),str(body.appearance),str(body.notes),body.cover_id||null,cid);for(const field of ['sexuality','speech_style'])if(Object.hasOwn(body,field))run(`UPDATE characters SET ${field}=? WHERE id=?`,str(body[field]),cid);});return json(character(cid));
        }
      }
      const ca=p.match(/^\/api\/characters\/([^/]+)\/canon$/);
      if(ca&&req.method==='POST'){
        return json(await saveCanon({characterId:ca[1],appearance:body.appearance,references:body.references,reason:body.reason,expectedRevisionId:body.expected_revision_id,expectedReferences:body.expected_references,expectedFingerprints:body.expected_fingerprints}));
      }
      const integrity=p.match(/^\/api\/characters\/([^/]+)\/integrity$/);
      if(integrity&&req.method==='POST'){
        character(integrity[1]);const current=canon(integrity[1]);const refs=current?JSON.parse(current.references_json):[];const results=[];
        for(const r of refs){try{const file=await safeFile(asset(r.media_id));const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);results.push({media_id:r.media_id,status:r.sha256?(hash.digest('hex')===r.sha256?'unchanged':'changed'):'not fingerprinted'});}catch{results.push({media_id:r.media_id,status:'unavailable'});}}
        return json({results});
      }
      if(p==='/api/relationships'&&req.method==='POST'){
        character(body.source_id);character(body.target_id);if(body.source_id===body.target_id)throw fail('Choose a different character.');
        const desc=str(body.description,10000).trim();if(Object.hasOwn(body,'expected')){const current=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',body.source_id,body.target_id)?.description??null;if(current!==body.expected&&current!==(desc||null))throw fail('This relationship changed on another device. Keep your draft and compare the latest version.',409);}if(!desc){run('DELETE FROM relationships WHERE source_id=? AND target_id=?',body.source_id,body.target_id);}else{run('INSERT INTO relationships VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET description=excluded.description',id(),body.source_id,body.target_id,desc);}return json({ok:true});
      }
      if(p==='/api/media'&&req.method==='GET'){
        const where=[];const args=[];
        if(url.searchParams.get('character')){where.push('EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id AND d.character_id=?)');args.push(url.searchParams.get('character'));}
        const completed='EXISTS(SELECT 1 FROM media_categorization s WHERE s.media_id=m.id AND s.complete=1)';
        const count='(SELECT COUNT(*) FROM depictions d LEFT JOIN character_ui u ON u.character_id=d.character_id WHERE d.media_id=m.id AND u.merged_into IS NULL)';
        if(url.searchParams.get('inbox')==='1')where.push('NOT '+completed+' AND NOT '+catalogue.locationSQL);
        if(url.searchParams.get('role')==='location')where.push(catalogue.locationSQL);
        if(url.searchParams.get('role')==='character')where.push('NOT '+catalogue.locationSQL);
        const status=url.searchParams.get('status');
        if(status==='location')where.push(catalogue.locationSQL);
        if(status==='complete')where.push(completed);
        if(status==='unassigned')where.push('NOT '+catalogue.locationSQL+' AND NOT '+completed+' AND '+count+'=0');
        if(status==='pending')where.push('NOT '+catalogue.locationSQL+' AND NOT '+completed+' AND '+count+'=1');
        if(status==='multiple')where.push('NOT '+catalogue.locationSQL+' AND NOT '+completed+' AND '+count+'>1');
        if(url.searchParams.has('folder')){where.push('m.folder=?');args.push(url.searchParams.get('folder'));}
        if(['image','video'].includes(url.searchParams.get('kind'))){where.push('m.kind=?');args.push(url.searchParams.get('kind'));}
        if(url.searchParams.get('structured_tag')){where.push('EXISTS(SELECT 1 FROM media_tags mt WHERE mt.media_id=m.id AND mt.tag_id=?)');args.push(url.searchParams.get('structured_tag'));}
        if(url.searchParams.get('location_id')){where.push('(EXISTS(SELECT 1 FROM media_locations ml WHERE ml.media_id=m.id AND ml.location_id=?) OR EXISTS(SELECT 1 FROM media_location_links ml WHERE ml.media_id=m.id AND ml.location_id=?))');args.push(url.searchParams.get('location_id'),url.searchParams.get('location_id'));}
        const search=url.searchParams.get('search');if(search){where.push("(m.relative_path LIKE ? OR EXISTS(SELECT 1 FROM media_notes n WHERE n.media_id=m.id AND (n.tags LIKE ? OR n.notes LIKE ?)) OR EXISTS(SELECT 1 FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id JOIN tag_groups g ON g.id=t.group_id WHERE mt.media_id=m.id AND (t.name LIKE ? OR g.name LIKE ?)))");args.push(...Array(5).fill('%'+str(search,200)+'%'));}
        const clause=where.length?' WHERE '+where.join(' AND '):'';
        const mediaOrder=url.searchParams.get('character')?'(SELECT MAX(g.created_at) FROM image_generation_outputs g WHERE g.media_id=m.id) DESC,m.relative_path':'m.relative_path';
        if(url.searchParams.get('ids_only')==='1')return json({ids:all('SELECT m.id FROM active_media m'+clause+' ORDER BY '+mediaOrder,...args).map(m=>m.id)});
        const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const rows=all('SELECT m.* FROM active_media m'+clause+' ORDER BY '+mediaOrder+' LIMIT 48 OFFSET ?',...args,offset);return json({total:one('SELECT COUNT(*) n FROM active_media m'+clause,...args).n,items:rows.map(mediaDetails)});
      }
      const move=p.match(/^\/api\/media\/([^/]+)\/move(?:\/(preview))?$/);
      if(move&&req.method==='POST'){
        const mid=move[1];const m=asset(mid);const dest=await destinationFor(m,body.folder);const source=await safeFile(m);
        if(dest.relative===m.relative_path)return json({unchanged:true,from:m.relative_path,to:dest.relative});
        if(one('SELECT id FROM media WHERE relative_path=?',dest.relative))throw fail('A catalogued file already has that destination name. Nothing was moved.',409);
        try{await fs.lstat(dest.full);throw fail('A file already exists at the destination. Nothing will be overwritten.',409);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(move[2])return json({from:m.relative_path,to:dest.relative,folder:dest.folder});
        if(body.from_path!==m.relative_path)throw fail('The file location changed. Preview the destination again.',409);
        if(moving.has(mid)||scanning)throw fail('A move or scan is running. Please retry when it finishes.',409);
        moving.add(mid);const moveId=id();run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',moveId,mid,m.relative_path,dest.relative,'preparing',null,now());
        try{
          await fs.mkdir(characterParent(root),{recursive:true});await fs.mkdir(dest.dir,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});await destinationFor(m,body.folder);
          // Both absolute paths have been checked inside the resource root. Copy exclusively,
          // verify bytes, and update the catalogue before removing the original source.
          await fs.copyFile(source,dest.full,constants.COPYFILE_EXCL);
          const sourceHash=await fingerprint(source);const destHash=await fingerprint(dest.full);
          if(sourceHash!==destHash)throw fail('The copied file did not verify. The source was kept. Check the move history before retrying.',409);
          run('UPDATE file_moves SET status=?,sha256=? WHERE id=?','verified',sourceHash,moveId);
          transaction(()=>{run('UPDATE media SET relative_path=?,folder=? WHERE id=?',dest.relative,dest.folder,mid);run('UPDATE file_moves SET status=? WHERE id=?','catalogued',moveId);});
          try{await fs.unlink(source);}catch{run('UPDATE file_moves SET status=? WHERE id=?','source_retained',moveId);return json({from:m.relative_path,to:dest.relative,warning:'The destination is verified and linked, but the old source could not be removed. Both copies were kept; the move history records this.'});}
          run('UPDATE file_moves SET status=? WHERE id=?','complete',moveId);return json({from:m.relative_path,to:dest.relative});
        }catch(e){run("UPDATE file_moves SET status='needs_review' WHERE id=? AND status IN ('preparing','verified')",moveId);if(e.status)throw e;throw fail('The move could not finish. The source was kept; a partial destination may also exist. Check availability, permissions, and move history before retrying.',409);}finally{moving.delete(mid);}
      }
      const mm=p.match(/^\/api\/media\/([^/]+)$/);
      if(mm){const mid=mm[1];const m=asset(mid);
        if(req.method==='GET')return json(mediaDetails(m));
        if(req.method==='PUT'){
          if(!Array.isArray(body.character_ids))throw fail('Choose characters');const archived=all('SELECT d.character_id FROM depictions d JOIN character_ui u ON u.character_id=d.character_id WHERE d.media_id=? AND u.merged_into IS NOT NULL',mid).map(d=>d.character_id);const cids=[...new Set([...body.character_ids,...archived])];cids.forEach(character);
          if(body.categorization_complete!==undefined&&typeof body.categorization_complete!=='boolean')throw fail('Invalid categorization status.');
          const current=mediaDetails(m).canonicalFor;if(current.some(cid=>!cids.includes(cid)))throw fail('This is an approved reference. Remove it through a new canon revision before unassigning its character.');
          if(body.location_reference===false&&body.location_id)throw fail('A specific location must be classified as a location reference.');if(body.location_ids!==undefined){if(!Array.isArray(body.location_ids)||body.location_ids.length>100||body.location_ids.some(id=>typeof id!=='string')||body.location_reference===false&&body.location_ids.length)throw fail('Invalid locations.');const prepared=[];for(const id of body.location_ids)prepared.push(await locations.prepare(id));body.location_ids=prepared;}else if(body.location_id)body.location_id=await locations.prepare(body.location_id);
          transaction(()=>{if(body.location_reference!==undefined)catalogue.setLocation(mid,body.location_reference);if(body.structured_tag_ids!==undefined)taxonomy.set(mid,body.structured_tag_ids);if(body.location_ids!==undefined)locations.setMany(mid,body.location_ids);else if(body.location_id!==undefined)locations.set(mid,body.location_id);run('DELETE FROM depictions WHERE media_id=?',mid);for(const cid of cids)run('INSERT INTO depictions VALUES(?,?)',mid,cid);run('UPDATE characters SET cover_id=NULL WHERE cover_id=? AND id NOT IN (SELECT character_id FROM depictions WHERE media_id=?)',mid,mid);run('INSERT INTO media_notes VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET tags=excluded.tags,notes=excluded.notes',mid,str(body.tags,2000),str(body.notes));if(body.categorization_complete!==undefined)catalogue.setComplete(mid,body.categorization_complete);});return json(mediaDetails(m));
        }
      }
      const mr=p.match(/^\/api\/media\/([^/]+)\/review$/);
      if(mr&&req.method==='POST'){
        asset(mr[1]);character(body.character_id);if(!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',mr[1],body.character_id))throw fail('Assign the character before reviewing.');
        if(!['approved','rejected','unreviewed'].includes(body.decision))throw fail('Invalid decision');const rating=body.rating==null||body.rating===''?null:Number(body.rating);if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))throw fail('Rating must be 1–5.');run('INSERT INTO reviews VALUES(?,?,?,?,?,?,?)',id(),mr[1],body.character_id,body.decision,rating,str(body.notes),now());return json({ok:true});
      }
      if(p==='/api/sort-folders'&&req.method==='POST'){
        if(!Array.isArray(body.folders)||!body.folders.length)throw fail('Choose at least one character folder.');
        const results=transaction(()=>body.folders.map(input=>{
          const folder=typeof input==='string'?input:input.folder;
          if(typeof folder!=='string'||!folder.trim()||!one('SELECT 1 FROM media WHERE folder=?',folder))throw fail('Choose a catalogued character folder, rather than loose files.');
          let cid=typeof input==='object'?input.character_id:null;
          if(cid)character(cid);
          else{
            cid=one('SELECT character_id FROM sorted_folders WHERE folder=?',folder)?.character_id;
            if(!cid){const key=folder.normalize('NFC').toLocaleLowerCase();const matches=all('SELECT id,name FROM characters').filter(c=>c.name.normalize('NFC').toLocaleLowerCase()===key);
              if(matches.length>1)throw fail('Several characters have the name '+folder+'. Choose the intended character in the folder options.');
              cid=matches[0]?.id;
            }
            if(!cid){cid=id();run('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)',cid,folder,now());}
          }
          const assigned=run('INSERT OR IGNORE INTO depictions SELECT id,? FROM media WHERE folder=?',cid,folder);
          run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO UPDATE SET character_id=excluded.character_id',folder,cid);
          return {folder,character_id:cid,name:character(cid).name,added:Number(assigned.changes)};
        }));return json({results});
      }
      if(p==='/api/assign-folder'&&req.method==='POST'){
        character(body.character_id);if(typeof body.folder!=='string')throw fail('Choose a folder');run('INSERT OR IGNORE INTO depictions SELECT id,? FROM media WHERE folder=?',body.character_id,body.folder);return json({ok:true});
      }
      if(p==='/api/export'&&req.method==='GET'){
        const tables=['characters','media','depictions','media_notes','reviews','canon','relationships','sorted_folders','file_moves',...Object.keys(extraTables),...Object.keys(worldReviewTables)];const snapshot=transaction(()=>Object.fromEntries(tables.map(t=>[t,all('SELECT * FROM '+t)])));
        res.setHeader('Content-Disposition','attachment; filename="living-universe-backup.json"');return json({schema_version:1,world_review_schema_version:1,exported_at:now(),...snapshot});
      }
      if(p==='/api/restore'&&req.method==='POST'){
        if(body.schema_version!==1)throw fail('Unsupported backup version');
        if(one('SELECT COUNT(*) n FROM characters').n||one('SELECT COUNT(*) n FROM media').n)throw fail('Restore requires an empty catalogue. Use a separate data directory to avoid overwriting your work.');
        const tables={characters:['id','name','aliases','biography','personality','appearance','notes','cover_id','created_at','sexuality','speech_style','race'],media:['id','relative_path','folder','kind','size','modified_at','created_at'],depictions:['media_id','character_id'],media_notes:['media_id','tags','notes'],reviews:['id','media_id','character_id','decision','rating','notes','created_at'],canon:['id','character_id','parent_id','appearance','references_json','reason','created_at'],relationships:['id','source_id','target_id','description']};
        transaction(()=>{taxonomy.prepareRestore(body);for(const [t,cols] of Object.entries(tables)){if(!Array.isArray(body[t]))throw fail('Incomplete backup');for(const row of body[t]){if(t==='media'&&(path.isAbsolute(row.relative_path)||path.relative(root,path.resolve(root,row.relative_path)).startsWith('..')))throw fail('Invalid media path in backup');run(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,...cols.map(c=>c==='race'?raceValue(row[c]):row[c]??(['sexuality','speech_style'].includes(c)?'':null)));}}if(body.sorted_folders!==undefined){if(!Array.isArray(body.sorted_folders))throw fail('Invalid folder assignments in backup');for(const r of body.sorted_folders)run('INSERT INTO sorted_folders VALUES(?,?)',r.folder,r.character_id);}if(body.file_moves!==undefined){if(!Array.isArray(body.file_moves))throw fail('Invalid move history');for(const r of body.file_moves)run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',r.id,r.media_id,r.from_path,r.to_path,r.status,r.sha256,r.created_at);}for(const [t,cols] of Object.entries(extraTables)){if(body[t]===undefined)continue;if(!Array.isArray(body[t]))throw fail('Invalid additional backup records');for(const row of body[t])run(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c]??null));}characterCrops.validateRestore();storyEvents.validateRestore();worldReview.restore(body);mediaImports.uploads.afterRestore();});return json({ok:true});
      }
      const fm=p.match(/^\/media\/([^/]+)$/);
      if(fm&&['GET','HEAD'].includes(req.method)){
        const m=asset(fm[1]);const full=await safeFile(m);const s=await fs.stat(full);let start=0,end=s.size-1,status=200;
        const etag='"'+s.size+'-'+s.mtimeMs+'"';
        if(m.kind==='image'&&!req.headers.range&&req.headers['if-none-match']===etag){res.writeHead(304,{'ETag':etag,'Cache-Control':'private, no-cache'});return res.end();}
        if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});return res.end();}if(range[1]){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;}else{start=Math.max(0,s.size-Number(range[2]));}if(start>end||start>=s.size){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});return res.end();}status=206;}
        const headers={'Content-Type':types[path.extname(full).toLowerCase()]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':m.kind==='image'?'private, no-cache':'private, max-age=60','ETag':etag,'X-Content-Type-Options':'nosniff'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${s.size}`;
        res.writeHead(status,headers);if(req.method==='HEAD')return res.end();const stream=createReadStream(full,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(req.method==='GET'&&['/world-review.js','/world-review.css','/character-rename.html','/character-rename.js','/character-rename.css','/','/style.css','/profile-appearance-guide.js','/ghost-import.js','/ghost-profile.js','/client.js','/character-options.js','/enhancements.js','/picture-crop.js','/character-reference-crops.js','/crop-selection.js','/sorting.js','/sorting-pickers.js','/reconciliation.js','/duplicates.js','/image-hash.js','/taxonomy.js','/suggestions.js','/locations.js','/location-editor.js','/story-events.js','/media-form.js','/character-generation.js','/location-canvas.js','/location-canvas-model.js','/location-canvas.css','/permanent-media-delete.js'].includes(p)){
        const file=path.join(appDir,'public',p==='/'?'index.html':p.slice(1));const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' ${characterCrops.adminOrigin()||''}; frame-ancestors 'none'`,'X-Content-Type-Options':'nosniff'});return res.end(data);
      }
      throw fail('Not found',404);
    }catch(e){if(!res.headersSent)json({error:e.status?e.message:'The operation could not be completed. Your original media has not been changed.'},e.status||500);else res.destroy();}
  });
  let mobileConfig=options.mobile,mobileServer=null;
  try{
    if(mobileConfig===undefined){try{mobileConfig=JSON.parse(await fs.readFile(path.join(dataDir,'mobile-access.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
    if(mobileConfig?.enabled===true&&(!Number.isInteger(mobileConfig.port??4318)||(mobileConfig.port??4318)<1024||(mobileConfig.port??4318)>65535))throw Error('Invalid mobile listener port.');
    const approveMcp=mcpWriteConfig?.enabled===true&&mcpWriteConfig.origin===mobileConfig?.origin&&mcpWriteConfig.login===mobileConfig?.login?.toLowerCase()?mcpChanges:null;
    const sorting=mobileConfig?.enabled===true?createMobileSorting({root,all,one,run,transaction,catalogue,taxonomy,locations,availability:options.mobileAvailability,makeThumbnail:options.mobileThumbnail}):null;
    let grokConfig=options.grokConfig;
    if(grokConfig===undefined){try{grokConfig=JSON.parse(await fs.readFile(path.join(dataDir,'grok-gateway.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')console.error('Grok connection approval disabled: unreadable local configuration.');}}
    let grokConnections=null;try{grokConnections=mobileConfig?.enabled===true?createGrokConnections(grokConfig,mobileConfig):null;}catch{console.error('Grok approval disabled: invalid gateway configuration. Existing mobile access remains available.');}
    previewMedia=async mediaId=>{const reader=await openMcpCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root,availability:options.mobileAvailability,makeThumbnail:options.mobileThumbnail});try{const result=await reader.call('get_media',{media_id:mediaId,include_image:true,image_quality:'reference'});if(!result.image)throw fail('No verified media preview is available.',404);return {bytes:Buffer.from(result.image.data,'base64'),mimeType:result.image.mimeType};}finally{reader.close();}};
    const referencePreview=async(characterId,mediaId,runId,referenceId)=>{if(runId)return imageGeneration.previewReference(runId,characterId,mediaId,referenceId);const reader=await openMcpCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root,availability:options.mobileAvailability,makeThumbnail:options.mobileThumbnail,maxInlineImageBytes:20*1024*1024});try{const hasCrop=characterId&&(await reader.call('get_approved_references',{character_id:characterId,media_id:mediaId,...(referenceId?{reference_id:referenceId}:{})})).data.references[0]?.crop;const result=await reader.call(characterId?'get_approved_references':'get_media',{...(characterId?{character_id:characterId}:{}),media_id:mediaId,...(referenceId?{reference_id:referenceId}:{}),include_image:true,image_quality:hasCrop?'reference':'original'});if(!result.image)throw fail('No verified original image is available.',404);return {bytes:Buffer.from(result.image.data,'base64'),mimeType:result.image.mimeType,sha256:result.data.image_info.sha256};}finally{reader.close();}};
    mobileServer=createMobileServer({config:mobileConfig,all,one,run,transaction,characterCrops:approveMcp?characterCrops:null,desktopOrigin:()=>server.listening?'http://127.0.0.1:'+server.address().port:null,characterRename:approveMcp?characterRename:null,ghostProfiles,mcpChanges:approveMcp,mediaImports:approveMcp?mediaImports:null,imageGeneration:approveMcp?imageGeneration:null,grokConnections,referencePreview,locationEditor:locations.editor,sorting,scan,scanRunning:()=>scanning,reconciliation,createCharacter:folderSync.createCharacterWithFolder,isBusy:()=>mediaImports.isBusy()||folderSync.isBusy()||scanning||moving.size>0||reconciliation.isRelinking()});
  }catch(e){console.error('Mobile access disabled: '+e.message);}
  if(mobileServer&&mcpWriteConfig?.enabled===true&&mobileConfig.login.toLowerCase()===mcpWriteConfig.login&&mobileConfig.origin===mcpWriteConfig.origin)characterCrops.setAdminOrigin(mobileConfig.origin);
  const closeServer=s=>new Promise(resolve=>{if(!s?.listening)return resolve();s.close(()=>resolve());s.closeIdleConnections();});
  return {worldReview,worldReviewMigrationBackup,server,mobileServer,characterRename,characterCropMigrationBackup,storyMigrationBackup,imageMigrationBackup,mediaUploadMigrationBackup,mobilePort:mobileConfig?.port??4318,db,root,dataDir,folderSync,imageGeneration,close:async()=>{await imageGeneration.settle();await Promise.all([closeServer(server),closeServer(mobileServer)]);db.close();}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.platform!=='win32')throw Error('Use node app/start-existing.mjs with an explicit existing catalogue configuration.');
  const app=await createApp();const port=Number(process.env.PORT)||4317;
  app.server.listen(port,'127.0.0.1',()=>console.log(`Living Universe is ready: http://127.0.0.1:${port}\nYour private catalogue: ${app.dataDir}\nOriginal media stays in place. Press Ctrl+C to stop.`));
  app.server.on('error',async e=>{console.error(e.code==='EADDRINUSE'?'Living Universe may already be running. Open http://127.0.0.1:'+port:e.message);process.exitCode=1;await app.close();});
  if(app.mobileServer){app.mobileServer.on('error',e=>console.error('Mobile editor could not start: '+e.message));app.mobileServer.listen(app.mobilePort,'127.0.0.1',()=>console.log('Restricted mobile editor listening on loopback port '+app.mobilePort+'. Connect only through Tailscale Serve.'));}
}
