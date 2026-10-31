import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {installMediaImports} from '../app/media-imports.mjs';
import {Readable} from 'node:stream';
import {deleteSelectedImage} from '../app/public/permanent-media-delete.js';

const jpeg=Buffer.from('ffd8ffc0000b080001000101011100ffd9','hex');
function bitmap(){const b=Buffer.alloc(58);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(1,18);b.writeInt32LE(1,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);return b;}
const exists=p=>fs.lstat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
async function fixture(fn,options={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-permanent-delete-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);let app,base;
  const start=async(directory=dataDir,extra={})=>{app=await createApp({root,dataDir:directory,mobile:{enabled:false},mediaAnalysisTestOptions:{availability:async()=> 'local',decode:async()=>({type:'image',mimeType:'image/jpeg',data:jpeg.toString('base64')})},...options,...extra});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;};
  const request=async(route,body,headers)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const call=async(...args)=>{const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;};
  const image=async(name=randomUUID()+'.bmp')=>{const id=randomUUID();await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bitmap());app.db.prepare("INSERT INTO media VALUES(?,?,'','image',58,'now','now')").run(id,name);return {id,name,file:path.join(root,name),kind:'image'};};
  const cap=id=>call('/api/media/'+id+'/permanent-delete');
  const erase=async(id,capability)=>{const c=capability||await cap(id);return request('/api/media/'+id+'/permanent-delete',{expected_version:c.version},{Origin:base,'X-LU-Delete-CSRF':c.csrf});};
  await start();try{await fn({temp,root,dataDir,app:()=>app,call,request,image,cap,erase,base:()=>base,restart:async(directory=dataDir,extra={})=>{await app.close();await start(directory,extra);}});}finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('lu-permanent-delete-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('one selected image is physically and relationally deleted for every character, without changing another image or canon',()=>fixture(async({image,app,erase,call})=>{
  const m=await image(),other=await image(),db=app().db,a=randomUUID(),b=randomUUID();
  for(const [id,name]of [[a,'A'],[b,'B']])db.prepare("INSERT INTO characters(id,name,cover_id,created_at) VALUES(?,?,?,'now')").run(id,name,m.id);
  for(const cid of [a,b])db.prepare('INSERT INTO depictions VALUES(?,?)').run(m.id,cid);
  db.prepare('INSERT INTO depictions VALUES(?,?)').run(other.id,a);
  db.prepare("INSERT INTO media_notes VALUES(?,'tags','private note')").run(m.id);
  const tag=db.prepare('SELECT id FROM structured_tags LIMIT 1').get().id;db.prepare('INSERT INTO media_tags VALUES(?,?)').run(m.id,tag);
  db.prepare("INSERT INTO media_categorization VALUES(?,1,'now')").run(m.id);db.prepare("INSERT INTO media_roles VALUES(?,'location','now')").run(m.id);
  db.prepare("INSERT INTO character_ui(character_id,cover_crop) VALUES(?,?)").run(a,JSON.stringify({media_id:m.id,x:0,y:0,w:1,h:1}));
  const beforeOther=await call('/api/media/'+other.id),canonBefore=db.prepare('SELECT * FROM canon').all(),result=await erase(m.id);
  assert.equal(result.status,200);assert.equal(result.data.complete,true);assert.equal(await exists(m.file),false);assert.equal(await exists(other.file),true);
  assert.equal(db.prepare('SELECT * FROM media WHERE id=?').get(m.id),undefined);
  for(const table of ['depictions','media_notes','media_tags','media_categorization','media_roles'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE media_id=?').get(m.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM characters WHERE cover_id=?').get(m.id).n,0);assert.equal(db.prepare('SELECT cover_crop FROM character_ui WHERE character_id=?').get(a).cover_crop,null);
  assert.deepEqual(await call('/api/media/'+other.id),beforeOther);assert.deepEqual(db.prepare('SELECT * FROM canon').all(),canonBefore);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}));

test('approved references in any canonical revision are protected before filesystem changes',()=>fixture(async({image,app,cap,erase})=>{
  const m=await image(),db=app().db,c=randomUUID();db.prepare("INSERT INTO characters(id,name,created_at) VALUES(?,'Protected','now')").run(c);
  const first=randomUUID();db.prepare("INSERT INTO canon VALUES(?,?,NULL,'Approved',?,'','now')").run(first,c,JSON.stringify([{media_id:m.id,role:'face'}]));
  db.prepare("INSERT INTO canon VALUES(?,?,?,'Later','[]','','now')").run(randomUUID(),c,first);
  const capability=await cap(m.id);assert.equal(capability.protected,true);const result=await erase(m.id,capability);assert.equal(result.status,409);assert.equal(result.data.code,'CANON_REFERENCE_PROTECTED');assert.equal(await exists(m.file),true);assert.equal(db.prepare('SELECT COUNT(*) n FROM media').get().n,1);
}));

test('filesystem failure never claims full deletion and an explicit retry completes safely',()=>{
  let fail=true;return fixture(async({image,app,cap,erase})=>{
    const m=await image(),c=await cap(m.id),first=await erase(m.id,c);assert.equal(first.status,409);assert.equal(first.data.complete,false);assert.equal(await exists(m.file),true);assert.ok(app().db.prepare('SELECT id FROM media WHERE id=?').get(m.id));
    fail=false;assert.equal((await erase(m.id,c)).data.complete,true);assert.equal(await exists(m.file),false);assert.equal((await erase(m.id,c)).data.already_deleted,true);
  },{permanentDeleteTestOptions:{unlink:async file=>{if(fail)throw Object.assign(Error('Locked file'),{code:'EACCES'});await fs.unlink(file);}}});
});

test('a database failure after unlink remains partial, survives restart, and retries without resurrecting the image',()=>fixture(async({image,app,erase,cap,restart})=>{
  const m=await image(),c=await cap(m.id),result=await erase(m.id,c);assert.equal(result.status,409);assert.equal(result.data.complete,false);assert.equal(result.data.partial,true);assert.equal(await exists(m.file),false);assert.ok(app().db.prepare('SELECT id FROM media WHERE id=?').get(m.id));
  await restart(undefined,{permanentDeleteTestOptions:{}});assert.equal((await cap(m.id)).incomplete,true);assert.equal((await erase(m.id)).data.complete,true);assert.equal(app().db.prepare('SELECT id FROM media WHERE id=?').get(m.id),undefined);
},{permanentDeleteTestOptions:{beforeFinalize:()=>{throw Error('Simulated database boundary failure');}}}));

test('all paths and database constraints are checked before deletion; symlinks, app folders and stale media are refused',()=>fixture(async({image,app,erase,cap,root,temp})=>{
  const m=await image(),db=app().db,c=await cap(m.id);db.prepare("UPDATE media SET modified_at='changed' WHERE id=?").run(m.id);assert.equal((await erase(m.id,c)).data.code,'STALE_MEDIA');assert.equal(await exists(m.file),true);
  db.prepare('CREATE TABLE future_media_links(media_id TEXT REFERENCES media(id))').run();db.prepare('INSERT INTO future_media_links VALUES(?)').run(m.id);assert.equal((await erase(m.id)).data.complete,false);assert.equal(await exists(m.file),true);db.exec('DROP TABLE future_media_links');
  const reserved=await image('app/code.png');assert.equal((await erase(reserved.id)).data.code,'UNSAFE_PATH');assert.equal(await exists(reserved.file),true);
  db.prepare("UPDATE media SET relative_path='../outside.bmp' WHERE id=?").run(m.id);assert.equal((await erase(m.id)).data.code,'UNSAFE_PATH');
  const outside=path.join(temp,'outside');await fs.mkdir(outside);const source=path.join(outside,'keep.bmp');await fs.writeFile(source,bitmap());await fs.symlink(outside,path.join(root,'linked'),'junction');db.prepare("UPDATE media SET relative_path='linked/keep.bmp' WHERE id=?").run(m.id);assert.equal((await erase(m.id)).data.code,'UNSAFE_PATH');assert.equal(await exists(source),true);
}));

test('authentication, cross-origin requests, video targets and multiple selection cannot trigger erasure',()=>fixture(async({image,app,request,cap,base})=>{
  const m=await image(),c=await cap(m.id),route='/api/media/'+m.id+'/permanent-delete';assert.equal((await request(route,{expected_version:c.version})).status,403);
  assert.equal((await request(route,{expected_version:c.version},{Origin:'https://evil.example','X-LU-Delete-CSRF':c.csrf})).status,403);
  assert.equal((await request(route,{expected_version:c.version,media_ids:[m.id]},{Origin:base(),'X-LU-Delete-CSRF':c.csrf})).status,400);
  app().db.prepare("UPDATE media SET kind='video' WHERE id=?").run(m.id);assert.equal((await request(route)).data.code,'IMAGE_REQUIRED');assert.equal(await exists(m.file),true);
}));

test('crop backups, import thumbnails, generation bytes and upload remnants are removed while receipts cannot resurrect media',()=>fixture(async({image,app,root,dataDir,erase,call})=>{
  const m=await image(),db=app().db,c=randomUUID(),importId=randomUUID(),edit=randomUUID(),generation=randomUUID(),upload=randomUUID(),hash=createHash('sha256').update(bitmap()).digest('hex');
  db.prepare("INSERT INTO characters(id,name,created_at) VALUES(?,'A','now')").run(c);
  db.prepare("INSERT INTO media_imports VALUES(?,'import_key','hash',?,'{}','now','2099-01-01')").run(importId,c);
  db.prepare("INSERT INTO media_import_items VALUES(?,?,'image_slot','committed',?,?,?,'image/png',58,'{}',NULL,'now')").run(randomUUID(),importId,hash,m.id,m.name);
  db.prepare('INSERT INTO imported_media_blobs VALUES(?,?)').run(hash,m.id);
  db.prepare("INSERT INTO media_image_edits VALUES(?,?,'applied',?,?,'{}',58,'now','now',NULL)").run(edit,m.id,hash,hash);
  db.prepare("INSERT INTO image_generation_runs VALUES(?,'generation_key','hash','{}','hash','succeeded','now','2099-01-01','creator','now',NULL)").run(generation);
  db.prepare("INSERT INTO image_generation_outputs VALUES(?,?,?,58,'{}','now')").run(generation,m.id,hash);
  db.prepare("INSERT INTO media_uploads VALUES(?,?,'image_slot','hash','test.png','image/png',58,?,58,'committed',NULL,'now','2099-01-01')").run(upload,importId,hash);
  db.prepare('INSERT INTO media_upload_chunks VALUES(?,0,58,?)').run(upload,hash);
  const files=['import-thumbnails/'+hash+'.jpg','image-originals/'+edit+'.original','image-edit-staging/'+edit+'.image','generation-results/'+generation+'.json','upload-staging/'+upload+'/0.part'];
  for(const relative of files){await fs.mkdir(path.dirname(path.join(dataDir,relative)),{recursive:true});await fs.writeFile(path.join(dataDir,relative),'private fixture bytes');}
  assert.equal((await erase(m.id)).data.complete,true);for(const relative of files)assert.equal(await exists(path.join(dataDir,relative)),false);
  assert.equal(db.prepare('SELECT media_id,status FROM media_import_items WHERE import_id=?').get(importId).media_id,null);assert.equal(db.prepare('SELECT status FROM media_uploads WHERE id=?').get(upload).status,'erased');assert.equal(db.prepare('SELECT status FROM image_generation_runs WHERE id=?').get(generation).status,'withdrawn');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal((await call('/api/export')).media.length,0);
  const imports=installMediaImports({db,root,dataDir,one:(q,...args)=>db.prepare(q).get(...args),all:(q,...args)=>db.prepare(q).all(...args),run:(q,...args)=>db.prepare(q).run(...args),transaction:fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}},config:{enabled:true,approval_mode:'trusted',origin:'https://fixture.example'}});
  await assert.rejects(imports.receive(importId,'image_slot',Readable.from([bitmap()]),{name:'fixture.png'}),{code:'MEDIA_ERASED'});
  await assert.rejects(imports.uploads.finalize({upload_id:upload}),{code:'MEDIA_ERASED'});assert.equal(db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
}));

test('deleting one analyzed image preserves other review actions, cache ownership and export/restore consistency',()=>fixture(async({image,app,call,erase,restart,temp,base})=>{
  const a=await image(),b=await image(),analysis=await call('/api/media-analysis');
  // Use the same production service contracts while HTTP auth is covered above.
  const plan=await app().mediaAnalysis.previewJob({media_ids:[a.id,b.id]}),job=await app().mediaAnalysis.createJob({media_ids:[a.id,b.id],preview_hash:plan.preview_hash,request_key:randomUUID()});await app().mediaAnalysis.settle();
  const view=app().mediaAnalysis.view(job.id);assert.equal(view.items.length,2);const raw=app().db;
  const actions=view.items.map(i=>({proposal_id:i.proposals.find(p=>p.resolution==='matched').id})),headers={Origin:base(),'X-LU-Analysis-CSRF':analysis.csrf};
  const approval=await call('/api/media-analysis/review/preview',{operation:'accept',actions},headers);
  const decision=await call('/api/media-analysis/review/apply',{operation:'accept',actions,preview_hash:approval.preview_hash,request_key:randomUUID()},headers);
  // Pending matches/results on the other image survive; no batch-wide deletion.
  assert.equal((await erase(a.id)).data.complete,true);assert.equal(raw.prepare('SELECT COUNT(*) n FROM media_analysis_items WHERE job_id=?').get(job.id).n,1);assert.equal(raw.prepare('SELECT COUNT(*) n FROM media_analysis_cache').get().n,1);
  const snapshot=await call('/api/export');await restart(path.join(temp,'restored'));await call('/api/restore',snapshot);assert.equal((await call('/api/media-analysis/jobs/'+job.id)).items[0].media_id,b.id);assert.deepEqual(app().db.prepare('PRAGMA foreign_key_check').all(),[]);
  const restored=await call('/api/media-analysis');const undo=await call('/api/media-analysis/review/rollback',{decision_id:decision.decision_id},{Origin:base(),'X-LU-Analysis-CSRF':restored.csrf});assert.equal(undo.removed_tags,1);assert.equal(await exists(b.file),true);
}));

test('frontend deletion snapshots one image, skips confirmation and requires a complete matching server receipt',async()=>{
  const m={id:randomUUID(),kind:'image'},capability={media_id:m.id,version:'version',csrf:'csrf',protected:false},requests=[];
  const request=async(...args)=>{requests.push(args);return {ok:true,complete:true,media_id:m.id};};
  await assert.rejects(deleteSelectedImage({selected:[m,m],capability,request}),/egy képet/u);await assert.rejects(deleteSelectedImage({selected:[m],capability:{...capability,protected:true},request}),/kanonikus/u);assert.equal(requests.length,0);
  await deleteSelectedImage({selected:[m],capability,request});assert.deepEqual(requests[0],['/api/media/'+m.id+'/permanent-delete',{expected_version:'version'},'csrf']);
  await assert.rejects(deleteSelectedImage({selected:[m],capability,request:async()=>({ok:true,complete:false,media_id:m.id})}),/nem igazolta/u);
});

test('a file replaced while derived files are being removed is preserved and never reported deleted',()=>{
  let source;return fixture(async({image,app,dataDir,erase})=>{
    const m=await image();source=m.file;const hash='a'.repeat(64),thumbnail=path.join(dataDir,'import-thumbnails',hash+'.jpg');
    app().db.prepare('INSERT INTO imported_media_blobs VALUES(?,?)').run(hash,m.id);await fs.mkdir(path.dirname(thumbnail),{recursive:true});await fs.writeFile(thumbnail,'fixture thumbnail');
    const result=await erase(m.id);assert.equal(result.data.code,'FILE_CHANGED');assert.equal(result.data.complete,false);assert.equal(await fs.readFile(source,'utf8'),'new replacement file');assert.ok(app().db.prepare('SELECT id FROM media WHERE id=?').get(m.id));
  },{permanentDeleteTestOptions:{unlink:async file=>{if(file.endsWith('.jpg'))await fs.writeFile(source,'new replacement file');await fs.unlink(file);}}});
});

test('another request cannot approve canon, mutate the catalogue or double-submit while unlink is pending',()=>{
  let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  return fixture(async({image,app,erase,cap,call,request,base})=>{
    const m=await image(),c=await cap(m.id),character=randomUUID();app().db.prepare("INSERT INTO characters(id,name,created_at) VALUES(?,'A','now')").run(character);
    const first=erase(m.id,c);await started;
    try{
      assert.equal((await erase(m.id,c)).status,409);
      assert.equal((await request('/api/characters/'+character+'/canon',{appearance:'Race',references:[{media_id:m.id,role:'face'}]},{Origin:base()})).status,409);
      assert.equal(app().db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
    }finally{release();}
    assert.equal((await first).data.complete,true);await call('/api/scan',{});assert.equal((await call('/api/media')).items.some(i=>i.id===m.id),false);
  },{permanentDeleteTestOptions:{unlink:async file=>{entered();await gate;await fs.unlink(file);}}});
});

test('a reference approval already hashing before deletion cannot commit a deleted image afterwards',()=>{
  let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  return fixture(async({image,app,erase,request})=>{
    const m=await image(),cid=randomUUID();app().db.prepare("INSERT INTO characters(id,name,created_at) VALUES(?,'A','now')").run(cid);app().db.prepare('INSERT INTO depictions VALUES(?,?)').run(m.id,cid);
    const approval=request('/api/characters/'+cid+'/canon',{appearance:'Approved',references:[{media_id:m.id,role:'face'}]});await started;
    try{assert.equal((await erase(m.id)).data.complete,true);}finally{release();}
    const result=await approval;assert.equal(result.status,409);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);assert.equal(await exists(m.file),false);
  },{canonTestOptions:{beforeCommit:async()=>{entered();await gate;}}});
});
