// Quick tagging: batch confirmation of who is who (p1, p2…) in AI-analysed pictures.
// Suggestions come only from characters already linked to the picture, never from
// guessing. Every save goes through the world-review service (version check, file
// fingerprint check, change history). Confirmed characters are added to the
// picture's character links; existing links are never removed. Canon is untouched.
import {randomUUID} from 'node:crypto';
import {tagKey} from './taxonomy.mjs';
import {notPlanningSQL} from './media-purpose.mjs';

const GROUPS=['single','pair','other'];
// Picture-type tags (group "Kép típusa") the creator can set from the location tab.
const PICTURE_TYPES={collage:'Kollázs',reference:'Referenciakép'};

export function installQuickTag({one,all,run,transaction,fail,worldReview}){
  // "Kollázs" structured tag (group "Kép típusa"), created on first use. Collages stay in
  // galleries and can be cropped for references, but Play mode never uses them as scenes.
  function collageTagId(create=false,tagName='Kollázs'){
    const groupKey=tagKey('Kép típusa');
    if(create)run('INSERT OR IGNORE INTO tag_groups VALUES(?,?,?)',randomUUID(),'Kép típusa',groupKey);
    const group=one('SELECT id FROM tag_groups WHERE name_key=?',groupKey);if(!group)return null;
    if(create)run('INSERT OR IGNORE INTO structured_tags VALUES(?,?,?,?)',randomUUID(),group.id,tagName,tagKey(tagName));
    return one('SELECT id FROM structured_tags WHERE group_id=? AND name_key=?',group.id,tagKey(tagName))?.id||null;
  }
  const groupIds=()=>new Set(all("SELECT name FROM sqlite_master WHERE type='table' AND name='character_groups'").length?all('SELECT character_id FROM character_groups').map(r=>r.character_id):[]);
  // Generated figure sources (Szereplő-alakok uploads) are game assets, not pictures to sort or tag.
  const notAsset=()=>one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_asset_sources'")?'NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id)':'1';
  const activeCharacters=()=>new Set(all('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL').map(c=>c.id));

  // All analysed, active pictures whose identities are not reviewed yet, with their group.
  function pending(){
    const rows=all(`SELECT s.id source_id,s.media_id,s.source_sha256,d.version,d.document_json,m.relative_path,m.kind
      FROM world_review_sources s JOIN active_media m ON m.id=s.media_id JOIN world_review_documents d ON d.source_id=s.id
      WHERE s.rowid=(SELECT max(s2.rowid) FROM world_review_sources s2 WHERE s2.media_id=s.media_id)
        AND NOT EXISTS(SELECT 1 FROM world_review_tombstones t WHERE t.media_id=s.media_id)
        AND ${notPlanningSQL} AND ${notAsset()}
      ORDER BY m.relative_path`);
    const links=new Map();
    const groups=groupIds();
    for(const l of all(`SELECT d.media_id,c.id,c.name FROM depictions d JOIN characters c ON c.id=d.character_id LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY c.name`)){
      if(!links.has(l.media_id))links.set(l.media_id,[]);links.get(l.media_id).push({id:l.id,name:l.name,is_group:groups.has(l.id)});
    }
    const out=[];
    for(const row of rows){
      const doc=JSON.parse(row.document_json);if(doc.identity_reviewed)continue;
      const people=doc.participants.filter(p=>!p.ignored),linked=links.get(row.media_id)||[];
      const group=people.length===1&&linked.length===1?'single':people.length===2&&linked.length===2?'pair':'other';
      out.push({row,doc,people,linked,group});
    }
    return out;
  }

  // Pre-fill only where the linked characters leave no doubt about the set of people.
  function suggestion(entry){
    const {people,linked,group}=entry;
    if(group==='single')return {[people[0].id]:{state:'character',character_id:linked[0].id}};
    if(group==='pair')return {[people[0].id]:{state:'character',character_id:linked[0].id},[people[1].id]:{state:'character',character_id:linked[1].id}};
    return {};
  }

  // Filters (used by the "Egyéb" tab): a linked character, number of people ('3','4','5+'),
  // or only pictures without any linked character (often crowds/background).
  function queue({group='single',offset=0,limit=48,character_id='',people='',unlinked=false}={}){
    if(!GROUPS.includes(group)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>96||!['','1','2','3','4','5+'].includes(people))throw fail('Invalid quick-tag filter.');
    const collageId=collageTagId(),collages=new Set(collageId?all('SELECT media_id FROM media_tags WHERE tag_id=?',collageId).map(r=>r.media_id):[]);
    const entries=pending(),counts=Object.fromEntries(GROUPS.map(g=>[g,entries.filter(e=>e.group===g).length]));
    const inGroup=entries.filter(e=>e.group===group);
    const facets=new Map();for(const e of inGroup)for(const c of e.linked){const f=facets.get(c.id)||{id:c.id,name:c.name,count:0};f.count++;facets.set(c.id,f);}
    const chosen=inGroup.filter(e=>(!character_id||e.linked.some(c=>c.id===character_id))&&(!people||(people==='5+'?e.people.length>=5:e.people.length===Number(people)))&&(!unlinked||!e.linked.length));
    return {counts,total:chosen.length,offset,characters:[...facets.values()].sort((a,b)=>a.name.localeCompare(b.name,'hu')),unlinked_count:inGroup.filter(e=>!e.linked.length).length,items:chosen.slice(offset,offset+limit).map(e=>({
      media_id:e.row.media_id,kind:e.row.kind,filename:e.row.relative_path.split(/[\\/]/).pop(),folder:e.row.relative_path.split(/[\\/]/).slice(0,-1).join('\\'),
      source_id:e.row.source_id,source_sha256:e.row.source_sha256,version:e.row.version,
      participants:e.people.map(p=>({id:p.id,description:p.description||''})),linked:e.linked,suggested:suggestion(e),collage:collages.has(e.row.media_id)
    }))};
  }

  // Builds the new review document from the stored one, applying the user's choices.
  function decide(doc,choices,known,groups=new Set()){
    const participants=doc.participants.map(p=>{
      if(p.ignored)return p;
      // People the creator did not pick are background figures ("Nem karakter (háttérszereplő)").
      // The AI's original analysis stays unchanged as history.
      const choice=choices[p.id]||{state:'not_character'};
      if(choice.state==='character'){if(typeof choice.character_id!=='string'||!known.has(choice.character_id))throw fail('Choose an existing active character.');return {...p,character_id:choice.character_id,identity_state:'reviewed',ignored:false};}
      if(choice.state==='unknown')return {...p,character_id:null,identity_state:'unknown',ignored:false};
      if(choice.state==='not_character')return {...p,character_id:null,identity_state:'not_character',ignored:false};
      if(choice.state==='ignore')return {...p,character_id:null,identity_state:'unreviewed',ignored:true};
      throw fail('Invalid quick-tag decision.');
    });
    // The same character may appear several times (collages, several angles of one person;
    // groups such as "Hajléktalanok" covering several people), so repeats are allowed.
    return {...doc,participants,identity_reviewed:true};
  }

  async function confirm(items){
    if(!Array.isArray(items)||!items.length||items.length>96)throw fail('Select between 1 and 96 pictures.');
    const known=activeCharacters(),groups=groupIds(),results=[];
    for(const item of items){
      try{
        if(!item||typeof item.source_id!=='string'||typeof item.source_sha256!=='string'||!Number.isInteger(item.expected_version)||!item.choices||typeof item.choices!=='object')throw fail('Invalid quick-tag item.');
        const stored=one('SELECT d.document_json,s.media_id FROM world_review_documents d JOIN world_review_sources s ON s.id=d.source_id WHERE d.source_id=?',item.source_id);
        if(!stored)throw fail('Analysis not found.',404);
        const document=decide(JSON.parse(stored.document_json),item.choices,known,groups);
        // The review service re-checks the version, the file fingerprint and validity.
        let saved,stale=false;
        try{saved=await worldReview.save({source_id:item.source_id,source_sha256:item.source_sha256,expected_version:item.expected_version,document,request_key:'quick-tag-'+randomUUID()});}
        catch(e){
          // The file changed after the AI analysed it (re-saved, replaced, edited outside the app):
          // keep the creator's choice as character links and retire the outdated analysis.
          if(e.code!=='SOURCE_CHANGED')throw e;stale=true;saved={version:item.expected_version};
          run("INSERT OR IGNORE INTO world_review_tombstones VALUES(?,'stale_analysis',?)",stored.media_id,new Date().toISOString());
        }
        let added=0;
        transaction(()=>{for(const p of document.participants)if(p.identity_state==='reviewed')added+=Number(run('INSERT OR IGNORE INTO depictions VALUES(?,?)',stored.media_id,p.character_id).changes);
          if(item.collage===true)run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',stored.media_id,collageTagId(true));});
        results.push({source_id:item.source_id,media_id:stored.media_id,ok:true,version:saved.version,links_added:added,stale});
      }catch(e){results.push({source_id:item?.source_id??null,ok:false,code:e.code||null,error:e.status?e.message:'The picture could not be saved.'});}
    }
    const synced=syncSorting();
    return {confirmed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,sorting_completed:synced.completed,results};
  }

  // Location tagging: every location has a matching structured tag; tagging a picture with
  // it records where the picture happens. The search only reads; applying uses the
  // existing additive tag endpoint (/api/taxonomy/apply), so nothing is ever removed.
  const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu');
  // Place suggestions for pictures without a place (shown to the creator, never applied
  // automatically). Three signals, strongest first:
  //  1. folder neighbours: most tagged pictures in the same folder share one place;
  //  2. folder name: a folder is named after exactly one place;
  //  3. AI description: the scene label names a place type ("konyha", "edzőterem"); when
  //     several places match, only those linked to the pictured characters are kept.
  const SKIP_FOLDERS=new Set(['20_shared_media','locations','scenes','unassigned','imported media','characters','10_characters']);
  const dirOf=p=>p.split(/[\\/]/).slice(0,-1).join('\\');
  function placeHints(places){
    const byTag=new Map(places.map(p=>[p.tag_id,p])),byId=new Map(places.map(p=>[p.id,p]));
    const folderMedia=new Map(),folderPlace=new Map();
    for(const r of all('SELECT m.id,m.relative_path,mt.tag_id FROM media_tags mt JOIN active_media m ON m.id=mt.media_id')){
      const p=byTag.get(r.tag_id);if(!p)continue;const f=dirOf(r.relative_path);
      if(!folderMedia.has(f)){folderMedia.set(f,new Set());folderPlace.set(f,new Map());}
      folderMedia.get(f).add(r.id);const counts=folderPlace.get(f);counts.set(p.id,(counts.get(p.id)||0)+1);
    }
    const keys=new Map(),add=(k,p)=>{if(k.length<4)return;if(!keys.has(k))keys.set(k,new Set());keys.get(k).add(p.id);};
    for(const p of places){add(fold(p.name),p);add(fold(p.name.split(' - ').pop()),p);}
    const peopleOf=new Map();for(const r of all('SELECT media_id,character_id FROM depictions')){if(!peopleOf.has(r.media_id))peopleOf.set(r.media_id,[]);peopleOf.get(r.media_id).push(r.character_id);}
    const linkedOf=new Map();for(const r of all('SELECT character_id,location_id FROM world_places')){if(!linkedOf.has(r.character_id))linkedOf.set(r.character_id,new Set());linkedOf.get(r.character_id).add(r.location_id);}
    const under=(p,anchor)=>p.name===anchor.name||p.name.startsWith(anchor.name+' - ');
    const hint=(pid,reason,extra={})=>{const p=byId.get(pid);return {place_id:p.id,tag_id:p.tag_id,name:p.name,reason,...extra};};
    function fromAi(m,a){
      if(!a)return null;
      const text=fold([a.label,...a.settings].join(' | '));if(text.includes('referencia'))return null; // reference sheets need no place
      const matches=new Set();for(const [k,ids] of keys)if(k.length>=5&&text.includes(k))for(const id of ids)matches.add(id);
      if(matches.size===1)return hint([...matches][0],'ai');
      if(matches.size>1){
        const anchors=(peopleOf.get(m.id)||[]).flatMap(cid=>[...(linkedOf.get(cid)||[])]).map(id=>byId.get(id)).filter(Boolean);
        const kept=[...matches].filter(id=>anchors.some(an=>under(byId.get(id),an)));
        if(kept.length===1)return hint(kept[0],'ai_people');
      }
      return null;
    }
    return (m,a)=>{
      const f=dirOf(m.relative_path),counts=folderPlace.get(f);
      for(const seg of f.split('\\').reverse().map(fold).filter(s=>!SKIP_FOLDERS.has(s))){const ids=keys.get(seg);if(ids?.size===1)return hint([...ids][0],'folder_name');}
      const ai=fromAi(m,a);
      if(counts){
        const [pid,c]=[...counts].sort((x,y)=>y[1]-x[1])[0],total=folderMedia.get(f).size;
        // A character's own folder mixes many places: there the folder majority counts
        // only when the AI description does not point somewhere else.
        const personal=/^10_characters\\/u.test(fold(f));
        if(c>=2&&c/total>=0.6&&!(personal&&ai&&ai.place_id!==pid))return hint(pid,'folder',{count:c,total});
      }
      return ai;
    };
  }
  // neutral=false hides pictures the AI saw on a plain/neutral backdrop (reference shots): no location needed.
  function locationQueue({q='',untagged=true,noAi=false,neutral=false,suggested=false,offset=0,limit=96}={}){
    if(typeof q!=='string'||q.length>200||!Number.isInteger(offset)||offset<0)throw fail('Invalid quick-tag filter.');
    const places=all('SELECT l.id,l.name,l.tag_id FROM locations l JOIN structured_tags t ON t.id=l.tag_id ORDER BY l.name COLLATE NOCASE');
    const placeByTag=new Map(places.map(p=>[p.tag_id,p]));
    const tagged=new Map();
    for(const r of all('SELECT media_id,tag_id FROM media_tags')){const place=placeByTag.get(r.tag_id);if(!place)continue;if(!tagged.has(r.media_id))tagged.set(r.media_id,[]);tagged.get(r.media_id).push(place.name);}
    const analysis=new Map();
    for(const r of all('SELECT s.media_id,s.raw_json FROM world_review_sources s WHERE s.rowid=(SELECT max(s2.rowid) FROM world_review_sources s2 WHERE s2.media_id=s.media_id)')){
      const raw=JSON.parse(r.raw_json),scene=raw.scene_details;
      analysis.set(r.media_id,{neutral:raw.background?.kind==='neutral',label:scene.environment.observed_function.hu,label_en:scene.environment.observed_function.en,settings:scene.compatible_settings.map(s=>s.label.hu),settings_en:scene.compatible_settings.map(s=>s.label.en)});
    }
    const names=new Map();
    for(const r of all('SELECT d.media_id,c.name FROM depictions d JOIN characters c ON c.id=d.character_id LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY c.name')){if(!names.has(r.media_id))names.set(r.media_id,[]);names.get(r.media_id).push(r.name);}
    const terms=fold(q).split(/\s+/u).filter(Boolean),found=[],hintFor=placeHints(places);let neutralHidden=0,withHint=0;
    // Collages and reference pictures need no location: they leave the "untagged" list.
    const typed=new Set(all('SELECT media_id FROM media_tags WHERE tag_id IN (SELECT value FROM json_each(?))',JSON.stringify(Object.values(PICTURE_TYPES).map(name=>collageTagId(false,name)).filter(Boolean))).map(r=>r.media_id));
    for(const m of all(`SELECT m.id,m.relative_path,m.kind,n.tags,n.notes FROM active_media m LEFT JOIN media_notes n ON n.media_id=m.id WHERE ${notAsset()} AND ${notPlanningSQL} ORDER BY m.relative_path`)){
      if(untagged&&(tagged.has(m.id)||typed.has(m.id)))continue;
      const a=analysis.get(m.id),people=names.get(m.id)||[];
      if(noAi&&a)continue;
      if(!neutral&&a?.neutral){neutralHidden++;continue;}
      if(terms.length){const hay=fold([m.relative_path,m.tags,m.notes,a?.label,a?.label_en,...(a?.settings||[]),...(a?.settings_en||[]),...people].join(' '));if(terms.some(term=>!hay.includes(term)))continue;}
      const suggestion=tagged.has(m.id)?null:hintFor(m,a);if(suggestion)withHint++;
      if(suggested&&!suggestion)continue;
      found.push({media_id:m.id,kind:m.kind,filename:m.relative_path.split(/[\\/]/).pop(),folder:m.relative_path.split(/[\\/]/).slice(0,-1).join('\\'),ai_label:a?.label||null,ai_settings:a?.settings||[],locations:tagged.get(m.id)||[],characters:people,suggestion});
    }
    return {places,total:found.length,neutral_hidden:neutralHidden,suggested_total:withHint,offset,items:found.slice(offset,offset+limit)};
  }

  // Sync with "Rendezésre vár": a picture with at least one character AND a location tag
  // (or a Kollázs/Referenciakép tag, which need no location) counts as reviewed, so its
  // sorting is marked complete. Never reopens anything.
  function syncSorting(){
    const typeTags=JSON.stringify(Object.values(PICTURE_TYPES).map(name=>collageTagId(false,name)).filter(Boolean));
    const locationTag=`(EXISTS(SELECT 1 FROM media_tags mt JOIN locations l ON l.tag_id=mt.tag_id WHERE mt.media_id=m.id) OR EXISTS(SELECT 1 FROM media_tags mt WHERE mt.media_id=m.id AND mt.tag_id IN (SELECT value FROM json_each('${typeTags.replace(/'/g,"''")}'))))`;
    const hasCharacter="EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id)";
    const result=run(`INSERT INTO media_categorization(media_id,complete,updated_at) SELECT m.id,1,? FROM active_media m WHERE ${hasCharacter} AND ${locationTag} AND NOT EXISTS(SELECT 1 FROM media_categorization c WHERE c.media_id=m.id AND c.complete=1)
      ON CONFLICT(media_id) DO UPDATE SET complete=1,updated_at=excluded.updated_at`,new Date().toISOString());
    return {completed:Number(result.changes)};
  }

  // Counts for the home page: what is left to tag.
  function summary(){
    const entries=pending(),counts=Object.fromEntries(GROUPS.map(g=>[g,entries.filter(e=>e.group===g).length]));
    const analysed=one('SELECT COUNT(DISTINCT s.media_id) n FROM world_review_sources s JOIN active_media m ON m.id=s.media_id').n;
    const people=entries.reduce((n,e)=>n+e.people.length,0),active=one('SELECT COUNT(*) n FROM active_media').n;
    return {identity:{...counts,pictures:entries.length,people,analysed},locations:{untagged:locationQueue({limit:1}).total,active}};
  }

  // Creator removes pictures from the AI-analysed list for good (e.g. unusable shots).
  // Only the analysis is retired; the picture, its file and character links stay.
  // plan=true: a generation plan / comic idea without real characters; it also gets the
  // "Generálási terv" tag (group "Kép típusa") so all plans stay findable.
  function exclude(ids,plan=false){
    if(!Array.isArray(ids)||!ids.length||ids.length>96||ids.some(id=>typeof id!=='string'))throw fail('Select between 1 and 96 pictures.');
    let excluded=0;const at=new Date().toISOString();
    transaction(()=>{const planTag=plan?collageTagId(true,'Generálási terv'):null;for(const id of ids){excluded+=Number(run('INSERT OR IGNORE INTO world_review_tombstones VALUES(?,?,?)',id,plan?'creator_plan':'creator_excluded',at).changes);if(planTag&&one('SELECT 1 FROM media WHERE id=?',id))run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,planTag);}});
    return {excluded};
  }
  // Additive tag only; the picture, file, links and other tags stay untouched.
  function markType(ids,type){
    if(!Array.isArray(ids)||!ids.length||ids.length>500||!PICTURE_TYPES[type])throw fail('Choose pictures and a picture type.');
    let marked=0;
    transaction(()=>{const tag=collageTagId(true,PICTURE_TYPES[type]);for(const id of ids){if(!one('SELECT 1 FROM media WHERE id=?',id))throw fail('Media not found',404);marked+=Number(run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',id,tag).changes);}});
    return {marked,type};
  }

  async function handle({p,req,body,url,json}){
    if(p==='/api/quick-tag/exclude'&&req.method==='POST'){json(exclude(body.media_ids,body.plan===true));return true;}
    if(p==='/api/quick-tag/picture-type'&&req.method==='POST'){json(markType(body.media_ids,body.type));return true;}
    if(p==='/api/quick-tag/summary'&&req.method==='GET'){json(summary());return true;}
    if(p==='/api/quick-tag/sync'&&req.method==='POST'){json(syncSorting());return true;}
    if(p==='/api/quick-tag/locations'&&req.method==='GET'){json(locationQueue({q:url.searchParams.get('q')||'',untagged:url.searchParams.get('untagged')!=='0',noAi:url.searchParams.get('noai')==='1',neutral:url.searchParams.get('neutral')==='1',suggested:url.searchParams.get('suggested')==='1',offset:Number(url.searchParams.get('offset')||0)}));return true;}
    if(p==='/api/quick-tag'&&req.method==='GET'){json(queue({group:url.searchParams.get('group')||'single',offset:Number(url.searchParams.get('offset')||0),character_id:url.searchParams.get('character_id')||'',people:url.searchParams.get('people')||'',unlinked:url.searchParams.get('unlinked')==='1'}));return true;}
    if(p==='/api/quick-tag/confirm'&&req.method==='POST'){json(await confirm(body.items));return true;}
    return false;
  }
  return {handle,queue,confirm,locationQueue,summary,syncSorting};
}
