import {createHash} from 'node:crypto';
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {cloudAvailability} from './duplicates.mjs';
import {thumbnail,dimensions,MAX_SOURCE_BYTES,MAX_IMAGE_BYTES,MAX_EDGE} from '../mcp/images.mjs';

// Called only after the mobile listener's identity, Origin and CSRF checks.
export function createMobileSorting({root,all,one,run,transaction,catalogue,taxonomy,locations,availability=cloudAvailability,makeThumbnail=thumbnail}){
  const fail=(message,status=400)=>Object.assign(Error(message),{status});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const active=id=>{if(!uuid.test(id))throw fail('Invalid image ID.');const m=one("SELECT * FROM active_media WHERE id=? AND kind='image'",id);if(!m)throw fail('Image missing or removed from the catalogue.',404);return m;};
  const characterIds=id=>all('SELECT d.character_id FROM depictions d LEFT JOIN character_ui u ON u.character_id=d.character_id WHERE d.media_id=? AND u.merged_into IS NULL ORDER BY d.character_id',id).map(r=>r.character_id);
  const sorted=ids=>[...new Set(ids)].sort();
  function editable(m){const note=one('SELECT tags,notes FROM media_notes WHERE media_id=?',m.id);return {character_ids:characterIds(m.id),tags:note?.tags||'',notes:note?.notes||'',structured_tag_ids:taxonomy.details(m.id).map(t=>t.id).sort(),location_reference:catalogue.details(m.id).location_reference,location_id:locations.details(m.id)?.id??null,categorization_complete:catalogue.details(m.id).categorization_complete};}
  function version(m,f){return createHash('sha256').update(JSON.stringify([m.id,m.relative_path,m.size,m.modified_at,f])).digest('hex');}
  function details(m){const fields=editable(m);return {id:m.id,filename:path.win32.basename(m.relative_path),folder:m.folder,fields,version:version(m,fields),image_url:'/api/sorting/images/'+m.id+'/preview'};}
  function vocabulary(){return {groups:all('SELECT id,name FROM tag_groups ORDER BY name'),tags:all("SELECT t.id,t.group_id,COALESCE(NULLIF(l.hu_name,''),t.name) name,l.en_name english_name FROM structured_tags t LEFT JOIN tag_localizations l ON l.tag_id=t.id ORDER BY name"),locations:locations.editor.tree().items.map(p=>({id:p.id,name:p.name,tag_id:p.tag_id,breadcrumb:p.breadcrumb,english_name:p.english_name}))};}
  function list(url){
    const scope=url.searchParams.get('scope')||'needs';if(!['needs','all'].includes(scope))throw fail('Choose needs sorting or all images.');
    const q=url.searchParams.get('q')||'';if(q.length>200)throw fail('Search is too long.');
    const where=["m.kind='image'"],args=[];
    if(scope==='needs')where.push('NOT EXISTS(SELECT 1 FROM media_categorization s WHERE s.media_id=m.id AND s.complete=1) AND NOT '+catalogue.locationSQL);
    if(q){where.push("(m.relative_path LIKE ? ESCAPE '\\')");args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
    const unavailable="EXISTS(SELECT 1 FROM media_scan_state st WHERE st.media_id=m.id AND st.state IN ('missing','unavailable'))";
    const unavailableTotal=one('SELECT COUNT(*) n FROM active_media m WHERE '+where.join(' AND ')+' AND '+unavailable,...args).n;
    const include=url.searchParams.get('include_unavailable');if(include!==null&&!['0','1'].includes(include))throw fail('Invalid availability filter.');
    if(include!=='1')where.push('NOT '+unavailable);
    const total=one('SELECT COUNT(*) n FROM active_media m WHERE '+where.join(' AND '),...args).n;
    const cursor=url.searchParams.get('after');if(cursor){const m=active(cursor);where.push('(m.relative_path>? OR (m.relative_path=? AND m.id>?))');args.push(m.relative_path,m.relative_path,m.id);}
    const rows=all('SELECT m.* FROM active_media m WHERE '+where.join(' AND ')+' ORDER BY m.relative_path,m.id LIMIT 25',...args);
    return {total,unavailable_total:unavailableTotal,items:rows.slice(0,24).map(m=>({id:m.id,filename:path.win32.basename(m.relative_path),folder:m.folder,...catalogue.details(m.id),image_url:'/api/sorting/images/'+m.id+'/preview'})),next:rows.length>24?rows[23].id:null};
  }
  function save(id,body){
    if(Object.keys(body).some(k=>!['expected_version','fields'].includes(k))||typeof body.expected_version!=='string'||!/^[a-f0-9]{64}$/.test(body.expected_version))throw fail('Reload this image before saving.');
    const f=body.fields,keys=['character_ids','tags','notes','structured_tag_ids','location_reference','location_id','categorization_complete'];
    if(!f||Array.isArray(f)||Object.keys(f).length!==keys.length||Object.keys(f).some(k=>!keys.includes(k)))throw fail('Invalid sorting fields.');
    if(!Array.isArray(f.character_ids)||f.character_ids.length>1000||f.character_ids.some(id=>typeof id!=='string'||!uuid.test(id)||!one('SELECT 1 FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',id)))throw fail('Choose existing characters.');
    if(typeof f.tags!=='string'||f.tags.length>2000||typeof f.notes!=='string'||f.notes.length>30000||typeof f.location_reference!=='boolean'||typeof f.categorization_complete!=='boolean'||!(f.location_id===null||typeof f.location_id==='string'&&one('SELECT 1 FROM locations WHERE id=?',f.location_id)))throw fail('Invalid sorting values. Text was not truncated.');
    const desired={...f,character_ids:sorted(f.character_ids),structured_tag_ids:sorted(taxonomy.validateTags(f.structured_tag_ids))};
    const extracted=taxonomy.noteTags.match(desired.notes).filter(t=>t.status==='matched').map(t=>t.tag_id);
    const requestedTags=[...desired.structured_tag_ids];
    desired.structured_tag_ids=sorted([...desired.structured_tag_ids,...extracted]);
    const place=f.location_id&&one('SELECT tag_id FROM locations WHERE id=?',f.location_id);if(place?.tag_id)desired.structured_tag_ids=sorted([...desired.structured_tag_ids,place.tag_id]);
    return transaction(()=>{
      const m=active(id),current=editable(m);
      // A lost response can safely be retried without reapplying the save.
      if(JSON.stringify(current)===JSON.stringify(Object.fromEntries(keys.map(k=>[k,desired[k]]))))return details(m);
      if(version(m,current)!==body.expected_version)throw fail('This image was changed on another device. Your draft is retained; compare it with the latest saved version.',409);
      const removed=current.character_ids.filter(cid=>!desired.character_ids.includes(cid));
      for(const cid of removed)if(one("SELECT 1 FROM canon c WHERE c.character_id=? AND c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id) AND EXISTS(SELECT 1 FROM json_each(c.references_json) WHERE json_extract(value,'$.media_id')=?)",cid,id))throw fail('An approved reference must keep its character assignment. Review it on the desktop.',409);
      for(const cid of removed)run('DELETE FROM depictions WHERE media_id=? AND character_id=?',id,cid);
      for(const cid of desired.character_ids)run('INSERT OR IGNORE INTO depictions VALUES(?,?)',id,cid);
      run('UPDATE characters SET cover_id=NULL WHERE cover_id=? AND id NOT IN (SELECT character_id FROM depictions WHERE media_id=?)',id,id);
      run('INSERT INTO media_notes VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET tags=excluded.tags,notes=excluded.notes',id,desired.tags,desired.notes);
      taxonomy.set(id,requestedTags);taxonomy.noteTags.extract(id);catalogue.setLocation(id,desired.location_reference);locations.set(id,desired.location_id);catalogue.setComplete(id,desired.categorization_complete);
      return details(m);
    });
  }
  const cache=new Map();let running=0;
  async function preview(id,retry=true){
    const m=active(id),parts=m.relative_path.split(/[\\/]/);
    if(path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[\x00:]/.test(p))||['app','tests','docs','backups','node_modules'].includes(parts[0].toLowerCase()))throw fail('Unsafe image location.',403);
    const realRoot=await fs.realpath(root);let file=realRoot;
    async function check(){file=realRoot;for(const part of parts){file=path.join(file,part);const st=await fs.lstat(file);if(st.isSymbolicLink())throw fail('Linked image locations are not available on mobile.',403);}const real=await fs.realpath(file);if(real!==file)throw fail('Unsafe image location.',403);}
    let handle;
    try{
      await check();const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_SOURCE_BYTES)throw fail('This image is too large for the mobile preview.',413);
      const key=JSON.stringify([id,m.relative_path,stat.size,stat.mtimeMs,stat.ctimeMs]);
      if(cache.has(key)){const bytes=cache.get(key);cache.delete(key);cache.set(key,bytes);return bytes;}
      if(running>=2)throw fail('Preview queue is busy. Tap Retry in a moment.',503);
      running++;
      try{
        if(await availability(file)!=='local')throw fail('This OneDrive image is not available locally. On the laptop choose “Always keep on this device”, then retry.',409);
        handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const before=await handle.stat();if(before.size!==stat.size||before.mtimeMs!==stat.mtimeMs||before.ino!==stat.ino)throw fail('Image changed. Retry.',409);
        const bytes=Buffer.alloc(before.size);let pos=0;while(pos<bytes.length){const{bytesRead}=await handle.read(bytes,pos,bytes.length-pos,pos);if(!bytesRead)break;pos+=bytesRead;}
        await check();const after=await fs.stat(file),fresh=active(id);
        if(pos!==bytes.length||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||fresh.relative_path!==m.relative_path)throw fail('Image changed. Retry.',409);
        let image;try{image=await makeThumbnail(bytes);}catch{throw fail('This image format cannot be previewed here. Its catalogue record can still be sorted.',422);}
        const output=Buffer.from(image.data,'base64');let size;try{size=dimensions(output);}catch{throw fail('Invalid mobile preview.',422);}if(image.mimeType!=='image/jpeg'||output[0]!==255||output[1]!==216||output.length>MAX_IMAGE_BYTES||!size.width||!size.height||size.width>MAX_EDGE||size.height>MAX_EDGE)throw fail('Preview exceeds the mobile limit.',413);
        cache.set(key,output);while(cache.size>64)cache.delete(cache.keys().next().value);return output;
      }finally{running--;}
    }catch(e){
      // OneDrive can update metadata on the first local read. Revalidate and
      // reread once, never return the bytes that failed the consistency check.
      if(retry&&e.status===409&&e.message==='Image changed. Retry.'){await handle?.close();handle=null;return preview(id,false);}
      if(e.status)throw e;throw fail('Image missing or unavailable in OneDrive. Make it available on the laptop and retry.',404);
    }finally{await handle?.close();}
  }
  return {vocabulary,list,details:id=>details(active(id)),save,preview,createLocation:name=>{const place=locations.createTag(name);return {id:place.id,name:place.name,tag_id:place.tag_id};}};
}
