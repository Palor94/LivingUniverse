import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

async function fixture(fn){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-'));const root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body){const res=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,value:await res.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.value;}
  async function put(route,body){const r=await fetch(base+route,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();}
  await start(path.join(temp,'data'));try{await fn({root,temp,call,request,put,restart:async()=>{await app.close();await start(path.join(temp,'restored'));}});}finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}}

test('folder preview is side-effect free, mandatory, stale-safe, and supports combined confirmations',()=>fixture(async({root,call,request,put})=>{
  for(const folder of ['One','Two']){await fs.mkdir(path.join(root,folder));await fs.writeFile(path.join(root,folder,'image.png'),folder+' fixture');}await call('/api/scan',{});
  const c=await call('/api/characters',{name:'Existing'});const m=(await call('/api/media?folder=One')).items[0];await put('/api/media/'+m.id,{character_ids:[c.id],notes:'Keep this',tags:'body',categorization_complete:true});
  const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Approved',references:[{media_id:m.id,role:'body'}]});
  const preview=await call('/api/folders/preview',{folders:[{folder:'One',name:'New person'}]});assert.equal(preview.plans[0].total,1);assert.equal(preview.plans[0].assigned,1);assert.equal(preview.plans[0].complete,1);assert.equal(preview.plans[0].samples[0].id,m.id);assert.equal((await call('/api/state')).characters.length,1);
  assert.equal((await request('/api/assign-folder',{folder:'One',character_id:c.id})).status,409);assert.equal((await request('/api/sort-folders',{folders:['One']})).status,409);
  await call('/api/media/bulk',{operation:'reopen',media_ids:[m.id]});assert.equal((await request('/api/folders/confirm',{token:preview.token})).status,409);assert.equal((await call('/api/state')).characters.length,1);
  const combined=await call('/api/folders/preview',{folders:[{folder:'One',name:'New person'},{folder:'Two',name:'New person'}]});const confirmed=await call('/api/folders/confirm',{token:combined.token});assert.equal(confirmed.results.length,2);assert.equal(confirmed.results[0].character_id,confirmed.results[1].character_id);assert.equal((await call('/api/state')).characters.length,2);assert.equal((await request('/api/folders/confirm',{token:combined.token})).status,409);
  assert.equal((await call('/api/media/'+m.id)).notes,'Keep this');assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);assert.equal(await fs.readFile(path.join(root,'One','image.png'),'utf8'),'One fixture');
}));

test('metadata scans reconcile explicit external renames while preserving canonical identity and backups',()=>fixture(async({root,call,request,put,restart})=>{
  const bytes='canonical fixture';await fs.writeFile(path.join(root,'old.png'),bytes);await fs.writeFile(path.join(root,'other.png'),'other bytes');const initial=await call('/api/scan',{});assert.equal(initial.new,2);assert.equal((await call('/api/scan',{})).unchanged,2);
  const original=(await call('/api/media?search=old.png')).items[0];const c=await call('/api/characters',{name:'Pákozdi'});await put('/api/media/'+original.id,{character_ids:[c.id],notes:'Preserved note',tags:'reference',categorization_complete:true});const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Approved reference',references:[{media_id:original.id,role:'face'}]});
  await fs.writeFile(path.join(root,'other.png'),'modified and longer');const modified=await call('/api/scan',{});assert.equal(modified.modified,1);assert.equal((await call('/api/scan-files?state=modified')).total,1);
  await fs.rename(path.join(root,'old.png'),path.join(root,'renamed.png'));const scan=await call('/api/scan',{});assert.equal(scan.potentially_moved,1);assert.equal(scan.missing,1);assert.equal(scan.added,0);assert.equal((await call('/api/media')).total,2);const suggestions=await call('/api/reconciliation');assert.equal(suggestions.items[0].candidates[0].id,original.id);
  const backup=await call('/api/export');await restart();await call('/api/restore',backup);assert.equal((await call('/api/scan-report')).pending,1);assert.equal((await call('/api/scan-files?state=missing')).items[0].media_id,original.id);
  // Spoof matching size/time to verify that canonical content is still protected.
  const candidate=(await call('/api/reconciliation')).items[0];await fs.writeFile(path.join(root,'renamed.png'),'x'.repeat(bytes.length));await fs.utimes(path.join(root,'renamed.png'),new Date(candidate.modified_at),new Date(candidate.modified_at));assert.equal((await request('/api/reconciliation/resolve',{relative_path:'renamed.png',action:'relink',media_id:original.id})).status,409);
  await fs.writeFile(path.join(root,'renamed.png'),bytes);await fs.utimes(path.join(root,'renamed.png'),new Date(candidate.modified_at),new Date(candidate.modified_at));const result=await call('/api/reconciliation/resolve',{relative_path:'renamed.png',action:'relink',media_id:original.id});assert.equal(result.id,original.id);const relinked=await call('/api/media/'+original.id);assert.equal(relinked.relative_path,'renamed.png');assert.equal(relinked.notes,'Preserved note');assert.equal(relinked.categorization_complete,true);assert.equal(relinked.characters[0].id,c.id);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);assert.equal((await call('/api/characters/'+c.id+'/integrity',{})).results[0].status,'unchanged');assert.equal((await call('/api/scan',{})).added,0);
}));

test('unavailable roots retain records; suggestions can become new files and reappearing sources block relinking',()=>fixture(async({root,temp,call,request})=>{
  await fs.writeFile(path.join(root,'one.png'),'fixture');await call('/api/scan',{});const original=(await call('/api/media')).items[0];
  const offline=path.join(temp,'offline');assert.equal(path.dirname(root),temp);assert.equal(path.dirname(offline),temp);await fs.rename(root,offline);const scan=await call('/api/scan',{});assert.equal(scan.unavailable,1);assert.equal(scan.missing,0);assert.equal((await call('/api/media')).total,1);await fs.rename(offline,root);assert.equal((await call('/api/scan',{})).unchanged,1);
  await fs.rename(path.join(root,'one.png'),path.join(root,'two.png'));await call('/api/scan',{});const c=(await call('/api/reconciliation')).items[0];await fs.copyFile(path.join(root,'two.png'),path.join(root,'one.png'));assert.equal((await request('/api/reconciliation/resolve',{relative_path:c.relative_path,action:'relink',media_id:original.id})).status,409);await fs.unlink(path.join(root,'one.png'));
  const kept=await call('/api/reconciliation/resolve',{relative_path:c.relative_path,action:'keep_new'});assert.notEqual(kept.id,original.id);assert.equal((await call('/api/media')).total,2);assert.equal((await call('/api/media/'+original.id)).relative_path,'one.png');assert.equal((await call('/api/reconciliation')).total,0);assert.equal((await call('/api/scan',{})).missing,1);
}));
