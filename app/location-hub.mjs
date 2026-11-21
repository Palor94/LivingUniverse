import path from 'node:path';
import {BACKDROP_OK_SQL} from './play/backdrops.mjs';
export function backdropTime(filename){const name=String(filename).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();return /ejjel|ejszaka|night/.test(name)?'ejjel':/este|evening/.test(name)?'este':/nappal|daylight|daytime/.test(name)?'nappal':'unknown';}
export function installLocationHub({all,editor,locationTree}){
  return {async snapshot(){
    const tree=await locationTree.load(),people=all('SELECT w.location_id,w.role,c.id,c.name FROM world_places w JOIN characters c ON c.id=w.character_id'),images=all(`SELECT DISTINCT l.id location_id,m.id media_id,m.relative_path FROM locations l JOIN active_media m ON m.kind='image' JOIN media_roles r ON r.media_id=m.id AND r.role='location' WHERE (EXISTS(SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND t.tag_id=l.tag_id) OR EXISTS(SELECT 1 FROM media_locations ml WHERE ml.media_id=m.id AND ml.location_id=l.id)) AND ${BACKDROP_OK_SQL}`);
    return {places:editor.list().items.map(place=>({...place,node_id:tree.nodes.find(node=>node.location_id===place.id)?.id||null,path:tree.nodes.find(node=>node.location_id===place.id)?.path||place.name,people:people.filter(person=>person.location_id===place.id).map(({location_id,...person})=>person),backgrounds:images.filter(image=>image.location_id===place.id).map(image=>({media_id:image.media_id,time_of_day:backdropTime(path.basename(image.relative_path))}))})),nodes:tree.nodes};
  }};
}
