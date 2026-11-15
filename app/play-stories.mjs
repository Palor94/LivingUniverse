// Interactive pop-up stories for Play (2026-11-13, owner request): short branching stories with
// A–D choices that can happen on the road between two towns, or inside Káloz, Székesfehérvár
// and Budapest. The owner writes or generates them (docs/GROK_STORIES_PROMPT.md) and loads them
// on the Play settings screen. Stories are text only: the strangers in them are one-off story
// figures, never characters in the catalogue; nothing here touches canon, profiles or memories.
// A finished run is kept (which story, path, ending) so the same story does not come back soon.
import {randomUUID} from 'node:crypto';
import {readdirSync,statSync,createReadStream,promises as fs} from 'node:fs';
import path from 'node:path';

// Story pictures (2026-11-13, owner request): a smaller picture beside the text showing the
// story's stranger(s), face and body: one when Palor meets them, and in flirt/sexual stories one
// when the mood heats up (shirtless, or shirtless with the trousers unbuttoned). Files only, in
//   20_SHARED_MEDIA/Játék sztorik/<story id>/<block id>.png        meeting picture
//   20_SHARED_MEDIA/Játék sztorik/<story id>/<block id>-forro.png  heated picture (adult switch only)
// (.jpg/.webp work too). The picture of a block stays beside the text until a later block has its
// own. Not catalogue media: the scan skips the folder; earlier files are kept as "(régi …)".
// Strangers are one-off story figures, never characters; nothing touches canon or profiles.
export const STORY_PICTURE_DIR=['20_SHARED_MEDIA','Játék sztorik'];
const PICTURE_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const PICTURE_NAME=/^([A-Za-z0-9_-]{1,30}?)(-forro)?\.(png|jpe?g|webp)$/i;
// Hand saving from the Grok app (2026-11-13): everything into the one folder, no subfolders:
//   20_SHARED_MEDIA/Játék sztorik/<story id> - <block>.png  (and "<story id> - <block>-forro.png")
// A picture in the story's own subfolder wins over a flat one of the same block and kind.
const FLAT_NAME=/^([a-z0-9][a-z0-9-]{1,59}) - ([A-Za-z0-9_-]{1,30}?)(-forro)?\.(png|jpe?g|webp)$/i;

export const STORY_SETTINGS=['road','kaloz','szekesfehervar','budapest'];
export const STORY_CONTENT=['everyday','flirt','sexual'];
export const STORY_SLOTS=['reggel','delutan','este','ejszaka'];
export const STORY_RATES={off:0,rare:0.15,normal:0.3,often:0.6};
const KEYS=['A','B','C','D'];
// How a story's trip is made (owner, 2026-11-14): car, foot, bike, train or any. A story about a
// train or a station counts as a train story even if it says otherwise; one about a bicycle as a
// bike story. Which stories fit which way of travelling:
export const STORY_TRANSPORTS=['car','foot','bike','train','any'];
const TRAIN_WORDS=/vonat|kalauz|pályaudvar|vasútállomás|peron|szerelvény|fülké/i,BIKE_WORDS=/bicikli|bringa|kerékpár/i;
export function transportOf(story){
  const text=JSON.stringify([story?.title,story?.summary,story?.nodes?.[story?.start]?.text]);
  if(story?.transport==='train'||TRAIN_WORDS.test(text))return 'train';
  if(story?.transport==='bike'||BIKE_WORDS.test(text))return 'bike';
  return story?.transport||'any';
}
const STORY_FITS={foot:new Set(['foot','any']),bike:new Set(['bike','foot','any']),car:new Set(['car','any']),train:new Set(['train'])};
const MODE_CHANCE={bike:1.4,car:0.7,train:1,foot:1};
const ID=/^[a-z0-9][a-z0-9-]{1,59}$/;
// Hard limits the owner set for every character: adults only, and no women in the game.
// Kept as plain word checks so a story is refused with the exact word, never silently changed.
export const MINOR=/(?:^|[^\p{L}])(?:kiskorú\p{L}*|gyerek\p{L}*|kisfiú\p{L}*|kamasz\p{L}*|tinédzser\p{L}*|gimnazista\p{L}*|általános iskolás\p{L}*|(?:1[0-7]|[1-9]) ?éves(?:ek)?)(?=$|[^\p{L}])/iu;
export const FEMALE=/(?:^|[^\p{L}])(?:nő|nők|nőt|női|nőnek|lány\p{L}*|asszony\p{L}*|csaj\p{L}*|néni\p{L}*|feleség\p{L}*|barátnő\p{L}*|nővér\p{L}*|anyuk\p{L}*|woman|women|girl\p{L}*|female)(?=$|[^\p{L}])/iu;
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
// Town stories belong to these towns (matched by name, accents ignored).
export const storyTownOf=name=>({kaloz:'kaloz',szekesfehervar:'szekesfehervar',budapest:'budapest'})[fold(name)]||null;

// Checks one story and returns the list of problems (empty = valid). Pure.
export function validateStory(s){
  const errors=[];const err=m=>{errors.push(m);};
  // The messages are shown to the owner as they are (Hungarian); field names stay as in the JSON.
  if(!s||typeof s!=='object'||Array.isArray(s))return ['Ez nem egy sztori-objektum.'];
  const allowed=new Set(['id','title','setting','content','slots','transport','summary','start','nodes']);
  for(const k of Object.keys(s))if(!allowed.has(k))err('Ismeretlen mező: '+k+'.');
  if(typeof s.id!=='string'||!ID.test(s.id))err('id: 2–60 kisbetű, számjegy vagy kötőjel.');
  if(typeof s.title!=='string'||!s.title.trim()||s.title.length>80)err('title: 1–80 karakter.');
  if(!STORY_SETTINGS.includes(s.setting))err('setting: ezek egyike: '+STORY_SETTINGS.join(', ')+'.');
  if(!STORY_CONTENT.includes(s.content))err('content: ezek egyike: '+STORY_CONTENT.join(', ')+'.');
  if(s.slots!==undefined&&(!Array.isArray(s.slots)||!s.slots.length||s.slots.some(x=>!STORY_SLOTS.includes(x))))err('slots: lista ezekből: '+STORY_SLOTS.join(', ')+'.');
  if(s.transport!==undefined&&!STORY_TRANSPORTS.includes(s.transport))err('transport: '+STORY_TRANSPORTS.join(', ')+'.');
  if(s.summary!==undefined&&(typeof s.summary!=='string'||s.summary.length>300))err('summary: legfeljebb 300 karakter.');
  const nodes=s.nodes;
  if(!nodes||typeof nodes!=='object'||Array.isArray(nodes))return [...errors,'nodes: a szövegblokkok objektuma kell.'];
  const ids=Object.keys(nodes);
  if(ids.length<8||ids.length>45)err('nodes: 8–45 szövegblokk kell (most '+ids.length+').');
  if(typeof s.start!=='string'||!nodes[s.start])err('start: egy létező szövegblokk neve kell.');
  const texts=[s.title,s.summary||''];
  for(const id of ids){
    const n=nodes[id];if(!/^[a-z0-9_-]{1,30}$/i.test(id))err('Blokkazonosító ('+id+'): betű, számjegy, - vagy _.');
    if(!n||typeof n!=='object'||Array.isArray(n)){err(id+': nem objektum.');continue;}
    for(const k of Object.keys(n))if(!['text','choices','ending'].includes(k))err(id+': ismeretlen mező: '+k+'.');
    if(typeof n.text!=='string'||!n.text.trim()||n.text.length>1200)err(id+': a text 1–1200 karakter.');else texts.push(n.text);
    if(n.ending!==undefined){
      if(!['good','neutral','bad','spicy'].includes(n.ending))err(id+': az ending értéke good, neutral, bad vagy spicy.');
      if(n.choices!==undefined)err(id+': befejezésnek nincs választása.');
      continue;
    }
    if(!Array.isArray(n.choices)||n.choices.length<2||n.choices.length>4){err(id+': 2–4 választás kell (vagy jelöld befejezésnek).');continue;}
    n.choices.forEach((c,i)=>{
      if(!c||typeof c!=='object'){err(id+': a(z) '+(i+1)+'. választás nem objektum.');return;}
      for(const k of Object.keys(c))if(!['key','text','to'].includes(k))err(id+': ismeretlen választásmező: '+k+'.');
      if(c.key!==KEYS[i])err(id+': a választások kulcsa sorban A, B, C, D.');
      if(typeof c.text!=='string'||!c.text.trim()||c.text.length>200)err(id+': a(z) '+KEYS[i]+' választás szövege 1–200 karakter.');else texts.push(c.text);
      if(!nodes[c.to])err(id+': a(z) '+KEYS[i]+' választás nem létező blokkra mutat: '+c.to+'.');
      if(c.to===id)err(id+': a(z) '+KEYS[i]+' választás önmagára mutat.');
    });
  }
  const all=texts.join('\n');
  const minor=all.match(MINOR);if(minor)err('Mindenki felnőtt kell legyen; elutasított szó: '+minor[0].trim()+'.');
  const female=all.match(FEMALE);if(female)err('A játékban csak férfiak szerepelnek; elutasított szó: '+female[0].trim()+'.');
  if(errors.length)return errors;
  // Shape: every block reachable, no loops, at least two endings, a real journey.
  const seen=new Set(),state=new Map();let cycle=false;const depth=new Map();
  const visit=id=>{if(state.get(id)===1){cycle=true;return 0;}if(state.get(id)===2)return depth.get(id);state.set(id,1);seen.add(id);
    let d=1;for(const c of nodes[id].choices||[])d=Math.max(d,1+visit(c.to));state.set(id,2);depth.set(id,d);return d;};
  const longest=visit(s.start);
  if(cycle)err('A sztori körbe fut; minden útnak befejezéshez kell érnie.');
  const lost=ids.filter(id=>!seen.has(id));if(lost.length)err('Elérhetetlen blokkok: '+lost.join(', ')+'.');
  if(ids.filter(id=>nodes[id].ending).length<2)err('Legalább két befejezés kell.');
  if(!cycle&&longest<5)err('A leghosszabb út '+longest+' blokk; legalább 5 kell.');
  return errors;
}

export function installPlayStories({db,one,all,run,transaction,fail,settings,characterPolicy=null,random=Math.random,now=()=>new Date(),root=null}){
  db.exec(`CREATE TABLE IF NOT EXISTS play_stories(id TEXT PRIMARY KEY,setting TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,story_json TEXT NOT NULL,source TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS play_story_runs(id TEXT PRIMARY KEY,story_id TEXT NOT NULL,setting TEXT NOT NULL,world_day TEXT,started_at TEXT NOT NULL,finished_at TEXT,ending_id TEXT,ending_kind TEXT,path_json TEXT);
    CREATE INDEX IF NOT EXISTS play_story_runs_story ON play_story_runs(story_id,started_at);`);
  const iso=()=>now().toISOString();
  const check=s=>{const errors=validateStory(s);if(!errors.length&&characterPolicy?.assertPrompt){try{characterPolicy.assertPrompt([s.title,...Object.values(s.nodes).flatMap(n=>[n.text,...(n.choices||[]).map(c=>c.text)])].join('\n'));}catch{errors.push('A szereplőszabály elutasította a sztorit (női szereplő).');}}return errors;};
  // Accepts a pasted Grok answer: a JSON array, {stories:[…]}, a single story, or JSON inside ``` fences.
  function parse(text){
    let t=String(text||'').trim();const fence=t.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)t=fence[1].trim();
    if(!t)throw fail('Paste the stories (JSON).');
    let v;try{v=JSON.parse(t);}catch(e){throw fail('This is not valid JSON: '+String(e.message).slice(0,160));}
    const list=Array.isArray(v)?v:Array.isArray(v?.stories)?v.stories:[v];
    if(!list.length||list.length>60)throw fail('Load 1–60 stories at once.');
    return list;
  }
  function importStories(body){
    const list=Array.isArray(body.stories)?body.stories:parse(body.text);
    if(list.length>60)throw fail('Load 1–60 stories at once.');
    const replace=body.replace===true,dry=body.dry_run===true,source=String(body.source||'Grok').slice(0,60)||'Grok';
    const ids=new Set();
    const results=list.map((s,i)=>{const errors=check(s);const id=typeof s?.id==='string'?s.id:'#'+(i+1);
      if(!errors.length&&ids.has(id))errors.push('Ez az id kétszer szerepel a csomagban.');ids.add(id);
      const exists=!!one('SELECT 1 FROM play_stories WHERE id=?',id);
      return {id,title:s?.title||'',setting:s?.setting||'',content:s?.content||'',blocks:s?.nodes&&typeof s.nodes==='object'?Object.keys(s.nodes).length:0,errors,status:errors.length?'invalid':exists&&!replace?'exists':exists?'replace':'new'};});
    if(!dry)transaction(()=>{for(const [i,r] of results.entries()){if(!['new','replace'].includes(r.status))continue;const s=list[i];
      if(r.status==='replace')run('UPDATE play_stories SET setting=?,title=?,content=?,story_json=?,source=?,updated_at=? WHERE id=?',s.setting,s.title.trim(),s.content,JSON.stringify(s),source,iso(),s.id);
      else run('INSERT INTO play_stories VALUES(?,?,?,?,?,?,1,?,?)',s.id,s.setting,s.title.trim(),s.content,JSON.stringify(s),source,iso(),iso());
      r.saved=true;}});
    return {dry_run:dry,results,saved:results.filter(r=>r.saved).length};
  }
  function list(){
    const stories=all(`SELECT s.id,s.setting,s.title,s.content,s.enabled,s.source,s.created_at,s.story_json,(SELECT count(*) FROM play_story_runs r WHERE r.story_id=s.id AND r.finished_at IS NOT NULL) runs FROM play_stories s ORDER BY s.setting,s.title`)
      .map(({story_json,...s})=>{const v=JSON.parse(story_json);return {...s,enabled:!!s.enabled,blocks:Object.keys(v.nodes).length,endings:Object.values(v.nodes).filter(n=>n.ending).length,slots:v.slots||null,summary:v.summary||''};});
    return {stories,rate:settings().story_rate||'normal'};
  }
  const storyOf=id=>{const r=one('SELECT story_json FROM play_stories WHERE id=?',id);return r?JSON.parse(r.story_json):null;};
  // ---- story pictures ----
  const pictureDir=storyId=>root&&ID.test(storyId)?path.join(root,...STORY_PICTURE_DIR,storyId):null;
  // {blockId:{meet?:file,heat?:file}} for the blocks that exist in the story.
  const usable=file=>{try{const st=statSync(file);return st.isFile()&&st.size<=25*1024*1024;}catch{return false;}};
  function pictureFiles(story){
    const dir=pictureDir(story.id);if(!dir)return {};
    const out={},top=path.dirname(dir);
    let flat=[];try{flat=readdirSync(top);}catch{}
    for(const f of flat.sort()){const m=f.match(FLAT_NAME);if(!m||m[1]!==story.id||!story.nodes[m[2]]||!usable(path.join(top,f)))continue;
      (out[m[2]]??={})[m[3]?'heat':'meet']=f;}
    let names=[];try{names=readdirSync(dir);}catch{}
    for(const f of names.sort()){const m=f.match(PICTURE_NAME);if(!m||!story.nodes[m[1]]||!usable(path.join(dir,f)))continue;
      (out[m[1]]??={})[m[2]?'heat':'meet']=f;}
    return out;
  }
  // What the pop-up gets: one picture per block, the heated one only with the adult switch on
  // (and then it wins over the meeting picture of the same block).
  function picturesFor(story){
    const adult=settings().adult!==false,out={};
    for(const [block,files] of Object.entries(pictureFiles(story))){
      const f=adult&&files.heat?files.heat:files.meet;if(!f)continue;
      out[block]={url:'/api/play/story-pictures/'+encodeURIComponent(story.id)+'/'+encodeURIComponent(f),heat:f===files.heat};
    }
    return out;
  }
  function startRun(story,worldDay){const id=randomUUID();run('INSERT INTO play_story_runs(id,story_id,setting,world_day,started_at) VALUES(?,?,?,?,?)',id,story.id,story.setting,worldDay||null,iso());return {run_id:id,story:{...story,pictures:picturesFor(story)}};}
  function servePicture(storyId,file,res){
    const own=String(file).match(PICTURE_NAME),flat=String(file).match(FLAT_NAME),sub=pictureDir(storyId);
    if(!sub||!res||!(own||flat&&flat[1]===storyId))throw fail('Picture not found.',404);
    if((own?own[2]:flat[3])&&settings().adult===false)throw fail('Picture not found.',404);
    const dir=own?sub:path.dirname(sub),full=path.join(dir,file);if(path.relative(dir,full).startsWith('..'))throw fail('Picture not found.',404);
    let st;try{st=statSync(full);}catch{throw fail('Picture not found.',404);}if(!st.isFile())throw fail('Picture not found.',404);
    res.writeHead(200,{'Content-Type':PICTURE_TYPES[path.extname(file).toLowerCase()],'Content-Length':st.size,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});
    createReadStream(full).pipe(res);
  }
  // What still needs a picture: every story with its blocks (text, choices) and the pictures it has.
  function pictureNeeds({story_id=null,limit=5,offset=0}={}){
    const rows=all('SELECT id,story_json FROM play_stories WHERE enabled=1'+(story_id?' AND id=?':'')+' ORDER BY setting,id',...(story_id?[story_id]:[])).map(r=>JSON.parse(r.story_json));
    if(story_id&&!rows.length)throw fail('Story not found',404);
    const items=rows.map(s=>{const files=pictureFiles(s),has=Object.values(files);
      const wantHeat=s.content!=='everyday';
      return {story:s,files,done:has.some(f=>f.meet)&&(!wantHeat||has.some(f=>f.heat))};}).sort((a,b)=>a.done-b.done);
    const n=Math.min(10,Math.max(1,Number(limit)||5)),o=Math.max(0,Number(offset)||0);
    return {incomplete_ids:items.filter(i=>!i.done).map(i=>i.story.id).sort(),total:items.length,missing:items.filter(i=>!i.done).length,offset:o,
      save_folder:path.join(...STORY_PICTURE_DIR),file_names:{meeting:'<story id> - <block id>.png',heated:'<story id> - <block id>-forro.png'},
      stories:items.slice(o,o+n).map(({story:s,files,done})=>({id:s.id,title:s.title,setting:s.setting,content:s.content,summary:s.summary||'',start:s.start,
        wants_heated_picture:s.content!=='everyday',complete:done,pictures:Object.fromEntries(Object.entries(files).map(([b,f])=>[b,{meeting:!!f.meet,heated:!!f.heat}])),
        nodes:Object.fromEntries(Object.entries(s.nodes).map(([id,nd])=>[id,nd.ending?{text:nd.text,ending:nd.ending}:{text:nd.text,choices:nd.choices.map(c=>({key:c.key,text:c.text,to:c.to}))}]))}))};
  }
  const CURSOR='play:story-picture-cursor';
  function pictureWork(){
    const all10=pictureNeeds({limit:1,offset:0}),missing=all10.missing;
    if(!missing)return {missing:0,note:'Every enabled story has its pictures.',stories:[]};
    const incomplete=all10.incomplete_ids;
    const last=one('SELECT value FROM application_settings WHERE key=?',CURSOR)?.value||'';
    const startAt=Math.max(0,incomplete.findIndex(id=>id>last));
    const ids=[...incomplete.slice(startAt),...incomplete.slice(0,startAt)].slice(0,3);
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',CURSOR,ids.at(-1));
    return {missing,note:'The next stories that still need pictures (call list_play_stories again for the next ones; it moves on by itself and starts over at the end). Save folder (no subfolders): '+all10.save_folder+'; meeting picture "<story id> - <block id>.png", heated picture "<story id> - <block id>-forro.png".',
      stories:ids.map(id=>pictureNeeds({story_id:id}).stories[0])};
  }
  async function savePicture(a,imageBytes){
    const story=typeof a?.story_id==='string'?storyOf(a.story_id):null;if(!story)throw fail('Story not found',404);
    if(typeof a.node_id!=='string'||!story.nodes[a.node_id])throw fail('Unknown story block.',400);
    const heat=a.heated===true;
    if(heat&&story.content==='everyday')throw fail('Heated pictures belong only to flirt or sexual stories.',400);
    const prompt=typeof a.prompt==='string'?a.prompt.slice(0,12000):'';
    const minor=prompt.match(MINOR),female=prompt.match(FEMALE);
    if(minor)throw fail('Everyone must be an adult; refused word: '+minor[0].trim(),400);
    if(female)throw fail('Only men appear in the game; refused word: '+female[0].trim(),400);
    if(prompt&&characterPolicy?.assertPrompt)characterPolicy.assertPrompt(prompt);
    const dir=pictureDir(story.id);if(!dir)throw fail('No media folder.',409);
    const got=await imageBytes({...(a.image!==undefined?{image:a.image}:{}),...(a.url!==undefined?{url:a.url}:{}),...(a.media_id!==undefined?{media_id:a.media_id}:{})});
    await fs.mkdir(dir,{recursive:true});
    const real=await fs.realpath(dir);if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The story picture folder points outside your resource folder.',403);
    const base=a.node_id+(heat?'-forro':'');let kept=false;
    for(const f of await fs.readdir(real)){const m=f.match(PICTURE_NAME);if(!m||m[1]!==a.node_id||!!m[2]!==heat)continue;
      const d=new Date(),p2=v=>String(v).padStart(2,'0'),stamp=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}`,ext=path.extname(f);let n=0,target;
      do{target=path.join(real,`${base} (régi ${stamp}${n?' '+n:''})${ext}`);n++;}while(await fs.stat(target).then(()=>true,()=>false));
      await fs.rename(path.join(real,f),target);kept=true;}
    const file=path.join(real,`${base}.${got.type.extension}`);await fs.writeFile(file,got.bytes,{flag:'wx'});
    return {story_id:story.id,node_id:a.node_id,heated:heat,file:path.join(...STORY_PICTURE_DIR,story.id,path.basename(file)),previous_kept:kept,model:typeof a.model==='string'?a.model.slice(0,120):null};
  }
  // A story for this trip, or null. Content follows the owner's adult switch; a story may limit
  // itself to day parts or to car/foot trips. The least-played stories come first.
  // mode: how Palor travels (foot, bike, car, train; vehicle:true is the older spelling of car).
  // Train and station stories come only on a train trip; a bicycle is easy to stop, a car is not.
  // force: Palor chose it (he stopped by the road), so the rate roll is skipped (2026-11-14).
  function pick({setting,slotId,vehicle=false,mode=null,worldDay=null,chance=1,force=false}){
    mode=mode||(vehicle?'car':'foot');
    const rate=STORY_RATES[settings().story_rate||'normal']??STORY_RATES.normal;
    if(!STORY_SETTINGS.includes(setting)||(!force&&random()>=rate*chance*(MODE_CHANCE[mode]??1)))return null;
    const adult=settings().adult!==false;
    const candidates=all(`SELECT s.id,s.story_json,(SELECT count(*) FROM play_story_runs r WHERE r.story_id=s.id) runs,(SELECT max(started_at) FROM play_story_runs r WHERE r.story_id=s.id) last FROM play_stories s WHERE s.enabled=1 AND s.setting=?`,setting)
      .map(r=>({...r,story:JSON.parse(r.story_json)}))
      .filter(r=>(adult||r.story.content==='everyday')&&(!r.story.slots||r.story.slots.includes(slotId))&&STORY_FITS[mode]?.has(transportOf(r.story)));
    if(!candidates.length)return null;
    const fewest=Math.min(...candidates.map(c=>c.runs)),pool=candidates.filter(c=>c.runs===fewest);
    const chosen=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
    return startRun(chosen.story,worldDay);
  }
  function finish(runId,body){
    const r=one('SELECT * FROM play_story_runs WHERE id=?',runId);if(!r)throw fail('Story run not found',404);
    if(r.finished_at)return {run_id:runId,finished:true};
    const story=storyOf(r.story_id);if(!story)throw fail('Story not found',404);
    const path=Array.isArray(body.path)?body.path.filter(id=>typeof id==='string'&&story.nodes[id]).slice(0,60):[];
    const ending=typeof body.ending==='string'&&story.nodes[body.ending]?.ending?body.ending:null;
    run('UPDATE play_story_runs SET finished_at=?,ending_id=?,ending_kind=?,path_json=? WHERE id=?',iso(),ending,ending?story.nodes[ending].ending:'skipped',JSON.stringify(path),runId);
    return {run_id:runId,finished:true,ending:ending?story.nodes[ending].ending:'skipped'};
  }
  async function handle({p,m,body,json,res=null}){
    if(p==='/api/play/stories'&&m==='GET'){json(list());return true;}
    const pic=p.match(/^\/api\/play\/story-pictures\/([a-z0-9-]{2,60})\/([^/]{1,240})$/);
    if(pic&&m==='GET'){let file;try{file=decodeURIComponent(pic[2]);}catch{throw fail('Picture not found.',404);}servePicture(pic[1],file,res);return true;}
    // Finished stories for the journal (2026-11-13): title, day and how it ended.
    if(p==='/api/play/story-runs'&&m==='GET'){json({runs:all("SELECT r.id,r.world_day,r.finished_at,r.ending_kind,s.title,s.setting FROM play_story_runs r JOIN play_stories s ON s.id=r.story_id WHERE r.finished_at IS NOT NULL ORDER BY r.finished_at DESC LIMIT 100")});return true;}
    if(p==='/api/play/stories/import'&&m==='POST'){json(importStories(body||{}));return true;}
    let x=p.match(/^\/api\/play\/stories\/([a-z0-9-]{2,60})$/);
    if(x&&m==='GET'){const s=storyOf(x[1]);if(!s)throw fail('Story not found',404);json(s);return true;}
    if(x&&m==='POST'){if(typeof body?.enabled!=='boolean')throw fail('Choose on or off.');if(!one('SELECT 1 FROM play_stories WHERE id=?',x[1]))throw fail('Story not found',404);run('UPDATE play_stories SET enabled=?,updated_at=? WHERE id=?',body.enabled?1:0,iso(),x[1]);json(list());return true;}
    x=p.match(/^\/api\/play\/stories\/([a-z0-9-]{2,60})\/play$/);
    if(x&&m==='POST'){const s=storyOf(x[1]);if(!s)throw fail('Story not found',404);json(startRun(s,null));return true;}
    x=p.match(/^\/api\/play\/story-runs\/([0-9a-f-]{36})\/finish$/i);
    if(x&&m==='POST'){json(finish(x[1],body||{}));return true;}
    return false;
  }
  // Connector operations (via /api/mcp-backgrounds, 2026-11-13): Grok saves the stories it wrote
  // itself, checked exactly like a pasted batch; saving needs trusted mode there.
  const ops={
    // picture_work (2026-11-13): Grok keeps its tool list from when the connector was added and
    // did not see list_story_picture_needs after a restart and re-authentication. This tool has
    // no arguments and Grok already knows it, so each call also hands out the next 3 stories that
    // still need pictures (a cursor moves on every call and wraps around), with all their blocks.
    stories_list:{run:()=>{const l=list();return {total:l.stories.length,by_setting:Object.fromEntries(['road','kaloz','szekesfehervar','budapest'].map(s=>[s,l.stories.filter(x=>x.setting===s).length])),ids:l.stories.map(x=>x.id),picture_work:pictureWork()};}},
    stories_save:{write:true,run:a=>{
      // The connector sends the stories as one JSON text (stories_json); an array still works.
      if(typeof a?.stories_json==='string'){let v;try{v=JSON.parse(a.stories_json.replace(/^\s*```(?:json)?|```\s*$/g,''));}catch(e){throw fail('stories_json is not valid JSON: '+String(e.message).slice(0,160));}a={...a,stories:Array.isArray(v)?v:Array.isArray(v?.stories)?v.stories:[v]};}
      if(!a||!Array.isArray(a.stories)||!a.stories.length||a.stories.length>10)throw fail('Send 1–10 stories per call.');
      const r=importStories({stories:a.stories,replace:a.replace===true,source:typeof a.model==='string'&&a.model.trim()?a.model.trim().slice(0,60):'Grok (MCP)'});
      return {saved:r.saved,results:r.results.map(x=>({id:x.id,status:x.saved?'saved':x.status,errors:x.errors})),
        next:r.results.some(x=>x.status==='invalid')?'Fix the listed errors and send those stories again; do not reword around the adult/men-only rules.':'Saved. Continue with the next stories.'};}}
  };
  // Picture operations need the shared image reader (image file, url or media_id).
  const pictureOps=imageBytes=>({
    story_pictures_needs:{run:a=>pictureNeeds(a||{})},
    story_picture_save:{write:true,run:a=>savePicture(a||{},imageBytes)},
  });
  return {pick,importStories,list,finish,handle,validate:check,ops,pictureOps,picturesFor,pictureNeeds,savePicture};
}
