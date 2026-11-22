// Known places (2026-11-22, after Generative Agents spatial memory, Apache-2.0): a character knows
// his own places, his schedule's places, the places of events he took part in (last 60 days)
// and places he heard of in a conversation. Only these may be described concretely in his talk,
// which keeps the knowledge boundary for the world map too. Learned rows are rewindable.
import {readFileSync} from 'node:fs';
export const MAX_LISTED=15;
const norm=s=>String(s||'').toLocaleLowerCase('hu').replace(/\s+/g,' ').trim();

export function installKnownPlaces({db,one,all,run,now=()=>new Date()}){
  db.exec(readFileSync(new URL('./migrations/035-places-whispers.up.sql',import.meta.url),'utf8'));
  const iso=()=>now().toISOString();
  function known(cid){
    const ids=new Set(all('SELECT location_id FROM world_places WHERE character_id=?',cid).map(r=>r.location_id));
    let s=null;try{s=JSON.parse(one('SELECT value FROM application_settings WHERE key=?','world:schedule:'+cid)?.value||'null');}catch{}
    for(const e of Array.isArray(s?.entries)?s.entries:[])if(e?.location_id)ids.add(e.location_id);
    for(const r of all("SELECT json_extract(payload_json,'$.location_id') l FROM world_events WHERE rewound_at IS NULL AND status IN ('applied','accepted') AND json_extract(payload_json,'$.location_id') IS NOT NULL AND created_at>=? AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?)",new Date(now().getTime()-60*86400000).toISOString(),cid))ids.add(r.l);
    for(const r of all('SELECT location_id FROM known_places_learned WHERE character_id=? AND rewound_at IS NULL',cid))ids.add(r.location_id);
    return [...ids].map(id=>one('SELECT id,name FROM locations WHERE id=?',id)).filter(Boolean);
  }
  // Place names heard in a talk → learned, when exactly one location has that name.
  function learn(cid,names,source='conversation'){
    const out=[];
    for(const n of (Array.isArray(names)?names:[]).slice(0,8)){const key=norm(n);if(key.length<3)continue;
      const hits=all('SELECT id FROM locations').filter(l=>norm(one('SELECT name FROM locations WHERE id=?',l.id)?.name)===key);
      if(hits.length!==1)continue;
      if(Number(run('INSERT INTO known_places_learned VALUES(?,?,?,?,NULL) ON CONFLICT(character_id,location_id) DO NOTHING',cid,hits[0].id,source,iso()).changes))out.push(hits[0].id);}
    return out;
  }
  function promptLine(cid,{person='te'}={}){
    const list=known(cid).map(l=>l.name);if(!list.length)return '';
    const shown=list.slice(0,MAX_LISTED);
    return (person==='te'?'HELYEK, AMIKET ISMERSZ (konkrétumot – hol van, milyen belül – csak ezekről mondhatsz; amit nem ismersz, arról legfeljebb hallomásból vagy sehogy):':'HELYEK, AMIKET ISMER:')+' '+shown.join(', ')+(list.length>shown.length?' …':'');
  }
  function rewindAfter(time,at){const rows=all('SELECT character_id,location_id FROM known_places_learned WHERE rewound_at IS NULL AND created_at>?',time);
    for(const r of rows)run('UPDATE known_places_learned SET rewound_at=? WHERE character_id=? AND location_id=?',at,r.character_id,r.location_id);return rows;}
  function undoRewind(rows=[]){for(const r of rows)run('UPDATE known_places_learned SET rewound_at=NULL WHERE character_id=? AND location_id=?',r.character_id,r.location_id);}
  return {known,learn,promptLine,rewindAfter,undoRewind};
}
