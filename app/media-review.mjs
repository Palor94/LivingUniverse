// Media review queues for the creator (Gyűjtemény › Tartalom és hasonlók):
//  - content queue: media whose content level is still unknown (no own label, no AI level,
//    or a video without analysed stills). The creator labels them with one key; the label
//    goes to play_content, which the media director trusts above everything else. Free.
//  - near-duplicate groups (media-signals.mjs): side by side, with a suggested keeper; the
//    others can go to the recoverable Removed items (the existing catalogue-only removal),
//    or the group can be marked "not duplicates". Approved canon references are protected.
// Nothing here is uploaded, and nothing becomes canon.
import path from 'node:path';
import {SIGNALS_SQL} from './media-signals.mjs';
import {playAssetFilter,figureSimilarityFilter} from './media-purpose.mjs';
import {LEVELS,aiLevelSql} from './content-levels.mjs';

const NOT_MOMENTS=['Kollázs','Generálási terv','Referenciakép','Helyszín háttér'];

export function installMediaReview({db,one,all,run,fail,regroupIfStale=()=>{}}){
  db.exec(SIGNALS_SQL);
  db.exec('CREATE TABLE IF NOT EXISTS play_content(media_id TEXT PRIMARY KEY,level TEXT NOT NULL,set_at TEXT NOT NULL)');
  // Same schema as play-mode.mjs, so the figure-source filter below is active from startup.
  db.exec('CREATE TABLE IF NOT EXISTS play_asset_sources(media_id TEXT PRIMARY KEY,target TEXT NOT NULL,placed_at TEXT NOT NULL)');
  const iso=()=>new Date().toISOString();
  const names=()=>new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name]));
  const notMoments=()=>all(`SELECT st.id FROM structured_tags st JOIN tag_groups g ON g.id=st.group_id WHERE g.name='Kép típusa' AND st.name IN (${NOT_MOMENTS.map(()=>'?').join(',')})`,...NOT_MOMENTS).map(r=>r.id);
  const lastAi=`(SELECT ${aiLevelSql('s.raw_json')} FROM world_review_sources s WHERE s.media_id=m.id ORDER BY s.rowid DESC LIMIT 1)`;
  const unknownWhere=`NOT EXISTS(SELECT 1 FROM play_content pc WHERE pc.media_id=m.id) AND ${playAssetFilter(one)}
      AND (m.kind='video' AND NOT EXISTS(SELECT 1 FROM media_video_frames f WHERE f.media_id=m.id AND f.level IS NOT NULL)
        OR m.kind='image' AND COALESCE(${lastAi},'unclear') NOT IN (${LEVELS.map(l=>`'${l}'`).join(',')}))
      AND NOT EXISTS(SELECT 1 FROM media_tags x WHERE x.media_id=m.id AND x.tag_id IN (SELECT value FROM json_each(?)))`;

  // kind: all | image | video. People first (the director only uses media with people).
  // offset: how many still-unlabelled items the client already holds (labelled ones leave
  // the queue, skipped ones stay, so the client's list is always a prefix of this order).
  function contentQueue({kind='all',limit=30,offset=0}={}){
    const k=['image','video'].includes(kind)?kind:null,lim=Math.max(1,Math.min(100,Number(limit)||30)),skip=JSON.stringify(notMoments());
    const rows=all(`SELECT m.id,m.kind,m.relative_path,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids,s.duration
      FROM active_media m LEFT JOIN media_signals s ON s.media_id=m.id WHERE ${unknownWhere} AND (? IS NULL OR m.kind=?)
      ORDER BY EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id) DESC,m.id LIMIT ? OFFSET ?`,skip,k,k,lim,Math.max(0,Number(offset)||0));
    const total=one(`SELECT count(*) n FROM active_media m WHERE ${unknownWhere} AND (? IS NULL OR m.kind=?)`,skip,k,k).n;
    const n=names();
    return {total,items:rows.map(r=>({media_id:r.id,kind:r.kind,file:path.basename(r.relative_path),duration:r.duration||null,people:(r.cast_ids||'').split(',').filter(Boolean).map(id=>n.get(id)||'?')}))};
  }

  // Near-duplicate groups with a suggested keeper: a canon reference, else the largest picture.
  function duplicateGroups({limit=40}={}){
    regroupIfStale();
    const canonRefs=new Set();
    for(const c of all('SELECT references_json FROM canon'))try{for(const r of JSON.parse(c.references_json||'[]'))if(r?.media_id)canonRefs.add(r.media_id);}catch{}
    const n=names();
    // Also filter on read: old cached groups or a newly placed figure must disappear immediately.
    const eligible=`${figureSimilarityFilter(one)} AND NOT EXISTS(SELECT 1 FROM media_signal_distinct x WHERE x.media_id=s.media_id)`;
    const grouped=`SELECT s.group_id,count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id
      WHERE s.group_id IS NOT NULL AND ${eligible} GROUP BY s.group_id HAVING n>1`;
    const groups=all(`${grouped} ORDER BY n DESC,s.group_id LIMIT ?`,Math.max(1,Math.min(200,Number(limit)||40)));
    return {groups:groups.map(g=>{
      const items=all(`SELECT m.id,m.kind,m.relative_path,m.size,s.width,s.height,s.captured_at,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids,
          (SELECT level FROM play_content pc WHERE pc.media_id=m.id) owner_level,${lastAi} ai_level
        FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE s.group_id=? AND ${eligible}`,g.group_id)
        .map(r=>({media_id:r.id,kind:r.kind,file:path.basename(r.relative_path),folder:path.dirname(r.relative_path),size:r.size,width:r.width,height:r.height,captured_at:r.captured_at,
          level:r.owner_level||r.ai_level||null,protected:canonRefs.has(r.id),people:(r.cast_ids||'').split(',').filter(Boolean).map(id=>n.get(id)||'?')}));
      const keeper=[...items].sort((a,b)=>(b.protected-a.protected)||((b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))||((b.size||0)-(a.size||0))||a.file.localeCompare(b.file))[0];
      return {group_id:g.group_id,keeper:keeper.media_id,items};
    }),total:one(`SELECT count(*) n FROM (${grouped})`).n};
  }
  function markDistinct(ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>50)throw fail('Choose the pictures of one group.');
    for(const id of ids){if(!one('SELECT 1 FROM media WHERE id=?',String(id)))throw fail('Media not found',404);}
    for(const id of ids){run('INSERT OR IGNORE INTO media_signal_distinct VALUES(?,?)',id,iso());run('UPDATE media_signals SET group_id=NULL WHERE media_id=?',id);}
    return {ok:true,marked:ids.length};
  }

  async function handle({p,req,url,body,json}){
    const q=url?.searchParams;
    if(p==='/api/review/content'&&req.method==='GET')return json(contentQueue({kind:q?.get('kind')||'all',limit:q?.get('limit'),offset:q?.get('offset')})),true;
    if(p==='/api/review/duplicates'&&req.method==='GET')return json(duplicateGroups({limit:q?.get('limit')})),true;
    if(p==='/api/review/duplicates/distinct'&&req.method==='POST')return json(markDistinct(body?.media_ids)),true;
    return false;
  }
  return {handle,contentQueue,duplicateGroups,markDistinct};
}
