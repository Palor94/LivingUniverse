import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createDispatcher} from '../mcp/http-gateway.mjs';
import {findNameMentions} from '../app/hungarian-names.mjs';

async function fixture({mode='trusted',organized=false,folder=true}={}){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-complete-rename-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
 if(organized){await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));await fs.mkdir(path.join(root,'10_CHARACTERS'));}
 const database=path.join(dataDir,'universe.sqlite'),writeConfig=path.join(dataDir,'mcp-writes.json'),config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'fixture@example.test',approval_mode:mode,database_id:databaseIdentity(database)},f={temp,root,dataDir,database,config,cid:randomUUID(),mid:randomUUID(),other:randomUUID(),organized};
 f.boot=async()=>{f.app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:false}});await new Promise(r=>f.app.server.listen(0,'127.0.0.1',r));f.base='http://127.0.0.1:'+f.app.server.address().port;await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:f.base}));f.writer=await createWriteClient({database,writeConfig});};
 f.stop=async()=>f.app.close();f.close=async()=>{await f.stop();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});};await f.boot();
 f.run=(s,...a)=>f.app.db.prepare(s).run(...a);f.one=(s,...a)=>f.app.db.prepare(s).get(...a);
 f.run('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)',f.cid,'Áron','Nem: férfi. Áronnal beszél. Áronhoz megy.',new Date().toISOString());
 f.run('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)',f.other,'Béla','Nem: férfi. Ismert társ.',new Date().toISOString());
 f.run('INSERT INTO relationships VALUES(?,?,?,?)',randomUUID(),f.other,f.cid,'Áronnal barátok.');
 f.old=organized?path.join('10_CHARACTERS','Áron'):'Áron';f.next=organized?path.join('10_CHARACTERS','Ábel'):'Ábel';
 if(folder){await fs.mkdir(path.join(root,f.old,'nested'),{recursive:true});await fs.writeFile(path.join(root,f.old,'nested','x.png'),'unchanged fixture image bytes');await fs.writeFile(path.join(root,f.old,'companion.txt'),'uncatalogued companion');f.run('INSERT INTO sorted_folders VALUES(?,?)',f.old,f.cid);f.run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',f.mid,path.join(f.old,'nested','x.png'),f.old,'image',29,null,new Date().toISOString());f.run('INSERT INTO depictions VALUES(?,?)',f.mid,f.cid);f.run('INSERT INTO canon VALUES(?,?,?,?,?,?,?)',randomUUID(),f.cid,null,'Preserved approved appearance',JSON.stringify([{media_id:f.mid,role:'general',sha256:createHash('sha256').update('unchanged fixture image bytes').digest('hex')}]),'Original approval',new Date().toISOString());}
 f.prepare=()=>f.app.characterRename.prepare({request_key:randomUUID(),character_id:f.cid,new_name:'Ábel'});
 f.apply=p=>f.app.characterRename.applyApproved({plan_id:p.plan_id,plan_hash:p.plan_hash},'fixture-human');
 f.call=async(name,args)=>(await f.writer.call(name,args)).data;
 return f;
}

test('one trusted MCP request renames primary name, Hungarian references and owned organized folder, retaining IDs, canon and bytes',async()=>{
 const f=await fixture({organized:true});try{
  const canon=f.one('SELECT * FROM canon'),args={request_key:'complete_rename_01',character_id:f.cid,new_name:'Ábel'},result=await f.call('rename_character',args);
  assert.equal(result.status,'applied');assert.equal(result.result.folder.destination,f.next);assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Ábel');assert.match(f.one('SELECT biography FROM characters WHERE id=?',f.cid).biography,/Ábellel.*Ábelhez/);
  assert.equal(f.one('SELECT description FROM relationships').description,'Ábellel barátok.');assert.equal(f.one('SELECT target_id FROM relationships').target_id,f.cid);assert.match(f.one('SELECT aliases FROM characters WHERE id=?',f.cid).aliases,/Áron/);
  assert.equal(await fs.readFile(path.join(f.root,f.next,'nested','x.png'),'utf8'),'unchanged fixture image bytes');assert.equal(await fs.readFile(path.join(f.root,f.next,'companion.txt'),'utf8'),'uncatalogued companion');await assert.rejects(fs.stat(path.join(f.root,f.old)));
  assert.equal(f.one('SELECT relative_path FROM media WHERE id=?',f.mid).relative_path,path.join(f.next,'nested','x.png'));assert.equal(f.one('SELECT character_id FROM sorted_folders WHERE folder=?',f.next).character_id,f.cid);assert.deepEqual(f.one('SELECT * FROM canon'),canon);assert.ok((await fs.stat(result.backup)).isFile());
  assert.equal((await f.call('rename_character',args)).plan_id,result.plan_id);assert.equal(f.one('SELECT COUNT(*) n FROM folder_changes').n,1);
  await f.stop();await f.boot();assert.equal((await f.call('rename_character',args)).plan_id,result.plan_id);
  const undone=await f.call('undo_character_rename',{plan_id:result.plan_id,request_key:'complete_undo_01'});assert.equal(undone.status,'applied');assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');assert.equal(await fs.readFile(path.join(f.root,f.old,'nested','x.png'),'utf8'),'unchanged fixture image bytes');assert.deepEqual(f.one('SELECT * FROM canon'),canon);
 }finally{await f.close();}
});

test('explicit preview and review mode leave domain records and OneDrive folders unchanged',async()=>{
 for(const mode of ['trusted','review']){const f=await fixture({mode});try{
  const p=await f.call('rename_character',{request_key:'preview_complete_01',character_id:f.cid,new_name:'Ábel',preview_only:mode==='trusted'});assert.equal(p.status,'pending');assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');assert.ok((await fs.stat(path.join(f.root,f.old))).isDirectory());
  if(mode==='review')await assert.rejects(f.call('apply_approved_character_rename',{plan_id:p.plan_id,plan_hash:p.plan_hash}),{code:'HUMAN_REVIEW_REQUIRED'});
  const r=await fetch(f.base+'/api/character-renames/'+p.plan_id+'/decision',{method:'PUT',headers:{'Content-Type':'application/json',Origin:f.base,'X-LU-Rename-CSRF':f.app.characterRename.csrf},body:JSON.stringify({plan_hash:p.plan_hash,decision:'reject'})});assert.equal(r.status,200);assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');
 }finally{await f.close();}}
});

test('folder and name/alias collisions cannot partially rename or overwrite data',async()=>{
 const f=await fixture();try{
  await fs.mkdir(path.join(f.root,f.next));await fs.writeFile(path.join(f.root,f.next,'keep.txt'),'keep');await assert.rejects(f.prepare(),{code:'FOLDER_COLLISION'});assert.equal(await fs.readFile(path.join(f.root,f.next,'keep.txt'),'utf8'),'keep');assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');
  f.run('UPDATE characters SET aliases=? WHERE id=?','Ábel',f.other);await assert.rejects(f.prepare(),{code:'NAME_COLLISION'});
 }finally{await f.close();}
});

test('failure after physical rename rolls every selected database edit back and restores original directory',async()=>{
 const f=await fixture();try{
  const p=await f.prepare();f.app.db.exec("CREATE TRIGGER fail_rename BEFORE UPDATE ON relationships BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END;");
  await assert.rejects(f.apply(p),/synthetic rollback/);assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');assert.equal(f.one('SELECT relative_path FROM media').relative_path,path.join(f.old,'nested','x.png'));assert.ok((await fs.stat(path.join(f.root,f.old))).isDirectory());await assert.rejects(fs.stat(path.join(f.root,f.next)));assert.equal(f.one('SELECT status FROM folder_changes').status,'failed_rolled_back');assert.equal(f.app.characterRename.get({plan_id:p.plan_id}).status,'pending');
 }finally{await f.close();}
});

test('stale file content or catalogue changes refuse the whole operation; later edits block undo',async()=>{
 const f=await fixture();try{
  let p=await f.prepare();await fs.writeFile(path.join(f.root,f.old,'new.txt'),'new');await assert.rejects(f.apply(p),{code:'STALE_FOLDER'});assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');
  p=await f.prepare();f.run('UPDATE characters SET notes=? WHERE id=?','later note',f.cid);await assert.rejects(f.apply(p),{code:'STALE_PLAN'});assert.ok((await fs.stat(path.join(f.root,f.old))).isDirectory());
  p=await f.prepare();await f.apply(p);f.run('UPDATE characters SET notes=? WHERE id=?','newer note',f.cid);await assert.rejects(f.app.characterRename.prepareUndo({plan_id:p.plan_id,request_key:'later_undo_01'}),{code:'UNDO_CONFLICT'});
 }finally{await f.close();}
});

test('no existing character folder creates an ID-owned folder without moving shared originals',async()=>{
 const f=await fixture({organized:true,folder:false});try{
  await fs.mkdir(path.join(f.root,'20_SHARED_MEDIA','Unassigned'),{recursive:true});await fs.writeFile(path.join(f.root,'20_SHARED_MEDIA','Unassigned','shared.png'),'shared bytes');
  const p=await f.prepare();assert.equal(p.folder.mode,'create');const result=await f.apply(p);assert.equal(result.status,'applied');assert.ok((await fs.stat(path.join(f.root,f.next))).isDirectory());assert.equal(await fs.readFile(path.join(f.root,'20_SHARED_MEDIA','Unassigned','shared.png'),'utf8'),'shared bytes');
  const undo=await f.app.characterRename.prepareUndo({plan_id:p.plan_id,request_key:'created_folder_undo'});await f.app.characterRename.applyApproved({plan_id:undo.plan_id,plan_hash:undo.plan_hash},'fixture-human');assert.ok((await fs.stat(path.join(f.root,f.old))).isDirectory());
 }finally{await f.close();}
});

test('interrupted physical move is reconciled from its durable journal before an identical retry',async()=>{
 const f=await fixture();try{
  const p=await f.prepare(),record=JSON.parse(f.one('SELECT value FROM application_settings WHERE key=?','rename:v1:complete:'+p.plan_id).value),at=new Date().toISOString();
  f.run('INSERT INTO folder_changes VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),f.cid,f.old,f.next,'rename_moved',JSON.stringify({character_rename:true,plan_id:p.plan_id,plan:record.folder,stage:null}),null,at,at);await fs.rename(path.join(f.root,f.old),path.join(f.root,f.next));
  const result=await f.apply(p);assert.equal(result.status,'applied');assert.equal(f.one('SELECT COUNT(*) n FROM folder_changes WHERE status=?','failed_rolled_back').n,1);assert.equal(await fs.readFile(path.join(f.root,f.next,'nested','x.png'),'utf8'),'unchanged fixture image bytes');
 }finally{await f.close();}
});

test('uncertain other-profile references require selection before any trusted name or filesystem write',async()=>{
 const f=await fixture();try{
  f.run('UPDATE characters SET biography=? WHERE id=?','Nem: férfi. Áronnal találkozik.',f.other);const p=await f.call('rename_character',{request_key:'ambiguous_full_01',character_id:f.cid,new_name:'Ábel'});assert.equal(p.status,'pending');assert.equal(p.requires_selection,true);assert.equal(f.one('SELECT name FROM characters WHERE id=?',f.cid).name,'Áron');assert.ok((await fs.stat(path.join(f.root,f.old))).isDirectory());
 }finally{await f.close();}
});

test('HTTP dispatcher discovers full-rename tools and CSRF/bearer boundaries remain enforced',async()=>{
 const f=await fixture();let reader;try{
  reader=await createCatalogue({database:f.database,mediaRoot:f.root});const dispatch=createDispatcher({catalogue:reader,refreshWriter:async()=>f.writer}),listed=await dispatch({jsonrpc:'2.0',id:1,method:'tools/list'});assert.ok(listed.result.tools.some(t=>t.name==='rename_character'));
  assert.equal((await fetch(f.base+'/api/mcp-rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'prepare',arguments:{}})})).status,403);
  const p=await f.prepare();assert.equal((await fetch(f.base+'/api/character-renames/'+p.plan_id+'/decision',{method:'PUT',headers:{'Content-Type':'application/json',Origin:f.base},body:JSON.stringify({plan_hash:p.plan_hash,decision:'approve'})})).status,403);
  assert.equal(findNameMentions('Áronnal és Áronhoz','Áron','Ábel').map(v=>v.after).join(','),'Ábellel,Ábelhez');
 }finally{reader?.close();await f.close();}
});
