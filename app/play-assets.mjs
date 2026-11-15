// Play-mode picture pipeline for Grok over MCP (free route: Grok generates natively in its
// own chat, uploads the bytes through the existing chunked media import, then this module
// places the picture where the game uses it).
//   needs  – what is missing: figures (alap + expressions), place backgrounds (day/evening/
//            night), shared scenes with Palor; ordered by how much the game needs them.
//   brief  – one target: prompt, save target, the references that may be attached.
//   jobs   – start → finish (done with a media_id, or refused/failed/cancelled). A refused job
//            is recorded and skipped for 7 days; it is never retried or reworded automatically.
//   place  – copy an imported picture into Szereplő-alakok / Helyszín hátterek / Közös
//            jelenetek; a new figure replaces the previous one (backed up first), backgrounds and scenes are added; logged with provenance.
// Collection-origin declarations and reference approval are separate (character-origin.mjs). Display assets never change canon.
import {promises as fs,constants as fsConstants,existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {FIGURE_EXPRESSIONS} from './figure-prompts.mjs';
import {expressionOf} from './character-sprites.mjs';
import {validateMedia} from './media-imports.mjs';
import {kindOf} from './place-network.mjs';
import {safeDownload} from './safe-download.mjs';
import {GENERATION_PLAYBOOK} from './generation-playbook.mjs';
import {INTAKE_FOLDER,readName} from './new-images.mjs';
import {organized} from './storage-layout.mjs';
import {BACKDROP_OK_SQL} from './play/backdrops.mjs';

const MAX_BYTES=20*1024*1024,TIMES=['nappal','este','ejjel'],TARGETS=['figure','background','scene'];
const CONTENT=['non_intimate','nudity','sexual_activity'];
const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80);
const uuid=/^[0-9a-f-]{36}$/i;

export function installPlayAssets({db,root,one,all,run,transaction,fail,worldEngine,sprites,backgrounds,scenes,locationTree,origin,dataDir,download=safeDownload}){
  db.exec(`CREATE TABLE IF NOT EXISTS play_generation_jobs(id TEXT PRIMARY KEY,target TEXT NOT NULL,character_id TEXT,location_id TEXT,expression TEXT,time_of_day TEXT,status TEXT NOT NULL,brief_json TEXT NOT NULL,media_id TEXT,placed_media_id TEXT,note TEXT,model TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS play_generation_jobs_status ON play_generation_jobs(status,updated_at);`);
  // Figure outfit (2026-11-11): 'dressed' (folder) or 'shirtless' ("felmeztelen" subfolder).
  if(!all('PRAGMA table_info(play_generation_jobs)').some(c=>c.name==='outfit'))db.exec('ALTER TABLE play_generation_jobs ADD COLUMN outfit TEXT');
  // 'intimate' (2026-11-12): waist-up, bare upper body, for intimate beats; the game fades it
  // out below the waist. Only a few calm expressions are needed.
  const OUTFITS=['dressed','shirtless','intimate'],OUTFIT_FOLDER={shirtless:'felmeztelen',intimate:'intim'};
  const INTIMATE_EXPRESSIONS=['alap','mosoly','flortol'];
  const expressionsFor=outfit=>FIGURE_EXPRESSIONS.filter(x=>outfit!=='intimate'||INTIMATE_EXPRESSIONS.includes(x.file));
  // An existing "félmeztelen" folder (written by hand) is reused, so no second shirtless folder appears.
  const outfitPath=(figureFolder,outfit)=>outfit==='dressed'?[]:outfit==='shirtless'?[['felmeztelen','félmeztelen'].find(n=>existsSync(path.join(root,figureFolder,n)))||OUTFIT_FOLDER[outfit]]:[OUTFIT_FOLDER[outfit]];
  const outfitOf=v=>{const o=v??'dressed';if(!OUTFITS.includes(o))throw fail('outfit is dressed, shirtless or intimate.');return o;};
  const iso=()=>new Date().toISOString();
  const w=worldEngine.internals;
  const cast=()=>[...w.meetable().map(c=>({id:c.id,name:c.name})),...(w.palor()?[{id:w.palor().id,name:w.palor().name}]:[])];
  const keyOf=j=>[j.target,j.character_id||'',j.location_id||'',j.expression||'',j.time_of_day||'',j.target==='figure'?(j.outfit||'dressed'):''].join('|');
  // Targets that should not come back as needs: open jobs (a day) and refused/failed (a week).
  function blockedKeys(){
    const day=new Date(Date.now()-864e5).toISOString(),week=new Date(Date.now()-7*864e5).toISOString();
    return new Set(all("SELECT target,character_id,location_id,expression,time_of_day,outfit FROM play_generation_jobs WHERE (status='open' AND updated_at>=?) OR (status IN ('refused','failed') AND updated_at>=?)",day,week).map(keyOf));
  }
  // Exact approved images within the owner's fictional-AI collection declaration.
  // Origin eligibility never overrides the separate content/provider rules.
  const approvedReferences=(cid,{intimate=false}={})=>(intimate?origin.allowedReferences(cid):origin.everydayReferences(cid)).slice(0,12);
  // Location shots per place and which times of day they cover (from file names/descriptions).
  function backgroundCoverage(){
    const rows=all(`SELECT l.id location_id,m.relative_path p,COALESCE((SELECT json_extract(s.raw_json,'$.description.hu') FROM world_review_sources s WHERE s.media_id=m.id ORDER BY s.rowid DESC LIMIT 1),'') d
      FROM locations l JOIN media_tags t ON t.tag_id=l.tag_id JOIN active_media m ON m.id=t.media_id AND m.kind='image' JOIN media_roles r ON r.media_id=m.id AND r.role='location'
      WHERE ${BACKDROP_OK_SQL}`);
    const out=new Map();
    for(const r of rows){const c=out.get(r.location_id)||{count:0,times:new Set()};c.count++;const s=(r.p+' '+r.d).toLocaleLowerCase('hu');
      if(/ejjel|éjjel|éjszak|night/.test(s))c.times.add('ejjel');else if(/este|evening/.test(s))c.times.add('este');else c.times.add('nappal');out.set(r.location_id,c);}
    return out;
  }
  // An open job whose picture arrived another way (saved into the folder, desktop upload) is
  // closed as done, so a Grok session can hand a file to the owner and move on.
  function reconcile(){
    const open=all("SELECT id,target,character_id,location_id,expression,time_of_day,outfit,created_at FROM play_generation_jobs WHERE status='open'");if(!open.length)return 0;
    let cov=null,closed=0;
    for(const j of open){
      const done=j.target==='figure'?sprites.forCharacter(j.character_id,{outfit:j.outfit||'dressed'}).some(s=>s.expression===(j.expression||'alap'))
        :j.target==='background'?(cov??=backgroundCoverage()).get(j.location_id)?.times.has(j.time_of_day||'nappal')
        :!!one("SELECT 1 FROM play_inserts WHERE kind='scene' AND character_id=? AND created_at>?",j.character_id,j.created_at);
      if(done){run("UPDATE play_generation_jobs SET status='done',note=?,updated_at=? WHERE id=? AND status='open'",'Arrived outside the job (folder or upload).',iso(),j.id);closed++;}
    }
    return closed;
  }
  async function needs({limit=20,target=null}={}){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('limit is 1–100.');if(target&&!TARGETS.includes(target))throw fail('Unknown target.');
    reconcile();
    const blocked=blockedKeys(),list=[],blockedFigures=[];
    const push=n=>{if(!blocked.has(keyOf(n)))list.push(n);};
    if(!target||target==='figure')for(const c of cast()){
      const p=sprites.promptFor(c.id);
      if(p.generation_ready===false){blockedFigures.push({character_id:c.id,name:c.name,reason:p.generation_blocked,source_folder:p.source_folder});continue;}
      const have=new Set(sprites.forCharacter(c.id).map(s=>s.expression)),refs=p.reference_count>0;
      if(!have.has('alap'))push({target:'figure',character_id:c.id,name:c.name,expression:'alap',priority:100,why:'no base figure yet: he appears as a photo card',reference_policy:refs?'approved_references':'text_only'});
      else for(const x of FIGURE_EXPRESSIONS.slice(1).filter(x=>!have.has(x.file)).slice(0,2))push({target:'figure',character_id:c.id,name:c.name,expression:x.file,priority:30,why:'expression for talks',reference_policy:refs?'approved_references':'text_only'});
      // Shirtless set (shown when a scene reaches undressing), once his dressed base figure exists.
      if(have.has('alap')){const bare=new Set(sprites.forCharacter(c.id,{outfit:'shirtless'}).map(s=>s.expression));
        for(const x of FIGURE_EXPRESSIONS.filter(x=>!bare.has(x.file)&&(x.file==='alap'||bare.has('alap'))).slice(0,2))push({target:'figure',outfit:'shirtless',character_id:c.id,name:c.name,expression:x.file,priority:x.file==='alap'?25:12,why:x.file==='alap'?'no shirtless base figure yet':'shirtless expression',reference_policy:refs?'approved_references':'text_only'});
        // Waist-up intimate set, once the shirtless base exists (owner 2026-11-12: for everyone).
        if(bare.has('alap')){const close=new Set(sprites.forCharacter(c.id,{outfit:'intimate'}).map(s=>s.expression));
          for(const x of expressionsFor('intimate').filter(x=>!close.has(x.file)&&(x.file==='alap'||close.has('alap'))).slice(0,2))push({target:'figure',outfit:'intimate',character_id:c.id,name:c.name,expression:x.file,priority:x.file==='alap'?10:6,why:x.file==='alap'?'no waist-up intimate figure yet':'intimate expression',reference_policy:refs?'approved_references':'text_only'});}}
    }
    if(!target||target==='background'){
      const t=await locationTree.load(),cov=backgroundCoverage();
      const linked=new Map(all('SELECT location_id,count(*) n FROM world_places GROUP BY location_id').map(r=>[r.location_id,r.n]));
      for(const n of t.nodes){if(!n.location_id||['vehicle','area'].includes(kindOf(n)))continue;
        // Busy places first, but never above a missing base figure (priority 100).
        const c=cov.get(n.location_id),weight=Math.min(30,(linked.get(n.location_id)||0)*5);
        if(!c)push({target:'background',location_id:n.location_id,name:n.short_name,path:n.path,time_of_day:'nappal',priority:60+weight,why:'no backdrop at all'});
        else for(const time of TIMES.filter(x=>!c.times.has(x)).slice(0,1))push({target:'background',location_id:n.location_id,name:n.short_name,path:n.path,time_of_day:time,priority:10+weight,why:'no '+time+' version'});
      }
    }
    if(!target||target==='scene'){const pid=w.palor()?.id;
      if(pid)for(const c of w.meetable()){if(!origin.intimateAllowed(c.id))continue;
        const n=one("SELECT count(*) n FROM play_inserts i JOIN active_media m ON m.id=i.media_id WHERE i.kind='scene' AND i.character_id=?",c.id).n;
        if(n<3)push({target:'scene',character_id:c.id,name:c.name,priority:20-n*5,why:n?'only '+n+' shared scene(s)':'no shared scene with Palor yet'});}
    }
    list.sort((a,b)=>b.priority-a.priority||String(a.name).localeCompare(String(b.name),'hu'));
    return {needs:list.slice(0,limit),total:list.length,skipped_recent_jobs:blocked.size,blocked_figures:blockedFigures};
  }
  function check(args,allowed){if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k)))throw fail('Unexpected fields: allowed are '+allowed.join(', ')+'.');}
  // Owner notes from earlier rejected pictures of the same use (Képműhely), set after install.
  let feedbackFor=()=>[];
  const withFeedback=b=>{const notes=feedbackFor({target:b.target,character_id:b.character_id||null,location_id:b.target==='background'?b.location_id:null});return notes.length?{...b,owner_feedback:notes}:b;};
  async function brief(args){return withFeedback(await baseBrief(args));}
  async function baseBrief(args){
    check(args,['target','character_id','location_id','expression','time_of_day','outfit']);
    const {target}=args;if(!TARGETS.includes(target))throw fail('target is figure, background or scene.');
    const steps=['Generate the picture natively in your own chat from the prompt (no API credits).',
      'Hand it back, first that works: (a) ChatGPT: attach the generated picture itself as image in finish_generation_job (the app downloads it); a public HTTPS image URL that opens without login → finish_generation_job with url; (b) bytes you can actually read in code → begin_media_import (figure: the character; scene: the character and Palor) → begin_media_upload → upload_media_chunk → finalize_media_upload → committed media_id → finish_generation_job with media_id; (c) otherwise ask the owner to save it into the save folder below with that file name: the app picks it up within 5 minutes and closes the job itself.',
      'With a url or media_id, call finish_generation_job with outcome "done" (or place_play_asset without a job); the app copies it to the save folder below.',
      'If your generator declines the request, call finish_generation_job with outcome "refused" and its reason, then continue with the next need. Do not reword the prompt to get around a refusal; the owner decides what to do with refused items.'];
    if(target==='figure'){
      if(!uuid.test(args.character_id||''))throw fail('character_id is required.');
      const p=sprites.promptFor(args.character_id),expression=args.expression||'alap';
      if(p.generation_ready===false)throw Object.assign(fail(p.generation_blocked,409),{code:'FIGURE_REFERENCE_MISSING'});
      const outfit=outfitOf(args.outfit),allowed=expressionsFor(outfit);
      const x=allowed.find(e=>e.file===expression);if(!x)throw fail('expression is one of '+allowed.map(e=>e.file).join(', ')+'.');
      let prompt=expression==='alap'?p.base:p.base.replace(/Expression: .*$/m,'Expression: '+x.en+'.');
      // Shirtless: the same man and framing, bare upper body, his ordinary trousers and shoes kept on.
      if(outfit==='shirtless')prompt=prompt.replace(/Clothing: .*$/m,'Clothing: shirtless – bare upper body, wearing his ordinary everyday trousers and shoes; nothing else changes. Keep exactly the same trousers and shoes in every expression version. Non-sexual, relaxed standing pose.');
      // Intimate: the same man waist-up; the frame ends at the waist and the game fades it out there.
      if(outfit==='intimate')prompt=prompt.replace('full-body character figure','waist-up character figure')
        .replace(/Pose: .*$/m,'Pose: upper body only, facing the viewer with a slight three-quarter turn, shoulders relaxed, arms relaxed at his sides.')
        .replace(/Clothing: .*$/m,'Clothing: bare upper body (shirtless), the same man as in his other figures. Calm, warm and non-sexual.')
        .replace(/Framing: .*$/m,'Framing: vertical 2:3, from a small margin above the head down to the waist, just below the navel; the picture ends there and nothing below the waist is in the frame, so no clothing at all is visible (no waistband, belt or trousers). Camera at chest height, sharp focus.')
        .replace(/^Continuity: .*$/m,'Continuity: use the same supplied pictures as for his dressed and shirtless figures.');
      return {target,character_id:p.character_id,name:p.name,expression,outfit,prompt,reference_policy:p.reference_policy,references:p.references??approvedReferences(p.character_id),...(p.source_folder?{source_folder:p.source_folder}:{}),save:{folder:path.join(p.folder,...outfitPath(p.folder,outfit)),file:expression+'.png'},content_expected:'non_intimate',steps};
    }
    if(target==='background'){
      if(!uuid.test(args.location_id||''))throw fail('location_id is required.');
      const time=args.time_of_day||'nappal';if(!TIMES.includes(time))throw fail('time_of_day is nappal, este or ejjel.');
      const pr=await scenes.prompts({location_id:args.location_id});if(!pr.background)throw fail('Location not found',404);
      return {target,location_id:args.location_id,time_of_day:time,prompt:pr.background[{nappal:'base',este:'evening',ejjel:'night'}[time]],references:[],reference_policy:'none_needed',save:{folder:pr.background.folder,file:time+'-….png'},content_expected:'non_intimate',steps};
    }
    if(!uuid.test(args.character_id||''))throw fail('character_id is required.');
    const pr=await scenes.prompts({character_id:args.character_id,location_id:args.location_id||null});
    // The prompt already stays everyday when intimate pictures are not allowed for him.
    const stage=/intimate, consensual/.test(pr.scene.prompt)?'sexual_activity':/flirty/.test(pr.scene.prompt)?'nudity':'non_intimate',intimate=stage!=='non_intimate';
    const pid=w.palor()?.id,refs=[...(pid?approvedReferences(pid,{intimate}):[]),...approvedReferences(args.character_id,{intimate})];
    return {target,character_id:args.character_id,location_id:args.location_id||null,prompt:pr.scene.prompt,reference_policy:pr.scene.reference_policy,references:refs,save:{folder:pr.scene.folder,file:pr.scene.save_as.split(/[\\/]/).pop()},content_expected:stage,steps};
  }
  async function bytesOf(mediaId){
    const m=one('SELECT id,relative_path,kind,size FROM active_media WHERE id=?',mediaId);if(!m)throw fail('Media not found (import it first).',404);
    if(m.kind!=='image')throw fail('Only JPEG or PNG images can be placed.');
    const file=path.resolve(root,m.relative_path),real=await fs.realpath(file).catch(()=>null),realRoot=await fs.realpath(root);
    if(!real||!real.startsWith(realRoot+path.sep))throw fail('Media file not found.',404);
    const stat=await fs.lstat(real);if(stat.isSymbolicLink()||stat.size>MAX_BYTES)throw fail('Images must be regular files up to 20 MiB.',413);
    const bytes=await fs.readFile(real),type=await validateMedia(bytes);if(type.kind!=='image')throw fail('Only JPEG or PNG images can be placed.');
    return {bytes,type,sha:createHash('sha256').update(bytes).digest('hex')};
  }
  // A public HTTPS picture (Grok result link): the shared SSRF-safe downloader, 20 MiB, decoded.
  async function bytesFromUrl(url){
    const started=performance.now();try{return await bytesFromUrlInner(url);}finally{fetchMs=Math.round(performance.now()-started);}
  }
  // Step timings of a picture save (2026-11-13: saves took 5–12 s with no clue where): the last
  // download time, reported in the result and logged when the whole save is slow.
  let fetchMs=null;
  const timed=(name,fn)=>async a=>{const started=performance.now();fetchMs=null;const r=await fn(a);const total=Math.round(performance.now()-started),timings={total_ms:total,...(fetchMs!==null?{download_ms:fetchMs,save_ms:Math.max(0,total-fetchMs)}:{})};
    if(total>3000)console.warn(`Play asset ${name}: ${JSON.stringify(timings)}`);return r&&typeof r==='object'?{...r,timings}:r;};
  async function bytesFromUrlInner(url){
    if(typeof url!=='string'||url.length>8192||!/^https:\/\//i.test(url))throw fail('url must be a public HTTPS image address.');
    let response;try{response=await download(url,{maxBytes:MAX_BYTES});}catch(e){throw fail(e.message||'The image could not be downloaded.',e.status||400);}
    const chunks=[];let size=0;for await(const c of response.stream){size+=c.length;if(size>MAX_BYTES)throw fail('Images must be at most 20 MiB.',413);chunks.push(Buffer.from(c));}
    const bytes=Buffer.concat(chunks),type=await validateMedia(bytes).catch(()=>null);if(type?.kind!=='image')throw fail('The address did not return a JPEG or PNG image.',415);
    let host='';try{host=new URL(url).hostname;}catch{}
    return {bytes,type,sha:createHash('sha256').update(bytes).digest('hex'),host};
  }
  const logInsert=(mediaId,kind,source,cid,lid)=>run('INSERT INTO play_inserts VALUES(?,?,?,?,?,?,?)',randomUUID(),mediaId,kind,source,cid||null,lid||null,iso());
  // The uploaded original stays in the catalogue (never moved or deleted); a note says where
  // its copy went, so it is not mistaken for a new photo of the character.
  const noteSource=(mediaId,text,target)=>{run("INSERT OR IGNORE INTO play_asset_sources VALUES(?,?,?)",mediaId,target,iso());noteText(mediaId,text);};
  const noteText=(mediaId,text)=>run("INSERT INTO media_notes(media_id,tags,notes) VALUES(?,'',?) ON CONFLICT(media_id) DO UPDATE SET notes=CASE WHEN notes='' THEN excluded.notes WHEN instr(notes,excluded.notes)>0 THEN notes ELSE notes||char(10)||excluded.notes END",mediaId,text.slice(0,500));
  // ChatGPT file parameter (2026-11-11): the picture from the chat arrives as {download_url,file_id,…};
  // it is fetched like any public HTTPS link (SSRF-safe, 20 MiB, JPEG/PNG verified).
  function fromImage(args){
    if(args?.image===undefined)return args;
    const i=args.image;if(!i||typeof i!=='object'||Array.isArray(i)||typeof i.download_url!=='string'||!i.download_url)throw fail('image must be the attached picture with its download_url.');
    if(args.url!==undefined||args.media_id!==undefined)throw fail('Give only one of image, url or media_id.');
    const {image,...rest}=args;return {...rest,url:i.download_url};
  }
  // Any picture of 1–8 characters (2026-11-12): written into "Új képek" under a name the intake
  // reads ("Palor + Norbi - Kávézó - hetkoznapi - 2026-11-12-1.png"); the owner's home-screen
  // click links the people and moves it by the placement rule. Never overwrites.
  async function placePicture(args){
    const ids=args.character_ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>8||ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(ids).size!==ids.length)throw fail('character_ids lists 1–8 different characters.');
    if(args.character_id!==undefined)throw fail('Use character_ids for target picture.');
    const people=ids.map(id=>one('SELECT id,name FROM characters WHERE id=?',id));if(people.some(p=>!p))throw fail('Unknown character.',404);
    if(people.some(p=>/[\\/:*?"<>|+&\x00-\x1f]/.test(p.name)))throw fail('A character name cannot be used in a file name. Save this picture by hand.');
    const content=args.content??'non_intimate';if(!CONTENT.includes(content))throw fail('content is non_intimate, nudity or sexual_activity.');
    if(content!=='non_intimate'&&people.some(p=>!origin.intimateAllowed(p.id)))throw fail('Only everyday pictures (content "non_intimate") can be placed for these characters: no assigned media is covered by the collection origin declaration.',403);
    const loc=args.location_id!==undefined?one('SELECT name FROM locations WHERE id=?',String(args.location_id)):null;if(args.location_id!==undefined&&!loc)throw fail('location_id is required.',404);
    if(!organized(root))throw fail('The Új képek folder needs the organized storage layout.',409);
    const got=args.url!==undefined?await bytesFromUrl(args.url):await bytesOf(args.media_id);
    const pid=w.palor()?.id,ordered=[...people.filter(p=>p.id===pid),...people.filter(p=>p.id!==pid)];
    const word={non_intimate:'hetkoznapi',nudity:'meztelen',sexual_activity:'szex'}[content];
    const place=loc?String(loc.name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').trim():'';
    // label: a short free word for the owner ("felmeztelen", "reggel"); the intake ignores it.
    if(args.label!==undefined&&(typeof args.label!=='string'||!/^[\p{L}\p{N} ]{1,40}$/u.test(args.label.trim())))throw fail('label is up to 40 letters, digits or spaces.');
    const label=args.label?.trim().replace(/\s+/g,' ')||'';
    // It must not read as a person or a content level, or the intake would act on it.
    if(label){const r=readName({file:label+'.png',characters:all('SELECT id,name FROM characters')});if(r.people.length||r.content||r.problem?.code==='ambiguous')throw fail('label cannot be a character name or a content word.');}
    const stem=[ordered.map(p=>p.name).join(' + '),place,label,word,iso().slice(0,10)].filter(Boolean).join(' - ');
    if(stem.length>200)throw fail('The names are too long for one file name. Save this picture by hand.');
    const dir=path.join(root,'20_SHARED_MEDIA',INTAKE_FOLDER);await fs.mkdir(dir,{recursive:true});
    const real=await fs.realpath(dir);if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The Új képek folder points outside your resource folder.',403);
    let name;for(let n=1;;n++){name=`${stem}-${n}.${got.type.extension}`;try{await fs.writeFile(path.join(real,name),got.bytes,{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST'||n>500)throw e;}}
    if(args.media_id)noteSource(args.media_id,'Játék: az Új képek mappába mentve ('+name+').','picture');
    return {target:'picture',file:name,folder:path.join('20_SHARED_MEDIA',INTAKE_FOLDER),people:ordered.map(p=>p.name),content,next:'Saved into the Új képek folder. The owner reads it in with the home task "Új képek beolvasása"; it is then linked to these characters and moved into their folder.',canon_changed:false};
  }
  async function place(args){
    check(args,['media_id','url','target','character_id','character_ids','location_id','expression','time_of_day','content','prompt','model','outfit','image','label']);
    if(args.label!==undefined&&args.target!=='picture')throw fail('label is only for target picture.');
    args=fromImage(args);
    if((args.media_id===undefined)===(args.url===undefined))throw fail('Give either media_id (an imported picture) or url (a public HTTPS image), not both.');
    if(args.media_id!==undefined&&!uuid.test(args.media_id))throw fail('media_id is required.');if(!TARGETS.includes(args.target)&&args.target!=='picture')throw fail('target is figure, background, scene or picture.');
    for(const k of ['prompt','model'])if(args[k]!==undefined&&(typeof args[k]!=='string'||args[k].length>(k==='prompt'?12000:120)))throw fail(k+' is too long.');
    if(args.target==='picture')return placePicture(args);
    // Cheap checks before any download.
    if(args.target==='background'?!one('SELECT 1 FROM locations WHERE id=?',args.location_id||''):!one('SELECT 1 FROM characters WHERE id=?',args.character_id||''))throw fail(args.target==='background'?'location_id is required.':'character_id is required.',404);
    const got=args.url!==undefined?await bytesFromUrl(args.url):await bytesOf(args.media_id),{bytes,type,sha}=got,source='Grok (MCP)'+(args.model?' · '+args.model:'')+(got.host?' · '+got.host:'');
    if(args.target==='background'){
      if(!uuid.test(args.location_id||''))throw fail('location_id is required.');
      const time=args.time_of_day||'nappal';if(!TIMES.includes(time))throw fail('time_of_day is nappal, este or ejjel.');
      const saved=await backgrounds.save(args.location_id,bytes,{source,prompt:args.prompt||'',title:time,stem:time});
      logInsert(saved.media_id,'background',source,null,args.location_id);
      if(args.media_id&&saved.media_id!==args.media_id)noteSource(args.media_id,'Játék: helyszín háttérként elhelyezve ('+time+').','background');
      return {target:'background',placed_media_id:saved.media_id,location_id:args.location_id,time_of_day:time,canon_changed:false};
    }
    const c=one('SELECT id,name FROM characters WHERE id=?',args.character_id||'');if(!c)throw fail('character_id is required.',404);
    if(args.target==='scene'){
      const content=args.content??null;if(content!==null&&!CONTENT.includes(content))throw fail('content is non_intimate, nudity or sexual_activity.');
      // Without assigned in-scope fictional collection media: everyday pictures only.
      if(!origin.intimateAllowed(c.id)&&content!=='non_intimate')throw fail('Only everyday pictures (content "non_intimate") can be placed for '+c.name+': no assigned media is covered by the collection origin declaration.',403);
      const up=await scenes.upload({character_id:c.id,location_id:args.location_id||null,data_url:`data:image/${type.extension==='png'?'png':'jpeg'};base64,`+bytes.toString('base64'),...(content?{content}:{})});
      if(args.media_id&&up.media_id!==args.media_id)noteSource(args.media_id,'Játék: közös jelenetként elhelyezve ('+c.name+').','scene');
      return {target:'scene',placed_media_id:up.media_id,duplicate:up.duplicate,file:up.file||null,canon_changed:false};
    }
    // Figure: <Szereplő-alakok>/<name>/<expression>.png; it replaces the previous figure of that expression.
    const expression=args.expression||'alap',outfit=outfitOf(args.outfit),allowedExpressions=expressionsFor(outfit);
    if(!allowedExpressions.some(e=>e.file===expression))throw fail('expression is one of '+allowedExpressions.map(e=>e.file).join(', ')+'.');
    const folder=path.join(sprites.base(),safeName(c.name),...outfitPath(path.join(sprites.base(),safeName(c.name)),outfit)),dir=path.resolve(root,folder),realRoot=await fs.realpath(root);
    if(!dir.startsWith(path.resolve(root)+path.sep))throw fail('Invalid folder.',403);
    await fs.mkdir(dir,{recursive:true});const realDir=await fs.realpath(dir);if(!realDir.startsWith(realRoot+path.sep))throw fail('The folder points outside your resource folder.',403);
    // Owner decision 2026-11-10: a new figure replaces the previous one (<expression>.png).
    // Earlier files of the same expression (any extension, alap-2…) are first copied to the
    // local backups outside OneDrive, then removed, so the folder keeps one file per expression.
    const name=expression+'.'+type.extension,target=path.join(realDir,name);
    const previous=(await fs.readdir(realDir,{withFileTypes:true})).filter(f=>f.isFile()&&/\.(png|jpe?g)$/i.test(f.name)&&expressionOf(f.name)===expression);
    const same=previous.find(f=>f.name===name);
    if(!(same&&createHash('sha256').update(await fs.readFile(target)).digest('hex')===sha)){
      if(previous.length){const keep=path.join(dataDir,'backups','figures',safeName(c.name),...(outfit==='dressed'?[]:[OUTFIT_FOLDER[outfit]]),new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(keep,{recursive:true});
        for(const f of previous){const from=path.join(realDir,f.name),to=path.join(keep,f.name);await fs.copyFile(from,to,fsConstants.COPYFILE_EXCL);
          if(createHash('sha256').update(await fs.readFile(from)).digest('hex')!==createHash('sha256').update(await fs.readFile(to)).digest('hex'))throw fail('The previous figure could not be backed up; nothing was replaced.',500);}}
      // Write next to it first, then swap in, so a failed write never leaves a half file.
      const temp=path.join(realDir,'.'+name+'.'+randomUUID()+'.tmp');await fs.writeFile(temp,bytes,{flag:'wx'});
      for(const f of previous)if(f.name!==name)await fs.unlink(path.join(realDir,f.name));
      await fs.rename(temp,target);
    }
    await sprites.scan();
    const sprite=one('SELECT id,expression FROM character_sprites WHERE relative_path=? AND missing=0',path.join(folder,name));
    // A replaced figure keeps its record, so an earlier Képműhely verdict must not hide the new one.
    if(sprite&&one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workshop_checks'"))run('DELETE FROM workshop_checks WHERE item_key=?','sprite:'+sprite.id);
    // The log names the figure itself (Képműhely checks it); the source upload keeps its note.
    logInsert(sprite?'sprite:'+sprite.id:args.media_id||'sprite:'+name,'figure',source,c.id,null);
    if(args.media_id)noteSource(args.media_id,'Játék: '+c.name+' alakja ('+name+'), a Szereplő-alakok mappába másolva.','figure');
    return {target:'figure',outfit,sprite_id:sprite?.id||null,expression:sprite?.expression||expression,file:name,folder,canon_changed:false};
  }
  async function startJob(args,ownerNote=''){
    const b={...(await brief(args)),...(ownerNote?{owner_note:ownerNote}:{})};
    const id=randomUUID(),t=iso();
    run("INSERT INTO play_generation_jobs(id,target,character_id,location_id,expression,time_of_day,status,brief_json,media_id,placed_media_id,note,model,created_at,updated_at,outfit) VALUES(?,?,?,?,?,?,'open',?,NULL,NULL,NULL,NULL,?,?,?)",id,b.target,b.character_id||null,b.location_id||null,b.expression||null,b.time_of_day||null,JSON.stringify(b),t,t,b.target==='figure'?b.outfit||'dressed':null);
    return {job_id:id,...b};
  }
  async function finishJob(args){
    check(args,['job_id','outcome','media_id','url','note','model','content','image']);
    if(args.outcome==='done')args=fromImage(args);else if(args.image!==undefined){const {image,...rest}=args;args=rest;}
    const job=one('SELECT * FROM play_generation_jobs WHERE id=?',args.job_id||'');if(!job)throw fail('Job not found',404);
    if(job.status!=='open')throw fail('This job is already '+job.status+'.',409);
    if(!['done','refused','failed','cancelled'].includes(args.outcome))throw fail('outcome is done, refused, failed or cancelled.');
    if(args.note!==undefined&&(typeof args.note!=='string'||args.note.length>2000))throw fail('note is too long.');
    if(args.url!==undefined&&args.media_id!==undefined)throw fail('Give either media_id or url, not both.');
    let placed=null;
    if(args.outcome==='done'){
      const b=JSON.parse(job.brief_json);
      placed=await place({...(args.url!==undefined?{url:args.url}:{media_id:args.media_id}),target:job.target,...(job.character_id?{character_id:job.character_id}:{}),...(job.location_id?{location_id:job.location_id}:{}),...(job.expression?{expression:job.expression}:{}),...(job.target==='figure'&&job.outfit?{outfit:job.outfit}:{}),...(job.time_of_day?{time_of_day:job.time_of_day}:{}),...(job.target==='scene'?{content:args.content||b.content_expected}:{}),prompt:b.prompt,...(args.model?{model:args.model}:{})});
    }
    run('UPDATE play_generation_jobs SET status=?,media_id=?,placed_media_id=?,note=?,model=?,updated_at=? WHERE id=?',args.outcome,args.media_id||null,placed?.placed_media_id||placed?.sprite_id||null,args.note||null,args.model||null,iso(),job.id);
    return {job_id:job.id,status:args.outcome,placed,next:args.outcome==='done'?'Placed. Call list_generation_needs for the next item.':args.outcome==='cancelled'?'Cancelled. No refusal cooldown applies.':'Recorded. This item is skipped for 7 days; continue with the next need.'};
  }
  // Everything Grok needs about one character's look in one call.
  function visualPack(args){
    check(args,['character_id']);const c=one('SELECT id,name FROM characters WHERE id=?',args?.character_id||'');if(!c)throw fail('Character not found',404);
    const o=origin.originOf(c.id),have=sprites.forCharacter(c.id).map(s=>s.expression),p=sprites.promptFor(c.id);
    return {character_id:c.id,name:c.name,origin:o.origin,origin_reason:o.reason,origin_basis:o.origin_basis,media_origin:o.media_origin,independently_verified:o.independently_verified,origin_policy:o.origin_policy,reference_photos_allowed:origin.mayUseReferences(c.id),everyday_references_allowed:origin.mayUseEverydayReferences(c.id),reference_proofs:origin.referenceProofs(c.id),
      approved_appearance:one('SELECT appearance FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',c.id)?.appearance||null,
      references:p.references??approvedReferences(c.id),...(p.references?{reference_policy:p.reference_policy,source_folder:p.source_folder,available_reference_count:p.available_reference_count,generation_ready:p.generation_ready,generation_blocked:p.generation_blocked}:{}),figures:{folder:p.folder,have,missing:FIGURE_EXPRESSIONS.map(x=>x.file).filter(f=>!have.includes(f)),shirtless:(()=>{const bare=sprites.forCharacter(c.id,{outfit:'shirtless'}).map(s=>s.expression);return {folder:path.join(p.folder,'felmeztelen'),have:bare,missing:FIGURE_EXPRESSIONS.map(x=>x.file).filter(f=>!bare.includes(f))};})(),
        intimate:(()=>{const close=sprites.forCharacter(c.id,{outfit:'intimate'}).map(s=>s.expression);return {folder:path.join(p.folder,'intim'),have:close,missing:INTIMATE_EXPRESSIONS.filter(f=>!close.includes(f))};})()},
      shared_scenes:one("SELECT count(*) n FROM play_inserts WHERE kind='scene' AND character_id=?",c.id).n,
      jobs:all('SELECT id,target,status,expression,outfit,updated_at FROM play_generation_jobs WHERE character_id=? ORDER BY updated_at DESC LIMIT 10',c.id)};
  }
  // In-scope collection pictures not approved as references yet: suggestions only.
  function referenceCandidates({per_character=6}={}){
    if(!Number.isInteger(per_character)||per_character<1||per_character>20)throw fail('per_character is 1–20.');
    const out=[];
    for(const c of cast()){
      const row=one('SELECT references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',c.id);
      let approved=new Set();try{approved=new Set(JSON.parse(row?.references_json||'[]').map(r=>r.media_id));}catch{}
      const found=[];
      for(const m of all("SELECT m.id FROM active_media m JOIN depictions d ON d.media_id=m.id AND d.character_id=? WHERE m.kind='image' AND NOT EXISTS(SELECT 1 FROM play_asset_sources s WHERE s.media_id=m.id) ORDER BY m.relative_path LIMIT 300",c.id)){
        if(approved.has(m.id))continue;if(origin.proofOf(m.id)==='owner_declared_fictional_ai')found.push(m.id);
      }
      if(found.length)out.push({character_id:c.id,name:c.name,count:found.length,media_ids:found.slice(0,per_character),approved_references:approved.size});
    }
    return {origin_policy:origin.policy,characters:out.sort((a,b)=>b.count-a.count)};
  }
  // Several jobs at once from the top needs, so a session can work through a list.
  async function startBatch(args={}){
    check(args,['target','count']);const count=args.count??5;if(!Number.isInteger(count)||count<1||count>10)throw fail('count is 1–10.');
    const list=(await needs({limit:count,...(args.target?{target:args.target}:{})})).needs,out=[];
    for(const n of list){const a={target:n.target,...(n.character_id?{character_id:n.character_id}:{}),...(n.location_id?{location_id:n.location_id}:{}),...(n.expression?{expression:n.expression}:{}),...(n.outfit?{outfit:n.outfit}:{}),...(n.time_of_day?{time_of_day:n.time_of_day}:{})};
      try{out.push(await startJob(a));}catch(e){out.push({target:n.target,error:e.message});}}
    return {jobs:out,remaining_needs:Math.max(0,(await needs({limit:100})).total)};
  }
  // The owner may clear a refused/failed item so it is offered again (only from the desktop).
  function clearJob(id){const j=one('SELECT status FROM play_generation_jobs WHERE id=?',id);if(!j)throw fail('Job not found',404);
    if(!['refused','failed','open'].includes(j.status))throw fail('Only open, refused or failed jobs can be cleared.',409);
    run("UPDATE play_generation_jobs SET status='cleared',updated_at=? WHERE id=?",iso(),id);return {job_id:id,status:'cleared'};}
  function jobs({status=null,limit=30}={}){
    if(status&&!['open','done','refused','failed','cancelled'].includes(status))throw fail('Unknown status.');
    reconcile();
    return {jobs:all(`SELECT j.id,j.target,j.status,j.expression,j.outfit,j.time_of_day,j.note,j.model,j.created_at,j.updated_at,j.brief_json,c.name character,l.name location FROM play_generation_jobs j LEFT JOIN characters c ON c.id=j.character_id LEFT JOIN locations l ON l.id=j.location_id ${status?'WHERE j.status=?':''} ORDER BY j.updated_at DESC LIMIT ?`,...(status?[status,limit]:[limit]))
        // Open jobs carry their brief, so a Grok session can pick up jobs the owner opened.
        .map(({brief_json,...j})=>{if(j.status!=='open')return j;try{return {...j,brief:JSON.parse(brief_json)};}catch{return j;}}),
      counts:Object.fromEntries(all('SELECT status,count(*) n FROM play_generation_jobs GROUP BY status').map(r=>[r.status,r.n]))};
  }
  // MCP operations (via /api/mcp-backgrounds). write:true needs trusted mode.
  const ops={
    instructions:{run:a=>{check(a,[]);return {version:GENERATION_PLAYBOOK.version,instructions:GENERATION_PLAYBOOK.text};}},
    needs:{run:a=>needs(a)},brief:{run:a=>brief(a)},jobs:{run:a=>jobs(a)},visual_pack:{run:a=>visualPack(a)},reference_candidates:{run:a=>referenceCandidates(a)},
    character_origin:{run:a=>{if(!uuid.test(a?.character_id||''))throw fail('character_id is required.');return {character_id:a.character_id,...origin.originOf(a.character_id),reference_photos_allowed:origin.mayUseReferences(a.character_id),everyday_references_allowed:origin.mayUseEverydayReferences(a.character_id),reference_proofs:origin.referenceProofs(a.character_id)};}},
    job_start:{write:true,run:a=>startJob(a)},job_batch:{write:true,run:a=>startBatch(a)},job_finish:{write:true,run:timed('job_finish',a=>finishJob(a))},place_asset:{write:true,run:timed('place_asset',a=>place(a))}
  };
  // Desktop (owner) routes for the Élő világ panel.
  async function handle({p,req,body,json}){
    if(p==='/api/play/generation'&&req.method==='GET'){json({...(await needs({limit:30})),...jobs({limit:30})});return true;}
    if(p==='/api/play/generation/candidates'&&req.method==='GET'){json(referenceCandidates());return true;}
    const m=p.match(/^\/api\/play\/generation\/jobs\/([0-9a-f-]{36})\/clear$/i);
    if(m&&req.method==='POST'){json(clearJob(m[1]));return true;}
    return false;
  }
  // The owner asks again for a picture (Képműhely: regenerate) with what to do differently.
  // An open job for the same target is reused, so repeated clicks never stack up.
  async function reopen(args,note=''){
    const b=await brief(args),same=one("SELECT id,brief_json FROM play_generation_jobs WHERE status='open' AND target=? AND character_id IS ? AND location_id IS ? AND expression IS ? AND time_of_day IS ? AND (target<>'figure' OR coalesce(outfit,'dressed')=?) ORDER BY updated_at DESC LIMIT 1",
      b.target,b.character_id||null,b.location_id||null,b.expression||null,b.time_of_day||null,b.outfit||'dressed');
    if(!same)return startJob(args,note);
    const next={...b,...(note?{owner_note:note}:{})};run('UPDATE play_generation_jobs SET brief_json=?,updated_at=? WHERE id=?',JSON.stringify(next),iso(),same.id);
    return {job_id:same.id,reused:true,...next};
  }
  // The picture bytes of image (ChatGPT file), url or media_id, checked like any placed picture
  // (used by the town map tools, 2026-11-13).
  async function imageBytes(args){const a=fromImage(args);if((a.media_id===undefined)===(a.url===undefined))throw fail('Give one of image, url or media_id.');
    if(a.media_id!==undefined&&!uuid.test(a.media_id))throw fail('media_id is required.');return a.url!==undefined?bytesFromUrl(a.url):bytesOf(a.media_id);}
  return {needs,brief,place,startJob,startBatch,finishJob,clearJob,jobs,reconcile,reopen,ops,handle,imageBytes,setFeedback:fn=>{feedbackFor=fn;}};
}
