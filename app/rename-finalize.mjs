// Final, irreversible rename (owner decision 2026-11-10): after a character rename is applied,
// the old name is removed from every record, history included — canon versions, story-event
// versions, memory and level logs, the file-move journal, generation manifests, Szellemprofil
// history, every location-tree revision — and the rename's own plan, audit and undo records
// are deleted. There is no undo. The verified pre-rename database backup is kept as the only
// way back from a failed rename.
// Never touched: real file-path columns (the files themselves were already moved), hashes,
// tokens and secrets (a changed generation manifest gets its hash recomputed).
import {createHash} from 'node:crypto';
import {renameText,overlappingNames} from './rename-play-extras.mjs';

const q=s=>'"'+String(s).replaceAll('"','""')+'"';
const SKIP_COLUMN=/sha256|_hash$|_token|password|secret|data_url/i;
// Columns that point at real files or folders on disk.
// They follow only when the file itself moved (rename-play-extras relink), never as bare text.
const REAL_PATH={media:['relative_path','folder'],sorted_folders:['folder'],character_sprites:['relative_path'],
  media_hidden:['original_path'],locations:['folder'],scan_candidates:['folder'],world_review_sources:['source_path'],
  // Names are set by the rename itself; aliases are handled separately.
  characters:['name','aliases']};

export function createRenameFinalizer({all,one,run,transaction,canvas=null}){
  function rewrite(value,oldName,newName,others=[]){
    const text=String(value);
    if(/^[\[{]/.test(text.trim())){
      try{const json=JSON.parse(text);let changed=false;
        const walk=v=>{if(typeof v==='string'){const n=renameText(v,oldName,newName,others);if(n!==v)changed=true;return n;}if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));return v;};
        const next=walk(json);return changed?JSON.stringify(next):text;}catch{}
    }
    return renameText(text,oldName,newName,others);
  }
  // Every text in every table (history included), except real file paths and secrets.
  function scrub(oldName,newName,others=[]){
    const stats={rows:0,tables:{},errors:[]};
    transaction(()=>{
      for(const {name:table} of all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")){
        const cols=all('PRAGMA table_info('+q(table)+')'),pk=cols.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);if(!pk.length)continue;
        const textCols=cols.map(c=>c.name).filter(c=>!pk.includes(c)&&!SKIP_COLUMN.test(c)&&!(REAL_PATH[table]||[]).includes(c));if(!textCols.length)continue;
        for(const row of all('SELECT * FROM '+q(table))){
          if(table==='application_settings'&&String(row.key).startsWith('rename:v1:'))continue;
          const changes={};
          for(const c of textCols){const v=row[c];if(typeof v!=='string'||!v)continue;const next=rewrite(v,oldName,newName,others);if(next!==v)changes[c]=next;}
          if(!Object.keys(changes).length)continue;
          if(table==='image_generation_runs'&&changes.manifest_json)changes.manifest_hash=createHash('sha256').update(changes.manifest_json).digest('hex');
          try{run('UPDATE '+q(table)+' SET '+Object.keys(changes).map(k=>q(k)+'=?').join(',')+' WHERE '+pk.map(k=>q(k)+' IS ?').join(' AND '),...Object.values(changes),...pk.map(k=>row[k]));stats.rows++;stats.tables[table]=(stats.tables[table]||0)+1;}
          catch(e){stats.errors.push({table,error:e.message});}
        }
      }
    });
    return stats;
  }
  // The rename's own plan, audit, request and undo records.
  function forget(planId){
    let removed=0;
    for(const key of ['rename:v1:plan:'+planId,'rename:v1:complete:'+planId,'rename:v1:undone:'+planId])removed+=Number(run('DELETE FROM application_settings WHERE key=?',key).changes);
    for(const r of all("SELECT key,value FROM application_settings WHERE key LIKE 'rename:v1:audit:%' OR key LIKE 'rename:v1:request:%'")){
      let v={};try{v=JSON.parse(r.value);}catch{}
      if(v.plan_id===planId||v.id===planId)removed+=Number(run('DELETE FROM application_settings WHERE key=?',r.key).changes);
    }
    return removed;
  }
  async function finalize({planId,characterId,oldName,newName}){
    // Other characters' names that contain the old name stay untouched; only unambiguous
    // mentions change (owner decision 2026-11-11, replaces skipping the whole history).
    const others=overlappingNames(all,characterId,oldName);
    // The old name never stays behind as an alias.
    const c=one('SELECT aliases FROM characters WHERE id=?',characterId);
    if(c){const kept=String(c.aliases||'').split(/[,;\n]/u).map(v=>v.trim()).filter(v=>v&&v.toLocaleLowerCase('hu')!==oldName.toLocaleLowerCase('hu')).join('; ');if(kept!==c.aliases)run('UPDATE characters SET aliases=? WHERE id=?',kept,characterId);}
    const history={...scrub(oldName,newName,others),protected_names:others};
    const tree=canvas?await canvas.scrubHistory(oldName,newName,others):null;
    return {final:true,history,tree,removed_rename_records:forget(planId)};
  }
  return {finalize,scrub,forget};
}
