import {installPlayTurnRevisions} from './play-turn-revisions.mjs';
// Play mode v1: Palor moves on the creator's location tree, sees who is where, and talks
// live with characters (Grok via the world engine's capped ask()). Ending a conversation
// is a save point: both sides get a memory, the character's level towards Palor may move
// by one step, and the world engine sees it as an event of the day.
// Knowledge boundary: a character's prompt gets his own profile, his own note about
// Palor, his memories and today's events. Palor's private notes about him never go in.
import {readFileSync,promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SLOTS,LEVELS,WEEKDAYS,localDay,slotIndexAt,worldDayAt,weekdayOf,addDays,clip} from './world-common.mjs';
import {createTalkHistory} from './talk-history.mjs';
import {createLocationTree} from './location-tree.mjs';
import {installSceneImages} from './scene-images.mjs';
import {createMediaDirector,imageSize} from './media-director.mjs';
import {partialJsonString} from './world-ai.mjs';
import {ROLE_TEXT,describeActivity,moodOf,LEVEL_STYLE,CLOSENESS_RULES,TIME_MOOD,STAGE_ALLOW,BEATS,BEAT_WANT,MAX_DAILY_RISES,PACES,PACE_TEXT,PHONE_MOODS,cleanChoices} from './play/rules.mjs';
import {createPlayScenes} from './play/scenes.mjs';
import {palorVoice,speechOf,PALOR_VOICE_HEAD,CHOICE_RULES} from './play/palor-voice.mjs';
import {castProfileTexts} from './profile-prompt.mjs';
import {innerInstruction} from './inner-state.mjs';
import {appraisalLines,appraiseEvent} from './appraisal.mjs';
import {agendaFor} from './agenda.mjs';
import {stanceLines} from './stance.mjs';
// Fact rules for save-point summaries (E6, 2026-11-21), after Covel plugins/world-ir (MIT): only
// what really happened counts as fact; a promise is not its keeping, a question not consent.
const FACT_RULES='Ténykezelés: kérés, ígéret, próbálkozás, kérdés, feltételezés vagy idézett beszámoló NEM megtörtént esemény ("megígérte, hogy visszaadja" nem azt jelenti, hogy visszaadta; amit valaki csak hallott, az nem a saját élménye); minden mondat a kimondójáé, az "én" mindig a beszélőt jelenti; Palor döntéseit, érzéseit és beleegyezését ne találd ki, csak azt, amit kimondott vagy tett.';
import {effectiveIntensity} from './inner-state.mjs';
import {createPlayRecords} from './play/records.mjs';
import {TALK_MINUTES} from './game-clock.mjs';
import {kindOf,KIND_LABEL,chains,anchorOf as siteOf,townOf,travelMinutes,vehicleOwner,rollEncounter,isSettlement,isRegion,isPassage,isOriginName,originChild,originIndex,arrivalOf,passagesOf,travelOptions,trainBetween,TRAVEL_MODES,walkOnly,bikeAllowed,trainRunsAt,ridesWith,transportPlace,tripScenePlaces,rollRoadside} from './place-network.mjs';
import {installPlayStories,storyTownOf,STORY_RATES} from './play-stories.mjs';
import {BACKDROP_OK_SQL} from './play/backdrops.mjs';
import {safeName as bgFolderName} from './background-zip.mjs';

const STATE_KEY='play:state';

export function installPlayMode({db,one,all,run,transaction,fail,dataDir,root=null,worldEngine,characterPolicy=null,sprites=null,locationTree=createLocationTree(dataDir),gameClock=null,now=gameClock?.now||(()=>new Date()),random=Math.random,mayUseReferences=()=>true,mayUseEverydayReferences=mayUseReferences,intimateAllowed=mayUseReferences,onMeeting=null}){
  // A failed proposal (first meeting story event / relationship line) never blocks saving the talk.
  const meetingSaved=eventId=>{try{onMeeting?.(eventId);}catch(e){console.error('first-meeting proposal failed:',e.message);}};
  // A police uniform is presentation-only and appears only when the character's explicit
  // weekly schedule places him at one of his work locations. Appointments/events do not
  // silently change his uniform; the base everyday figure remains the fallback.
  const figures=cid=>{
    if(!sprites)return [];
    const c=clock(),workLocation=scheduled(cid,c.day,SLOTS[c.slot_index].id);
    if(workLocation&&one("SELECT 1 FROM world_places WHERE character_id=? AND location_id=? AND role='work'",cid,workLocation)&&sprites.forCharacter(cid,{outfit:'police'}).length)
      return sprites.forCharacter(cid,{outfit:'police'});
    return sprites.forCharacter(cid);
  };
  // Shirtless set ("felmeztelen" subfolder): the play screen shows it only in undressing/intimate moments.
  const shirtless=cid=>sprites?sprites.forCharacter(cid,{outfit:'shirtless'}):[];
  const intimateFigures=cid=>sprites?sprites.forCharacter(cid,{outfit:'intimate'}):[];
  // His height for sizing the figure on the stage (2026-11-13): the first "180 cm" or
  // "178–183 cm" in the approved appearance, the profile's appearance text or the Szellemprofil
  // look/anatomy fields; a range counts as its middle. Unknown stays null (the stage uses an
  // average). Presentation only: nothing is written or guessed into a profile.
  const HEIGHT=/(?:^|[^\d])(1[5-9]\d|20\d|21[0-5])(?:\s*[–-]\s*(1[5-9]\d|20\d|21[0-5]))?\s*cm/;
  function heightOf(cid){
    const ghost=(()=>{try{const v=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+cid)?.value||'{}').values||{};return ['appearance_summary','appearance_detail','anatomy'].map(k=>v[k]?.value||'');}catch{return [];}})();
    for(const text of [one('SELECT appearance FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid)?.appearance,one('SELECT appearance FROM characters WHERE id=?',cid)?.appearance,...ghost]){
      const m=String(text||'').match(HEIGHT);if(m)return m[2]?Math.round((+m[1]+ +m[2])/2):+m[1];
    }
    return null;
  }
  // Palor's things that stay where he leaves them: a car parked at Feri's stays there until
  // he drives it away; a bag he puts down waits in that room.
  // Uploads that were copied into a Play folder (figure, backdrop, scene): the source stays in
  // the catalogue but is never shown again as a photo of the character (play-assets.mjs).
  db.exec('CREATE TABLE IF NOT EXISTS play_asset_sources(media_id TEXT PRIMARY KEY,target TEXT NOT NULL,placed_at TEXT NOT NULL)');
  db.exec("CREATE TABLE IF NOT EXISTS play_items(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('vehicle','item')),node_id TEXT,carried INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
  db.exec(readFileSync(new URL('./migrations/028-play-mode.up.sql',import.meta.url),'utf8'));
  // Group scenes: who takes part (participants_json) and which character said each line.
  db.exec('CREATE TABLE IF NOT EXISTS play_line_speaker(line_id TEXT PRIMARY KEY,character_id TEXT NOT NULL)');
  // memo_json (2026-11-12): a running summary of a long talk ({text, lines}), written by the reply
  // call itself, so lines that no longer fit the prompt are not simply forgotten.
  for(const [col,type] of [['rewound_at','TEXT'],['mode',"TEXT NOT NULL DEFAULT 'normal'"],['participants_json','TEXT'],['memo_json','TEXT']])if(!all('PRAGMA table_info(play_conversations)').some(c=>c.name===col))db.exec(`ALTER TABLE play_conversations ADD COLUMN ${col} ${type}`);
  // ---- intimacy protocol ----------------------------------------------------------------
  // Owner switch (on from the start, 2026-11-10) + the relationship decide what may appear:
  //  none     – switch off: everyday pictures only (open hostility, level -2, counts as
  //             intimate since 2026-11-15, with an angry, rough tone: hostileWith)
  //  flirt    – strangers and tense relations (level -1..0): nude pictures, flirting
  //  intimate – acquaintance or closer (level ≥ 1), or an intimate moment with Palor in the
  //             last 14 days: explicit pictures/videos and sex scenes (consenting adults).
  db.exec('CREATE INDEX IF NOT EXISTS play_conversations_character ON play_conversations(character_id,status);CREATE INDEX IF NOT EXISTS world_messages_from ON world_messages(from_character_id,world_day);');
  const PLAY_SETTINGS='play:settings';
  // The game is adult from the start (owner decision 2026-11-10); the switch can still turn it off.
  const playSettings=()=>({adult:true,text_speed:'normal',auto_scene:true,story_rate:'normal',quick_send:false,travel_always_ask:false,guest_image_provider:'openai',talk_view:'vn',...(()=>{try{return JSON.parse(one('SELECT value FROM application_settings WHERE key=?',PLAY_SETTINGS)?.value||'{}');}catch{return {};}})()});
  function savePlaySettings(body){
    const s=playSettings();
    if(body.adult!==undefined){if(typeof body.adult!=='boolean')throw fail('Choose on or off.');s.adult=body.adult;}
    if(body.auto_scene!==undefined){if(typeof body.auto_scene!=='boolean')throw fail('Choose on or off.');s.auto_scene=body.auto_scene;}
    if(body.quick_send!==undefined){if(typeof body.quick_send!=='boolean')throw fail('Choose on or off.');s.quick_send=body.quick_send;}
    if(body.travel_always_ask!==undefined){if(typeof body.travel_always_ask!=='boolean')throw fail('Choose on or off.');s.travel_always_ask=body.travel_always_ask;}
    if(body.guest_image_provider!==undefined){if(!['openai','sogni'].includes(body.guest_image_provider))throw fail('Choose a supported portrait provider.');s.guest_image_provider=body.guest_image_provider;}
    if(body.talk_view!==undefined){if(!['vn','chat'].includes(body.talk_view))throw fail('Válassz párbeszéd- vagy csevegő nézetet.');s.talk_view=body.talk_view;}
    if(body.text_speed!==undefined){if(!['slow','normal','fast','instant'].includes(body.text_speed))throw fail('Unknown text speed.');s.text_speed=body.text_speed;}
    if(body.story_rate!==undefined){if(!Object.hasOwn(STORY_RATES,body.story_rate))throw fail('Unknown story frequency.');s.story_rate=body.story_rate;}
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',PLAY_SETTINGS,JSON.stringify(s));return s;
  }
  // An illustrated town map the owner may drop into 20_SHARED_MEDIA/Játék térképek, named after
  // the town ("Káloz.png"); it lies under the pins of the town plan. Read only, never moved.
  const TOWN_MAP_DIR=['20_SHARED_MEDIA','Játék térképek'],MAP_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
  // A town map's file name: Windows-safe (no trailing dot/space, no device names like CON).
  const townMapName=s=>{const v=String(s||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').trim().replace(/[. ]+$/,'').trim();return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(v)?v+'_':v;};
  const foldName=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
  async function townMapFile(town){
    if(!root)return null;const dir=path.join(root,...TOWN_MAP_DIR);
    let names;try{names=await fs.readdir(dir);}catch{try{await fs.mkdir(dir,{recursive:true});}catch{}return null;}
    const want=[town.short_name,town.name].filter(Boolean).flatMap(n=>[foldName(n),foldName(townMapName(n))]);
    const hit=names.find(f=>MAP_TYPES[path.extname(f).toLowerCase()]&&want.includes(foldName(path.basename(f,path.extname(f)))));if(!hit)return null;
    const file=path.join(dir,hit);if(path.relative(dir,file).startsWith('..'))return null;
    const st=await fs.stat(file).catch(()=>null);if(!st?.isFile()||st.size>25*1024*1024)return null;
    let size=null;try{const h=await fs.open(file,'r');try{const b=Buffer.alloc(262144);const {bytesRead}=await h.read(b,0,b.length,0);size=imageSize(b.subarray(0,bytesRead));}finally{await h.close();}}catch{}
    return {file,type:MAP_TYPES[path.extname(hit).toLowerCase()],version:Math.round(st.mtimeMs),size};
  }
  // The drawing space of a town plan: 1200 wide; as tall as the map picture's own proportions
  // (a 3:2 picture → 800), else 720.
  const planHeight=img=>img?.size?.w&&img?.size?.h?Math.round(Math.max(480,Math.min(1200,1200*img.size.h/img.size.w))):720;
  // The pins of a town or region map: a town's own places, without its street (a passage); a
  // region's places at every depth (the forest and the mountain behind the car park), without
  // entry rooms (the lake shore sits at the lake's pin).
  function mapPlaces(nodes,town){
    const live=n=>!n.archived&&n.placed!==false&&!isPassage(n);
    if(!isRegion(town))return nodes.filter(n=>n.parent_id===town.id&&live(n));
    const out=[],walk=id=>{for(const n of nodes)if(n.parent_id===id&&live(n)){if(!isOriginName(n))out.push(n);walk(n.id);}};walk(town.id);return out;
  }
  const REGION_NOTE='Káloz határa: the countryside south-west of the village Káloz (Fejér county). Draw it as a landscape map, not a town: the lake (Tó) is the big, eye-catching water with a small sandy shore (Tópart) on the village side; right beside the lake begins a large, dense forest like the Bakony or Vértes hills; the forest car park (Erdei parkoló) is at the forest edge nearest the village, with a dirt road from the fields; the forest (Erdő) fills the middle; the mountain (Mountain/Hegy) rises out of the forest far from the village, wild and little explored, with a hiking spot (Kiránduló hely) high up. Fields at the village edge.';
  // Towns and their own places, for whoever draws a town map (connector, read-only).
  async function townPlaces({town_id}={}){
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n]));
    const tops=[...new Map(nodes.filter(n=>!n.archived).map(n=>townOf(byId,n.id)).filter(Boolean).map(t=>[t.id,t])).values()];
    // Only settlements get a town map (2026-11-13: houses, a van and a forest at the top of the
    // tree were offered as towns and got "maps"). Standalone places are listed apart: they get
    // eye-level pictures as their own background instead.
    // Regions (Káloz határa: lake and forest) get a map of their own like a town (2026-11-14).
    const towns=[...tops.filter(isSettlement),...nodes.filter(n=>isRegion(n)&&!n.archived&&n.placed!==false)],standalone=tops.filter(t=>!isSettlement(t)&&t.kind!=='collection');
    const pick=town_id?towns.filter(t=>t.id===town_id):towns;if(town_id&&!pick.length)throw fail('Town not found.',404);
    const roomsOf=id=>nodes.filter(c=>c.parent_id===id&&!c.archived&&!isPassage(c)).slice(0,20).map(c=>({id:c.id,location_id:c.location_id||null,name:c.short_name||c.name}));
    const out=[];for(const t of pick){const img=await townMapFile(t);
      out.push({town_id:t.id,name:t.short_name||t.name,...(isRegion(t)?{region:true,note:REGION_NOTE}:{}),has_map_picture:!!img,plan_size:{width:1200,height:planHeight(img)},
        places:mapPlaces(nodes,t).map(n=>({id:n.id,name:n.short_name||n.name,kind:kindOf(n),location_id:n.location_id||null,rooms:roomsOf(n.id)}))});}
    return {towns:out,...(town_id?{}:{standalone_places:standalone.map(n=>({id:n.id,name:n.short_name||n.name,kind:kindOf(n),location_id:n.location_id||null,rooms:roomsOf(n.id),note:'Not a town: no town map. Its own picture is an eye-level background (and its rooms get room pictures).'}))})};
  }
  // Saves a drawn town map as <town>.<ext> in Játék térképek; an earlier picture is kept under a
  // dated name (never overwritten). Presentation only.
  async function saveTownMap(args,imageBytes){
    const town=(await tree()).find(n=>n.id===args?.town_id);if(!town)throw fail('Town not found.',404);
    if(!isSettlement(town)&&!isRegion(town))throw fail('This place is not a town: save its picture as a background (place_play_asset, target background), not as a town map.',409);
    if(!root)throw fail('No media folder.',409);
    const name=townMapName(town.short_name||town.name);if(!name)throw fail('Town not found.',404);
    const got=await imageBytes({...(args.image!==undefined?{image:args.image}:{}),...(args.url!==undefined?{url:args.url}:{}),...(args.media_id!==undefined?{media_id:args.media_id}:{})});
    const dir=path.join(root,...TOWN_MAP_DIR);await fs.mkdir(dir,{recursive:true});
    const real=await fs.realpath(dir);if(!real.startsWith((await fs.realpath(root))+path.sep))throw fail('The town map folder points outside your resource folder.',403);
    const old=await townMapFile(town);
    // The new picture is written first (under a name the map lookup ignores); only then is the old
    // one moved aside, so a failed write never leaves the town without a map.
    const file=path.join(real,`${name}.${got.type.extension}`),partial=file+'.'+randomUUID()+'.partial';
    await fs.writeFile(partial,got.bytes,{flag:'wx'});
    let kept=null;
    try{
      // The kept file is named with the real local time of the change (not the game clock).
      if(old){const d=new Date(),p2=v=>String(v).padStart(2,'0'),stamp=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}`,ext=path.extname(old.file);let n=0,target;
        do{target=path.join(real,`${path.basename(old.file,ext)} (régi ${stamp}${n?' '+n:''})${ext}`);n++;}while(await fs.stat(target).then(()=>true,()=>false));
        await fs.rename(old.file,target);kept={from:target,to:old.file};}
      if(await fs.stat(file).then(()=>true,()=>false))throw fail('A town map file with this name already exists.',409);
      await fs.rename(partial,file);
    }catch(e){
      await fs.rm(partial,{force:true}).catch(()=>{});
      if(kept)await fs.rename(kept.from,kept.to).catch(()=>{});
      throw e;
    }
    const img=await townMapFile(town);
    return {town_id:town.id,file:path.join(...TOWN_MAP_DIR,path.basename(file)),plan_size:{width:1200,height:planHeight(img)},previous_kept:!!old,next:'Now call save_town_layout with where each place stands on this picture (fractions 0–1 of its width and height).'};
  }
  // Pin positions as fractions of the map picture (0–1), stored in plan units.
  async function saveTownLayout(args){
    const nodes=await tree(),town=nodes.find(n=>n.id===args?.town_id);if(!town)throw fail('Town not found.',404);
    // A list of {place_id,x,y} (the connector's shape) or a {place_id:[x,y]} map.
    let pos=args.positions;if(Array.isArray(pos)){if(pos.some(p=>!p||typeof p!=='object'||typeof p.place_id!=='string'))throw fail('Invalid positions.');pos=Object.fromEntries(pos.map(p=>[p.place_id,[p.x,p.y]]));}
    if(!pos||typeof pos!=='object'||!Object.keys(pos).length||Object.keys(pos).length>300)throw fail('Invalid positions.');
    const ids=new Set(mapPlaces(nodes,town).map(n=>n.id)),H=planHeight(await townMapFile(town)),key='play:town-layout:'+town.id;
    let saved={};try{saved=JSON.parse(one('SELECT value FROM application_settings WHERE key=?',key)?.value||'{}').positions||{};}catch{}
    const unknown=[];for(const [id,v] of Object.entries(pos)){if(!ids.has(id)){unknown.push(id);continue;}
      if(!Array.isArray(v)||v.length!==2||!v.every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw fail('Invalid positions.');saved[id]=[Math.round(v[0]*1200),Math.round(v[1]*H)];}
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify({positions:saved,updated_at:iso()}));
    return {town_id:town.id,placed:Object.keys(pos).length-unknown.length,unknown_place_ids:unknown};
  }
  // ---- ways out of a room (2026-11-13) -------------------------------------------------------
  // Inside a house Palor moves like in a point-and-click game: on the room's picture each way out
  // is a door marker where the door is drawn (x, y as fractions of the picture), or an arrow at
  // the edge in its direction. Presentation only, kept per place in 'play:room-exits:<id>'.
  const DIRS=['left','right','forward','back','up','down'];
  const isPlaceNode=n=>!!n&&(!n.kind||n.kind==='place');
  function neighbours(nodes,id){
    const byId=new Map(nodes.map(n=>[n.id,n])),n=byId.get(id);if(!n)return [];
    // A car is a vehicle, not a room: never a door (owner, 2026-11-14).
    const live=x=>x&&!x.archived&&x.placed!==false&&!isPassage(x)&&kindOf(x)!=='vehicle',town=townOf(byId,id),parent=n.parent_id?byId.get(n.parent_id):null,out=[];
    // Entry rooms (2026-11-14): a place with an entry room (the lake) is left by that room only;
    // the entry room (living room, lake shore) leads to every other room and out; any other room
    // of the building leads back to the entry room.
    const own=originChild(nodes,id,origins(nodes));
    if(own)return [{id:own.id,name:own.short_name||own.name,relation:'inside'}];
    for(const c of nodes)if(c.parent_id===id&&live(c))out.push({id:c.id,name:c.short_name||c.name,relation:'inside'});
    const building=parent&&parent.id!==town?.id&&isPlaceNode(parent)?parent:null,entry=building?originChild(nodes,building.id,origins(nodes)):null;
    if(building&&entry&&entry.id!==id){out.push({id:entry.id,name:entry.short_name||entry.name,relation:'back'});return out;}
    if(building){for(const c of nodes)if(c.parent_id===building.id&&c.id!==id&&live(c))out.push({id:c.id,name:c.short_name||c.name,relation:'next'});
      // From the lake shore one goes into the lake itself; a home itself is not a room.
      if(building.location_id&&(!entry||kindOf(building)==='nature'))out.push({id:building.id,name:building.short_name||building.name,relation:entry?'inside':'back'});}
    if(town&&town.id!==id&&isPlaceNode(town)&&streetReachable(byId,n,town))out.push({id:town.id,name:town.short_name||town.name,relation:'street'});
    return out;
  }
  // The street is a way out only near the door (2026-11-14): from a place on the street, from a
  // room of it, or from an entry room. Deeper in (the mountain behind the forest, the villages in
  // the fantasy world behind the wardrobe) one walks back the way one came.
  function streetReachable(byId,n,town){
    if(isOriginName(n))return true;let depth=0;for(let p=n;p&&p.id!==town.id;p=p.parent_id?byId.get(p.parent_id):null)depth++;
    // A room of a building that is a place itself (the hospital) is left through the building;
    // only when the building has no place of its own do its rooms open onto the street.
    // Owner (2026-11-14): when the room's picture shows its own street door and it is marked on the
    // picture (a door position, not just an arrow), that door leads out too (the gym's changing room).
    if(depth===2){const parent=byId.get(n.parent_id);return !parent?.location_id||Number.isFinite(savedExits(n.id)[town.id]?.x);}
    return depth<=1;
  }
  // Rooms one level inside a building may get a street door marked on their picture.
  const streetDoorPossible=(byId,n,town)=>{let depth=0;for(let p=n;p&&p.id!==town.id;p=p.parent_id?byId.get(p.parent_id):null)depth++;return depth===2;};
  const exitsKey=id=>'play:room-exits:'+id;
  function savedExits(id){try{return JSON.parse(one('SELECT value FROM application_settings WHERE key=?',exitsKey(id))?.value||'{}').exits||{};}catch{return {};}}
  // exits: {to_id:{dir?,x?,y?}} or a list of {to_place_id,direction?,x?,y?}; merge=false replaces.
  async function saveExits(placeId,exits,{merge=true}={}){
    const nodes=await tree(),here=nodes.find(n=>n.id===placeId);if(!here)throw fail('Place not found',404);
    const allowed=new Set(neighbours(nodes,placeId).map(x=>x.id));
    {const byId=new Map(nodes.map(n=>[n.id,n])),town=townOf(byId,placeId);if(town&&isPlaceNode(town)&&streetDoorPossible(byId,here,town))allowed.add(town.id);}
    // remove:true takes a saved door or arrow off (2026-11-14: a wrong one could not be cleared).
    const list=Array.isArray(exits)?exits.map(e=>[e?.to_place_id,e?.remove===true?null:{dir:e?.direction,x:e?.x,y:e?.y}]):Object.entries(exits||{});
    if(list.length>40)throw fail('Invalid exits.');
    const next=merge?savedExits(placeId):{},unknown=[];
    for(const [to,v] of list){
      // A stale entry (a way out that no longer exists) can always be removed.
      if(v===null&&typeof to==='string'&&Object.hasOwn(next,to)){delete next[to];continue;}
      if(typeof to!=='string'||!allowed.has(to)){unknown.push(to);continue;}
      if(v===null){delete next[to];continue;}
      const e={};if(v?.dir!==undefined&&v.dir!==null){if(!DIRS.includes(v.dir))throw fail('Invalid exits.');e.dir=v.dir;}
      if(v?.x!==undefined||v?.y!==undefined){if(![v.x,v.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw fail('Invalid exits.');e.x=Math.round(v.x*1000)/1000;e.y=Math.round(v.y*1000)/1000;}
      const merged={...(merge?next[to]:{}),...e};
      // A direction without a position turns a door into an edge arrow: the old position goes.
      if(e.dir!==undefined&&e.x===undefined){delete merged.x;delete merged.y;}
      next[to]=merged;}
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',exitsKey(placeId),JSON.stringify({exits:next,updated_at:iso()}));
    return {place_id:placeId,exits:next,unknown_place_ids:unknown};
  }
  async function roomExitsView(placeId){const nodes=await tree(),n=nodes.find(x=>x.id===placeId);if(!n)throw fail('Place not found',404);
    return {place_id:placeId,name:n.short_name||n.name,location_id:n.location_id||null,neighbours:neighbours(nodes,placeId),saved:savedExits(placeId)};}
  const roomOps={room_exits:{run:a=>roomExitsView(String(a?.place_id||''))},room_exits_save:{write:true,run:a=>saveExits(String(a?.place_id||''),a?.exits)}};
  // ---- ChatGPT orders for maps and backgrounds (owner, 2026-11-14) ------------------------------
  // Like the Szereplőgyár: the program works out what is missing, and ChatGPT only has to be told
  // "nézd meg a nyitott rendeléseket". Nothing is stored: an order is open while its work is
  // missing, and closes by itself when the picture, layout or doors are saved.
  //  - map: a town or region without a map picture, with pins not placed on it, or marked for
  //    redrawing after the place tree changed ('play:map-redo', cleared by save_town_map).
  //  - background (Háttérgyár): a place without its own backdrop. The picture must show a door,
  //    stairs or path for every way out, then the doors are saved on it.
  //  - doors: a place with a backdrop whose ways out are not all placed on the picture.
  const MAP_REDO='play:map-redo';
  const mapRedo=()=>{try{return JSON.parse(one('SELECT value FROM application_settings WHERE key=?',MAP_REDO)?.value||'{}');}catch{return {};}};
  // Backgrounds and doors are shared between two assistants (owner, 2026-11-14): Grok takes the
  // Káloz area, Székesfehérvár, Sárbogárd, Gárdony and Pécs; ChatGPT the rest (Budapest, M7,
  // Balaton, travel places). Maps stay ChatGPT's (it saves pictures and layouts itself).
  const GROK_TOWNS=new Set(['kaloz','szekesfehervar','sarbogard','gardony','pecs']);
  // Why a picture file cannot be opened as JPEG/PNG, or null when it can (first bytes only).
  async function unreadableImage(mediaId){
    const m=one('SELECT relative_path FROM active_media WHERE id=?',mediaId);if(!m||!root)return m?null:'the picture is no longer in the catalogue';
    let h;try{h=await fs.open(path.join(root,m.relative_path),'r');const b=Buffer.alloc(12);await h.read(b,0,12,0);
      if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return null;if(b[0]===0xff&&b[1]===0xd8)return null;
      return b.toString('latin1',0,4)==='RIFF'?'the file is a WebP picture behind a .jpg/.png name':'the file is not a JPEG or PNG picture';}
    catch{return 'the picture file is missing';}finally{await h?.close();}
  }
  async function playOrders(){
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n])),{towns}=await townPlaces({}),redo=mapRedo(),images=placeImages();
    const map=[];
    for(const t of towns){
      let saved={};try{saved=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','play:town-layout:'+t.town_id)?.value||'{}').positions||{};}catch{}
      const unplaced=t.places.filter(p=>!saved[p.id]).map(p=>p.name),why=[!t.has_map_picture&&'no map picture',redo[t.town_id]&&'redraw: '+redo[t.town_id],unplaced.length&&'pins not placed: '+unplaced.join(', ')].filter(Boolean);
      if(why.length)map.push({town_id:t.town_id,name:t.name,...(t.region?{region:true,note:t.note}:{}),why,places:t.places,steps:t.has_map_picture&&!redo[t.town_id]?['save_town_layout (the picture is fine; only place the pins)']:['draw the map','save_town_map','save_town_layout']});
    }
    const backgrounds=[],doors=[];
    // Per-place override of the town split (owner, 2026-11-15: Gyuszi's house in Káloz goes to ChatGPT).
    let override={};try{override=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','play:order-worker')?.value||'{}');}catch{}
    for(const n of nodes){
      if(!n.location_id||n.archived||n.placed===false||['vehicle'].includes(kindOf(n))||!isPlaceNode(n))continue;
      const exits=neighbours(nodes,n.id).map(x=>({to_place_id:x.id,name:x.name,relation:x.relation})),own=images.get(n.location_id)||null,placed=savedExits(n.id);
      const town=townOf(byId,n.id),worker=['grok','chatgpt'].includes(override[n.id])?override[n.id]:GROK_TOWNS.has(foldName(town?.short_name||town?.name))?'grok':'chatgpt';
      // Grok cannot hand a picture to the program: the owner saves it into this watched folder.
      const catName=one('SELECT name FROM locations WHERE id=?',n.location_id)?.name||n.name;
      // ZIP delivery (owner, 2026-11-14): "<catalogue name folder>/<suggested file>.png" per picture.
      const zipFolder=bgFolderName(catName),zipFile=String(n.short_name||n.name).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'hatter';
      const item={place_id:n.id,location_id:n.location_id,name:n.short_name||n.name,path:n.path,kind:kindOf(n),worker,...(isPassage(n)?{passage:true}:{}),exits,
        save_folder:path.join('20_SHARED_MEDIA','Helyszín hátterek',zipFolder),zip_path:zipFolder+'/'+zipFile+'-nappal.png'};
      // A backdrop the assistants cannot open (missing file, or another format behind a .jpg/.png
      // name, e.g. a WebP) is ordered anew instead of waiting for doors (2026-11-14, Lángosozó).
      const broken=own?await unreadableImage(own):null;
      if(!own||broken)backgrounds.push(broken?{...item,replaces_media_id:own,why:broken}:item);
      // A way out counts as placed with a position on the picture, or with an edge direction
      // when the picture shows no door for it (2026-11-14: arrows kept the order open).
      // A passage (street, stairwell) is only walked through: it needs a picture, never doors.
      else if(!isPassage(n)){const open=exits.filter(e=>!Number.isFinite(placed[e.to_place_id]?.x)&&!placed[e.to_place_id]?.dir);if(open.length)doors.push({...item,background_media_id:own,exits_without_door:open});}
    }
    return {map_orders:map,background_orders:backgrounds,door_orders:doors,how:PLAY_ORDER_HOW};
  }
  const PLAY_ORDER_HOW={
    map:'For each map order: call list_town_places {town_id} for the current places. Draw an illustrated top-down map in a warm hand-painted storybook style, landscape 3:2 (1536×1024), NO text, labels, letters, numbers, legend, compass, frame or people. Give every listed place one recognisable building or spot where it would really be. Houses and flats appear only from outside as one building; never draw rooms or floor plans. Streets are roads, not buildings. A region (Káloz határa) is a landscape, not a town: follow its note. Save with save_town_map {town_id, image}; then look at the saved picture and save_town_layout with the centre of every place (fractions 0–1, at least 0.06 apart). If the order says only the pins are missing, keep the picture and only call save_town_layout.',
    background:'Háttérgyár. For each background order: get_generation_brief {target:"background", location_id, time_of_day:"nappal"} gives the prompt and the save target. Change the composition so that every way out listed in exits has a clear visible place on the picture: a door for a room (inside), a hallway or open doorway to the next room, the front door or gate for the street, stairs for up/down, a path or shore for outdoor places. Eye level, wide 16:9 or 3:2, photorealistic, empty of people, no text. Save with place_play_asset {target:"background", location_id, time_of_day:"nappal", image}. Then look at the saved picture and call save_room_exits {place_id, exits:[{to_place_id, x, y, direction}]} with x, y as fractions (0–1) at the middle of each drawn door, stairs or path. If a picture cannot be saved with place_play_asset and you hand pictures to the owner instead: if you can, deliver all pictures of this session as ONE ZIP whose entries are exactly the zip_path values; otherwise name the folder and file per picture as before (save_folder).',
    background_grok:'Háttérgyár for Grok. For each background order: get_generation_brief {target:"background", location_id, time_of_day:"nappal"} gives the prompt. Compose the picture so that every way out listed in exits has a clear visible place on it (a door for a room inside, an open doorway or hallway to the next room, the front door or gate to the street, stairs for up/down, a path or the shore outdoors). Eye level, wide 16:9 or 3:2, photorealistic, empty of people, no text. Generate it natively in this chat. You cannot hand the picture to the program: after each picture tell the owner, in Hungarian, the exact folder to save it into (save_folder, inside his Living Universe folder) and a file name ending in .png. If you can, deliver all pictures of this session as ONE ZIP whose entries are exactly the zip_path values (folder = the catalogue name of the place, never the town or tree path); otherwise name the folder and file per picture as before. The owner loads a ZIP in the studio and the program puts every picture in its place. The program reads that folder by itself; once the picture is in, the place shows up as a door order: then look at it with get_media and save the doors with save_room_exits.',
    doors:'For each door order: fetch the current background with get_media {media_id: background_media_id}, find where each listed way out is drawn (door, stairs, hallway, gate, path) and call save_room_exits {place_id, exits:[{to_place_id, x, y, direction}]}. When a way out has no plausible spot on the picture, give only direction (left, right, forward, back, up, down); the game shows an arrow at that edge. Never redraw a picture just for doors.',
    rules:'Draw only places; never draw or name a character. Presentation only: no canon, profile or catalogue change. If the generator declines, say so with the reason; never reword around a refusal. One town or up to five places per answer, then report in Hungarian what was saved and wait for "tovább".'
  };
  const townOps=imageBytes=>({...roomOps,...stories.pictureOps(imageBytes),town_places:{run:a=>townPlaces(a||{})},
    town_map_save:{write:true,run:async a=>{const r=await saveTownMap(a||{},imageBytes);const redo=mapRedo();if(redo[r.town_id]){delete redo[r.town_id];run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',MAP_REDO,JSON.stringify(redo));}return r;}},
    town_layout_save:{write:true,run:a=>saveTownLayout(a||{})},
    play_orders:{run:async a=>{let o=await playOrders();const only=a?.kind,who=a?.for;if(only!==undefined&&!['map','background','doors'].includes(only))throw fail('kind is map, background or doors.');
      if(who!==undefined&&!['grok','chatgpt'].includes(who))throw fail('for is grok or chatgpt.');
      if(who){const mine=x=>x.worker===who;o={...o,map_orders:who==='chatgpt'?o.map_orders:[],background_orders:o.background_orders.filter(mine),door_orders:o.door_orders.filter(mine)};}
      // offset (2026-11-14): the next page of a long list.
      const off=Math.max(0,Math.floor(Number(a?.offset)||0)),lim=x=>x.slice(off,off+Math.min(50,Number(a?.limit)||20));
      const how=who==='grok'?{background:PLAY_ORDER_HOW.background_grok,doors:PLAY_ORDER_HOW.doors,rules:PLAY_ORDER_HOW.rules}:o.how;
      return {...(who?{for:who,not_yours:who==='grok'?'Maps and the other towns\' backgrounds are ChatGPT\'s; never do them.':'The Káloz area, Székesfehérvár, Sárbogárd, Gárdony and Pécs backgrounds and doors are Grok\'s; never do them.'}:{}),
        open:{map:o.map_orders.length,background:o.background_orders.length,doors:o.door_orders.length},
        ...(!only||only==='map'?{map_orders:o.map_orders}:{}),...(!only||only==='background'?{background_orders:lim(o.background_orders)}:{}),...(!only||only==='doors'?{door_orders:lim(o.door_orders)}:{}),
        order_of_work:who==='grok'?'Backgrounds first (Káloz, Káloz határa, then the rest), then doors of pictures already in.':'Maps first (Káloz, Káloz határa, Székesfehérvár, Budapest, then the rest), then backgrounds, then doors.',how};}}});
  // Branching pop-up stories on the road and in the three home towns (play-stories.mjs).
  const stories=installPlayStories({db,one,all,run,transaction,fail,settings:playSettings,characterPolicy,random,now,root});
  // Which pictures Palor has already seen with whom (fresh ones come first next time).
  db.exec('CREATE TABLE IF NOT EXISTS play_seen(media_id TEXT NOT NULL,character_id TEXT NOT NULL,seen_at TEXT NOT NULL,PRIMARY KEY(media_id,character_id))');
  // A picture or video a character sent with a phone message (chosen by the media director).
  db.exec('CREATE TABLE IF NOT EXISTS play_line_media(line_id TEXT PRIMARY KEY,media_id TEXT NOT NULL,kind TEXT NOT NULL,level TEXT NOT NULL,reasons_json TEXT,created_at TEXT NOT NULL)');
  // In-person replies (2026-11-11): the moment the reply is at (beat), how it landed with him
  // (spark -1/0/+1), three suggested next lines for Palor, and the scene picture/video the
  // director chose for that moment (start time and speaker boxes for the bubbles).
  db.exec(`CREATE TABLE IF NOT EXISTS play_line_meta(line_id TEXT PRIMARY KEY,beat TEXT,spark INTEGER,choices_json TEXT);
    CREATE TABLE IF NOT EXISTS play_conversation_flags(conversation_id TEXT PRIMARY KEY,intimate_at TEXT);
    CREATE TABLE IF NOT EXISTS play_dates(appointment_id TEXT PRIMARY KEY,conversation_id TEXT,met_at TEXT,missed_noted_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS play_line_scene(line_id TEXT PRIMARY KEY,media_id TEXT NOT NULL,kind TEXT NOT NULL,level TEXT NOT NULL,beat TEXT,start_at REAL,display_json TEXT,created_at TEXT NOT NULL);`);
  // ---- owner's corrections during play (2026-11-15) -------------------------------------
  // "Attila never says 'doktor úr', he always calls him Géza": the owner writes a correction while
  // playing; it applies at once (owner decision) to every later reply of that character and wins
  // over his profile where they disagree. The profile itself is not rewritten; notes are kept
  // with time and can be withdrawn. Character policy still applies to what is written.
  db.exec('CREATE TABLE IF NOT EXISTS play_director_notes(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),text TEXT NOT NULL,created_at TEXT NOT NULL,withdrawn_at TEXT)');
  const directorNotes=cid=>all('SELECT id,text,created_at FROM play_director_notes WHERE character_id=? AND withdrawn_at IS NULL ORDER BY created_at',cid);
  const directorText=cid=>{const n=directorNotes(cid);return n.length?'AZ ALKOTÓ JAVÍTÁSAI (mindig ezek az irányadók; ha a profiloddal vagy az emlékeiddel ütköznek, ezek szerint viselkedj):\n'+n.map(x=>'- '+clip(x.text,400)).join('\n'):'';};
  function addDirectorNote(body){
    if(typeof body?.character_id!=='string'||!one('SELECT 1 FROM characters WHERE id=?',body.character_id))throw fail('Character not found',404);
    const text=String(body.text??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim();
    if(!text)throw fail('Write what should be different.');if(text.length>600)throw fail('The suggestion is too long (at most 600 characters).');
    // The same gender rule as every profile text (a correction cannot make a character female).
    characterPolicy?.assertProfile?.({id:body.character_id,biography:text});
    if(directorNotes(body.character_id).length>=30)throw fail('This character already has 30 corrections. Withdraw an old one first.',409);
    run('INSERT INTO play_director_notes VALUES(?,?,?,?,NULL)',randomUUID(),body.character_id,text,new Date().toISOString());
    return {notes:directorNotes(body.character_id)};
  }
  function withdrawDirectorNote(id){
    const n=one('SELECT character_id FROM play_director_notes WHERE id=? AND withdrawn_at IS NULL',id);if(!n)throw fail('Not found',404);
    run('UPDATE play_director_notes SET withdrawn_at=? WHERE id=?',new Date().toISOString(),id);
    return {notes:directorNotes(n.character_id)};
  }
  const markSeenPhoto=(cid,mid)=>{if(typeof mid==='string'&&/^[0-9a-f-]{36}$/i.test(mid)&&one('SELECT 1 FROM characters WHERE id=?',cid??'')&&one('SELECT 1 FROM media WHERE id=?',mid)){run('INSERT INTO play_seen VALUES(?,?,?) ON CONFLICT DO UPDATE SET seen_at=excluded.seen_at',mid,cid,iso());const pid=w.palor()?.id;director.markShown(mid,'scene',pid&&pid!==cid?[cid,pid]:[cid]);}return {ok:true};};
  // Day-part words in picture descriptions, to match backgrounds to the time of day.
  const NIGHT=/éjszak|éjjel|ejjel|este|sötét|lámpa|neon|hold|gyertya|night|evening|dark/i,DAY=/nappal|napfény|napsüt|reggel|délután|világos|daylight|sunny|morning/i;
  function intimacyStage(cid){
    if(!playSettings().adult)return 'none';
    const pid=w.palor()?.id;if(!pid)return 'none';
    const level=w.levelOf(cid,pid)??0;
    const recent=one("SELECT 1 FROM world_events WHERE rewound_at IS NULL AND status IN ('applied','accepted') AND json_extract(payload_json,'$.intimate')=1 AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) AND world_day>=? LIMIT 1",cid,localDay(new Date(now().getTime()-14*864e5)));
    // Owner decision 2026-11-10: NSFW from the start; strangers may flirt, and from acquaintance
    // on anything can happen if the character wants it. Owner decision 2026-11-15: open hostility
    // (level -2) no longer closes it: an intimate scene may start there too, angry and rough in
    // tone (hostileWith → CLOSENESS_RULES.hostile), still only if both want it.
    return level>=1||recent||level<=-2?'intimate':level>=-1?'flirt':'none';
  }
  // Open hostility towards Palor (level -2): an intimate scene with him is angry and rough.
  function hostileWith(cid){
    const pid=w.palor()?.id;return !!pid&&(w.levelOf(cid,pid)??0)<=-2;
  }
  const w=worldEngine.internals;
  const iso=()=>now().toISOString();
  // World day, weekday and day part: after midnight it is still the previous day's night.
  function clock(){const d=now(),index=slotIndexAt(d),day=worldDayAt(d),wd=weekdayOf(day);return {day,weekday:WEEKDAYS[wd],slot:SLOTS[index].label,slot_index:index,workday:wd>=1&&wd<=5,time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};}

  const clockHour=()=>Number(String(clock().time||'').slice(0,2));
  // Approved location tree with short names and full paths (shared, cached module).
  let treeCache={nodes:[],children:new Map()};
  async function tree(){treeCache=await locationTree.load();return treeCache.nodes;}
  const childrenOf=id=>treeCache.children.get(id)||[];
  // Entry-room index, built once per tree load (C2, 2026-11-14): the tree module returns the same
  // nodes array until the file changes, so the array itself is the cache key.
  const originMemo=new WeakMap();
  const origins=nodes=>{let m=originMemo.get(nodes);if(!m){m=originIndex(nodes);originMemo.set(nodes,m);}return m;};
  // Tree version (2026-11-14): a new number per loaded nodes array, so a client merging a trip
  // delta notices that the studio changed the tree and reloads the overview.
  const treeVersions=new WeakMap();let treeSeq=0;
  const treeVersion=nodes=>{let v=treeVersions.get(nodes);if(!v){v=++treeSeq;treeVersions.set(nodes,v);}return v;};
  // The node and everything below it (breadth-first through the children index).
  const descendants=(nodes,id)=>{const out=[id];for(let i=0;i<out.length;i++)for(const c of childrenOf(out[i]))out.push(c.id);return out;};

  // Where each autonomous character is now: the latest event of the current day part
  // with a place, else his routine by time of day (work on weekday daytime, home at
  // night). Earlier day parts do not pin him: by night he goes home. No AI call.
  // Cached (C3, 2026-11-14) while nothing could have moved anyone: same world day and day part,
  // same cast, and no write since (total_changes() counts this connection's writes, data_version
  // another connection's). Any write (appointment, invitation, wait, rewind…) recomputes.
  let posCache=null;
  function positions(){
    const c=clock(),cast=w.meetable();
    const v=one('SELECT total_changes() n'),dv=one('PRAGMA data_version');
    const key=[c.day,c.slot_index,v?.n,dv?.data_version,treeVersion(treeCache.nodes),cast.map(x=>x.id).join(',')].join('|');
    if(posCache?.key===key)return posCache.map;
    const map=computePositions(c,cast);posCache={key,map};return map;
  }
  // world:schedule:<character id> = {entries:[{days:[0-6, 0 = Sunday], slot, location_id, months?:[1-12]}]}.
  // The first matching entry wins; a location missing from the catalogue is ignored.
  function scheduled(cid,day,slotId){
    let s;try{s=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','world:schedule:'+cid)?.value||'null');}catch{return null;}
    if(!Array.isArray(s?.entries))return null;
    const wd=weekdayOf(day),month=Number(String(day).slice(5,7));
    const hit=s.entries.find(e=>e.slot===slotId&&Array.isArray(e.days)&&e.days.includes(wd)&&(!Array.isArray(e.months)||e.months.includes(month)));
    return hit&&one('SELECT 1 FROM locations WHERE id=?',hit.location_id)?hit.location_id:null;
  }
  const walkThrough=loc=>{const n=treeCache.nodes?.find(x=>x.location_id===loc);return !!n&&(isPassage(n)||isRegion(n));};
  // Fantasy beings live only in Palor's wardrobe (owner, 2026-11-20, "Szereplők helye a világban"):
  // ogres, goblins, orcs and the like never stand in the real world; outside the wardrobe the one
  // non-human being is the Fenevad. A place is "in the wardrobe" when it or a place above it in the
  // location tree is the wardrobe ("szekrény").
  const inWardrobe=loc=>{const nodes=treeCache.nodes||[];let n=nodes.find(x=>x.location_id===loc);
    for(let depth=0;n&&depth<40;depth++){if(/szekrény/i.test((n.name||'')+' '+(n.short_name||'')))return true;n=n.parent_id?nodes.find(x=>x.id===n.parent_id):null;}
    return false;};
  // Every non-human race is locked in for now (owner, 2026-11-21). The Fenevad is the one exception,
  // also by name, so a later race change on his profile cannot lock him in by accident.
  const wardrobeOnly=character=>(character.race||'human')!=='human'&&!/fenevad/i.test(character.name||'');
  const raceOf=id=>one('SELECT race FROM characters WHERE id=?',id)?.race||'human';
  // A wardrobe-only character placed outside (an old appointment, an event, a schedule) is moved to
  // his own wardrobe place instead, or left off the map if he has none.
  function keepInWardrobe(person,loc){
    if(!loc||!wardrobeOnly({...person,race:raceOf(person.id)})||inWardrobe(loc))return loc;
    const own=w.placesOf(person.id).filter(p=>inWardrobe(p.location_id));
    return (own.find(p=>p.role==='home')||own[0])?.location_id||null;
  }
  function computePositions(c,cast){
    const out=new Map(),slotId=SLOTS[c.slot_index].id;
    const events=all("SELECT payload_json FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND json_extract(payload_json,'$.slot')=? ORDER BY rowid",c.day,slotId).map(e=>{try{return JSON.parse(e.payload_json);}catch{return null;}}).filter(p=>p&&Array.isArray(p.character_ids));
    for(const c2 of cast){
      // An accepted meeting with Palor wins over everything else at that time.
      let loc=one("SELECT location_id FROM play_appointments WHERE character_id=? AND world_day=? AND slot=? AND status='accepted' ORDER BY created_at DESC LIMIT 1",c2.id,c.day,slotId)?.location_id||null;
      if(loc){out.set(c2.id,keepInWardrobe(c2,loc));continue;}
      for(const p of events)if(p.location_id&&p.character_ids.includes(c2.id))loc=p.location_id;
      // Weekly schedule (plan 3.2, 2026-11-15): a fixed place per weekday and day part.
      if(!loc)loc=scheduled(c2.id,c.day,slotId);
      if(!loc){
        // A street, stairwell or Káloz határa is walked through, never a place to be found in
        // (owner, 2026-11-15): such a link is skipped and his other places are used.
        const places=w.placesOf(c2.id).filter(p=>!walkThrough(p.location_id));
        // With several home places (house, bedroom, bathroom…) pick the one that fits the
        // time: bedroom at night, living room in the evening, else the plainest name.
        const homeRank=name=>c.slot_index===3?(/háló/i.test(name)?0:/nappali/i.test(name)?1:/fürdő|wc|mosdó/i.test(name)?9:2):(/nappali/i.test(name)?0:/háló/i.test(name)?1:/fürdő|wc|mosdó/i.test(name)?9:2);
        const pick=role=>{const list=places.filter(p=>p.role===role);if(role==='home')list.sort((a,b)=>homeRank(a.location_name)-homeRank(b.location_name)||a.location_name.length-b.location_name.length);return list[0]?.location_id;};
        // Daytime may fall back to any linked place; at night only a real home counts,
        // otherwise the character is simply not on the map (never a guessed place).
        loc=c.slot_index===3?pick('home')||null:(c.slot_index<=1&&c.workday?pick('work')||pick('routine'):c.slot_index===2?pick('routine')||pick('home'):pick('home'))||pick('home')||places[0]?.location_id||null;
      }
      // No linked place at all: where today's world last saw him (any day part).
      if(!loc&&!w.placesOf(c2.id).length)loc=one("SELECT json_extract(payload_json,'$.location_id') l FROM world_events WHERE rewound_at IS NULL AND world_day=? AND json_extract(payload_json,'$.location_id') IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY rowid DESC LIMIT 1",c.day,c2.id)?.l||null;
      out.set(c2.id,indoor(keepInWardrobe(c2,loc),c2,c.slot_index));
    }
    return out;
  }
  // A building with an entry room (a home's living room) is never a room Palor stands in: he is
  // always set down in the entry room. Someone placed at the building itself would be invisible in
  // every room (2026-11-15, Attila in the Családi ház), so he is placed in a room of it: at night
  // in the room that carries his name ("Attila szobája"), otherwise in the entry room.
  function indoor(loc,person,slotIndex){
    const nodes=treeCache.nodes;if(!loc||!nodes?.length)return loc;
    const n=nodes.find(x=>x.location_id===loc);if(!n)return loc;
    const entry=originChild(nodes,n.id,origins(nodes));if(!entry?.location_id)return loc;
    if(slotIndex===3){const first=String(person.name||'').split(/\s+/)[0].toLocaleLowerCase('hu');
      const own=first.length>=3&&nodes.find(x=>x.parent_id===n.id&&x.location_id&&!x.archived&&/szob|háló/i.test(x.short_name||x.name)&&String(x.short_name||x.name).toLocaleLowerCase('hu').includes(first));
      if(own)return own.location_id;}
    return entry.location_id;
  }
  // Who is exactly at a tree node now (same rule as place(): his position is that location).
  const presentAt=node=>{if(!node?.location_id)return [];const pos=positions();return w.meetable().filter(c=>pos.get(c.id)===node.location_id).map(c=>c.id);};
  const isHere=(cid,node)=>presentAt(node).includes(cid);
  function playState(){const row=one('SELECT value FROM application_settings WHERE key=?',STATE_KEY);return row?JSON.parse(row.value):{node_id:null};}
  function savePlayState(s){run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',STATE_KEY,JSON.stringify(s));}
  function cover(cid){return one('SELECT cover_id FROM characters WHERE id=?',cid)?.cover_id||null;}
  // The best picture for every location in one query: a location-reference photo first,
  // then the picture with the fewest people on it.
  // A picture may be a place's backdrop only if it shows the place, not people (owner rule
  // 2026-11-13): no character linked to it, not a shared scene or another Play asset, and if the
  // analysis saw people on it, only as small figures in a wide shot. Such pictures stay in the
  // catalogue; the place simply has no backdrop until a real one is added.
  const BACKDROP_OK=BACKDROP_OK_SQL;
  function placeImages(){
    return new Map(all(`SELECT location_id,media_id FROM (
        SELECT l.id location_id,m.id media_id,ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY (r.media_id IS NULL),m.relative_path) rank
        FROM locations l JOIN media_tags t ON t.tag_id=l.tag_id JOIN active_media m ON m.id=t.media_id AND m.kind='image'
        LEFT JOIN media_roles r ON r.media_id=m.id AND r.role='location'
        WHERE ${BACKDROP_OK})
      WHERE rank=1`).map(r=>[r.location_id,r.media_id]));
  }
  // A location-reference photo of the place (or of any place inside it).
  function placeImage(locationIds,images=placeImages()){for(const lid of locationIds)if(images.has(lid))return images.get(lid);return null;}
  // A new entry room (a living room made 2026-11-14) has no picture of its own yet: until it gets
  // one it shows its home's picture.
  function imageOfHome(n,byId,images=placeImages()){if(!isOriginName(n))return null;const home=byId.get(n.parent_id);return home?.location_id?images.get(home.location_id)||null:null;}

  // Palor's place: where he last went, else his home in the tree.
  function currentNode(nodes){const s=playState();return (s.node_id&&nodes.find(n=>n.id===s.node_id))||nodes.find(n=>/palor lakása/i.test(n.name))||nodes.find(n=>/^palor/i.test(n.name))||null;}
  // Conversations left open on an earlier day are closed quietly (no AI call, no level change),
  // but only once nothing was said in them for STALE_HOURS: a talk that runs past midnight
  // stays open (2026-11-11; the date alone closed it mid-sentence). Not while he is answering.
  const STALE_HOURS=3;
  function closeStale(){
    const idleSince=new Date(now().getTime()-STALE_HOURS*3600e3).toISOString();
    // Calendar day here (not the world day): a night talk idle for hours is still left behind.
    for(const c of all("SELECT p.id,p.character_id,c.name FROM play_conversations p JOIN characters c ON c.id=p.character_id WHERE p.status='open' AND p.rewound_at IS NULL AND p.world_day<? AND coalesce((SELECT max(l.created_at) FROM active_play_lines l WHERE l.conversation_id=p.id),p.created_at)<?",localDay(now()),idleSince)){
      if(inFlight.has(c.id)||inFlight.has(c.character_id)||inFlight.has('group:'+c.id))continue;
      run("UPDATE play_conversations SET status='closed',closed_at=?,summary_json=? WHERE id=? AND status='open'",iso(),JSON.stringify({title:'Félbehagyott beszélgetés',summary:`A beszélgetés ${c.name} és Palor között félbemaradt.`,level_delta:0}),c.id);
    }
  }
  async function overview(){
    closeStale();
    const nodes=await tree(),pos=positions(),pid=w.palor()?.id;
    const node=currentNode(nodes);
    const people=w.meetable().map(c=>({id:c.id,name:c.name,cover_id:cover(c.id),location_id:pos.get(c.id)||null}));
    // A picture per place for the town view cards (location reference photo when there is one).
    const images=placeImages();
    // Pictures with people on them (not a location shot) are shown blurred on the cards.
    const busy=new Set(all("SELECT DISTINCT d.media_id FROM depictions d WHERE d.media_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM media_roles r WHERE r.media_id=d.media_id AND r.role='location')",JSON.stringify([...images.values()])).map(r=>r.media_id));
    // Place kinds from the names; a character's car or van is wherever its owner is now.
    const cast=w.meetable();
    // Characters linked to each place (home, work…), so search finds "Bastian" at his flat.
    const linked=new Map();for(const r of all('SELECT p.location_id,c.name FROM world_places p JOIN characters c ON c.id=p.character_id'))linked.set(r.location_id,[...(linked.get(r.location_id)||[]),r.name]);
    const byIdAll=new Map(nodes.map(n=>[n.id,n])),entries=origins(nodes);
    const withImages=nodes.map(n=>{const id=n.location_id?images.get(n.location_id)||imageOfHome(n,byIdAll,images):null;const owner=vehicleOwner(n,cast);
      // Street and stairwell are walked through (passage); a living room or lake shore is where
      // one arrives (origin); Káloz határa opens like a town with its own map (region).
      return {...n,place_kind:kindOf(n),image_id:id,image_busy:!!id&&busy.has(id),...(isPassage(n)?{passage:true}:{}),...(isOriginName(n)?{origin:true}:{}),...(isRegion(n)?{region:true}:{}),...(entries.has(n.id)?{origin_id:entries.get(n.id).id}:{}),...(n.location_id&&linked.has(n.location_id)?{linked:linked.get(n.location_id)}:{}),...(owner?{follows:{character_id:owner,location_id:pos.get(owner)||null}}:{})};});
    const unread=one('SELECT count(*) n FROM world_messages WHERE rewound_at IS NULL AND read_at IS NULL').n;
    const open=one("SELECT id,character_id FROM play_conversations WHERE status='open' AND rewound_at IS NULL ORDER BY rowid DESC LIMIT 1");
    const st=playState();
    return {clock:clock(),ai:aiSpend(),tree_version:treeVersion(nodes),palor_id:pid,node_id:node?.id||null,previous_id:st.previous_id||null,recent:(st.recent||[]).filter(id=>id!==node?.id).slice(0,5),nodes:withImages,people,unread_messages:unread,open_conversation:open||null,items:itemsView(nodes,node?.id)};
  }
  // What a trip or passing time can change in the overview (C1, 2026-11-14): the client merges
  // it instead of reloading the whole overview after every step.
  // Today's AI spending against the daily cap (real calendar day), for the small meter.
  function aiSpend(){try{const cap=Number(worldEngine.settings?.()?.daily_cap_usd);const usage=one('SELECT cost_usd,input_tokens,cached_tokens FROM world_usage WHERE day=?',localDay(gameClock?.realNow?.()||new Date())),spent=usage?.cost_usd||0;return Number.isFinite(cap)?{spent:Math.round(spent*1000)/1000,cap,cached_percent:usage?.input_tokens>0?Math.round(100*Math.min(usage.cached_tokens||0,usage.input_tokens)/usage.input_tokens):null}:null;}catch{return null;}}
  function stateDelta(nodes){
    const node=currentNode(nodes),pos=positions(),st=playState();
    return {node_id:node?.id||null,clock:clock(),ai:aiSpend(),tree_version:treeVersion(nodes),previous_id:st.previous_id||null,recent:(st.recent||[]).filter(id=>id!==node?.id).slice(0,5),
      people:w.meetable().map(c=>({id:c.id,location_id:pos.get(c.id)||null})),items:itemsView(nodes,node?.id),
      unread_messages:one('SELECT count(*) n FROM world_messages WHERE rewound_at IS NULL AND read_at IS NULL').n,
      open_conversation:one("SELECT id,character_id FROM play_conversations WHERE status='open' AND rewound_at IS NULL ORDER BY rowid DESC LIMIT 1")||null};
  }
  // ---- Palor's things ---------------------------------------------------------------------
  // "here" means the same building or site (a car at Feri háza is here in Feri's living room).
  function itemsView(nodes,hereId){
    const byId=new Map(nodes.map(n=>[n.id,n])),hereAnchor=hereId?siteOf(byId,hereId)?.id:null;
    return all('SELECT id,name,kind,node_id,carried,updated_at FROM play_items ORDER BY kind DESC,name').map(i=>{const at=i.node_id?byId.get(i.node_id):null;
      return {id:i.id,name:i.name,kind:i.kind,carried:!!i.carried,node_id:i.node_id,place:at?.short_name||null,path:at?.path||null,here:!!i.carried||(!!at&&!!hereAnchor&&siteOf(byId,at.id)?.id===hereAnchor)};});
  }
  async function itemAction(id,body){
    const nodes=await tree(),here=currentNode(nodes);
    if(id===null){
      const name=clip(String(body.name||'').trim(),80);if(!name)throw fail('Give it a name.');
      const kind=body.kind==='vehicle'?'vehicle':'item';if(!here)throw fail('Palor is nowhere yet.',409);
      const iid=randomUUID();run('INSERT INTO play_items VALUES(?,?,?,?,?,?,?)',iid,name,kind,kind==='vehicle'?(siteOf(new Map(nodes.map(n=>[n.id,n])),here.id)?.id||here.id):here.id,kind==='item'?1:0,iso(),iso());
      return itemsView(nodes,here.id);
    }
    const item=one('SELECT * FROM play_items WHERE id=?',id);if(!item)throw fail('Not found',404);
    const view=itemsView(nodes,here?.id).find(i=>i.id===id);
    if(body.action==='take'){if(item.kind==='vehicle')throw fail('A vehicle is driven, not carried.');if(!view.here)throw fail('It is not here.',409);run('UPDATE play_items SET carried=1,updated_at=? WHERE id=?',iso(),id);}
    else if(body.action==='drop'){if(!item.carried)throw fail('Palor does not have it.',409);if(!here)throw fail('Palor is nowhere yet.',409);run('UPDATE play_items SET carried=0,node_id=?,updated_at=? WHERE id=?',here.id,iso(),id);}
    else if(body.action==='rename'){const name=clip(String(body.name||'').trim(),80);if(!name)throw fail('Give it a name.');run('UPDATE play_items SET name=?,updated_at=? WHERE id=?',name,iso(),id);}
    else if(body.action==='remove')run('DELETE FROM play_items WHERE id=?',id);
    else throw fail('Choose take, drop, rename or remove.');
    return itemsView(nodes,here?.id);
  }
  async function place(nodeId){
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n])),node=byId.get(nodeId);if(!node)throw fail('Place not found',404);
    const locationsUnder=id=>descendants(nodes,id).map(x=>byId.get(x)?.location_id).filter(Boolean);
    const pos=positions(),cast=w.meetable();
    // Only people exactly at this place are "here"; people deeper inside (e.g. the
    // changing room of the gym) show as a headcount on that child place.
    const k=clock(),slotId=SLOTS[k.slot_index].id;
    // What happened here today, and what each person present is doing right now:
    // their latest event of this day part, else a plain description of the place role.
    const todayHere=node.location_id?all("SELECT title,summary,payload_json FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND json_extract(payload_json,'$.location_id')=? ORDER BY rowid",k.day,node.location_id).map(e=>({title:e.title,summary:clip(e.summary,240),slot:SLOTS.find(s=>s.id===JSON.parse(e.payload_json).slot)?.label||''})):[];
    const pid=w.palor()?.id;
    const here=node.location_id?cast.filter(c=>pos.get(c.id)===node.location_id).map(c=>({id:c.id,name:c.name,cover_id:cover(c.id),sprites:figures(c.id),sprites_shirtless:shirtless(c.id),sprites_intimate:intimateFigures(c.id),height_cm:heightOf(c.id),activity:shownActivityOf(c.id,node.location_id),level:pid?w.levelOf(c.id,pid)??null:null,stage:intimacyStage(c.id),
      mood:moodOf(all("SELECT title,summary FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?)",k.day,c.id)).key})):[];
    // Someone without a drawn figure stands in the scene as a photo figure: his best everyday
    // picture of himself (media director, portrait panel), cropped to where he stands.
    for(const p of here)if(!p.sprites.length)p.stand_in=await director.standIn(p.id).catch(()=>null);
    const countIn=id=>{const sub=new Set(locationsUnder(id));return cast.filter(c=>sub.has(pos.get(c.id))).length;};
    // A picture with people on it is only a blurred backdrop; empty location shots stay sharp.
    // Among this place's own location shots, one that matches the time of day is preferred.
    const night=k.slot_index>=2;
    const timed=timedImage(node.location_id,night);
    const imageId=timed||placeImage(locationsUnder(node.id))||imageOfHome(node,byId);
    const imageBusy=imageId?!!one('SELECT 1 FROM depictions WHERE media_id=? LIMIT 1',imageId)&&!one("SELECT 1 FROM media_roles WHERE media_id=? AND role='location'",imageId):false;
    // The same chain in other towns (other branch, other staff) and who works at this branch.
    const kind=kindOf(node),branches=chains(nodes).get(node.id)||[];
    const staff=node.location_id?all("SELECT DISTINCT c.id,c.name FROM world_places p JOIN characters c ON c.id=p.character_id WHERE p.location_id=? AND p.role='work'",node.location_id):[];
    return {node:{...node,place_kind:kind,kind_label:KIND_LABEL[kind]},room_exits:savedExits(node.id),town:townOf(byId,node.id)?.short_name||null,branches,staff,image_id:imageId,image_busy:imageBusy,people:here,today:todayHere,level_labels:LEVELS,children:childrenOf(node.id).map(n=>({...n,place_kind:kindOf(n),people_count:countIn(n.id)})),parent:byId.get(node.parent_id)||null};
  }
  // A location shot of this place that matches the time of day (night: evening and night).
  function timedImage(locationId,night){
    return locationId?all(`SELECT m.id,COALESCE((SELECT json_extract(s.raw_json,'$.description.hu') FROM world_review_sources s WHERE s.media_id=m.id ORDER BY s.rowid DESC LIMIT 1),'')||' '||m.relative_path d
        FROM locations l JOIN media_tags t ON t.tag_id=l.tag_id JOIN active_media m ON m.id=t.media_id AND m.kind='image' JOIN media_roles r ON r.media_id=m.id AND r.role='location'
        WHERE l.id=? AND ${BACKDROP_OK} LIMIT 40`,locationId).find(x=>x.d&&(night?NIGHT:DAY).test(x.d))?.id||null:null;
  }
  // What a character is doing right now at a place: his latest event of this day part,
  // else a plain description of what the place is to him.
  function activityOf(cid,locationId){
    const k=clock(),slotId=SLOTS[k.slot_index].id;
    const e=one("SELECT title,summary FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND json_extract(payload_json,'$.slot')=? AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY rowid DESC LIMIT 1",k.day,slotId,cid);
    if(e)return clip(e.summary||e.title,220);
    const role=locationId?one('SELECT role FROM world_places WHERE character_id=? AND location_id=? LIMIT 1',cid,locationId)?.role:null;
    return ROLE_TEXT[role]||ROLE_TEXT.other;
  }
  // The same, as the player reads it on the screen (owner, 2026-11-21): today's event when there
  // is one, else a line from the place link's note and his weekly routine. Screen only: prompts
  // keep activityOf, so creator-level routine text never enters a character's prompt.
  function shownActivityOf(cid,locationId){
    const k=clock(),slotId=SLOTS[k.slot_index].id;
    const e=one("SELECT title,summary FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND json_extract(payload_json,'$.slot')=? AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY rowid DESC LIMIT 1",k.day,slotId,cid);
    if(e)return clip(e.summary||e.title,220);
    // Here because of a meeting with Palor: say so, not "Éppen itt van."
    if(locationId&&one("SELECT 1 FROM play_appointments WHERE character_id=? AND world_day=? AND slot=? AND status='accepted' AND location_id=? LIMIT 1",cid,k.day,slotId,locationId))return 'Palorral beszélt meg itt találkozót, rá vár.';
    const link=locationId?one("SELECT wp.role,wp.note,l.name place FROM world_places wp JOIN locations l ON l.id=wp.location_id WHERE wp.character_id=? AND wp.location_id=? ORDER BY CASE wp.role WHEN 'work' THEN 0 WHEN 'routine' THEN 1 WHEN 'home' THEN 2 ELSE 3 END LIMIT 1",cid,locationId):null;
    let routine='';try{routine=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+cid)?.value||'{}').values?.weekly_routine?.value||'';}catch{}
    return describeActivity({role:link?.role||'other',slotIndex:k.slot_index,note:link?.note||'',routine:String(routine),place:link?.place||''});
  }
  // Travel remembers where Palor came from (Back) and the last few places (quick return).
  // ---- relationship depth ---------------------------------------------------------------
  db.exec('CREATE TABLE IF NOT EXISTS play_appointments(id TEXT PRIMARY KEY,character_id TEXT NOT NULL,location_id TEXT NOT NULL,world_day TEXT NOT NULL,slot TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL)');
  // Invitations from characters (appointment status 'invited', 2026-11-12): which phone message
  // carried each one. A separate table, so positional inserts into play_appointments stay valid.
  db.exec('CREATE TABLE IF NOT EXISTS play_invitations(appointment_id TEXT PRIMARY KEY,message_id TEXT NOT NULL,created_at TEXT NOT NULL)');
  // Talk history (2026-11-15): shared read model with the MCP catalogue (app/talk-history.mjs).
  const talkHistory=createTalkHistory({one,all});
  const sharedHistoryOf=talkHistory.sharedHistoryOf;
  // Talks he took part in (his own and group scenes; not ones he was only mentioned in), newest
  // first, rewound ones left out, with the parsed summary.
  const pastTalks=(cid,limit=200)=>talkHistory.talkRows(cid,{limit:limit+20}).filter(r=>r.character_id===cid||(r.participants_json||'').includes(cid)).slice(0,limit)
    .map(r=>{let s={};try{s=JSON.parse(r.summary_json||'{}')||{};}catch{}return {...r,summary:s};});
  const wrapStatus=fn=>{try{return fn();}catch(e){throw e.status?fail(e.message,e.status):e;}};
  // Everything that Palor and one character share: level history both ways, their talks, what he
  // remembers of Palor, and who else he is close to.
  function relationshipDetail(cid){
    const pid=w.palor()?.id;if(!pid||!one('SELECT 1 FROM characters WHERE id=?',cid))throw fail('Character not found',404);
    const names=new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name]));
    return {
      history:all('SELECT source_id,level,previous_level,reason,actor,created_at FROM world_level_revisions WHERE (source_id=? AND target_id=?) OR (source_id=? AND target_id=?) ORDER BY created_at DESC LIMIT 30',cid,pid,pid,cid).map(r=>({...r,direction:r.source_id===pid?'palor':'them',label:LEVELS[r.level]})),
      talks:all("SELECT world_day,channel,mode,summary_json FROM play_conversations WHERE character_id=? AND status='closed' AND rewound_at IS NULL ORDER BY closed_at DESC LIMIT 20",cid).map(r=>{let s={};try{s=JSON.parse(r.summary_json||'{}');}catch{}return {world_day:r.world_day,channel:r.channel,intimate:r.mode==='intimate',title:s.title||'',summary:s.summary||''};}),
      memories:all("SELECT m.text,m.created_at FROM character_memories m WHERE m.character_id=? AND m.status='approved' AND (m.text LIKE '%Palor%' OR m.reason IN (SELECT 'Világmotor esemény '||e.id FROM world_events e WHERE json_extract(e.payload_json,'$.with_palor')=1)) ORDER BY m.rowid DESC LIMIT 12",cid).map(r=>r.text),
      friends:all('SELECT target_id,level FROM world_relationship_levels WHERE source_id=? AND target_id<>? ORDER BY level DESC LIMIT 4',cid,pid).filter(r=>r.level>=2).map(r=>({name:names.get(r.target_id)||'?',label:LEVELS[r.level]})),
      appointments:all("SELECT a.id,a.world_day,a.slot,a.status,l.name place FROM play_appointments a JOIN locations l ON l.id=a.location_id WHERE a.character_id=? AND a.world_day>=? AND a.status<>'rewound' ORDER BY a.world_day,a.created_at",cid,clock().day).map(a=>({...a,slot:SLOTS.find(s=>s.id===a.slot)?.label||a.slot})),
      // Promises and plans between them (newest first).
      threads:w.threadsOf(cid)
    };
  }
  function knownCharacter(cid){
    const person=relationships().people.find(p=>p.id===cid);if(!person)throw fail('Character not found',404);
    const detail=relationshipDetail(cid);
    // Only shared conversation facts/plans. Creator notes, his private memories,
    // friends and level-change reasons never enter this participant response.
    return {person,labels:LEVELS,talks:detail.talks,threads:detail.threads.filter(x=>x.status==='open'),appointments:detail.appointments.filter(x=>['accepted','invited'].includes(x.status))};
  }
  // Palor invites someone to meet at a place in a day part. He accepts if he likes Palor
  // at least a little and is free; then he will be there at that time.
  async function invite(body){
    const c=w.meetable().find(x=>x.id===body.character_id);if(!c)throw fail('Only characters with a Szellemprofil can talk in Play mode for now.',409);
    const nodes=await tree(),node=nodes.find(n=>n.id===body.node_id);if(!node?.location_id)throw fail('Place not found',404);
    const k=clock(),idx=Number(body.slot_index);if(!Number.isInteger(idx)||idx<0||idx>=SLOTS.length)throw fail('Choose a time of day.');
    // A day part already past today means the next world day (at 01:00 "morning" is the coming one).
    const day=idx<k.slot_index?addDays(k.day,1):k.day;
    const level=w.levelOf(c.id,w.palor()?.id)??0,busy=one("SELECT 1 FROM play_appointments WHERE character_id=? AND world_day=? AND slot=? AND status IN ('accepted','invited')",c.id,day,SLOTS[idx].id);
    // A wardrobe being cannot be invited out into the real world (owner, 2026-11-20).
    const caged=wardrobeOnly({...c,race:raceOf(c.id)})&&!inWardrobe(node.location_id);
    const status=level>=1&&!busy&&!caged?'accepted':'declined';
    const appointmentId=randomUUID();run('INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,?,?)',appointmentId,c.id,node.location_id,day,SLOTS[idx].id,status,iso());
    // An accepted invitation is a date (chance meetings on the road are appointments, not dates).
    if(status==='accepted')run('INSERT INTO play_dates(appointment_id,created_at) VALUES(?,?)',appointmentId,iso());
    return {status,day,slot:SLOTS[idx].label,place:node.short_name,reason:status==='accepted'?null:caged?'wardrobe':busy?'busy':'not_close'};
  }
  // A character's own invitation (world engine, status 'invited'): Palor accepts (it becomes a
  // date: he will be there, and missing it is noticed) or declines. He remembers either answer.
  function answerInvitation(id,accept){
    if(typeof accept!=='boolean')throw fail('Choose accept or decline.');
    return transaction(()=>{
      const a=one('SELECT * FROM play_appointments WHERE id=?',id);if(!a)throw fail('Invitation not found',404);
      if(a.status!=='invited')throw fail('This invitation was already answered.',409);
      const k=clock(),idx=SLOTS.findIndex(s=>s.id===a.slot);
      if(a.world_day<k.day||(a.world_day===k.day&&idx<k.slot_index))throw fail('This invitation has passed.',409);
      run('UPDATE play_appointments SET status=? WHERE id=?',accept?'accepted':'declined_by_palor',id);
      if(accept)run('INSERT OR IGNORE INTO play_dates(appointment_id,created_at) VALUES(?,?)',id,iso());
      const where=one('SELECT name FROM locations WHERE id=?',a.location_id)?.name||'';
      const when=`${a.world_day} ${SLOTS[idx]?.label||''}${where?', '+where:''}`;
      w.remember(a.character_id,accept?`Palor elfogadta a meghívásomat (${when}).`:`Palor nem fogadta el a meghívásomat (${when}).`,null,{reason:'Meghívás válasza '+id});
      return {id,status:accept?'accepted':'declined_by_palor',day:a.world_day,slot:SLOTS[idx]?.label||'',place:where};
    });
  }
  // Shared scene pictures (folder, upload, content marks, prompts, insert log).
  const scenes=root?installSceneImages({db,root,one,all,run,transaction,fail,palor:()=>w.palor(),locationTree,activityOf,stageOf:cid=>intimacyStage(cid),mayUseReferences,mayUseEverydayReferences,intimateAllowed}):null;
  const needScenes=()=>{if(!scenes)throw fail('Scene pictures are unavailable.',503);return scenes;};
  // A trip: optionally by Palor's own vehicle (it must be at the same building or site, and it
  // parks at the destination's site); otherwise the vehicle stays where it was. Moving between
  // buildings or towns may bring a chance meeting (that person comes along) or a happening.
  async function travel(nodeId,body={}){
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n]));if(!byId.has(nodeId))throw fail('Place not found',404);
    const s=playState(),from=currentNode(nodes)?.id||null;
    // A home is entered in its living room, a hostel in its common room, the lake on its shore
    // (owner, 2026-11-14); a passage (street, stairwell) is never a place to stop in.
    if(isPassage(byId.get(nodeId)))nodeId=townOf(byId,nodeId)?.id||nodeId;
    nodeId=arrivalOf(nodes,byId,from,nodeId,origins(nodes));
    const prev=s.node_id&&s.node_id!==nodeId?s.node_id:s.previous_id||null;
    if(body.mode!==undefined&&!['foot',...TRAVEL_MODES].includes(body.mode))throw fail('Choose bike, car or train.');
    let vehicle=null;
    if(body.vehicle_id){
      vehicle=itemsView(nodes,from).find(i=>i.id===body.vehicle_id&&i.kind==='vehicle');
      if(!vehicle)throw fail('Vehicle not found',404);if(!vehicle.here)throw fail('The car is not here: it is at '+(vehicle.place||'?')+'.',409);
    }
    const tA=from?townOf(byId,from):null,tB=townOf(byId,nodeId),between=!!tA&&!!tB&&tA.id!==tB.id;
    // Between towns: the way chosen in the small window (bike, car, or a direct train); inside a
    // town Palor walks, or drives his own car when he took it.
    // Inside Káloz he always walks; the car stays where it is (owner, 2026-11-14).
    if(!between&&walkOnly(tB))vehicle=null;
    let mode=between?(body.mode||'car'):(vehicle?'car':'foot');
    if(mode==='train'&&!trainBetween(tA,tB))throw fail('No direct train runs between these two towns.',409);
    if(mode==='bike'&&between&&!bikeAllowed(tA,tB))throw fail('Pécs is reached by car or train only.',409);
    if(mode==='train'&&!trainRunsAt(clockHour()))throw fail('No trains run between midnight and 4 am.',409);
    if(mode!=='car')vehicle=null;
    // In a friend's car (owner, 2026-11-14): only between towns, only someone with Palor now.
    let ride=null;
    if(body.ride_with!==undefined&&body.ride_with!==null){
      ride=between&&mode==='car'&&typeof body.ride_with==='string'?ridesAt(nodes,from).find(r=>r.id===body.ride_with)||null:null;
      if(!ride)throw fail('Nobody here can drive you there.',409);
      vehicle=null;
    }
    const recent=[nodeId,...(s.recent||[]).filter(id=>id!==nodeId)].slice(0,6);
    const k=clock(),pos=positions(),pid=w.palor()?.id,locNode=new Map(nodes.filter(n=>n.location_id).map(n=>[n.location_id,n.id]));
    const people=w.meetable().map(c=>({id:c.id,name:c.name,location_id:pos.get(c.id)||null,node_id:locNode.get(pos.get(c.id))||null,level:pid?w.levelOf(c.id,pid)??null:null}));
    let encounter=from&&from!==nodeId?rollEncounter({byId,fromId:from,toId:nodeId,people,slotIndex:k.slot_index,rand:random,mode}):null;
    // Where Palor really is (2026-11-13): a town's own node is its street. Between two towns he
    // is on the road; inside Káloz, Székesfehérvár or Budapest a walk from the street to a place
    // can bring a town story. A story replaces the one-line happening, never a person met.
    // By train, the story may also be a station story of the town he arrives in.
    const townA=tA,townB=tB,crossTown=between,slotId=SLOTS[k.slot_index].id,townKey=townB?storyTownOf(townB.short_name||townB.name):null;
    const story=!from||from===nodeId?null:crossTown?(stories.pick({setting:'road',slotId,mode,worldDay:k.day})||(mode==='train'&&townKey?stories.pick({setting:townKey,slotId,mode,worldDay:k.day,chance:0.5}):null))
      :townB&&from===townB.id&&nodeId!==townB.id&&townKey?stories.pick({setting:townKey,slotId,mode,worldDay:k.day,chance:0.5}):null;
    if(story&&encounter?.kind==='event')encounter=null;
    if(ride&&encounter?.character_id===ride.id)encounter=null;
    // Someone by the road on a car trip without a story: Palor may stop once (owner, 2026-11-14).
    // Not offered while stories are switched off, since stopping starts one.
    const roadText=(playSettings().story_rate||'normal')!=='off'?rollRoadside({mode,crossTown,story,rand:random}):null;
    const roadside=roadText?{text:roadText,token:randomUUID()}:null;
    if(roadside&&encounter?.kind==='event'&&/stoppol|integet/i.test(encounter.text))encounter=null;
    const arrival=byId.get(nodeId).location_id;
    // The trip takes its travel time on the game clock (owner decision D1).
    const minutes=travelMinutes(byId,from,nodeId,{mode});
    // Company is booked for the day part at arrival, not departure (2026-11-14).
    const at=new Date(now().getTime()+(from&&from!==nodeId&&gameClock?Math.max(0,Math.round(Number(minutes)||0)):0)*60_000),atDay=worldDayAt(at),atSlot=SLOTS[slotIndexAt(at)].id;
    transaction(()=>{
      if(vehicle)run('UPDATE play_items SET node_id=?,updated_at=? WHERE id=?',siteOf(byId,nodeId)?.id||nodeId,iso(),vehicle.id);
      // The person met on the way comes along: he is at the destination for this day part.
      if(encounter?.kind==='person'&&arrival)run("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,'accepted',?)",randomUUID(),encounter.character_id,arrival,atDay,atSlot,iso());
      // The friend who drove comes along the same way.
      if(ride&&arrival)run("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,'accepted',?)",randomUUID(),ride.id,arrival,atDay,atSlot,iso());
      savePlayState({...s,node_id:nodeId,previous_id:prev,recent,roadside:roadside?{token:roadside.token,used:false}:null,updated_at:iso()});
    });
    if(encounter?.kind==='person'&&!byId.get(nodeId).location_id)encounter.text+=' Itt elváltok.';
    if(from&&from!==nodeId)gameClock?.advance(minutes,'travel');
    // The street and stairwells walked through, with a picture each (shown for a moment).
    const images=placeImages(),via=passagesOf(nodes,byId,from,nodeId).map(n=>({id:n.id,name:n.short_name||n.name,image_id:n.location_id?images.get(n.location_id)||null:null}));
    const line=mode==='train'?trainBetween(townA,townB)?.name||null:null;
    // Real pictures on the way between towns (owner, 2026-11-14): station and train, the friend's
    // car, a petrol station on a fuel stop; the time-of-day shot when there is one.
    const sceneNodes=from&&from!==nodeId?tripScenePlaces({mode,crossTown,rideNodeId:ride?.node_id||null,encounterText:encounter?.kind==='event'?encounter.text:null})
      .map(x=>x.node_id?byId.get(x.node_id):transportPlace(nodes,x.name)).filter(Boolean):[];
    const scenes=sceneNodes.map(n=>({name:n.short_name||n.name,image_id:timedImage(n.location_id,k.slot_index>=2)||images.get(n.location_id)||null})).filter(x=>x.image_id);
    return {...(await place(nodeId)),state:stateDelta(nodes),trip:{from_id:from,minutes,mode,line,vehicle:vehicle?.name||null,ride_with:ride?{id:ride.id,name:ride.name,vehicle:ride.vehicle,...(arrival?{}:{parted:true})}:null,encounter,via,road:crossTown?{from_town:townA.short_name||townA.name,to_town:townB.short_name||townB.name}:null,story,scenes,roadside}};
  }
  // Who can drive Palor in his own car now (owner, 2026-11-14): an owner of a car place who is at
  // Palor's place, or, when Palor just stepped out onto the street, at the place he left.
  function ridesAt(nodes,fromId){
    const byId=new Map(nodes.map(n=>[n.id,n])),here=fromId?byId.get(fromId):null;if(!here)return [];
    const ids=presentAt(here),prev=playState().previous_id?byId.get(playState().previous_id):null;
    if(townOf(byId,here.id)?.id===here.id&&prev&&townOf(byId,prev.id)?.id===here.id)ids.push(...presentAt(prev));
    return ridesWith(nodes,w.meetable(),ids);
  }
  // The ways to reach another town from where Palor is (bike, car, a direct train, a friend's car).
  async function travelChoices(toId){
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n]));if(!byId.has(toId))throw fail('Place not found',404);
    const from=currentNode(nodes)?.id||null,car=itemsView(nodes,from).find(i=>i.kind==='vehicle'&&i.here)||null;
    return {from_town:from?townOf(byId,from)?.short_name||null:null,to_town:townOf(byId,toId)?.short_name||null,options:travelOptions(byId,from,toId,{car:car?{id:car.id,name:car.name}:null,hour:clockHour(),rides:ridesAt(nodes,from).map(({id,name,vehicle})=>({id,name,vehicle}))})};
  }
  // Palor stops for the figure by the road (owner, 2026-11-14): once per trip, a car road story
  // even if the story rate would not bring one. {story:null} when none fits.
  function roadsideStop(body={}){
    const s=playState(),r=s.roadside;
    if(!r||typeof body.token!=='string'||body.token!==r.token)throw fail('Nobody is waiting by the road now.',409);
    if(r.used)throw fail('You already stopped on this trip.',409);
    savePlayState({...s,roadside:{...r,used:true}});
    // Stories switched off since the trip: nobody is there (2026-11-14).
    if((playSettings().story_rate||'normal')==='off')return {story:null};
    const k=clock();
    return {story:stories.pick({setting:'road',slotId:SLOTS[k.slot_index].id,mode:'car',worldDay:k.day,force:true})};
  }

  // ---- conversations ----------------------------------------------------------------
  const lines=cid=>{const adult=playSettings().adult;return all(`SELECT l.id,l.speaker,l.text,l.created_at,pm.media_id,pm.kind media_kind,pm.level media_level,ls.character_id speaker_id,COALESCE((SELECT name FROM characters WHERE id=ls.character_id),(SELECT name FROM play_guests WHERE 'guest:'||id=ls.character_id)) speaker_name,
        mt.beat,mt.spark,sc.media_id scene_id,sc.kind scene_kind,sc.level scene_level,sc.start_at scene_start,sc.display_json scene_display
      FROM active_play_lines l LEFT JOIN play_line_media pm ON pm.line_id=l.id LEFT JOIN play_line_speaker ls ON ls.line_id=l.id LEFT JOIN play_line_meta mt ON mt.line_id=l.id LEFT JOIN play_line_scene sc ON sc.line_id=l.id WHERE l.conversation_id=? ORDER BY l.rowid`,cid)
    .map(({media_id,media_kind,media_level,speaker_id,speaker_name,beat,spark,scene_id,scene_kind,scene_level,scene_start,scene_display,...l})=>{let shown={};try{shown=JSON.parse(scene_display||'{}');}catch{}
      return {...l,...(speaker_id?{speaker_id,speaker_name}:{}),...(beat?{beat}:{}),...(Number.isInteger(spark)?{spark}:{}),
        ...(media_id&&(adult||media_level==='non_intimate')?{media:{media_id,kind:media_kind,level:media_level,blur:media_level!=='non_intimate'}}:{}),
        ...(scene_id&&(adult||scene_level==='non_intimate')?{scene:{media_id:scene_id,kind:scene_kind,level:scene_level,start_at:scene_start,...shown}}:{})};});};
  const participantsOf=c=>{try{return JSON.parse(c?.participants_json||'[]');}catch{return [];}};
  function conversationView(id,mood=null){const c=one('SELECT * FROM play_conversations WHERE id=?',id);if(!c)throw fail('Conversation not found',404);const ch=one('SELECT id,name,cover_id FROM characters WHERE id=?',c.character_id);
    const group=c.mode==='group'?participantsOf(c).map(pid=>one('SELECT id,name,cover_id FROM characters WHERE id=?',pid)).filter(Boolean):null;
    return {id:c.id,status:c.status,channel:c.channel,mode:c.mode||'normal',character:{...ch,sprites:figures(ch.id),sprites_shirtless:shirtless(ch.id),sprites_intimate:intimateFigures(ch.id)},...(group?{participants:group}:{}),guests:guestsOf(c.id).map(guestView),...(c.mode!=='group'&&guestsOf(c.id).length?{intimate_now:intimateNow(c.id)}:{}),lines:lines(c.id),revised_turns:turnRevisions.history(c.id),last_turn:c.status==='open'?turnRevisions.available(c.id):null,mood,summary:c.summary_json?JSON.parse(c.summary_json):null,...conversationExtras(c)};}
  // The last reply's suggested next lines for Palor and the running chemistry (sum of sparks).
  function conversationExtras(c){
    if(c.status!=='open')return {chemistry:one('SELECT coalesce(sum(m.spark),0) n FROM play_line_meta m JOIN active_play_lines l ON l.id=m.line_id WHERE l.conversation_id=?',c.id).n};
    const last=one("SELECT m.choices_json FROM active_play_lines l JOIN play_line_meta m ON m.line_id=l.id WHERE l.conversation_id=? AND l.speaker='character' ORDER BY l.rowid DESC LIMIT 1",c.id);
    let choices=[];try{choices=JSON.parse(last?.choices_json||'[]');}catch{}
    return {choices,chemistry:one('SELECT coalesce(sum(m.spark),0) n FROM play_line_meta m JOIN active_play_lines l ON l.id=m.line_id WHERE l.conversation_id=?',c.id).n};
  }
  // One AI reply at a time per character: a double click never sends (and pays) twice.
  const inFlight=new Set();
  const turnRevisions=installPlayTurnRevisions({db,one,all,run,transaction,fail,inFlight,conversationView,reply:body=>talkOnce(body,null,{advanceTime:false})});
  // Prompt window of a talk and when the running summary starts (memo_json).
  const HISTORY_WINDOW=20,MEMO_FROM=14;
  // IDs must be strings: an object or array reaching SQLite would be a 500 (audit 2026-11-10).
  const checkIds=(body,keys)=>{for(const k of keys)if(body[k]!==undefined&&body[k]!==null&&typeof body[k]!=='string')throw fail('Invalid request.');};
  // onReply (optional): receives the reply text as it is being written (streamed answers).
  async function talk(body,{onReply=null}={}){
    checkIds(body,['conversation_id','character_id','photo_id','channel','pace']);
    if(body.pace!==undefined&&!PACES.includes(body.pace))throw fail('Unknown pace.');
    // Locked by conversation and by character, so a reply, a new start and an end of the same
    // talk never run side by side (end() takes the same keys).
    const keys=[...new Set([body.conversation_id,body.character_id,body.conversation_id?one('SELECT character_id FROM play_conversations WHERE id=?',body.conversation_id)?.character_id:null].filter(Boolean))];
    if(!keys.length)keys.push('');
    if(keys.some(k=>inFlight.has(k)))throw fail('He is still answering. Wait a moment.',409);
    for(const k of keys)inFlight.add(k);
    try{
      // "*Rendszer! …*" (owner, 2026-11-15): an order to the game itself, not to the character.
      // The narrator answers it from the recorded data; the rest of the line (if any) still goes
      // to the character, without the order.
      const {directive,rest}=splitDirective(body.text);
      if(directive){
        const narration=await narrate(body,directive);
        if(!rest){const cv=body.conversation_id?one('SELECT id FROM play_conversations WHERE id=?',body.conversation_id):null;return {...(cv?conversationView(cv.id):{}),narration,narration_only:true};}
        return {...await talkOnce({...body,text:rest},onReply),narration};
      }
      return await talkOnce(body,onReply);
    }finally{for(const k of keys)inFlight.delete(k);}
  }
  // ---- the narrator ("Rendszer", 2026-11-15) ---------------------------------------------------
  db.exec('CREATE TABLE IF NOT EXISTS play_narrations(id TEXT PRIMARY KEY,conversation_id TEXT,character_id TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL,created_at TEXT NOT NULL)');
  const DIRECTIVE=/\*\s*rendszer\s*[!:,.]?\s*([^*]{2,600}?)\s*\*/iu;
  function splitDirective(text){
    if(typeof text!=='string')return {directive:null,rest:text};
    const m=text.match(DIRECTIVE);if(!m)return {directive:null,rest:text};
    return {directive:m[1].trim(),rest:text.replace(m[0],' ').replace(/\s+/g,' ').trim()};
  }
  async function narrate(body,directive){
    const conv=body.conversation_id?one('SELECT * FROM play_conversations WHERE id=?',body.conversation_id):null;
    if(body.conversation_id&&!conv)throw fail('Conversation not found',404);
    const cid=conv?.character_id||body.character_id;
    const c=w.meetable().find(x=>x.id===cid);if(!c)throw fail('Only characters with a Szellemprofil can talk in Play mode for now.',409);
    const channel=conv?.channel||(body.channel==='phone'?'phone':'in_person'),stage=intimacyStage(cid);
    // Owner 2026-11-18: the narrator follows the scene that is actually running. In person, with
    // the adult switch on, explicit details are open (the character may already be in an intimate
    // scene in a normal-mode talk; the relationship level alone does not show that).
    const explicit=stage!=='none'&&channel!=='phone';
    const here=currentNode(await tree()),k=clock();
    const lookOf=id=>[one('SELECT appearance FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',id)?.appearance,one('SELECT appearance FROM characters WHERE id=?',id)?.appearance].filter(x=>String(x||'').trim()).map(x=>clip(x,2500));
    const look=lookOf(cid);
    // Palor is in the scene too: his profile and approved look, so the narrator can describe both.
    const pid=w.palor()?.id,palorLook=pid&&pid!==cid?lookOf(pid):[],palorProfile=pid&&pid!==cid?clip(w.profileText(w.profile(pid),{explicit}),3000):'';
    const recent=conv?lines(conv.id).slice(-10).map(l=>(l.speaker==='palor'?'Palor':isGuestLine(l)?l.speaker_name:c.name)+': '+l.text).join('\n'):'';
    const guests=conv?guestsOf(conv.id):[];
    const system='Te a játék Rendszere vagy (narrátor), nem szereplő. A játékos a játékon kívülről kérdez vagy utasít. Válaszolj magyarul. '
      +'Ha adatra kérdez, válaszolj tárgyilagosan, pontosan, 1–6 mondatban. '
      +'Ha jelenetet, látványt, mozdulatot vagy érzést kér, írd meg élénken és részletesen, 4–10 mondatban, harmadik személyben, a beszélgetés eddigi menetének folytatásaként. '
      +'A szereplők külsejét, testét és viselkedését a profilokból, a jóváhagyott megjelenésből, az alkotó javításaiból és a beszélgetés soraiból vedd: ezekből szabadon megfogalmazhatod és kibonthatod a leírást, új szöveget írhatsz. '
      +'Új tényt a múltról, életrajzról, rokonokról ne találj ki, és ami a szereplő külsejéből sehol nincs megadva, azt ne állítsd biztosra. Mindenki felnőtt. '
      +(explicit?'Intim, testi és szexuális részletek nyíltan, nyers szavakkal is leírhatók.':'Intim, testi részletekről most nem adsz leírást; mondd meg, hogy ez most nem elérhető.')+' Csak JSON: {"answer":"..."}';
    const user=[`SZEREPLŐ: ${c.name}`,'PROFIL:\n'+w.profileText(c.profile,{explicit}),...(look.length?['JÓVÁHAGYOTT MEGJELENÉS:\n'+look.join('\n')]:[]),...(directorText(cid)?[directorText(cid)]:[]),
      ...(palorProfile||palorLook.length?['PALOR (a játékos szereplője):\n'+[palorProfile,...(palorLook.length?['JÓVÁHAGYOTT MEGJELENÉSE:\n'+palorLook.join('\n')]:[])].filter(Boolean).join('\n')]:[]),
      ...(guests.length?['A JELENETHEZ CSATLAKOZOTT ÚJ SZEREPLŐ(K) (felnőtt férfiak):\n'+guests.map(g=>`- ${g.name}: ${g.description}`).join('\n')]:[]),
      `JELENET: ${channel==='phone'?'telefonos beszélgetés':here?.path||here?.name||'ismeretlen hely'}, ${k.weekday} ${k.slot}.`,...(recent?['A BESZÉLGETÉS VÉGE:\n'+recent]:[]),'A JÁTÉKOS UTASÍTÁSA: '+directive].join('\n\n');
    let out=await w.ask(system,user,900);
    if(out?.__truncated)out={answer:partialJsonString(out.raw,'answer')||''};
    const answer=clip(String(out?.answer??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,''),2000);
    if(!answer)throw fail('The narrator did not answer. Try again.',502);
    run('INSERT INTO play_narrations VALUES(?,?,?,?,?,?)',randomUUID(),conv?.id||null,cid,clip(directive,600),answer,iso());
    return {question:directive,answer};
  }
  // ---- scene guests (owner, 2026-11-18) ----------------------------------------------------
  // A brand-new man may join an in-person 1:1 scene (an intimate one too). He lives only in this
  // conversation: no character record, no folder, no canon. The owner may save him as a real
  // character with one click. Owner policy: every character is male; the invented guest is checked
  // like a new profile. His lines are stored as character lines with speaker "guest:<id>".
  // A profile picture is made at once with OpenAI (paid, one attempt, never retried), kept outside
  // OneDrive until the guest is saved.
  db.exec('CREATE TABLE IF NOT EXISTS play_guests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,image_file TEXT,image_status TEXT NOT NULL,image_note TEXT,saved_character_id TEXT,left_at TEXT,created_at TEXT NOT NULL)');
  // Two pictures (owner, 2026-11-18): dressed, then a shirtless edit of that same picture, so the
  // owner can decide whether to keep him; the play screen shows the shirtless one when the scene
  // is intimate. Same face is the aim, not a guarantee.
  if(!all('PRAGMA table_info(play_guests)').some(c=>c.name==='bare_file'))db.exec('ALTER TABLE play_guests ADD COLUMN bare_file TEXT;ALTER TABLE play_guests ADD COLUMN bare_status TEXT;');
  if(!all('PRAGMA table_info(play_guests)').some(c=>c.name==='portrait_prompt'))db.exec('ALTER TABLE play_guests ADD COLUMN portrait_prompt TEXT');
  // Framing as the avatars' intimate figures (owner 2026-11-18): vertical 2:3, from just above the
  // head to just below the navel, nothing below the waist in the frame, natural pose, his setting
  // behind him. The dressed picture uses the same frame, so the shirtless edit lines up with it.
  const GUEST_FRAMING='Framing: vertical 2:3, from a small margin above the head down to the waist, just below the navel; the picture ends there and nothing below the waist is in the frame (no waistband, belt or trousers visible). Pose: natural and relaxed, upper body facing the viewer with a slight three-quarter turn, shoulders relaxed, arms relaxed. A real background of his setting behind him, softly out of focus. Camera at chest height, sharp focus.';
  const GUEST_IMAGE_MODEL='gpt-image-2',MAX_GUESTS=2;
  // Is the scene's generated text intimate right now? (owner 2026-11-18: the content decides, not
  // the conversation mode). The reply's own flag when it gave one, else the wording of the last
  // lines. Only switches the guest picture shown; nothing else depends on it.
  if(!all('PRAGMA table_info(play_line_meta)').some(c=>c.name==='intimate'))db.exec('ALTER TABLE play_line_meta ADD COLUMN intimate INTEGER');
  const INTIMATE_WORDS=/(fasz|vessz[őo]|farká|farok|dug(ok|om|ja|lak|ás)|basz|szop|kúr|kefél|meztelen|pucér|mellbimb|ánusz|segg|ondó|elélvez|nyög|lökés|merevedés|pénisz|herék|heréi|csikló|szex|ágyék|lágyék|levetk|vetkőz|naked|nude|cock|fuck)/iu;
  function intimateNow(convId){
    const flag=one("SELECT m.intimate FROM active_play_lines l JOIN play_line_meta m ON m.line_id=l.id WHERE l.conversation_id=? AND l.speaker='character' ORDER BY l.rowid DESC LIMIT 1",convId)?.intimate;
    if(flag===0||flag===1)return flag===1;
    return all('SELECT text FROM active_play_lines WHERE conversation_id=? ORDER BY rowid DESC LIMIT 3',convId).some(l=>INTIMATE_WORDS.test(l.text));
  }
  const guestsOf=convId=>all('SELECT id,name,description,image_status,image_note,bare_status,saved_character_id FROM play_guests WHERE conversation_id=? AND left_at IS NULL ORDER BY created_at,rowid',convId);
  const guestDir=()=>path.join(dataDir,'play-guests');
  const isGuestLine=l=>typeof l?.speaker_id==='string'&&l.speaker_id.startsWith('guest:');
  const plainText=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,'').replace(/\s+/g,' ').trim();
  const guestView=g=>({id:g.id,name:g.name,description:g.description,image:g.image_status,bare:g.bare_status||'off',...(g.image_note&&(g.image_status==='failed'||g.bare_status==='failed')?{image_note:g.image_note}:{}),saved:!!g.saved_character_id});
  async function addGuest(body){
    checkIds(body,['conversation_id']);
    const hint=body.hint===undefined||body.hint===null?'':plainText(body.hint);if(hint.length>300)throw fail('A leírás legfeljebb 300 karakteres lehet.');
    const conv=one('SELECT * FROM play_conversations WHERE id=?',body.conversation_id||'');if(!conv)throw fail('Conversation not found',404);
    if(conv.status!=='open')throw fail('This conversation has ended.',409);
    if(conv.channel!=='in_person'||conv.mode==='group')throw fail('Új szereplő csak személyes, kettes jelenethez csatlakozhat.',409);
    if(guestsOf(conv.id).length>=MAX_GUESTS)throw fail('Egy jelenetben legfeljebb két új szereplő lehet.',409);
    const lock='guest:'+conv.id;if(inFlight.has(lock)||inFlight.has(conv.id))throw fail('Épp történik valami a jelenetben. Várj egy kicsit.',409);
    inFlight.add(lock);
    try{
      const c=one('SELECT id,name FROM characters WHERE id=?',conv.character_id),here=currentNode(await tree()),k=clock();
      const recent=lines(conv.id).slice(-8).map(l=>(l.speaker==='palor'?'Palor':l.speaker_name||c.name)+': '+l.text).join('\n');
      // Existing characters' names are taken too: a guest must never pass for one of them.
      const taken=[...new Set(['Palor',c.name,...guestsOf(conv.id).map(g=>g.name),...all('SELECT name FROM characters').map(r=>r.name)])];
      const system='Egy élő világban játszódó játék folyamatban lévő jelenetéhez kitalálsz egy új, ideiglenes mellékszereplőt, aki most csatlakozik. Mindig felnőtt férfi (hím), soha nem nő. Magyar környezet, hihető, konkrét figura, a jelenethez és a helyszínhez illik. Válaszolj magyarul. '
        +'Csak JSON: {"name":"keresztnév vagy rövid megnevezés (pl. Bence vagy Idegen vadász)","description":"3–5 mondat: kora, testalkata, arca, haja, ruházata, kisugárzása, és miért van itt most","portrait":"angol nyelvű, részletes leírás a profilképéhez: a külseje (arc, haj, testalkat, ruházat) és a mögötte lévő, a helyszínhez illő háttér; a képkivágást a program adja meg"}';
      const user=[`HELYSZÍN: ${here?.path||here?.name||'ismeretlen hely'}, ${k.weekday} ${k.slot}.`,`A JELENETBEN MÁR OTT VAN: Palor és ${c.name}.`,...(recent?['A BESZÉLGETÉS VÉGE:\n'+recent]:[]),...(hint?['A JÁTÉKOS KÉRÉSE AZ ÚJ SZEREPLŐRŐL: '+hint]:[]),'Ezeket a neveket ne használd: '+taken.join(', ')+'.'].join('\n\n');
      let out=await w.ask(system,user,700);if(out?.__truncated)out={};
      const name=clip(plainText(out?.name),60),description=clip(plainText(out?.description),1200),portrait=clip(plainText(out?.portrait),1500);
      if(!name||!description)throw fail('Nem sikerült új szereplőt kitalálni. Próbáld újra.',502);
      if(taken.some(n=>n.toLocaleLowerCase('hu')===name.toLocaleLowerCase('hu')))throw fail('A kitalált név foglalt. Próbáld újra.',409);
      try{characterPolicy?.assertProfile?.({name,biography:'Nem: férfi. '+description,appearance:description},{create:true});}catch{throw fail('A kitalált szereplő nem felelt meg a szereplő-szabálynak (csak férfi lehet). Próbáld újra.',409);}
      const gid=randomUUID(),wantImage=body.portrait===true&&playSettings().guest_image_provider!=='sogni';
      run('INSERT INTO play_guests(id,conversation_id,name,description,image_status,bare_status,portrait_prompt,created_at) VALUES(?,?,?,?,?,?,?,?)',gid,conv.id,name,description,wantImage?'pending':'off',wantImage?'pending':'off',portrait||null,iso());
      if(wantImage)guestPortrait(gid,portrait||description).catch(()=>{});
      return conversationView(conv.id);
    }finally{inFlight.delete(lock);}
  }
  // One OpenAI picture call: never retried (it may have been billed). Returns {bytes,tokens} or
  // {error:'Hungarian reason'}.
  async function openaiPicture(url,payload){
    const key=process.env.OPENAI_API_KEY;if(!key)return {error:'Nincs beállítva OpenAI-kulcs.'};
    try{characterPolicy?.assertPrompt?.(payload.prompt);}catch{return {error:'A képleírás nem felelt meg a szereplő-szabálynak.'};}
    let response;
    try{response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload)});}
    catch{return {error:'A kapcsolat megszakadt; lehet, hogy a próbálkozás díjat számolt fel. Nem próbálom újra.'};}
    if(!response.ok){await response.body?.cancel?.().catch(()=>{});return {error:'Az OpenAI elutasította (HTTP '+response.status+'). Nem próbálom újra.'};}
    try{
      const raw=await response.json(),b64=raw?.data?.[0]?.b64_json;
      if(typeof b64!=='string'||!b64.length||b64.length>20*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error();
      const bytes=Buffer.from(b64,'base64');if(!(bytes[0]===0xff&&bytes[1]===0xd8)&&!(bytes[0]===0x89&&bytes[1]===0x50))throw Error();
      return {bytes,tokens:Number.isSafeInteger(raw.usage?.total_tokens)?raw.usage.total_tokens:null};
    }catch{return {error:'A kapott kép nem volt olvasható.'};}
  }
  async function keepPicture(gid,suffix,bytes){
    await fs.mkdir(guestDir(),{recursive:true});const file=gid+suffix+(bytes[0]===0xff?'.jpg':'.png');
    await fs.writeFile(path.join(guestDir(),file),bytes,{flag:'wx'});return file;
  }
  async function guestPortrait(gid,prompt){
    const note=[];const set=(sql,...args)=>run(sql,...args,gid);
    const dressed=await openaiPicture('https://api.openai.com/v1/images/generations',{model:GUEST_IMAGE_MODEL,prompt:'Photorealistic photograph of one adult man, fully clothed in his everyday clothes. '+GUEST_FRAMING+' '+prompt,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg'});
    if(dressed.error)return set("UPDATE play_guests SET image_status='failed',bare_status='failed',image_note=? WHERE id=?",dressed.error);
    const file=await keepPicture(gid,'-'+Date.now(),dressed.bytes);note.push('felöltözött: OpenAI '+GUEST_IMAGE_MODEL+(dressed.tokens?', '+dressed.tokens+' token':''));
    set("UPDATE play_guests SET image_status='done',image_file=?,image_note=? WHERE id=?",file,note.join('; '));
    await guestShirtless(gid,dressed.bytes,note);
  }
  // The shirtless version is an edit of the dressed picture, so it stays the same man.
  async function guestShirtless(gid,dressedBytes,note=[]){
    const set=(sql,...args)=>run(sql,...args,gid);
    const bare=await openaiPicture('https://api.openai.com/v1/images/edits',{model:GUEST_IMAGE_MODEL,prompt:'Edit this photo: the same adult man with the same face, hair, skin, body build, expression and the same background, now shirtless (bare upper body, no shirt). '+GUEST_FRAMING+' Calm, natural and non-sexual. Photorealistic.',images:[{image_url:'data:'+(dressedBytes[0]===0xff?'image/jpeg':'image/png')+';base64,'+dressedBytes.toString('base64')}],n:1,size:'1024x1536',quality:'medium',output_format:'jpeg'});
    if(bare.error){note.push('félmeztelen: '+bare.error);return set("UPDATE play_guests SET bare_status='failed',image_note=? WHERE id=?",note.join('; '));}
    const bareFile=await keepPicture(gid,'-felmeztelen-'+Date.now(),bare.bytes);note.push('félmeztelen: OpenAI '+GUEST_IMAGE_MODEL+(bare.tokens?', '+bare.tokens+' token':''));
    set("UPDATE play_guests SET bare_status='done',bare_file=?,image_note=? WHERE id=?",bareFile,note.join('; '));
  }
  // The owner's click: new dressed and shirtless pictures (e.g. after the framing changed).
  // Two paid calls; the earlier files stay in the guest folder, the new ones are shown.
  function renewPictures(gid){
    if(playSettings().guest_image_provider==='sogni')throw fail('A Sogni-portréhoz nyisd meg a külön képkérést és hagyd jóvá a becslést.',409);
    const g=guestRow(gid);if(g.left_at)throw fail('Ez a vendégszereplő már elment.',409);
    if(g.image_status==='pending'||g.bare_status==='pending')return conversationView(g.conversation_id);
    run("UPDATE play_guests SET image_status='pending',bare_status='pending' WHERE id=?",g.id);
    guestPortrait(g.id,g.portrait_prompt||g.description).catch(()=>run("UPDATE play_guests SET image_status=CASE WHEN image_status='pending' THEN 'failed' ELSE image_status END,bare_status=CASE WHEN bare_status='pending' THEN 'failed' ELSE bare_status END WHERE id=?",g.id));
    return conversationView(g.conversation_id);
  }
  // The owner's click (2026-11-18): a guest who has a dressed picture but no shirtless one (made
  // before that feature, or the edit failed) gets one now. One paid call, never automatic.
  async function addShirtless(gid){
    if(playSettings().guest_image_provider==='sogni')throw fail('A Sogni-portréhoz nem indul automatikus OpenAI-szerkesztés. Válassz külön szolgáltatót ehhez a képhez.',409);
    const g=guestRow(gid);if(g.left_at)throw fail('Ez a vendégszereplő már elment.',409);
    if(g.image_status!=='done'||!g.image_file)throw fail('Előbb felöltözött profilkép kell.',409);
    if(g.bare_status==='done'||g.bare_status==='pending')return conversationView(g.conversation_id);
    const bytes=await fs.readFile(path.join(guestDir(),path.basename(g.image_file)));
    run("UPDATE play_guests SET bare_status='pending' WHERE id=?",g.id);
    guestShirtless(g.id,bytes,g.image_note?[g.image_note]:[]).catch(()=>run("UPDATE play_guests SET bare_status='failed' WHERE id=? AND bare_status='pending'",g.id));
    return conversationView(g.conversation_id);
  }
  function guestRow(gid){const g=one('SELECT * FROM play_guests WHERE id=?',gid);if(!g)throw fail('Nincs ilyen vendégszereplő.',404);return g;}
  function leaveGuest(gid){const g=guestRow(gid);run('UPDATE play_guests SET left_at=COALESCE(left_at,?) WHERE id=?',iso(),g.id);return conversationView(g.conversation_id);}
  // Saved by the owner's click: a real character (male by policy), with the guest's description as
  // working appearance text (not canon). The portrait is copied into his new character folder and
  // shows up in the gallery after the next library scan.
  async function saveGuest(gid){
    const g=guestRow(gid);if(g.saved_character_id)return conversationView(g.conversation_id);
    if(one('SELECT 1 FROM characters WHERE lower(trim(name))=lower(trim(?))',g.name))throw fail('Már van ilyen nevű szereplő: '+g.name+'.',409);
    const cid=randomUUID();
    transaction(()=>{run('INSERT INTO characters(id,name,biography,appearance,created_at) VALUES(?,?,?,?,?)',cid,g.name,'Nem: férfi.',g.description,iso());run('UPDATE play_guests SET saved_character_id=? WHERE id=?',cid,g.id);});
    const pictures=[];
    const files=[[g.image_file,'profilkép'],[g.bare_file,'félmeztelen']].filter(([f])=>f);
    if(root&&files.length&&!/[\\/:*?"<>|\u0000-\u001f]|^[. ]|[. ]$/.test(g.name)){
      try{const dir=path.join(root,'10_CHARACTERS',g.name),realRoot=await fs.realpath(root);await fs.mkdir(dir,{recursive:true});const realDir=await fs.realpath(dir);
        if(realDir.startsWith(realRoot+path.sep)){
          for(const [f,label] of files){const target=path.join(realDir,g.name+' - '+label+' - '+localDay(now())+path.extname(f));
            try{await fs.copyFile(path.join(guestDir(),f),target,fs.constants?.COPYFILE_EXCL??1);pictures.push(path.basename(target));}catch{}}
          run('INSERT INTO sorted_folders VALUES(?,?) ON CONFLICT(folder) DO NOTHING',path.join('10_CHARACTERS',g.name),cid);}}catch{}
    }
    return {...conversationView(g.conversation_id),saved:{character_id:cid,name:g.name,picture:pictures[0]||null,pictures}};
  }
  // Only the "reply" field is shown while it arrives, and only when it grew.
  function replyWatcher(onReply){
    if(!onReply)return {};
    let shown=0;
    return {onText:raw=>{const r=partialJsonString(raw,'reply');if(r&&r.length>shown){shown=r.length;onReply(r.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').slice(0,1500));}}};
  }
  async function talkOnce(body,onReply=null,{advanceTime=true}={}){
    // opener: Palor just walked up, so the character speaks first (no Palor line).
    const opener=body.opener===true&&!body.conversation_id;
    let text=typeof body.text==='string'?body.text.trim():'';
    // Pace controls inside an intimate scene (2026-11-11): a stage direction from Palor; "stop"
    // also ends the intimate scene, and the character must respect it.
    if(body.pace&&!text)text=PACE_TEXT[body.pace];
    // Palor may show a photo of the two of them; the character sees its description.
    if(body.photo_id!==undefined){
      const shared=(await sharedPhotos(body.character_id||one('SELECT character_id FROM play_conversations WHERE id=?',body.conversation_id??'')?.character_id,200)).find(p=>p.media_id===body.photo_id);
      if(!shared)throw fail('This photo does not show the two of them.',400);
      text=`*Megmutat neked a telefonján egy közös fotót rólatok${shared.description?': '+shared.description:''}*`+(text?' '+text:'');
    }
    if(!opener&&(!text||text.length>2600))throw fail('Write what Palor says (at most 2000 characters).');
    const pid=w.palor()?.id;if(!pid)throw fail('No character named Palor exists.',409);
    let conv=body.conversation_id?one('SELECT * FROM play_conversations WHERE id=?',body.conversation_id):null;
    if(body.conversation_id&&!conv)throw fail('Conversation not found',404);
    if(conv&&conv.status!=='open')throw fail('This conversation has ended.',409);
    // One open conversation per character and channel (two tabs, or phone and in person):
    // a new start continues the open one instead of opening a second.
    if(!conv&&body.character_id){
      const existing=one("SELECT * FROM play_conversations WHERE character_id=? AND channel=? AND status='open' AND rewound_at IS NULL AND mode<>'group' ORDER BY rowid DESC LIMIT 1",body.character_id,body.channel==='phone'?'phone':'in_person');
      if(existing){if(opener)return conversationView(existing.id);conv=existing;}
    }
    const cid=conv?.character_id||body.character_id;
    const c=w.meetable().find(x=>x.id===cid);if(!c)throw fail('Only characters with a Szellemprofil can talk in Play mode for now.',409);
    // Intimate mode: only in person, only when the owner switch and the relationship allow
    // it. It routes the explicit profile fields into this one conversation.
    const stage=intimacyStage(cid);
    if(body.pace&&conv?.mode!=='intimate')throw fail('Pace controls work inside an intimate scene.',409);
    const stopping=body.pace==='stop';
    const intimate=!stopping&&(conv?.mode==='intimate'||body.intimate===true);
    if(intimate&&(stage!=='intimate'||(conv?.channel||body.channel)==='phone'))throw fail('This closeness is not open between them yet.',409);
    const k=clock(),channel=conv?.channel||(body.channel==='phone'?'phone':'in_person');
    const nodes=await tree(),here=currentNode(nodes);
    // Light presence check (positions only): the full place view also loads figures and
    // stand-in pictures for everyone there, which a talk never needs.
    if(channel==='in_person'&&!conv&&!isHere(cid,here))throw fail('He is not here right now.',409);
    const history=conv?lines(conv.id):[];
    const note=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',cid,pid)?.description||'';
    const level=w.levelOf(cid,pid);
    const today=all("SELECT title,summary FROM world_events WHERE rewound_at IS NULL AND world_day=? AND status IN ('applied','accepted') AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY rowid",k.day,cid);
    // Available figure expressions (file names like alap, mosoly, ideges) the reply may pick.
    const moods=[...new Set(figures(cid).map(s=>s.expression))];
    // Scene beats the reply may reach: everyday talk, flirt and a kiss in an ordinary
    // conversation (not when the stage is closed); undressing, sex and afterwards only once the
    // conversation became an intimate scene.
    const beats=stage==='none'?['talk']:intimate?BEATS:BEATS.slice(0,3);
    const where=channel==='phone'?'telefonon (üzenetváltás)':`itt: ${here?.path||here?.name||'ismeretlen hely'}${here?` (${KIND_LABEL[kindOf(here)]})`:''}`;
    // Long talk: ask the reply to refresh a short running summary every few turns (no extra call).
    const memo=(()=>{try{return JSON.parse(conv?.memo_json||'null');}catch{return null;}})();
    // memo_json also carries the scene state ({scene}) since 2026-11-15, so a memo without text
    // is not yet a summary.
    const wantMemo=history.length>=MEMO_FROM&&(!memo?.text||history.length-memo.lines>=6);
    // Anti-repeat (2026-11-15): his own last replies, quoted back as phrases not to reuse; a long
    // monotonous scene otherwise makes the model rotate the same few sentences.
    const ownLast=history.filter(l=>l.speaker!=='palor'&&!isGuestLine(l)).slice(-4).map(l=>'- '+clip(l.text,300));
    // Guests who joined this scene (owner, 2026-11-18): this reply also writes their lines.
    const guests=conv&&channel==='in_person'?guestsOf(conv.id):[];
    // Whom Palor's line names (owner 2026-11-19: the one he speaks to must answer). A name counts
    // with Hungarian endings too ("Feri", "Ferit", "Ferinek").
    // Any part of a name counts (Hungarian names put the family name first), except a part that
    // several people here share.
    const parts=n=>String(n||'').trim().toLocaleLowerCase('hu').split(/[\s-]+/).filter(w=>w.length>=2);
    const sharedParts=(()=>{const seen=new Map();for(const n of [c.name,...guests.map(g=>g.name)])for(const w of new Set(parts(n)))seen.set(w,(seen.get(w)||0)+1);return new Set([...seen].filter(([,k])=>k>1).map(([w])=>w));})();
    const named=n=>!!text&&parts(n).filter(w=>!sharedParts.has(w)).some(w=>new RegExp('(^|[^\\p{L}])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu').test(text));
    const addressed=guests.length&&!opener?guests.filter(g=>named(g.name)):[],mainAddressed=guests.length&&!opener&&named(c.name);
    // Scene state (2026-11-15): one line on where the scene stands, rewritten by every reply so the
    // scene has an arc instead of standing still.
    const sceneNow=typeof memo?.scene==='string'?memo.scene:'';
    // Owner 2026-11-18: what the narrator ("Rendszer") described since his last reply is part of
    // the scene; he continues from it.
    const narrated=conv?all("SELECT answer FROM play_narrations WHERE conversation_id=? AND created_at>COALESCE((SELECT max(created_at) FROM active_play_lines WHERE conversation_id=? AND speaker='character'),'') ORDER BY created_at DESC LIMIT 2",conv.id,conv.id).reverse().map(r=>clip(r.answer,1500)):[];
    // Suggested lines (2026-11-15): last round's suggestions and Palor's own last lines are quoted
    // back so the suggestions do not rotate either.
    const prevChoices=(()=>{if(!conv)return [];try{return cleanChoices(JSON.parse(one("SELECT m.choices_json FROM active_play_lines l JOIN play_line_meta m ON m.line_id=l.id WHERE l.conversation_id=? AND l.speaker='character' ORDER BY l.rowid DESC LIMIT 1",conv.id)?.choices_json||'[]'));}catch{return [];}})();
    const palorLast=history.filter(l=>l.speaker==='palor').slice(-3).map(l=>clip(l.text,200));
    // Palor's own voice for the suggestions: his general style, how he talks to this person, his
    // flirting; his intimacy sections only inside an intimate scene.
    const voice=palorVoice(speechOf(w.profile(pid)),c.name,{intimate});
    // Place and time are not in the system message (2026-11-12): it stays the same through a
    // conversation, so the provider's prompt cache can reuse it; they come at the end instead.
    const system=`Te ${c.name} vagy egy élő világban, és Palorral beszélsz (hol és mikor: az üzenet végén). Maradj a szerepben, a saját hangodon és beszédstílusodban, magyarul, röviden (1-4 mondat, mint egy valódi beszélgetésben; cselekvést *csillagok között* írhatsz). Minden válaszod vigye előre a jelenetet valami újjal (új mozdulat, érzés, érzékelés, gondolat, kérdés, helyzetváltozás vagy tempóváltás); ne ismételd a saját korábbi mondataidat, fordulataidat és képeidet, és ne kezdd ugyanúgy, mint az előzőt. Csak a profilodból, a Palorhoz fűződő kapcsolatodból, a közös múltatokból, az emlékeidből és a mai napodból dolgozz; ne találj ki új tényt a múltról, rokonokról vagy Palorról. Csak azt tudod Palorról, ami a kapcsolatodban és az emlékeidben szerepel; a titkos érzéseit nem ismered. A beszélgetőtársad neve Palor: ha nevén szólítod, mindig Palornak hívd; ő nem azonos a profilodban vagy az emlékeidben említett más emberekkel (barátok, rokonok, kollégák). Mindenki felnőtt. Senki nem hal meg. ${CLOSENESS_RULES[stage!=='none'&&(intimate||stage==='intimate')&&hostileWith(cid)?'hostile':intimate?'intimate':stage]}${channel==='phone'?` Telefonon képet is küldhetsz magadról, ha Palor kér, vagy ha nagyon illik a beszélgetéshez (ritkán): "photo" = ${PHONE_MOODS[stage].map(x=>`"${x}"`).join(' / ')}${stage==='none'?' (hétköznapi kép)':''}; egyébként "none".`:''} ${channel==='in_person'?` "beat": hol tart most köztetek a jelenet a te válaszod után (${beats.join(' / ')}); csak akkor lépj tovább, ha a beszélgetésben tényleg odáig jutottatok, és te is akarod.`:''} "leaving": ha most magadtól le akarod zárni a beszélgetést (dolgod van, sietsz, megsértődtél, eleged lett), egy rövid ok; különben "". Ha nem üres, a válaszodban jelezd is a saját módodon; a döntés a természetedé, nem kell mindig maradnod. "spark": hogyan hatott rád Palor utolsó mondata (-1 rosszul esett, 0 semleges, 1 jólesett). ${CHOICE_RULES(intimate)} Csak JSON: {"reply":"..."${moods.length>1?`,"mood":"${moods.join('|')}"`:''}${channel==='phone'?`,"photo":"none|${PHONE_MOODS[stage].join('|')}"`:`,"beat":"${beats.join('|')}"`},"leaving":"","spark":-1|0|1,"choices":["...","...","..."],"scene":"egy rövid mondat: hol tart most a jelenet a válaszod után, mi változott az előzőhöz képest"${wantMemo?',"memo":"2-3 mondat: az egész eddigi beszélgetés lényege (ki mit mondott, mit beszéltetek meg)"':''}}`;
    const last=one("SELECT id,summary_json,world_day FROM play_conversations WHERE character_id=? AND status='closed' AND rewound_at IS NULL ORDER BY closed_at DESC LIMIT 1",cid);
    let lastTalk='';try{const s=last?JSON.parse(last.summary_json||'{}'):null;if(s)lastTalk=`${last.world_day}: ${s.summary||s.title||''}`;}catch{}
    // Longer memory of Palor (2026-11-15): the shared history he keeps, and the few talks before
    // the last one (group scenes too), so older experiences are not only a faded memory line.
    const shared=sharedHistoryOf(cid);
    const earlier=pastTalks(cid,5).filter(r=>r.status==='closed'&&r.id!==last?.id&&(r.summary.summary||r.summary.title)).slice(0,3)
      .map(r=>`- ${r.world_day}${r.mode==='group'?' (társaságban)':''}: ${clip(r.summary.summary||r.summary.title,240)}`);
    // How long since they last talked: the character may notice it.
    const daysSince=last?Math.round((new Date(k.day)-new Date(last.world_day))/864e5):null;
    const sinceText=daysSince===null?'':daysSince===0?' (ma már beszéltetek)':daysSince>=7?` (${daysSince} napja nem beszéltetek – ezt észreveheted)`:` (${daysSince} napja)`;
    // His mood today, from today's events about him.
    const mood=moodOf(today);
    const innerLines=w.inner?w.inner.promptLines(cid,k.day,c.profile):[];
    // Gossip: what happened today to the people closest to him (level ≥ 3: they talk every day).
    // Anything else he knows only if someone told him in a world meeting (2026-11-12, plan step
    // 2.5): that arrives as a memory and comes back through recall.
    const gossip=all(`SELECT e.title,e.summary FROM world_events e WHERE e.rewound_at IS NULL AND e.world_day=? AND e.status IN ('applied','accepted') AND json_extract(e.payload_json,'$.with_palor') IS NOT 1
        AND NOT EXISTS(SELECT 1 FROM json_each(e.payload_json,'$.character_ids') WHERE value=?)
        AND EXISTS(SELECT 1 FROM json_each(e.payload_json,'$.character_ids') j WHERE j.value IN (SELECT target_id FROM world_relationship_levels WHERE source_id=? AND level>=3)) ORDER BY e.rowid DESC LIMIT 3`,k.day,cid,cid);
    // His own beliefs about Palor and the others here (plan step 2.4): subjective, may be wrong.
    const beliefs=w.beliefsFor?w.beliefsFor(cid):[];
    // Whose place this is to him (his home, his workplace…).
    const placeRole=channel==='in_person'&&here?.location_id?one('SELECT role FROM world_places WHERE character_id=? AND location_id=? LIMIT 1',cid,here.location_id)?.role:null;
    const ROLE_CONTEXT={home:'Palor nálad van, a saját otthonodban.',work:'A munkahelyeden vagy, munka közben.',routine:'Egy megszokott helyeden vagy.',other:''};
    // Recall (2026-11-12): the memories about Palor, this place and what is being said now,
    // plus the newest ones; before, simply the last 12.
    const memories=w.recallMemories(cid,{about:['Palor'],place:channel==='in_person'?here?.name||'':'',text:history.slice(-6).map(l=>l.text).join(' ')+' '+text});
    // Promises and plans between them; a lapsed one is brought up once.
    const threads=w.openThreadsFor(cid,k.day);
    const threadText=[...threads.open.map(t=>`- ${t.promised_by==='palor'?'Palor ígérte':'Te ígérted'}: ${clip(t.text,200)}${t.due_day?' (esedékes: '+t.due_day+')':''}`),
      ...threads.lapsed.map(t=>`- ELMARADT: ${t.promised_by==='palor'?'Palor nem tartotta meg':'te nem tartottad meg'}: ${clip(t.text,200)} (szóvá teheted, a természeted szerint)`),...(threads.lapsed.length&&appraiseEvent(c.profile,'broken_promise')?['  '+appraiseEvent(c.profile,'broken_promise')]:[])].join('\n');
    const paceNote=body.pace==='slower'?'Palor lassítani szeretne: maradjatok a mostani ponton, gyengédebben, ne lépj tovább a jelenetben.':body.pace==='continue'?'Palor szeretné folytatni: ha te is akarod, mehettek tovább.':stopping?'Palor megállt. Az intim jelenet itt véget ér: tiszteld, reagálj kedvesen, és ne folytasd.':'';
    // Dates (2026-11-11): Palor arriving for a date they arranged, or having missed one.
    const date=channel==='in_person'&&here?.location_id?one("SELECT d.appointment_id,d.met_at FROM play_dates d JOIN play_appointments a ON a.id=d.appointment_id WHERE a.character_id=? AND a.world_day=? AND a.slot=? AND a.location_id=? AND a.status='accepted'",cid,k.day,SLOTS[k.slot_index].id,here.location_id):null;
    const missed=all("SELECT d.appointment_id,a.world_day,a.slot,l.name place FROM play_dates d JOIN play_appointments a ON a.id=d.appointment_id LEFT JOIN locations l ON l.id=a.location_id WHERE a.character_id=? AND a.status='accepted' AND d.met_at IS NULL AND d.missed_noted_at IS NULL",cid)
      .filter(x=>x.world_day<k.day||(x.world_day===k.day&&SLOTS.findIndex(s=>s.id===x.slot)<k.slot_index))[0]||null;
    const dateNote=[date?`RANDEVÚ: ezt a találkozót Palorral beszéltétek meg ide, erre a napszakra${date.met_at?', és már itt vagytok együtt':', és Palor most megérkezett'}.`:'',missed?`ELMARADT RANDEVÚ: Palor nem jött el a megbeszélt találkozóra (${missed.world_day}, ${SLOTS.find(s=>s.id===missed.slot)?.label||''}${missed.place?', '+missed.place:''}). Ezt szóvá teheted; csalódott vagy sértett is lehetsz, a természeted szerint.${appraiseEvent(c.profile,'missed_date')?' '+appraiseEvent(c.profile,'missed_date'):''}`:''].filter(Boolean).join('\n');
    const longTalk=history.length>=14?'A beszélgetés már hosszú: ha természetes, kezdd el lezárni (búcsú, teendő, más elfoglaltság).':'';
    const corrections=directorText(cid);
    const user=['PROFILOD:\n'+w.profileText(c.profile,{explicit:intimate||(stage==='intimate'&&channel!=='phone'),secrets:true}),
      ...(corrections?[corrections]:[]),
      `KAPCSOLATOD PALORRAL [${LEVELS[level??0]}]:\n`+(clip(note,1500)||'nincs megadva'),
      ...(voice?[PALOR_VOICE_HEAD+voice]:[]),
      'ÍGY BESZÉLSZ VELE: '+LEVEL_STYLE[String(level??0)]+'. '+TIME_MOOD[k.slot_index]+'.',
      channel==='in_person'?'MOST ÉPPEN: '+activityOf(cid,here?.location_id):'MOST ÉPPEN: telefonon írsz Palorral.',
      ...(shared?['KÖZÖS MÚLTATOK PALORRAL (ahogy te emlékszel rá):\n'+clip(shared,1500)]:[]),
      ...(earlier.length?['KORÁBBI BESZÉLGETÉSEITEK:\n'+earlier.join('\n')]:[]),
      'LEGUTÓBB PALORRAL: '+(lastTalk?lastTalk+sinceText:'még nem beszélgettetek'),
      // E2 (2026-11-21): his carried inner state; the day's events stay as background.
      ...(innerLines.length?['A MAI NAPOD: '+mood.text+(placeRole&&ROLE_CONTEXT[placeRole]?' '+ROLE_CONTEXT[placeRole]:''),...innerLines]:['HANGULATOD MA: '+mood.text+(placeRole&&ROLE_CONTEXT[placeRole]?' '+ROLE_CONTEXT[placeRole]:'')]),
      // E3 (2026-11-21): how things hit him, from his motives and temperament.
      ...(()=>{const ap=appraisalLines(c.profile);return ap.length?[ap.join('\n')]:[];})(),
      'EMLÉKEID:\n'+(memories.map(m=>'- '+clip(m,300)).join('\n')||'nincs'),
      'MA VELED TÖRTÉNT:\n'+(today.map(e=>`- ${e.title}: ${clip(e.summary,200)}`).join('\n')||'semmi különös'),
      ...(gossip.length?['MA HALLOTTAD AZ ISMERŐSEIDRŐL (szóba hozhatod, ha illik):\n'+gossip.map(e=>`- ${e.title}: ${clip(e.summary,160)}`).join('\n')]:[]),
      // E6 (2026-11-21): why your relationship changed lately (newest first), from the level history.
      ...(()=>{const r=pid?all("SELECT level,previous_level,reason FROM world_level_revisions WHERE source_id=? AND target_id=? AND actor NOT IN ('rewind','rewind_undo') AND trim(coalesce(reason,''))<>'' ORDER BY created_at DESC,rowid DESC LIMIT 3",cid,pid):[];return r.length?['MIÉRT VÁLTOZOTT LEGUTÓBB A VISZONYOTOK (a legfrissebb elöl):\n'+r.map(x=>`- ${x.level>(x.previous_level??0)?'közelebb':'távolabb'}: ${clip(x.reason,200)}`).join('\n')]:[];})(),
      ...(threadText?['TERVEK ÉS ÍGÉRETEK KÖZTETEK:\n'+threadText]:[]),
      // E5 (2026-11-21): permission and reasons to disagree, by his nature and state.
      ...(()=>{const st=w.inner?.current(cid);return [stanceLines(c.profile,{inner:st,effective:effectiveIntensity(st,k.day,c.profile),level:level??0}).join('\n')];})(),
      // E4 (2026-11-21): his own aim in this talk.
      ...(()=>{const a=agendaFor({lapsed:threads.lapsed,inner:w.inner?.current(cid),profile:c.profile,early:history.length<6});return a?[a]:[];})(),
      ...(beliefs.length?['A VÉLEMÉNYED (saját benyomás, tévedhetsz; ne mondd ki szó szerint):\n'+beliefs.map(b=>`- ${b.about_name}: ${clip(b.text,200)}`).join('\n')]:[]),
      ...(longTalk?[longTalk]:[]),...(paceNote?['RENDEZŐI JELZÉS: '+paceNote]:[]),...(dateNote?[dateNote]:[]),
      `HOL ÉS MIKOR: ${where}, ${k.weekday} ${k.slot}.`,
      // Lines older than the window live on in the running summary.
      ...(memo?.text&&history.length>HISTORY_WINDOW?['A BESZÉLGETÉS KORÁBBI RÉSZE (összefoglaló): '+clip(memo.text,800)]:[]),
      ...(guests.length?(()=>{const gNames=guests.map(g=>g.name).join(', ');return [`TÖBBEN VAGYTOK A JELENETBEN. Szereplők: Palor (a játékos – az ő szavait és tetteit soha nem te írod), te (${c.name}), és aki most csatlakozott (részt vesz mindenben, ami történik, intim jelenetben is):\n`+guests.map(g=>`- ${g.name}: ${clip(g.description,600)}`).join('\n')
        +`\nAz ő megszólalásait és cselekvéseit is te írod, külön: a JSON-ba tedd bele ezt is: "guests":[{"name":"<a neve>","text":"<amit mond vagy tesz, cselekvés *csillagok között*, 1–3 mondat>"}]. Mindegyikük legfeljebb egy sort kap. A "reply" csak a te (${c.name}) válaszod. Mindenkit a nevén nevezz (${c.name}, ${gNames}, Palor), ne „idegennek” vagy „új férfinak”, és mindig legyen világos, ki mit csinál kivel.`
        +'\nKI KINEK SZÓL: '+(addressed.length?`Palor most ${addressed.map(g=>g.name).join(' és ')} felé szólt. ${addressed.length>1?'Nekik':'Neki'} KÖTELEZŐ érdemben, közvetlenül arra válaszolnia, amit Palor mondott vagy tett (a "guests"-ben); a te "reply"-od ilyenkor rövid reakció.${mainAddressed?` Palor téged (${c.name}) is megszólított, te is válaszolj rá érdemben.`:''}`
          :mainAddressed?`Palor most hozzád (${c.name}) szólt: te válaszolj rá érdemben; ${gNames} csak akkor szól közbe, ha természetes.`
          :`Aki felé Palor mondata egyértelműen szól (a szövegkörnyezetből), az válaszoljon rá érdemben; a többiek csak akkor, ha természetes.`)
        +`\nA "choices" ebben a jelenetben is KIZÁRÓLAG Palor saját következő mondatai vagy tettei, Palor szemszögéből (E/1: „én” = Palor), soha nem a te (${c.name}) vagy ${gNames} szavai. Mindegyikben legyen egyértelmű, kihez szól vagy kivel tesz valamit: szólítsa a nevén (${c.name} vagy ${gNames}). Ki mit csinál kivel, az legyen összhangban azzal, ami eddig történt.`
        +`\nTedd bele azt is: "intimate":true, ha a jelenet a te válaszod és az ő soraik után szexuális, meztelen vagy testi-intim; különben "intimate":false.`];})():[]),
      'A BESZÉLGETÉS EDDIG:\n'+(history.slice(-HISTORY_WINDOW).map(l=>(l.speaker==='palor'?'Palor':isGuestLine(l)?l.speaker_name:c.name)+': '+l.text).join('\n')||'(most kezdődik)'),
      ...(sceneNow?['A JELENET MOST (innen lépj tovább): '+clip(sceneNow,300)]:[]),
      ...(narrated.length?['A JELENET LEÍRÁSA (a játék narrátora írta; ez történik most, ebből folytasd, ne ismételd szó szerint):\n'+narrated.join('\n')]:[]),
      ...(ownLast.length>=2?['A TE UTOLSÓ VÁLASZAID – ezek mondatait, fordulatait és képeit most NE ismételd, mondj mást, másképp:\n'+ownLast.join('\n')]:[]),
      ...(prevChoices.length||palorLast.length>=2?['A "choices" NE ismételje ezeket (előző javaslatok és Palor korábbi mondatai):\n'+[...prevChoices,...palorLast].map(x=>'- '+x).join('\n')]:[]),
      opener?(channel==='phone'?'Palor most felhívott. Vedd fel, és szólalj meg te elsőként.':'Palor most lép oda hozzád, még nem szólt. Vedd észre, és szólalj meg te elsőként, ahhoz illően, amit éppen csinálsz.'):'Palor: '+text].join('\n\n');
    // 600 tokens: reply plus mood, beat, spark and three suggested lines, in Hungarian. If the
    // answer is still cut short, keep the reply that arrived and default the rest.
    // 700 since 2026-11-15: the scene-state line rides along too.
    let out=await w.ask(system,user,700+guests.length*200,replyWatcher(onReply));
    if(out?.__truncated)out={reply:partialJsonString(out.raw,'reply')||''};
    // The guests' lines: only names of guests in this scene, one line each, plain text.
    const guestLines=[];if(guests.length&&Array.isArray(out?.guests))for(const x of out.guests.slice(0,MAX_GUESTS)){
      const gid=matchPerson(guests,x?.name),said=clip(plainText(x?.text),800);if(gid&&said&&!guestLines.some(y=>y.id===gid))guestLines.push({id:gid,text:said});}
    // Plain text only: no control characters or markup from the model.
    const reply=clip(String(out?.reply??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,''),1500);if(!reply)throw fail('The character did not answer. Try again.',502);
    const id=conv?.id||randomUUID(),t=iso(),replyId=randomUUID();
    // A picture he sends with the reply (phone only), chosen from his own media.
    const sent=channel==='phone'&&typeof out?.photo==='string'&&out.photo!=='none'?await phonePhoto(cid,out.photo,history.slice(-6).map(l=>l.text).join(' ')+' '+text+' '+reply,conv?.id):null;
    const beat=channel==='in_person'?(beats.includes(out?.beat)?out.beat:'talk'):null;
    const spark=opener?0:[-1,0,1].includes(Number(out?.spark))?Number(out.spark):0;
    const choices=cleanChoices(out?.choices);
    // The scene picture for this moment: a new one when the beat moves on, at the start, or
    // after three replies on the same picture (never one already shown in this conversation).
    // Only with the automatic scene picture on: a picture nobody sees must not count as seen.
    const scene=channel==='in_person'&&playSettings().auto_scene!==false?await sceneFor({cid,conv,beat,context:history.slice(-6).map(l=>l.text).join(' ')+' '+text+' '+reply,here}):null;
    transaction(()=>{
      // Closed while he was answering (stale close, another device): never add lines to a closed talk.
      if(conv&&!one("SELECT 1 FROM play_conversations WHERE id=? AND status='open'",conv.id))throw fail('This conversation has ended.',409);
      const priorRowid=one('SELECT coalesce(max(rowid),0) n FROM active_play_lines WHERE conversation_id=?',id).n,beforeIntimateFlag=!!one('SELECT 1 FROM play_conversation_flags WHERE conversation_id=?',id);
      if(!conv)run("INSERT INTO play_conversations(id,character_id,location_id,channel,world_day,slot,status,created_at,mode) VALUES(?,?,?,?,?,?,'open',?,?)",id,cid,channel==='phone'?null:here?.location_id||null,channel,k.day,k.slot,t,intimate?'intimate':'normal');
      else if(intimate&&conv.mode!=='intimate')run("UPDATE play_conversations SET mode='intimate' WHERE id=?",id);
      if(intimate)run('INSERT OR IGNORE INTO play_conversation_flags VALUES(?,?)',id,t);
      else if(stopping)run("UPDATE play_conversations SET mode='normal' WHERE id=?",id);
      if(!opener)run('INSERT INTO play_lines VALUES(?,?,?,?,?)',randomUUID(),id,'palor',text,t);
      // The guest Palor spoke to answers first (owner 2026-11-19), then the partner's reply.
      const guestFirst=addressed.length>0,putGuests=()=>{for(const g of guestLines){const lid=randomUUID();run('INSERT INTO play_lines VALUES(?,?,?,?,?)',lid,id,'character',g.text,t);run('INSERT INTO play_line_speaker VALUES(?,?)',lid,'guest:'+g.id);}};
      if(guestFirst)putGuests();
      run('INSERT INTO play_lines VALUES(?,?,?,?,?)',replyId,id,'character',reply,t);
      if(sent)run('INSERT INTO play_line_media VALUES(?,?,?,?,?,?)',replyId,sent.media_id,sent.kind,sent.level,JSON.stringify(sent.reasons),t);
      run('INSERT INTO play_line_meta(line_id,beat,spark,choices_json,intimate) VALUES(?,?,?,?,?)',replyId,beat,spark,JSON.stringify(choices),guests.length&&typeof out?.intimate==='boolean'?(out.intimate?1:0):null);
      if(!guestFirst)putGuests();
      if(date&&!date.met_at)run('UPDATE play_dates SET met_at=?,conversation_id=? WHERE appointment_id=?',t,id,date.appointment_id);
      if(missed)run('UPDATE play_dates SET missed_noted_at=? WHERE appointment_id=?',t,missed.appointment_id);
      if(threads.lapsed.length)w.noteLapsed(threads.lapsed.map(x=>x.id));
      {const plain=s=>s.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
        const newMemo=wantMemo&&typeof out?.memo==='string'&&out.memo.trim()?{text:clip(plain(out.memo),800),lines:history.length+(opener?1:2)}:(memo?.text?{text:memo.text,lines:memo.lines}:{});
        const newScene=typeof out?.scene==='string'&&plain(out.scene)?clip(plain(out.scene),300):sceneNow;
        const next={...newMemo,...(newScene?{scene:newScene}:{})};
        if(Object.keys(next).length&&JSON.stringify(next)!==(conv?.memo_json||''))run('UPDATE play_conversations SET memo_json=? WHERE id=?',JSON.stringify(next),id);}
      if(scene)run('INSERT INTO play_line_scene VALUES(?,?,?,?,?,?,?,?)',replyId,scene.media_id,scene.kind,scene.level,beat,scene.start_at??null,JSON.stringify(scene.display),t);
      turnRevisions.record(replyId,id,{palor_text:opener?null:text,memo_json:conv?.memo_json||null,mode:conv?.mode||'normal',had_intimate_flag:beforeIntimateFlag,line_ids:all('SELECT id FROM active_play_lines WHERE conversation_id=? AND rowid>? ORDER BY rowid',id,priorRowid).map(row=>row.id)});
    });
    // Talking takes time (game clock, owner decision D1).
    if(advanceTime)gameClock?.advance(TALK_MINUTES,'talk');
    if(sent)director.markShown(sent.media_id,'phone',[cid]);
    if(scene){director.markShown(scene.media_id,'scene',scene.cast);run('INSERT INTO play_seen VALUES(?,?,?) ON CONFLICT DO UPDATE SET seen_at=excluded.seen_at',scene.media_id,cid,t);}
    // E4: he wants to end the talk (a short reason, shown beside his reply; not stored).
    const leaving=typeof out?.leaving==='string'?clip(out.leaving.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,'').trim(),160):'';
    return {...conversationView(id,moods.includes(out?.mood)?out.mood:null),...(leaving?{leaving}:{})};
  }
  // Which participant a name from the AI means: the full name, or one word of it (Hungarian
  // names put the given name last, "Teszt Béla" → "Béla"), but only when exactly one fits.
  const matchPerson=(people,name)=>{const key=String(name||'').trim().toLocaleLowerCase('hu');if(!key)return null;
    const exact=people.find(c=>c.name.toLocaleLowerCase('hu')===key);if(exact)return exact.id;
    const hits=people.filter(c=>{const n=c.name.toLocaleLowerCase('hu');return n.split(/[\s-]+/).includes(key)||n.startsWith(key+' ');});
    return hits.length===1?hits[0].id:null;};
  // ---- group scenes: Palor with 2–4 people at the same place, one AI call per turn ----------
  // Everyone answers in their own voice; nobody has to speak every turn. Group scenes are
  // never intimate and use no explicit profile fields. Knowledge boundary as in 1:1 talks:
  // each character knows only his own side of the relationship, never Palor's private notes.
  async function groupTalk(body){
    checkIds(body,['conversation_id']);
    const lockKey='group:'+(body.conversation_id||'new');
    if(inFlight.has(lockKey))throw fail('They are still answering. Wait a moment.',409);
    inFlight.add(lockKey);try{return await groupTalkOnce(body);}finally{inFlight.delete(lockKey);}
  }
  async function groupTalkOnce(body){
    const opener=body.opener===true&&!body.conversation_id,text=typeof body.text==='string'?body.text.trim():'';
    const requested=body.character_ids;
    if(requested!==undefined&&(!opener||!Array.isArray(requested)||requested.length<2||requested.length>4||requested.some(id=>typeof id!=='string'||!id)||new Set(requested).size!==requested.length))throw fail('A csoporthoz 2–4 különböző szereplőt válassz.');
    if(!opener&&(!text||text.length>2000))throw fail('Write what Palor says (at most 2000 characters).');
    const pid=w.palor()?.id;if(!pid)throw fail('No character named Palor exists.',409);
    let conv=body.conversation_id?one('SELECT * FROM play_conversations WHERE id=?',body.conversation_id):null;
    if(body.conversation_id&&(!conv||conv.mode!=='group'))throw fail('Conversation not found',404);
    if(conv&&conv.status!=='open')throw fail('This conversation has ended.',409);
    const nodes=await tree(),here=currentNode(nodes);if(!here)throw fail('Palor is not at a place.',409);
    const present=presentAt(here),cast=new Map(w.meetable().map(c=>[c.id,c]));
    if(requested?.some(id=>id===pid||!present.includes(id)||!cast.has(id)))throw fail('A kiválasztott szereplők egyike már nincs itt vagy nem megszólítható. Válassz újra.',409);
    const ids=conv?participantsOf(conv).filter(id=>present.includes(id)):requested||present.filter(id=>cast.has(id)).slice(0,4);
    // The company broke up (time passed, people left): close the scene with its save point
    // instead of leaving it open and refusing every line.
    if(conv&&ids.length<2)return {...await groupEnd(conv),dispersed:true};
    if(ids.length<2)throw fail('A group scene needs at least two people here who can talk.',409);
    const k=clock(),history=conv?lines(conv.id):[],people=ids.map(id=>cast.get(id)).filter(Boolean);
    const names=people.map(c=>c.name);
    // Intimate group scenes (owner, 2026-11-15): open only when intimacy with Palor is open for
    // every one of them (the same stage rule as a one-on-one talk); otherwise at most flirting.
    const STAGE_ORDER={none:0,flirt:1,intimate:2};
    const gStage=people.map(c=>intimacyStage(c.id)).reduce((m,s)=>STAGE_ORDER[s]<STAGE_ORDER[m]?s:m,'intimate');
    const gIntimate=gStage==='intimate',gBeats=gIntimate?BEATS:['talk','flirt'];
    const system=`Egy élő világ társas jelenetét írod: Palor ${names.join(', ')} társaságában van itt: ${here.path||here.name}, ${k.weekday} ${k.slot}. Mindenki a saját hangján, magyarul, röviden (1-2 mondat) szól; nem kell mindenkinek megszólalnia, és reagálhatnak egymásra is. Minden kör vigye előre a jelenetet valami újjal; senki ne ismételje a saját vagy a többiek korábbi mondatait, fordulatait, és ne kezdje ugyanúgy. Csak a profiljukból, a Palorhoz fűződő kapcsolatukból és a mai napjukból dolgozz; ne találj ki új tényt a múltról. Palor titkos érzéseit senki nem ismeri. Mindenki felnőtt. ${gIntimate?'Ez a társaság közel áll Palorhoz: a jelenet szexuálissá is válhat, ha a résztvevők tényleg odáig jutnak és akarják. Akkor írd nyíltan, kendőzetlenül, mindenki a saját hangján, a vágyai és a profiljában leírt szexuális preferenciái szerint; bárki kezdeményezhet, és bárki nemet mondhat vagy kiszállhat.':'Ez társas jelenet: nincs benne intim vagy szexuális tartalom.'} "beat": hol tart most a jelenet (${gBeats.join(' / ')}); csak akkor lépj tovább, ha tényleg odáig jutottak. ${CHOICE_RULES(gIntimate,{group:true})} Csak JSON: {"replies":[{"name":"${names[0]}","text":"..."}],"beat":"${gBeats.join('|')}","choices":["...","...","..."]} – 1-3 válasz, csak ezektől: ${names.join(', ')}.`;
    // E11 (2026-11-21): one shared detail level for the whole company, inner life kept.
    const castText=castProfileTexts(people.map(c=>c.profile),{explicit:gIntimate,intimate:gIntimate,secrets:true});
    const block=c=>{const level=w.levelOf(c.id,pid);const note=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',c.id,pid)?.description||'';
      const others=people.filter(o=>o.id!==c.id).map(o=>{const r=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',c.id,o.id)?.description;return r?`${o.name}: ${clip(r,200)}`:'';}).filter(Boolean);
      const fix=directorText(c.id);
      return `## ${c.name}\nPROFIL:\n${castText.texts[people.indexOf(c)]}${fix?'\n'+fix:''}${w.inner?w.inner.promptLines(c.id,k.day,c.profile,{person:'ő'}).map(x=>'\n'+x).join(''):''}${appraisalLines(c.profile,{person:'ő'}).map(x=>'\n'+x).join('')}${(()=>{const st=w.inner?.current(c.id);return '\n'+stanceLines(c.profile,{inner:st,effective:effectiveIntensity(st,k.day,c.profile),level:level??0,person:'ő'}).join(' ');})()}${(()=>{const a=agendaFor({lapsed:w.openThreadsFor(c.id,k.day).lapsed,inner:w.inner?.current(c.id),profile:c.profile,person:'ő'});return a?'\n'+a:'';})()}\nKAPCSOLATA PALORRAL [${LEVELS[level??0]}]: ${clip(note,600)||'nincs megadva'}\nMOST ÉPPEN: ${activityOf(c.id,here.location_id)}${others.length?'\nA TÖBBIEKHEZ: '+others.join('; '):''}`;};
    // Same anti-repeat and suggestion inputs as a one-on-one talk (2026-11-15).
    const ownLast=history.filter(l=>l.speaker!=='palor').slice(-4).map(l=>'- '+(l.speaker_name?l.speaker_name+': ':'')+clip(l.text,300));
    const palorLast=history.filter(l=>l.speaker==='palor').slice(-3).map(l=>clip(l.text,200));
    const prevChoices=(()=>{if(!conv)return [];try{return cleanChoices(JSON.parse(one("SELECT m.choices_json FROM active_play_lines l JOIN play_line_meta m ON m.line_id=l.id WHERE l.conversation_id=? AND l.speaker='character' ORDER BY l.rowid DESC LIMIT 1",conv.id)?.choices_json||'[]'));}catch{return [];}})();
    const voice=palorVoice(speechOf(w.profile(pid)),names.join(' '),{intimate:gIntimate});
    const user=[...people.map(block),'A JELENET EDDIG:\n'+(history.slice(-24).map(l=>(l.speaker==='palor'?'Palor':l.speaker_name||'?')+': '+l.text).join('\n')||'(most kezdődik)'),
      ...(ownLast.length>=2?['AZ UTOLSÓ VÁLASZOK – ezek mondatait, fordulatait és képeit most NE ismételjétek:\n'+ownLast.join('\n')]:[]),
      ...(voice?[PALOR_VOICE_HEAD+voice]:[]),
      ...(prevChoices.length||palorLast.length>=2?['A "choices" NE ismételje ezeket (előző javaslatok és Palor korábbi mondatai):\n'+[...prevChoices,...palorLast].map(x=>'- '+x).join('\n')]:[]),
      opener?'Palor most lép oda a társasághoz, még nem szólt. Vegyék észre.':'Palor: '+text].join('\n\n');
    // 650 since 2026-11-15: suggestions may be longer (up to 18 words, actions too).
    const out=await w.ask(system,user,650);
    const replies=(Array.isArray(out?.replies)?out.replies:[]).map(r=>({id:matchPerson(people,r?.name),text:clip(String(r?.text??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,''),800)})).filter(r=>r.id&&r.text).slice(0,3);
    if(!replies.length)throw fail('Nobody answered. Try again.',502);
    const id=conv?.id||randomUUID(),t=iso();
    const gBeat=gBeats.includes(out?.beat)?out.beat:'talk',gChoices=cleanChoices(out?.choices),autoScene=playSettings().auto_scene!==false;
    // The scene picture shows the company (the first speaker in focus); intimate ones only as far
    // as every one of them allows.
    const firstSpeaker=replies[0].id,gScene=!autoScene?null:await sceneFor({cid:firstSpeaker,conv,beat:gBeat,context:history.slice(-6).map(l=>l.text).join(' ')+' '+text+' '+replies.map(r=>r.text).join(' '),here,company:ids});
    let lastLine=null;
    transaction(()=>{
      if(conv&&!one("SELECT 1 FROM play_conversations WHERE id=? AND status='open'",conv.id))throw fail('This conversation has ended.',409);
      if(!conv)run("INSERT INTO play_conversations(id,character_id,location_id,channel,world_day,slot,status,created_at,mode,participants_json) VALUES(?,?,?,'in_person',?,?,'open',?,'group',?)",id,ids[0],here.location_id||null,k.day,k.slot,t,JSON.stringify(ids));
      if(!opener)run('INSERT INTO play_lines VALUES(?,?,?,?,?)',randomUUID(),id,'palor',text,t);
      for(const r of replies){const lid=randomUUID();run('INSERT INTO play_lines VALUES(?,?,?,?,?)',lid,id,'character',r.text,t);run('INSERT INTO play_line_speaker VALUES(?,?)',lid,r.id);lastLine=lid;}
      run('INSERT INTO play_line_meta(line_id,beat,spark,choices_json) VALUES(?,?,?,?)',lastLine,gBeat,0,JSON.stringify(gChoices));
      // Undressing or beyond makes it an intimate scene: its save point is marked intimate (news
      // never carries it), like a one-on-one intimate talk.
      if(BEAT_WANT[gBeat]>=1)run('INSERT OR IGNORE INTO play_conversation_flags VALUES(?,?)',id,t);
      if(gScene)run('INSERT INTO play_line_scene VALUES(?,?,?,?,?,?,?,?)',lastLine,gScene.media_id,gScene.kind,gScene.level,gBeat,gScene.start_at??null,JSON.stringify(gScene.display),t);
    });
    gameClock?.advance(TALK_MINUTES,'talk');
    if(gScene)director.markShown(gScene.media_id,'scene',gScene.cast);
    return conversationView(id);
  }
  // Richer save-point fields (2026-11-15), asked in the same summary call: topics, weight, and
  // who or what was named. Names resolve only to existing records; an ambiguous or unknown name
  // abstains (stored as nothing), so no character or place is ever created from a talk.
  const RICH_FIELDS_HINT='"tags": 1-5 rövid, kisbetűs címke a témákról (pl. munka, család, flört, veszekedés, terv). "importance": 1-5, mennyire fontos ez a beszélgetés a kapcsolatukban (1 hétköznapi csevegés, 5 fordulópont). "mentioned_people" és "mentioned_places": a beszélgetésben név szerint szóba került más emberek és helyek, csak ami tényleg elhangzott.';
  const RICH_FIELDS_JSON='"tags":["..."],"importance":1,"mentioned_people":[],"mentioned_places":[]';
  function richFields(data,exclude){
    const out={};
    const tags=[...new Set((Array.isArray(data.tags)?data.tags:[]).map(t=>clip(String(t??'').toLocaleLowerCase('hu'),30)).filter(Boolean))].slice(0,5);if(tags.length)out.tags=tags;
    const imp=Math.round(Number(data.importance));if(imp>=1&&imp<=5)out.importance=imp;
    const names=v=>(Array.isArray(v)?v:[]).slice(0,8).map(n=>String(n??'').trim()).filter(Boolean);
    const people=all('SELECT id,name FROM characters').filter(c=>!exclude.includes(c.id));
    const ids=[...new Set(names(data.mentioned_people).map(n=>matchPerson(people,n)).filter(Boolean))];if(ids.length)out.mentioned_character_ids=ids;
    const places=all('SELECT id,name FROM locations');
    const placeIds=[...new Set(names(data.mentioned_places).map(n=>{const k=n.toLocaleLowerCase('hu'),hits=places.filter(l=>String(l.name).toLocaleLowerCase('hu')===k);return hits.length===1?hits[0].id:null;}).filter(Boolean))];
    if(placeIds.length)out.mentioned_location_ids=placeIds;
    return out;
  }
  // Group save point: one summary; a memory for each participant and Palor; no level changes.
  async function groupEnd(conv){
    const ls=lines(conv.id),ids=participantsOf(conv),pid=w.palor()?.id;
    const people=ids.map(id=>one('SELECT id,name FROM characters WHERE id=?',id)).filter(Boolean);
    // Palor walked up and left without a word: close without a paid summary.
    if(!ls.some(l=>l.speaker==='palor')){closeOpen(conv.id,null);return conversationView(conv.id);}
    const system=`Egy társas jelenetet foglalsz össze Palor és ${people.map(c=>c.name).join(', ')} között. Csak azt írd le, ami ténylegesen elhangzott. ${RICH_FIELDS_HINT} Csak JSON, magyarul: {"title":"rövid cím","summary":"1-2 mondat","memories":{"<név>":"egy mondat az ő szemszögéből"},"palor_memory":"egy mondat Palor szemszögéből",${RICH_FIELDS_JSON}}`;
    const data=await w.ask(system,ls.map(l=>(l.speaker==='palor'?'Palor':l.speaker_name||'?')+': '+l.text).join('\n'),800)||{};
    const summary={title:clip(data.title,120)||'Beszélgetés társaságban',summary:clip(data.summary,600),palor_memory:clip(data.palor_memory,1000),group:true,...richFields(data,[...people.map(c=>c.id),pid].filter(Boolean))};
    if(one('SELECT 1 FROM play_conversation_flags WHERE conversation_id=? AND intimate_at IS NOT NULL',conv.id))summary.intimate=true;
    const mem=data.memories&&typeof data.memories==='object'?data.memories:{};
    transaction(()=>{
      if(!closeOpen(conv.id,summary))return;
      const eventId=randomUUID();
      run('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,seen_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',eventId,conv.world_day,'meeting','applied',summary.title,summary.summary||summary.title,JSON.stringify({slot:SLOTS.find(s=>s.label===conv.slot)?.id||null,character_ids:people.map(c=>c.id),location_id:conv.location_id,memories:[],level_changes:[],play_conversation_id:conv.id,with_palor:true,intimate:!!summary.intimate}),'play',iso(),iso());
      for(const c of people){const m=clip(mem[c.name]??Object.entries(mem).find(([n])=>matchPerson(people,n)===c.id)?.[1],1000);if(m)w.remember(c.id,m,eventId);}
      if(summary.palor_memory&&pid)w.remember(pid,summary.palor_memory,eventId);
      meetingSaved(eventId);
    });
    return conversationView(conv.id);
  }
  // Save point: one summary call, then memories, level and a world event in one transaction.
  // Ending is locked like talking (2026-11-11): a double click or a retry after a slow answer
  // must not pay for two summaries or write two events, memory sets and level steps.
  async function end(id){
    if(typeof id!=='string')throw fail('Invalid request.');
    const conv0=one('SELECT character_id,mode FROM play_conversations WHERE id=?',id);if(!conv0)throw fail('Conversation not found',404);
    const keys=[id,...(conv0.mode==='group'?['group:'+id]:[conv0.character_id])];
    if(keys.some(k=>inFlight.has(k)))throw fail('He is still answering. Wait a moment.',409);
    for(const k of keys)inFlight.add(k);
    try{return await endOnce(id);}finally{for(const k of keys)inFlight.delete(k);}
  }
  // Closes only a conversation that is still open; false when someone else closed it meanwhile.
  const closeOpen=(id,summary)=>Number(run("UPDATE play_conversations SET status='closed',closed_at=?,summary_json=coalesce(?,summary_json) WHERE id=? AND status='open'",iso(),summary?JSON.stringify(summary):null,id).changes)>0;
  async function endOnce(id){
    const conv=one('SELECT * FROM play_conversations WHERE id=?',id);if(!conv)throw fail('Conversation not found',404);
    if(conv.status!=='open')return conversationView(id);
    if(conv.mode==='group')return groupEnd(conv);
    const pid=w.palor()?.id,c=one('SELECT id,name FROM characters WHERE id=?',conv.character_id),ls=lines(id);
    // Only his opening line (Palor walked up and left): no AI summary, no memory, no level change.
    if(!ls.some(l=>l.speaker==='palor')){closeOpen(id,null);return conversationView(id);}
    // Promises and plans (2026-11-12): the same summary call lists new ones and says which of the
    // open ones this talk kept or dropped (by number). No extra call.
    const listed=w.openThreadsFor(c.id,conv.world_day).open;
    const system=`Egy beszélgetést foglalsz össze Palor és ${c.name} között. Csak azt írd le, ami a beszélgetésben ténylegesen elhangzott vagy történt. ${FACT_RULES} "promises": csak kifejezett ígéret vagy megbeszélt terv (pl. "pénteken felhívlak", "holnap este átjövök"), legfeljebb 3; "by": ki ígérte; "due": a dátum ÉÉÉÉ-HH-NN alakban, ha kiderül, különben null. "kept"/"dropped": a felsorolt nyitott tervek közül melyik teljesült, illetve melyiket mondták le ebben a beszélgetésben (sorszámok). "shared_history": ${c.name} és Palor közös múltja ${c.name} szemszögéből, legfeljebb 6 mondatban: a KORÁBBI KÖZÖS MÚLT kiegészítve ezzel a beszélgetéssel; a fontosat (fordulópontok, ígéretek, érzelmes pillanatok, amit megtudtak egymásról) tartsd meg, a régi apróságokat tömörítsd; csak azt írd bele, ami ott vagy ebben a beszélgetésben szerepel, ne találj ki semmit. ${RICH_FIELDS_HINT} "learned": mit tudott meg ebben a beszélgetésben ${c.name} Palorról ("character"), illetve Palor ${c.name}-ról ("palor"), egy-egy mondat, üres, ha semmi újat. "mood": egy-három szó, milyen hangulatban volt a beszélgetés végén ${c.name} ("character") és Palor ("palor"). Csak JSON, magyarul: {"title":"rövid cím","summary":"1-2 mondat","character_memory":"egy-két mondat ${c.name} szemszögéből","palor_memory":"egy-két mondat Palor szemszögéből","level_delta":-1|0|1,"reason":"miért változott (vagy nem) ${c.name} viszonya Palorhoz","promises":[{"by":"palor|character","text":"...","due":null}],"kept":[],"dropped":[],"shared_history":"...",${RICH_FIELDS_JSON},"learned":{"character":"","palor":""},"mood":{"character":"","palor":""}${w.inner?',"inner":{"mood":"","intensity":0,"reason":"","concerns":[],"wants_from_palor":"","palor_view":""}':''}} ${w.inner?innerInstruction(c.name):''}`;
    // What the shared history grows from: the previous version, or (first time) the earlier talks.
    const prevShared=sharedHistoryOf(c.id);
    const base=prevShared||pastTalks(c.id,9).filter(r=>r.id!==id&&r.status==='closed'&&(r.summary.summary||r.summary.title)).slice(0,8).reverse().map(r=>`${r.world_day}: ${clip(r.summary.summary||r.summary.title,300)}`).join('\n');
    const chemistry=one('SELECT coalesce(sum(m.spark),0) n FROM play_line_meta m JOIN active_play_lines l ON l.id=m.line_id WHERE l.conversation_id=?',id).n;
    const wasDate=!!one('SELECT 1 FROM play_dates WHERE conversation_id=?',id);
    const wd=weekdayOf(conv.world_day);
    const innerBefore=w.inner?w.inner.summaryContext(c.id):'';
    const data=await w.ask(system,`(A beszélgetés napja: ${conv.world_day}, ${WEEKDAYS[wd]}.)\n`+(innerBefore?innerBefore+'\n\n':'')+'KORÁBBI KÖZÖS MÚLT:\n'+(base||'még nincs, ez az első beszélgetésük')+'\n\n'+(listed.length?'NYITOTT TERVEK:\n'+listed.map((t,i)=>`${i+1}. ${t.promised_by==='palor'?'Palor':c.name}: ${t.text}${t.due_day?' ('+t.due_day+')':''}`).join('\n')+'\n\n':'')+ls.map(l=>(l.speaker==='palor'?'Palor':isGuestLine(l)?l.speaker_name:c.name)+': '+l.text).join('\n')+(chemistry?`\n\n(${c.name} reakciói a beszélgetés során összesen: ${chemistry>0?'+':''}${chemistry}; ezt is vedd figyelembe a level_delta-nál.)`:'')+(wasDate?'\n\n(Ez egy megbeszélt randevú volt.)':''),1200)||{};
    let delta=Math.max(-1,Math.min(1,Math.round(Number(data.level_delta)||0)));
    // Owner decision 2026-11-11: at most three steps closer per character per world day.
    const risesToday=all("SELECT summary_json FROM play_conversations WHERE character_id=? AND world_day=? AND status='closed' AND rewound_at IS NULL AND id<>?",c.id,conv.world_day,id).filter(r=>{try{return JSON.parse(r.summary_json||'{}').level_delta>0;}catch{return false;}}).length;
    const heldBack=delta>0&&risesToday>=MAX_DAILY_RISES;if(heldBack)delta=0;
    const summary={title:clip(data.title,120)||'Beszélgetés Palorral',summary:clip(data.summary,600),character_memory:clip(data.character_memory,1000),palor_memory:clip(data.palor_memory,1000),level_delta:delta,reason:clip(data.reason,300),...(heldBack?{held_back:true}:{})};
    // An empty answer must not wipe what he already remembered of their shared past.
    const sharedNow=clip(data.shared_history,1500)||prevShared;if(sharedNow)summary.shared_history=sharedNow;
    Object.assign(summary,richFields(data,[c.id,pid].filter(Boolean)));
    const pair=v=>v&&typeof v==='object'?{character:clip(v.character,400),palor:clip(v.palor,400)}:null;
    const learned=pair(data.learned),mood=pair(data.mood);
    if(learned&&(learned.character||learned.palor))summary.learned=learned;
    if(mood&&(mood.character||mood.palor))summary.mood={character:clip(mood.character,60),palor:clip(mood.palor,60)};
    // Milestones: crossing into friend / confidant / lover is announced to the player.
    const before=pid?w.levelOf(c.id,pid)??0:0,after=Math.max(-2,Math.min(5,before+delta));
    const MILESTONES={3:'barátok lettetek',4:'bizalmas viszonyba kerültetek',5:'szerelmi kapcsolat alakult ki köztetek'};
    if(after>before&&MILESTONES[after])summary.milestone=`${c.name} és Palor: ${MILESTONES[after]}.`;
    // Intimate if it ever was during this conversation (an intimate scene stopped with "Álljunk meg" still counts).
    if(conv.mode==='intimate'||one('SELECT 1 FROM play_conversation_flags WHERE conversation_id=? AND intimate_at IS NOT NULL',id))summary.intimate=true;
    transaction(()=>{
      // Closed elsewhere while the summary was written (stale close, another device): save nothing twice.
      if(!closeOpen(id,summary))return;
      const eventId=randomUUID();
      // An intimate save point keeps the intimacy stage open for the next two weeks.
      run('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,seen_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',eventId,conv.world_day,'meeting','applied',summary.title,summary.summary||summary.title,JSON.stringify({slot:SLOTS.find(s=>s.label===conv.slot)?.id||null,character_ids:[c.id],location_id:conv.location_id,memories:[],level_changes:[],play_conversation_id:id,with_palor:true,intimate:!!summary.intimate}),'play',iso(),iso());
      if(summary.character_memory)w.remember(c.id,summary.character_memory,eventId);
      if(summary.palor_memory&&pid)w.remember(pid,summary.palor_memory,eventId);
      if(delta&&pid)w.setLevel(c.id,pid,after,{reason:summary.reason||'Beszélgetés',actor:'play',eventId});
      meetingSaved(eventId);
      w.resolveThreads(listed,{kept:data.kept,dropped:data.dropped});
      w.addThreads(c.id,id,data.promises,conv.world_day);
      // E2: his inner state after this talk, from his point of view.
      if(w.inner)w.inner.record(c.id,data.inner,{day:conv.world_day,eventId,conversationId:id});
    });
    return conversationView(id);
  }
  function messages(){return all('SELECT m.id,m.text,m.world_day,m.read_at,c.id character_id,c.name,c.cover_id FROM world_messages m JOIN characters c ON c.id=m.from_character_id WHERE m.rewound_at IS NULL ORDER BY m.rowid DESC LIMIT 50');}
  // Readiness: what the world still needs to feel alive (shown on the Élő világ page).
  async function readiness(){
    const nodes=await tree(),images=placeImages(),places=nodes.filter(n=>n.location_id&&n.placed);
    const bg=new Set(all("SELECT DISTINCT t.tag_id FROM media_tags t JOIN media_roles r ON r.media_id=t.media_id AND r.role='location' JOIN active_media m ON m.id=t.media_id").map(r=>r.tag_id));
    const tagOf=new Map(all('SELECT id,tag_id FROM locations').map(l=>[l.id,l.tag_id]));
    const cast=[];
    for(const c of w.meetable()){const pl=w.placesOf(c.id),f=figures(c.id).length;
      // Without a drawn figure he stands in scenes as a photo figure (when one fits).
      // Approved reference pictures in his latest canon (owner 2026-11-19: show who has none yet).
      let refs=[];try{refs=JSON.parse(one('SELECT references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',c.id)?.references_json||'[]');}catch{}
      cast.push({id:c.id,name:c.name,figures:f,stand_in:!f&&!!(await director.standIn(c.id).catch(()=>null)),places:pl.length,has_home:pl.some(p=>p.role==='home'),photos:one("SELECT count(*) n FROM depictions d JOIN active_media m ON m.id=d.media_id AND m.kind='image' WHERE d.character_id=?",c.id).n,
        references:refs.length,reference_faces:refs.filter(r=>r.role==='face').length,reference_bodies:refs.filter(r=>r.role==='body').length});}
    cast.sort((a,b)=>(a.figures>0)-(b.figures>0)||a.name.localeCompare(b.name,'hu'));
    // Who to give a Szellemprofil next: people Palor knows, with the most pictures, no profile yet.
    const pid=w.palor()?.id,castIds=new Set(cast.map(c=>c.id));
    const next=pid?all(`SELECT c.id,c.name,(SELECT count(*) FROM depictions d WHERE d.character_id=c.id) photos FROM characters c
        WHERE c.id<>? AND (c.id IN (SELECT target_id FROM relationships WHERE source_id=?) OR c.id IN (SELECT source_id FROM relationships WHERE target_id=?))
          AND NOT EXISTS(SELECT 1 FROM application_settings s WHERE s.key='ghost:character:'||c.id) ORDER BY photos DESC LIMIT 8`,pid,pid,pid).filter(c=>!castIds.has(c.id)&&!w.groupIds().has(c.id)):[];
    return {next_profiles:next,cast,characters_total:one('SELECT count(*) n FROM characters').n,
      places_on_map:places.length,places_with_background:places.filter(n=>bg.has(tagOf.get(n.location_id))).length,places_with_any_picture:places.filter(n=>images.has(n.location_id)).length,
      missing_backgrounds:places.filter(n=>!bg.has(tagOf.get(n.location_id))).map(n=>({name:n.name,location_id:n.location_id})).slice(0,200)};
  }
  // Media director: which of the creator's pictures/videos fit which panel (media-director.mjs).
  const director=createMediaDirector({db,one,all,run,root,adult:()=>playSettings().adult,palorId:()=>w.palor()?.id||null});
  // Scenes, photos, album and phone pictures (app/play/scenes.mjs); phone threads, journal and
  // relationships (app/play/records.mjs).
  const {daypart,sceneProgress,sceneFor,photos,album,sharedPhotos,phonePhoto}=createPlayScenes({one,all,fail,w,director,intimacyStage,clock,tree,currentNode});
  const {phoneContacts,phoneThread,journalWithMedia,journal,relationships,markMessagesRead}=createPlayRecords({one,all,run,w,director,playSettings,iso,clock});

  async function handle({p,req,res=null,body,json}){
    if(!p.startsWith('/api/play'))return false;
    // The play screen is open (desktop or phone): in "only while I play" mode the world lives now.
    if(worldEngine.notePlay?.())worldEngine.maybeRun?.().catch?.(()=>{});
    const m=req.method;let x;
    if(await stories.handle({p,m,body,json,res}))return true;
    // Town plan (2026-11-13): saved pin positions (presentation only) and an optional map picture.
    // Node ids may hold ':' ("proposal:…"), sent URL-encoded.
    const nodeParam=s=>{try{return decodeURIComponent(s);}catch{return '';}};
    if((x=p.match(/^\/api\/play\/town-layout\/([^/]{1,200})$/))){
      const nodes=await tree(),town=nodes.find(n=>n.id===nodeParam(x[1]));if(!town)throw fail('Place not found',404);
      const key='play:town-layout:'+town.id;
      if(m==='POST'){
        const pos=body?.positions;if(!pos||typeof pos!=='object'||Array.isArray(pos)||Object.keys(pos).length>300)throw fail('Invalid positions.');
        // Pins of places that moved elsewhere (2026-11-14 restructure) are dropped quietly.
        const ids=new Set(mapPlaces(nodes,town).map(n=>n.id)),clean={};
        for(const [id,v] of Object.entries(pos)){if(!ids.has(id))continue;if(!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))throw fail('Invalid positions.');clean[id]=[Math.round(Math.max(0,Math.min(1200,v[0]))),Math.round(Math.max(0,Math.min(1200,v[1])))];}
        run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify({positions:clean,updated_at:iso()}));
      }
      let saved={};try{saved=JSON.parse(one('SELECT value FROM application_settings WHERE key=?',key)?.value||'{}').positions||{};}catch{}
      const img=await townMapFile(town);
      return json({positions:saved,image:img?`/api/play/town-map/${encodeURIComponent(town.id)}?v=${img.version}`:null,height:planHeight(img)}),true;
    }
    // Door markers of a room (owner's editor): GET the neighbours and saved places, POST to save.
    if((x=p.match(/^\/api\/play\/room-exits\/([^/]{1,200})$/))){const id=nodeParam(x[1]);
      if(m==='POST'){if(!body||typeof body.exits!=='object')throw fail('Invalid exits.');await saveExits(id,body.exits,{merge:body.replace!==true});}
      return json(await roomExitsView(id)),true;}
    if((x=p.match(/^\/api\/play\/town-map\/([^/]{1,200})$/))&&m==='GET'){
      const town=(await tree()).find(n=>n.id===nodeParam(x[1])),img=town?await townMapFile(town):null;if(!img||!res)throw fail('No town map picture.',404);
      const bytes=await fs.readFile(img.file);res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;
    }
    // Streamed talk (2026-11-11): newline-delimited JSON — {"reply":"so far"} lines while the
    // character is writing, then {"done":view} or {"error":…}. Checks that fail before Grok is
    // asked still answer as an ordinary JSON error.
    if(p==='/api/play/talk'&&m==='POST'&&body?.stream===true&&res){
      let started=false;const send=o=>{if(!started){started=true;res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});}res.write(JSON.stringify(o)+'\n');};
      try{const view=await talk(body,{onReply:r=>send({reply:r})});send({done:view});res.end();}
      catch(e){if(!started)throw e;send({error:e.status?e.message:'Grok could not answer this time. Try again.',status:e.status||500,code:e.code||null});res.end();}
      return true;
    }
    if(p==='/api/play'&&m==='GET')return json(await overview()),true;
    // Travel time from where Palor is to a few places, shown on exits and map pins (2026-11-13).
    if(p==='/api/play/eta'&&m==='GET'){const q=new URL(req.url,'http://local').searchParams,nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n])),from=currentNode(nodes)?.id||null;
      const ids=(q.get('to')||'').split(',').map(s=>{try{return decodeURIComponent(s);}catch{return '';}}).filter(id=>byId.has(id)).slice(0,60),vehicle=q.get('vehicle')==='1';
      // Another town: by car (the window then offers bike and train too); the place one really
      // arrives at (living room, lake shore) is what counts.
      return json({minutes:Object.fromEntries(ids.map(id=>{const to=arrivalOf(nodes,byId,from,id,origins(nodes)),other=from&&townOf(byId,from)?.id!==townOf(byId,to)?.id;return [id,travelMinutes(byId,from,to,{mode:other||vehicle?'car':'foot'})];}))}),true;}
    // Places that have no usable backdrop (2026-11-13), for the owner's "Hiányzó hátterek" list.
    if(p==='/api/play/backdrops/missing'&&m==='GET'){const nodes=await tree(),images=placeImages();
      // A backdrop that cannot be opened (WebP behind a .jpg name, missing file) counts as missing too.
      const out=[];for(const n of nodes){if(!n.location_id||n.archived||n.placed===false||kindOf(n)==='vehicle')continue;const own=images.get(n.location_id);const why=own?await unreadableImage(own):null;if(!own||why)out.push({id:n.id,location_id:n.location_id,name:n.short_name||n.name,path:(n.path||n.name)+(why?' ('+why+')':'')});}
      return json({places:out.sort((a,b)=>a.path.localeCompare(b.path,'hu'))}),true;}
    if((x=p.match(/^\/api\/play\/place\/([^/]+)$/))&&m==='GET'){let id;try{id=decodeURIComponent(x[1]);}catch{throw fail('Place not found',404);}return json(await place(id)),true;}
    if(p==='/api/play/travel'&&m==='POST')return json(await travel(body.node_id,body)),true;
    if(p==='/api/play/roadside'&&m==='POST')return json(roadsideStop(body)),true;
    if(p==='/api/play/travel-options'&&m==='GET'){const q=new URL(req.url,'http://local').searchParams;return json(await travelChoices(String(q.get('to')||''))),true;}
    // The owner's corrections for a character (applied at once to his later replies).
    if((x=p.match(/^\/api\/play\/notes\/([0-9a-f-]{36})$/i))&&m==='GET')return json({notes:directorNotes(x[1])}),true;
    if(p==='/api/play/notes'&&m==='POST')return json(addDirectorNote(body)),true;
    if((x=p.match(/^\/api\/play\/notes\/([0-9a-f-]{36})$/i))&&m==='DELETE')return json(withdrawDirectorNote(x[1])),true;
    if(p==='/api/play/items'&&m==='GET'){const nodes=await tree();return json({items:itemsView(nodes,currentNode(nodes)?.id)}),true;}
    if(p==='/api/play/items'&&m==='POST')return json({items:await itemAction(null,body)}),true;
    if((x=p.match(/^\/api\/play\/items\/([0-9a-f-]{36})$/))&&m==='POST')return json({items:await itemAction(x[1],body)}),true;
    if((x=p.match(/^\/api\/play\/conversations\/([a-f0-9-]{36})\/turn$/i))&&m==='POST')return json(await turnRevisions.revise(x[1],body)),true;
    if(p==='/api/play/talk'&&m==='POST')return json(await talk(body)),true;
    if(p==='/api/play/group-talk'&&m==='POST')return json(await groupTalk(body)),true;
    // Scene guests (2026-11-18): join, profile picture, leave, save as a real character.
    if(p==='/api/play/guests'&&m==='POST')return json(await addGuest(body||{})),true;
    if((x=p.match(/^\/api\/play\/guests\/([0-9a-f-]{36})\/image$/))&&m==='GET'){
      const g=guestRow(x[1]),file=new URL(req.url,'http://x').searchParams.get('bare')==='1'?g.bare_file:g.image_file;if(!file||!res)throw fail('Nincs profilkép.',404);
      const bytes=await fs.readFile(path.join(guestDir(),path.basename(file)));res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;}
    if((x=p.match(/^\/api\/play\/guests\/([0-9a-f-]{36})\/leave$/))&&m==='POST')return json(leaveGuest(x[1])),true;
    if((x=p.match(/^\/api\/play\/guests\/([0-9a-f-]{36})\/shirtless$/))&&m==='POST')return json(await addShirtless(x[1])),true;
    if((x=p.match(/^\/api\/play\/guests\/([0-9a-f-]{36})\/pictures$/))&&m==='POST')return json(renewPictures(x[1])),true;
    if((x=p.match(/^\/api\/play\/guests\/([0-9a-f-]{36})\/save$/))&&m==='POST')return json(await saveGuest(x[1])),true;
    if(p==='/api/play/messages'&&m==='GET')return json({messages:messages()}),true;
    // The play screen's once-a-minute check: just the number, not the whole overview.
    // Waiting (next day part) and sleeping (next morning) move the game clock on; the world
    // catches up on its next check when the world engine is switched on.
    if(p==='/api/play/wait'&&m==='POST'){
      if(!gameClock)throw fail('The game clock is unavailable.',503);
      if(!['next_slot','morning','minutes'].includes(body.until))throw fail('Choose the next day part or the morning.');
      // A short wait (2026-11-13): 15, 30, 60 or 120 minutes.
      if(body.until==='minutes'&&![15,30,60,120].includes(body.minutes))throw fail('Choose 15, 30, 60 or 120 minutes.');
      // Passing time ends every open talk first, saved like a goodbye (2026-11-15: a forgotten talk,
      // unseen on the screen, refused waiting with "End the conversation first").
      for(const c of all("SELECT p.id,c.name FROM play_conversations p JOIN characters c ON c.id=p.character_id WHERE p.status='open' AND p.rewound_at IS NULL")){
        try{await end(c.id);}catch(e){throw fail(`The conversation with ${c.name} could not be saved (${e.message}). Try again.`,409);}
      }
      const step=gameClock.advance(body.until==='morning'?gameClock.toMorning():body.until==='minutes'?body.minutes:gameClock.toNextSlot(),body.until==='morning'?'sleep':'wait');
      worldEngine.maybeRun?.().catch?.(()=>{});
      return json({...step,clock:clock()}),true;
    }
    if(p==='/api/play/unread'&&m==='GET')return json({unread_messages:one('SELECT count(*) n FROM world_messages WHERE rewound_at IS NULL AND read_at IS NULL').n}),true;
    if(p==='/api/play/messages/read'&&m==='POST')return json(markMessagesRead()),true;
    if(p==='/api/play/journal'&&m==='GET')return json(await journalWithMedia()),true;
    if(p==='/api/play/media/pick'&&m==='GET'){const q=new URL(req.url,'http://local').searchParams;
      return json(await director.pick({panel:q.get('panel')||'scene',characters:(q.get('characters')||'').split(',').filter(Boolean).slice(0,8),location_id:q.get('location')||null,mood:q.get('mood')||'everyday',context:(q.get('context')||'').slice(0,1500),limit:Math.min(24,Number(q.get('limit'))||6),
        allow:q.get('allow')||null,progress:q.get('progress')!==null&&q.get('progress')!==''?Number(q.get('progress')):null,daypart:['day','night'].includes(q.get('daypart'))?q.get('daypart'):null,after:/^[0-9a-f-]{36}$/.test(q.get('after')||'')?q.get('after'):null})),true;}
    if(p==='/api/play/media/feedback'&&m==='POST')return json(director.feedback(body)),true;
    if((x=p.match(/^\/api\/play\/journal\/([0-9a-f-]{36})\/media$/))&&m==='POST'){
      const row=one('SELECT id,title,summary,payload_json FROM world_events WHERE id=? AND rewound_at IS NULL',x[1]);if(!row)throw fail('Event not found',404);
      if(body.verdict===-1||body.verdict===1){const pl=JSON.parse(row.payload_json),ids=[...(pl.character_ids||[])];if(pl.with_palor&&w.palor())ids.push(w.palor().id);const cur=one('SELECT media_id FROM play_event_media WHERE event_id=?',row.id)?.media_id;if(cur)director.feedback({media_id:cur,panel:'journal',characters:ids,verdict:body.verdict});}
      return json({media:await director.forEvent(row,{repick:body.verdict!==1})}),true;}
    if(p==='/api/play/readiness'&&m==='GET')return json(await readiness()),true;
    if(p==='/api/play/export'&&m==='GET'){
      // The story so far as a Markdown file (journal + Palor's conversations), newest last.
      const ev=journal().events.slice().reverse();let md='# Élő világ – a történet eddig\n';let day='';
      for(const e of ev){if(e.world_day!==day){day=e.world_day;md+=`\n## ${day}\n`;}md+=`\n**${e.title}** (${e.slot||''}${e.with_palor?', Palorral':''}) – ${e.characters.join(', ')}\n\n${e.summary}\n`;}
      return json({filename:'elo-vilag-tortenet.md',markdown:md}),true;
    }
    if((x=p.match(/^\/api\/play\/relationship\/([0-9a-f-]{36})$/))&&m==='GET')return json(relationshipDetail(x[1])),true;
    if((x=p.match(/^\/api\/play\/known-character\/([0-9a-f-]{36})$/))&&m==='GET')return json(knownCharacter(x[1])),true;
    if((x=p.match(/^\/api\/play\/talk-log\/([0-9a-f-]{36})$/))&&m==='GET')return json(wrapStatus(()=>talkHistory.timeline(x[1]))),true;
    if((x=p.match(/^\/api\/play\/talk-log\/talk\/([0-9a-f-]{36})$/))&&m==='GET')return json(wrapStatus(()=>talkHistory.talk(x[1]))),true;
    if(p==='/api/play/invite'&&m==='POST')return json(await invite(body)),true;
    if((x=p.match(/^\/api\/play\/invitations\/([0-9a-f-]{36})$/))&&m==='POST')return json(answerInvitation(x[1],body.accept)),true;
    if(p==='/api/play/scenes/scan'&&m==='POST')return json(await needScenes().scan(w.meetable().map(c=>c.id))),true;
    if(p==='/api/play/scenes/upload'&&m==='POST')return json(await needScenes().upload(body)),true;
    // A new label may make a cached stand-in figure no longer everyday: clear the cache.
    if(p==='/api/play/content'&&m==='POST'){const r=needScenes().setContent(body.media_id,body.level);director.clearCache();return json(r),true;}
    if(p==='/api/play/inserts'&&m==='GET')return json({inserts:needScenes().recentInserts()}),true;
    if(p==='/api/play/prompts'&&m==='GET'){const q=new URL(req.url,'http://local').searchParams;return json(await needScenes().prompts({character_id:q.get('character_id')||null,location_id:q.get('location_id')||null,conversation_id:q.get('conversation_id')||null})),true;}
    if(p==='/api/play/settings'&&m==='GET')return json(playSettings()),true;
    if(p==='/api/play/settings'&&m==='POST')return json(savePlaySettings(body)),true;
    if(p==='/api/play/phone'&&m==='GET')return json({contacts:phoneContacts()}),true;
    if((x=p.match(/^\/api\/play\/phone\/([0-9a-f-]{36})$/))&&m==='GET')return json({items:phoneThread(x[1])}),true;
    if((x=p.match(/^\/api\/play\/shared-photos\/([0-9a-f-]{36})$/))&&m==='GET')return json({photos:await sharedPhotos(x[1])}),true;
    if((x=p.match(/^\/api\/play\/album\/([0-9a-f-]{36})$/))&&m==='GET')return json(await album(x[1])),true;
    if((x=p.match(/^\/api\/play\/photos\/([0-9a-f-]{36})$/))&&m==='GET'){const q=new URL(req.url,'http://local').searchParams;return json(await photos(x[1],null,{context:(q.get('context')||'').slice(0,1500),intimateWanted:q.get('intimate')==='1',after:/^[0-9a-f-]{36}$/.test(q.get('after')||'')?q.get('after'):null,beat:q.get('beat')||null})),true;}
    if(p==='/api/play/photos/seen'&&m==='POST')return json(markSeenPhoto(body.character_id,body.media_id)),true;
    if(p==='/api/play/relationships'&&m==='GET')return json(relationships()),true;
    if((x=p.match(/^\/api\/play\/conversations\/([0-9a-f-]{36})$/))&&m==='GET')return json(conversationView(x[1])),true;
    if((x=p.match(/^\/api\/play\/conversations\/([0-9a-f-]{36})\/end$/))&&m==='POST')return json(await end(x[1])),true;
    return false;
  }
  function guestGenerationContext(gid){const guest=guestRow(gid);if(guest.left_at)throw fail('Ez a vendégszereplő már elment.',409);return {id:guest.id,name:guest.name,prompt:'Photorealistic photograph of one adult man, fully clothed in his everyday clothes. '+GUEST_FRAMING+' '+(guest.portrait_prompt||guest.description)};}
  async function saveGeneratedGuest(gid,bytes,provenance){const guest=guestRow(gid);if(guest.left_at)throw fail('Ez a vendégszereplő már elment.',409);await fs.mkdir(guestDir(),{recursive:true});const folderStat=await fs.lstat(guestDir()),relative=path.relative(await fs.realpath(dataDir),await fs.realpath(guestDir()));if(folderStat.isSymbolicLink()||!folderStat.isDirectory()||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!/^[a-f0-9-]{36}$/i.test(gid)||!/^[a-f0-9-]{36}$/i.test(provenance.run_id))throw fail('A vendégkép tárolója nem biztonságos.',409);const name=gid+'-sogni-'+provenance.run_id+(bytes[0]===0xff?'.jpg':'.png'),file=path.join(guestDir(),name);try{await fs.writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||!bytes.equals(await fs.readFile(file)))throw error;}run("UPDATE play_guests SET image_status='done',bare_status='off',image_file=?,image_note=? WHERE id=?",name,'Sogni '+provenance.model+' · '+provenance.run_id,gid);return {guest_id:gid,image_file:name,canon_changed:false};}
  return {handle,overview,place,travel,talk,end,positions,prompts:a=>needScenes().prompts(a),scenes,storyOps:stories.ops,townOps,guestGenerationContext,saveGeneratedGuest};
}
