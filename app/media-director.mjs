// Media director: decides which of the creator's own pictures and videos appear in which
// Play panel, so media shows up where it makes sense instead of at random.
//
// A request names a panel (journal, scene, phone, portrait, memory), the characters in the
// moment, where it happens, what the moment wants (mood) and what it allows (allow). Every
// candidate is scored and the reasons are returned with the pick:
//   1. cast       – are exactly these people in it (the panel decides how strict that is);
//   2. place      – tagged with this place, or somewhere in the same town;
//   3. level      – owner label > AI analysis (picture, or the analysed stills of a video) >
//                   "unknown counts as intimate"; never above allow, the panel and the adult
//                   switch. An intimate scene escalates: early on shirtless/nude fits best, later
//                   explicit media (progress 0..1);
//   4. form       – shape (landscape/portrait) and framing (close-up, full body…) per panel;
//   5. story      – the AI description matches what is being said, and the time of day;
//   6. continuity – after a picture, the next one comes from the same shoot (series), never
//                   a near-duplicate of it;
//   7. memory     – creator feedback here (strong) and in other panels (weak), and how
//                   recently it (or a near-duplicate) was shown — the penalty fades with time;
//   8. variety    – only the best of each near-duplicate group is offered.
// Only the creator's catalogue is read; nothing is uploaded, generated or changed except
// the director's own bookkeeping tables (feedback, shown, sizes, journal picks).
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {SIGNALS_SQL} from './media-signals.mjs';
import {LEVELS,RANK,aiLevelSql} from './content-levels.mjs';

export {LEVELS};
const MOOD_MAX={everyday:'non_intimate',flirt:'nudity',intimate:'sexual_activity'};
// What each mood wants most (owner, 2026-11-22): a flirt picture is shirtless first; nude stays allowed.
const MOOD_WANT={everyday:'non_intimate',flirt:'shirtless',intimate:'sexual_activity'};
// cast: exact = all of them and nobody else known; focus = the first one must be in it;
// solo = only that one person; together = all of them (others allowed).
export const PANELS={
  journal:{kinds:['image','video'],shape:'wide',cast:'exact',blur:true},
  scene:{kinds:['image','video'],shape:'wide',cast:'focus',blur:false},
  phone:{kinds:['image','video'],shape:'tall',cast:'solo',blur:true},
  portrait:{kinds:['image'],shape:'tall',cast:'solo',blur:false,max:'non_intimate'},
  memory:{kinds:['image'],shape:'any',cast:'together',blur:true}
};
// How well the camera framing (world-v1 camera.framing) suits each panel.
const FRAMING={
  portrait:{head_shoulders:3,upper_body:3,three_quarter_body:1,face_close_up:1,mixed:-1,wide_scene:-2,detail:-3},
  phone:{upper_body:2,three_quarter_body:2,head_shoulders:1,full_body:1,wide_scene:-1,detail:-1},
  scene:{three_quarter_body:2,full_body:2,mixed:1,wide_scene:1,head_shoulders:-1,face_close_up:-2,detail:-1},
  journal:{wide_scene:2,mixed:2,full_body:1,three_quarter_body:1,head_shoulders:-1,face_close_up:-2,detail:-1},
  memory:{mixed:1,three_quarter_body:1,full_body:1,upper_body:1}
};
// Picture types that are never shown as moments (they have their own uses).
const NOT_MOMENTS=['Kollázs','Generálási terv','Referenciakép','Helyszín háttér'];
const NIGHT=/éjszak|éjjel|este|sötét|lámpafény|neon|holdfény|gyertya|night|evening|dark/i,DAY=/nappal|napfény|napsüt|reggel|délután|világos|daylight|sunny|morning/i;

const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu');
const words=s=>new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>3).map(w=>w.slice(0,7)));
const castKey=ids=>[...new Set(ids)].sort().join(',');
const seqOf=p=>{const m=path.basename(String(p||'')).match(/(\d{3,})(?!.*\d{3,})/);return m?Number(m[1]):null;};
const levelOf=(owner,ai,video)=>LEVELS.includes(owner)?owner:LEVELS.includes(ai)?ai:video;

// Width/height from an image header (PNG, JPEG, GIF, WebP); null when unknown.
export function imageSize(b){
  if(b.length>24&&b.readUInt32BE(0)===0x89504e47)return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};
  if(b.length>10&&b.toString('ascii',0,3)==='GIF')return {w:b.readUInt16LE(6),h:b.readUInt16LE(8)};
  if(b.length>30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
    const kind=b.toString('ascii',12,16);
    if(kind==='VP8X')return {w:1+b.readUIntLE(24,3),h:1+b.readUIntLE(27,3)};
    if(kind==='VP8 ')return {w:b.readUInt16LE(26)&0x3fff,h:b.readUInt16LE(28)&0x3fff};
    if(kind==='VP8L'){const v=b.readUInt32LE(21);return {w:1+(v&0x3fff),h:1+((v>>14)&0x3fff)};}
  }
  if(b.length>4&&b[0]===0xff&&b[1]===0xd8){
    for(let i=2;i+9<b.length;){if(b[i]!==0xff){i++;continue;}const m=b[i+1];if(m===0xd8||(m>=0xd0&&m<=0xd7)||m===0x01){i+=2;continue;}
      const len=b.readUInt16BE(i+2);if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {w:b.readUInt16BE(i+7),h:b.readUInt16BE(i+5)};i+=2+len;}
  }
  return null;
}

// Same shoot: same folder and taken within 45 minutes, or close file numbers (IMG_1234 / IMG_1239).
export function sameSeries(a,b){
  if(!a||!b||a.id===b.id||path.dirname(a.relative_path)!==path.dirname(b.relative_path))return false;
  if(a.captured_at&&b.captured_at)return Math.abs(Date.parse(a.captured_at)-Date.parse(b.captured_at))<=45*60e3;
  const x=seqOf(a.relative_path),y=seqOf(b.relative_path);return x!==null&&y!==null&&Math.abs(x-y)<=10;
}

export function createMediaDirector({db,one,all,run,root,adult=()=>true,palorId=()=>null,now=()=>new Date()}){
  db.exec(SIGNALS_SQL);
  db.exec(`CREATE TABLE IF NOT EXISTS play_media_feedback(media_id TEXT NOT NULL,panel TEXT NOT NULL,cast_key TEXT NOT NULL,verdict INTEGER NOT NULL,at TEXT NOT NULL,PRIMARY KEY(media_id,panel,cast_key));
    CREATE TABLE IF NOT EXISTS play_media_shown(media_id TEXT NOT NULL,panel TEXT NOT NULL,cast_key TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(media_id,panel,cast_key));
    CREATE TABLE IF NOT EXISTS play_media_sizes(media_id TEXT PRIMARY KEY,width INTEGER,height INTEGER);
    CREATE TABLE IF NOT EXISTS play_event_media(event_id TEXT PRIMARY KEY,media_id TEXT,picked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS play_media_shown_cast ON play_media_shown(cast_key);`);
  const iso=()=>now().toISOString();
  const eventCache=new Map();// journal: event id|adult → verified stored pick

  async function sizeOf(m){
    if(m.sig_w&&m.sig_h)return {w:m.sig_w,h:m.sig_h};
    const cached=one('SELECT width,height FROM play_media_sizes WHERE media_id=?',m.id);if(cached)return cached.width?{w:cached.width,h:cached.height}:null;
    let size=null;
    if(m.kind==='image'&&root){let handle;try{handle=await fs.open(path.join(root,m.relative_path),'r');const buf=Buffer.alloc(262144);const {bytesRead}=await handle.read(buf,0,buf.length,0);size=imageSize(buf.subarray(0,bytesRead));}catch{}finally{await handle?.close();}}
    run('INSERT OR REPLACE INTO play_media_sizes VALUES(?,?,?)',m.id,size?.w||null,size?.h||null);return size;
  }
  // The places that count as "here": the location and everything named under it.
  // around: here plus the places it lies in ("Feri háza" for "Feri háza - Nappali"); any: every
  // location tag, to tell a picture taken somewhere else from one with no place at all.
  function placeSets(locationId){
    const empty={here:new Set(),town:new Set(),around:new Set(),any:new Set()};
    if(!locationId)return empty;
    const loc=one('SELECT name FROM locations WHERE id=?',locationId);if(!loc)return empty;
    const all_=all('SELECT id,name,tag_id FROM locations'),townName=loc.name.split(' - ')[0];
    const here=new Set(all_.filter(l=>l.name===loc.name||l.name.startsWith(loc.name+' - ')).map(l=>l.tag_id));
    const town=new Set(all_.filter(l=>l.name===townName||l.name.startsWith(townName+' - ')).map(l=>l.tag_id));
    const around=new Set([...here,...all_.filter(l=>loc.name.startsWith(l.name+' - ')).map(l=>l.tag_id)]);
    return {here,town,around,any:new Set(all_.map(l=>l.tag_id))};
  }
  // A shown picture is fresh again slowly: just now −4, today −2, earlier −1.
  const freshness=at=>{if(!at)return 0;const h=(now()-Date.parse(at))/36e5;return h<2?-4:h<24?-2:-1;};

  // characters: ids (first = focus); location_id; mood: everyday|flirt|intimate (what fits
  // best); allow: highest level that may appear (default: what the mood implies); progress:
  // 0..1 how far an intimate scene has gone; context: text of the moment; daypart: day|night;
  // after: the media shown just before (continuity); exclude: media ids to skip.
  // onlyCast: nobody else known may be on it (a talk with Dezső never shows Pákozdi, even when
  // Pákozdi is in the room); samePlace: a picture tagged with a place must be from here or a
  // place around it (untagged pictures stay possible). Both are owner rules (2026-11-13).
  async function pick({panel='scene',characters=[],location_id=null,mood='everyday',allow=null,progress=null,want:wanted=null,context='',daypart=null,after=null,exclude=[],limit=6,diverse=true,onlyCast=false,samePlace=false}={}){
    const rule=PANELS[panel];if(!rule)throw Object.assign(Error('Unknown panel.'),{status:400});
    const ids=[...new Set(characters)].filter(id=>one('SELECT 1 FROM characters WHERE id=?',id));if(!ids.length)return {panel,items:[],max_level:null,hidden:0};
    const key=castKey(ids);
    // The ceiling: allow (or the mood), the panel and the adult switch, whichever is lowest.
    let max=LEVELS.includes(allow)?allow:MOOD_MAX[mood]||'non_intimate';if(rule.max&&RANK[rule.max]<RANK[max])max=rule.max;if(!adult())max='non_intimate';
    // What fits best: an intimate scene starts with nudity and becomes explicit as it goes on.
    let want=RANK[MOOD_WANT[mood]||'non_intimate'];if(mood==='intimate'&&Number.isFinite(progress)&&progress<0.34)want=RANK.nudity;
    // An explicit wanted level (a scene beat, a rank of LEVELS: 0 everyday, 1 shirtless, 2 nudity,
    // 3 explicit, or the level's name) beats the mood.
    if(typeof wanted==='string'&&LEVELS.includes(wanted))wanted=RANK[wanted];
    if(Number.isInteger(wanted)&&wanted>=0&&wanted<LEVELS.length)want=wanted;want=Math.min(want,RANK[max]);
    const notMoments=all(`SELECT st.id FROM structured_tags st JOIN tag_groups g ON g.id=st.group_id WHERE g.name='Kép típusa' AND st.name IN (${NOT_MOMENTS.map(()=>'?').join(',')})`,...NOT_MOMENTS).map(r=>r.id);
    const rows=all(`SELECT m.id,m.kind,m.relative_path,sg.group_id,sg.captured_at,sg.width sig_w,sg.height sig_h,
        (SELECT group_concat(d.character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids,
        (SELECT group_concat(t.tag_id) FROM media_tags t WHERE t.media_id=m.id) tag_ids,
        (SELECT level FROM play_content pc WHERE pc.media_id=m.id) owner_level,
        ws.ai_level,coalesce(ws.description,(SELECT group_concat(f.description,' ') FROM media_video_frames f WHERE f.media_id=m.id AND f.description IS NOT NULL)) description,ws.framing,
        (SELECT json_array_length(d.document_json,'$.participants') FROM world_review_documents d WHERE d.source_id=ws.source_id) people,
        (SELECT count(*) FROM media_video_frames f WHERE f.media_id=m.id) frames,
        (SELECT count(*) FROM media_video_frames f WHERE f.media_id=m.id AND f.level IS NOT NULL) frames_done,
        (SELECT max(CASE f.level ${LEVELS.map((l,i)=>`WHEN '${l}' THEN ${i}`).join(' ')} END) FROM media_video_frames f WHERE f.media_id=m.id) frame_rank,
        (SELECT verdict FROM play_media_feedback f WHERE f.media_id=m.id AND f.panel=? AND f.cast_key=?) verdict,
        (SELECT sum(verdict) FROM play_media_feedback f WHERE f.media_id=m.id AND f.cast_key=? AND f.panel<>?) other_verdict,
        (SELECT at FROM play_media_shown sh WHERE sh.media_id=m.id AND sh.panel=? AND sh.cast_key=?) shown_at
      FROM active_media m
        LEFT JOIN media_signals sg ON sg.media_id=m.id
        LEFT JOIN (SELECT s.media_id,s.id source_id,${aiLevelSql('s.raw_json')} ai_level,json_extract(s.raw_json,'$.description.hu') description,json_extract(s.raw_json,'$.world_details.camera.framing') framing
          FROM world_review_sources s WHERE s.rowid IN (SELECT max(rowid) FROM world_review_sources GROUP BY media_id)) ws ON ws.media_id=m.id
      WHERE m.id IN (SELECT media_id FROM depictions WHERE character_id IN (SELECT value FROM json_each(?)))
        AND m.kind IN (SELECT value FROM json_each(?))
        AND NOT EXISTS(SELECT 1 FROM media_tags x WHERE x.media_id=m.id AND x.tag_id IN (SELECT value FROM json_each(?)))
        AND NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id)`,
      panel,key,key,panel,panel,key,JSON.stringify(ids),JSON.stringify(rule.kinds),JSON.stringify(notMoments));
    const groups=new Set(all("SELECT name FROM sqlite_master WHERE type='table' AND name='character_groups'").length?all('SELECT character_id FROM character_groups').map(r=>r.character_id):[]);
    // When a near-duplicate of a picture was last shown with these people (any panel).
    const groupShown=new Map(all(`SELECT sg.group_id,max(sh.at) at FROM play_media_shown sh JOIN media_signals sg ON sg.media_id=sh.media_id WHERE sh.cast_key=? AND sg.group_id IS NOT NULL GROUP BY sg.group_id`,key).map(r=>[r.group_id,r.at]));
    const prev=after?one(`SELECT m.id,m.relative_path,sg.group_id,sg.captured_at FROM media m LEFT JOIN media_signals sg ON sg.media_id=m.id WHERE m.id=?`,after):null;
    const {here,town,around,any}=placeSets(location_id),ctx=words(context),skip=new Set(exclude);
    const scored=[];let hidden=0;
    for(const r of rows){
      if(skip.has(r.id)||r.verdict===-1)continue;
      // Level: the creator's label wins, then the AI analysis of the picture or of the video's
      // stills (the most intimate still counts). Unknown or unclear counts as intimate, so
      // nothing explicit is ever shown by accident; an unanalysed video counts as explicit.
      const videoLevel=r.kind==='video'?(r.frames_done?LEVELS[r.frame_rank]:'sexual_activity'):'nudity';
      const level=levelOf(r.owner_level,r.ai_level,videoLevel);
      if(RANK[level]>RANK[max]){hidden++;continue;}
      const known=LEVELS.includes(r.owner_level)||LEVELS.includes(r.ai_level)||(r.kind==='video'&&r.frames_done>0);
      const cast=(r.cast_ids||'').split(',').filter(Boolean),inCast=ids.filter(id=>cast.includes(id)),extras=cast.filter(id=>!ids.includes(id)&&!groups.has(id));
      const total=Math.max(cast.length,r.people||0);
      // Cast rules per panel; failing the strict rule drops the picture, a weaker match ranks lower.
      if((rule.cast==='focus'||rule.cast==='solo')&&!cast.includes(ids[0]))continue;
      if(rule.cast==='together'&&inCast.length<ids.length)continue;
      if(onlyCast&&extras.length)continue;
      const tags=new Set((r.tag_ids||'').split(',').filter(Boolean));
      if(samePlace&&around.size&&[...tags].some(t=>any.has(t))&&![...tags].some(t=>around.has(t)))continue;
      const reasons=[];let score=0;
      if(inCast.length===ids.length){score+=8;reasons.push(ids.length>1?'mind szerepelnek':'ő szerepel');}else{score+=3*inCast.length;reasons.push(`${inCast.length}/${ids.length} szereplő`);}
      if(rule.cast==='exact'||rule.cast==='solo'){score-=3*extras.length;if(total>ids.length)score-=2*(total-Math.max(ids.length,cast.length));if(inCast.length===ids.length&&!extras.length&&total<=ids.length){score+=3;reasons.push(rule.cast==='solo'||ids.length===1?'egyedül van a képen':'csak ők vannak a képen');}}
      const atPlace=[...tags].some(t=>here.has(t));
      if(atPlace){score+=5;reasons.push('ezen a helyen');}else if([...tags].some(t=>town.has(t))){score+=2;reasons.push('ugyanebben a városban');}
      // The mood: the closer the level to what the moment wants, the better.
      const gap=Math.abs(want-RANK[level]);score+=4-3*gap;
      if(!gap&&known)reasons.push(mood==='intimate'&&want<RANK.sexual_activity?'a jelenet elejéhez illik':'illik a hangulathoz');
      // "Unknown counts as intimate" is a safety rule, not evidence: a confirmed level ranks higher.
      else if(!known&&level!=='non_intimate'){score-=5;reasons.push('tartalma nincs megállapítva');}
      const fr=FRAMING[panel]?.[r.framing]||0;if(fr){score+=fr;if(fr>0)reasons.push('jó képkivágás');}
      const overlap=[...words(r.description)].filter(w=>ctx.has(w)).length;if(overlap){score+=Math.min(6,overlap*2);reasons.push('a leírása illik a történethez');}
      if(daypart&&r.description){const night=NIGHT.test(r.description),day=DAY.test(r.description);
        if(daypart==='night'&&night||daypart==='day'&&day){score+=1;reasons.push('illik a napszakhoz');}else if(daypart==='night'&&day||daypart==='day'&&night)score-=1;}
      if(r.verdict===1){score+=6;reasons.push('korábban jónak jelölted');}
      else if(r.other_verdict>0){score+=2;reasons.push('máshol jónak jelölted');}else if(r.other_verdict<0)score-=3;
      score+=freshness(r.shown_at);
      if(!r.shown_at&&r.group_id&&groupShown.has(r.group_id)){score+=Math.max(-2,freshness(groupShown.get(r.group_id)));reasons.push('hasonlót már láttál');}
      if(prev){if(prev.group_id&&r.group_id===prev.group_id){score-=4;reasons.push('majdnem ugyanaz, mint az előző');}
        else if(sameSeries(prev,r)){score+=3;reasons.push('ugyanabból a sorozatból');}}
      scored.push({r,level,known,gap,score,reasons,atPlace,complete:inCast.length===ids.length});
    }
    const order=(a,b)=>b.score-a.score||a.r.relative_path.localeCompare(b.r.relative_path);
    scored.sort(order);
    // Shape is checked only for the best few (reading file headers costs a little).
    const top=scored.slice(0,Math.max(limit*3,30));
    for(const s of top.slice(0,30)){const size=await sizeOf(s.r);s.size=size;if(!size||rule.shape==='any')continue;const wide=size.w/size.h>=1.15,tall=size.h/size.w>=1.15;
      if(rule.shape==='wide'&&wide||rule.shape==='tall'&&tall){s.score+=2;s.reasons.push('jó formátum');}else if(rule.shape==='wide'&&tall||rule.shape==='tall'&&wide)s.score-=1;}
    top.sort(order);
    // Variety: one picture per near-duplicate group.
    const seenGroups=new Set(),list=[];
    for(const s of top){if(diverse&&s.r.group_id){if(seenGroups.has(s.r.group_id))continue;seenGroups.add(s.r.group_id);}list.push(s);if(list.length>=limit)break;}
    // A video starts at the analysed still that fits the moment best.
    const startOf=s=>{if(s.r.kind!=='video'||!s.r.frames_done)return null;const f=all('SELECT t,level,description FROM media_video_frames WHERE media_id=? AND level IS NOT NULL ORDER BY t',s.r.id);
      const fit=x=>-3*Math.abs(RANK[x.level]-want)+Math.min(3,[...words(x.description)].filter(w=>ctx.has(w)).length);
      const best=f.reduce((b,x)=>fit(x)>fit(b)?x:b,f[0]);return best?best.t:null;};
    return {panel,max_level:max,want_level:LEVELS[want],cast_key:key,total:scored.length,hidden,items:list.map(s=>({media_id:s.r.id,kind:s.r.kind,level:s.level,score:s.score,reasons:s.reasons,complete:s.complete,at_place:s.atPlace,
      confidence:s.complete&&s.known&&!s.gap&&s.score>=12?'high':!s.complete||!s.known?'low':'medium',group_id:s.r.group_id||null,start_at:startOf(s),framing:s.r.framing||null,
      // Display: intimate media start blurred in shared-looking panels; wide panels crop to fill,
      // pictures of the other orientation are shown whole.
      blur:rule.blur&&s.level!=='non_intimate',fit:!s.size||rule.shape==='any'?'cover':rule.shape==='wide'?(s.size.w>=s.size.h?'cover':'contain'):(s.size.h>=s.size.w?'cover':'contain'),
      width:s.size?.w||null,height:s.size?.h||null,description:s.r.description||null}))};
  }

  function feedback({media_id,panel,characters,verdict}){
    if(!PANELS[panel]||![1,-1,0].includes(verdict)||!Array.isArray(characters)||!characters.length||characters.length>8||!characters.every(c=>typeof c==='string')||typeof media_id!=='string'||!one('SELECT 1 FROM media WHERE id=?',media_id))throw Object.assign(Error('Invalid media feedback.'),{status:400});
    const key=castKey(characters);standIns.clear();eventCache.clear();
    if(verdict===0)run('DELETE FROM play_media_feedback WHERE media_id=? AND panel=? AND cast_key=?',media_id,panel,key);
    else run('INSERT INTO play_media_feedback VALUES(?,?,?,?,?) ON CONFLICT DO UPDATE SET verdict=excluded.verdict,at=excluded.at',media_id,panel,key,verdict,iso());
    return {ok:true};
  }
  const markShown=(media_id,panel,characters)=>run('INSERT INTO play_media_shown VALUES(?,?,?,?) ON CONFLICT DO UPDATE SET at=excluded.at',media_id,panel,castKey(characters),iso());

  // Journal: one stable picture per event, chosen once (so the story does not flicker) and
  // re-chosen only on request or when the creator marks it as not fitting.
  async function forEvent(e,{repick=false}={}){
    const p=typeof e.payload_json==='string'?JSON.parse(e.payload_json):e.payload||{};
    const ids=[...(p.character_ids||[])];if(p.with_palor&&palorId())ids.push(palorId());if(!ids.length)return null;
    const mood=p.intimate?'intimate':'everyday';
    const row=one('SELECT media_id FROM play_event_media WHERE event_id=?',e.id),stored=row?.media_id||null;
    const request={panel:'journal',characters:ids,location_id:p.location_id,mood,context:`${e.title} ${e.summary}`};
    const cacheKey=e.id+'|'+adult();
    // "No fitting picture" is remembered like a pick (2026-11-12): before, every journal view
    // ran a full ranking again for each such event (about 200 ms per view).
    if(row&&!stored&&!repick){const miss=eventCache.get(cacheKey);if(miss&&miss.media_id===null&&now()-miss.at<600e3)return null;}
    if(stored&&!repick){
      // Keep the earlier pick while it is still allowed (the adult switch or feedback may have
      // changed). The check is a full ranking pass, so its result is cached until something
      // that could change it happens (feedback, a content label, the adult switch).
      const hit=eventCache.get(cacheKey);if(hit&&hit.media_id===stored&&now()-hit.at<600e3&&one('SELECT 1 FROM active_media WHERE id=?',stored))return hit.item;
      const item=(await pick({...request,limit:200,diverse:false})).items.find(i=>i.media_id===stored);
      if(item){eventCache.set(cacheKey,{media_id:stored,item,at:now()});return item;}
    }
    eventCache.delete(cacheKey);
    const item=(await pick({...request,exclude:repick&&stored?[stored]:[],limit:1})).items[0]||null;
    // Only "everybody in it" counts as a picture of this moment; otherwise the journal shows
    // the characters' portraits instead of a misleading photo.
    const fits=item?.complete?item:null;
    run('INSERT INTO play_event_media VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET media_id=excluded.media_id,picked_at=excluded.picked_at',e.id,fits?.media_id||null,iso());
    if(fits){markShown(fits.media_id,'journal',ids);eventCache.set(cacheKey,{media_id:fits.media_id,item:fits,at:now()});}
    else eventCache.set(cacheKey,{media_id:null,item:null,at:now()});
    return fits;
  }

  // Where a character stands in a picture: the confirmed region from the analysis, else an
  // approved body/general crop of that picture, else null (the whole picture).
  function regionOf(mediaId,cid){
    const doc=one('SELECT d.document_json FROM world_review_sources s JOIN world_review_documents d ON d.source_id=s.id WHERE s.media_id=? ORDER BY s.rowid DESC LIMIT 1',mediaId)?.document_json;
    try{const p=(JSON.parse(doc||'{}').participants||[]).find(x=>x.character_id===cid&&!x.ignored&&x.region);
      if(p&&[p.region.x,p.region.y,p.region.width,p.region.height].every(Number.isFinite))return {x:p.region.x,y:p.region.y,width:p.region.width,height:p.region.height};}catch{}
    if(!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_reference_crops'"))return null;
    const crop=one("SELECT crop_json FROM character_reference_crops WHERE media_id=? AND character_id=? AND role IN ('body','general') ORDER BY role='body' DESC LIMIT 1",mediaId,cid)?.crop_json;
    try{const c=JSON.parse(crop||'null');if(c&&[c.x,c.y,c.w,c.h].every(Number.isFinite))return {x:c.x,y:c.y,width:c.w,height:c.h};}catch{}
    return null;
  }
  // Stand-in figure for scenes when a character has no drawn figure yet: his best everyday
  // picture alone (portrait panel), with where he stands in it. Presentation only.
  // Cached for 10 minutes (a place view asks for every person present); feedback clears it.
  const standIns=new Map();
  async function standIn(cid){
    const key=cid+'|'+adult(),hit=standIns.get(key);if(hit&&now()-hit.at<600e3)return hit.value;
    const item=(await pick({panel:'portrait',characters:[cid],mood:'everyday',limit:4})).items.find(i=>i.complete);
    const value=item?{media_id:item.media_id,region:regionOf(item.media_id,cid),width:item.width,height:item.height}:null;
    standIns.set(key,{at:now(),value});return value;
  }
  // A content label or new picture can change what fits: forget cached stand-ins.
  return {pick,feedback,markShown,forEvent,standIn,regionOf,clearCache:()=>{standIns.clear();eventCache.clear();}};
}
