import {promises as fs} from 'node:fs';
import path from 'node:path';
import {backup,DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {digest} from './character-edit.mjs';
import {installCharacterRename} from './character-rename.mjs';
import {createRenameFiles} from './character-rename-files.mjs';
const prefix='rename:v1:complete:';
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};

export function installCompleteCharacterRename(options){
  const {db,all,one,run,transaction,root,dataDir,isBusy=()=>false,characterPolicy}=options;
  let busy=false;
  const nested=fn=>{if(!db.isTransaction)return transaction(fn);const key='rename_'+randomUUID().replaceAll('-','');db.exec('SAVEPOINT '+key);try{const r=fn();db.exec('RELEASE '+key);return r;}catch(e){db.exec('ROLLBACK TO '+key+'; RELEASE '+key);throw e;}};
  const core=installCharacterRename({...options,transaction:nested,isBusy:()=>false}),files=createRenameFiles({root,db,all,one,run,transaction});
  const read=id=>{const row=one('SELECT value FROM application_settings WHERE key=?',prefix+id);if(!row)fail('NOT_FOUND','Nincs teljes átnevezési terv.',404);const p=JSON.parse(row.value);if(p.hash!==digest({core_hash:p.core_hash,folder:p.folder}))fail('PLAN_CORRUPT','Sérült átnevezési terv.');return p;};
  const write=(id,p)=>run('INSERT INTO application_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',prefix+id,JSON.stringify(p));
  function get(args,privateView=false){const c=core.get(args,privateView),p=read(c.plan_id);return {...c,plan_hash:p.hash,includes_character_folder:true,folder:{mode:p.folder.mode,source:p.folder.source,destination:p.folder.destination,file_count:p.folder.inventory.filter(r=>r[1]==='file').length},backup:p.backup??null,folder_operations:all("SELECT id,status,error FROM folder_changes WHERE json_extract(manifest_json,'$.character_rename')=1 AND json_extract(manifest_json,'$.plan_id')=? ORDER BY rowid",c.plan_id),result:c.result?{...c.result,folder:p.result?.folder??{destination:p.folder.destination}}:null};}
  function policy(cid,newName){const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)fail('NOT_FOUND','A karakter nem található.',404);characterPolicy?.assertProfile({...c,name:newName});}
  async function prepare(args){
    if(busy||isBusy())fail('BUSY','Más katalógusművelet fut.');
    const p=core.prepare(args),prior=one('SELECT value FROM application_settings WHERE key=?',prefix+p.plan_id);
    if(prior)return get({plan_id:p.plan_id});
    policy(p.character_id,p.new_name);const folder=await files.prepare(p.character_id,p.old_name,p.new_name),value={core_hash:p.plan_hash,folder};value.hash=digest(value);write(p.plan_id,value);return get({plan_id:p.plan_id});
  }
  async function prepareUndo(args){if(busy||isBusy())fail('BUSY','Más katalógusművelet fut.');const original=read(args.plan_id),p=core.prepareUndo(args);if(one('SELECT 1 FROM application_settings WHERE key=?',prefix+p.plan_id))return get({plan_id:p.plan_id});const folder=await files.reverse(original.folder,p.new_name),value={core_hash:p.plan_hash,folder};value.hash=digest(value);write(p.plan_id,value);return get({plan_id:p.plan_id});}
  async function verifiedBackup(){const dir=path.join(dataDir,'backups');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'before-complete-character-rename-'+randomUUID()+'.sqlite');await backup(db,file);const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_FAILED','Az átnevezés előtti mentés ellenőrzése sikertelen.');}finally{copy.close();}return file;}
  function safeSelection(id){let offset=0,items=[];do{const p=core.get({plan_id:id,offset});items.push(...p.items);offset=p.next_offset;}while(offset!==null);if(items.some(h=>h.editable&&['uncertain','other_person'].includes(h.classification)))fail('AMBIGUOUS_MATCH','Kétes szöveghivatkozás is van. A pontos kijelölést ellenőrizd az előnézetben.');return items.filter(h=>h.editable).map(h=>h.id);}
  async function decide(id,args,actor){
    if(busy||isBusy())fail('BUSY','Más katalógusművelet fut.');
    const p=read(id);if(args.plan_hash!==p.hash)fail('STALE_PLAN','Töltsd be a teljes előnézetet.');const coreArgs={...args,plan_hash:p.core_hash};
    const status=core.get({plan_id:id}).status;
    if(status!=='pending'||args.decision==='reject'){core.decide(id,coreArgs,actor);return get({plan_id:id});}
    policy(core.get({plan_id:id}).character_id,core.get({plan_id:id}).new_name);
    busy=true;
    try{
      await files.recover(p.folder,id);await files.validate(p.folder);p.backup=await verifiedBackup();write(id,p);
      const result=await files.execute(p.folder,id,()=>core.decide(id,coreArgs,actor));p.result=result;write(id,p);return get({plan_id:id});
    }finally{busy=false;}
  }
  async function applyApproved(args,actor){
    const {plan_id,plan_hash,selected_ids,confirmed_ids}=args;if(Object.keys(args).some(k=>!['plan_id','plan_hash','selected_ids','confirmed_ids'].includes(k)))fail('INVALID_ARGUMENT','Váratlan átnevezési mező.',400);
    const p=read(plan_id);if(plan_hash!==p.hash)fail('STALE_PLAN','Eltérő teljes átnevezési terv.');
    if(core.get({plan_id}).status==='applied')return get({plan_id});
    if(!actor)fail('HUMAN_REVIEW_REQUIRED','A pontos előnézet jóváhagyása szükséges.',403);
    return decide(plan_id,{plan_hash,decision:'approve',selected_ids:selected_ids??safeSelection(plan_id),confirmed_ids:confirmed_ids??[]},actor);
  }
  return {prepare,prepareUndo,get,decide,applyApproved,csrf:core.csrf,context:core.context,history:core.history,isBusy:()=>busy};
}
