import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';

test('sexuality and speech notes autosave independently, detect conflicts and survive restart and old/new backups',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  let app,base;
  async function start(name){app=await createApp({root,dataDir:path.join(temp,name),mobile:{enabled:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method=body?'POST':'GET'){const response=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
  try{
    await start('data');const c=(await request('/api/characters',{name:'Test character'})).data;
    assert.equal(c.sexuality,'');assert.equal(c.speech_style,'');
    const values={sexuality:'Bisexual. Prefers to describe this in his own words.',speech_style:'Rövid, közvetlen mondatok. „Na, indulhatunk?”\nExample: “Let’s talk.”'};
    for(const [field,value] of Object.entries(values))assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field,value,expected:''})).status,200);
    assert.equal((await request('/api/characters/'+c.id+'/profile-field',{field:'sexuality',value:'Stale overwrite',expected:''})).status,409);
    // A pre-update desktop client must not erase the new fields when saving other text.
    assert.equal((await request('/api/characters/'+c.id,{...c,sexuality:undefined,speech_style:undefined,biography:'Existing biography'},'PUT')).status,200);
    let saved=(await request('/api/characters/'+c.id)).data;assert.equal(saved.sexuality,values.sexuality);assert.equal(saved.speech_style,values.speech_style);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
    // The unified desktop editor atomically mirrors these same fields while preserving their kind.
    const ghost=(await request('/api/characters/'+c.id+'/ghost')).data;
    const manual=await request('/api/characters/'+c.id+'/ghost/manual',{expected_version:ghost.version,template_version:ghost.template.version,expected_legacy:values,values:{sexuality:{value:values.sexuality,kind:'hypothesis',source:'Fixture',interpretation:'',visibility:'creator'},speech:{value:values.speech_style,kind:'hypothesis',source:'Fixture',interpretation:'',visibility:'creator'}}});
    assert.equal(manual.status,200);assert.equal(manual.data.values.sexuality.kind,'hypothesis');
    const backup=(await request('/api/export')).data;
    await app.close();app=null;await start('data');saved=(await request('/api/characters/'+c.id)).data;assert.equal(saved.speech_style,values.speech_style);
    const catalogue=await createCatalogue({database:path.join(temp,'data','universe.sqlite'),mediaRoot:root});try{assert.equal((await catalogue.call('get_character',{character_id:c.id})).data.sexuality,values.sexuality);}finally{catalogue.close();}
    await app.close();app=null;await start('restored');assert.equal((await request('/api/restore',backup)).status,200);assert.equal((await request('/api/characters/'+c.id)).data.speech_style,values.speech_style);
    await app.close();app=null;await start('legacy');for(const row of backup.characters){delete row.sexuality;delete row.speech_style;}assert.equal((await request('/api/restore',backup)).status,200);saved=(await request('/api/characters/'+c.id)).data;assert.equal(saved.sexuality,'');assert.equal(saved.speech_style,'');assert.equal(saved.biography,'Existing biography');
    // Desktop (owner layout 2026-11-15): one profile editor; the template fields that map to these
    // columns are mirrored into them on save.
    const mobile=await fs.readFile(new URL('../app/public/mobile.js',import.meta.url),'utf8');
    const {defaultTemplate}=await import('../app/ghost-profile.mjs');for(const source of ['sexuality','speech_style'])assert.ok(defaultTemplate.fields.some(f=>f.source===source));assert.match(mobile,/\['sexuality',t\('profile\.sexuality'\)/);assert.match(mobile,/\['speech_style',t\('profile\.speech'\)/);
  }finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
