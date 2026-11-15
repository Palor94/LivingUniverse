// Data integrity audit (debugging package, 2026-11-13). Read-only checks for records that point
// at something that no longer exists, for the location tree and catalogue drifting apart, and
// for records that contradict each other. Each finding says what is wrong; a check with a safe
// repair offers it, and the repair runs only with {confirm:true} (one transaction, nothing else
// touched). Canon, profiles, the location tree, story history and media files are never changed
// here: those findings are reported for the owner to handle in their own screens.
//
//   GET  /api/dev/audit                         every check, counts and up to 25 examples
//   POST /api/dev/audit/repair {check,confirm:true}
import {promises as fs} from 'node:fs';
import path from 'node:path';

const SAMPLE=25;
// Tables whose rows only describe one media item. A row for a media item that no longer exists
// is dead weight (and some screens tripped on it). Logs of what happened stay: imports, moves,
// review tombstones, permanent-delete receipts are not listed here.
export const MEDIA_ROW_TABLES=['media_notes','media_tags','media_locations','media_location_links','media_roles','media_categorization','media_scan_state','media_signals','media_fingerprints','media_signal_distinct','play_content','play_seen','play_media_shown','play_media_sizes','play_asset_sources','play_inserts','play_event_media','identity_faces','identity_feedback'];
const SEXUAL_ROLE=`(f.en LIKE '%penetrat%' OR f.en LIKE '%oral%' OR f.en LIKE '%masturbat%' OR f.en LIKE '%intercourse%' OR f.en LIKE '%fellat%' OR f.en LIKE '%sexual%')`;

export function installDataAudit({one,all,run,transaction,fail,locationTree,root}){
  const tables=new Set(all("SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
  const has=t=>tables.has(t);
  const columns=t=>new Set(all(`PRAGMA table_info("${t}")`).map(c=>c.name));
  const settings=prefix=>all('SELECT key,value FROM application_settings WHERE key LIKE ?',prefix+'%').map(r=>{let v=null;try{v=JSON.parse(r.value);}catch{}return {key:r.key,id:r.key.slice(prefix.length),value:v};});
  const names=new Map(all('SELECT id,name FROM characters').map(c=>[c.id,c.name]));

  // Each check: group, find() → [{key,text}], optional repair(items) → number changed.
  const CHECKS=[
    {id:'depictions_media',group:'orphans',
      find:()=>all('SELECT d.media_id,d.character_id FROM depictions d WHERE NOT EXISTS(SELECT 1 FROM media m WHERE m.id=d.media_id)').map(r=>({key:r.media_id+'|'+r.character_id,text:(names.get(r.character_id)||r.character_id)+' → '+r.media_id})),
      repair:items=>items.reduce((n,i)=>{const [m,c]=i.key.split('|');return n+Number(run('DELETE FROM depictions WHERE media_id=? AND character_id=?',m,c).changes);},0)},
    {id:'depictions_character',group:'orphans',
      find:()=>all('SELECT d.media_id,d.character_id FROM depictions d WHERE NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=d.character_id)').map(r=>({key:r.media_id+'|'+r.character_id,text:r.character_id+' → '+r.media_id})),
      repair:items=>items.reduce((n,i)=>{const [m,c]=i.key.split('|');return n+Number(run('DELETE FROM depictions WHERE media_id=? AND character_id=?',m,c).changes);},0)},
    // Canon is never edited here: the owner removes a reference in the profile.
    {id:'canon_media',group:'orphans',
      find:()=>all(`SELECT c.character_id,json_extract(r.value,'$.media_id') media_id,
          EXISTS(SELECT 1 FROM media m WHERE m.id=json_extract(r.value,'$.media_id')) present,
          EXISTS(SELECT 1 FROM active_media a WHERE a.id=json_extract(r.value,'$.media_id')) active
        FROM canon c, json_each(c.references_json) r
        WHERE c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id)`).filter(r=>!r.active)
        .map(r=>({key:r.character_id+'|'+r.media_id,text:(names.get(r.character_id)||r.character_id)+': '+r.media_id+(r.present?' (Eltávolított elemek között)':' (nincs a katalógusban)')}))},
    {id:'media_rows',group:'orphans',
      // "sprite:<id>" (play_inserts) names a figure, not a catalogue item: checked against the figures.
      find:()=>MEDIA_ROW_TABLES.filter(t=>has(t)&&columns(t).has('media_id')).flatMap(t=>all(`SELECT DISTINCT media_id FROM "${t}" x WHERE x.media_id IS NOT NULL
          AND CASE WHEN x.media_id LIKE 'sprite:%' THEN NOT EXISTS(SELECT 1 FROM character_sprites s WHERE s.id=substr(x.media_id,8))
                   WHEN instr(x.media_id,':')>0 THEN 0
                   ELSE NOT EXISTS(SELECT 1 FROM media m WHERE m.id=x.media_id) END`).map(r=>({key:t+'|'+r.media_id,text:t+': '+r.media_id}))),
      repair:items=>items.reduce((n,i)=>{const [t,m]=i.key.split('|');if(!MEDIA_ROW_TABLES.includes(t))return n;return n+Number(run(`DELETE FROM "${t}" WHERE media_id=?`,m).changes);},0)},
    {id:'sprites_character',group:'orphans',
      find:()=>all('SELECT id,character_id,relative_path FROM character_sprites s WHERE NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=s.character_id)').map(r=>({key:r.id,text:r.relative_path})),
      repair:items=>items.reduce((n,i)=>n+Number(run('DELETE FROM character_sprites WHERE id=?',i.key).changes),0)},
    {id:'world_places',group:'orphans',
      find:()=>all('SELECT id,character_id,location_id FROM world_places w WHERE NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=w.character_id) OR NOT EXISTS(SELECT 1 FROM locations l WHERE l.id=w.location_id)').map(r=>({key:r.id,text:(names.get(r.character_id)||r.character_id)+' @ '+r.location_id})),
      repair:items=>items.reduce((n,i)=>n+Number(run('DELETE FROM world_places WHERE id=?',i.key).changes),0)},
    {id:'relationships',group:'orphans',
      find:()=>all('SELECT id,source_id,target_id FROM relationships r WHERE NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=r.source_id) OR NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=r.target_id)').map(r=>({key:r.id,text:(names.get(r.source_id)||r.source_id)+' → '+(names.get(r.target_id)||r.target_id)})),
      repair:items=>items.reduce((n,i)=>n+Number(run('DELETE FROM relationships WHERE id=?',i.key).changes),0)},
    // Conversation history stays; an open one of a missing character is closed.
    {id:'conversations',group:'orphans',
      find:()=>all("SELECT id,character_id,status FROM play_conversations p WHERE character_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.id=p.character_id)").map(r=>({key:r.id,text:r.character_id+' ('+r.status+')',open:r.status==='open'})),
      repair:items=>items.filter(i=>i.open).reduce((n,i)=>n+Number(run("UPDATE play_conversations SET status='closed',closed_at=coalesce(closed_at,?) WHERE id=? AND status='open'",new Date().toISOString(),i.key).changes),0)},
    {id:'room_exits',group:'orphans',
      find:async()=>{const tree=await locationTree.load();const out=[];
        for(const s of settings('play:room-exits:')){
          if(!tree.byId.has(s.id)){out.push({key:s.key,text:s.id,whole:true});continue;}
          for(const to of Object.keys(s.value?.exits||{}))if(!tree.byId.has(to))out.push({key:s.key+'|'+to,text:(tree.byId.get(s.id)?.path||s.id)+' → '+to});
        }return out;},
      repair:items=>editSettings(items,(value,to)=>{delete value.exits?.[to];})},
    {id:'town_layout',group:'orphans',
      find:async()=>{const tree=await locationTree.load();const out=[];
        for(const s of settings('play:town-layout:')){
          if(!tree.byId.has(s.id)){out.push({key:s.key,text:s.id,whole:true});continue;}
          for(const place of Object.keys(s.value?.positions||{}))if(!tree.byId.has(place))out.push({key:s.key+'|'+place,text:(tree.byId.get(s.id)?.path||s.id)+' → '+place});
        }return out;},
      repair:items=>editSettings(items,(value,place)=>{delete value.positions?.[place];})},

    // The location tree is the owner's canvas: findings only.
    {id:'tree_location',group:'tree',
      find:async()=>{const tree=await locationTree.load();const known=new Set(all('SELECT id FROM locations').map(r=>r.id));
        return tree.nodes.filter(n=>n.location_id&&!known.has(n.location_id)).map(n=>({key:n.id,text:n.path}));}},
    {id:'locations_unplaced',group:'tree',
      find:async()=>{const tree=await locationTree.load();
        return all('SELECT l.id,l.name,(SELECT count(*) FROM media_locations ml WHERE ml.location_id=l.id) n FROM locations l').filter(l=>l.n>0&&!tree.byLocation.has(l.id)&&!tree.typeSources?.has(l.id)).map(l=>({key:l.id,text:l.name+' ('+l.n+' kép)'}));}},
    {id:'sprite_folder',group:'tree',
      find:()=>all('SELECT s.id,s.relative_path,c.name FROM character_sprites s JOIN characters c ON c.id=s.character_id WHERE coalesce(s.missing,0)=0').filter(r=>{const parts=String(r.relative_path).split(/[\\/]/),at=parts.indexOf('Szereplő-alakok');return at>=0&&parts[at+1]!==undefined&&parts[at+1].normalize('NFC')!==String(r.name).normalize('NFC');}).map(r=>({key:r.id,text:r.name+': '+r.relative_path}))},
    {id:'town_map_files',group:'tree',
      find:async()=>{if(!root)return [];const dir=path.join(root,'20_SHARED_MEDIA','Játék térképek');let files=[];try{files=await fs.readdir(dir);}catch{return [];}
        const tree=await locationTree.load();const towns=new Set(tree.nodes.map(n=>n.name.normalize('NFC').toLocaleLowerCase('hu')));
        return files.filter(f=>/\.(png|jpe?g|webp)$/i.test(f)&&!/\(régi /.test(f)).filter(f=>!towns.has(f.replace(/\.[^.]+$/,'').normalize('NFC').toLocaleLowerCase('hu'))).map(f=>({key:f,text:f}));}},

    {id:'asset_targets',group:'conflicts',
      find:()=>all('SELECT media_id,group_concat(DISTINCT target) targets FROM play_asset_sources GROUP BY media_id HAVING count(DISTINCT target)>1').map(r=>({key:r.media_id,text:r.media_id+': '+r.targets}))},
    {id:'content_level',group:'conflicts',
      find:()=>has('world_review_facts')?all(`SELECT DISTINCT pc.media_id FROM play_content pc JOIN world_review_sources s ON s.media_id=pc.media_id JOIN world_review_facts f ON f.source_id=s.id
        WHERE pc.level='non_intimate' AND f.facet='role' AND ${SEXUAL_ROLE}`).map(r=>({key:r.media_id,text:r.media_id}))
        :[]},
    {id:'open_conversations',group:'conflicts',
      find:()=>all("SELECT character_id,count(*) n FROM play_conversations WHERE status='open' AND character_id IS NOT NULL GROUP BY character_id HAVING n>1").map(r=>({key:r.character_id,text:(names.get(r.character_id)||r.character_id)+': '+r.n}))},
    {id:'stuck_jobs',group:'conflicts',
      find:()=>has('play_generation_jobs')?all("SELECT id,target,status,updated_at FROM play_generation_jobs WHERE status IN ('running','started','claimed') AND updated_at<?",new Date(Date.now()-24*3600e3).toISOString()).map(r=>({key:r.id,text:r.target+' '+r.status+' '+r.updated_at})):[]},
  ];

  function editSettings(items,removeOne){
    let n=0;
    for(const i of items){
      const [key,part]=i.key.split('|');
      if(i.whole){n+=Number(run('DELETE FROM application_settings WHERE key=?',key).changes);continue;}
      const row=one('SELECT value FROM application_settings WHERE key=?',key);if(!row)continue;
      let value;try{value=JSON.parse(row.value);}catch{continue;}
      removeOne(value,part);value.updated_at=new Date().toISOString();
      n+=Number(run('UPDATE application_settings SET value=? WHERE key=?',JSON.stringify(value),key).changes);
    }
    return n;
  }

  async function audit(){
    const started=performance.now(),checks=[];
    for(const c of CHECKS){
      let items=[],error=null;
      try{items=await c.find();}catch(e){error=String(e.message||e).slice(0,200);}
      checks.push({id:c.id,group:c.group,count:items.length,sample:items.slice(0,SAMPLE).map(({key,text})=>({key,text})),repairable:!!c.repair&&items.length>0,error});
    }
    return {checked_at:new Date().toISOString(),ms:Math.round(performance.now()-started),problems:checks.reduce((s,c)=>s+c.count,0),checks};
  }

  async function repair({check,confirm}={}){
    const c=CHECKS.find(x=>x.id===check);
    if(!c||!c.repair)throw fail('Unknown audit check.',400);
    if(confirm!==true)throw fail('Confirm the repair.',400);
    const items=await c.find();
    if(!items.length)throw fail('Nothing to repair.',409);
    const changed=transaction(()=>c.repair(items));
    return {check,found:items.length,changed};
  }

  async function handle({p,req,body,json}){
    if(p==='/api/dev/audit'&&req.method==='GET'){json(await audit());return true;}
    if(p==='/api/dev/audit/repair'&&req.method==='POST'){json(await repair(body||{}));return true;}
    return false;
  }
  return {audit,repair,handle,checks:CHECKS.map(c=>({id:c.id,group:c.group,repairable:!!c.repair}))};
}
