// Manual metadata-only inventory. Never opens image content, loads a credential, or calls a model.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {analysisDigest} from '../app/analysis-model.mjs';
import {MAX_SOURCE_BYTES} from '../mcp/images.mjs';

const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){if(!['--config','--output'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Explicit config and fresh private output required');opts[args[i]]=args[i+1];}
if(!opts['--config']||!opts['--output'])throw Error('Explicit config and fresh private output required');
const output=path.resolve(opts['--output']);if(output.toLowerCase().includes('onedrive')||output===path.parse(output).root)throw Error('Private inventory must stay outside OneDrive');
const cfg=JSON.parse(await fs.readFile(opts['--config'],'utf8')),root=await fs.realpath(cfg.mediaRoot);
const db=new DatabaseSync(cfg.database,{readOnly:true,allowExtension:false});db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
let rows,counts;
try{rows=db.prepare("SELECT m.*,s.state scan_state FROM active_media m LEFT JOIN media_scan_state s ON s.media_id=m.id WHERE m.kind='image' ORDER BY m.id").all();counts=db.prepare('SELECT kind,count(*) count FROM active_media GROUP BY kind').all();}finally{db.close();}
const checked=new Map();
const entries=[];
for(const row of rows){
  const entry={media_id:row.id,relative_path:row.relative_path,catalogue_size:row.size,scan_state:row.scan_state,status:'unchecked'};entries.push(entry);
  const parts=row.relative_path.split(/[\\/]/u);
  if(path.isAbsolute(row.relative_path)||path.win32.isAbsolute(row.relative_path)||/[\x00:]/u.test(row.relative_path)||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||['app','mcp','tests','docs','backups','node_modules'].includes(parts[0].toLowerCase())){entry.status='unsafe_path';continue;}
  let file=root,valid=true;
  for(const part of parts){file=path.join(file,part);if(!checked.has(file))checked.set(file,await fs.lstat(file).catch(()=>null));const st=checked.get(file);if(!st||st.isSymbolicLink()){entry.status=st?'symlink':'missing';valid=false;break;}}
  if(!valid)continue;
  const st=checked.get(file),relative=path.relative(root,await fs.realpath(file));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!st.isFile()){entry.status='unsafe_path';continue;}
  entry.file=file;entry.current_size=st.size;entry.mtime_ms=st.mtimeMs;
  if(st.size<1||st.size>MAX_SOURCE_BYTES){entry.status='size_limit';continue;}
  if(!['.jpg','.jpeg','.png','.bmp','.gif'].includes(path.extname(file).toLowerCase())){entry.status='unsupported_extension';continue;}
  entry.status='attributes_pending';
}
const pending=entries.filter(e=>e.status==='attributes_pending');
if(process.platform!=='win32')for(const e of pending)e.status='metadata_candidate';
else if(pending.length){
  const script="$ErrorActionPreference='Stop'; [Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); $paths=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd()); $values=@(foreach($p in $paths){try{[int64][System.IO.File]::GetAttributes([string]$p)}catch{-1}}); ConvertTo-Json -Compress -InputObject $values";
  const attributes=await new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';
    const timer=setTimeout(()=>{child.kill();reject(Error('Metadata attribute inspection timed out'));},30000);
    child.on('error',reject);child.stderr.resume();child.stdout.on('data',b=>{stdout+=b;if(stdout.length>262144){child.kill();reject(Error('Metadata response too large'));}});
    child.on('close',code=>{clearTimeout(timer);try{if(code)throw Error('Metadata attribute inspection failed');resolve(JSON.parse(stdout));}catch(e){reject(e);}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(pending.map(e=>e.file)));
  });
  if(!Array.isArray(attributes)||attributes.length!==pending.length)throw Error('Metadata attribute result mismatch');
  for(let i=0;i<pending.length;i++){const flags=attributes[i];pending[i].status=!Number.isInteger(flags)||flags<0?'unknown_attributes':flags&0x441000?'online_only':'metadata_candidate';}
}
const summary={kind:'private-library-metadata-preflight',created_at:new Date().toISOString(),catalogue_counts:counts,image_records:entries.length,status_counts:Object.fromEntries([...new Set(entries.map(e=>e.status))].map(status=>[status,entries.filter(e=>e.status===status).length])),image_content_reads:0,external_calls:0,model_selected:null,full_library_transfer_approved:false,limitations:'Metadata candidates still need bounded source/format/dimension/decode checks before any individually approved transfer. No image hash or adult-content verification was performed.'};
const inventory={...summary,database:cfg.database,media_root:root,entries};inventory.inventory_hash=analysisDigest(inventory);
await fs.mkdir(output);await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});
console.log(JSON.stringify(summary));
