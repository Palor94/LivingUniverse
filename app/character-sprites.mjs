// Character figures ("Szereplő-alakok") for visual-novel style scenes. The creator saves
// full-body pictures (made in the Grok app from approved references, on a plain
// background) into <media>/…/Szereplő-alakok/<character name>/<expression>.png. This
// module finds them; the browser cuts the plain background away when showing them.
// Figures are presentation assets only: never canon, never approved references, and the
// catalogue scan skips this folder. Files are never moved, renamed or changed.
import {promises as fs,existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {organized} from './storage-layout.mjs';
import {validateMedia} from './media-imports.mjs';
import {figurePrompt,chatgptFigureOrder,FIGURE_EXPRESSIONS} from './figure-prompts.mjs';
import {createFigureReferences} from './figure-references.mjs';

export const SPRITE_FOLDER='Szereplő-alakok';
const MAX_BYTES=20*1024*1024;
const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80);
const key=s=>safeName(s).normalize('NFC').toLocaleLowerCase('hu');
// "alap-2.png" is a newer version of "alap", not a separate expression.
export const expressionOf=file=>path.parse(file).name.trim().toLocaleLowerCase('hu').replace(/-\d+$/,'').slice(0,40)||'alap';
// Outfits (2026-11-11): files right in the character's folder are dressed; the same file names
// in a "felmeztelen" subfolder are the shirtless set, shown only in undressing/intimate moments.
// The "intim" subfolder (2026-11-12) holds waist-up figures for intimate beats; the game fades
// them out below the waist, so nothing explicit is ever drawn.
export const OUTFIT_FOLDERS={felmeztelen:'shirtless','félmeztelen':'shirtless',intim:'intimate',rendőregyenruha:'police',rendor:'police'};

export function installCharacterSprites({db,root,one,all,run,transaction,fail,castIds=()=>[],mayUseReferences=()=>true,allowedReferences=null}){
  const folderReferences=createFigureReferences({root,one,all});
  db.exec(`CREATE TABLE IF NOT EXISTS character_sprites(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),expression TEXT NOT NULL,relative_path TEXT NOT NULL UNIQUE,sha256 TEXT NOT NULL,size INTEGER NOT NULL,width INTEGER,height INTEGER,updated_at TEXT NOT NULL,missing INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sprite_rejections(sprite_id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,note TEXT NOT NULL,rejected_at TEXT NOT NULL);`);
  if(!all('PRAGMA table_info(character_sprites)').some(c=>c.name==='outfit'))db.exec("ALTER TABLE character_sprites ADD COLUMN outfit TEXT NOT NULL DEFAULT 'dressed'");
  // Rows saved before versions were understood ("alap-2") get their real expression back.
  for(const r of all("SELECT id,relative_path,expression FROM character_sprites WHERE expression GLOB '*-[0-9]*'")){const e=expressionOf(r.relative_path);if(e!==r.expression)run('UPDATE character_sprites SET expression=? WHERE id=?',e,r.id);}
  const base=()=>organized(root)?path.join('20_SHARED_MEDIA',SPRITE_FOLDER):SPRITE_FOLDER;
  async function safeDir(relative,create){
    const dir=path.resolve(root,relative);if(!dir.startsWith(path.resolve(root)+path.sep))throw fail('Invalid folder.',403);
    if(create)await fs.mkdir(dir,{recursive:true});
    let real;try{real=await fs.realpath(dir);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The folder points outside your resource folder.',403);
    return real;
  }
  const people=()=>all('SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL');
  let scanning=false;
  async function scan(){
    if(scanning)return {busy:true};scanning=true;
    const result={folders_created:0,added:0,updated:0,missing:0,errors:[]};
    try{
      const byKey=new Map(people().map(c=>[key(c.name),c]));
      // A folder for every character who plays a part (Szellemprofil + Palor); others on request.
      for(const id of castIds()){const c=one('SELECT name FROM characters WHERE id=?',id);if(!c)continue;const rel=path.join(base(),safeName(c.name));if(!await safeDir(rel,false)){await safeDir(rel,true);result.folders_created++;}}
      const baseDir=await safeDir(base(),true),seen=new Set();
      for(const entry of await fs.readdir(baseDir,{withFileTypes:true})){
        if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
        const character=byKey.get(key(entry.name));if(!character)continue;
        const dir=path.join(baseDir,entry.name);
        // The character's own folder (dressed) and an outfit subfolder such as "felmeztelen".
        const sources=[[dir,path.join(base(),entry.name),'dressed']];
        for(const sub of await fs.readdir(dir,{withFileTypes:true}))if(sub.isDirectory()&&OUTFIT_FOLDERS[sub.name.normalize('NFC').toLocaleLowerCase('hu')])sources.push([path.join(dir,sub.name),path.join(base(),entry.name,sub.name),OUTFIT_FOLDERS[sub.name.normalize('NFC').toLocaleLowerCase('hu')]]);
        for(const [folder,relFolder,outfit] of sources)for(const f of await fs.readdir(folder,{withFileTypes:true})){
          if(!f.isFile()||f.name.startsWith('.')||!/\.(png|jpe?g)$/i.test(f.name))continue;
          const relative=path.join(relFolder,f.name);seen.add(relative);
          try{
            const file=path.join(folder,f.name),stat=await fs.lstat(file);
            if(stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Not a regular image up to 20 MiB.');
            const prev=one('SELECT * FROM character_sprites WHERE relative_path=?',relative);
            if(prev&&prev.size===stat.size&&prev.updated_at===stat.mtime.toISOString()&&!prev.missing&&prev.character_id===character.id&&prev.outfit===outfit)continue;
            const bytes=await fs.readFile(file),type=await validateMedia(bytes);if(type.kind!=='image')throw Error('Not a JPEG or PNG image.');
            const expression=expressionOf(f.name);
            const sha=createHash('sha256').update(bytes).digest('hex');
            if(prev){run('UPDATE character_sprites SET character_id=?,expression=?,sha256=?,size=?,width=?,height=?,updated_at=?,missing=0,outfit=? WHERE id=?',character.id,expression,sha,stat.size,type.width,type.height,stat.mtime.toISOString(),outfit,prev.id);result.updated++;}
            else{run('INSERT INTO character_sprites(id,character_id,expression,relative_path,sha256,size,width,height,updated_at,missing,outfit) VALUES(?,?,?,?,?,?,?,?,?,0,?)',randomUUID(),character.id,expression,relative,sha,stat.size,type.width,type.height,stat.mtime.toISOString(),outfit);result.added++;}
          }catch(e){result.errors.push({character:character.name,file:f.name,error:e.message});}
        }
      }
      for(const r of all('SELECT id,relative_path FROM character_sprites WHERE missing=0'))if(!seen.has(r.relative_path)){run('UPDATE character_sprites SET missing=1 WHERE id=?',r.id);result.missing++;}
    }finally{scanning=false;}
    return result;
  }
  // "alap" (base) first, then the rest alphabetically; one figure per expression.
  // A figure the owner rejected (Képműhely) stops counting until its file changes. Versions
  // (alap-2.png, alap-3.png… from before figures replaced each other, or saved by hand) are the same
  // expression: the newest file that is not rejected is the one shown.
  const notRejected='NOT EXISTS(SELECT 1 FROM sprite_rejections r WHERE r.sprite_id=character_sprites.id AND r.sha256=character_sprites.sha256)';
  // outfit: 'dressed' (default, what every existing caller means) or 'shirtless'.
  function forCharacter(cid,{outfit='dressed'}={}){
    const rows=all(`SELECT id,expression,width,height,outfit,updated_at FROM character_sprites WHERE character_id=? AND missing=0 AND outfit=? AND ${notRejected} ORDER BY updated_at DESC,relative_path DESC`,cid,outfit),seen=new Set(),out=[];
    for(const r of rows)if(!seen.has(r.expression)){seen.add(r.expression);out.push(r);}
    return out.sort((a,b)=>(a.expression!=='alap')-(b.expression!=='alap')||a.expression.localeCompare(b.expression,'hu'));
  }
  function reject(id,note){const s=one('SELECT id,sha256 FROM character_sprites WHERE id=?',String(id));if(!s)throw fail('Figure not found',404);run('INSERT INTO sprite_rejections VALUES(?,?,?,?) ON CONFLICT(sprite_id) DO UPDATE SET sha256=excluded.sha256,note=excluded.note,rejected_at=excluded.rejected_at',s.id,s.sha256,String(note||'').slice(0,1000),new Date().toISOString());return {sprite_id:s.id,rejected:true};}
  async function serve(id,res){
    const s=one('SELECT relative_path FROM character_sprites WHERE id=? AND missing=0',id);if(!s)throw fail('Figure not found',404);
    const file=path.resolve(root,s.relative_path),real=await fs.realpath(file).catch(()=>null);
    if(!real||!real.startsWith((await fs.realpath(root))+path.sep))throw fail('Figure not found',404);
    const bytes=await fs.readFile(real);
    res.writeHead(200,{'Content-Type':/\.png$/i.test(real)?'image/png':'image/jpeg','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }
  let timer=null;
  const tick=()=>scan().catch(e=>console.error('Character figures: '+e.message));
  function startWatcher(){if(timer)return;setTimeout(tick,40_000).unref?.();timer=setInterval(tick,5*60_000);timer.unref?.();}
  function stopWatcher(){if(timer)clearInterval(timer);timer=null;}
  async function handle({p,req,res,json}){
    if(p==='/api/sprites/scan'&&req.method==='POST'){json(await scan());return true;}
    // Everyone in the cast without any figure yet, with folder and prompts (one Grok session).
    if(p==='/api/sprites/missing'&&req.method==='GET'){const o=overview();json({...o,characters:o.characters.filter(c=>!c.expressions.length)});return true;}
    const pr=p.match(/^\/api\/sprites\/prompt\/([0-9a-f-]{36})$/);
    if(pr&&req.method==='GET'){json(promptFor(pr[1]));return true;}
    const m=p.match(/^\/api\/sprites\/([0-9a-f-]{36})$/);
    if(m&&req.method==='GET'){await serve(m[1],res);return true;}
    return false;
  }
  // Ready-to-copy English prompts for one character, from his approved appearance only.
  function promptFor(cid){
    const c=one('SELECT id,name FROM characters WHERE id=?',cid);if(!c)throw fail('Character not found',404);
    const canon=one('SELECT appearance,references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
    let refs=0;try{refs=JSON.parse(canon?.references_json||'[]').length;}catch{}
    // Approved collection references, or the separately owner-selected figure folder.
    const selected=folderReferences.forCharacter(c.id);
    const useReferences=selected?selected.references.length>0:mayUseReferences(c.id);if(allowedReferences)refs=allowedReferences(c.id).length;
    if(selected)refs=selected.references.length;
    const ready=!selected||refs>0;
    const prompts=figurePrompt({name:c.name,appearance:canon?.appearance||'',referenceCount:refs,useReferences,folder:path.join(base(),safeName(c.name)),folderOnly:!!selected});
    // Same rows as the Szereplőgyár avatar series: the intimate row has only alap, mosoly, flortol.
    const policeFolder=path.join(base(),safeName(c.name),'rendőregyenruha'),hasPoliceFolder=existsSync(path.resolve(root,policeFolder));
    const rows=['dressed','shirtless','intimate',...(hasPoliceFolder?['police']:[])];
    const missing=Object.fromEntries(rows.map(outfit=>{const have=new Set(forCharacter(c.id,{outfit}).map(s=>s.expression));
      return [outfit,FIGURE_EXPRESSIONS.map(e=>e.file).filter(f=>(outfit!=='intimate'||['alap','mosoly','flortol'].includes(f))&&!have.has(f))];}));
    const chatgpt=ready?chatgptFigureOrder({id:c.id,name:c.name,missing}):null;
    return {character_id:c.id,name:c.name,chatgpt,missing,reference_count:useReferences?refs:0,reference_policy:selected?'character_folder':useReferences?'approved_references':'text_only',existing:forCharacter(c.id).map(s=>s.expression),
      ...prompts,...(selected?{references:selected.references,source_folder:selected.folder,available_reference_count:selected.available_count,
        generation_ready:ready,generation_blocked:ready?null:'No usable image in '+selected.folder+'. Figure generation from text alone is disabled.',
        ...(!ready?{base:null,variants:null}:{} )}:{})};
  }
  // For Grok (read-only): which characters need figures, their folder, expressions, prompts.
  function overview(){
    return {folder_root:base(),file_names:FIGURE_EXPRESSIONS.map(x=>x.file+'.png').join(', ')+' (alap.png is required)',
      characters:castIds().map(id=>one('SELECT id FROM characters WHERE id=?',id)).filter(Boolean).map(c=>{const p=promptFor(c.id),policeFolder=path.join(p.folder,'rendőregyenruha'),hasPoliceFolder=existsSync(path.resolve(root,policeFolder));return {character_id:p.character_id,name:p.name,folder:p.folder,expressions:p.existing,approved_reference_count:p.references?p.references.filter(r=>r.canon_approved).length:p.reference_count,reference_policy:p.reference_policy,base_prompt:p.base,expression_prompts:p.variants,chatgpt_order:p.chatgpt,
        ...(p.references?{references:p.references,source_folder:p.source_folder,available_reference_count:p.available_reference_count,generation_ready:p.generation_ready,generation_blocked:p.generation_blocked}:{}),
        shirtless:{folder:path.join(p.folder,'felmeztelen'),expressions:forCharacter(c.id,{outfit:'shirtless'}).map(s=>s.expression)},
        ...(hasPoliceFolder?{police:{folder:policeFolder,expressions:forCharacter(c.id,{outfit:'police'}).map(s=>s.expression)}}:{}),
        intimate:{folder:path.join(p.folder,'intim'),expressions:forCharacter(c.id,{outfit:'intimate'}).map(s=>s.expression)}};})};
  }
  return {scan,forCharacter,reject,handle,startWatcher,stopWatcher,base,overview,promptFor};
}
