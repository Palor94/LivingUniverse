// Location background images, made for free in the Grok app (subscription) and saved
// here through MCP, or uploaded by hand on the desktop. No paid API call is made.
// Each saved image becomes catalogue media in the location's folder, tagged with the
// location and marked as a location reference, so Play mode shows it automatically.
// Bytes are verified (decoded JPEG/PNG, size limit); files are never overwritten.
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {organized} from './storage-layout.mjs';
import {safeDownload} from './safe-download.mjs';
import {validateMedia} from './media-imports.mjs';
import {tagKey} from './taxonomy.mjs';
import {readZip,entryParts,ignoredEntry,imageKind,placeIndex,matchPlace,zipPart} from './background-zip.mjs';

const MAX_BYTES=20*1024*1024,MAX_UNPACKED=1024*1024*1024;
const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80)||'Helyszín';

export function installLocationBackgrounds({root,one,all,run,transaction,fail,authenticate,approvalMode=()=>'review',figures=()=>({characters:[]}),prompts=async()=>({}),download=safeDownload,extraOps=()=>({}),locationTree=null,dataDir=null,clock=()=>new Date()}){
  function typeTagId(){
    const group='Kép típusa',name='Helyszín háttér';
    run('INSERT OR IGNORE INTO tag_groups VALUES(?,?,?)',randomUUID(),group,tagKey(group));
    const g=one('SELECT id FROM tag_groups WHERE name_key=?',tagKey(group));
    run('INSERT OR IGNORE INTO structured_tags VALUES(?,?,?,?)',randomUUID(),g.id,name,tagKey(name));
    return one('SELECT id FROM structured_tags WHERE group_id=? AND name_key=?',g.id,tagKey(name)).id;
  }
  function list({search='',limit=50,offset=0}={}){
    if(typeof search!=='string'||search.length>200||!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0)throw fail('Invalid location filter.');
    const q='%'+search.trim()+'%';
    const rows=all(`SELECT l.id,l.name,(SELECT count(*) FROM media_tags t JOIN media_roles r ON r.media_id=t.media_id AND r.role='location' JOIN active_media m ON m.id=t.media_id WHERE t.tag_id=l.tag_id) backgrounds
      FROM locations l WHERE l.name LIKE ? ORDER BY l.name COLLATE NOCASE LIMIT ? OFFSET ?`,q,limit+1,offset);
    return {locations:rows.slice(0,limit).map(r=>({id:r.id,name:r.name,background_count:r.backgrounds})),next_offset:rows.length>limit?offset+limit:null};
  }
  // stem (optional): a readable file-name start such as "este" or "ejjel" (time of day).
  async function save(locationId,bytes,{source,prompt='',title='',stem=''}){
    const loc=one('SELECT id,name,tag_id FROM locations WHERE id=?',locationId);if(!loc)throw fail('Location not found',404);
    if(!loc.tag_id)throw fail('This location has no tag yet. Open it once in Helyszínek.',409);
    if(!bytes.length||bytes.length>MAX_BYTES)throw fail('Images must be at most 20 MiB.',413);
    let type;try{type=await validateMedia(bytes);}catch(e){throw fail(e.message||'The image could not be decoded safely.',400);}
    if(type.kind!=='image')throw fail('Only JPEG or PNG images can be location backgrounds.');
    const sha=createHash('sha256').update(bytes).digest('hex');
    const {folder,realDir}=await locationDir(loc);
    const relative=path.join(folder,(stem?safeName(stem)+'-'+sha.slice(0,10):sha.slice(0,20))+'.'+type.extension),file=path.join(realDir,path.basename(relative));
    try{await fs.writeFile(file,bytes,{flag:'wx'});}
    catch(e){if(e.code!=='EEXIST')throw e;const info=await fs.lstat(file);if(info.isSymbolicLink()||!info.isFile()||createHash('sha256').update(await fs.readFile(file)).digest('hex')!==sha)throw fail('A different file already exists there; nothing was overwritten.',409);}
    const stat=await fs.stat(file);
    const mediaId=register(loc,relative,folder,bytes.length,stat.mtime,[title&&('Cím: '+title),'Forrás: '+source,prompt&&('Prompt: '+prompt)].filter(Boolean).join('\n'));
    return {media_id:mediaId,location_id:loc.id,location_name:loc.name,width:type.width,height:type.height,sha256:sha,size:bytes.length,saved:true,canon_changed:false};
  }
  // The watched folder of a location: <base>/Helyszín hátterek/<location name>.
  const baseFolder=()=>organized(root)?path.join('20_SHARED_MEDIA','Helyszín hátterek'):'Helyszín hátterek';
  async function locationDir(loc,create=true){
    const folder=path.join(baseFolder(),safeName(loc.name)),dir=path.resolve(root,folder);
    if(!dir.startsWith(path.resolve(root)+path.sep))throw fail('Invalid destination.',403);
    if(create)await fs.mkdir(dir,{recursive:true});
    let realDir;try{realDir=await fs.realpath(dir);}catch(e){if(e.code==='ENOENT')return {folder,realDir:null};throw e;}
    const realRoot=await fs.realpath(root);if(!realDir.startsWith(realRoot+path.sep))throw fail('The destination points outside your resource folder.',403);
    return {folder,realDir};
  }
  // Catalogue record for a picture already inside the location folder: location tag,
  // "Helyszín háttér" tag, location-reference role, sorted (needs no character).
  function register(loc,relative,folder,size,mtime,note){
    const now=new Date().toISOString();
    return transaction(()=>{
      const id=one('SELECT id FROM media WHERE relative_path=?',relative)?.id||randomUUID();
      if(!one('SELECT 1 FROM media WHERE id=?',id))run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',id,relative,folder,'image',size,mtime.toISOString(),now);
      if(one('SELECT 1 FROM media_hidden WHERE media_id=?',id))throw fail('This image was removed earlier. Restore it from Removed items instead.',409);
      run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,loc.tag_id);
      run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,typeTagId());
      run("INSERT INTO media_roles(media_id,role,updated_at) VALUES(?,'location',?) ON CONFLICT(media_id) DO UPDATE SET updated_at=excluded.updated_at",id,now);
      run('INSERT INTO media_categorization(media_id,complete,updated_at) VALUES(?,1,?) ON CONFLICT(media_id) DO UPDATE SET complete=1,updated_at=excluded.updated_at',id,now);
      if(note)run("INSERT INTO media_notes(media_id,tags,notes) VALUES(?,'',?) ON CONFLICT(media_id) DO UPDATE SET notes=CASE WHEN notes='' THEN excluded.notes ELSE notes END",id,note.slice(0,4000));
      return id;
    });
  }
  // Free route: the creator saves a picture from the Grok app into the location's folder;
  // this picks it up. Creates missing folders, never moves, renames or deletes files.
  let scanning=false;
  async function scanFolders(){
    if(scanning)return {busy:true};
    scanning=true;const result={folders_created:0,added:0,errors:[]};
    try{
      for(const loc of all('SELECT id,name,tag_id FROM locations WHERE tag_id IS NOT NULL ORDER BY name')){
        let dir;
        try{const before=await locationDir(loc,false);dir=before.realDir?before:await locationDir(loc,true);if(!before.realDir)result.folders_created++;}
        catch(e){result.errors.push({location:loc.name,error:e.message});continue;}
        for(const entry of await fs.readdir(dir.realDir,{withFileTypes:true})){
          if(!entry.isFile()||entry.name.startsWith('.')||!/\.(jpe?g|png)$/i.test(entry.name))continue;
          const relative=path.join(dir.folder,entry.name),known=one('SELECT m.id FROM media m WHERE m.relative_path=?',relative);
          if(known&&(one("SELECT 1 FROM media_roles WHERE media_id=? AND role='location'",known.id)||one('SELECT 1 FROM media_hidden WHERE media_id=?',known.id)))continue;
          try{
            const file=path.join(dir.realDir,entry.name),stat=await fs.lstat(file);
            if(stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Not a regular image up to 20 MiB.');
            const type=await validateMedia(await fs.readFile(file));if(type.kind!=='image')throw Error('Not a JPEG or PNG image.');
            register(loc,relative,dir.folder,stat.size,stat.mtime,'Forrás: mappából beolvasva ('+entry.name+')');result.added++;
          }catch(e){result.errors.push({location:loc.name,file:entry.name,error:e.message});}
        }
      }
      // Folders whose name only tolerantly matches a place are reported, never moved (owner, 2026-11-14).
      // Folders that match no place (or several) are listed too, so stranded pictures are visible.
      result.unmatched_folders=[];
      try{result.misnamed_folders=await misnamedFolders(result.unmatched_folders);}catch(e){result.misnamed_folders=[];result.errors.push({error:e.message});}
    }finally{scanning=false;}
    return result;
  }
  async function places(){const t=locationTree?await locationTree.load():null;return placeIndex(all('SELECT id,name FROM locations WHERE tag_id IS NOT NULL'),t?.nodes||[],t?.archivedSources||new Set());}
  // Windows folder names ignore letter case, so "Konyha" vs "konyha" is the same watched folder.
  const sameFolder=s=>String(s).normalize('NFC').toLocaleLowerCase('hu');
  async function misnamedFolders(stray){
    let list;try{list=await fs.readdir(path.resolve(root,baseFolder()),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
    const index=await places(),exact=new Set(index.map(x=>sameFolder(x.exact))),out=[];
    for(const d of list){
      if(!d.isDirectory()||d.name.startsWith('.')||exact.has(sameFolder(d.name)))continue;
      const m=matchPlace(d.name,index);
      if(m.location_id)out.push({folder:d.name,location_id:m.location_id,location:m.name,expected_folder:safeName(m.name)});
      else stray?.push({folder:d.name,location_id:null,ambiguous:!!m.ambiguous,candidates:m.candidates||[]});
    }
    return out;
  }
  // ---- Background package (ZIP) import, owner 2026-11-14 ----------------------------------------
  // Every picture goes into the watched folder of the place its ZIP folder names. Unknown or
  // ambiguous folders are not guessed: those pictures are set aside under Háttércsomagok for review.
  // Files are written with 'wx' only (a clash gets " (2)"), identical bytes count as duplicates.
  const sha256=b=>createHash('sha256').update(b).digest('hex');
  const stampText=d=>{const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;};
  async function hashesOf(dir){
    const out=new Map();
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(!e.isFile()||!/\.(jpe?g|png|webp)$/i.test(e.name))continue;
      try{const st=await fs.stat(path.join(dir,e.name));if(st.size<=MAX_BYTES)out.set(sha256(await fs.readFile(path.join(dir,e.name))),e.name);}catch{}
    }
    return out;
  }
  async function writeUnique(dir,stem,ext,bytes){
    for(let i=1;i<1000;i++){
      const name=(i===1?stem:stem+' ('+i+')')+'.'+ext;
      try{await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});return name;}catch(e){if(e.code!=='EEXIST')throw e;}
    }
    throw fail('Too many files with the same name; nothing was overwritten.',409);
  }
  let importing=false;
  async function importZip(buf,zipName){
    if(importing)throw fail('A background package is already being imported.',409);
    importing=true;
    try{
      let zip;try{zip=readZip(buf);}catch(e){throw fail(e.message,e.status||400);}
      const index=await places(),label=String(zipName||'').split(/[\\/]/).pop().replace(/\.zip$/i,'').slice(0,60);
      const reviewFolder=path.join(organized(root)?'30_IMPORTS':'','Háttércsomagok',safeName(stampText(clock())+(label?' - '+label:'')));
      const realRoot=await fs.realpath(root),result={zip:label||null,placed:[],duplicates:[],unmatched:[],refused:[],set_aside_folder:null},journal=[],known=new Map(),asideBySha=new Map();
      // The journal exists before the first write and is refreshed as the import goes (owner, 2026-11-14).
      let journalFile=null;const head={kind:'background-zip-import',zip:zipName||null,zip_sha256:sha256(buf),imported_at:clock().toISOString()};
      const saveJournal=async(status,flag='w')=>{if(journalFile)await fs.writeFile(journalFile,JSON.stringify({...head,status,set_aside_folder:result.set_aside_folder,entries:journal},null,2),{flag});};
      if(dataDir){
        const folder=path.join(dataDir,'backups');await fs.mkdir(folder,{recursive:true});
        journalFile=path.join(folder,'background-zip-'+stampText(clock()).replace(/[ .]/g,'-')+'-'+randomUUID().slice(0,8)+'.json');
        await saveJournal('running','wx');result.journal=path.basename(journalFile);
      }
      // Only the immediate folder is kept for set-aside copies (no deep trees, no device names).
      const setAside=async(parts,bytes,ext,sha)=>{
        if(asideBySha.has(sha))return {file:asideBySha.get(sha),repeat:true};
        const rel=path.join(reviewFolder,...parts.slice(-2,-1).map(zipPart)),dir=path.resolve(root,rel);
        if(!dir.startsWith(path.resolve(root)+path.sep))throw fail('Invalid destination.',403);
        await fs.mkdir(dir,{recursive:true});const real=await fs.realpath(dir);if(!real.startsWith(realRoot+path.sep))throw fail('The destination points outside your resource folder.',403);
        const stem=zipPart(path.basename(parts.at(-1),path.extname(parts.at(-1))));result.set_aside_folder=reviewFolder;
        const file=path.join(rel,await writeUnique(real,stem,ext,bytes));asideBySha.set(sha,file);return {file,repeat:false};
      };
      let unpacked=0,step=0;
      for(const e of zip.entries){
        if(e.directory)continue;
        if(++step%25===0)await saveJournal('running');
        const parts=entryParts(e.name);
        if(!parts){result.refused.push({entry:e.name,reason:'Path escape refused.'});journal.push({entry:e.name,refused:'path escape'});continue;}
        if(ignoredEntry(parts))continue;
        try{
          if(unpacked+e.size>MAX_UNPACKED){result.refused.push({entry:e.name,reason:'The package is too large when unpacked (at most 1 GB).'});journal.push({entry:e.name,refused:'unpacked budget'});continue;}
          let bytes;try{bytes=e.read();}catch(err){result.refused.push({entry:e.name,reason:err.message});journal.push({entry:e.name,refused:err.message});continue;}
          unpacked+=bytes.length;
          const kind=imageKind(bytes),ext=path.extname(parts.at(-1)).toLowerCase(),sha=sha256(bytes);
          if(!kind||!['.png','.jpg','.jpeg','.webp'].includes(ext)){result.refused.push({entry:e.name,reason:'Not a PNG, JPEG or WebP picture.'});journal.push({entry:e.name,refused:'not a picture',sha256:sha});continue;}
          const folder=parts.length>1?parts.at(-2):null,m=folder?matchPlace(folder,index):{location_id:null,candidates:[]};
          if(kind==='webp'){const {file,repeat}=await setAside(parts,bytes,'webp',sha);if(repeat){result.duplicates.push({entry:e.name,file,set_aside:true});journal.push({entry:e.name,duplicate:file,sha256:sha});continue;}result.refused.push({entry:e.name,reason:'WebP cannot be a background yet; convert it to PNG or JPEG.',set_aside:file});journal.push({entry:e.name,set_aside:file,reason:'webp',sha256:sha});continue;}
          // Decoded before anything is written, set-aside copies included.
          try{const t=await validateMedia(bytes);if(t.kind!=='image')throw Error();}catch{result.refused.push({entry:e.name,reason:'The image could not be decoded safely.'});journal.push({entry:e.name,refused:'decode',sha256:sha});continue;}
          if(!m.location_id){const {file,repeat}=await setAside(parts,bytes,kind,sha);if(repeat){result.duplicates.push({entry:e.name,file,set_aside:true});journal.push({entry:e.name,duplicate:file,sha256:sha});continue;}result.unmatched.push({entry:e.name,folder,candidates:m.candidates,ambiguous:!!m.ambiguous,...(m.archived?{archived:true}:{}),set_aside:file});journal.push({entry:e.name,unmatched:true,...(m.archived?{archived:true}:{}),set_aside:file,candidates:m.candidates,sha256:sha});continue;}
          const loc=one('SELECT id,name,tag_id FROM locations WHERE id=?',m.location_id),dir=await locationDir(loc);
          if(!known.has(dir.realDir))known.set(dir.realDir,await hashesOf(dir.realDir));
          const have=known.get(dir.realDir);
          if(have.has(sha)){result.duplicates.push({entry:e.name,location:loc.name,file:path.join(dir.folder,have.get(sha))});journal.push({entry:e.name,duplicate:path.join(dir.folder,have.get(sha)),sha256:sha});continue;}
          const name=await writeUnique(dir.realDir,zipPart(path.basename(parts.at(-1),path.extname(parts.at(-1)))),kind,bytes);have.set(sha,name);
          const relative=path.join(dir.folder,name),stat=await fs.stat(path.join(dir.realDir,name));
          journal.push({entry:e.name,location_id:loc.id,location:loc.name,target:relative,match:m.how,sha256:sha});
          register(loc,relative,dir.folder,bytes.length,stat.mtime,'Forrás: háttércsomag'+(label?' ('+label+')':'')+' · '+e.name.slice(0,300));
          result.placed.push({entry:e.name,location:loc.name,location_id:loc.id,file:relative,match:m.how});
        }catch(err){result.refused.push({entry:e.name,reason:err.message});journal.push({entry:e.name,refused:err.message});}
      }
      await saveJournal('completed');
      return result;
    }finally{importing=false;}
  }
  let timer=null;
  function startWatcher(){if(timer)return;setTimeout(()=>scanFolders().catch(e=>console.error('Background folders: '+e.message)),30_000).unref?.();timer=setInterval(()=>scanFolders().catch(e=>console.error('Background folders: '+e.message)),5*60_000);timer.unref?.();}
  function stopWatcher(){if(timer)clearInterval(timer);timer=null;}
  async function fromUrl(args){
    const allowed=['location_id','url','prompt','title'];
    if(!args||typeof args!=='object'||Object.keys(args).some(k=>!allowed.includes(k)))throw fail('Unexpected background fields.');
    if(typeof args.url!=='string'||args.url.length>8192)throw fail('Give the public HTTPS address of the image.');
    for(const k of ['prompt','title'])if(args[k]!==undefined&&(typeof args[k]!=='string'||args[k].length>(k==='prompt'?12000:200)))throw fail('Prompt or title is too long.');
    if(!one('SELECT 1 FROM locations WHERE id=?',args.location_id))throw fail('Location not found',404);
    let response;try{response=await download(args.url,{maxBytes:MAX_BYTES});}catch(e){throw fail(e.message||'The image could not be downloaded.',e.status||400);}
    const chunks=[];let size=0;for await(const c of response.stream){size+=c.length;if(size>MAX_BYTES)throw fail('Images must be at most 20 MiB.',413);chunks.push(Buffer.from(c));}
    let host='';try{host=new URL(args.url).hostname;}catch{}
    return save(args.location_id,Buffer.concat(chunks),{source:'Grok (MCP) · '+host,prompt:args.prompt||'',title:args.title||''});
  }
  async function handle({p,req,body,json}){
    if(p==='/api/mcp-backgrounds'&&req.method==='POST'){
      try{
        authenticate(req.headers.authorization);
        const op=body?.operation,args=body?.arguments||{};
        if(op==='capabilities')return json({enabled:true,version:2,trusted:approvalMode()==='trusted',operations:Object.keys(extraOps())}),true;
        // Play picture pipeline (needs, briefs, jobs, placing); writes need trusted mode.
        const extra=Object.hasOwn(extraOps(),op)?extraOps()[op]:null;
        if(extra){if(extra.write&&approvalMode()!=='trusted')throw fail('Trusted saving is not enabled; enable trusted MCP mode or place the picture by hand.',403);return json(await extra.run(args)),true;}
        if(op==='list_locations')return json(list(args)),true;
        if(op==='list_figures')return json(figures()),true;
        if(op==='prompts')return json(await prompts({character_id:args.character_id||null,location_id:args.location_id||null})),true;
        if(op==='import_url'){if(approvalMode()!=='trusted')throw fail('Trusted saving is not enabled; upload the image on the desktop place page instead.',403);return json(await fromUrl(args)),true;}
        throw fail('Unknown background operation.');
      }catch(e){json({error:e.status?e.message:'The background could not be saved.',code:e.code||'BACKGROUND_FAILED'},e.status||500);return true;}
    }
    if(p==='/api/backgrounds/scan'&&req.method==='POST'){json(await scanFolders());return true;}
    if(p==='/api/backgrounds/zip'&&req.method==='POST'){if(!Buffer.isBuffer(body.zip))throw fail('Choose a ZIP file.',415);json(await importZip(body.zip,body.filename));return true;}
    if(p==='/api/backgrounds/upload'&&req.method==='POST'){
      if(Buffer.isBuffer(body.bytes)){json(await save(body.location_id,body.bytes,{source:'Kézi feltöltés'+(body.filename?' · '+body.filename:'')}));return true;}
      const m=typeof body.data_url==='string'&&body.data_url.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
      if(!m)throw fail('Choose a JPEG or PNG image.');
      json(await save(body.location_id,Buffer.from(m[2],'base64'),{source:'Kézi feltöltés'+(typeof body.filename==='string'?' · '+body.filename.slice(0,200):'')}));return true;
    }
    return false;
  }
  return {handle,list,save,fromUrl,scanFolders,importZip,isImporting:()=>importing,startWatcher,stopWatcher};
}
