// Szereplőgyár (2026-11-14, owner): one form for a new character, then open "orders" that Grok and
// ChatGPT work through in their own chats (no API credits), checked by the program itself.
//
//  1. The owner writes a name and a few lines, attaches 1–12 pictures and ticks what he wants:
//     profile (Grok), avatar series (ChatGPT), gallery (ChatGPT, n pictures).
//  2. The program creates the character (male by default) with his own folder, puts the pictures
//     there and links them to him. They are his source pictures for figures; nothing becomes canon.
//  3. Grok: list_character_orders → writes the whole Szellemprofil with propose_ghost_profile.
//     For an order character the proposal is accepted at once (owner authorization for the
//     Szereplőgyár) and the profile is checked: every field except birth date and provenance must
//     be filled with real text; the gaps go back to Grok in the answer.
//  4. ChatGPT: the avatar series through the existing figure jobs (dressed and shirtless rows);
//     every placed figure is checked with the local face check against the attached pictures and
//     a mismatch is listed for redoing. Gallery pictures through save_order_picture: checked
//     before saving; a match goes into "<his folder>/Galéria", a mismatch is not kept.
//  5. The Szereplőgyár page and the order card show each step.
//
// Face check: the local InsightFace method (identity-suggest.mjs worker), free and offline. When the
// models are not installed the check is reported as "not checked" and nothing is rejected for it.
// FACE_PASS is provisional (generated pictures against photos), separate from the auto-canon gates.
import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {catalogueFolder} from './storage-layout.mjs';
import {FIGURE_EXPRESSIONS} from './figure-prompts.mjs';
import {MINOR,FEMALE} from './play-stories.mjs';
import {readName} from './new-images.mjs';
import {CONTENT_WORD,LEVELS} from './content-levels.mjs';

// Gallery file names follow the "Új képek" naming rule (2026-11-12, docs/UJ_KEPEK_UTMUTATO.md),
// like the connector's target picture: "<Név> - <Helyszín> - <címke> - hetkoznapi - 2026-11-14-1.png".
export {CONTENT_WORD};
export function galleryStem({name,place='',label='',content='non_intimate',date}){
  const clean=s=>String(s||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim();
  return [clean(name),clean(place),clean(label),CONTENT_WORD[content]||CONTENT_WORD.non_intimate,date].filter(Boolean).join(' - ');
}

// Owner rule (AGENTS.md): adult males only, whatever the local policy file says.
function assertAdultMan(text,fail){
  const f=String(text||'').match(FEMALE);if(f)throw fail('Only men can be created; refused word: '+f[0].trim(),400);
  const m=String(text||'').match(MINOR);if(m)throw fail('Everyone must be an adult; refused word: '+m[0].trim(),400);
}

export const FACE_PASS=0.45,MIN_FACE_PX=40,MIN_DET=0.6;
// Avatar rows: dressed and shirtless full figures, plus the intimate row (waist-up, bare upper
// body, no clothing in the frame; the game fades it out at the waist) with its three expressions.
export const ORDER_OUTFITS=['dressed','shirtless','intimate'];
const INTIMATE_EXPRESSIONS=['alap','mosoly','flortol'];
export const rowExpressions=outfit=>FIGURE_EXPRESSIONS.filter(e=>outfit!=='intimate'||INTIMATE_EXPRESSIONS.includes(e.file));
const AVATAR_COUNT=ORDER_OUTFITS.reduce((s,o)=>s+rowExpressions(o).length,0);

// Gallery scenes (2026-11-14, owner; docs/UJ_KEPEK_UTMUTATO.md): the base set alone and the shared
// set with Palor, each ticked on the form. Every scene has a purpose (where the game uses it) and a
// default idea; ChatGPT adapts the idea to who he is from the description and profile, and replaces
// it when it does not fit him (a humanoid monster does not take a selfie). label goes into the file name.
export const GALLERY_SCENES=Object.freeze([
  {key:'portrait',set:'solo',label:'portré',purpose:'profile and portrait',idea:'head and shoulders, neutral background, calm face'},
  {key:'waist_up',set:'solo',label:'derékig',purpose:'portrait and phone',idea:'waist-up in his typical clothing, smiling'},
  {key:'selfie',set:'solo',label:'szelfi',purpose:'phone message picture',idea:'a selfie with his phone at an everyday place'},
  {key:'own_place',set:'solo',label:'saját hely',purpose:'scene',idea:'full figure at his own place (work, home or favourite spot)'},
  {key:'morning',set:'solo',label:'reggel',purpose:'scene, time of day',idea:'morning: coffee, waking up, getting ready'},
  {key:'evening',set:'solo',label:'este',purpose:'scene, time of day',idea:'evening or night: lamplight, resting, on the way home'},
  {key:'work_hobby',set:'solo',label:'munka',purpose:'scene, diary',idea:'at work or at a hobby that his profile really contains'},
  {key:'meeting',set:'palor',label:'első találkozás',purpose:'scene, shared photos',idea:'first meeting or a talk with Palor at a known place'},
  {key:'coffee',set:'palor',label:'közös kávé',purpose:'shared photos, diary',idea:'coffee or a meal together with Palor'},
  {key:'walk',set:'palor',label:'séta',purpose:'scene, diary',idea:'a walk or a trip together with Palor (street, park, vehicle)'},
  {key:'shared_selfie',set:'palor',label:'közös szelfi',purpose:'shared photos, phone',idea:'a selfie of the two of them'},
  {key:'activity',set:'palor',label:'közös program',purpose:'scene, diary',idea:'doing something together with Palor (training, work, a game, a party)'},
]);

// Life moments for existing characters (2026-11-16, owner): pictures from his recorded profile and
// from his recorded relationship with Palor. Nothing is invented: the daily set follows his
// weekly_routine / habits / occupation / residence; the Palor set and the shared shirtless pictures
// exist only when a relationship with Palor is recorded (relationship note or approved shared
// story event). A new approved shared event later opens its own order (one picture per event).
const DAILY_SCENES=[
  {key:'daily_morning',label:'reggel',idea:'his morning as his routine and habits describe it'},
  {key:'daily_day',label:'napközben',idea:'his main daytime activity (his work or what fills his day)'},
  {key:'daily_afternoon',label:'délután',idea:'an afternoon errand, habit or hobby from his profile'},
  {key:'daily_evening',label:'este',idea:'his evening as his routine describes it'},
  {key:'daily_free',label:'szabadidő',idea:'his free time or weekend, from his habits'},
].map(s=>({...s,set:'solo',purpose:'everyday life, scene, diary',idea:s.idea+'; only what his profile supports'}));
// Shirtless: not all on a beach. With a recorded relationship the first three are with Palor.
const SHIRTLESS_SCENES=[
  {key:'bare_couch',label:'kanapén',idea:'lying or lounging on a couch at home',together:true},
  {key:'bare_hike',label:'túra',idea:'on a hike outdoors, shirt off in the heat',together:true},
  {key:'bare_bed',label:'ágyban',idea:'lying in bed, relaxed and calm (not sexual)',together:true},
  {key:'bare_workout',label:'edzés',idea:'working out (gym, home workout or running)'},
  {key:'bare_yard',label:'udvar',idea:'tidying the yard or the garden'},
  {key:'bare_work',label:'fizikai munka',idea:'doing physical work (carrying, building, repairing)'},
];
export function lifeScenes({daily=true,palor=true,shirtless=true,relation=null}={}){
  const out=[];
  if(daily)out.push(...DAILY_SCENES.map(s=>({...s,content:'non_intimate'})));
  if(palor&&relation){const n=Math.min(5,Math.max(3,relation.events.length));
    for(let i=0;i<n;i++){const e=relation.events[i];out.push({key:'palor_'+(i+1),set:'palor',label:'közös pillanat',purpose:'shared photos, diary',content:'non_intimate',
      idea:e?`the recorded event "${e.title}": ${e.summary}`:'a moment of their relationship exactly as recorded (relationship notes and events); never closer than recorded'});}}
  if(shirtless)for(const s of SHIRTLESS_SCENES){const together=!!s.together&&!!relation;
    out.push({key:s.key,set:together?'palor':'solo',label:s.label,purpose:together?'shared shirtless moment':'shirtless moment of his own life',content:'shirtless',
      idea:`shirtless (bare upper body, trousers on), ${s.idea}${together?', together with Palor in a way their recorded relationship supports':', alone'}`});}
  return out;
}
export const OPTIONAL_FIELDS=new Set(['birth_date','origin']);
const PLACEHOLDER=/^(?:\[?ismeretlen\]?|nincs(?: rögzítve)?|nem ismert|n\/a|tbd|-|–|\?)(?:[\s.,;:]|$)/i;
const TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
const sniff=b=>b[0]===0x89&&b[1]===0x50?'png':b[0]===0xff&&b[1]===0xd8?'jpg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;

// Which template fields are still empty or only a placeholder. Pure.
export function profileGaps(values,fields){
  const missing=[],weak=[];
  for(const f of fields){
    if(OPTIONAL_FIELDS.has(f.id))continue;
    const v=values?.[f.id]?.value;
    if(v===undefined||v===null||String(v).trim()===''){missing.push(f.id);continue;}
    if(f.type!=='scale'){const s=String(v).trim();if(PLACEHOLDER.test(s)||s.length<12)weak.push(f.id);}
  }
  return {missing,weak,complete:!missing.length&&!weak.length};
}
const cosine=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const vectorOf=f=>{const buf=Buffer.from(f.embedding,'base64');return new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));};

export function installCharacterOrders({db,one,all,run,transaction,fail,root,dataDir,folderSync,ghostProfiles,characterPolicy=null,analyse=null,now=()=>new Date(),
  palor=()=>one("SELECT id,name FROM characters WHERE lower(trim(name))='palor' LIMIT 1")||null}){
  db.exec(`CREATE TABLE IF NOT EXISTS character_orders(id TEXT PRIMARY KEY,character_id TEXT NOT NULL,description TEXT NOT NULL,want_profile INTEGER NOT NULL,want_avatars INTEGER NOT NULL,want_gallery INTEGER NOT NULL,gallery_count INTEGER NOT NULL,status TEXT NOT NULL,steps_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS character_order_faces(order_id TEXT NOT NULL,media_id TEXT NOT NULL,vector BLOB,PRIMARY KEY(order_id,media_id));
    CREATE TABLE IF NOT EXISTS character_order_sources(order_id TEXT NOT NULL,media_id TEXT NOT NULL,PRIMARY KEY(order_id,media_id));`);
  // Shared Palor events already covered by an order (or present before this feature: order_id NULL).
  const eventsTableNew=!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_order_events'");
  db.exec('CREATE TABLE IF NOT EXISTS character_order_events(event_id TEXT NOT NULL,character_id TEXT NOT NULL,order_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(event_id,character_id));');
  const iso=()=>now().toISOString();
  const orderOf=id=>{const r=one('SELECT * FROM character_orders WHERE id=?',id);return r?{...r,steps:JSON.parse(r.steps_json)}:null;};
  // The newest open order of his whose profile step is in use (life orders have none).
  const openOrderFor=cid=>{for(const r of all("SELECT id FROM character_orders WHERE character_id=? AND status='open' ORDER BY created_at DESC",cid)){const o=orderOf(r.id);if(o.steps.profile.state!=='skipped')return o;}return null;};
  const kindOf=o=>o.steps.kind||'new';

  // ---- his recorded relationship with Palor ---------------------------------------------------
  const hasStory=()=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_event_participants'");
  const clip=(s,n)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,n);
  // Approved story events with both of them, oldest first.
  function sharedEvents(cid){
    const p=palor();if(!p||p.id===cid||!hasStory())return [];
    return all(`SELECT e.id,r.payload_json,e.created_at FROM story_events e JOIN story_event_revisions r ON r.event_id=e.id AND r.version=e.version
      WHERE r.status='approved' AND EXISTS(SELECT 1 FROM story_event_participants a WHERE a.event_id=e.id AND a.character_id=?)
      AND EXISTS(SELECT 1 FROM story_event_participants b WHERE b.event_id=e.id AND b.character_id=?) ORDER BY e.created_at,e.id`,cid,p.id)
      .map(r=>{let j={};try{j=JSON.parse(r.payload_json);}catch{}return {event_id:r.id,title:clip(j.title,160),summary:clip(j.summary,600),at:r.created_at};});
  }
  // null when nothing is recorded: then no Palor picture is ordered and nothing is made up.
  function relationOf(cid){
    const p=palor();if(!p||p.id===cid)return null;
    const notes=all('SELECT description FROM relationships WHERE (source_id=? AND target_id=?) OR (source_id=? AND target_id=?)',cid,p.id,p.id,cid).map(r=>clip(r.description,600)).filter(Boolean);
    const events=sharedEvents(cid);
    return notes.length||events.length?{notes,events}:null;
  }
  const markEvents=(cid,events,orderId)=>{for(const e of events)run('INSERT OR IGNORE INTO character_order_events VALUES(?,?,?,?)',e.event_id,cid,orderId,iso());};
  // First start of this feature: the events that already exist are not new.
  if(eventsTableNew&&hasStory()){const p=palor();if(p)for(const r of all('SELECT DISTINCT o.character_id cid FROM story_event_participants o JOIN story_event_participants q ON q.event_id=o.event_id AND q.character_id=? WHERE o.character_id<>?',p.id,p.id))markEvents(r.cid,sharedEvents(r.cid),null);}

  // Scene definitions of an order: the stored ones (life orders) or the fixed Szereplőgyár list.
  const defOf=(o,key)=>{const sc=o.steps.gallery.scenes?.[key];return sc?(sc.def?{key,...sc.def}:GALLERY_SCENES.find(s=>s.key===key)||null):null;};
  const sceneKeys=o=>Object.keys(o.steps.gallery.scenes||{});
  const sceneEntry=s=>({state:'open',content:s.content,def:{set:s.set,label:s.label,purpose:s.purpose,idea:s.idea}});
  const save=o=>{const status=['profile','avatars','gallery'].every(k=>!o.steps[k]||['done','skipped'].includes(o.steps[k].state))?'done':o.status==='cancelled'?'cancelled':'open';
    run('UPDATE character_orders SET steps_json=?,status=?,updated_at=? WHERE id=?',JSON.stringify(o.steps),status,iso(),o.id);o.status=status;return o;};
  const folderOf=cid=>one('SELECT folder FROM sorted_folders WHERE character_id=? ORDER BY rowid LIMIT 1',cid)?.folder||null;
  // Source pictures are recorded per order; orders from before that are found by the old "forras-<n>" name.
  // Life orders compare faces with his approved canon references.
  const canonRefs=cid=>{let refs=[];try{refs=JSON.parse(one('SELECT references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid)?.references_json||'[]');}catch{}
    const ids=(Array.isArray(refs)?refs:[]).map(r=>r?.media_id).filter(x=>typeof x==='string');
    return ids.map(id=>one("SELECT id,relative_path FROM active_media WHERE id=? AND kind='image'",id)).filter(Boolean).slice(0,12);};
  const sources=o=>kindOf(o)!=='new'?canonRefs(o.character_id):sourcesOfNew(o);
  const sourcesOfNew=o=>{const r=all("SELECT m.id,m.relative_path FROM character_order_sources s JOIN active_media m ON m.id=s.media_id WHERE s.order_id=? ORDER BY m.relative_path",o.id);
    return r.length||one('SELECT 1 FROM character_order_sources WHERE order_id=?',o.id)?r:all("SELECT m.id,m.relative_path FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE d.character_id=? AND m.kind='image' AND m.relative_path LIKE ? ORDER BY m.relative_path",o.character_id,'%forras-%');};

  // The owner's short note on a source picture → existing structured tags whose name (or a word the
  // owner mapped to a tag earlier) appears in it. Never creates tags. Hungarian suffixes are allowed
  // after names of 5+ letters ("erdő" is not matched by "erdőben", "tisztás" matches "tisztáson").
  // Longer names win and use up their words ("full body" does not also give "body"). Reference-role
  // labels (face/body/detail/general) are a review decision, never read from a note.
  function tagsFromNote(note){
    let text=' '+note.normalize('NFC').toLocaleLowerCase('hu')+' ';
    const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const words=[...all("SELECT id tag_id,name_key key FROM structured_tags WHERE group_id<>'group-reference'"),
      ...all("SELECT m.tag_id,m.source_key key FROM legacy_tag_mappings m JOIN structured_tags t ON t.id=m.tag_id WHERE t.group_id<>'group-reference'")]
      .filter(w=>w.key.length>=3).sort((a,b)=>b.key.length-a.key.length);
    const ids=new Set();
    for(const w of words){const re=new RegExp(`(?<![\\p{L}\\p{N}])${esc(w.key)}${w.key.length<5?'(?![\\p{L}\\p{N}])':''}`,'gu');
      if(re.test(text)){ids.add(w.tag_id);text=text.replace(re,m=>' '.repeat(m.length));}}
    return [...ids];
  }
  const noteOf=mid=>one('SELECT notes FROM media_notes WHERE media_id=?',mid)?.notes||'';
  const tagNames=mid=>all('SELECT t.name FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id WHERE mt.media_id=? ORDER BY t.name',mid).map(r=>r.name);

  // Writes bytes as a new catalogue picture of this character (never overwrites).
  async function addPicture(cid,relDir,base,bytes,ext,also=[]){
    const dir=path.join(root,relDir);await fs.mkdir(dir,{recursive:true});
    const real=await fs.realpath(dir);if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The folder points outside your resource folder.',403);
    let n=1,file;for(;;n++){file=path.join(real,`${base}-${n}.${ext}`);try{await fs.writeFile(file,bytes,{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST'||n>500)throw e;}}
    const rel=path.relative(await fs.realpath(root),file),st=await fs.stat(file),mid=randomUUID();
    transaction(()=>{run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',mid,rel,catalogueFolder(root,rel),'image',st.size,st.mtime.toISOString(),iso());for(const id of [cid,...also])run('INSERT OR IGNORE INTO depictions VALUES(?,?)',mid,id);});
    return {media_id:mid,relative_path:rel};
  }

  async function create(body){
    const name=typeof body?.name==='string'?body.name.trim().normalize('NFC'):'';
    if(!name||name.length>80||/[\\/:*?"<>|]/.test(name))throw fail('Give a name of 1–80 characters without file-name special characters.');
    const description=typeof body.description==='string'?body.description.trim().slice(0,4000):'';
    assertAdultMan(name+'\n'+description,fail);characterPolicy?.assertPrompt?.(name+'\n'+description);
    const pictures=Array.isArray(body.pictures)?body.pictures:[];
    if(!pictures.length||pictures.length>12)throw fail('Attach 1–12 pictures.');
    const decoded=pictures.map(p=>{const m=String(p?.data_url||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw fail('Attach PNG, JPEG or WebP pictures.');
      const bytes=Buffer.from(m[2],'base64'),ext=sniff(bytes);if(!ext||bytes.length>20*1024*1024)throw fail('Attach PNG, JPEG or WebP pictures.');
      const note=typeof p.note==='string'?p.note.trim().normalize('NFC').replace(/\s+/g,' ').slice(0,200):'';
      // The owner marks each picture (hétköznapi / félmeztelen / meztelen / szex = non_intimate /
      // shirtless / nudity / sexual_activity); it is named and marked by it. Older callers send one source_content.
      const content=p.content??body.source_content??'non_intimate';
      if(!CONTENT_WORD[content])throw fail('source_content is non_intimate, shirtless, nudity or sexual_activity.');
      return {bytes,ext,note,content};});
    for(const d of decoded)if(d.note){assertAdultMan(d.note,fail);characterPolicy?.assertPrompt?.(d.note);}
    // Gallery: the ticked scene sets (base set alone, shared set with Palor). The older free count
    // (gallery + gallery_count) still works for API callers.
    const sets=['solo','palor'].filter(s=>body[s==='solo'?'solo_set':'with_palor']===true);
    if(sets.includes('palor')&&!palor())throw fail('Palor is not in the world yet, so shared pictures cannot be ordered.',409);
    const scenes=GALLERY_SCENES.filter(s=>sets.includes(s.set));
    // Each scene's content level is the owner's choice (default everyday).
    const sceneContent=body.scene_content&&typeof body.scene_content==='object'?body.scene_content:{};
    for(const s of scenes)if(sceneContent[s.key]!==undefined&&!CONTENT_WORD[sceneContent[s.key]])throw fail('source_content is non_intimate, shirtless, nudity or sexual_activity.');
    const want={profile:body.profile!==false,avatars:body.avatars!==false,gallery:scenes.length>0||body.gallery===true};
    const gallery=scenes.length||Math.max(1,Math.min(20,Number(body.gallery_count)||6));
    const cid=randomUUID();
    const {folder}=await folderSync.createCharacterWithFolder(cid,name,'férfi');
    // Into his own folder (10_CHARACTERS\<név>\), named by the Új képek rule:
    // "<Név> - forrás - hetkoznapi - 2026-11-14-1.png".
    const id=randomUUID();
    const added=[];for(const d of decoded){const pic=await addPicture(cid,folder,galleryStem({name,label:'forrás',content:d.content,date:iso().slice(0,10)}),d.bytes,d.ext);added.push(pic);
      run('INSERT INTO character_order_sources VALUES(?,?)',id,pic.media_id);
      run('INSERT INTO play_content(media_id,level,set_at) VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET level=excluded.level,set_at=excluded.set_at',pic.media_id,d.content,iso());
      if(d.note){run("INSERT INTO media_notes(media_id,tags,notes) VALUES(?,'',?) ON CONFLICT(media_id) DO UPDATE SET notes=excluded.notes",pic.media_id,d.note);
        for(const tid of tagsFromNote(d.note))run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',pic.media_id,tid);}}
    const steps={profile:want.profile?{state:'open'}:{state:'skipped'},avatars:want.avatars?{state:'waiting',have:0,want:AVATAR_COUNT,checks:{}}:{state:'skipped'},
      gallery:want.gallery?{state:'waiting',have:0,want:gallery,refused:0,rejected:[],...(scenes.length?{scenes:Object.fromEntries(scenes.map(s=>[s.key,{state:'open',content:sceneContent[s.key]||'non_intimate'}]))}:{})}:{state:'skipped'}};
    run('INSERT INTO character_orders VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,cid,description,+want.profile,+want.avatars,+want.gallery,gallery,'open',JSON.stringify(steps),iso(),iso());
    return view(await refresh(orderOf(id)));
  }

  // ---- face check -------------------------------------------------------------------------------
  const faceAvailable=()=>!!analyse&&(!analyse.available||analyse.available());
  async function refVectors(o){
    const out=[];
    for(const s of sources(o)){
      let row=one('SELECT vector FROM character_order_faces WHERE order_id=? AND media_id=?',o.id,s.id);
      if(!row){let vec=null;try{const r=await analyse(path.join(root,s.relative_path));const f=(r.faces||[]).filter(x=>x.px>=MIN_FACE_PX&&x.score>=MIN_DET).sort((a,b)=>b.px-a.px)[0];if(f)vec=Buffer.from(f.embedding,'base64');}catch{}
        run('INSERT OR REPLACE INTO character_order_faces VALUES(?,?,?)',o.id,s.id,vec);row={vector:vec};}
      if(row.vector)out.push(new Float32Array(row.vector.buffer.slice(row.vector.byteOffset,row.vector.byteOffset+row.vector.byteLength)));
    }
    return out;
  }
  async function faceCheck(o,file){
    if(!faceAvailable())return {state:'unchecked',reason:'A helyi arcellenőrző nincs telepítve.'};
    const refs=await refVectors(o);if(!refs.length)return {state:'unchecked',reason:'A csatolt képeken nem található arc.'};
    let r;try{r=await analyse(file);}catch(e){return {state:'unchecked',reason:'Az arcellenőrzés nem sikerült: '+(e.code||e.message)};}
    const faces=(r.faces||[]).filter(x=>x.px>=MIN_FACE_PX&&x.score>=MIN_DET);
    if(!faces.length)return {state:'no_face',reason:'Nem látszik jól felismerhető arc.'};
    const best=Math.max(...faces.map(f=>{const v=vectorOf(f);return refs.reduce((s,x)=>s+cosine(v,x),0)/refs.length;}));
    const score=Math.round(best*1000)/1000;
    return score>=FACE_PASS?{state:'ok',score}:{state:'mismatch',score,reason:`Az arc nem egyezik a csatolt képekkel (${score} < ${FACE_PASS}).`};
  }

  // No collection-origin gate here (owner, 2026-11-16): the owner checks origins himself; the content
  // level he picks for each picture or scene is what is made.

  // ---- progress -----------------------------------------------------------------------------------
  // Recounts the avatars (checking new or changed figures) and the profile; saves the order.
  async function refresh(o){
    if(!o||o.status!=='open')return o;
    const s=o.steps;
    if(s.profile.state!=='skipped'){const g=ghostProfiles.get(o.character_id),gaps=profileGaps(g.values,g.template.fields);
      if(gaps.complete)s.profile={...s.profile,state:'done',missing:[],weak:[]};else if(s.profile.state==='done')s.profile={...s.profile,state:'returned',...gaps};else s.profile={...s.profile,missing:gaps.missing,weak:gaps.weak};}
    const profileReady=s.profile.state==='done'||s.profile.state==='skipped';
    if(s.avatars.state!=='skipped'){
      const sprites=all('SELECT id,expression,outfit,relative_path,updated_at FROM character_sprites WHERE character_id=? AND coalesce(missing,0)=0',o.character_id);
      for(const sp of sprites){const key=sp.expression+'/'+(sp.outfit||'dressed'),old=s.avatars.checks[key];
        if(!ORDER_OUTFITS.includes(sp.outfit||'dressed'))continue;
        if(old&&old.updated_at===sp.updated_at)continue;
        const r=await faceCheck(o,path.join(root,sp.relative_path));s.avatars.checks[key]={updated_at:sp.updated_at,...r};}
      const good=Object.values(s.avatars.checks).filter(c=>c.state==='ok'||c.state==='unchecked').length;
      s.avatars.have=good;
      s.avatars.state=!profileReady?'waiting':good>=s.avatars.want?'done':'open';
    }
    if(s.gallery.state!=='skipped')s.gallery.state=!profileReady?'waiting':s.gallery.have+s.gallery.refused>=s.gallery.want?'done':'open';
    return save(o);
  }

  function view(o){
    if(!o)return null;
    const c=one('SELECT name FROM characters WHERE id=?',o.character_id);
    const tpl=ghostProfiles.get(o.character_id).template.fields;
    const label=id=>tpl.find(f=>f.id===id)?.label||id;
    const avatarsMissing=[];
    if(o.steps.avatars.state!=='skipped')for(const outfit of ORDER_OUTFITS)for(const e of rowExpressions(outfit)){const k=e.file+'/'+outfit,ch=o.steps.avatars.checks[k];if(!ch||!['ok','unchecked'].includes(ch.state))avatarsMissing.push({expression:e.file,outfit,...(ch?{redo:true,reason:ch.reason,score:ch.score??null}:{})});}
    const kind=kindOf(o),rel=kind!=='new'?relationOf(o.character_id):null;
    return {order_id:o.id,character_id:o.character_id,name:c?.name||'?',kind,description:o.description,status:o.status,created_at:o.created_at,updated_at:o.updated_at,
      ...(kind!=='new'?{relationship_with_palor:rel?{notes:rel.notes,events:rel.events.map(({event_id,...e})=>e)}:'none recorded: do not invent one',
        identity:'His approved references (source_pictures) and get_character_visual_pack; his life from get_ghost_profile (weekly_routine, habits, occupation, residence, identity).'}:{}),
      source_pictures:sources(o).map(s=>{const note=noteOf(s.id),tags=tagNames(s.id);return {media_id:s.id,fetch_with:'get_media',...(note?{owner_note:note}:{}),...(tags.length?{tags}:{})};}),
      profile:{state:o.steps.profile.state,missing_fields:(o.steps.profile.missing||[]).map(id=>({id,label:label(id)})),weak_fields:(o.steps.profile.weak||[]).map(id=>({id,label:label(id)}))},
      avatars:{state:o.steps.avatars.state,have:o.steps.avatars.have||0,want:o.steps.avatars.want||0,missing:avatarsMissing},
      gallery:{state:o.steps.gallery.state,have:o.steps.gallery.have||0,want:o.steps.gallery.want||0,refused:o.steps.gallery.refused||0,rejected:(o.steps.gallery.rejected||[]).slice(-10),
        ...(o.steps.gallery.scenes?{scenes:sceneKeys(o).map(k=>defOf(o,k)).filter(Boolean).map(s=>({scene:s.key,label:s.label,with_palor:s.set==='palor',purpose:s.purpose,default_idea:s.idea,
          content:o.steps.gallery.scenes[s.key].content,state:o.steps.gallery.scenes[s.key].state}))}:{})},
      face_check:faceAvailable()?'local':'not installed'};
  }

  // Characters a life order can be made for (not Palor, not merged away), with what is recorded.
  const merged=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_ui'");
  function lifeCandidates(){
    const p=palor();
    return all(`SELECT c.id,c.name FROM characters c${merged?' LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL':''} ORDER BY c.name COLLATE NOCASE`)
      .filter(c=>!p||c.id!==p.id).map(c=>({id:c.id,name:c.name,is_group:!!one('SELECT 1 FROM character_groups WHERE character_id=?',c.id),relationship:!!relationOf(c.id),
        open_life:all("SELECT steps_json FROM character_orders WHERE character_id=? AND status='open'",c.id).some(r=>JSON.parse(r.steps_json).kind==='life')}));
  }
  // A life-moment order for an existing character (owner form or batch).
  function insertLifeOrder(cid,kind,scenes,description){
    const id=randomUUID(),steps={kind,profile:{state:'skipped'},avatars:{state:'skipped'},
      gallery:{state:'open',have:0,want:scenes.length,refused:0,rejected:[],scenes:Object.fromEntries(scenes.map(s=>[s.key,sceneEntry(s)]))}};
    run('INSERT INTO character_orders VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,cid,description,0,0,1,scenes.length,'open',JSON.stringify(steps),iso(),iso());
    return id;
  }
  async function createLife(body){
    const p=palor();
    let ids=body?.all===true?lifeCandidates().map(r=>r.id):Array.isArray(body?.character_ids)?body.character_ids:[];
    ids=[...new Set(ids)].filter(id=>typeof id==='string');
    if(!ids.length||ids.length>500)throw fail('Choose at least one character.');
    const want={daily:body.daily!==false,palor:body.palor!==false,shirtless:body.shirtless!==false};
    if(!want.daily&&!want.palor&&!want.shirtless)throw fail('Tick at least one picture set.');
    const made=[],skipped=[];
    for(const cid of ids){
      const c=one('SELECT id,name FROM characters WHERE id=?',cid);if(!c){skipped.push({character_id:cid,reason:'unknown'});continue;}
      if(p&&c.id===p.id){skipped.push({name:c.name,reason:'palor'});continue;}
      if(all("SELECT steps_json FROM character_orders WHERE character_id=? AND status='open'",cid).some(r=>JSON.parse(r.steps_json).kind==='life')){skipped.push({name:c.name,reason:'open'});continue;}
      const relation=relationOf(cid),scenes=lifeScenes({...want,relation});
      if(!scenes.length){skipped.push({name:c.name,reason:'no_relationship'});continue;}
      const id=insertLifeOrder(cid,'life',scenes,'');if(relation)markEvents(cid,relation.events,id);
      made.push(view(await refresh(orderOf(id))));
    }
    return {made,skipped};
  }
  // A new approved shared event with Palor → one picture of that moment (new events only).
  async function scanEvents(){
    const p=palor();if(!p||!hasStory())return;
    const cids=all('SELECT DISTINCT o.character_id cid FROM story_event_participants o JOIN story_event_participants q ON q.event_id=o.event_id AND q.character_id=? WHERE o.character_id<>?',p.id,p.id).map(r=>r.cid);
    for(const cid of cids){
      const fresh=sharedEvents(cid).filter(e=>!one('SELECT 1 FROM character_order_events WHERE event_id=? AND character_id=?',e.event_id,cid));
      if(!fresh.length||!one('SELECT 1 FROM characters WHERE id=?',cid))continue;
      const scenes=fresh.slice(-5).map(e=>({key:'event_'+e.event_id.replace(/[^a-z0-9]/gi,'').slice(0,12),set:'palor',label:'közös pillanat',purpose:'shared photos, diary',content:'non_intimate',
        idea:`the recorded event "${e.title}": ${e.summary}`}));
      const id=insertLifeOrder(cid,'palor_event',scenes,'Új közös esemény Palorral: '+fresh.map(e=>e.title).join('; ').slice(0,400));
      markEvents(cid,fresh,id);
    }
  }

  async function list({open_only=false}={}){
    await scanEvents();
    const rows=all(`SELECT id FROM character_orders ${open_only?"WHERE status='open'":''} ORDER BY created_at DESC LIMIT 100`);
    const out=[];for(const r of rows)out.push(view(await refresh(orderOf(r.id))));return out;
  }

  // Grok's proposal for an order character: accepted at once, then the profile is checked.
  function afterProposal(cid,proposal){
    const o=openOrderFor(cid);if(!o||o.steps.profile.state==='skipped'||o.steps.profile.state==='done'||proposal?.status!=='pending')return null;
    const g=ghostProfiles.get(cid);
    const accepted=ghostProfiles.decide(cid,proposal.id,{expected_version:g.version,decision:'accept',values:proposal.values},'szereplogyar-auto');
    const gaps=profileGaps(accepted.values,accepted.template.fields);
    o.steps.profile={...o.steps.profile,state:gaps.complete?'done':'returned',missing:gaps.missing,weak:gaps.weak,model:proposal.model,at:iso()};save(o);
    const label=id=>accepted.template.fields.find(f=>f.id===id)?.label||id;
    return {...proposal,status:'accepted',character_order:{order_id:o.id,accepted_automatically:true,profile_complete:gaps.complete,
      missing_fields:gaps.missing.map(id=>({id,label:label(id)})),weak_fields:gaps.weak.map(id=>({id,label:label(id)})),
      next:gaps.complete?'Profile complete. Continue with the next order.':'Fill the listed fields with real, specific text (no "ismeretlen") and call propose_ghost_profile again with the current versions.'}};
  }

  async function savePicture(a,imageBytes){
    const o=typeof a?.order_id==='string'?orderOf(a.order_id):null;
    if(!o||o.status!=='open'||o.steps.gallery.state==='skipped')throw fail('This order has no open gallery.',404);
    await refresh(o);if(o.steps.gallery.state==='waiting')throw fail('The gallery waits for the profile.',409);
    if(o.steps.gallery.state==='done')throw fail('The gallery of this order is complete.',409);
    // Scene orders: every picture names its open scene; content and label come from the scene.
    const sc=o.steps.gallery.scenes,scene=sc&&typeof a.scene==='string'?defOf(o,a.scene):null;
    if(sc&&!scene)throw fail('scene is one of the open scenes of this order: '+sceneKeys(o).filter(k=>sc[k].state==='open').join(', ')+'.');
    if(scene&&sc[scene.key].state!=='open')throw fail('This scene is already done.',409);    if(a.outcome==='refused'){o.steps.gallery.refused++;o.steps.gallery.rejected.push({at:iso(),...(scene?{scene:scene.key}:{}),reason:'Elutasítva: '+String(a.note||'').slice(0,300)});if(scene)sc[scene.key].state='refused';save(o);await refresh(o);return {saved:false,refused_recorded:true,gallery:view(o).gallery};}
    const content=scene?sc[scene.key].content:LEVELS.includes(a.content)?a.content:'non_intimate';
    const withPalor=scene?.set==='palor'?palor():null;if(scene?.set==='palor'&&!withPalor)throw fail('Palor is not in the world yet, so shared pictures cannot be saved.',409);    if(typeof a.prompt==='string'){assertAdultMan(a.prompt,fail);characterPolicy?.assertPrompt?.(a.prompt);}
    // Name parts (checked before any download): his name, an optional place from the location tree,
    // an optional short label; the label must not read as a person or a content word.
    const who=one('SELECT name FROM characters WHERE id=?',o.character_id)?.name||'';
    const loc=a.location_id!==undefined?one('SELECT name FROM locations WHERE id=?',String(a.location_id)):null;
    if(a.location_id!==undefined&&!loc)throw fail('Unknown location_id (see list_locations).',404);
    if(a.label!==undefined&&(typeof a.label!=='string'||!/^[\p{L}\p{N} ]{1,40}$/u.test(a.label.trim())))throw fail('label is up to 40 letters, digits or spaces.');
    const label=a.label?.trim().replace(/\s+/g,' ')||'';
    if(label){const r=readName({file:label+'.png',characters:all('SELECT id,name FROM characters')});if(r.people.length||r.content||r.problem?.code==='ambiguous')throw fail('label cannot be a character name or a content word.');}
    // Shared scenes: "Palor + <Név> - …" (Palor first, as the Új képek rule writes it).
    const stem=galleryStem({name:withPalor?withPalor.name+' + '+who:who,place:loc?.name,label:scene?(label?scene.label+' '+label:scene.label):label,content,date:iso().slice(0,10)});
    if(stem.length>200)throw fail('The name parts are too long for one file name.');
    const got=await imageBytes({...(a.image!==undefined?{image:a.image}:{}),...(a.url!==undefined?{url:a.url}:{}),...(a.media_id!==undefined?{media_id:a.media_id}:{})});
    const ext=sniff(got.bytes);if(!ext)throw fail('Attach PNG, JPEG or WebP pictures.');
    const tmpDir=path.join(dataDir,'tmp');await fs.mkdir(tmpDir,{recursive:true});
    const tmp=path.join(tmpDir,'order-'+o.id+'-'+randomUUID()+'.'+ext);await fs.writeFile(tmp,got.bytes);
    try{
      const face=await faceCheck(o,tmp);
      if(face.state==='mismatch'||face.state==='no_face'){o.steps.gallery.rejected.push({at:iso(),...(scene?{scene:scene.key}:{}),reason:face.reason,score:face.score??null});save(o);
        return {saved:false,face,next:'Not kept: make a new picture of the same man (use the source pictures) and send it again.'};}
      // An existing character without his own folder gets one (same-name folder reused, no conflicts).
      const folder=folderOf(o.character_id)||(await folderSync.createCharacterWithFolder(o.character_id,who,'férfi')).folder;if(!folder)throw fail('The character has no folder.',409);
      const pic=await addPicture(o.character_id,path.join(folder,'Galéria'),stem,got.bytes,ext,withPalor?[withPalor.id]:[]);
      run('INSERT INTO play_content(media_id,level,set_at) VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET level=excluded.level,set_at=excluded.set_at',pic.media_id,content,iso());
      o.steps.gallery.have++;if(scene)sc[scene.key]={...sc[scene.key],state:'done',media_id:pic.media_id};save(o);await refresh(o);
      return {saved:true,media_id:pic.media_id,file:path.basename(pic.relative_path),face,gallery:view(o).gallery};
    }finally{await fs.rm(tmp,{force:true});}
  }

  function cancel(id){const o=orderOf(id);if(!o)throw fail('Order not found.',404);run("UPDATE character_orders SET status='cancelled',updated_at=? WHERE id=?",iso(),id);return view(orderOf(id));}

  async function handle({p,req,body,json}){
    if(p==='/api/character-orders'&&req.method==='GET'){json({orders:await list(),face_check:faceAvailable()?'local':'not installed'});return true;}
    if(p==='/api/character-orders'&&req.method==='POST'){json(await create(body||{}),201);return true;}
    if(p==='/api/character-orders/life'&&req.method==='GET'){json({characters:lifeCandidates()});return true;}
    if(p==='/api/character-orders/life'&&req.method==='POST'){json(await createLife(body||{}),201);return true;}
    const m=p.match(/^\/api\/character-orders\/([0-9a-f-]{36})(\/cancel)?$/);
    if(m&&req.method==='GET'&&!m[2]){const o=orderOf(m[1]);if(!o)throw fail('Order not found.',404);json(view(await refresh(o)));return true;}
    if(m&&req.method==='POST'&&m[2]){json(cancel(m[1]));return true;}
    return false;
  }
  // Connector operations (via /api/mcp-backgrounds).
  const ops=imageBytes=>({
    // Who does what (owner, 2026-11-14): the profile is Grok's, avatars and gallery are ChatGPT's.
    // for:'grok' / 'chatgpt' returns only that assistant's part, so neither starts the other's work.
    orders_list:{run:async a=>{const who=a?.for;if(who!==undefined&&!['grok','chatgpt'].includes(who))throw fail('for is grok or chatgpt.');
      const all_=await list({open_only:true}),how=HOW;
      if(!who)return {open:all_.length,orders:all_,who_does_what:WHO,how};
      if(who==='grok'){const orders=all_.filter(o=>!['done','skipped'].includes(o.profile.state)).map(({avatars,gallery,...o})=>o);
        return {for:'grok',open:orders.length,orders,your_part:'profile only',not_yours:'Avatars and gallery pictures are made by ChatGPT. Never start figure jobs, generate pictures or call save_order_picture for these orders, and do not say you will continue with them.',how:{profile:how.profile}};}
      const orders=all_.filter(o=>!['done','skipped'].includes(o.avatars.state)||!['done','skipped'].includes(o.gallery.state)).map(({profile,...o})=>({...o,profile_state:profile.state}));
      return {for:'chatgpt',open:orders.length,orders,your_part:'avatars and gallery',not_yours:'The profile is written by Grok. Do not propose or edit profiles. While profile_state is not done, avatars and gallery wait: skip that order and tell the owner it waits for Grok.',how:{avatars:how.avatars,gallery:how.gallery}};}},
    order_picture_save:{write:true,run:a=>savePicture(a||{},imageBytes)},
  });
  const WHO={profile:'Grok',avatars:'ChatGPT',gallery:'ChatGPT',rule:'Do only your own part; call list_character_orders with for:"grok" or for:"chatgpt".'};
  const HOW={
      profile:'Read get_ghost_profile with include_admin_notes:true and get_profile_template; look at the source pictures with get_media (owner_note is the owner\'s own short description of that picture: trust it over your reading of the picture); then propose_ghost_profile with the current versions. For these characters it is accepted at once and checked: fill every field except birth_date and origin with real, specific Hungarian text, including the sexual fields; adult male only. A non-human, monster or fantasy being is allowed when he is male (hím): describe him as what he is, never turn him into a human.',
      avatars:'When profile is done: get_character_visual_pack, then start_generation_job target figure for each missing {expression, outfit}, generate natively, finish_generation_job. Rows: dressed (full body), shirtless (full body, bare upper body, his trousers and shoes kept) and intimate (only alap, mosoly, flortol: waist-up, bare upper body, the frame ends just below the navel so no clothing at all is visible; the game fades it out at the waist). A figure listed with redo:true failed the face check: make it again.',
      gallery:'Orders of kind "life" (life moments of an existing character) and "palor_event" (a new recorded event with Palor) have no profile step: start at once. His identity comes from his approved references (source_pictures, get_character_visual_pack); the daily scenes follow his recorded weekly_routine, habits, occupation and residence; the Palor scenes follow relationship_with_palor exactly (its notes and events) and never invent a meeting, an event or a closer bond. Shirtless scenes: bare upper body, trousers on, the listed everyday activity (not a beach), never sexual. When profile is done (new characters). First read the order description and his profile (get_ghost_profile) and the owner notes on the source pictures, and work out who he is: species or kind of being, body, abilities, world, era, way of life. He may be a non-human male (a monster, a fantasy being): draw him as what he is, never as a human. If gallery.scenes is listed, make one picture per scene whose state is "open": keep the scene\'s purpose (where the game uses it) but adapt its default_idea to him; if the idea does not fit who he is (a humanoid monster does not take a selfie, someone without a home has no "home"), choose a fitting moment with the same purpose instead (for a selfie: a close, candid shot as if a companion took it). Never add features his description does not support. with_palor:true scenes show Palor and him together (Palor from his own references). content is the owner\'s choice for that scene: non_intimate = everyday, nudity = shirtless/flirt, sexual_activity = intimate between the two adult males; never go beyond it. Save with save_order_picture {order_id, scene, image}; optional location_id (list_locations) and label (one extra short word). The file is named by the Új képek rule ("[Palor + ]<name> - [place] - <scene label> - <content word> - <date>-<n>.png"). Without gallery.scenes (older orders): save_order_picture with content of your choice. A picture that does not match his face is not kept. If the generator declines, call save_order_picture with outcome "refused", the scene and its reason; never reword to get around a refusal.'};
  return {create,list,afterProposal,savePicture,refresh,handle,ops,faceCheck,view:id=>view(orderOf(id))};
}
