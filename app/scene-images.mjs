// Shared scene pictures: Palor together with one character at a place, used by photo
// scenes and the "Közös fotók" strip. Three ways in, all free: generated in the Grok app
// and saved to <media>/…/Közös jelenetek/<character>/<place> - <n>.png, uploaded in the
// game, or already in the catalogue. Every insertion is logged; files are never
// overwritten, moved or changed. Content can be marked by hand (hétköznapi / meztelen /
// szexuális); unmarked, unanalysed pictures count as intimate and stay behind the
// intimacy gate. Nothing here changes canon.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {organized} from './storage-layout.mjs';
import {validateMedia} from './media-imports.mjs';
import {backgroundPrompt,scenePrompt} from './figure-prompts.mjs';

export const SCENE_FOLDER='Közös jelenetek';
const MAX_BYTES=20*1024*1024,LEVELS=['non_intimate','nudity','sexual_activity'];
const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80);
const fold=s=>String(s).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
// Content from the file name: "… hetkoznapi.png", "… meztelen.png", "… szex.png".
const contentFromName=n=>/hetkoznapi|everyday/i.test(fold(n))?'non_intimate':/meztelen|nude/i.test(fold(n))?'nudity':/szex|sex/i.test(fold(n))?'sexual_activity':null;

export function installSceneImages({db,root,one,all,run,transaction,fail,palor,locationTree,activityOf=()=>'',stageOf=()=>'none',mayUseReferences=()=>true,mayUseEverydayReferences=mayUseReferences,intimateAllowed=mayUseReferences}){
  db.exec(`CREATE TABLE IF NOT EXISTS play_content(media_id TEXT PRIMARY KEY,level TEXT NOT NULL,set_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS play_inserts(id TEXT PRIMARY KEY,media_id TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL,character_id TEXT,location_id TEXT,created_at TEXT NOT NULL);`);
  const base=()=>organized(root)?path.join('20_SHARED_MEDIA',SCENE_FOLDER):SCENE_FOLDER;
  async function safeDir(relative,create=true){
    const dir=path.resolve(root,relative);if(!dir.startsWith(path.resolve(root)+path.sep))throw fail('Invalid folder.',403);
    if(create)await fs.mkdir(dir,{recursive:true});
    let real;try{real=await fs.realpath(dir);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The folder points outside your resource folder.',403);
    return real;
  }
  const iso=()=>new Date().toISOString();
  // A place from the start of a file name: "Sanyi háza - 2.png" → Sanyi háza.
  async function placeFromName(file){
    const head=fold(file.replace(/\.[^.]+$/,'').split(/\s+-\s+/)[0]);if(!head)return null;
    const t=await locationTree.load();
    const hit=t.nodes.find(n=>n.location_id&&(fold(n.short_name)===head||fold(n.name)===head));
    return hit?.location_id||one('SELECT id FROM locations WHERE lower(name)=lower(?)',head)?.id||null;
  }
  function register({cid,locationId,relative,folder,size,mtime,content,source}){
    const pid=palor()?.id,now=iso();
    return transaction(()=>{
      const id=one('SELECT id FROM media WHERE relative_path=?',relative)?.id||randomUUID(),fresh=!one('SELECT 1 FROM media WHERE id=?',id);
      if(fresh)run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',id,relative,folder,'image',size,mtime.toISOString(),now);
      if(one('SELECT 1 FROM media_hidden WHERE media_id=?',id))return null;
      for(const c of [cid,pid].filter(Boolean))run('INSERT OR IGNORE INTO depictions VALUES(?,?)',id,c);
      const tag=locationId?one('SELECT tag_id FROM locations WHERE id=?',locationId)?.tag_id:null;if(tag)run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,tag);
      run('INSERT INTO media_categorization(media_id,complete,updated_at) VALUES(?,1,?) ON CONFLICT(media_id) DO UPDATE SET complete=1,updated_at=excluded.updated_at',id,now);
      if(content)run('INSERT INTO play_content VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET level=excluded.level,set_at=excluded.set_at',id,content,now);
      if(fresh)run('INSERT INTO play_inserts VALUES(?,?,?,?,?,?,?)',randomUUID(),id,'scene',source,cid,locationId,now);
      return id;
    });
  }
  // Watched folder: one sub-folder per character (created for the cast on first scan).
  let scanning=false;
  async function scan(castIds=[]){
    if(scanning)return {busy:true};scanning=true;const result={added:0,errors:[]};
    try{
      for(const id of castIds){const c=one('SELECT name FROM characters WHERE id=?',id);if(c)await safeDir(path.join(base(),safeName(c.name)));}
      const baseDir=await safeDir(base());
      const byName=new Map(all('SELECT id,name FROM characters').map(c=>[fold(safeName(c.name)),c.id]));
      for(const d of await fs.readdir(baseDir,{withFileTypes:true})){
        const cid=d.isDirectory()?byName.get(fold(d.name)):null;if(!cid)continue;
        for(const f of await fs.readdir(path.join(baseDir,d.name),{withFileTypes:true})){
          if(!f.isFile()||!/\.(png|jpe?g)$/i.test(f.name))continue;
          // Skip only when already linked to him (the catalogue scan may have found it first).
          const relative=path.join(base(),d.name,f.name);if(one('SELECT 1 FROM media m JOIN depictions x ON x.media_id=m.id AND x.character_id=? WHERE m.relative_path=?',cid,relative))continue;
          try{
            const file=path.join(baseDir,d.name,f.name),stat=await fs.lstat(file);
            if(stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Not a regular image up to 20 MiB.');
            if((await validateMedia(await fs.readFile(file))).kind!=='image')throw Error('Not a JPEG or PNG image.');
            if(register({cid,locationId:await placeFromName(f.name),relative,folder:path.join(base(),d.name),size:stat.size,mtime:stat.mtime,content:contentFromName(f.name),source:'folder'}))result.added++;
          }catch(e){result.errors.push({file:f.name,error:e.message});}
        }
      }
    }finally{scanning=false;}
    return result;
  }
  // Upload in the game: a friendly name "<place> - <date>-<n>.png"; identical bytes are reused.
  async function upload(body){
    const c=one('SELECT id,name FROM characters WHERE id=?',body.character_id);if(!c)throw fail('Character not found',404);
    const m=typeof body.data_url==='string'&&body.data_url.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);if(!Buffer.isBuffer(body.bytes)&&!m)throw fail('Choose a JPEG or PNG image.');
    const bytes=Buffer.isBuffer(body.bytes)?body.bytes:Buffer.from(m[2],'base64');if(!bytes.length||bytes.length>MAX_BYTES)throw fail('Images must be at most 20 MiB.',413);
    const type=await validateMedia(bytes);if(type.kind!=='image')throw fail('Choose a JPEG or PNG image.');
    if(body.content!==undefined&&!LEVELS.includes(body.content))throw fail('Unknown content level.');
    const t=await locationTree.load(),node=body.location_id?t.byLocation.get(body.location_id):null;
    const folder=path.join(base(),safeName(c.name)),dir=await safeDir(folder),sha=createHash('sha256').update(bytes).digest('hex');
    // The same picture uploaded twice is the same media.
    for(const f of await fs.readdir(dir)){const p=path.join(dir,f);if(/\.(png|jpe?g)$/i.test(f)&&(await fs.stat(p)).size===bytes.length&&createHash('sha256').update(await fs.readFile(p)).digest('hex')===sha){const existing=one('SELECT id FROM media WHERE relative_path=?',path.join(folder,f))?.id;if(existing)return {media_id:existing,duplicate:true};}}
    const stem=safeName(`${node?.short_name||'Jelenet'} - ${new Date().toISOString().slice(0,10)}`);
    let name,n=1;do{name=`${stem}-${n++}.${type.extension}`;}while(await fs.stat(path.join(dir,name)).then(()=>true,()=>false));
    await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});const stat=await fs.stat(path.join(dir,name));
    const id=register({cid:c.id,locationId:body.location_id||null,relative:path.join(folder,name),folder,size:stat.size,mtime:stat.mtime,content:body.content||null,source:'upload'});
    return {media_id:id,file:name,duplicate:false};
  }
  function setContent(mediaId,level){
    if(level!==null&&!LEVELS.includes(level))throw fail('Unknown content level.');if(typeof mediaId!=='string'||!one('SELECT 1 FROM media WHERE id=?',mediaId))throw fail('Media not found',404);
    // null = undo the creator's label (the AI analysis or "unknown" applies again).
    if(level===null){run('DELETE FROM play_content WHERE media_id=?',mediaId);return {media_id:mediaId,level:null};}
    run('INSERT INTO play_content VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET level=excluded.level,set_at=excluded.set_at',mediaId,level,iso());return {media_id:mediaId,level};
  }
  // The open (or given) face-to-face talk with him: latest beat, running summary, last lines.
  // Only Palor's and his own words; nothing from the creator's private notes.
  function talkContext(characterId,conversationId){
    const conv=conversationId?one("SELECT id,slot,memo_json FROM play_conversations WHERE id=? AND character_id=? AND rewound_at IS NULL",conversationId,characterId)
      :one("SELECT id,slot,memo_json FROM play_conversations WHERE character_id=? AND status='open' AND channel='in_person' AND rewound_at IS NULL ORDER BY rowid DESC LIMIT 1",characterId);
    if(!conv)return null;
    const p=palor(),c=one('SELECT name FROM characters WHERE id=?',characterId);
    const rows=all("SELECT l.speaker,l.text,(SELECT beat FROM play_line_meta m WHERE m.line_id=l.id) beat FROM active_play_lines l WHERE l.conversation_id=? ORDER BY l.rowid DESC LIMIT 8",conv.id).reverse();
    const beat=[...rows].reverse().find(r=>r.speaker==='character'&&r.beat)?.beat||null;
    let memo=null;try{memo=JSON.parse(conv.memo_json||'null')?.text||null;}catch{}
    return {beat,memo,slot:conv.slot,lines:rows.map(r=>({who:r.speaker==='palor'?(p?.name||'Palor'):c?.name||'',text:r.text}))};
  }
  async function prompts({character_id,location_id,conversation_id=null}){
    const t=await locationTree.load(),node=location_id?t.byLocation.get(location_id):null;
    const loc=location_id?one('SELECT id,name FROM locations WHERE id=?',location_id):null;
    const out={};
    if(loc)out.background=backgroundPrompt({name:node?.short_name||loc.name,path:node?.path||loc.name,folder:path.join(organized(root)?path.join('20_SHARED_MEDIA','Helyszín hátterek'):'Helyszín hátterek',safeName(loc.name))});
    if(character_id){const c=one('SELECT id,name FROM characters WHERE id=?',character_id);if(!c)throw fail('Character not found',404);
      const look=id=>one('SELECT appearance FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',id)?.appearance||'';
      // References remain explicitly approved and scoped to the owner's fictional-AI collection.
      // Origin eligibility does not replace the separate content, consent or provider gates.
      const stage=intimateAllowed(c.id)?stageOf(c.id):'none',everyday=stage==='none',refsOk=everyday?mayUseEverydayReferences:mayUseReferences;
      const useReferences=refsOk(c.id),p=palor(),palorReferences=!!p&&refsOk(p.id);
      out.scene={...scenePrompt({palor:p?.name||'Palor',name:c.name,place:node?.short_name||loc?.name||'',path:node?.path||loc?.name||'',stage:stageOf(c.id),activity:location_id?activityOf(c.id,location_id):'',folder:path.join(base(),safeName(c.name)),useReferences,intimateAllowed:intimateAllowed(c.id),appearance:look(c.id),palorReferences,palorAppearance:p?look(p.id):'',talk:talkContext(c.id,conversation_id)}),reference_policy:useReferences?(everyday?'approved_references_everyday':'approved_references'):intimateAllowed(c.id)?'text_only':'text_only_everyday',palor_reference_policy:palorReferences?'approved_references':'text_only'};}
    return out;
  }
  const recentInserts=(limit=12)=>all(`SELECT i.kind,i.source,i.created_at,COALESCE(m.relative_path,s.relative_path) relative_path,c.name character FROM play_inserts i LEFT JOIN media m ON m.id=i.media_id
    LEFT JOIN character_sprites s ON i.media_id='sprite:'||s.id LEFT JOIN characters c ON c.id=i.character_id WHERE m.id IS NOT NULL OR s.id IS NOT NULL ORDER BY i.created_at DESC LIMIT ?`,limit);
  return {scan,upload,setContent,prompts,recentInserts,base,register};
}
