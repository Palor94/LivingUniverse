import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';

async function fixture(fn){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-relink-batch-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);
  const origin='https://fixture.example.ts.net',login='fixture@github',app=await createApp({root,dataDir,mobile:{enabled:true,origin,login}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
  const desktop='http://127.0.0.1:'+app.server.address().port,mobile='http://127.0.0.1:'+app.mobileServer.address().port,auth={'Tailscale-User-Login':login},session=await(await fetch(mobile+'/api/session',{headers:auth})).json(),write={...auth,Origin:origin,'Content-Type':'application/json','X-LU-CSRF':session.csrf};
  const phone=async(route,body,headers=body?write:auth)=>{const r=await fetch(mobile+route,{method:body?'PUT':'GET',headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const scan=async()=>{const r=await fetch(desktop+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert(r.ok);return r.json();};
  async function file(relative,text='same fixture bytes'){const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);await fs.utimes(target,new Date('2026-10-20T12:00:00Z'),new Date('2026-10-20T12:00:00Z'));}
  async function move(from,to){await fs.mkdir(path.dirname(path.join(root,to)),{recursive:true});await fs.rename(path.join(root,from),path.join(root,to));}
  try{await fn({app,root,dataDir,file,move,scan,phone,auth,write});}finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
}

test('phone previews only one-to-one filename matches, preserves metadata and canon, backs up atomically and retries once',()=>fixture(async({app,root,dataDir,file,move,scan,phone,auth})=>{
  for(const name of ['old/one.png','old/two.png','old-a/same.png','old-b/same.png','old/duplicate.png','old/renamed.png'])await file(name);await scan();
  const before=app.db.prepare('SELECT * FROM media ORDER BY relative_path').all(),one=before.find(m=>m.relative_path===path.join('old','one.png')),two=before.find(m=>m.relative_path===path.join('old','two.png')),cid=randomUUID();
  app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Ádám','now');for(const m of [one,two]){app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(m.id,cid);app.db.prepare('INSERT INTO media_notes VALUES(?,?,?)').run(m.id,'body','Keep this note');app.db.prepare('INSERT INTO media_categorization VALUES(?,1,?)').run(m.id,'now');}
  const hash=createHash('sha256').update('same fixture bytes').digest('hex'),canonId=randomUUID();app.db.prepare('INSERT INTO canon VALUES(?,?,NULL,?,?,?,?)').run(canonId,cid,'Approved body',JSON.stringify([{media_id:one.id,role:'body',sha256:hash}]),'approved','now');
  await move('old/one.png','new/one.png');await move('old/two.png','new/two.png');await move('old-a/same.png','new-a/same.png');await move('old-b/same.png','new-b/same.png');await move('old/duplicate.png','new-a/duplicate.png');await file('new-b/duplicate.png');await move('old/renamed.png','new/different.png');await scan();
  assert.equal((await phone('/api/sorting/relink-preview',undefined,{})).status,403);
  const preview=await phone('/api/sorting/relink-preview');assert.equal(preview.status,200);assert.equal(preview.data.count,2);assert.equal(preview.data.excluded,5);assert.equal(preview.data.samples[0].from.startsWith(root),false);
  assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.data.token},auth)).status,403);
  assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.data.token,relative_path:'anything'})).status,400);
  assert.equal((await phone('/api/sorting/relink-confirm',{token:randomUUID()})).status,409);
  const done=await phone('/api/sorting/relink-confirm',{token:preview.data.token});assert.equal(done.status,200);assert.equal(done.data.linked,2);assert.equal(done.data.remaining,5);assert.equal(done.data.backup_verified,true);
  const again=await phone('/api/sorting/relink-confirm',{token:preview.data.token});assert.deepEqual(again.data,done.data);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,2);
  for(const m of [one,two]){const current=app.db.prepare('SELECT * FROM media WHERE id=?').get(m.id);assert.equal(current.relative_path,path.join('new',path.basename(m.relative_path)));assert.equal(app.db.prepare('SELECT COUNT(*) n FROM depictions WHERE media_id=?').get(m.id).n,1);assert.equal(app.db.prepare('SELECT notes FROM media_notes WHERE media_id=?').get(m.id).notes,'Keep this note');assert.equal(app.db.prepare('SELECT complete FROM media_categorization WHERE media_id=?').get(m.id).complete,1);assert.equal(await fs.readFile(path.join(root,current.relative_path),'utf8'),'same fixture bytes');}
  assert.equal(app.db.prepare('SELECT references_json FROM canon WHERE id=?').get(canonId).references_json,JSON.stringify([{media_id:one.id,role:'body',sha256:hash}]));assert.equal(app.db.prepare('SELECT COUNT(*) n FROM media').get().n,before.length);
  const backups=(await fs.readdir(path.join(dataDir,'backups'))).filter(n=>n.endsWith('.sqlite'));assert.equal(backups.length,1);const copy=new DatabaseSync(path.join(dataDir,'backups',backups[0]),{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('SELECT relative_path FROM media WHERE id=?').get(one.id).relative_path,one.relative_path);copy.close();assert.equal((await phone('/api/sorting/relink-preview')).data.count,0);
}));

test('stale files, reappearing sources, canonical mismatch and symlinks abort the whole phone batch',()=>fixture(async({app,root,file,move,scan,phone})=>{
  for(const name of ['old/a.png','old/b.png'])await file(name);await scan();const originals=app.db.prepare('SELECT * FROM media ORDER BY relative_path').all(),cid=randomUUID();app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Palor','now');const protectedMedia=originals[1];app.db.prepare('INSERT INTO canon VALUES(?,?,NULL,?,?,?,?)').run(randomUUID(),cid,'Protected',JSON.stringify([{media_id:protectedMedia.id,role:'face',sha256:createHash('sha256').update('same fixture bytes').digest('hex')}]),'approved','now');
  await move('old/a.png','new/a.png');await move('old/b.png','new/b.png');await scan();let preview=(await phone('/api/sorting/relink-preview')).data;
  await file('new/b.png','x'.repeat('same fixture bytes'.length));assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.token})).status,409);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);
  await file('new/b.png');await file('old/a.png');assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.token})).status,409);await fs.unlink(path.join(root,'old','a.png'));
  await file('new/a.png','different size');assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.token})).status,409);await file('new/a.png');
  await move('new','physical');try{await fs.symlink(path.join(root,'physical'),path.join(root,'new'),'junction');assert.equal((await phone('/api/sorting/relink-confirm',{token:preview.token})).status,409);}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);for(const m of originals)assert.equal(app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(m.id).relative_path,m.relative_path);
}));
