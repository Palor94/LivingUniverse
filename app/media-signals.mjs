import {cloudAvailabilityMany} from './duplicates.mjs';
// Local media signals: free, offline facts about the creator's own media that help the media
// director choose well. Nothing here is uploaded or paid for.
//   - dHash (64-bit "difference hash") per picture → near-duplicate groups ("same moment").
//   - capture time from the JPEG EXIF header → series (pictures from the same shoot).
//   - video duration and still frames at fixed times → later analysis of videos, one still
//     at a time, with the same world-v1 contract as pictures (docs/VISION_ENGINE.md).
// The hashing and the frame grabbing run in the creator's own browser (it can decode every
// picture and video format the app shows); the server only checks and stores the results.
// Frame stills are derived cache files outside OneDrive (dataDir/video-frames), never canon.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const SIGNALS_SQL=`CREATE TABLE IF NOT EXISTS media_signals(media_id TEXT PRIMARY KEY,dhash TEXT,group_id TEXT,captured_at TEXT,duration REAL,width INTEGER,height INTEGER,frames INTEGER NOT NULL DEFAULT 0,error TEXT,updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS media_signals_group ON media_signals(group_id);
  CREATE TABLE IF NOT EXISTS media_signal_distinct(media_id TEXT PRIMARY KEY,marked_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS media_video_frames(media_id TEXT NOT NULL,t REAL NOT NULL,file TEXT NOT NULL,sha256 TEXT NOT NULL,dhash TEXT,level TEXT,description TEXT,analysed_at TEXT,PRIMARY KEY(media_id,t));`;

// Two pictures are "the same moment" when their dHashes differ in at most this many of 64 bits.
export const DUPLICATE_BITS=6;
const MAX_FRAME_BYTES=3*1024*1024,MAX_FRAMES=12;
// Owner decision 2026-11-10: videos longer than this get no stills and no paid analysis.
export const MAX_VIDEO_SECONDS=35;

// Frame times for a video (owner lock 2026-11-07: one still every 4 s, plus the last frame).
export function framePlan(duration){
  if(!(duration>0))return [0];
  const times=[];for(let t=0;t<duration-0.5;t+=4)times.push(Math.round(t*10)/10);
  const last=Math.max(0,Math.round((duration-0.2)*10)/10);if(!times.length||last-times.at(-1)>=1)times.push(last);
  // Long videos: at most MAX_FRAMES stills, spread over the whole video (first and last kept).
  if(times.length<=MAX_FRAMES)return times;
  return Array.from({length:MAX_FRAMES},(_,i)=>times[Math.round(i*(times.length-1)/(MAX_FRAMES-1))]);
}
// The smallest set of those stills that still covers the video: the first and last frame,
// then the stills that look most different from what is already chosen (dHash distance),
// about one per 6 seconds. Content that changes mid-video (undressing, a new position)
// shows up as a big hash jump, so it is picked first.
export function minimalFrames(frames,duration){
  const want=Math.max(2,Math.min(frames.length,Math.ceil((duration||0)/6)));
  if(frames.length<=want)return frames.map(f=>f.t);
  const chosen=[frames[0],frames.at(-1)],rest=frames.slice(1,-1);
  while(chosen.length<want&&rest.length){
    let best=0,bestD=-1;
    rest.forEach((f,i)=>{const d=Math.min(...chosen.map(c=>f.dhash&&c.dhash?hamming(f.dhash,c.dhash):32));if(d>bestD){bestD=d;best=i;}});
    chosen.push(rest.splice(best,1)[0]);
  }
  return chosen.map(f=>f.t).sort((a,b)=>a-b);
}

export function hamming(a,b){
  if(!/^[0-9a-f]{16}$/.test(a)||!/^[0-9a-f]{16}$/.test(b))return 64;
  let n=0;for(let i=0;i<16;i+=8){let x=(parseInt(a.slice(i,i+8),16)^parseInt(b.slice(i,i+8),16))>>>0;while(x){x&=x-1;n++;}}
  return n;
}

// DateTimeOriginal (or DateTime) from a JPEG's EXIF block, as an ISO-like local string.
export function exifTime(b){
  if(!(b.length>4&&b[0]===0xff&&b[1]===0xd8))return null;
  for(let i=2;i+4<b.length;){
    if(b[i]!==0xff){i++;continue;}const m=b[i+1],len=b.readUInt16BE(i+2);
    if(m===0xda)break;
    if(m===0xe1&&b.toString('ascii',i+4,i+8)==='Exif'){
      const t=i+10;if(t+8>b.length)return null;const le=b.toString('ascii',t,t+2)==='II';
      const u16=o=>le?b.readUInt16LE(t+o):b.readUInt16BE(t+o),u32=o=>le?b.readUInt32LE(t+o):b.readUInt32BE(t+o);
      const read=(ifd,want)=>{if(t+ifd+2>b.length)return null;const n=u16(ifd);for(let k=0;k<n;k++){const e=ifd+2+k*12;if(t+e+12>b.length)return null;if(want.includes(u16(e)))return {tag:u16(e),value:u32(e+8)};}return null;};
      try{
        const ifd0=u32(4),sub=read(ifd0,[0x8769]);
        const hit=(sub&&read(sub.value,[0x9003]))||read(ifd0,[0x0132]);
        if(!hit||t+hit.value+19>b.length)return null;
        const s=b.toString('ascii',t+hit.value,t+hit.value+19),x=s.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/);
        return x&&x[1]!=='0000'?`${x[1]}-${x[2]}-${x[3]}T${x[4]}:${x[5]}:${x[6]}`:null;
      }catch{return null;}
    }
    i+=2+len;
  }
  return null;
}

export function installMediaSignals({db,one,all,run,transaction,fail,root,dataDir,availability=cloudAvailabilityMany}){
  db.exec(SIGNALS_SQL);
  const iso=()=>new Date().toISOString();
  const framesDir=path.join(dataDir,'video-frames');
  let regroupTimer=null,groupedAt=0;
  // Reuse the visual hashes the duplicate finder (image-hash.js, same 9×8 dHash) already
  // computed, so those pictures are not decoded again.
  if(one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_fingerprints'")){
    const seeded=run(`INSERT OR IGNORE INTO media_signals(media_id,dhash,width,height,updated_at)
      SELECT f.media_id,f.visual_hash,f.width,f.height,? FROM media_fingerprints f JOIN media m ON m.id=f.media_id AND m.kind='image'
      WHERE f.visual_hash IS NOT NULL AND f.visual_version='dhash-64-canvas-v1' AND length(f.visual_hash)=16`,iso());
    if(seeded?.changes)queueMicrotask(()=>{try{regroup();}catch(e){console.error('Signals: '+e.message);}});
  }

  // What the browser worker should look at next: pictures without a hash, videos without frames.
  async function queue(limit=24){
    limit=Math.max(1,Math.min(60,Number(limit)||24));const items=[];
    for(let offset=0;items.length<limit;offset+=256){const rows=all(`SELECT m.id,m.kind,m.relative_path FROM active_media m LEFT JOIN media_signals s ON s.media_id=m.id WHERE m.kind IN ('image','video') AND s.media_id IS NULL ORDER BY m.relative_path LIMIT 256 OFFSET ?`,offset);if(!rows.length)break;const states=await availability(rows.map(row=>path.resolve(root,row.relative_path)));for(const row of rows)if(states.get(path.resolve(root,row.relative_path))==='local'&&items.length<limit)items.push({id:row.id,kind:row.kind});if(rows.length<256)break;}
    return {items};
  }

  async function readHead(rel){
    let h;try{h=await fs.open(path.join(root,rel),'r');const buf=Buffer.alloc(131072);const {bytesRead}=await h.read(buf,0,buf.length,0);return buf.subarray(0,bytesRead);}catch{return null;}finally{await h?.close();}
  }
  const DATA_JPEG=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;
  async function saveFrame(mediaId,t,dataUrl){
    const m=DATA_JPEG.exec(String(dataUrl||''));if(!m)throw fail('A frame must be a JPEG data URL.');
    const bytes=Buffer.from(m[1],'base64');if(bytes.length>MAX_FRAME_BYTES||bytes[0]!==0xff||bytes[1]!==0xd8)throw fail('Invalid frame.');
    const dir=path.join(framesDir,mediaId);await fs.mkdir(dir,{recursive:true});
    const name=`${String(Math.round(t*10)).padStart(5,'0')}.jpg`,file=path.join(dir,name);
    if(!path.resolve(file).startsWith(path.resolve(framesDir)+path.sep))throw fail('Invalid frame path.',403);
    await fs.writeFile(file,bytes);
    return {file:path.join(mediaId,name),sha256:createHash('sha256').update(bytes).digest('hex')};
  }

  // Results from the browser worker. Each item: {media_id, dhash?, width?, height?, duration?,
  // frames?:[{t,data_url,dhash}], error?}.
  async function ingest(items){
    if(!Array.isArray(items)||items.length>60)throw fail('Send at most 60 results at a time.');
    let saved=0;
    for(const it of items){
      const m=one('SELECT id,kind,relative_path FROM media WHERE id=?',it?.media_id??'');if(!m)continue;
      const dhash=/^[0-9a-f]{16}$/.test(it.dhash||'')?it.dhash:null;
      const num=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
      let captured=null,frames=[];
      if(m.kind==='image'){const head=await readHead(m.relative_path);captured=head?exifTime(head):null;}
      const tooLong=m.kind==='video'&&num(it.duration)>MAX_VIDEO_SECONDS;
      if(m.kind==='video'&&!tooLong&&Array.isArray(it.frames)){
        for(const f of it.frames.slice(0,MAX_FRAMES)){const t=Number(f?.t);if(!Number.isFinite(t)||t<0||t>36000)continue;
          const stored=await saveFrame(m.id,t,f.data_url);frames.push({t,...stored,dhash:/^[0-9a-f]{16}$/.test(f.dhash||'')?f.dhash:null});}
      }
      const error=typeof it.error==='string'?it.error.slice(0,200):null;
      transaction(()=>{
        run(`INSERT INTO media_signals(media_id,dhash,captured_at,duration,width,height,frames,error,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(media_id) DO UPDATE SET dhash=excluded.dhash,captured_at=excluded.captured_at,duration=excluded.duration,width=excluded.width,height=excluded.height,frames=excluded.frames,error=excluded.error,updated_at=excluded.updated_at`,
          m.id,dhash||frames[0]?.dhash||null,captured,num(it.duration),num(it.width),num(it.height),frames.length,error,iso());
        for(const f of frames)run(`INSERT INTO media_video_frames(media_id,t,file,sha256,dhash) VALUES(?,?,?,?,?)
          ON CONFLICT(media_id,t) DO UPDATE SET file=excluded.file,sha256=excluded.sha256,dhash=excluded.dhash`,m.id,f.t,f.file,f.sha256,f.dhash);
      });
      saved++;
    }
    // Regroup once the worker pauses (debounced), not after every batch of 24.
    if(saved){clearTimeout(regroupTimer);regroupTimer=setTimeout(()=>{try{regroup();}catch(e){console.error('Signals: '+e.message);}},3000);regroupTimer.unref?.();}
    return {saved};
  }

  // Near-duplicate groups: pictures of the same people whose hashes are within DUPLICATE_BITS.
  // Union-find over all hashed pictures (about 2 million comparisons for 2000 pictures).
  function regroup(){
    const rows=all(`SELECT s.media_id,s.dhash,(SELECT group_concat(character_id) FROM (SELECT character_id FROM depictions d WHERE d.media_id=s.media_id ORDER BY character_id)) cast_ids
      FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE s.dhash IS NOT NULL AND m.kind='image'
        AND NOT EXISTS(SELECT 1 FROM media_signal_distinct x WHERE x.media_id=s.media_id)`);
    const parent=rows.map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
    // Only pictures of the same people can be duplicates: compare within each cast bucket,
    // with the hashes as two 32-bit numbers (no string work inside the double loop).
    const bits=x=>{x-=(x>>>1)&0x55555555;x=(x&0x33333333)+((x>>>2)&0x33333333);return(((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
    const hi=new Uint32Array(rows.length),lo=new Uint32Array(rows.length),buckets=new Map();
    rows.forEach((r,i)=>{hi[i]=parseInt(r.dhash.slice(0,8),16);lo[i]=parseInt(r.dhash.slice(8),16);const k=r.cast_ids||'';if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);});
    for(const b of buckets.values())for(let x=0;x<b.length;x++)for(let y=x+1;y<b.length;y++){const i=b[x],j=b[y];if(bits(hi[i]^hi[j])+bits(lo[i]^lo[j])<=DUPLICATE_BITS)parent[find(j)]=find(i);}
    const size=new Map();rows.forEach((_,i)=>size.set(find(i),(size.get(find(i))||0)+1));
    transaction(()=>{rows.forEach((r,i)=>{const g=find(i);run('UPDATE media_signals SET group_id=? WHERE media_id=?',size.get(g)>1?rows[g].media_id:null,r.media_id);});});
    groupedAt=Date.now();
    return {groups:[...size.values()].filter(n=>n>1).length};
  }
  // Groups depend on who is in each picture; refresh them when they are older than 10 minutes.
  function regroupIfStale(){if(Date.now()-groupedAt>600e3)regroup();
  }

  function groups(limit=40){
    return all(`SELECT group_id,count(*) n,group_concat(media_id) ids FROM media_signals WHERE group_id IS NOT NULL GROUP BY group_id ORDER BY n DESC LIMIT ?`,limit)
      .map(g=>({group_id:g.group_id,count:g.n,media_ids:g.ids.split(',')}));
  }

  // Video analysis cost (no call is made here): measured average token use of the 1,376
  // pictures already tagged with world-v1, at the locked model's list prices.
  function videoEstimate(){
    const usage=all("SELECT json_extract(raw_json,'$.usage.input_tokens') i,json_extract(raw_json,'$.usage.cached_input_tokens') c,json_extract(raw_json,'$.usage.output_tokens') o FROM world_review_sources WHERE json_extract(raw_json,'$.usage.input_tokens') IS NOT NULL");
    const avg=k=>usage.length?usage.reduce((s,u)=>s+(Number(u[k])||0),0)/usage.length:0;
    const tok={input:avg('i')||4200,cached:avg('c')||2400,output:avg('o')||1700};
    const PRICE={input:2,cached:0.1,output:10};// USD per million tokens, gpt-6.1-sol standard
    const perStill=((tok.input-tok.cached)*PRICE.input+tok.cached*PRICE.cached+tok.output*PRICE.output)/1e6;
    const vids=all(`SELECT m.id,s.duration,s.frames FROM active_media m LEFT JOIN media_signals s ON s.media_id=m.id WHERE m.kind='video' AND (s.duration IS NULL OR s.duration<=?)`,MAX_VIDEO_SECONDS);
    const framesOf=all('SELECT media_id,t,dhash,level FROM media_video_frames ORDER BY media_id,t'),byVideo=new Map();
    for(const f of framesOf){if(!byVideo.has(f.media_id))byVideo.set(f.media_id,[]);byVideo.get(f.media_id).push(f);}
    let lock=0,min=0,known=0,analysed=0;
    for(const v of vids){
      const fr=byVideo.get(v.id)||[];if(fr.length)known++;
      // Unknown duration: assume 30 s (the longer of the two usual lengths).
      // Already analysed videos cost nothing more: the estimate is what is left.
      if(fr.some(f=>f.level)){analysed++;continue;}
      const d=v.duration||30;lock+=fr.length||framePlan(d).length;min+=fr.length?minimalFrames(fr,d).length:Math.max(2,Math.ceil(d/6));
    }
    const usd=n=>Math.round(n*perStill*100)/100;
    return {videos:vids.length,videos_with_frames:known,videos_analysed:analysed,model:'gpt-6.1-sol',per_still_usd:Math.round(perStill*10000)/10000,
      measured_from:usage.length,tokens:{input:Math.round(tok.input),cached:Math.round(tok.cached),output:Math.round(tok.output)},
      plans:{lock:{stills:lock,usd:usd(lock),rule:'1 still / 4 s + last frame'},minimal:{stills:min,usd:usd(min),rule:'first + last + most different, about 1 per 6 s'}}};
  }

  function status(){
    const c=(sql,...a)=>one(sql,...a).n;
    return {images:{total:c("SELECT count(*) n FROM active_media WHERE kind='image'"),hashed:c("SELECT count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE m.kind='image'")},
      videos:{total:c("SELECT count(*) n FROM active_media WHERE kind='video'"),framed:c("SELECT count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE m.kind='video' AND s.frames>0"),failed:c("SELECT count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE s.error IS NOT NULL"),
        too_long:c("SELECT count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE m.kind='video' AND s.duration>?",MAX_VIDEO_SECONDS)},
      groups:c('SELECT count(DISTINCT group_id) n FROM media_signals WHERE group_id IS NOT NULL'),in_groups:c('SELECT count(*) n FROM media_signals WHERE group_id IS NOT NULL'),
      with_time:c('SELECT count(*) n FROM media_signals WHERE captured_at IS NOT NULL'),estimate:videoEstimate()};
  }

  async function serveFrame(mediaId,t,res){
    const f=one('SELECT file FROM media_video_frames WHERE media_id=? AND t=?',mediaId,t);if(!f)throw fail('Frame not found',404);
    const file=path.resolve(framesDir,f.file);if(!file.startsWith(path.resolve(framesDir)+path.sep))throw fail('Frame not found',404);
    const bytes=await fs.readFile(file).catch(()=>null);if(!bytes)throw fail('Frame not found',404);
    res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=600','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }

  async function handle({p,req,res,body,json,url}){
    const m=req.method;
    if(p==='/api/signals/status'&&m==='GET')return json(status()),true;
    if(p==='/api/signals/queue'&&m==='GET')return json(await queue(url?.searchParams.get('limit'))),true;
    if(p==='/api/signals'&&m==='POST')return json(await ingest(body?.items)),true;
    if(p==='/api/signals/plan'&&m==='GET'){const d=Number(url?.searchParams.get('duration'));return json({times:framePlan(d)}),true;}
    if(p==='/api/signals/groups'&&m==='GET')return json({groups:groups()}),true;
    const x=p.match(/^\/api\/signals\/frame\/([0-9a-f-]{36})\/([0-9.]+)$/);
    if(x&&m==='GET'){await serveFrame(x[1],Number(x[2]),res);return true;}
    return false;
  }
  return {handle,queue,ingest,regroup,regroupIfStale,groups,status,videoEstimate,flush:()=>{if(regroupTimer){clearTimeout(regroupTimer);regroupTimer=null;regroup();}}};
}
