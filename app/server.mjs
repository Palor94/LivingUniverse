import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs, createReadStream, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import {installEnhancements,extraTables} from './enhancements.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(appDir, '..');
const types = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.bmp':'image/bmp','.mp4':'video/mp4','.mov':'video/quicktime','.m4v':'video/mp4','.webm':'video/webm'};
const ignored = new Set(['.git','.codex','.agents','node_modules','app','tests','docs','backups']);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const fail = (message, status=400) => Object.assign(new Error(message), {status});
const str = (value, max=30000) => String(value ?? '').slice(0,max);

export async function createApp(options={}) {
  const root = path.resolve(options.root || defaultRoot);
  const dataDir = options.dataDir || process.env.LIVING_UNIVERSE_DATA || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'.local','share'),'LivingUniverse');
  await fs.mkdir(dataDir,{recursive:true});
  const db = new DatabaseSync(path.join(dataDir,'universe.sqlite'));
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
  const all = (q,...args) => db.prepare(q).all(...args);
  const one = (q,...args) => db.prepare(q).get(...args);
  const run = (q,...args) => db.prepare(q).run(...args);
  function transaction(fn) {db.exec('BEGIN IMMEDIATE');try {const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  function character(cid) {const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)throw fail('Character not found',404);return {...c,cover_crop:one('SELECT cover_crop FROM character_ui WHERE character_id=?',cid)?.cover_crop||null};}
  function asset(mid) {const m=one('SELECT * FROM media WHERE id=?',mid);if(!m)throw fail('Media not found',404);return m;}
  function canon(cid) {return one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);}
  function mediaDetails(m) {
    return {...m, ...one('SELECT tags,notes FROM media_notes WHERE media_id=?',m.id),characters:all('SELECT c.id,c.name FROM characters c JOIN depictions d ON c.id=d.character_id LEFT JOIN character_ui u ON u.character_id=c.id WHERE d.media_id=? AND u.merged_into IS NULL',m.id),reviews:all('SELECT * FROM reviews WHERE media_id=? ORDER BY rowid',m.id),moves:all('SELECT * FROM file_moves WHERE media_id=? ORDER BY rowid DESC',m.id),canonicalFor:all('SELECT character_id FROM canon c WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,\'$.media_id\')=?)',m.id).map(c=>c.character_id)};
  }
  let scanning=false;
  let lastScan=null;
  async function scan() {
    if(scanning||moving.size)throw fail('A scan or file move is already running. Please wait.',409);
    scanning=true;
    const items=[];const errors=[];
    async function walk(dir) {
      let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{errors.push(path.relative(root,dir));return;}
      for(const e of entries){
        if(e.name.startsWith('.')||ignored.has(e.name))continue;
        const full=path.join(dir,e.name);
        if(e.isSymbolicLink())continue;
        if(e.isDirectory()){await walk(full);continue;}
        const mime=types[path.extname(e.name).toLowerCase()];if(!mime||!e.isFile())continue;
        try{const s=await fs.stat(full);const rel=path.relative(root,full);items.push({rel,folder:rel.includes(path.sep)?rel.split(path.sep)[0]:'',kind:mime.startsWith('video')?'video':'image',size:s.size,modified:s.mtime.toISOString()});}catch{errors.push(path.relative(root,full));}
      }
    }
    try{
      await walk(root);let added=0;
      transaction(()=>{for(const m of items){const result=run('INSERT OR IGNORE INTO media VALUES(?,?,?,?,?,?,?)',id(),m.rel,m.folder,m.kind,m.size,m.modified,now());added+=Number(result.changes);}});
      lastScan={found:items.length,added,errors};return lastScan;
    }finally{scanning=false;}
  }
  async function safeFile(m) {
    const full=path.resolve(root,m.relative_path);
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
    const dir=path.resolve(root,folder);if(!dir.startsWith(root+path.sep)||path.dirname(dir)!==root)throw fail('The destination must be inside your resource folder.');
    try{const real=await fs.realpath(dir);const realRoot=await fs.realpath(root);if(!real.startsWith(realRoot+path.sep))throw fail('The destination points outside your resource folder.',403);if(!(await fs.stat(real)).isDirectory())throw fail('The destination is not a folder.');}catch(e){if(e.code!=='ENOENT')throw e;}
    return {dir,full:path.join(dir,path.basename(m.relative_path)),relative:path.join(folder,path.basename(m.relative_path)),folder};
  }
  const enhancements=installEnhancements({db,root,dataDir,all,one,run,transaction,asset,character,canon,safeFile,fingerprint,moving,isScanning:()=>scanning,fail});
  const server=http.createServer(async(req,res)=>{
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      // Only same-origin loopback requests may read the private catalogue or change it.
      const host=req.headers.host;
      if(!/^127\.0\.0\.1:\d+$/.test(host||''))throw fail('Use the local application address',403);
      if(req.headers.origin && req.headers.origin!==`http://${host}`)throw fail('Cross-site requests are blocked',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw fail('Cross-site requests are blocked',403);
      const url=new URL(req.url,`http://${host}`);const p=url.pathname;
      let body={};
      if(['POST','PUT'].includes(req.method)){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw fail('Expected JSON',415);
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(p==='/api/restore'?50e6:2e6))throw fail('Request is too large',413);}try{body=JSON.parse(raw||'{}');}catch{throw fail('Invalid JSON');}
      }
      if(await enhancements.handle({p,body,req,json}))return;
      if(p==='/api/state'&&req.method==='GET')return json({characters:all(`SELECT c.*,u.cover_crop,(SELECT COUNT(*) FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE d.character_id=c.id) media_count FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY name COLLATE NOCASE`),protagonist:enhancements.protagonist(),folder_owners:all('SELECT * FROM sorted_folders'),folders:all('SELECT folder,COUNT(*) count FROM active_media GROUP BY folder ORDER BY folder'),stats:{media:one('SELECT COUNT(*) n FROM active_media').n,images:one("SELECT COUNT(*) n FROM active_media WHERE kind='image'").n,videos:one("SELECT COUNT(*) n FROM active_media WHERE kind='video'").n,inbox:one('SELECT COUNT(*) n FROM active_media m WHERE NOT EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id)').n},scanning,lastScan});
      if(p==='/api/scan'&&req.method==='POST')return json(await scan());
      if(p==='/api/characters'&&req.method==='POST'){
        const name=str(body.name,200).trim();if(!name)throw fail('Please enter a name or working title.');const cid=id();run('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)',cid,name,now());return json(character(cid),201);
      }
      const cm=p.match(/^\/api\/characters\/([^/]+)$/);
      if(cm){const cid=cm[1];const c=character(cid);
        if(req.method==='GET')return json({...c,canon:canon(cid)||null,history:all('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC',cid),relationships:all('SELECT r.*,c.name target_name FROM relationships r JOIN characters c ON c.id=r.target_id WHERE source_id=?',cid)});
        if(req.method==='PUT'){
          const name=str(body.name,200).trim();if(!name)throw fail('A character needs a name or title.');
          if(body.cover_id){asset(body.cover_id);if(!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',body.cover_id,cid))throw fail('Assign this character to the cover first.');}
          run('UPDATE characters SET name=?,aliases=?,biography=?,personality=?,appearance=?,notes=?,cover_id=? WHERE id=?',name,str(body.aliases,1000),str(body.biography),str(body.personality),str(body.appearance),str(body.notes),body.cover_id||null,cid);return json(character(cid));
        }
      }
      const ca=p.match(/^\/api\/characters\/([^/]+)\/canon$/);
      if(ca&&req.method==='POST'){
        const cid=ca[1];character(cid);const refs=body.references;if(!Array.isArray(refs))throw fail('Invalid reference selection');
        for(const r of refs){if(!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',r.media_id,cid))throw fail('References must be assigned to this character.');if(!['face','body','detail','general'].includes(r.role))throw fail('Choose a reference role.');}
        const prior=canon(cid);const previous=prior?JSON.parse(prior.references_json):[];const snapshots=[];
        for(const r of refs){const file=await safeFile(asset(r.media_id));const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);const sha256=hash.digest('hex');const expected=previous.find(x=>x.media_id===r.media_id)?.sha256;
          if(expected&&expected!==sha256)throw fail('An approved reference file has changed. Restore the original, or explicitly remove the reference before approving its replacement.');
          snapshots.push({media_id:r.media_id,role:r.role,sha256});}
        const revision=id();run('INSERT INTO canon VALUES(?,?,?,?,?,?,?)',revision,cid,prior?.id||null,str(body.appearance),JSON.stringify(snapshots),str(body.reason,1000)||'Explicit approval by Tibor',now());return json(canon(cid));
      }
      const integrity=p.match(/^\/api\/characters\/([^/]+)\/integrity$/);
      if(integrity&&req.method==='POST'){
        character(integrity[1]);const current=canon(integrity[1]);const refs=current?JSON.parse(current.references_json):[];const results=[];
        for(const r of refs){try{const file=await safeFile(asset(r.media_id));const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);results.push({media_id:r.media_id,status:r.sha256?(hash.digest('hex')===r.sha256?'unchanged':'changed'):'not fingerprinted'});}catch{results.push({media_id:r.media_id,status:'unavailable'});}}
        return json({results});
      }
      if(p==='/api/relationships'&&req.method==='POST'){
        character(body.source_id);character(body.target_id);if(body.source_id===body.target_id)throw fail('Choose a different character.');
        const desc=str(body.description,10000).trim();if(!desc){run('DELETE FROM relationships WHERE source_id=? AND target_id=?',body.source_id,body.target_id);}else{run('INSERT INTO relationships VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET description=excluded.description',id(),body.source_id,body.target_id,desc);}return json({ok:true});
      }
      if(p==='/api/media'&&req.method==='GET'){
        const where=[];const args=[];
        if(url.searchParams.get('character')){where.push('EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id AND d.character_id=?)');args.push(url.searchParams.get('character'));}
        if(url.searchParams.get('inbox')==='1')where.push('NOT EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id)');
        if(url.searchParams.has('folder')){where.push('m.folder=?');args.push(url.searchParams.get('folder'));}
        if(['image','video'].includes(url.searchParams.get('kind'))){where.push('m.kind=?');args.push(url.searchParams.get('kind'));}
        const search=url.searchParams.get('search');if(search){where.push("(m.relative_path LIKE ? OR EXISTS(SELECT 1 FROM media_notes n WHERE n.media_id=m.id AND (n.tags LIKE ? OR n.notes LIKE ?)))");args.push(...Array(3).fill('%'+str(search,200)+'%'));}
        const clause=where.length?' WHERE '+where.join(' AND '):'';const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const rows=all('SELECT m.* FROM active_media m'+clause+' ORDER BY m.relative_path LIMIT 48 OFFSET ?',...args,offset);return json({total:one('SELECT COUNT(*) n FROM active_media m'+clause,...args).n,items:rows.map(mediaDetails)});
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
          await fs.mkdir(dest.dir,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});await destinationFor(m,body.folder);
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
          const current=mediaDetails(m).canonicalFor;if(current.some(cid=>!cids.includes(cid)))throw fail('This is an approved reference. Remove it through a new canon revision before unassigning its character.');
          transaction(()=>{run('DELETE FROM depictions WHERE media_id=?',mid);for(const cid of cids)run('INSERT INTO depictions VALUES(?,?)',mid,cid);run('UPDATE characters SET cover_id=NULL WHERE cover_id=? AND id NOT IN (SELECT character_id FROM depictions WHERE media_id=?)',mid,mid);run('INSERT INTO media_notes VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET tags=excluded.tags,notes=excluded.notes',mid,str(body.tags,2000),str(body.notes));});return json(mediaDetails(m));
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
        const tables=['characters','media','depictions','media_notes','reviews','canon','relationships','sorted_folders','file_moves',...Object.keys(extraTables)];const snapshot=transaction(()=>Object.fromEntries(tables.map(t=>[t,all('SELECT * FROM '+t)])));
        res.setHeader('Content-Disposition','attachment; filename="living-universe-backup.json"');return json({schema_version:1,exported_at:now(),...snapshot});
      }
      if(p==='/api/restore'&&req.method==='POST'){
        if(body.schema_version!==1)throw fail('Unsupported backup version');
        if(one('SELECT COUNT(*) n FROM characters').n||one('SELECT COUNT(*) n FROM media').n)throw fail('Restore requires an empty catalogue. Use a separate data directory to avoid overwriting your work.');
        const tables={characters:['id','name','aliases','biography','personality','appearance','notes','cover_id','created_at'],media:['id','relative_path','folder','kind','size','modified_at','created_at'],depictions:['media_id','character_id'],media_notes:['media_id','tags','notes'],reviews:['id','media_id','character_id','decision','rating','notes','created_at'],canon:['id','character_id','parent_id','appearance','references_json','reason','created_at'],relationships:['id','source_id','target_id','description']};
        transaction(()=>{for(const [t,cols] of Object.entries(tables)){if(!Array.isArray(body[t]))throw fail('Incomplete backup');for(const row of body[t]){if(t==='media'&&(path.isAbsolute(row.relative_path)||path.relative(root,path.resolve(root,row.relative_path)).startsWith('..')))throw fail('Invalid media path in backup');run(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c]??null));}}if(body.sorted_folders!==undefined){if(!Array.isArray(body.sorted_folders))throw fail('Invalid folder assignments in backup');for(const r of body.sorted_folders)run('INSERT INTO sorted_folders VALUES(?,?)',r.folder,r.character_id);}if(body.file_moves!==undefined){if(!Array.isArray(body.file_moves))throw fail('Invalid move history');for(const r of body.file_moves)run('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)',r.id,r.media_id,r.from_path,r.to_path,r.status,r.sha256,r.created_at);}for(const [t,cols] of Object.entries(extraTables)){if(body[t]===undefined)continue;if(!Array.isArray(body[t]))throw fail('Invalid additional backup records');for(const row of body[t])run(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c]??null));}});return json({ok:true});
      }
      const fm=p.match(/^\/media\/([^/]+)$/);
      if(fm&&['GET','HEAD'].includes(req.method)){
        const m=asset(fm[1]);const full=await safeFile(m);const s=await fs.stat(full);let start=0,end=s.size-1,status=200;
        if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});return res.end();}if(range[1]){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;}else{start=Math.max(0,s.size-Number(range[2]));}if(start>end||start>=s.size){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});return res.end();}status=206;}
        const headers={'Content-Type':types[path.extname(full).toLowerCase()]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${s.size}`;
        res.writeHead(status,headers);if(req.method==='HEAD')return res.end();const stream=createReadStream(full,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(req.method==='GET'&&['/','/style.css','/client.js','/enhancements.js'].includes(p)){
        const file=path.join(appDir,'public',p==='/'?'index.html':p.slice(1));const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});return res.end(data);
      }
      throw fail('Not found',404);
    }catch(e){if(!res.headersSent)json({error:e.status?e.message:'The operation could not be completed. Your original media has not been changed.'},e.status||500);else res.destroy();}
  });
  return {server,db,root,dataDir,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp();const port=Number(process.env.PORT)||4317;
  app.server.listen(port,'127.0.0.1',()=>console.log(`Living Universe is ready: http://127.0.0.1:${port}\nYour private catalogue: ${app.dataDir}\nOriginal media stays in place. Press Ctrl+C to stop.`));
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Living Universe may already be running. Open http://127.0.0.1:'+port:e.message);process.exitCode=1;app.db.close();});
}
