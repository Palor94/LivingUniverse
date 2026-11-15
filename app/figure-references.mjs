// Owner-selected source for Play figures: pictures in 10_CHARACTERS/<character> only.
// This is permission to use a picture for generation, never reference/canon approval.
import {lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {organized,characterFolder} from './storage-layout.mjs';

const within=(parent,file)=>{const r=path.relative(parent,file);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export function createFigureReferences({root,one,all}){
  const folderOnly=organized(root);
  function forCharacter(cid){
    if(!folderOnly)return null; // Legacy catalogues retain their explicit approved-reference policy.
    const c=one('SELECT id,name FROM characters WHERE id=?',cid);if(!c)return null;
    const folder=characterFolder(root,c.name),dir=path.resolve(root,folder);
    let realDir;
    try{
      const realRoot=realpathSync(root),parent=path.join(realRoot,'10_CHARACTERS');
      if(!within(path.resolve(root,'10_CHARACTERS'),dir)||lstatSync(dir).isSymbolicLink())throw Error();
      realDir=realpathSync(dir);if(!within(parent,realDir))throw Error();
    }catch{return {folder,references:[],available_count:0};}
    const canon=one('SELECT id,references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
    let approved=[];try{approved=JSON.parse(canon?.references_json||'[]');}catch{}
    const hasSources=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_asset_sources'");
    const rows=all(`SELECT m.id,m.relative_path,m.size,m.modified_at,
      (SELECT count(*) FROM depictions d WHERE d.media_id=m.id AND d.character_id<>?) other_characters
      FROM active_media m WHERE m.kind='image' AND m.folder=?
      ${hasSources?'AND NOT EXISTS(SELECT 1 FROM play_asset_sources s WHERE s.media_id=m.id)':''}
      ORDER BY m.relative_path COLLATE NOCASE,m.id`,cid,folder);
    const refs=[];let available=0;
    for(const m of rows){
      const file=path.resolve(root,m.relative_path);
      if(!within(dir,file))continue;
      try{const s=lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>20*1024*1024||!within(realDir,realpathSync(file)))continue;}catch{continue;}
      const approvedForMedia=approved.filter(r=>r?.media_id===m.id);
      // Shared pictures need an already approved character crop; never guess which man is his.
      const usable=m.other_characters?approvedForMedia.filter(r=>r.crop):approvedForMedia;
      if(m.other_characters&&!usable.length)continue;
      available++;
      if(usable.length)for(const r of usable)refs.push({character_id:cid,media_id:m.id,role:r.role||'general',
        ...(r.reference_id?{reference_id:r.reference_id}:{}),revision_id:canon.id,
        source:'character_folder',canon_approved:true,fetch_with:'get_approved_references'});
      else refs.push({character_id:cid,media_id:m.id,role:'general',source:'character_folder',
        canon_approved:false,fetch_with:'get_media',display_name:path.basename(m.relative_path)});
    }
    // Stable bounded set: approved face/body crops first, otherwise the folder's pictures.
    const rank=r=>(r.canon_approved?0:10)+({face:0,body:1,general:2,detail:3}[r.role]??4);
    refs.sort((a,b)=>rank(a)-rank(b));
    return {folder,references:refs.slice(0,4),available_count:available};
  }
  return {folderOnly,forCharacter};
}
