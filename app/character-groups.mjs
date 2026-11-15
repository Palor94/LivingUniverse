// Group records: one catalogue "character" that actually stands for several different
// people (e.g. "Hajléktalanok", "Kamionosok"). Marking is an explicit creator action.
// Effects elsewhere: tagging may assign the group to several people in one picture;
// new approved references and image generation are refused for groups. Existing
// references are kept untouched so the creator can review and remove them.
import {readFileSync} from 'node:fs';

export function installCharacterGroups({db,one,all,run,fail}){
  db.exec(readFileSync(new URL('./migrations/026-character-groups.up.sql',import.meta.url),'utf8'));
  const isGroup=id=>!!one('SELECT 1 FROM character_groups WHERE character_id=?',id);
  const ids=()=>new Set(all('SELECT character_id FROM character_groups').map(r=>r.character_id));
  function set(id,group){
    if(typeof group!=='boolean')throw fail('Choose group or individual.');
    if(!one('SELECT 1 FROM characters WHERE id=?',id))throw fail('Character not found',404);
    if(group)run('INSERT OR IGNORE INTO character_groups VALUES(?,?)',id,new Date().toISOString());
    else run('DELETE FROM character_groups WHERE character_id=?',id);
    return {character_id:id,is_group:isGroup(id)};
  }
  async function handle({p,req,body,json}){
    const m=p.match(/^\/api\/characters\/([^/]+)\/group$/);
    if(!m||req.method!=='POST')return false;
    json(set(m[1],body.group));return true;
  }
  return {isGroup,ids,set,handle};
}
