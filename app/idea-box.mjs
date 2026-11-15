// Ötletláda (idea box, 2026-11-11): comic panel crops and inspiring pictures that later
// pictures can be generated from. They live in the creator's planning folder
// (media-purpose.mjs: "Generation plans, ideas"), so they are planning material only: never a
// story event, never character identity evidence, not shown as sorting work in the Képműhely.
//   Képregény-kivágások/  comic crops   (kind "comic")
//   Ihletek/              inspiration   (kind "inspiration")
//   anything else there   earlier plans (kind "plan")
// Putting a picture in or taking it out is a journaled move (createMediaMover); IDs, links and
// history stay. Each idea may carry a short owner note ("what to make from it").
// Generators (Grok/ChatGPT over MCP) may read the list. Owner 2026-11-11: the ideas are randomly
// generated comic panels and rough drawings (no real people), so a generator may take everything
// from them — composition, pose, mood, setting, and also the face and build of the drawn figures.
// The one limit: an existing Living Universe character keeps his own look from his approved
// references; a drawn figure never replaces or changes that, and no new character is created.
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {planningFolder,isPlanningSource} from './media-purpose.mjs';

export const IDEA_KINDS={comic:'Képregény-kivágások',inspiration:'Ihletek'};
const uuid=/^[0-9a-f-]{36}$/i;

export function ideaKindOf(relativePath){
  if(!isPlanningSource(relativePath))return null;
  const rest=relativePath.replaceAll('\\','/').slice(planningFolder.length+1).split('/');
  if(rest.length>1)for(const [kind,folder] of Object.entries(IDEA_KINDS))if(rest[0].toLocaleLowerCase('hu')===folder.toLocaleLowerCase('hu'))return kind;
  return 'plan';
}

export function installIdeaBox({root,db,one,all,run,fail,mover,isBusy=()=>false,now=()=>new Date().toISOString()}){
  db.exec('CREATE TABLE IF NOT EXISTS idea_box_notes(media_id TEXT PRIMARY KEY,note TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const base=planningFolder.split('/').join('\\');
  const planningRows=()=>all("SELECT m.id,m.kind,m.relative_path,m.created_at,n.note FROM active_media m LEFT JOIN idea_box_notes n ON n.media_id=m.id WHERE lower(replace(m.relative_path,'\\','/')) LIKE lower(?) ORDER BY m.created_at DESC,m.id",planningFolder+'/%');
  // The latest AI description, if the picture was tagged (helps a generator without opening it).
  const describe=id=>{try{return one("SELECT json_extract(raw_json,'$.description.hu') d FROM world_review_sources WHERE media_id=? ORDER BY rowid DESC LIMIT 1",id)?.d||null;}catch{return null;}};

  function list({kind=null,limit=200,offset=0}={}){
    if(kind!==null&&!['comic','inspiration','plan'].includes(kind))throw fail('Unknown idea kind.');
    const rows=planningRows().map(r=>({media_id:r.id,kind:ideaKindOf(r.relative_path),media_kind:r.kind,file:path.basename(r.relative_path),note:r.note||'',created_at:r.created_at}));
    const counts={comic:0,inspiration:0,plan:0};for(const r of rows)counts[r.kind]++;
    const pick=kind?rows.filter(r=>r.kind===kind):rows,lim=Math.max(1,Math.min(500,Number(limit)||200)),skip=Math.max(0,Number(offset)||0);
    return {counts,total:pick.length,items:pick.slice(skip,skip+lim)};
  }
  // A free file name in the target folder: "x.png", then "x (2).png" … (never overwrites).
  async function freeName(folder,file){
    const {name,ext}=path.parse(file);
    for(let i=1;i<50;i++){const candidate=i===1?file:`${name} (${i})${ext}`,rel=folder+'\\'+candidate;
      if(one('SELECT 1 FROM media WHERE relative_path=? COLLATE NOCASE',rel.split('\\').join(path.sep)))continue;
      try{await fs.lstat(path.join(root,...rel.split('\\')));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
      return rel;}
    throw fail('No free file name in the idea box folder.',409);
  }
  async function moveTo(mediaId,folder){
    if(isBusy())throw fail('A move or scan is running. Please retry when it finishes.',409);
    const m=one('SELECT id,relative_path FROM active_media WHERE id=?',mediaId);if(!m)throw fail('Media not found',404);
    const to=await freeName(folder,path.basename(m.relative_path));
    const r=await mover.moveOne({media_id:m.id,from:m.relative_path,to});
    if(r!=='moved')throw fail('The picture could not be moved ('+r+'). Nothing was changed.',409);
    await mover.pruneEmpty(new Set([path.dirname(path.join(root,m.relative_path))]));
    return one('SELECT relative_path FROM media WHERE id=?',m.id).relative_path;
  }
  async function add(body){
    const {media_id,kind,note}=body||{};
    if(typeof media_id!=='string'||!uuid.test(media_id))throw fail('Media not found',404);
    if(!Object.hasOwn(IDEA_KINDS,kind))throw fail('Choose comic crop or inspiration.');
    const m=one('SELECT id,relative_path FROM active_media WHERE id=?',media_id);if(!m)throw fail('Media not found',404);
    if(ideaKindOf(m.relative_path)===kind)return {media_id,kind,relative_path:m.relative_path,unchanged:true};
    const rel=await moveTo(media_id,base+'\\'+IDEA_KINDS[kind]);
    if(typeof note==='string'&&note.trim())setNote({media_id,note});
    return {media_id,kind,relative_path:rel};
  }
  // Taking a picture out puts it back among the unsorted pictures (Unassigned).
  async function remove(body){
    const {media_id}=body||{};
    const m=typeof media_id==='string'?one('SELECT id,relative_path FROM active_media WHERE id=?',media_id):null;if(!m)throw fail('Media not found',404);
    if(!ideaKindOf(m.relative_path))throw fail('This picture is not in the idea box.',409);
    const rel=await moveTo(media_id,'20_SHARED_MEDIA\\Unassigned');
    return {media_id,relative_path:rel};
  }
  function setNote(body){
    const {media_id,note}=body||{};
    const m=typeof media_id==='string'?one('SELECT relative_path FROM active_media WHERE id=?',media_id):null;if(!m)throw fail('Media not found',404);
    if(!ideaKindOf(m.relative_path))throw fail('This picture is not in the idea box.',409);
    if(typeof note!=='string'||note.length>1000)throw fail('The note can be at most 1000 characters.');
    if(note.trim())run('INSERT INTO idea_box_notes VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at',media_id,note.trim(),now());
    else run('DELETE FROM idea_box_notes WHERE media_id=?',media_id);
    return {media_id,note:note.trim()};
  }
  async function handle({p,req,url,body,json}){
    if(p==='/api/workshop/ideas'&&req.method==='GET')return json(list({kind:url?.searchParams.get('kind')||null,limit:url?.searchParams.get('limit'),offset:url?.searchParams.get('offset')})),true;
    if(p==='/api/workshop/ideas'&&req.method==='POST')return json(await add(body)),true;
    if(p==='/api/workshop/ideas/remove'&&req.method==='POST')return json(await remove(body)),true;
    if(p==='/api/workshop/ideas/note'&&req.method==='POST')return json(setNote(body)),true;
    return false;
  }
  // MCP (read-only): the ideas a generator may draw on, with the owner's notes.
  const ops={ideas:{run:a=>{
    if(a&&typeof a==='object'&&Object.keys(a).some(k=>!['kind','limit','offset'].includes(k)))throw fail('Unexpected fields: allowed are kind, limit, offset.');
    const r=list({kind:a?.kind??null,limit:a?.limit??50,offset:a?.offset??0});
    return {...r,items:r.items.map(i=>({...i,description:describe(i.media_id)})),
      rule:'Ideas are randomly generated comic panels and rough drawings, not real people. You may take anything from them: composition, pose, framing, mood, setting, story beat, and the face and body build of the drawn figures (render them as adult males). Exception: when the picture shows an existing Living Universe character, his face and body come only from the approved references in his brief; a drawn figure never replaces his look. Do not create new characters or profiles from an idea. Fetch a picture with get_media(media_id). The owner\'s note says what to make from it.'};}}};
  return {list,add,remove,setNote,handle,ops};
}
