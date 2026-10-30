// Logical catalogue operations only: no filesystem or canonical-identity writes.
export function installCatalogueActions({all,one,run,transaction,fail}){
  const locationSQL="EXISTS(SELECT 1 FROM media_roles r WHERE r.media_id=m.id AND r.role='location')";
  function setLocation(mid,value){if(typeof value!=='boolean')throw fail('Invalid location-reference choice.');if(value)run("INSERT INTO media_roles VALUES(?,'location',?) ON CONFLICT(media_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at",mid,new Date().toISOString());else run('DELETE FROM media_roles WHERE media_id=?',mid);}
  const tokens=text=>String(text||'').split(/[,\n]/).map(t=>t.trim()).filter(Boolean);
  const key=text=>text.normalize('NFC').toLocaleLowerCase();
  function setComplete(mid,complete){
    if(typeof complete!=='boolean')throw fail('Choose complete or needs review.');
    run('INSERT INTO media_categorization VALUES(?,?,?) ON CONFLICT(media_id) DO UPDATE SET complete=excluded.complete,updated_at=excluded.updated_at',mid,complete?1:0,new Date().toISOString());
  }
  function details(mid){const complete=Boolean(one('SELECT complete FROM media_categorization WHERE media_id=?',mid)?.complete);const count=one('SELECT COUNT(*) n FROM depictions d LEFT JOIN character_ui u ON u.character_id=d.character_id WHERE d.media_id=? AND u.merged_into IS NULL',mid).n;const location=!!one("SELECT 1 FROM media_roles WHERE media_id=? AND role='location'",mid);return {location_reference:location,categorization_complete:complete,sorting_status:location?'location':complete?'complete':count===0?'unassigned':count>1?'multiple':'pending'};}
  async function handle({p,req,body,json}){
    if(p!=='/api/media/bulk'||req.method!=='POST')return false;
    if(!Array.isArray(body.media_ids)||!body.media_ids.length||body.media_ids.length>1000||body.media_ids.some(v=>typeof v!=='string'))throw fail('Select between 1 and 1000 media items.');
    const ids=[...new Set(body.media_ids)];for(const mid of ids)if(!one('SELECT 1 FROM active_media WHERE id=?',mid))throw fail('A selected file is unavailable or removed. Refresh the page before retrying.',409);
    const operation=body.operation;if(!['assign','tags_add','tags_remove','complete','reopen','location','unlocation'].includes(operation))throw fail('Unknown bulk action.');
    let cids=[],tags=[];
    if(operation==='assign'){
      if(!Array.isArray(body.character_ids)||!body.character_ids.length||body.character_ids.some(v=>typeof v!=='string'))throw fail('Choose at least one character.');
      cids=[...new Set(body.character_ids)];for(const cid of cids)if(!one('SELECT 1 FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid))throw fail('Choose an existing active character.');
    }
    if(operation.startsWith('tags_')){if(typeof body.tags!=='string'||body.tags.length>2000)throw fail('Enter comma-separated tags (up to 2000 characters).');tags=[...new Map(tokens(body.tags).map(t=>[key(t),t])).values()];if(!tags.length)throw fail('Enter at least one tag.');}
    let updated=0,associations=0;
    transaction(()=>{for(const mid of ids){let changed=false;
      if(operation==='location'||operation==='unlocation'){const value=operation==='location';changed=details(mid).location_reference!==value;setLocation(mid,value);}
      else if(operation==='assign'){for(const cid of cids){const n=Number(run('INSERT OR IGNORE INTO depictions VALUES(?,?)',mid,cid).changes);associations+=n;changed=changed||n>0;}}
      else if(operation==='complete'||operation==='reopen'){const complete=operation==='complete';changed=details(mid).categorization_complete!==complete;setComplete(mid,complete);}
      else{
        const old=one('SELECT tags FROM media_notes WHERE media_id=?',mid)?.tags||'';const current=tokens(old);let next=old;
        if(operation==='tags_add'){const existing=new Set(current.map(key));const additions=tags.filter(t=>!existing.has(key(t)));if(additions.length)next=old+(old.trim()?', ':'')+additions.join(', ');}
        else{const removal=new Set(tags.map(key));const kept=current.filter(t=>!removal.has(key(t)));if(kept.length!==current.length)next=kept.join(', ');}
        if(next.length>2000)throw fail('One file would exceed the 2000-character tag limit. Use fewer tags.');
        changed=next!==old;if(changed)run('INSERT INTO media_notes(media_id,tags) VALUES(?,?) ON CONFLICT(media_id) DO UPDATE SET tags=excluded.tags',mid,next);
      }
      if(changed)updated++;
    }});
    json({selected:ids.length,updated,associations,operation});return true;
  }
  return {handle,details,setComplete,setLocation,locationSQL};
}
