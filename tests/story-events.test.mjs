import {approveCanon} from './canon-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {tools} from '../mcp/server.mjs';

async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-events-')),root=path.join(dir,'media'),dataDir=path.join(dir,'data');await fs.mkdir(root);
  const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const cleanups=[];let closed=false;const originalClose=app.close;app.close=async()=>{if(!closed){closed=true;await originalClose();}};
  const base='http://127.0.0.1:'+app.server.address().port;
  async function req(route,body,method=body?'POST':'GET',headers={}){const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  const call=async(...args)=>{const r=await req(...args);assert(r.status<300,JSON.stringify(r));return r.data;};
  t.after(async()=>{for(const close of cleanups)await close();await app.close();assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});});
  const a=await call('/api/characters',{name:'Alpha'}),b=await call('/api/characters',{name:'Beta'}),c=await call('/api/characters',{name:'Observer'});
  const event=(overrides={})=>({title:'Shared encounter',summary:'A source-backed fictional event.',details:'Original narrative.',consequences:'An unresolved question.',participants:[{character_id:a.id,role:'participant',knows:true},{character_id:b.id,role:'mentioned',knows:false}],chronology:{kind:'unknown',label:'Sequence not established'},sources:[{system:'Fantasy Den',external_id:'session-1:event-1',locator:'messages 4–9',excerpt:'  Untrusted source text\n  '}],visibility:'participants',...overrides});
  const create=async(overrides={},extra={})=>call('/api/events',{request_key:crypto.randomUUID(),event:event(overrides),...extra});
  const decide=(e,status='approved')=>call('/api/events/'+e.id+'/decision',{expected_version:e.version,status,reason:'Explicit creator review.'});
  return {app,root,dataDir,dir,req,call,a,b,c,event,create,decide,cleanups};
}

test('shared events persist across dossiers, approval/edit history and export/restore without modifying existing records',async t=>{
  const f=await fixture(t),{app,call,req,a,b,create,decide}=f;
  await call('/api/relationships',{source_id:a.id,target_id:b.id,description:'Keep this relationship'});
  const identity=await approveCanon(call,a.id,{appearance:'Preserve approved appearance',references:[]});
  const place=await call('/api/locations',{name:'Old town'});
  const before=await call('/api/export');let e=await create({location_ids:[place.id],chronology:{kind:'approximate',start:'2020-03-01',label:'Around spring 2020'}});
  assert.equal(e.status,'draft');assert.equal(e.sources[0].excerpt,'  Untrusted source text\n  ');assert.equal(e.participants.length,2);assert.equal((await call('/api/characters/'+a.id+'/timeline')).items[0].id,e.id);assert.equal((await call('/api/characters/'+b.id+'/timeline')).items[0].id,e.id);
  assert.equal((await req('/api/characters/'+a.id,undefined,'DELETE')).status,409);
  assert.equal((await req('/api/events',{request_key:'bad',event:f.event(),status:'approved'})).status,400);
  e=await decide(e);assert.equal(e.status,'approved');
  const route='/api/events/'+e.id,payload=(await call(route+'/revisions/'+e.version)).event;
  const changed=await call(route,{expected_version:e.version,event:{...payload,details:'Revised narrative.'},reason:'Correct source reading.'},'PUT');assert.equal(changed.status,'proposed');assert.equal(changed.version,3);
  assert.equal((await req(route,{expected_version:e.version,event:payload},'PUT')).status,409);assert.equal((await call(route+'/revisions/2')).event.details,'Original narrative.');
  assert.equal((await call(route+'/history')).items.length,3);
  const after=await call('/api/export');for(const table of ['characters','relationships','canon','media','depictions','reviews'])assert.deepEqual(after[table],before[table],table+' preserved');assert.equal(after.canon[0].id,identity.id);assert.equal(after.story_events.length,1);
  const restored=await createApp({root:f.root,dataDir:path.join(f.dir,'restored'),mobile:{enabled:false},mcpWrites:null});f.cleanups.push(()=>restored.close());await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));
  const restore=body=>fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const broken=structuredClone(after);broken.story_event_participants=[];const invalid=await restore(broken);assert.equal(invalid.status,400,await invalid.text());assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM characters').get().n,0);assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM story_events').get().n,0);
  const r=await restore(after);assert.equal(r.status,200,await r.text());assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM story_event_revisions').get().n,3);assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('event validation, import deduplication, optimistic writes and chronology filters reject invented or ambiguous structure',async t=>{
  const {req,call,event,create,decide}=await fixture(t),key=crypto.randomUUID(),body={request_key:key,event:event()};
  const first=(await req('/api/events',body)).data;assert.equal((await req('/api/events',body)).data.id,first.id);
  assert.equal((await req('/api/events',{...body,event:event({title:'Changed request'})})).status,409);
  assert.equal((await req('/api/events',{...body,request_key:crypto.randomUUID()})).status,409);
  for(const change of [{chronology:{kind:'exact',start:'2025-02-30'}},{chronology:{kind:'unknown',start:'2020-01-01'}},{chronology:{kind:'range',start:'2024-02-01',end:'2024-01-01'}},{chronology:{kind:'relative'}},{sources:[]},{sources:[{system:'X',url:'file:///secret'}]},{participants:[{character_id:crypto.randomUUID()}]},{participants:[...body.event.participants,body.event.participants[0]]},{visibility:'secret'},{unexpected:true}]){
    const result=await req('/api/events',{request_key:crypto.randomUUID(),event:event(change)});assert.equal(result.status,400,JSON.stringify(change));
  }
  const second=await create({sources:[{system:'Creator'}],title:'Dated',chronology:{kind:'range',start:'2020-01-01',end:'2020-01-10'},tags:['meeting']});
  assert.equal((await call('/api/events?from=2020-01-05&to=2020-01-06')).items[0].id,second.id);
  assert.equal((await call('/api/events?chronology=unknown')).total,1);assert.equal((await call('/api/events?tag=meeting&source=Creator')).total,1);
  const p=(await call('/api/events/'+first.id+'/revisions/1')).event;
  const updated=await call('/api/events/'+first.id,{expected_version:1,event:{...p,chronology:{kind:'relative',before_event_id:second.id}}},'PUT');
  const secondP=(await call('/api/events/'+second.id+'/revisions/1')).event;
  assert.equal((await req('/api/events/'+second.id,{expected_version:1,event:{...secondP,chronology:{kind:'relative',before_event_id:first.id}}},'PUT')).status,400);
  assert.equal((await req('/api/events/'+first.id+'/decision',{expected_version:1,status:'approved',reason:'stale'})).status,409);
  assert.equal((await decide(updated,'archived')).status,'archived');
  assert.equal((await req('/api/events?limit=0')).status,400);assert.equal((await req('/api/events?search=%25')).data.total,0);
  assert.equal((await req('/api/events',body,'POST',{Origin:'https://other.example'})).status,403);
});

test('AI tools filter knowledge before search, counts, pagination, details and linked IDs; never expose revision drafts',async t=>{
  const f=await fixture(t),{create,decide,root,dataDir,a,b}=f;
  const secret=await decide(await create({title:'Hidden secret',visibility:'admin',sources:[{system:'Creator'}]}));
  const shared=await decide(await create({related_event_ids:[secret.id],chronology:{kind:'relative',after_event_id:secret.id,label:'Later that day'}}));
  const publicEvent=await decide(await create({title:'Public event',visibility:'public',sources:[{system:'Creator'}]}));
  await create({title:'Unreviewed idea',sources:[{system:'Creator'}],visibility:'public'});
  const reader=await createCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root}),admin=await createCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root,allowAdminNotes:true});f.cleanups.push(()=>{reader.close();admin.close();});
  const list=await reader.call('search_events',{});assert.equal(list.data.total,1);assert.equal(list.data.items[0].id,publicEvent.id);
  assert.equal((await reader.call('get_character_timeline',{character_id:a.id,perspective_character_id:a.id})).data.total,2);
  assert.equal((await reader.call('search_events',{perspective_character_id:b.id})).data.total,1);
  const detail=(await reader.call('get_event',{event_id:shared.id,perspective_character_id:a.id})).data;assert.deepEqual(detail.related_event_ids,[]);assert.equal(detail.chronology.after_event_id,null);assert.equal(detail.actor,undefined);assert.equal(detail.participants[0].knows,undefined);assert(detail.sources[0].excerpt);
  await assert.rejects(reader.call('get_event',{event_id:secret.id}),/not found/);await assert.rejects(reader.call('search_events',{creator:true}),/disabled/);await assert.rejects(reader.call('get_event',{event_id:shared.id,version:1}),/Unknown arguments/);
  assert.equal((await reader.call('search_events',{search:'Hidden',perspective_character_id:a.id})).data.total,0);
  assert.equal((await admin.call('search_events',{creator:true})).data.total,4);
  assert.equal((await admin.call('search_events',{})).data.total,1);
  const names=tools.map(t=>t.name);for(const name of ['get_event','search_events','get_character_timeline'])assert(names.includes(name));
});

test('migration backs up an existing catalogue before changes, survives restart and down migration preserves old data',async t=>{
  const f=await fixture(t);await f.app.close();
  // Build a real pre-upgrade fixture, including WAL-backed edits.
  const file=path.join(f.dataDir,'universe.sqlite'),db=new DatabaseSync(file);db.exec(readFileSync(new URL('../app/migrations/017-story-events.down.sql',import.meta.url),'utf8'));db.exec("UPDATE characters SET biography='Retain this history'");db.close();
  const upgraded=await createApp({root:f.root,dataDir:f.dataDir,mobile:{enabled:false},mcpWrites:null});
  try{assert(upgraded.storyMigrationBackup);const snapshot=new DatabaseSync(upgraded.storyMigrationBackup,{readOnly:true});try{assert.equal(snapshot.prepare('SELECT biography FROM characters LIMIT 1').get().biography,'Retain this history');assert.equal(snapshot.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='story_events'").get().n,0);assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{snapshot.close();}
    assert.equal(upgraded.db.prepare('SELECT COUNT(*) n FROM characters').get().n,3);
  }finally{await upgraded.close();}
  const restarted=await createApp({root:f.root,dataDir:f.dataDir,mobile:{enabled:false},mcpWrites:null});try{assert.equal(restarted.storyMigrationBackup,null);restarted.db.exec(readFileSync(new URL('../app/migrations/017-story-events.down.sql',import.meta.url),'utf8'));assert.equal(restarted.db.prepare('SELECT biography FROM characters LIMIT 1').get().biography,'Retain this history');}finally{await restarted.close();}
});

test('every imported source identity remains unique across edits; historical participants cannot be deleted',async t=>{
  const f=await fixture(t),{call,req,create,a,b}=f;
  let e=await create({sources:[{system:'Creator'},{system:'Fantasy Den',external_id:'secondary-event-identity'}]});
  const duplicate=await req('/api/events',{request_key:crypto.randomUUID(),event:f.event({sources:[{system:'Fantasy Den',external_id:'secondary-event-identity'}]})});assert.equal(duplicate.status,409);
  const saved=(await call('/api/events/'+e.id+'/revisions/1')).event;
  e=await call('/api/events/'+e.id,{expected_version:e.version,event:{...saved,participants:[{character_id:b.id,role:'witness',knows:false}],sources:[{system:'Creator'}]}},'PUT');
  assert.equal((await req('/api/characters/'+a.id,undefined,'DELETE')).status,409);
  assert.equal((await req('/api/events',{request_key:crypto.randomUUID(),event:f.event({sources:[{system:'Fantasy Den',external_id:'secondary-event-identity'}]})})).status,409);
  assert.equal((await call('/api/export')).story_events.length,1);
});
