import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

export function installReconciliation({db,root,types,ignored,all,one,run,transaction,fail,fingerprint,isBusy}){
  db.exec(readFileSync(new URL('./migrations/003-scan-reconciliation.up.sql',import.meta.url),'utf8'));
  const now=()=>new Date().toISOString();const previews=new Map();
  const same=(a,b)=>Number(a.size)===Number(b.size)&&a.modified_at===b.modified_at;
  function observation(mid,state,s,error=null){run('INSERT INTO media_scan_state VALUES(?,?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET state=excluded.state,observed_size=excluded.observed_size,observed_mtime=excluded.observed_mtime,checked_at=excluded.checked_at,error=excluded.error',mid,state,s?.size??null,s?.modified_at??null,now(),error);}
  async function checkedFile(relative){const full=path.resolve(root,relative);if(!full.startsWith(root+path.sep))throw fail('File must stay inside the resource folder.',403);let real;try{real=await fs.realpath(full);}catch{throw fail('This file is unavailable. Rescan after OneDrive makes it available.',409);}const realRoot=await fs.realpath(root);if(!real.startsWith(realRoot+path.sep))throw fail('File points outside the resource folder.',403);const s=await fs.stat(real);if(!s.isFile())throw fail('Expected a media file.');return {file:real,size:s.size,modified_at:s.mtime.toISOString()};}
  async function scan(){
    const found=new Map(),errors=[],unavailable=[];
    async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){const rel=path.relative(root,dir);unavailable.push(rel);errors.push({path:rel,message:e.code||'Unavailable folder'});return;}
      for(const e of entries){if(e.name.startsWith('.')||ignored.has(e.name))continue;const full=path.join(dir,e.name),rel=path.relative(root,full);if(e.isSymbolicLink()){unavailable.push(rel);continue;}if(e.isDirectory()){await walk(full);continue;}const mime=types[path.extname(e.name).toLowerCase()];if(!mime||!e.isFile())continue;
        try{const s=await fs.stat(full);found.set(rel,{relative_path:rel,folder:rel.includes(path.sep)?rel.split(path.sep)[0]:'',kind:mime.startsWith('video')?'video':'image',size:s.size,modified_at:s.mtime.toISOString()});}catch(e){unavailable.push(rel);errors.push({path:rel,message:e.code||'Unavailable file'});}
      }
    }
    await walk(root);
    const existing=all('SELECT * FROM active_media'),known=new Set(all('SELECT relative_path FROM media').map(m=>m.relative_path));
    const summary={new:0,unchanged:0,modified:0,missing:0,unavailable:0,potentially_moved:0};const missing=[];
    transaction(()=>{
      run('DELETE FROM scan_candidates');
      for(const m of existing){const current=found.get(m.relative_path);if(current){const state=same(m,current)?'unchanged':'modified';summary[state]++;observation(m.id,state,current);if(state==='modified')run('UPDATE media SET size=?,modified_at=? WHERE id=?',current.size,current.modified_at,m.id);}
        else{const blocked=unavailable.some(p=>!p||m.relative_path===p||m.relative_path.startsWith(p+path.sep));const state=blocked?'unavailable':'missing';summary[state]++;observation(m.id,state,null,blocked?'Folder or file could not be inspected':'Path was absent in this scan; it may be temporarily unavailable');if(!blocked)missing.push(m);}
      }
      // Size + modification time provide candidates, never proof of identity.
      const byMetadata=new Map();for(const m of missing){const key=JSON.stringify([m.kind,m.size,m.modified_at]);if(!byMetadata.has(key))byMetadata.set(key,[]);byMetadata.get(key).push(m.id);}
      for(const m of found.values()){if(known.has(m.relative_path))continue;const candidates=byMetadata.get(JSON.stringify([m.kind,m.size,m.modified_at]))||[];
        if(candidates.length){run('INSERT INTO scan_candidates VALUES(?,?,?,?,?,?)',m.relative_path,m.folder,m.kind,m.size,m.modified_at,JSON.stringify(candidates));summary.potentially_moved++;}
        else{const mid=randomUUID();run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',mid,m.relative_path,m.folder,m.kind,m.size,m.modified_at,now());observation(mid,'new',m);summary.new++;}
      }
    });
    const result={found:found.size,added:summary.new,...summary,errors,checked_at:now(),metadata_only:true};run("INSERT INTO application_settings VALUES('last_scan_report',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(result));return result;
  }
  function plan(input){const folder=typeof input==='string'?input:input?.folder;if(typeof folder!=='string')throw fail('Choose a source folder.');const media=all('SELECT m.id,m.kind,m.relative_path,(SELECT COUNT(*) FROM depictions d WHERE d.media_id=m.id) assignments,COALESCE(s.complete,0) complete,(SELECT state FROM media_scan_state st WHERE st.media_id=m.id) scan_state FROM active_media m LEFT JOIN media_categorization s ON s.media_id=m.id WHERE m.folder=? ORDER BY m.relative_path',folder);if(!media.length)throw fail('This folder has no active catalogued media. Rescan or choose another folder.');
    let cid=typeof input==='object'?input.character_id:null;let name=typeof input==='object'?String(input.name||'').trim():'';
    if(!cid&&!name)cid=one('SELECT character_id FROM sorted_folders WHERE folder=?',folder)?.character_id;
    if(!cid){name=name||folder;if(!name||name.length>200)throw fail('Enter a valid character name or working title.');const matches=all('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL').filter(c=>c.name.normalize('NFC').toLocaleLowerCase()===name.normalize('NFC').toLocaleLowerCase());if(matches.length>1)throw fail('Several characters share this name. Select the intended character.');cid=matches[0]?.id||null;}
    if(cid){const c=one('SELECT c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid);if(!c)throw fail('Choose an existing active character.');name=c.name;}
    const picks=[...new Set(Array.from({length:Math.min(6,media.length)},(_,i)=>Math.floor(i*(media.length-1)/Math.max(1,Math.min(6,media.length)-1))))].map(i=>media[i]);
    return {folder,character_id:cid,name,new_character:!cid,total:media.length,assigned:media.filter(m=>m.assignments>0).length,complete:media.filter(m=>m.complete).length,multiple:media.filter(m=>m.assignments>1).length,unavailable:media.filter(m=>['missing','unavailable'].includes(m.scan_state)).length,samples:picks.map(m=>({id:m.id,kind:m.kind,relative_path:m.relative_path})),ids:media.map(m=>m.id),signature:createHash('sha256').update(JSON.stringify(media)).digest('hex')};
  }
  function report(){const row=one("SELECT value FROM application_settings WHERE key='last_scan_report'");const saved=row?JSON.parse(row.value):null;return {report:saved,pending:one('SELECT COUNT(*) n FROM scan_candidates').n};}
  async function handle({p,body,req,url,json}){
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
      try{await fs.stat(path.join(root,original.relative_path));throw fail('The old path is available again. Rescan; these may be separate files.',409);}catch(e){if(e.code!=='ENOENT')throw e;}
      const expected=all("SELECT DISTINCT json_extract(value,'$.sha256') sha256 FROM canon c,json_each(c.references_json) WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND json_extract(value,'$.media_id')=? AND json_extract(value,'$.sha256') IS NOT NULL",original.id).map(r=>r.sha256);let hash=null;if(expected.length){hash=await fingerprint(current.file);if(expected.some(h=>h!==hash))throw fail('This file does not match the preserved canonical reference fingerprint. It cannot replace that reference.',409);}
      transaction(()=>{if(one('SELECT id FROM media WHERE relative_path=?',candidate.relative_path))throw fail('This path was already catalogued. Rescan.',409);run('UPDATE media SET relative_path=?,folder=?,size=?,modified_at=? WHERE id=?',candidate.relative_path,candidate.folder,current.size,current.modified_at,original.id);observation(original.id,'unchanged',current);run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',randomUUID(),original.id,original.relative_path,candidate.relative_path,'relinked_external',hash,now());run('DELETE FROM scan_candidates WHERE relative_path=?',candidate.relative_path);});json({id:original.id,action:'relinked'});return true;
    }
    return false;
  }
  return {scan,handle,details:mid=>one('SELECT state,checked_at,error FROM media_scan_state WHERE media_id=?',mid)||null};
}
