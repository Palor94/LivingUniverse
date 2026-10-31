import {readFileSync,promises as fs} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import path from 'node:path';

export async function backupBeforeNoteTagsMigration(db,dataDir){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='tag_localizations'").get()||!db.prepare("SELECT 1 FROM sqlite_master WHERE name='structured_tags'").get())return null;
  const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'before-note-hashtags-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});
  try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Hashtag pre-migration backup verification failed.');}finally{copy.close();}
  return file;
}

// Accents remain significant. Spaces, underscores and hyphens are word separators.
export const hashtagKey=value=>value.normalize('NFC').trim().toLocaleLowerCase('hu').replace(/[\s_-]+/gu,' ').trim();
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function extractHashtags(notes){
  const found=new Map();
  // Avoid fragments of URLs, emails, escaped hashes and words; accept Unicode marks.
  const pattern=/(^|[\s([{,;!?])#([\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*)/gu;
  for(const match of notes.matchAll(pattern)){
    const token=match[2].normalize('NFC');
    if(token.length>100)continue;
    const key=hashtagKey(token);if(!found.has(key))found.set(key,token);
  }
  return [...found].map(([key,token])=>({key,token}));
}

const translations={
  'group-reference-face':['Arc','face'], 'group-reference-body':['Test','body'],
  'group-reference-detail':['Részlet','detail'], 'group-reference-general':['Általános','general'],
  'group-angle-frontal':['Szemből','frontal'], 'group-angle-profile':['Profil','profile'],
  'group-angle-three-quarter':['Háromnegyed nézet','three-quarter'], 'group-angle-rear':['Hátulról','rear'],
  'group-framing-portrait':['Portré','portrait'], 'group-framing-upper body':['Felsőtest','upper body'],
  'group-framing-full body':['Teljes alak','full body'], 'group-expression-neutral':['Semleges','neutral'],
  'group-expression-smiling':['Mosolygó','smiling'], 'group-expression-angry':['Dühös','angry'],
  'group-expression-tired':['Fáradt','tired']
};

export function installNoteTags({db,all,one,run,transaction,fail,validateMedia,validateTags}){
  function seed(){
    for(const [id,[hu,en]] of Object.entries(translations)){
      // Never translate a user-renamed vocabulary entry by its old seed ID.
      if(one('SELECT 1 FROM structured_tags WHERE id=? AND name=?',id,en))
        run('INSERT OR IGNORE INTO tag_localizations VALUES(?,?,?)',id,hu,en);
    }
  }
  transaction(()=>{db.exec(readFileSync(new URL('./migrations/021-note-hashtags.up.sql',import.meta.url),'utf8'));seed();});
  function vocabulary(){
    const aliases=new Map();for(const a of all('SELECT tag_id,language,alias,alias_key FROM tag_aliases ORDER BY alias_key')){
      const rows=aliases.get(a.tag_id)||[];rows.push({language:a.language,alias:a.alias,alias_key:a.alias_key});aliases.set(a.tag_id,rows);
    }
    return all(`SELECT t.*,l.hu_name,l.en_name,
      EXISTS(SELECT 1 FROM locations p WHERE p.tag_id=t.id) exact_location
      FROM structured_tags t LEFT JOIN tag_localizations l ON l.tag_id=t.id ORDER BY t.id`)
      .map(t=>({...t,aliases:aliases.get(t.id)||[]}));
  }
  function matcher(vocab){
    const index=new Map();for(const t of vocab)for(const value of [t.id,t.name,t.hu_name||'',t.en_name||'',...t.aliases.map(a=>a.alias)]){
      const key=hashtagKey(value);if(!key)continue;const entries=index.get(key)||new Map();entries.set(t.id,t);index.set(key,entries);
    }
    return notes=>extractHashtags(notes).map(({key,token})=>{
      const candidates=[...(index.get(key)?.values()||[])];
      const descriptive=candidates.filter(t=>!t.exact_location);
      const status=candidates.length===1&&descriptive.length===1?'matched':candidates.length===0?'unknown':descriptive.length===0?'location':'ambiguous';
      return {key,token,status,tag_id:status==='matched'?descriptive[0].id:null,candidate_ids:candidates.map(t=>t.id)};
    });
  }
  function match(notes,vocab=vocabulary()){return matcher(vocab)(notes);}
  function preview(ids,notes){
    ids=validateMedia(ids).sort();
    if(notes!==undefined&&(ids.length!==1||typeof notes!=='string'||notes.length>30000))throw fail('Preview one note of at most 30000 characters.');
    const vocab=vocabulary(),resolve=matcher(vocab),items=ids.map(media_id=>{
      const text=notes??one('SELECT notes FROM media_notes WHERE media_id=?',media_id)?.notes??'';
      return {media_id,notes_hash:digest(text),matches:resolve(text),existing:all('SELECT tag_id FROM media_tags WHERE media_id=? ORDER BY tag_id',media_id).map(t=>t.tag_id),proposals:all('SELECT * FROM note_tag_proposals WHERE media_id=? ORDER BY token_key',media_id)};
    });
    return {items,preview_hash:digest({vocab,items}),draft:notes!==undefined};
  }
  // This helper runs inside the caller's save transaction; it never opens one.
  function applyItems(items,source){
    const id=randomUUID();let added=0,proposed=0,changed=0;
    run('INSERT INTO note_tag_runs VALUES(?,?,?,?)',id,source,'applied',new Date().toISOString());
    for(const item of items){
      const desired=new Map();
      for(const m of item.matches){
        if(m.status==='matched'){
          if(Number(run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',item.media_id,m.tag_id).changes)){
            run('INSERT INTO note_tag_links VALUES(?,?,?)',item.media_id,m.tag_id,id);added++;
          }
        }else desired.set(m.key,{media_id:item.media_id,token_key:m.key,token:m.token,reason:m.status});
      }
      const prior=new Map(item.proposals.map(p=>[p.token_key,p]));
      for(const key of new Set([...prior.keys(),...desired.keys()])){
        const before=prior.get(key)||null,after=desired.get(key)||null;
        if(JSON.stringify(before)===JSON.stringify(after))continue;
        run('INSERT INTO note_tag_proposal_changes VALUES(?,?,?,?,?)',id,item.media_id,key,JSON.stringify(before),JSON.stringify(after));
        run('DELETE FROM note_tag_proposals WHERE media_id=? AND token_key=?',item.media_id,key);
        if(after){run('INSERT INTO note_tag_proposals VALUES(?,?,?,?)',after.media_id,key,after.token,after.reason);proposed++;}
        changed++;
      }
    }
    if(!added&&!changed){run('DELETE FROM note_tag_runs WHERE id=?',id);return {run_id:null,added:0,proposed:0};}
    return {run_id:id,added,proposed};
  }
  function extract(mid){return applyItems(preview([mid]).items,'note-save');}
  function rollback(id){
    return transaction(()=>{
      const receipt=one('SELECT * FROM note_tag_runs WHERE id=?',id);if(!receipt)throw fail('Extraction run not found.',404);
      if(receipt.status==='rolled_back')return {removed:0,restored:0,conflicts:0,already_rolled_back:true};
      let removed=0,restored=0,conflicts=0;
      for(const link of all('SELECT * FROM note_tag_links WHERE run_id=?',id))removed+=Number(run('DELETE FROM media_tags WHERE media_id=? AND tag_id=?',link.media_id,link.tag_id).changes);
      for(const change of all('SELECT * FROM note_tag_proposal_changes WHERE run_id=?',id)){
        const current=one('SELECT * FROM note_tag_proposals WHERE media_id=? AND token_key=?',change.media_id,change.token_key)||null;
        if(JSON.stringify(current)!==change.after_json){conflicts++;continue;}
        run('DELETE FROM note_tag_proposals WHERE media_id=? AND token_key=?',change.media_id,change.token_key);
        const before=JSON.parse(change.before_json);if(before)run('INSERT INTO note_tag_proposals VALUES(?,?,?,?)',before.media_id,before.token_key,before.token,before.reason);
        restored++;
      }
      run("UPDATE note_tag_runs SET status='rolled_back' WHERE id=?",id);return {removed,restored,conflicts};
    });
  }
  function languageVersion(id){
    const entry=vocabulary().find(t=>t.id===id);if(!entry)throw fail('Tag not found.',404);return digest(entry);
  }
  function saveLanguage(body,{inTransaction=false}={}){
    const tid=validateTags([body.tag_id])[0];
    const text=v=>{if(typeof v!=='string'||v.trim().length>100||/[\x00-\x1f\x7f#]/u.test(v))throw fail('Use labels of at most 100 characters without #.');return v.trim().normalize('NFC');};
    const hu=text(body.hu_name),en=text(body.en_name);
    if(!hu||!en)throw fail('Supply a Hungarian display name and an English equivalent.');
    if(!Array.isArray(body.aliases)||body.aliases.length>100)throw fail('Supply at most 100 aliases.');
    const aliases=new Map();for(const entry of body.aliases){if(!entry||!['hu','en','und'].includes(entry.language))throw fail('Choose hu, en or und for aliases.');const alias=text(entry.alias);if(!alias)throw fail('Empty alias.');aliases.set(hashtagKey(alias),{alias,language:entry.language});}
    const save=()=>{
      if(body.expected_version!==languageVersion(tid))throw fail('Vocabulary changed. Review the tag again.',409);
      const own=one('SELECT * FROM structured_tags WHERE id=?',tid),keys=new Set([own.name,hu,en,...aliases.values()].map(v=>hashtagKey(typeof v==='string'?v:v.alias)));
      for(const other of vocabulary())if(other.id!==tid&&other.group_id===own.group_id&&[other.name,other.hu_name||'',other.en_name||'',...other.aliases.map(a=>a.alias)].some(v=>keys.has(hashtagKey(v))))throw fail('This name or alias already belongs to a tag in this group.',409);
      run('INSERT INTO tag_localizations VALUES(?,?,?) ON CONFLICT(tag_id) DO UPDATE SET hu_name=excluded.hu_name,en_name=excluded.en_name',tid,hu,en);
      run('DELETE FROM tag_aliases WHERE tag_id=?',tid);for(const [key,a] of aliases)run('INSERT INTO tag_aliases VALUES(?,?,?,?)',tid,a.language,a.alias,key);
      return {tag_id:tid,version:languageVersion(tid)};
    };return inTransaction?save():transaction(save);
  }
  function duplicate(group,key,id){return vocabulary().find(t=>t.group_id===group&&t.id!==id&&[t.name,t.hu_name||'',t.en_name||'',...t.aliases.map(a=>a.alias)].some(v=>hashtagKey(v)===hashtagKey(key)));}
  const tables=['note_tag_proposal_changes','note_tag_links','note_tag_proposals','note_tag_runs','tag_aliases','tag_localizations'];
  function checkRestore(body){if(tables.some(t=>body[t]!==undefined)&&tables.some(t=>!Array.isArray(body[t])))throw fail('Incomplete note-tag backup. Restore all six hashtag tables together.');}
  function validateRestore(){
    const validText=value=>typeof value==='string'&&value.length<=100&&!/[\x00-\x1f\x7f#]/u.test(value);
    for(const row of all('SELECT * FROM tag_localizations'))if(!validText(row.hu_name)||!validText(row.en_name))throw fail('Invalid localized tag in backup.');
    for(const row of all('SELECT * FROM tag_aliases'))if(!validText(row.alias)||!row.alias.trim()||row.alias_key!==hashtagKey(row.alias))throw fail('Invalid tag alias in backup.');
    const proposalValid=p=>p&&typeof p.media_id==='string'&&typeof p.token_key==='string'&&validText(p.token)&&p.token.trim()&&p.token_key===hashtagKey(p.token)&&['unknown','ambiguous','location'].includes(p.reason);
    for(const row of all('SELECT * FROM note_tag_proposals'))if(!proposalValid(row))throw fail('Invalid note-tag proposal in backup.');
    for(const row of all('SELECT * FROM note_tag_proposal_changes'))for(const field of ['before_json','after_json']){
      let value;try{value=JSON.parse(row[field]);}catch{throw fail('Invalid extraction journal in backup.');}
      if(value!==null&&(!proposalValid(value)||value.media_id!==row.media_id||value.token_key!==row.token_key))throw fail('Invalid extraction journal in backup.');
    }
    if(one("SELECT 1 FROM note_tag_links l JOIN note_tag_runs r ON r.id=l.run_id WHERE r.status<>'applied' LIMIT 1"))throw fail('Invalid extraction ownership in backup.');
  }
  function clearRestore(){for(const t of tables)run('DELETE FROM '+t);}
  async function handle({p,body,req,json}){
    if(p==='/api/taxonomy/language'&&req.method==='POST'){json(saveLanguage(body));return true;}
    if(p==='/api/taxonomy/notes/preview'&&req.method==='POST'){json(preview(body.media_ids,body.notes));return true;}
    if(p==='/api/taxonomy/notes/apply'&&req.method==='POST'){
      json(transaction(()=>{const plan=preview(body.media_ids);if(body.preview_hash!==plan.preview_hash)throw fail('Notes, labels or locations changed. Preview again.',409);return applyItems(plan.items,'reviewed-backfill');}));return true;
    }
    if(p==='/api/taxonomy/notes/rollback'&&req.method==='POST'){if(typeof body.run_id!=='string')throw fail('Choose an extraction run.');json(rollback(body.run_id));return true;}
    if(p==='/api/taxonomy/notes/review'&&req.method==='GET'){
      json({proposals:all('SELECT p.* FROM note_tag_proposals p JOIN active_media m ON m.id=p.media_id ORDER BY p.media_id,p.token_key LIMIT 1000'),runs:all('SELECT * FROM note_tag_runs ORDER BY rowid DESC LIMIT 100')});return true;
    }
    return false;
  }
  return {handle,match,preview,extract,vocabulary,languageVersion,saveLanguage,duplicate,clearRestore,checkRestore,validateRestore,seed};
}
