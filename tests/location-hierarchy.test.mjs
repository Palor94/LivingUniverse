import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {migrateLocationHierarchy,rollbackLocationHierarchy,validateLocationHierarchy} from '../app/location-migration.mjs';
import {locationTreeRows,locationDescendants} from '../app/public/location-tree-model.js';
import {mediaFormValues} from '../app/public/media-form.js';

async function fixture(fn){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-location-tree-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);let app,base,mobile;
  const origin='https://fixture.example.ts.net',login='fixture@github',auth={'Tailscale-User-Login':login};
  async function start(dir=dataDir){app=await createApp({root,dataDir:dir,mobile:{enabled:true,origin,login}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;mobile='http://127.0.0.1:'+app.mobileServer.address().port;}
  async function request(route,body,method=body?'POST':'GET',remote=false,headers={}){const r=await fetch((remote?mobile:base)+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  const place=(name,parent_id=null,extra={})=>call('/api/location-editor',{name,parent_id,...extra},'PUT');
  const get=id=>call('/api/location-editor/'+id),tree=()=>call('/api/location-tree');
  async function edit(id,fields,extra={}){const p=await get(id);return call('/api/location-editor/'+id,{expected_version:p.version,fields,...extra},'PUT');}
  async function image(){const id=randomUUID();await fs.writeFile(path.join(root,id+'.png'),'synthetic original');app.db.prepare("INSERT INTO media VALUES(?,?,'','image',18,'now','now')").run(id,id+'.png');return id;}
  await start();try{await fn({temp,root,dataDir,app:()=>app,call,request,place,get,tree,edit,image,auth,origin,restart:async dir=>{await app.close();await start(dir);}});}finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('lu-location-tree-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('parent-scoped Hungarian names, UUID identity, qualified breadcrumbs and atomic duplicate prevention',()=>fixture(async({place,edit,get,tree,request,app})=>{
  const a=await place('Fenyves'),b=await place('Kőváros'),one=await place('Strand',a.id,{english_name:'Beach'}),two=await place('Strand',b.id);
  assert.notEqual(one.id,two.id);assert.equal(one.tag_id,null);assert.equal(one.breadcrumb,'Fenyves / Strand');assert.equal(two.breadcrumb,'Kőváros / Strand');
  assert.equal((await request('/api/location-editor',{name:'STRAND',parent_id:a.id},'PUT')).status,409);
  assert.equal((await request('/api/location-editor',{name:'FENYVES',parent_id:null},'PUT')).status,409);
  const unicode=await place('Öböl',a.id);assert.equal((await request('/api/location-editor',{name:'O\u0308BO\u0308L',parent_id:a.id},'PUT')).status,409);
  assert.equal((await tree()).items.length,5);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM structured_tags WHERE name=?').get('Strand').n,0);
  await edit(a.id,{name:'Új Fenyves'});assert.equal((await get(one.id)).breadcrumb,'Új Fenyves / Strand');assert.equal((await get(one.id)).id,one.id);assert.equal((await get(unicode.id)).parent_id,a.id);
  assert.deepEqual(app().db.prepare('PRAGMA foreign_key_check').all(),[]);
}));

test('location creation retries retain one UUID and cannot reuse a receipt for different input',()=>fixture(async({place,tree,request})=>{
  const fields={request_key:'creation_key_123',english_name:'Forest'};const a=await place('Erdő',null,fields),b=await place('Erdő',null,fields);assert.equal(a.id,b.id);assert.equal((await tree()).items.length,1);
  assert.equal((await request('/api/location-editor',{name:'Másik erdő',parent_id:null,...fields},'PUT')).status,409);
}));

test('reparenting moves subtrees, rejects cycles/sibling collisions/stale trees, and supports guarded undo',()=>fixture(async({place,get,edit,tree,request,call})=>{
  const a=await place('A'),b=await place('B'),c=await place('C',a.id),d=await place('D',c.id),collision=await place('C',b.id);
  assert.equal((await request('/api/location-editor/'+a.id,{expected_version:(await get(a.id)).version,fields:{parent_id:d.id}},'PUT')).status,400);
  assert.equal((await request('/api/location-editor/'+c.id,{expected_version:(await get(c.id)).version,fields:{parent_id:b.id}},'PUT')).status,409);
  await edit(collision.id,{name:'Másik C'});const oldTree=await tree(),old=await get(c.id);await place('Új gyökér');
  assert.equal((await request('/api/location-editor/'+c.id,{expected_version:old.version,expected_tree_version:oldTree.tree_version,fields:{parent_id:b.id}},'PUT')).status,409);
  const moved=await edit(c.id,{parent_id:b.id},{expected_tree_version:(await tree()).tree_version});assert.equal((await get(d.id)).breadcrumb,'B / C / D');
  const undone=await call('/api/location-tree/undo',{change_id:moved.change_id,expected_tree_version:(await tree()).tree_version});assert.equal(undone.place.parent_id,a.id);assert.equal((await get(d.id)).breadcrumb,'A / C / D');
  assert.equal((await call('/api/location-tree/undo',{change_id:moved.change_id,expected_tree_version:'old'})).replayed,true);
  const editAgain=await edit(c.id,{description:'Before'});await edit(c.id,{description:'Later'});
  assert.equal((await request('/api/location-tree/undo',{change_id:editAgain.change_id,expected_tree_version:(await tree()).tree_version})).status,409);assert.equal((await get(c.id)).description,'Later');
}));

test('background assignment retains character sorting, canon, notes, tags and originals; explicit role toggles retain background links',()=>fixture(async({place,call,app,image,root})=>{
  const a=await place('Város'),b=await place('Park',a.id),c=await place('Utca',a.id),mid=await image(),person=await call('/api/characters',{name:'Palor'});
  await call('/api/media/'+mid,{character_ids:[person.id],tags:'keep',notes:'Original note',categorization_complete:false},'PUT');
  const approved=await call('/api/characters/'+person.id+'/canon',{appearance:'Approved',references:[{media_id:mid,role:'face'}]});const before=await call('/api/media/'+mid);
  await call('/api/locations/assign',{media_ids:[mid],location_id:b.id});let saved=await call('/api/media/'+mid);
  assert.equal(saved.sorting_status,before.sorting_status);assert.equal(saved.location_reference,false);assert.equal(saved.categorization_complete,false);assert.equal((await call('/api/state')).stats.inbox,1);
  await call('/api/media/'+mid,{character_ids:[person.id],tags:saved.tags,notes:saved.notes,location_ids:[b.id,c.id],location_reference:false},'PUT');
  await call('/api/media/bulk',{media_ids:[mid],operation:'location'});await call('/api/media/bulk',{media_ids:[mid],operation:'unlocation'});saved=await call('/api/media/'+mid);
  assert.equal(saved.locations.length,2);assert.equal(saved.location_reference,false);assert.equal(saved.notes,'Original note');assert.equal(saved.tags,'keep');assert.equal(saved.sorting_status,before.sorting_status);assert.equal((await call('/api/characters/'+person.id)).canon.id,approved.id);
  assert.equal(await fs.readFile(path.join(root,saved.relative_path),'utf8'),'synthetic original');assert.equal(app().db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);
}));

test('phone background assignments preserve primary/secondary links and sorting, enforce origin and optimistic versions',()=>fixture(async({place,image,call,request,auth,origin})=>{
  const root=await place('Város'),a=await place('Strand',root.id),b=await place('Park',root.id),mid=await image();
  await call('/api/media/'+mid,{character_ids:[],notes:'Keep note',location_ids:[a.id,b.id],location_reference:false},'PUT');
  const session=await call('/api/session',undefined,'GET',true,auth),headers={...auth,Origin:origin,'X-LU-CSRF':session.csrf};
  const item=await call('/api/sorting/images/'+mid,undefined,'GET',true,auth),body={expected_version:item.version,fields:{...item.fields,notes:'Mobile note',location_id:a.id,location_reference:false}};
  const saved=await call('/api/sorting/images/'+mid,body,'PUT',true,headers);assert.equal(saved.fields.location_reference,false);assert.equal(saved.fields.categorization_complete,false);assert.equal((await call('/api/media/'+mid)).locations.length,2);
  assert.equal((await call('/api/sorting/images/'+mid,body,'PUT',true,headers)).version,saved.version);
  assert.equal((await request('/api/sorting/images/'+mid,{...body,fields:{...body.fields,notes:'Stale'}},'PUT',true,headers)).status,409);
  assert.equal((await request('/api/sorting/images/'+mid,body,'PUT',true,{...headers,Origin:'https://evil.example'})).status,403);
}));

test('mobile location undo requires identity, Origin and CSRF and preserves creation records',()=>fixture(async({place,edit,tree,call,request,auth,origin})=>{
  const created=await place('Erdő'),changed=await edit(created.id,{description:'Explicit edit'}),body={change_id:changed.change_id,expected_tree_version:(await tree()).tree_version};
  assert.equal((await request('/api/location-editor/undo',body,'PUT',true,auth)).status,403);
  const session=await call('/api/session',undefined,'GET',true,auth),headers={...auth,Origin:origin,'X-LU-CSRF':session.csrf};
  assert.equal((await request('/api/location-editor/undo',body,'PUT',true,{...headers,Origin:'https://evil.example'})).status,403);
  const restored=await call('/api/location-editor/undo',body,'PUT',true,headers);assert.equal(restored.place.description,'');
  assert.ok((await call('/api/location-editor',undefined,'GET',true,auth)).history.some(change=>change.undo_of===changed.change_id));
  assert.equal((await request('/api/location-editor/undo',{change_id:created.change_id,expected_tree_version:(await tree()).tree_version},'PUT',true,headers)).status,409);assert.equal((await tree()).items.length,1);
}));

test('old and new exports restore hierarchies, homonyms, media links and undo journals; mismatched parents roll back',()=>fixture(async({place,edit,get,tree,image,call,request,temp,restart,app})=>{
  const a=await place('A'),b=await place('B'),c=await place('Strand',a.id),d=await place('Strand',b.id),mid=await image();await call('/api/locations/assign',{media_ids:[mid],location_id:c.id});
  const changed=await edit(d.id,{description:'History'}),snapshot=await call('/api/export');snapshot.locations.reverse();await restart(path.join(temp,'restored'));await call('/api/restore',snapshot);
  assert.equal((await get(c.id)).parent_id,a.id);assert.equal((await get(d.id)).parent_id,b.id);assert.equal((await call('/api/media/'+mid)).location.id,c.id);assert.equal(app().db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  await call('/api/location-tree/undo',{change_id:changed.change_id,expected_tree_version:(await tree()).tree_version});assert.equal((await get(d.id)).description,'');
  await restart(path.join(temp,'broken'));const broken=structuredClone(snapshot);broken.location_profiles.find(p=>p.location_id===c.id).parent_id=b.id;
  assert.equal((await request('/api/restore',broken)).status,400);assert.equal((await tree()).items.length,0);
  const old=structuredClone(snapshot);old.locations=old.locations.filter(l=>l.id!==d.id).map(({parent_id,...rest})=>rest);old.location_profiles=old.location_profiles.filter(p=>p.location_id!==d.id);delete old.location_changes;delete old.location_schema_version;
  await call('/api/restore',old);assert.equal((await get(c.id)).parent_id,a.id);assert.equal((await call('/api/media/'+mid)).location.id,c.id);
}));

test('migration backs up and preserves legacy IDs, profiles and foreign-key media links; guarded downgrade loses no records',()=>fixture(async({call,app,dataDir,image})=>{
  const a=await call('/api/locations',{name:'Legacy A'}),b=await call('/api/locations',{name:'Legacy B'}),mid=await image();await call('/api/locations/assign',{media_ids:[mid],location_id:b.id});
  const person=await call('/api/characters',{name:'Fixture'}),event=await call('/api/events',{request_key:randomUUID(),event:{title:'Fixture event',summary:'Source-backed test.',details:'Original event',consequences:'',participants:[{character_id:person.id,role:'participant',knows:true}],chronology:{kind:'unknown',label:'Unknown date'},sources:[{system:'Fixture',external_id:randomUUID(),locator:'test',excerpt:'Fixture source'}],visibility:'public',location_ids:[b.id]}});
  const eventBefore=app().db.prepare('SELECT payload_json FROM story_event_revisions WHERE event_id=?').get(event.id).payload_json;
  app().db.prepare("INSERT INTO location_profiles VALUES(?,'Legacy English','type','description',?)").run(b.id,a.id);
  const before=app().db.prepare('SELECT id,name,name_key,tag_id,folder,created_at FROM locations ORDER BY id').all();
  const rolledBack=await rollbackLocationHierarchy(app().db,dataDir);assert.ok(rolledBack);assert.equal(app().db.prepare('PRAGMA table_info(locations)').all().length,6);
  const backup=await migrateLocationHierarchy(app().db,dataDir);assert.ok(backup);const copy=new DatabaseSync(backup,{readOnly:true});try{assert.equal(copy.prepare('PRAGMA table_info(locations)').all().length,6);assert.equal(copy.prepare('SELECT location_id FROM media_locations WHERE media_id=?').get(mid).location_id,b.id);}finally{copy.close();}
  assert.deepEqual(app().db.prepare('SELECT id,name,name_key,tag_id,folder,created_at FROM locations ORDER BY id').all(),before);assert.equal(app().db.prepare('SELECT parent_id FROM locations WHERE id=?').get(b.id).parent_id,a.id);assert.equal(app().db.prepare('SELECT description FROM location_profiles WHERE location_id=?').get(b.id).description,'description');
  assert.equal(app().db.prepare('SELECT location_id FROM story_event_locations WHERE event_id=?').get(event.id).location_id,b.id);assert.equal(app().db.prepare('SELECT payload_json FROM story_event_revisions WHERE event_id=?').get(event.id).payload_json,eventBefore);
  assert.equal(await migrateLocationHierarchy(app().db,dataDir),null);assert.deepEqual(app().db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(app().db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
}));

test('depth limit fails atomically and does not leave an extra place or journal entry',()=>fixture(async({app,request})=>{
  let parent=null;app().db.exec('BEGIN');for(let depth=0;depth<128;depth++){const id=randomUUID();app().db.prepare('INSERT INTO locations(id,name,name_key,created_at,parent_id) VALUES(?,?,?,?,?)').run(id,'Szint '+depth,'szint '+depth,'now',parent);parent=id;}app().db.exec('COMMIT');
  assert.equal(validateLocationHierarchy(app().db).length,128);assert.equal((await request('/api/location-editor',{name:'Túl mély',parent_id:parent},'PUT')).status,409);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM locations').get().n,128);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM location_changes').get().n,0);
}));

test('failed migration of a legacy cycle restores original schema and foreign-key enforcement',()=>fixture(async({call,app,dataDir})=>{
  const a=await call('/api/locations',{name:'A'}),b=await call('/api/locations',{name:'B'});await rollbackLocationHierarchy(app().db,dataDir);
  app().db.prepare("INSERT INTO location_profiles VALUES(?,'','','',?)").run(a.id,b.id);app().db.prepare("INSERT INTO location_profiles VALUES(?,'','','',?)").run(b.id,a.id);
  await assert.rejects(migrateLocationHierarchy(app().db,dataDir),/Kör/);assert.equal(app().db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.equal(app().db.isTransaction,false);assert.equal(app().db.prepare('PRAGMA table_info(locations)').all().length,6);assert.equal(app().db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='location_schema'").get().n,0);
}));

test('schema downgrade refuses accepted homonyms and audit history without removing any data',()=>fixture(async({place,app,dataDir})=>{
  const a=await place('A');await assert.rejects(rollbackLocationHierarchy(app().db,dataDir),/előzmény/);const b=await place('B');await place('Strand',a.id);await place('Strand',b.id);
  await assert.rejects(rollbackLocationHierarchy(app().db,dataDir),/azonos nevű/);assert.equal(validateLocationHierarchy(app().db).length,4);
}));

test('AI metadata carries stable exact place IDs, Hungarian breadcrumbs and explicit English names',()=>fixture(async({place,image,call,root,dataDir})=>{
  const parent=await place('Fenyves'),child=await place('Strand',parent.id,{english_name:'Beach'}),mid=await image();await call('/api/locations/assign',{media_ids:[mid],location_id:child.id});
  const catalogue=await createCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root});try{const data=(await catalogue.call('get_media',{media_id:mid})).data;assert.equal(data.locations[0].id,child.id);assert.equal(data.locations[0].breadcrumb,'Fenyves / Strand');assert.equal(data.locations[0].english_name,'Beach');assert.equal(data.sorting_complete,false);}finally{catalogue.close();}
}));

test('expandable tree model keeps parents in bilingual search, disambiguates homonyms and rejects cycles',()=>{
  const items=[{id:'a',name:'Fenyves',parent_id:null,breadcrumb:'Fenyves'},{id:'b',name:'Kőváros',parent_id:null,breadcrumb:'Kőváros'},{id:'c',name:'Strand',english_name:'Beach',parent_id:'a',breadcrumb:'Fenyves / Strand'},{id:'d',name:'Strand',parent_id:'b',breadcrumb:'Kőváros / Strand'}];
  assert.equal(locationTreeRows(items).length,2);assert.equal(locationTreeRows(items,'',new Set(['a','b'])).length,4);assert.deepEqual(locationTreeRows(items,'Beach').map(p=>p.id),['a','c']);assert.deepEqual([...locationDescendants(items,'a')],['a','c']);
  assert.throws(()=>locationTreeRows([{id:'a',name:'A',parent_id:'a'}]),/Kör/);
  const form=new FormData();form.append('location_multi','1');form.append('location_ids','c');const values=mediaFormValues(form);assert.equal(values.location_reference,false);assert.deepEqual(values.location_ids,['c']);
});
