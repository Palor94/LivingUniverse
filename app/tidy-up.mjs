// Tidy-up overview ("Rendrakás") for the home page: what is still missing in the
// collection, and cover suggestions for characters without a cover picture.
// Everything here only reads, except setCovers, which sets a presentation cover
// (never canon) and refuses to replace a cover that already exists.

import {playAssetFilter,notPlanningSQL} from './media-purpose.mjs';

export function installTidyUp({one,all,run,transaction,fail,locationCanvas}){
  const activeCharacters=()=>all(`SELECT c.id,c.name,c.cover_id,coalesce(c.biography,'')||coalesce(c.personality,'')||coalesce(c.appearance,'') legacy
    FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL ORDER BY c.name COLLATE NOCASE`);
  const ghosts=()=>new Map(all("SELECT key,value FROM application_settings WHERE key LIKE 'ghost:character:%'").map(r=>{let v={};try{v=JSON.parse(r.value);}catch{}return [r.key.slice('ghost:character:'.length),v];}));
  const FOLDERS_KEY='tidy:collection_folders';
  const collectionFolders=()=>{try{return new Set(JSON.parse(one('SELECT value FROM application_settings WHERE key=?',FOLDERS_KEY)?.value||'[]'));}catch{return new Set();}};
  // Marks or unmarks a character as a collection folder. Presentation only: no profile, canon or media change.
  function setCollectionFolder(id,on){
    if(typeof id!=='string'||!one('SELECT 1 FROM characters WHERE id=?',id))throw fail('Character not found.',404);
    const set=collectionFolders();if(on)set.add(id);else set.delete(id);
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',FOLDERS_KEY,JSON.stringify([...set]));
    return {id,collection_folder:!!on};
  }
  const filled=v=>Object.values(v?.values||{}).some(x=>String(x??'').trim());

  async function summary(){
    const chars=activeCharacters(),ghost=ghosts();
    const noCover=chars.filter(c=>!c.cover_id).map(({id,name})=>({id,name}));
    // "No profile": neither the classic fields nor the Szellemprofil have any text.
    // Owner-marked collection folders (e.g. a crowd of unnamed people) are not characters waiting for a profile.
    const folders=collectionFolders();
    const noProfile=chars.filter(c=>!folders.has(c.id)&&!c.legacy.trim()&&!filled(ghost.get(c.id))).map(({id,name})=>({id,name}));
    const pending=chars.map(c=>({id:c.id,name:c.name,count:(ghost.get(c.id)?.proposals||[]).filter(p=>p.status==='pending').length})).filter(c=>c.count);
    const removed=one(`SELECT count(*) n,coalesce(sum(m.size),0) bytes,min(h.created_at) oldest FROM media_hidden h JOIN media m ON m.id=h.media_id
      WHERE NOT EXISTS(SELECT 1 FROM application_settings s WHERE s.key='erased_media:'||m.id)`);
    // Figure sources and Ötletláda pictures are not pictures waiting for a character.
    const noCharacter=one(`SELECT count(*) n FROM active_media m WHERE NOT EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id) AND ${playAssetFilter(one)} AND ${notPlanningSQL}`).n;
    let draft=false;try{const c=await locationCanvas.context();draft=!!c.head&&c.head!==c.approved_head;}catch{}
    return {no_cover:noCover,no_profile:noProfile,ghost_pending:pending,removed:{count:removed.n,bytes:removed.bytes,oldest:removed.oldest},no_character:noCharacter,tree_draft:draft};
  }

  // Up to six candidate covers per character without one, best first:
  // approved references, then rated generations, then pictures showing only this
  // character, then anything else. Collages and generation plans are left out.
  function coverSuggestions(){
    const chars=activeCharacters().filter(c=>!c.cover_id);
    const skip=new Set(all(`SELECT mt.media_id FROM media_tags mt JOIN structured_tags t ON t.id=mt.tag_id JOIN tag_groups g ON g.id=t.group_id WHERE g.name='Kép típusa' AND t.name IN ('Kollázs','Generálási terv')`).map(r=>r.media_id));
    return {items:chars.map(c=>{
      const refs=new Set(all(`SELECT DISTINCT json_extract(r.value,'$.media_id') id FROM canon k,json_each(k.references_json) r WHERE k.character_id=?`,c.id).map(r=>r.id));
      const pics=all(`SELECT m.id,m.relative_path,(SELECT count(*) FROM depictions d2 WHERE d2.media_id=m.id) people,
          (SELECT max(f.rating) FROM generation_feedback f WHERE f.media_id=m.id AND f.character_id=?) rating
        FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE d.character_id=? AND m.kind='image' ORDER BY m.modified_at DESC`,c.id,c.id)
        .filter(m=>!skip.has(m.id))
        .map(m=>({id:m.id,filename:m.relative_path.split(/[\\/]/).pop(),reference:refs.has(m.id),rating:m.rating??null,alone:m.people===1,
          score:(refs.has(m.id)?100:0)+(m.rating??0)*10+(m.people===1?20:0)}))
        .sort((a,b)=>b.score-a.score);
      return {id:c.id,name:c.name,total:pics.length,candidates:pics.slice(0,6).map(({score,...m})=>m)};
    })};
  }

  function setCovers(choices){
    if(!Array.isArray(choices)||!choices.length||choices.length>200)throw fail('Choose between 1 and 200 covers.');
    let set=0;
    transaction(()=>{for(const ch of choices){
      if(!ch||typeof ch.character_id!=='string'||typeof ch.media_id!=='string')throw fail('Invalid cover choice.');
      const c=one('SELECT c.cover_id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',ch.character_id);
      if(!c)throw fail('Character not found.',404);
      if(c.cover_id)continue; // never replace an existing cover from here
      if(!one(`SELECT 1 FROM depictions d JOIN active_media m ON m.id=d.media_id WHERE d.character_id=? AND d.media_id=? AND m.kind='image'`,ch.character_id,ch.media_id))throw fail('The cover must be an active picture of this character.',409);
      run('DELETE FROM character_cover_frames WHERE character_id=?',ch.character_id);
      run('UPDATE characters SET cover_id=? WHERE id=? AND cover_id IS NULL',ch.media_id,ch.character_id);
      run('UPDATE character_ui SET cover_crop=NULL WHERE character_id=?',ch.character_id);
      set++;
    }});
    return {set};
  }

  async function handle({p,req,body,json}){
    if(p==='/api/tidy'&&req.method==='GET'){json(await summary());return true;}
    if(p==='/api/tidy/covers'&&req.method==='GET'){json(coverSuggestions());return true;}
    if(p==='/api/tidy/covers'&&req.method==='POST'){json(setCovers(body.choices));return true;}
    if(p==='/api/tidy/collection-folder'&&req.method==='POST'){json(setCollectionFolder(body.character_id,body.collection_folder!==false));return true;}
    return false;
  }
  return {handle,summary,coverSuggestions,setCovers,setCollectionFolder};
}
