import {promises as fs,readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {visualVersion} from './public/image-hash.js';

const exec=promisify(execFile);
// No content reads: consult Windows cloud recall flags before opening a stream.
export async function cloudAvailability(file){
  return (await cloudAvailabilityMany([file])).get(file);
}
export async function cloudAvailabilityMany(files){
  if(process.platform!=='win32')return new Map(files.map(file=>[file,'local']));
  // One PowerShell process per batch, not per file. Paths are data, never code.
  const script="$ErrorActionPreference='Stop'; $paths=ConvertFrom-Json $env:LU_ATTRIBUTE_PATHS; $values=@(foreach($p in $paths){try{[int64][System.IO.File]::GetAttributes($p)}catch{-1}}); ConvertTo-Json -Compress -InputObject $values";
  try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,LU_ATTRIBUTE_PATHS:JSON.stringify(files)},windowsHide:true,timeout:10000});const flags=JSON.parse(stdout);if(!Array.isArray(flags)||flags.length!==files.length)throw Error('Unexpected attribute response');return new Map(files.map((file,i)=>[file,!Number.isInteger(flags[i])||flags[i]<0?'unknown':(flags[i]&0x441000)?'online':'local']));}catch{return new Map(files.map(file=>[file,'unknown']));}
}
export const fileSignature=s=>JSON.stringify([s.size,s.mtimeMs,s.ctimeMs]);
export function distance(a,b){let n=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(n){n&=n-1n;count++;}return count;}
// BK tree keeps the normal near-neighbour search from comparing every pair.
export function similarPairs(items,threshold=6,limit=2000){
  let root;const pairs=[];
  for(const item of items){const hash=item.visual_hash;let node=root;
    const stack=node?[node]:[];while(stack.length){const current=stack.pop(),d=distance(hash,current.hash);if(d<=threshold)for(const other of current.items){if(item.sha256!==other.sha256){pairs.push({items:[other,item],distance:d});if(pairs.length>=limit)return {pairs,truncated:true};}}for(const [edge,child] of current.children)if(edge>=d-threshold&&edge<=d+threshold)stack.push(child);}
    if(!root){root={hash,items:[item],children:new Map()};continue;}
    while(node){const d=distance(hash,node.hash);if(d===0){node.items.push(item);break;}if(!node.children.has(d)){node.children.set(d,{hash,items:[item],children:new Map()});break;}node=node.children.get(d);}
  }
  return {pairs:pairs.sort((a,b)=>a.distance-b.distance),truncated:false};
}

export function installDuplicates({db,all,one,run,fail,safeFile,fingerprint,isBusy,availability=cloudAvailability}){
  db.exec(readFileSync(new URL('./migrations/004-duplicate-cache.up.sql',import.meta.url),'utf8'));
  let running=false;
  async function inspect(m){const file=await safeFile(m),s=await fs.stat(file);if(!s.isFile())throw fail('Not a regular media file');return {file,signature:fileSignature(s)};}
  const active=mid=>one('SELECT * FROM active_media WHERE id=?',mid);
  async function handle({p,body,req,url,json}){
    if(p==='/api/duplicates/plan'&&req.method==='GET'){
      const folder=url.searchParams.get('folder');const items=folder===null?all('SELECT id FROM active_media ORDER BY relative_path'):all('SELECT id FROM active_media WHERE folder=? ORDER BY relative_path',folder);json({ids:items.map(m=>m.id)});return true;
    }
    if(p==='/api/duplicates/analyze'&&req.method==='POST'){
      if(running||isBusy())throw fail('Wait for the current scan or file operation.',409);
      if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>25||body.ids.some(id=>typeof id!=='string'))throw fail('Choose 1–25 media IDs per batch.');
      if(body.allow_download!==undefined&&typeof body.allow_download!=='boolean')throw fail('Invalid download choice');
      const media=[...new Set(body.ids)].map(mid=>{const m=active(mid);if(!m)throw fail('Media is not active',404);return m;});
      running=true;const results=[];
      try{let cloudStates;
      if(availability===cloudAvailability){const paths=[];for(const m of media){try{const info=await inspect(m),cached=one('SELECT * FROM media_fingerprints WHERE media_id=?',m.id);if(cached?.signature!==info.signature||(m.kind==='image'&&cached?.visual_version!==visualVersion))paths.push(info.file);}catch{}}cloudStates=paths.length?await cloudAvailabilityMany(paths):new Map();}
      for(const m of media){try{
        const before=await inspect(m),cached=one('SELECT * FROM media_fingerprints WHERE media_id=?',m.id);
        const valid=cached?.signature===before.signature;
        if(valid&&(m.kind!=='image'||cached.visual_version===visualVersion)){results.push({id:m.id,status:'cached'});continue;}
        const cloud=cloudStates?(cloudStates.get(before.file)||'unknown'):await availability(before.file);
        if(cloud!=='local'&&!body.allow_download){results.push({id:m.id,status:'skipped',reason:cloud==='online'?'Online-only: downloads disabled':'Could not verify local availability'});continue;}
        // Protect against application moves/trash throughout each content read.
        const sha256=valid?cached.sha256:await fingerprint(before.file),after=await inspect(m);
        if(after.signature!==before.signature||active(m.id)?.relative_path!==m.relative_path)throw fail('File changed during hashing. Retry after scanning.',409);
        run('INSERT INTO media_fingerprints VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET signature=excluded.signature,sha256=excluded.sha256,visual_hash=excluded.visual_hash,visual_version=excluded.visual_version,width=excluded.width,height=excluded.height,checked_at=excluded.checked_at',m.id,after.signature,sha256,valid?cached.visual_hash:null,valid?cached.visual_version:null,valid?cached.width:null,valid?cached.height:null,new Date().toISOString());
        results.push({id:m.id,status:valid?'cached':'hashed',visual:m.kind==='image'?{signature:after.signature,sha256}:null});
      }catch(e){results.push({id:m.id,status:'skipped',reason:e.status?e.message:'File missing, unavailable, or unreadable'});}}
      }finally{running=false;}json({results});return true;
    }
    if(p==='/api/duplicates/visual'&&req.method==='POST'){
      const m=active(body.id);if(!m||m.kind!=='image')throw fail('Choose an active image');
      if(body.version!==visualVersion||! /^[0-9a-f]{16}$/.test(body.hash)||![body.width,body.height].every(n=>Number.isInteger(n)&&n>0&&n<=100000))throw fail('Invalid visual fingerprint');
      const cached=one('SELECT * FROM media_fingerprints WHERE media_id=?',m.id),current=await inspect(m);
      if(!cached||cached.signature!==body.signature||current.signature!==body.signature||cached.sha256!==body.sha256)throw fail('Image changed. Analyze it again.',409);
      run('UPDATE media_fingerprints SET visual_hash=?,visual_version=?,width=?,height=? WHERE media_id=?',body.hash,body.version,body.width,body.height,m.id);json({ok:true});return true;
    }
    if(p==='/api/duplicates/groups'&&req.method==='GET'){
      const mode=url.searchParams.get('mode')||'exact',threshold=Number(url.searchParams.get('threshold')||6),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
      if(!['exact','similar'].includes(mode)||!Number.isInteger(threshold)||threshold<0||threshold>12)throw fail('Invalid comparison options');
      const rows=all('SELECT m.*,f.signature,f.sha256,f.visual_hash,f.visual_version,f.width,f.height FROM active_media m JOIN media_fingerprints f ON f.media_id=m.id ORDER BY m.relative_path');
      const valid=[];let stale=0;
      for(const m of rows){try{if((await inspect(m)).signature!==m.signature){stale++;continue;}valid.push(m);}catch{stale++;}}
      let groups,truncated=false;
      if(mode==='exact'){const map=new Map();for(const m of valid){if(!map.has(m.sha256))map.set(m.sha256,[]);map.get(m.sha256).push(m);}groups=[...map.values()].filter(g=>g.length>1).map(items=>({items}));}
      else{const result=similarPairs(valid.filter(m=>m.kind==='image'&&m.visual_version===visualVersion&&/^[0-9a-f]{16}$/.test(m.visual_hash)),threshold);groups=result.pairs;truncated=result.truncated;}
      // No previews are fetched until the user explicitly opens a comparison.
      const decorate=m=>({id:m.id,kind:m.kind,relative_path:m.relative_path,categorization_complete:!!one('SELECT 1 FROM media_categorization WHERE media_id=? AND complete=1',m.id),width:m.width,height:m.height,characters:all('SELECT c.name FROM characters c JOIN depictions d ON d.character_id=c.id WHERE d.media_id=?',m.id).map(c=>c.name),canonical:!!one("SELECT 1 FROM canon c,json_each(c.references_json) r WHERE json_extract(r.value,'$.media_id')=? LIMIT 1",m.id)});
      json({total:groups.length,items:groups.slice(offset,offset+Math.min(2000,Math.max(1,Number(url.searchParams.get('limit'))||25))).map(g=>({...g,items:g.items.map(decorate)})),truncated,stale,cached:valid.length,active:one('SELECT COUNT(*) n FROM active_media').n});return true;
    }
    return false;
  }
  return {handle};
}
