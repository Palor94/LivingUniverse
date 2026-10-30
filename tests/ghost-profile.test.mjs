import http from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {defaultTemplate,validateEntry,sexualPreferenceFields} from '../app/ghost-profile.mjs';
import {parseGhostImport,buildProfileGenerationPackage,buildProfileOverview} from '../app/public/ghost-profile.js';
import {normalizeGhostValues} from '../app/public/ghost-import.js';

test('overview covers all template areas, uses accepted values, preserves uncertainty and zero, and excludes pending proposals/admin notes',()=>{
 const e=(value,kind='fact')=>({value,kind,visibility:'creator',source:'Fixture',interpretation:''});
 const g={template:defaultTemplate,legacy:{biography:'Existing background',personality:'Older traits',appearance:'Legacy appearance'},values:{personality:e('Approved traits','hypothesis'),extraversion:e(0),appearance_summary:e('')},proposals:[{values:{personality:e('UNAPPROVED SECRET')}}]};
 const c={notes:'ADMIN SECRET',canon:{appearance:'Approved appearance'},relationships:[{target_name:'Synthetic B',description:'Directed description'}]};
 const result=buildProfileOverview(c,g),entries=result.flatMap(s=>s.entries);
 for(const group of new Set(defaultTemplate.fields.map(f=>f.group)))assert.ok(result.some(s=>s.title===group));
 assert.ok(entries.some(e=>e.text==='Approved traits'&&e.kind==='hypothesis'));
 assert.ok(entries.some(e=>e.text==='0/10'));assert.ok(entries.some(e=>e.text==='Existing background'&&e.kind==='legacy'));
 assert.ok(entries.some(e=>e.text==='Approved appearance'&&e.kind==='canon'));assert.ok(entries.some(e=>e.text==='Directed description'));
 assert.equal(JSON.stringify(result).includes('Older traits'),false);assert.equal(JSON.stringify(result).includes('Legacy appearance'),false);
 assert.equal(JSON.stringify(result).includes('UNAPPROVED SECRET'),false);assert.equal(JSON.stringify(result).includes('ADMIN SECRET'),false);
 g.values.personality=e('Updated approved text');assert.ok(buildProfileOverview(c,g).flatMap(s=>s.entries).some(e=>e.text==='Updated approved text'));
});

test('full generation package asks for narrative background, personality and sexuality while preserving supplied context',()=>{
 const legacy={biography:'Existing history',personality:'Existing traits',sexuality:'Existing information'};
 const values={personality:{value:'Approved traits',kind:'fact',visibility:'creator',source:'Creator',interpretation:''}};
 const result=buildProfileGenerationPackage({id:'synthetic',name:'Fixture',notes:'ADMIN SECRET',relationships:[]},{template:defaultTemplate,legacy,values});
 assert.deepEqual(result.required_sections,['identity','personality','sexuality','speech','appearance_summary']);
 assert.equal(result.legacy.biography,'Existing history');assert.equal(result.values.personality.value,'Approved traits');
 assert.ok(result.questions.identity.parts.length);assert.ok(result.questions.personality.parts.length);assert.ok(result.questions.sexuality.parts.length);
 assert.equal(JSON.stringify(result).includes('ADMIN SECRET'),false);
 assert.deepEqual(result.optional_preference_fields,sexualPreferenceFields.map(f=>f.id));
 assert.equal(result.generation_package_version,2);
 const guide=result.appearance_supplement;
 for(const id of ['anatomy','appearance_detail']){
   const field=result.template.fields.find(f=>f.id===id);assert.ok(field.guidance.length>500);
   assert.equal(guide.fields[id].template_guidance,field.guidance);
 }
 assert.deepEqual(guide.fields.anatomy.sections.map(s=>[s.id,s.items.length]),[['A',10],['B',4],['C',4]]);
 assert.deepEqual(guide.fields.appearance_detail.sections.map(s=>[s.id,s.items.length]),[['D',8]]);
 assert.match(result.instructions,/appearance_supplement/);assert.match(result.instructions,/hypothesis/);assert.match(result.instructions,/creator/);
 assert.match(guide.applicability,/18\+/);assert.match(guide.instructions,/származásból/);assert.match(guide.instructions,/kerület \/ π/);
 assert.equal(result.reference_context.images_included,false);
 const roundTrip=parseGhostImport(JSON.stringify({character_id:'synthetic',model:'Synthetic test',values:{anatomy:{value:'A–C: szerzői tesztleírás',kind:'hypothesis',visibility:'creator',source:'Szabad fiktív karakteralkotási javaslat',interpretation:'Jóváhagyásra vár.'}}}),'synthetic');
 assert.doesNotThrow(()=>validateEntry(roundTrip.values.anatomy,defaultTemplate.fields.find(f=>f.id==='anatomy')));
 guide.fields.anatomy.sections[0].items.length=0;
 assert.equal(buildProfileGenerationPackage({id:'synthetic'},{template:defaultTemplate,legacy,values}).appearance_supplement.fields.anatomy.sections[0].items.length,10);
 for(const f of sexualPreferenceFields){assert.equal(f.type,'text');assert.equal(defaultTemplate.fields.find(field=>field.id===f.id).group,'Szexuális preferenciák');assert.ok(result.questions[f.id]);}
});

test('Grok type alias and unknown text values import without invented metadata; validation identifies the actual field',()=>{
 const e={value:null,type:'hypothesis',source:'Synthetic fixture',interpretation:'',visibility:'creator'};
 const parsed=parseGhostImport(JSON.stringify({values:{birth_date:e}}),'fixture');
 const values=normalizeGhostValues(parsed.values,defaultTemplate.fields);
 assert.equal(values.birth_date.kind,'hypothesis');assert.equal(values.birth_date.value,'');assert.equal(e.value,null);
 assert.doesNotThrow(()=>validateEntry(values.birth_date,defaultTemplate.fields[0]));
 assert.throws(()=>validateEntry({...values.birth_date,source:undefined},defaultTemplate.fields[0]),/Születési dátum.*source/);
 assert.throws(()=>normalizeGhostValues({birth_date:{...e,kind:'fact'}}),/eltérő/);
});

test('private ghost review supports authenticated uploads and explicit field decisions; unauthorized and cross-site writes fail',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lu-ghost-review-')),root=path.join(dir,'media');await mkdir(root);
 const origin='https://fixture.example.ts.net',login='creator@example.test';
 const app=await createApp({root,dataDir:path.join(dir,'data'),mobile:{enabled:true,origin,login},mcpWrites:null});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
 const local='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port;
 const c=await (await fetch(local+'/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic review'})})).json();
 const route='/api/characters/'+c.id+'/ghost',headers={'Tailscale-User-Login':login};
 assert.equal((await fetch(remote+'/ghost-profile/'+c.id)).status,403);
 assert.equal(await new Promise((resolve,reject)=>http.get(remote+'/ghost-profile/'+c.id,{headers:{...headers,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject)),200);
 for(const asset of ['ghost-review.js','ghost-profile.js','ghost-import.js','ghost-review.css'])assert.equal((await fetch(remote+'/'+asset,{headers})).status,200);
 const {csrf}=await (await fetch(remote+'/api/session',{headers})).json(),g=await (await fetch(remote+route,{headers})).json();
 const values={birth_date:{value:null,type:'hypothesis',source:'Fixture',interpretation:'',visibility:'creator'}};
 const payload={expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:'Synthetic Grok',values};
 const post=(url,body,h)=>fetch(remote+url,{method:'POST',headers:{...headers,'Content-Type':'application/json',...h},body:JSON.stringify(body)});
 assert.equal((await post(route+'/proposals',payload,{Origin:origin})).status,403);
 assert.equal((await post(route+'/proposals',payload,{Origin:'https://evil.test','X-LU-CSRF':csrf})).status,403);
 const response=await post(route+'/proposals',payload,{Origin:origin,'X-LU-CSRF':csrf});assert.equal(response.status,200);const p=await response.json();
 assert.equal(p.status,'pending');assert.equal(p.values.birth_date.value,'');
 const decision=await post(route+'/proposals/'+p.id+'/decision',{expected_version:0,decision:'accept',values:p.values},{Origin:origin,'X-LU-CSRF':csrf});assert.equal(decision.status,200);
 const saved=await decision.json();assert.equal(saved.version,1);assert.equal(saved.proposals[0].actor,login);
});

test('ghost profile: shared template, preserved legacy/canon, explicit review, stale conflict, export/restore and private MCP projection',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lu-ghost-')),root=path.join(dir,'media');await mkdir(root);
 const apps=[];t.after(async()=>{for(const app of apps)await app.close();await rm(dir,{recursive:true,force:true});});
 async function start(name){const app=await createApp({root,dataDir:path.join(dir,name),mobile:{enabled:false},mcpWrites:null});apps.push(app);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;return {app,async req(p,body,method=body?'POST':'GET'){const r=await fetch(base+p,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}};}
 const f=await start('first'),req=f.req;
 const a=(await req('/api/characters',{name:'Synthetic A'})).data,b=(await req('/api/characters',{name:'Synthetic B'})).data;
 await req('/api/characters/'+a.id,{...a,biography:'Keep exact original.',personality:'Existing personality',speech_style:'Original example'},'PUT');
 const canon=(await req('/api/characters/'+a.id+'/canon',{appearance:'Approved physical identity',references:[],expected_revision_id:null,expected_references:[]})).data;
 const base='/api/characters/'+a.id+'/ghost';let g=(await req(base)).data;assert.equal(g.version,0);assert.deepEqual(g.values,{});
 assert.equal(g.template.character.name,'Szellemprofil');assert.equal(g.template.character.playable,false);
 assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,2,'the template is not a participant or playable character');
 const make=values=>({expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:'Synthetic model',values});
 const e={value:7,interpretation:'Synthetic interpretation',source:'Synthetic fixture',kind:'hypothesis',visibility:'creator'};
 assert.equal((await req(base+'/proposals',make({extraversion:{...e,value:11}}))).status,400);
 let p=(await req(base+'/proposals',make({extraversion:e}))).data;assert.equal((await req(base)).data.version,0);
 assert.equal((await req(base+'/proposals/'+p.id+'/decision',{decision:'accept',expected_version:0,values:{extraversion:e}})).status,200);
 g=(await req(base)).data;assert.equal(g.values.extraversion.value,7);assert.equal(g.history.length,1);
 assert.equal((await req(base+'/proposals/'+p.id+'/decision',{decision:'accept',expected_version:1,values:{extraversion:e}})).status,409);
 const stale=(await req(base+'/proposals',make({reward:e}))).data;
 const template=g.template;assert.equal((await req('/api/ghost-template',{expected_version:template.version,fields:[...template.fields,{id:'custom_goal',label:'Custom goal',group:'Custom',type:'text'}]},'PUT')).status,200);
 assert.equal((await req('/api/characters/'+b.id+'/ghost')).data.template.fields.at(-1).id,'custom_goal');assert.deepEqual((await req('/api/characters/'+b.id+'/ghost')).data.values,{});
 assert.equal((await req(base)).data.values.extraversion.value,7,'shared structure changes preserve accepted character data');
 assert.equal((await req(base+'/proposals/'+stale.id+'/decision',{decision:'accept',expected_version:1,values:{reward:e}})).status,409);
 assert.equal((await req(base+'/proposals/'+stale.id+'/decision',{decision:'reject'})).status,200);
 g=(await req(base)).data;p=(await req(base+'/proposals',make({reward:{...e,kind:'fact',visibility:'public'}}))).data;
 await req(base+'/proposals/'+p.id+'/decision',{decision:'accept',expected_version:g.version,values:p.values});
 const catalogue=await createCatalogue({database:path.join(dir,'first','universe.sqlite'),mediaRoot:root});const visible=(await catalogue.call('get_character',{character_id:a.id})).data.structured_profile;assert.deepEqual(Object.keys(visible.values),['reward']);catalogue.close();
 const backup=(await req('/api/export')).data;assert.equal(backup.characters.find(c=>c.id===a.id).biography,'Keep exact original.');assert.equal(backup.canon[0].id,canon.id);assert.equal((await req('/api/characters/'+a.id,undefined,'DELETE')).status,409);
 const restored=await start('restored');assert.equal((await restored.req('/api/restore',backup)).status,200);assert.deepEqual((await restored.req(base)).data,(await req(base)).data);
});
