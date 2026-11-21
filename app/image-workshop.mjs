import {cloudAvailabilityMany} from './duplicates.mjs';
// Képműhely (image workshop): one desktop place for getting pictures ready for use.
//  1. inbox       – every active picture/video with its preparation steps (local signals,
//                   duplicate check, who is on it, content level, AI tags) and the next one.
//  2. generation  – the Play-mode picture queue (play-assets needs) with full briefs.
//  3. checks      – generated/placed pictures side by side with approved references; the
//                   owner's verdict (face and body separately) is kept and fed back into
//                   later briefs; a rejected picture stops counting, so it is asked for again.
//  4. suggestions – carry content levels and character links across near-duplicates and
//                   clear folder runs (owner confirms each); a priority list for paid tagging.
//  5. readiness   – per cast member: what Play mode still lacks and the next fix; a held-out
//                   auto-canon benchmark set can be prepared (no paid call, no canon write).
// Nothing here uploads, calls a paid API, approves references or changes canon.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isPlanningSource,planningSQL} from './media-purpose.mjs';
import {estimateIdentityCostUsd} from './vision-identity.mjs';

const LEVELS=['non_intimate','nudity','sexual_activity'];
const STEPS=['signals','duplicate','people','content','tagged'];
const VERDICTS=['accept','reject','regenerate'],FACE=['match','mismatch','unsure','none'];
const NOT_MOMENTS=['Kollázs','Generálási terv','Referenciakép','Helyszín háttér'];
// Measured world-v1 prices (USD per 1M tokens): input, cached input, output.
const PRICE={input:2,cached:0.1,output:10};

export function installImageWorkshop({db,root,one,all,run,fail,dataDir,playAssets,sprites,worldEngine,origin}){
  db.exec(`CREATE TABLE IF NOT EXISTS workshop_checks(item_key TEXT PRIMARY KEY,target TEXT NOT NULL,character_id TEXT,location_id TEXT,verdict TEXT NOT NULL,face TEXT NOT NULL,body TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',job_id TEXT,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS workshop_checks_who ON workshop_checks(character_id,target,created_at);
    CREATE TABLE IF NOT EXISTS workshop_media_flags(media_id TEXT PRIMARY KEY,no_characters INTEGER NOT NULL DEFAULT 0,set_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workshop_dismissed(key TEXT PRIMARY KEY,created_at TEXT NOT NULL);`);
  const iso=()=>new Date().toISOString();
  const hasTable=name=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name);
  const names=()=>new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name]));
  const notMoments=()=>JSON.stringify(all(`SELECT st.id FROM structured_tags st JOIN tag_groups g ON g.id=st.group_id WHERE g.name='Kép típusa' AND st.name IN (${NOT_MOMENTS.map(()=>'?').join(',')})`,...NOT_MOMENTS).map(r=>r.id));
  const lastAi=`(SELECT json_extract(w.raw_json,'$.world_details.content.level') FROM world_review_sources w WHERE w.media_id=m.id ORDER BY w.rowid DESC LIMIT 1)`;
  const level=`COALESCE((SELECT level FROM play_content pc WHERE pc.media_id=m.id),CASE WHEN m.kind='video' THEN (SELECT CASE max(CASE f.level WHEN 'sexual_activity' THEN 3 WHEN 'nudity' THEN 2 WHEN 'non_intimate' THEN 1 END) WHEN 3 THEN 'sexual_activity' WHEN 2 THEN 'nudity' WHEN 1 THEN 'non_intimate' END FROM media_video_frames f WHERE f.media_id=m.id) ELSE (CASE WHEN ${lastAi} IN ('non_intimate','nudity','sexual_activity') THEN ${lastAi} END) END)`;
  const latestCanon=cid=>{const r=one('SELECT appearance,references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);let refs=[];try{refs=JSON.parse(r?.references_json||'[]').filter(x=>x?.media_id);}catch{}return {appearance:r?.appearance||null,refs};};
  const cast=()=>{const w=worldEngine.internals,list=w.meetable().map(c=>({id:c.id,name:c.name}));const p=w.palor();if(p&&!list.some(c=>c.id===p.id))list.unshift({id:p.id,name:p.name});return list;};

  // ---- 1. inbox ------------------------------------------------------------------------
  // One row per active media item (Play display copies and their sources excluded) with a
  // flag per step. Ready for use = local signals, no open duplicate, people known, level known.
  const stepSql=`SELECT m.id,m.kind,m.relative_path,m.created_at,m.size,m.modified_at,
      EXISTS(SELECT 1 FROM media_signals s WHERE s.media_id=m.id AND s.error IS NULL AND (s.dhash IS NOT NULL OR m.kind='video')) sig,
      EXISTS(SELECT 1 FROM media_signals s JOIN media_signals s2 ON s2.group_id=s.group_id AND s2.media_id<>s.media_id JOIN active_media m2 ON m2.id=s2.media_id
        WHERE s.media_id=m.id AND s.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media_signal_distinct x WHERE x.media_id IN (m.id,s2.media_id))) dup,
      (EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id) OR EXISTS(SELECT 1 FROM media_roles r WHERE r.media_id=m.id AND r.role='location')
        OR EXISTS(SELECT 1 FROM workshop_media_flags f WHERE f.media_id=m.id AND f.no_characters=1)
        OR EXISTS(SELECT 1 FROM world_review_sources w JOIN world_review_documents wd ON wd.source_id=w.id WHERE w.media_id=m.id AND json_extract(wd.document_json,'$.identity_reviewed')=1)) people,
      (${level} IS NOT NULL OR EXISTS(SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND t.tag_id IN (SELECT value FROM json_each(?)))) content,
      (EXISTS(SELECT 1 FROM world_review_sources w WHERE w.media_id=m.id) OR EXISTS(SELECT 1 FROM media_tags t WHERE t.media_id=m.id)) tagged
    FROM active_media m WHERE NOT EXISTS(SELECT 1 FROM play_asset_sources a WHERE a.media_id=m.id) AND NOT (${planningSQL})`; // Ötletláda pictures are ideas, not sorting work
  const stateOf=r=>({signals:!!r.sig,duplicate:!r.dup,people:!!r.people,content:!!r.content,tagged:!!r.tagged});
  const nextOf=s=>STEPS.find(k=>!s[k])||null;
  async function inbox({missing='any',character_id=null,limit=30,offset=0}={}){
    if(!['any','ready',...STEPS].includes(missing))throw fail('Unknown step.');
    if(character_id!==null&&!/^[0-9a-f-]{36}$/i.test(String(character_id)))throw fail('Unknown character.');
    const lim=Math.max(1,Math.min(100,Number(limit)||30)),skip=Math.max(0,Number(offset)||0);
    const rows=all(`WITH x AS (${stepSql}) SELECT * FROM x ${character_id?'WHERE EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=x.id AND d.character_id=?)':''} ORDER BY x.created_at DESC,x.id`,notMoments(),...(character_id?[character_id]:[]));
    const counts={total:rows.length,ready:0,signals:0,duplicate:0,people:0,content:0,tagged:0};
    const pick=[];
    for(const r of rows){const s=stateOf(r),ready=s.signals&&s.duplicate&&s.people&&s.content;if(ready)counts.ready++;for(const k of STEPS)if(!s[k])counts[k]++;
      if(missing==='any'?!ready:missing==='ready'?ready:!s[missing])pick.push({r,s,ready});}
    const n=names(),page=pick.slice(skip,skip+lim);
    const cast=new Map();for(const p of page)cast.set(p.r.id,[]);
    if(page.length)for(const d of all(`SELECT media_id,character_id FROM depictions WHERE media_id IN (${page.map(()=>'?').join(',')})`,...page.map(p=>p.r.id)))cast.get(d.media_id)?.push({id:d.character_id,name:n.get(d.character_id)||'?'});
    const levels=new Map(page.length?all(`SELECT m.id,${level} level FROM active_media m WHERE m.id IN (${page.map(()=>'?').join(',')})`,...page.map(p=>p.r.id)).map(x=>[x.id,x.level]):[]);
    const availability=await cloudAvailabilityMany(page.map(({r})=>path.resolve(root,r.relative_path)));
    return {counts,total:pick.length,offset:skip,items:page.map(({r,s,ready})=>({media_id:r.id,kind:r.kind,file:path.basename(r.relative_path),folder:path.dirname(r.relative_path),created_at:r.created_at,size:r.size,availability:availability.get(path.resolve(root,r.relative_path))||'unknown',
      steps:s,ready,next:ready?(s.tagged?null:'tagged'):nextOf(s),people:cast.get(r.id),level:levels.get(r.id)||null}))};
  }
  function flagNoCharacters(mediaId,value){
    if(typeof mediaId!=='string'||!one('SELECT 1 FROM active_media WHERE id=?',mediaId))throw fail('Media not found',404);
    if(typeof value!=='boolean')throw fail('value must be true or false.');
    if(value)run('INSERT INTO workshop_media_flags VALUES(?,1,?) ON CONFLICT(media_id) DO UPDATE SET no_characters=1,set_at=excluded.set_at',mediaId,iso());
    else run('DELETE FROM workshop_media_flags WHERE media_id=?',mediaId);
    return {media_id:mediaId,no_characters:value};
  }

  // ---- 3. checks ---------------------------------------------------------------------------
  // Generated or placed Play pictures: Grok/API outputs placed as figure, background or scene.
  function checkItems({status='open',limit=40}={}){
    if(!['open','done','all'].includes(status))throw fail('Unknown status.');
    const n=names(),out=[];
    const verdicts=new Map(all('SELECT * FROM workshop_checks').map(r=>[r.item_key,r]));
    const inserts=all(`SELECT i.media_id,i.kind,i.source,i.character_id,i.location_id,i.created_at,l.name location FROM play_inserts i LEFT JOIN locations l ON l.id=i.location_id
      WHERE (i.media_id LIKE 'sprite:%' OR EXISTS(SELECT 1 FROM active_media m WHERE m.id=i.media_id)) ORDER BY i.created_at DESC LIMIT 400`);
    const seen=new Set();
    for(const i of inserts){
      // A figure placed from a catalogue upload is logged with its source; show the figure itself.
      let key=i.media_id,image='/media/'+encodeURIComponent(i.media_id),w=null,h=null;
      if(i.kind==='figure'){const sp=i.media_id.startsWith('sprite:')?one('SELECT id,expression,width,height FROM character_sprites WHERE id=? AND missing=0',i.media_id.slice(7)):one("SELECT id,expression,width,height FROM character_sprites WHERE character_id=? AND missing=0 AND updated_at>=? ORDER BY updated_at LIMIT 1",i.character_id,i.created_at.slice(0,10));
        if(!sp)continue;key='sprite:'+sp.id;image='/api/sprites/'+sp.id;w=sp.width;h=sp.height;}
      else{const s=one('SELECT width,height FROM media_signals WHERE media_id=?',i.media_id);w=s?.width||null;h=s?.height||null;}
      if(seen.has(key))continue;seen.add(key);
      const v=verdicts.get(key);if(status==='open'&&v||status==='done'&&!v)continue;
      out.push({item_key:key,target:i.kind,source:i.source,image,character_id:i.character_id,name:i.character_id?n.get(i.character_id)||'?':null,location_id:i.location_id,location:i.location,created_at:i.created_at,
        checks:freeChecks(i.kind,w,h,key),references:i.character_id?latestCanon(i.character_id).refs.slice(0,6).map(r=>({media_id:r.media_id,role:r.role||null})):[],verdict:v||null});
      if(out.length>=Math.max(1,Math.min(100,Number(limit)||40)))break;
    }
    // Paid-API outputs (image generation runs) that are not placed in Play.
    if(hasTable('image_generation_outputs'))for(const o of all(`SELECT o.media_id,o.created_at,o.run_id FROM (SELECT run_id,media_id,created_at FROM image_generation_outputs UNION SELECT run_id,media_id,created_at FROM image_generation_output_items) o JOIN active_media m ON m.id=o.media_id ORDER BY o.created_at DESC LIMIT 100`)){
      if(seen.has(o.media_id))continue;const v=verdicts.get(o.media_id);if(status==='open'&&v||status==='done'&&!v)continue;
      const cid=one('SELECT character_id FROM depictions WHERE media_id=? LIMIT 1',o.media_id)?.character_id||null,s=one('SELECT width,height FROM media_signals WHERE media_id=?',o.media_id);
      out.push({item_key:o.media_id,target:'generated',source:'API',image:'/media/'+encodeURIComponent(o.media_id),character_id:cid,name:cid?n.get(cid)||'?':null,location_id:null,location:null,created_at:o.created_at,
        checks:freeChecks('generated',s?.width,s?.height,o.media_id),references:cid?latestCanon(cid).refs.slice(0,6).map(r=>({media_id:r.media_id,role:r.role||null})):[],verdict:v||null});
    }
    const accepted=all("SELECT verdict,count(*) n FROM workshop_checks GROUP BY verdict");
    return {items:out,stats:Object.fromEntries(accepted.map(r=>[r.verdict,r.n]))};
  }
  // Free checks only: size, orientation for the use, near-duplicates of something else.
  function freeChecks(target,w,h,key){
    const list=[];
    if(w&&h){
      list.push({id:'size',ok:Math.min(w,h)>=768,detail:w+'×'+h});
      if(target==='background')list.push({id:'landscape',ok:w>h,detail:(w/h).toFixed(2)});
      if(target==='figure')list.push({id:'portrait',ok:h>w,detail:(w/h).toFixed(2)});
    }else list.push({id:'size',ok:null,detail:null});
    if(!key.startsWith('sprite:')){const g=one('SELECT group_id FROM media_signals WHERE media_id=?',key)?.group_id;
      const others=g?one('SELECT count(*) n FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE s.group_id=? AND s.media_id<>?',g,key).n:0;
      list.push({id:'unique',ok:others===0,detail:others||null});}
    return list;
  }
  async function saveCheck(body){
    const allowed=['item_key','verdict','face','body','note'];if(!body||Object.keys(body).some(k=>!allowed.includes(k)))throw fail('Unexpected fields.');
    const key=String(body.item_key||''),{verdict}=body,face=body.face||'none',bodyV=body.body||'none',note=typeof body.note==='string'?body.note.trim().slice(0,1000):'';
    if(!VERDICTS.includes(verdict)||!FACE.includes(face)||!FACE.includes(bodyV))throw fail('Invalid verdict.');
    if((verdict!=='accept')&&!note)throw fail('Say in a few words what is wrong; the next brief will carry it.');
    const item=itemByKey(key);
    let job=null;
    if(key.startsWith('sprite:')&&verdict!=='accept')sprites.reject(key.slice(7),note);
    if(verdict==='regenerate'&&['figure','background','scene'].includes(item.target)){
      const args={target:item.target,...(item.character_id?{character_id:item.character_id}:{}),...(item.location_id?{location_id:item.location_id}:{}),...(item.expression?{expression:item.expression}:{}),...(item.outfit?{outfit:item.outfit}:{}),...(item.time_of_day?{time_of_day:item.time_of_day}:{})};
      job=await playAssets.reopen(args,note);
    }
    run(`INSERT INTO workshop_checks VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_key) DO UPDATE SET verdict=excluded.verdict,face=excluded.face,body=excluded.body,note=excluded.note,job_id=excluded.job_id,created_at=excluded.created_at`,
      key,item.target,item.character_id||null,item.location_id||null,verdict,face,bodyV,note,job?.job_id||null,iso());
    // A rejected catalogue picture is removed by the client through the recoverable removal.
    return {item_key:key,verdict,job_id:job?.job_id||null,remove_media:!key.startsWith('sprite:')&&verdict!=='accept'&&item.target!=='generated'?key:null};
  }
  function itemByKey(key){
    if(key.startsWith('sprite:')){const s=one('SELECT id,character_id,expression,outfit FROM character_sprites WHERE id=?',key.slice(7));if(!s)throw fail('Figure not found',404);return {target:'figure',character_id:s.character_id,expression:s.expression,outfit:s.outfit};}
    const i=one('SELECT kind,character_id,location_id,media_id FROM play_inserts WHERE media_id=? ORDER BY created_at DESC LIMIT 1',key);
    if(i){const time=i.kind==='background'?(/(?:^|[\\/])(nappal|este|ejjel)/.exec(one('SELECT relative_path FROM media WHERE id=?',key)?.relative_path||'')?.[1]||'nappal'):null;return {target:i.kind,character_id:i.character_id,location_id:i.location_id,time_of_day:time};}
    if(hasTable('image_generation_outputs')&&one('SELECT 1 FROM image_generation_outputs WHERE media_id=?',key))return {target:'generated',character_id:one('SELECT character_id FROM depictions WHERE media_id=? LIMIT 1',key)?.character_id||null};
    throw fail('Picture not found',404);
  }
  // Earlier rejections for the same character/place and use: carried into later briefs.
  function feedbackFor({target,character_id=null,location_id=null}){
    const by=character_id?['character_id',character_id]:location_id?['location_id',location_id]:null;if(!by)return [];
    return all(`SELECT note FROM workshop_checks WHERE verdict<>'accept' AND note<>'' AND target=? AND ${by[0]}=? ORDER BY created_at DESC LIMIT 3`,target,by[1]).map(r=>r.note);
  }

  // ---- 4. suggestions ----------------------------------------------------------------------
  function suggestions(){
    const dismissed=new Set(all('SELECT key FROM workshop_dismissed').map(r=>r.key)),n=names(),out=[];
    const keyOf=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,24);
    // a) near-duplicate groups: copy an agreed level / character links to the members without.
    const members=all(`SELECT s.group_id,m.id,m.relative_path,${level} level,(SELECT level FROM play_content pc WHERE pc.media_id=m.id) owner_level,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids
      FROM media_signals s JOIN active_media m ON m.id=s.media_id WHERE s.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media_signal_distinct x WHERE x.media_id=m.id) ORDER BY s.group_id,m.id`);
    const groups=new Map();for(const r of members){if(!groups.has(r.group_id))groups.set(r.group_id,[]);groups.get(r.group_id).push(r);}
    for(const [gid,items] of groups){if(items.length<2)continue;
      const known=[...new Set(items.filter(i=>i.owner_level).map(i=>i.owner_level))],ai=[...new Set(items.filter(i=>i.level).map(i=>i.level))];
      const lvl=known.length===1?known[0]:!known.length&&ai.length===1?ai[0]:null,without=items.filter(i=>!i.level);
      if(lvl&&without.length){const key=keyOf(['level',gid,lvl,without.map(i=>i.id)]);if(!dismissed.has(key))out.push({key,kind:'content',reason:'duplicate',level:lvl,media_ids:without.map(i=>i.id),examples:items.filter(i=>i.level).slice(0,2).map(i=>i.id)});}
      const sets=[...new Set(items.filter(i=>i.cast_ids).map(i=>i.cast_ids.split(',').sort().join(',')))],bare=items.filter(i=>!i.cast_ids);
      if(sets.length===1&&bare.length){const ids=sets[0].split(','),key=keyOf(['people',gid,ids,bare.map(i=>i.id)]);if(!dismissed.has(key))out.push({key,kind:'people',reason:'duplicate',character_ids:ids,names:ids.map(id=>n.get(id)||'?'),media_ids:bare.map(i=>i.id),examples:items.filter(i=>i.cast_ids).slice(0,2).map(i=>i.id)});}
    }
    // b) folder runs: in a folder of 5+ pictures where 80%+ of the linked ones show the same
    // character, the unlinked pictures probably show him too (a suggestion, never automatic).
    const folders=all(`SELECT m.folder,m.id,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids FROM active_media m
      WHERE m.kind='image' AND NOT EXISTS(SELECT 1 FROM play_asset_sources a WHERE a.media_id=m.id) AND NOT EXISTS(SELECT 1 FROM workshop_media_flags f WHERE f.media_id=m.id AND f.no_characters=1) ORDER BY m.folder,m.relative_path`);
    const byFolder=new Map();for(const r of folders){if(!byFolder.has(r.folder))byFolder.set(r.folder,[]);byFolder.get(r.folder).push(r);}
    for(const [folder,items] of byFolder){if(items.length<5||isPlanningSource(folder+'/x.png'))continue;
      const linked=items.filter(i=>i.cast_ids),bare=items.filter(i=>!i.cast_ids);if(!bare.length||linked.length<4)continue;
      const tally=new Map();for(const i of linked)for(const c of i.cast_ids.split(','))tally.set(c,(tally.get(c)||0)+1);
      const [cid,count]=[...tally].sort((a,b)=>b[1]-a[1])[0];if(count/linked.length<0.8)continue;
      const key=keyOf(['folder',folder,cid,bare.map(i=>i.id)]);if(dismissed.has(key))continue;
      out.push({key,kind:'people',reason:'folder',folder,share:Math.round(count/linked.length*100),character_ids:[cid],names:[n.get(cid)||'?'],media_ids:bare.slice(0,40).map(i=>i.id),more:Math.max(0,bare.length-40),examples:linked.filter(i=>i.cast_ids.split(',').includes(cid)).slice(0,2).map(i=>i.id)});
    }
    return {suggestions:out.slice(0,60),total:out.length};
  }
  function dismiss(key){if(typeof key!=='string'||!/^[0-9a-f]{24}$/.test(key))throw fail('Unknown suggestion.');run('INSERT OR IGNORE INTO workshop_dismissed VALUES(?,?)',key,iso());return {key,dismissed:true};}

  // Paid tagging priority: untagged pictures of the characters with the fewest usable ones
  // first. Measured cost per picture from earlier runs. Nothing is sent from here.
  function taggingPlan({limit=25}={}){
    const usable=new Map(all(`SELECT d.character_id,count(*) n FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE ${level} IS NOT NULL GROUP BY d.character_id`).map(r=>[r.character_id,r.n]));
    const n=names(),rows=all(`SELECT m.id,m.relative_path,(SELECT group_concat(character_id) FROM depictions d WHERE d.media_id=m.id) cast_ids FROM active_media m
      WHERE m.kind='image' AND NOT EXISTS(SELECT 1 FROM world_review_sources w WHERE w.media_id=m.id) AND NOT EXISTS(SELECT 1 FROM play_asset_sources a WHERE a.media_id=m.id)`).filter(r=>/\.(jpe?g|png)$/i.test(r.relative_path)&&!isPlanningSource(r.relative_path));
    const score=r=>{const ids=(r.cast_ids||'').split(',').filter(Boolean);return ids.length?Math.min(...ids.map(id=>usable.get(id)||0)):1e6;};
    rows.sort((a,b)=>score(a)-score(b)||a.relative_path.localeCompare(b.relative_path));
    const u=one(`SELECT count(*) n,avg(json_extract(raw_json,'$.usage.input_tokens')) i,avg(json_extract(raw_json,'$.usage.cached_input_tokens')) c,avg(json_extract(raw_json,'$.usage.output_tokens')) o FROM world_review_sources WHERE json_extract(raw_json,'$.usage.input_tokens') IS NOT NULL`);
    const per=u.n?((Math.max(0,u.i-(u.c||0))*PRICE.input+(u.c||0)*PRICE.cached+u.o*PRICE.output)/1e6):null;
    const lim=Math.max(1,Math.min(25,Number(limit)||25));
    return {untagged:rows.length,per_image_usd:per===null?null:Number(per.toFixed(4)),measured_calls:u.n,total_usd:per===null?null:Number((per*rows.length).toFixed(2)),
      next:rows.slice(0,lim).map(r=>({media_id:r.id,file:path.basename(r.relative_path),people:(r.cast_ids||'').split(',').filter(Boolean).map(id=>n.get(id)||'?'),usable:score(r)===1e6?null:score(r)})),limit:lim};
  }
  async function writeTaggingPlan(body){
    const plan=taggingPlan({limit:body?.limit});if(!plan.next.length)throw fail('Nothing left to tag.',409);
    const file=path.join(dataDir,'tagging-priority.json');
    await fs.writeFile(file,JSON.stringify({kind:'tagging-priority',created_at:iso(),media_ids:plan.next.map(x=>x.media_id)},null,2));
    const report=path.join(dataDir,'reports','vision-tag-'+Date.now()+'.json'),db_=path.join(dataDir,'universe.sqlite');
    const base=`node app/run-vision-tag.mjs --database "${db_}" --media-root "${root}" --ids-file "${file}" --limit ${plan.next.length} --report "${report}"`;
    return {file,count:plan.next.length,usd:plan.per_image_usd===null?null:Number((plan.per_image_usd*plan.next.length).toFixed(2)),estimate_command:base+' --estimate',trial_command:base+` --trial --ack-upload --ack-cost --ack-adult --max-usd ${Math.max(1,Math.ceil((plan.per_image_usd||0.03)*plan.next.length*1.5))}`};
  }

  // ---- 5. readiness and benchmark -------------------------------------------------------------
  function readiness(){
    const levels=all(`SELECT d.character_id,${level} level,count(*) n FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE m.kind IN ('image','video') AND NOT EXISTS(SELECT 1 FROM play_asset_sources a WHERE a.media_id=m.id) GROUP BY d.character_id,2`);
    const per=new Map();for(const r of levels){const p=per.get(r.character_id)||{non_intimate:0,nudity:0,sexual_activity:0,unknown:0};p[r.level||'unknown']+=r.n;per.set(r.character_id,p);}
    const out=cast().map(c=>{
      const {appearance,refs}=latestCanon(c.id),roles=new Set(refs.map(r=>r.role)),figs=sprites.forCharacter(c.id),pics=per.get(c.id)||{non_intimate:0,nudity:0,sexual_activity:0,unknown:0};
      const scenes=one("SELECT count(*) n FROM play_inserts i JOIN active_media m ON m.id=i.media_id WHERE i.kind='scene' AND i.character_id=?",c.id).n;
      const checks=[
        {id:'appearance',ok:!!appearance,fix:'profile'},
        {id:'face',ok:roles.has('face'),fix:'profile'},
        {id:'body',ok:roles.has('body'),fix:'profile'},
        {id:'figure',ok:figs.some(f=>f.expression==='alap'),fix:'generate'},
        {id:'expressions',ok:figs.length>=3,fix:'generate',detail:Math.max(0,figs.length-1)},
        {id:'pictures',ok:pics.non_intimate>=3,fix:'inbox',detail:pics.non_intimate},
        {id:'levels',ok:pics.unknown===0,fix:'inbox',detail:pics.unknown},
        {id:'scenes',ok:scenes>=1||!origin.intimateAllowed(c.id),fix:'generate',detail:scenes}];
      const done=checks.filter(x=>x.ok).length;
      return {character_id:c.id,name:c.name,score:Math.round(done/checks.length*100),checks,next:checks.find(x=>!x.ok)||null,pictures:pics,figures:figs.length,scenes,proven_references:origin.mayUseReferences(c.id)};
    });
    return {characters:out.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,'hu'))};
  }
  // Held-out set for the auto-canon benchmark (docs/AUTO_CANON.md step 2): reviewed solo and
  // multi-person pictures plus unknown/background people, excluding the approved references
  // themselves; only characters with approved face AND body references (bootstrap rule).
  function benchmarkCandidates(){
    const ready=new Set(),refIds=new Set();
    for(const c of all('SELECT DISTINCT character_id FROM canon')){const {refs}=latestCanon(c.character_id);const roles=new Set(refs.map(r=>r.role));refs.forEach(r=>refIds.add(r.media_id));if(roles.has('face')&&roles.has('body'))ready.add(c.character_id);}
    const docs=all(`SELECT w.media_id,wd.document_json,m.relative_path FROM world_review_sources w JOIN world_review_documents wd ON wd.source_id=w.id JOIN active_media m ON m.id=w.media_id
      WHERE w.rowid=(SELECT max(w2.rowid) FROM world_review_sources w2 WHERE w2.media_id=w.media_id) AND m.kind='image'`);
    const sets={solo:[],multi:[],unknown:[]};
    for(const d of docs){if(refIds.has(d.media_id)||isPlanningSource(d.relative_path))continue;let doc;try{doc=JSON.parse(d.document_json);}catch{continue;}if(!doc.identity_reviewed)continue;
      const people=(doc.participants||[]).filter(p=>!p.ignored),named=people.filter(p=>p.character_id),strangers=people.filter(p=>['unknown','not_character'].includes(p.identity_state));
      if(named.length===1&&people.length===1&&ready.has(named[0].character_id))sets.solo.push(d.media_id);
      else if(named.length>=2&&named.some(p=>ready.has(p.character_id)))sets.multi.push(d.media_id);
      if(strangers.length)sets.unknown.push(d.media_id);}
    // Deterministic sample: the same collection gives the same set.
    const sample=(ids,k)=>[...ids].sort((a,b)=>createHash('sha1').update(a).digest('hex').localeCompare(createHash('sha1').update(b).digest('hex'))).slice(0,k);
    const chosen={solo:sample(sets.solo,20),multi:sample(sets.multi,10),unknown:sample(sets.unknown,10)};
    const count=chosen.solo.length+chosen.multi.length+chosen.unknown.length;
    return {characters_ready:ready.size,available:{solo:sets.solo.length,multi:sets.multi.length,unknown:sets.unknown.length},chosen,count,estimate:estimateIdentityCostUsd(count)};
  }
  async function writeBenchmarkSet(){
    const b=benchmarkCandidates();if(!b.count)throw fail('No reviewed pictures for a benchmark yet: confirm identities in Gyors címkézés first.',409);
    const file=path.join(dataDir,'auto-canon-benchmark-set.json');
    await fs.writeFile(file,JSON.stringify({kind:'auto-canon-benchmark-set',created_at:iso(),method:'openai-gpt-6.1-sol-identity-v1',held_out:'approved references excluded',...b.chosen,estimate_usd:b.estimate.estimated_additional_usd},null,2));
    return {file,count:b.count,usd:b.estimate.estimated_additional_usd};
  }

  async function handle({p,req,url,body,json}){
    if(!p.startsWith('/api/workshop/'))return false;
    const q=url?.searchParams;
    if(p==='/api/workshop/inbox'&&req.method==='GET')return json(await inbox({missing:q?.get('missing')||'any',character_id:q?.get('character')||null,limit:q?.get('limit'),offset:q?.get('offset')})),true;
    if(p==='/api/workshop/hydrate'&&req.method==='POST'){
      const ids=body?.media_ids;if(!Array.isArray(ids)||!ids.length||ids.length>10||ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw fail('Válassz legfeljebb tíz letöltendő képet.');const done=[];
      for(const id of new Set(ids)){const media=one('SELECT * FROM active_media WHERE id=?',id);if(!media||media.size>100*1024*1024)throw fail('A fájl nem érhető el vagy túl nagy.');const parts=media.relative_path.split(/[\\/]/);if(parts.some(part=>!part||part==='.'||part==='..'||part.includes(':')))throw fail('Érvénytelen fájlútvonal.');let file=root;for(const part of parts){file=path.join(file,part);if((await fs.lstat(file)).isSymbolicLink())throw fail('A fájlútvonal hivatkozást tartalmaz.');}const relative=path.relative(await fs.realpath(root),await fs.realpath(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw fail('A fájl a médiamappán kívül van.');const handle=await fs.open(file,'r');try{const buffer=Buffer.alloc(262144);let total=0;for(;;){const {bytesRead}=await handle.read(buffer);if(!bytesRead)break;total+=bytesRead;if(total>100*1024*1024)throw fail('A fájl túl nagy.');}}finally{await handle.close();}done.push(id);}
      return json({downloaded:done}),true;
    }
    if(p==='/api/workshop/inbox/no-characters'&&req.method==='POST')return json(flagNoCharacters(body?.media_id,body?.value)),true;
    if(p==='/api/workshop/generation'&&req.method==='GET'){const needs=await playAssets.needs({limit:60});return json({...needs,jobs:playAssets.jobs({limit:40}).jobs}),true;}
    if(p==='/api/workshop/generation/brief'&&req.method==='GET'){const a={};for(const k of ['target','character_id','location_id','expression','outfit','time_of_day'])if(q?.get(k))a[k]=q.get(k);return json(await playAssets.brief(a)),true;}
    if(p==='/api/workshop/generation/open'&&req.method==='POST'){const a={};for(const k of ['target','character_id','location_id','expression','outfit','time_of_day'])if(body?.[k])a[k]=body[k];return json(await playAssets.reopen(a,typeof body?.note==='string'?body.note.slice(0,1000):'')),true;}
    if(p==='/api/workshop/checks'&&req.method==='GET')return json(checkItems({status:q?.get('status')||'open'})),true;
    if(p==='/api/workshop/checks'&&req.method==='POST')return json(await saveCheck(body)),true;
    if(p==='/api/workshop/suggestions'&&req.method==='GET')return json(suggestions()),true;
    if(p==='/api/workshop/suggestions/dismiss'&&req.method==='POST')return json(dismiss(body?.key)),true;
    if(p==='/api/workshop/tagging'&&req.method==='GET')return json(taggingPlan({limit:q?.get('limit')})),true;
    if(p==='/api/workshop/tagging/plan'&&req.method==='POST')return json(await writeTaggingPlan(body)),true;
    if(p==='/api/workshop/readiness'&&req.method==='GET')return json(readiness()),true;
    if(p==='/api/workshop/benchmark'&&req.method==='GET')return json(benchmarkCandidates()),true;
    if(p==='/api/workshop/benchmark'&&req.method==='POST')return json(await writeBenchmarkSet()),true;
    return false;
  }
  return {handle,inbox,flagNoCharacters,checkItems,saveCheck,feedbackFor,suggestions,dismiss,taggingPlan,writeTaggingPlan,readiness,benchmarkCandidates,writeBenchmarkSet};
}
