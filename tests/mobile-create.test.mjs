import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';

test('private mobile creation validates names, retries safely and assigns new characters/locations without losing sorting drafts',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-mobile-create-')),root=path.join(temp,'media');await fs.mkdir(root);const origin='https://fixture.example.ts.net',login='fixture@github';
  const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login}});await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.mobileServer.address().port,auth={'Tailscale-User-Login':login};let write;
  async function request(route,body,headers=body?write:auth){const r=await fetch(base+route,{method:body?'PUT':'GET',headers,body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
  try{
    const session=(await request('/api/session')).data;write={...auth,Origin:origin,'Content-Type':'application/json','X-LU-CSRF':session.csrf};const id=randomUUID(),route='/api/characters/'+id+'/create';
    assert.equal((await request(route,{name:'Ádám Őri'},auth)).status,403);assert.equal((await request(route,{name:'Ádám Őri'},{...write,Origin:'https://evil.example'})).status,403);
    for(const body of [{name:''},{name:'x'.repeat(201)},{name:'Bad\nname'},{name:'Ádám',notes:'private'},{name:'Ádám',folder:'outside'}])assert.equal((await request(route,body)).status,400);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,0);
    const created=await request(route,{name:'  Ádám Őri  '});assert.equal(created.status,200);assert.equal(created.data.id,id);assert.equal(created.data.name,'Ádám Őri');for(const key of ['aliases','biography','appearance','personality','speech_style','sexuality','notes'])assert.equal(created.data[key],'');
    assert.equal(created.data.folder,'Ádám Őri');assert.equal(created.data.folder_created,true);assert.ok((await fs.lstat(path.join(root,'Ádám Őri'))).isDirectory());assert.equal(app.db.prepare('SELECT character_id FROM sorted_folders WHERE folder=?').get('Ádám Őri').character_id,id);
    app.db.prepare('UPDATE characters SET biography=? WHERE id=?').run('Later edit; preserve this',id);
    const retry=await request(route,{name:'Ádám Őri'});assert.equal(retry.data.biography,'Later edit; preserve this');assert.equal(retry.data.folder_created,false);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,1);
    assert.equal((await request('/api/characters/'+randomUUID()+'/create',{name:'a\u0301da\u0301m őri'})).status,409);assert.equal((await request(route,{name:'Another name'})).status,409);
    const palor=randomUUID();assert.equal((await request('/api/characters/'+palor+'/create',{name:'Palor'})).status,200);
    const beforeLocation=await fs.readdir(root);
    for(const body of [{name:''},{name:'x'.repeat(101)},{name:'Bad\nlocation'},{name:'M7 truckstop',kind:'folder'},{name:'M7 truckstop',folder:'outside'}])assert.equal((await request('/api/sorting/locations',body)).status,400);
    assert.equal((await request('/api/sorting/locations',{name:'M7 pihenő'},auth)).status,403);
    const location=await request('/api/sorting/locations',{name:'M7 pihenő'});assert.equal(location.status,200);assert.ok(location.data.tag_id);assert.equal((await request('/api/sorting/locations',{name:' m7 pihenő '})).data.id,location.data.id);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM locations').get().n,1);assert.equal(app.db.prepare('SELECT folder FROM locations WHERE id=?').get(location.data.id).folder,null);assert.deepEqual(await fs.readdir(root),beforeLocation);
    const vocab=(await request('/api/sorting/vocabulary')).data;assert.ok(vocab.locations.some(l=>l.id===location.data.id));assert.ok(vocab.tags.some(t=>t.id===location.data.tag_id&&t.group_id==='group-setting'));
    const mid=randomUUID();app.db.prepare("INSERT INTO media VALUES(?,'image.png','','image',1,'now','now')").run(mid);app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,palor);app.db.prepare('INSERT INTO media_notes VALUES(?,?,?)').run(mid,'keep original tags','Megőrzendő megjegyzés');const item=(await request('/api/sorting/images/'+mid)).data;
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM media_locations').get().n,0);
    const saved=await request('/api/sorting/images/'+mid,{expected_version:item.version,fields:{...item.fields,character_ids:[palor,id],location_reference:true,location_id:location.data.id,categorization_complete:true}});assert.equal(saved.status,200);assert.equal(saved.data.fields.character_ids.length,2);assert.equal(saved.data.fields.notes,'Megőrzendő megjegyzés');assert.equal(saved.data.fields.tags,'keep original tags');assert.ok(saved.data.fields.structured_tag_ids.includes(location.data.tag_id));
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});

test('mobile character folders reuse existing contents, reject unsafe ownership/paths and roll back failed creation',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-character-folders-')),root=path.join(temp,'media');await fs.mkdir(root);const origin='https://fixture.example.ts.net',login='fixture@github',app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login}});await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.mobileServer.address().port,auth={'Tailscale-User-Login':login};
  try{
    const session=await(await fetch(base+'/api/session',{headers:auth})).json(),headers={...auth,Origin:origin,'X-LU-CSRF':session.csrf,'Content-Type':'application/json'};
    async function create(name,id=randomUUID()){const response=await fetch(base+'/api/characters/'+id+'/create',{method:'PUT',headers,body:JSON.stringify({name})});return{status:response.status,data:await response.json()};}
    for(const name of ['CON','../Escape','A/B','A:B','Trailing.','app','tests','.hidden'])assert.equal((await create(name)).status,400,name);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,0);
    await fs.mkdir(path.join(root,'Existing'));await fs.writeFile(path.join(root,'Existing','original.txt'),'keep original');const reused=await create('Existing');assert.equal(reused.status,200);assert.equal(reused.data.folder_created,false);assert.equal(await fs.readFile(path.join(root,'Existing','original.txt'),'utf8'),'keep original');assert.equal(app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,0);
    await fs.mkdir(path.join(root,'CaseFolder'));const casing=await create('casefolder');assert.equal(casing.status,200);assert.equal(casing.data.folder,'CaseFolder');assert.equal(casing.data.folder_created,false);
    await fs.writeFile(path.join(root,'Occupied'),'keep file');assert.equal((await create('Occupied')).status,409);assert.equal(await fs.readFile(path.join(root,'Occupied'),'utf8'),'keep file');
    app.db.prepare('INSERT INTO sorted_folders VALUES(?,?)').run('Owned',reused.data.id);assert.equal((await create('Owned')).status,409);await assert.rejects(fs.stat(path.join(root,'Owned')),{code:'ENOENT'});
    app.db.prepare('INSERT INTO locations(id,name,name_key,tag_id,folder,created_at) VALUES(?,?,?,NULL,?,?)').run(randomUUID(),'Place','place','Location folder','now');assert.equal((await create('Location folder')).status,409);
    const outside=path.join(temp,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'untouched');try{await fs.symlink(outside,path.join(root,'Linked'),'junction');assert.equal((await create('Linked')).status,403);}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'untouched');
    app.db.exec("CREATE TRIGGER reject_folder_creation BEFORE INSERT ON sorted_folders WHEN NEW.folder IN ('Rollback new','Rollback existing') BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    assert.equal((await create('Rollback new')).status,409);await assert.rejects(fs.stat(path.join(root,'Rollback new')),{code:'ENOENT'});assert.equal(app.db.prepare("SELECT COUNT(*) n FROM characters WHERE name='Rollback new'").get().n,0);
    await fs.mkdir(path.join(root,'Rollback existing'));await fs.writeFile(path.join(root,'Rollback existing','keep.txt'),'preserve');assert.equal((await create('Rollback existing')).status,409);assert.equal(await fs.readFile(path.join(root,'Rollback existing','keep.txt'),'utf8'),'preserve');assert.equal(app.db.prepare("SELECT COUNT(*) n FROM characters WHERE name='Rollback existing'").get().n,0);
    const offline=path.join(temp,'offline');assert.equal(path.dirname(root),temp);assert.equal(path.dirname(offline),temp);await fs.rename(root,offline);assert.equal((await create('Unavailable')).status,409);assert.equal(app.db.prepare("SELECT COUNT(*) n FROM characters WHERE name='Unavailable'").get().n,0);await fs.rename(offline,root);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,2);assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
