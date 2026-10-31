import {portablePath,resolveMediaPath} from './media-paths.mjs';
import {scanPathAllowed,catalogueFolder,storageEntries} from './storage-layout.mjs';
import {createMissingCleanup} from './missing-cleanup.mjs';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {cloudAvailability} from './duplicates.mjs';

export function installReconciliation({db,root,dataDir,types,ignored,all,one,run,transaction,fail,fingerprint,isBusy,removeCatalogue}){
  db.exec(readFileSync(new URL('./migrations/003-scan-reconciliation.up.sql',import.meta.url),'utf8'));
  const now=()=>new Date().toISOString();const previews=new Map();
  const batches=new Map();let relinking=false,cleaning=false;
  const cleanup=createMissingCleanup({db,root,dataDir,all,one,fail,removeCatalogue,isBusy:()=>relinking||cleaning||isBusy(),setBusy:value=>{cleaning=value;}});
  const same=(a,b)=>Number(a.size)===Number(b.size)&&a.modified_at===b.modified_at;
  function observation(mid,state,s,error=null){run('INSERT INTO media_scan_state VALUES(?,?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET state=excluded.state,observed_size=excluded.observed_size,observed_mtime=excluded.observed_mtime,checked_at=excluded.checked_at,error=excluded.error',mid,state,s?.size??null,s?.modified_at??null,now(),error);}
  async function checkedFile(relative){const full=resolveMediaPath(root,relative);if(!full.startsWith(root+path.sep))throw fail('File must stay inside the resource folder.',403);let real;try{real=await fs.realpath(full);}catch{throw fail('This file is unavailable. Rescan after OneDrive makes it available.',409);}const realRoot=await fs.realpath(root);if(!real.startsWith(realRoot+path.sep))throw fail('File points outside the resource folder.',403);const s=await fs.stat(real);if(!s.isFile())throw fail('Expected a media file.');return {file:real,size:s.size,modified_at:s.mtime.toISOString()};}
  async function scan(){
    const found=new Map(),errors=[],unavailable=[];
    async function walk(dir){let entries;try{entries=await storageEntries(dir);}catch(e){const rel=path.relative(root,dir);unavailable.push(rel);errors.push({path:rel,message:e.code||'Unavailable folder'});return;}
      for(const e of entries){if(e.name.startsWith('.')||ignored.has(e.name))continue;const full=path.join(dir,e.name),rel=path.relative(root,full);if(!scanPathAllowed(root,rel))continue;if(e.isSymbolicLink()){unavailable.push(rel);continue;}if(e.isDirectory()){await walk(full);continue;}const mime=types[path.extname(e.name).toLowerCase()];if(!mime||!e.isFile())continue;
        try{const s=await fs.stat(full);found.set(portablePath(rel),{relative_path:rel,folder:catalogueFolder(root,rel),kind:mime.startsWith('video')?'video':'image',size:s.size,modified_at:s.mtime.toISOString()});}catch(e){unavailable.push(rel);errors.push({path:rel,message:e.code||'Unavailable file'});}
      }
    }
    await walk(root);
    const existing=all('SELECT * FROM active_media'),known=new Set(all('SELECT relative_path FROM media').map(m=>portablePath(m.relative_path)));
    const summary={new:0,unchanged:0,modified:0,missing:0,unavailable:0,potentially_moved:0};const missing=[];
    transaction(()=>{
      run('DELETE FROM scan_candidates');
      for(const m of existing){const current=found.get(portablePath(m.relative_path));if(current){const state=same(m,current)?'unchanged':'modified';summary[state]++;observation(m.id,state,current);if(state==='modified')run('UPDATE media SET size=?,modified_at=? WHERE id=?',current.size,current.modified_at,m.id);}
        else{const blocked=unavailable.some(p=>!p||m.relative_path===p||m.relative_path.startsWith(p+path.sep));const state=blocked?'unavailable':'missing';summary[state]++;observation(m.id,state,null,blocked?'Folder or file could not be inspected':'Path was absent in this scan; it may be temporarily unavailable');if(!blocked)missing.push(m);}
      }
      // Size + modification time provide candidates, never proof of identity.
      const byMetadata=new Map();for(const m of missing){const key=JSON.stringify([m.kind,m.size,m.modified_at]);if(!byMetadata.has(key))byMetadata.set(key,[]);byMetadata.get(key).push(m.id);}
      for(const m of found.values()){if(known.has(portablePath(m.relative_path)))continue;const candidates=byMetadata.get(JSON.stringify([m.kind,m.size,m.modified_at]))||[];
        if(candidates.length){run('INSERT INTO scan_candidates VALUES(?,?,?,?,?,?)',m.relative_path,m.folder,m.kind,m.size,m.modified_at,JSON.stringify(candidates));summary.potentially_moved++;}
        else{const mid=randomUUID();run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',mid,m.relative_path,m.folder,m.kind,m.size,m.modified_at,now());observation(mid,'new',m);summary.new++;}
      }
    });
    const result={found:found.size,added:summary.new,...summary,errors,checked_at:now(),metadata_only:true};run("INSERT INTO application_settings VALUES('last_scan_report',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(result));return result;
  }
  function plan(input){const folder=typeof input==='string'?input:input?.folder;if(typeof folder!=='string')throw fail('Choose a source folder.');const media=all('SELECT m.id,m.kind,m.relative_path,(SELECT COUNT(*) FROM depictions d WHERE d.media_id=m.id) assignments,COALESCE(s.complete,0) complete,(SELECT state FROM media_scan_state st WHERE st.media_id=m.id) scan_state FROM active_media m LEFT JOIN media_categorization s ON s.media_id=m.id WHERE m.folder=? ORDER BY m.relative_path',folder);if(!media.length)throw fail('This folder has no active catalogued media. Rescan or choose another folder.');
    let cid=typeof input==='object'?input.character_id:null;let name=typeof input==='object'?String(input.name||'').trim():'';
    if(!cid&&!name)cid=one('SELECT character_id FROM sorted_folders WHERE folder=?',folder)?.character_id;
    if(!cid){name=name||path.basename(folder);if(!name||name.length>200)throw fail('Enter a valid character name or working title.');const matches=all('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL').filter(c=>c.name.normalize('NFC').toLocaleLowerCase()===name.normalize('NFC').toLocaleLowerCase());if(matches.length>1)throw fail('Several characters share this name. Select the intended character.');cid=matches[0]?.id||null;}
    if(cid){const c=one('SELECT c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid);if(!c)throw fail('Choose an existing active character.');name=c.name;}
    const picks=[...new Set(Array.from({length:Math.min(6,media.length)},(_,i)=>Math.floor(i*(media.length-1)/Math.max(1,Math.min(6,media.length)-1))))].map(i=>media[i]);
    return {folder,character_id:cid,name,new_character:!cid,total:media.length,assigned:media.filter(m=>m.assignments>0).length,complete:media.filter(m=>m.complete).length,multiple:media.filter(m=>m.assignments>1).length,unavailable:media.filter(m=>['missing','unavailable'].includes(m.scan_state)).length,samples:picks.map(m=>({id:m.id,kind:m.kind,relative_path:m.relative_path})),ids:media.map(m=>m.id),signature:createHash('sha256').update(JSON.stringify(media)).digest('hex')};
  }
  function report(){const row=one("SELECT value FROM application_settings WHERE key='last_scan_report'");const saved=row?JSON.parse(row.value):null;return {report:saved,pending:one('SELECT COUNT(*) n FROM scan_candidates').n,current_counts:{new:0,unchanged:0,modified:0,missing:0,unavailable:0,...Object.fromEntries(all('SELECT s.state,COUNT(*) n FROM media_scan_state s JOIN active_media m ON m.id=s.media_id GROUP BY s.state').map(r=>[r.state,r.n]))}};}
  const basename=p=>path.win32.basename(p).normalize('NFC').toLocaleLowerCase('hu');
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  function strongMatches(){
    const candidates=all('SELECT * FROM scan_candidates ORDER BY relative_path'),pairs=[],counts=new Map();
    for(const candidate of candidates){const matches=JSON.parse(candidate.candidate_ids).map(mid=>one('SELECT * FROM active_media WHERE id=?',mid)).filter(m=>m&&m.kind===candidate.kind&&same(m,candidate)&&basename(m.relative_path)===basename(candidate.relative_path));
      if(matches.length===1&&!one('SELECT 1 FROM media WHERE relative_path=?',candidate.relative_path)){pairs.push({candidate,original:matches[0]});counts.set(matches[0].id,(counts.get(matches[0].id)||0)+1);}}
    const unique=pairs.filter(p=>counts.get(p.original.id)===1);return {pairs:unique.slice(0,1000),excluded:candidates.length-Math.min(unique.length,1000)};
  }
  function canonEvidence(mid){return all("SELECT c.id,json_extract(value,'$.sha256') sha256 FROM canon c,json_each(c.references_json) WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND json_extract(value,'$.media_id')=? ORDER BY c.id",mid);}
  async function inspectRelink(pair,localOnly=false){
    const {candidate,original}=pair;
    // Walk every component; neither originals nor destinations may be symlinks.
    for(const relative of [original.relative_path,candidate.relative_path]){const parts=relative.split(/[\\/]/);if(path.win32.isAbsolute(relative)||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[\x00:]/.test(p)))throw fail('Unsafe file location. Rescan before linking.',409);let dir=root;for(const part of parts){dir=path.join(dir,part);try{if((await fs.lstat(dir)).isSymbolicLink())throw fail('Linked folders cannot be used for reconciliation.',409);}catch(e){if(e.code==='ENOENT')break;throw e;}}}
    const current=await checkedFile(candidate.relative_path);if(!same(candidate,current))throw fail('A matching file changed. Rescan and preview again.',409);
    try{await fs.lstat(path.join(root,original.relative_path));throw fail('An old file location is available again. Rescan before linking.',409);}catch(e){if(e.code!=='ENOENT')throw e;}
    const evidence=canonEvidence(original.id);let hash=null;
    if(evidence.length){if(evidence.some(r=>!r.sha256))throw fail('An approved reference has no fingerprint. Review this item on the laptop.',409);if(localOnly&&await cloudAvailability(current.file)!=='local')throw fail('An approved reference must be available locally on the laptop before linking.',409);hash=await fingerprint(current.file);if(evidence.some(r=>r.sha256!==hash))throw fail('A matching file differs from its approved canonical fingerprint. No links were changed.',409);}
    const after=await checkedFile(candidate.relative_path);if(!same(current,after))throw fail('A file changed during validation. Rescan before linking.',409);
    return {...pair,current:after,hash,evidence:digest(evidence)};
  }
  function commitRelink({candidate,original,current,hash}){
    if(one('SELECT id FROM media WHERE relative_path=?',candidate.relative_path))throw fail('This path was already catalogued. Rescan.',409);
    run('UPDATE media SET relative_path=?,folder=?,size=?,modified_at=? WHERE id=?',candidate.relative_path,candidate.folder,current.size,current.modified_at,original.id);observation(original.id,'unchanged',current);
    run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',randomUUID(),original.id,original.relative_path,candidate.relative_path,'relinked_external',hash,now());run('DELETE FROM scan_candidates WHERE relative_path=?',candidate.relative_path);
  }
  async function previewBatch(){
    if(relinking||isBusy())throw fail('Wait for the current file operation.',409);
    const plan=strongMatches();for(const[key,value]of batches)if(value.expires<Date.now())batches.delete(key);while(batches.size>=20)batches.delete(batches.keys().next().value);
    const token=randomUUID();batches.set(token,{pairs:plan.pairs,signature:digest(plan),expires:Date.now()+600000});
    return {token,count:plan.pairs.length,excluded:plan.excluded,match_basis:'unique filename, size and modification time; metadata match, not content proof',samples:plan.pairs.slice(0,8).map(p=>({media_id:p.original.id,from:p.original.relative_path,to:p.candidate.relative_path}))};
  }
  async function confirmBatch(token){
    const saved=batches.get(token);if(!saved||saved.expires<Date.now())throw fail('This preview expired. Open a new preview.',409);if(saved.result)return saved.result;
    if(relinking||isBusy())throw fail('Wait for the current file operation.',409);if(!saved.pairs.length)throw fail('There are no unambiguous matches to link.');
    if(digest(strongMatches())!==saved.signature)throw fail('Matching files changed. Preview them again.',409);
    relinking=true;
    try{
      const ready=[];for(const pair of saved.pairs)ready.push(await inspectRelink(pair,true));
      // SQLite's online backup is consistent and stays outside the resource root.
      const directory=path.join(dataDir,'backups');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'before-relink-'+randomUUID()+'.sqlite');await backup(db,file);const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw fail('Recovery backup verification failed. No links were changed.',500);}finally{copy.close();}
      for(const item of ready){const fresh=await inspectRelink(item,true);if(fresh.evidence!==item.evidence)throw fail('Approved references changed. Preview again.',409);}
      if(digest(strongMatches())!==saved.signature)throw fail('The catalogue changed. Preview again.',409);
      transaction(()=>{for(const item of ready)commitRelink(item);});
      saved.result={linked:ready.length,remaining:one('SELECT COUNT(*) n FROM scan_candidates').n,backup_verified:true};return saved.result;
    }finally{relinking=false;}
  }
  async function handle({p,body,req,url,json}){
    if(p==='/api/missing-cleanup/preview'&&req.method==='POST'){json(await cleanup.preview(body));return true;}
    if(p==='/api/missing-cleanup/confirm'&&req.method==='POST'){json(await cleanup.confirm(body));return true;}
    if(['/api/sort-folders','/api/assign-folder'].includes(p)&&req.method==='POST')throw fail('Preview this folder before confirming assignments. Refresh the application to use the new preview.',409);
    if(p==='/api/folders/preview'&&req.method==='POST'){
      if(!Array.isArray(body.folders)||!body.folders.length||body.folders.length>100)throw fail('Choose between 1 and 100 folders.');const plans=body.folders.map(plan);for(const [k,v] of previews)if(v.expires<Date.now())previews.delete(k);const token=randomUUID();previews.set(token,{plans,expires:Date.now()+600000});json({token,plans:plans.map(({ids,signature,...rest})=>rest)});return true;
    }
    if(p==='/api/folders/confirm'&&req.method==='POST'){
      if(isBusy())throw fail('Wait for the scan or file operation to finish, then review the preview again.',409);const preview=previews.get(body.token);if(!preview||preview.expires<Date.now())throw fail('This preview expired. Open it again before assigning.',409);
      const results=transaction(()=>{for(const saved of preview.plans){const current=plan({folder:saved.folder,character_id:saved.character_id,name:saved.name});if(current.signature!==saved.signature||current.name!==saved.name||current.character_id!==saved.character_id)throw fail('The folder or target changed since preview. Review it again before confirming.',409);}return preview.plans.map(saved=>{let cid=saved.character_id;if(!cid){const matching=one('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.name=? AND u.merged_into IS NULL',saved.name);cid=matching?.id||randomUUID();if(!matching)run('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)',cid,saved.name,now());}let added=0;for(const mid of saved.ids)added+=Number(run('INSERT OR IGNORE INTO depictions VALUES(?,?)',mid,cid).changes);run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO UPDATE SET character_id=excluded.character_id',saved.folder,cid);return {folder:saved.folder,character_id:cid,name:saved.name,added};});});previews.delete(body.token);json({ok:true,results});return true;
    }
    if(p==='/api/scan-report'&&req.method==='GET'){json(report());return true;}
    if(p==='/api/scan-files'&&req.method==='GET'){const state=url.searchParams.get('state')||'modified';if(!['new','unchanged','modified','missing','unavailable'].includes(state))throw fail('Unknown scan state.');const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);json({total:one('SELECT COUNT(*) n FROM media_scan_state s JOIN active_media m ON m.id=s.media_id WHERE s.state=?',state).n,items:all('SELECT m.id,m.relative_path,s.* FROM media_scan_state s JOIN active_media m ON m.id=s.media_id WHERE s.state=? ORDER BY m.relative_path LIMIT 100 OFFSET ?',state,offset)});return true;}
    if(p==='/api/reconciliation'&&req.method==='GET'){const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);json({total:one('SELECT COUNT(*) n FROM scan_candidates').n,items:all('SELECT * FROM scan_candidates ORDER BY relative_path LIMIT 50 OFFSET ?',offset).map(c=>({...c,candidates:JSON.parse(c.candidate_ids).map(mid=>one('SELECT id,relative_path FROM media WHERE id=?',mid)).filter(Boolean)}))});return true;}
    if(p==='/api/reconciliation/resolve'&&req.method==='POST'){
      if(isBusy())throw fail('Wait for the current scan or move.',409);const candidate=one('SELECT * FROM scan_candidates WHERE relative_path=?',body.relative_path);if(!candidate)throw fail('This suggestion is no longer current. Rescan.',409);const current=await checkedFile(candidate.relative_path);if(!same(candidate,current))throw fail('The proposed file changed. Rescan before linking.',409);
      if(body.action==='keep_new'){const mid=randomUUID();transaction(()=>{run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',mid,candidate.relative_path,candidate.folder,candidate.kind,candidate.size,candidate.modified_at,now());observation(mid,'new',candidate);run('DELETE FROM scan_candidates WHERE relative_path=?',candidate.relative_path);});json({id:mid,action:'kept_new'});return true;}
      if(body.action!=='relink'||!JSON.parse(candidate.candidate_ids).includes(body.media_id))throw fail('Choose one of the proposed existing records.');const original=one('SELECT * FROM active_media WHERE id=?',body.media_id);if(!original)throw fail('The original record is no longer active.',409);
      const prepared=await inspectRelink({candidate,original});transaction(()=>commitRelink(prepared));json({id:original.id,action:'relinked'});return true;
    }
    return false;
  }
  return {scan,handle,previewBatch,confirmBatch,isRelinking:()=>relinking||cleaning,details:mid=>one('SELECT state,checked_at,error FROM media_scan_state WHERE media_id=?',mid)||null};
}
