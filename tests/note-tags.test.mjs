import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {extractHashtags,hashtagKey,backupBeforeNoteTagsMigration} from '../app/note-tags.mjs';
import {parseAliasLines,installNoteTagsUI,groupName} from '../app/public/note-tags.js';

async function fixture(fn){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-note-tags-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);
  const origin='https://fixture.example.ts.net',login='fixture@github';let app,base,mobile;
  async function start(dir=dataDir){app=await createApp({root,dataDir:dir,mobile:{enabled:true,origin,login}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;mobile='http://127.0.0.1:'+app.mobileServer.address().port;}
  const request=async(route,body,method=body?'POST':'GET',remote=false,headers={})=>{
    const r=await fetch((remote?mobile:base)+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
  };
  const call=async(...args)=>{const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;};
  const media=async(notes='')=>{const id=randomUUID(),name=id+'.png';await fs.writeFile(path.join(root,name),'original fixture');app.db.prepare("INSERT INTO media VALUES(?,?,'','image',16,'2026-10-30','2026-10-30')").run(id,name);app.db.prepare("INSERT INTO media_notes VALUES(?,'legacy, unchanged',?)").run(id,notes);return id;};
  const language=async(id,hu,en,aliases=[])=>{const tag=(await call('/api/taxonomy')).tags.find(t=>t.id===id);return call('/api/taxonomy/language',{tag_id:id,expected_version:tag.version,hu_name:hu,en_name:en,aliases});};
  await start();try{await fn({temp,root,dataDir,app:()=>app,call,request,media,language,restart:async(dir)=>{await app.close();await start(dir);}});}finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('lu-note-tags-'));await fs.rm(temp,{recursive:true,force:true});}
}

test('Unicode hashtag extraction preserves accents, excludes fragments and deduplicates equivalent spellings',()=>{
  const text='Szöveg (#MOSOLYGÓ), #mosolygó #full_body #full-body\n#full_body! abc#no https://x/#url x@a#email \\#escaped ##heading # #árvíztűrő #'+ 'x'.repeat(101);
  assert.deepEqual(extractHashtags(text).map(t=>t.key),['mosolygó','full body','árvíztűrő']);
  assert.notEqual(hashtagKey('mosolygo'),hashtagKey('mosolygó'));
  assert.deepEqual(parseAliasLines('hu: vidám\nen: happy'),[{language:'hu',alias:'vidám'},{language:'en',alias:'happy'}]);
  assert.throws(()=>parseAliasLines('happy'),/formátuma/);
});

test('note preview keeps unsaved drafts and rejects late results for older note text',async()=>{
  const note={value:'#smiling',isConnected:true,closest:()=>({insertAdjacentHTML:()=>{}})},button={},result={innerHTML:''};let release;
  const ui=installNoteTagsUI({$:selector=>selector.includes('textarea')?note:selector==='#note-tags-preview'?button:result,esc:String,action:fn=>fn,api:async(route,body)=>{
    if(route==='/api/taxonomy')return {tags:[]};assert.equal(body.notes,'#smiling');return new Promise(resolve=>release=resolve);
  }});
  ui.viewer({id:'selected'});const pending=button.onclick();note.value='#tired';release({items:[{media_id:'selected',matches:[],existing:[]}]});await pending;
  assert.equal(note.value,'#tired');assert.equal(result.innerHTML,'');
  assert.equal(groupName({id:'group-pose',name:'User renamed group'}),'User renamed group');
});

test('dry run is read-only, bilingual matching uses existing IDs, saves are additive and preserve notes/canon/sorting/files',()=>fixture(async({media,call,request,app,root,language})=>{
  const mid=await media('Eredeti #MOSOLYGÓ #smiling #full_body #ismeretlen'),c=await call('/api/characters',{name:'Palor'});
  app().db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,c.id);
  const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Approved',references:[{media_id:mid,role:'body'}]});
  const manual=(await call('/api/taxonomy/tags',{group_id:'group-clothing',name:'Kabát'})).id;
  await language(manual,'Kabát','coat',[{language:'en',alias:'jacket'}]);
  await call('/api/taxonomy/apply',{media_ids:[mid],tag_ids:[manual],operation:'add'});
  const before=await call('/api/export'),plan=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});
  assert.deepEqual(await call('/api/export').then(({exported_at,...rest})=>rest),Object.fromEntries(Object.entries(before).filter(([k])=>k!=='exported_at')));
  assert.equal(plan.items[0].matches.filter(m=>m.status==='matched').length,3);
  const result=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:plan.preview_hash});assert.equal(result.added,2);assert.equal(result.proposed,1);
  assert.equal((await request('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:plan.preview_hash})).status,409);
  const current=await call('/api/media/'+mid);assert.equal(current.notes,before.media_notes[0].notes);assert.equal(current.tags,'legacy, unchanged');assert.equal(current.categorization_complete,false);assert.deepEqual(current.characters.map(c=>c.id),[c.id]);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
  assert.ok(current.structured_tags.some(t=>t.id===manual));assert.equal(current.structured_tags.find(t=>t.id==='group-expression-smiling').name,'Mosolygó');
  assert.equal(current.structured_tags.find(t=>t.id==='group-expression-smiling').english_name,'smiling');
  assert.equal((await call('/api/taxonomy/notes/review')).proposals[0].token,'ismeretlen');
  await call('/api/media/'+mid,{character_ids:[c.id],tags:current.tags,notes:current.notes+' #jacket',categorization_complete:true},'PUT');
  const saved=await call('/api/media/'+mid);assert.equal(saved.structured_tags.length,3);assert.equal(saved.categorization_complete,true);
  const count=app().db.prepare('SELECT COUNT(*) n FROM note_tag_runs').get().n;await call('/api/media/'+mid,{character_ids:[c.id],tags:saved.tags,notes:saved.notes},'PUT');assert.equal(app().db.prepare('SELECT COUNT(*) n FROM note_tag_runs').get().n,count);
  assert.equal(await fs.readFile(path.join(root,saved.relative_path),'utf8'),'original fixture');
}));

test('duplicate aliases are refused within a group; cross-group ambiguity and exact locations stay proposals',()=>fixture(async({media,call,request,language})=>{
  const a=(await call('/api/taxonomy/tags',{group_id:'group-clothing',name:'Fehér felső'})).id;
  await language(a,'Fehér felső','white top',[{language:'en',alias:'vest'}]);
  assert.equal((await request('/api/taxonomy/tags',{group_id:'group-clothing',name:'WHITE_TOP'})).status,409);
  const b=(await call('/api/taxonomy/tags',{group_id:'group-pose',name:'Mellény póz'})).id;await language(b,'Mellény póz','vest pose',[{language:'en',alias:'vest'}]);
  const other=(await call('/api/taxonomy/tags',{group_id:'group-clothing',name:'Másik'})).id;
  const tag=(await call('/api/taxonomy')).tags.find(t=>t.id===other);
  assert.equal((await request('/api/taxonomy/language',{tag_id:other,expected_version:tag.version,hu_name:'Másik',en_name:'different',aliases:[{language:'hu',alias:'vest'}]})).status,409);
  const place=await call('/api/locations',{name:'Strand'}),mid=await media('#vest #Strand #unknown');
  const plan=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});assert.deepEqual(plan.items[0].matches.map(t=>t.status),['ambiguous','location','unknown']);
  const r=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:plan.preview_hash});assert.equal(r.added,0);assert.equal(r.proposed,3);
  const m=await call('/api/media/'+mid);assert.equal(m.location,null);assert.equal(m.location_reference,false);assert.deepEqual(m.structured_tags,[]);
  assert.equal((await call('/api/locations')).items.find(p=>p.id===place.id).media_count,0);
}));

test('bilingual vocabulary creation/editing is atomic on conflicts and retains stable UUIDs',()=>fixture(async({call,request})=>{
  const language={expected_version:null,hu_name:'Ülő helyzet',en_name:'sitting',aliases:[{language:'hu',alias:'ülve'}]};
  const saved=await call('/api/taxonomy/tags',{group_id:'group-pose',name:'Ülő helyzet',language});
  const before=(await call('/api/taxonomy')).tags.find(t=>t.id===saved.id);assert.equal(before.english_name,'sitting');
  assert.equal((await request('/api/taxonomy/tags',{id:saved.id,group_id:'group-pose',name:'Would change',language:{...language,expected_version:before.version,en_name:''}})).status,400);
  const after=(await call('/api/taxonomy')).tags.find(t=>t.id===saved.id);assert.equal(after.name,before.name);assert.equal(after.version,before.version);
  assert.equal((await request('/api/taxonomy/tags',{group_id:'group-pose',name:'Invalid new entry',language:{...language,en_name:''}})).status,400);
  assert.equal((await call('/api/taxonomy')).tags.some(t=>t.name==='Invalid new entry'),false);
}));

test('manual legacy mapping and exact-location assignments adopt extracted links before rollback',()=>fixture(async({media,call})=>{
  for(const operation of ['legacy','location']){
    const tag=(await call('/api/taxonomy/tags',{group_id:'group-setting',name:operation+' park'})).id;
    const mid=await media('#'+operation+'_park'),plan=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});
    const run=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:plan.preview_hash});assert.equal(run.added,1);
    if(operation==='location'){
      const place=await call('/api/locations',{name:operation+' park'});await call('/api/locations/assign',{media_ids:[mid],location_id:place.id});
    }else{
      const p=await call('/api/taxonomy/migrate',{source:'legacy',tag_id:tag});await call('/api/taxonomy/migrate',{source:'legacy',tag_id:tag,confirm:true,expected_count:p.matched});
    }
    assert.equal((await call('/api/taxonomy/notes/rollback',{run_id:run.run_id})).removed,0);
    assert.ok((await call('/api/media/'+mid)).structured_tags.some(t=>t.id===tag));
  }
}));

test('preview hashes detect changed notes, assignments, aliases and location interpretation even at equal counts',()=>fixture(async({media,call,request,app,language})=>{
  const mid=await media('#smiling');const preview=()=>call('/api/taxonomy/notes/preview',{media_ids:[mid]});
  let p=await preview();app().db.prepare('UPDATE media_notes SET notes=? WHERE media_id=?').run('#tired',mid);
  assert.equal((await request('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash})).status,409);
  p=await preview();await language('group-expression-tired','Fáradt','tired',[{language:'hu',alias:'álmos'}]);
  assert.equal((await request('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash})).status,409);
  const setting=(await call('/api/taxonomy/tags',{group_id:'group-setting',name:'Erdő'})).id;app().db.prepare('UPDATE media_notes SET notes=? WHERE media_id=?').run('#Erdő',mid);p=await preview();
  await call('/api/locations',{name:'Erdő'});assert.equal((await request('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash})).status,409);
  assert.equal((await call('/api/media/'+mid)).structured_tags.length,0);assert.ok(setting);
  assert.equal((await request('/api/taxonomy/notes/preview',{media_ids:[mid,'unknown']})).status,400);
}));

test('run rollback preserves manual adoption and later edits, handles proposals and is idempotent across export/restore',()=>fixture(async({media,call,app,temp,restart})=>{
  const mid=await media('#smiling #full_body #unknown');let p=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});
  const r=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash});
  await call('/api/taxonomy/apply',{media_ids:[mid],tag_ids:['group-expression-smiling'],operation:'add'});
  const backup=await call('/api/export');await restart(path.join(temp,'restored'));await call('/api/restore',backup);
  const rolled=await call('/api/taxonomy/notes/rollback',{run_id:r.run_id});assert.equal(rolled.removed,1);assert.equal(rolled.restored,1);assert.equal(rolled.conflicts,0);
  assert.deepEqual((await call('/api/media/'+mid)).structured_tags.map(t=>t.id),['group-expression-smiling']);
  assert.equal((await call('/api/taxonomy/notes/review')).proposals.length,0);assert.equal((await call('/api/taxonomy/notes/rollback',{run_id:r.run_id})).already_rolled_back,true);
  p=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});const again=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash});
  app().db.prepare("UPDATE note_tag_proposals SET token='Later edit' WHERE media_id=?").run(mid);
  assert.equal((await call('/api/taxonomy/notes/rollback',{run_id:again.run_id})).conflicts,1);
  assert.equal((await call('/api/taxonomy/notes/review')).proposals[0].token,'Later edit');
}));

test('unknown proposals resolve only after vocabulary review and dry run; structured IDs survive label changes and MCP reads',()=>fixture(async({media,call,language,root,dataDir,request})=>{
  const mid=await media('#saját_címke');await call('/api/media/'+mid,{character_ids:[],tags:'retain',notes:'#saját_címke'},'PUT');
  const tid=(await call('/api/taxonomy/tags',{group_id:'group-pose',name:'Saját címke'})).id;assert.match(tid,/^[0-9a-f-]{36}$/);
  await language(tid,'Saját címke','custom label',[{language:'en',alias:'custom alias'}]);
  const p=await call('/api/taxonomy/notes/preview',{media_ids:[mid]});assert.equal(p.items[0].matches[0].tag_id,tid);
  const r=await call('/api/taxonomy/notes/apply',{media_ids:[mid],preview_hash:p.preview_hash});assert.equal(r.added,1);assert.equal((await call('/api/taxonomy/notes/review')).proposals.length,0);
  const old=(await call('/api/taxonomy')).tags.find(t=>t.id===tid);await language(tid,'Új megjelenítés','new display',[{language:'hu',alias:'Saját címke'},{language:'en',alias:'custom alias'}]);
  assert.equal((await request('/api/taxonomy/language',{tag_id:tid,expected_version:old.version,hu_name:'Stale',en_name:'stale',aliases:[]})).status,409);
  assert.equal((await call('/api/media?search='+encodeURIComponent('custom alias'))).total,1);
  const mcp=await createCatalogue({database:path.join(dataDir,'universe.sqlite'),mediaRoot:root});try{
    const results=(await mcp.call('search_media',{search:'custom alias'})).data;assert.equal(results.media.length,1);const metadata=(await mcp.call('get_media',{media_id:mid})).data;assert.equal(metadata.structured_tags[0].id,tid);assert.equal(metadata.structured_tags[0].english_name,'new display');assert.equal(metadata.structured_tags[0].name,'Új megjelenítés');
    assert.equal((await mcp.call('search_media',{search:'not%_literal'})).data.media.length,0);
  }finally{mcp.close();}
}));

test('mobile note saves extract known tags, keep unknown proposals, retry safely and retain access boundaries',()=>fixture(async({media,call,request,app})=>{
  const mid=await media(),auth={'Tailscale-User-Login':'fixture@github'};
  const session=await call('/api/session',undefined,'GET',true,auth),headers={...auth,Origin:'https://fixture.example.ts.net','X-LU-CSRF':session.csrf};
  const vocabulary=await call('/api/sorting/vocabulary',undefined,'GET',true,auth),smile=vocabulary.tags.find(t=>t.id==='group-expression-smiling');assert.equal(smile.name,'Mosolygó');assert.equal(smile.english_name,'smiling');
  const item=await call('/api/sorting/images/'+mid,undefined,'GET',true,auth),body={expected_version:item.version,fields:{...item.fields,notes:'#mosolygó #new',categorization_complete:true}};
  const saved=await call('/api/sorting/images/'+mid,body,'PUT',true,headers);assert.deepEqual(saved.fields.structured_tag_ids,['group-expression-smiling']);
  assert.equal((await call('/api/sorting/images/'+mid,body,'PUT',true,headers)).version,saved.version);
  assert.equal(app().db.prepare('SELECT COUNT(*) n FROM note_tag_proposals').get().n,1);
  assert.equal((await request('/api/taxonomy/notes/apply',{},'POST',true,headers)).status,405);
  assert.equal((await request('/api/taxonomy/notes/preview',{media_ids:[mid]},'POST',false,{Origin:'https://evil.example'})).status,403);
}));

test('restore rejects incomplete or malformed hashtag data atomically and older exports remain supported',()=>fixture(async({media,call,request,temp,restart,app})=>{
  await media('#smiling');const exported=await call('/api/export');await restart(path.join(temp,'empty'));
  const missing=structuredClone(exported);delete missing.tag_aliases;assert.equal((await request('/api/restore',missing)).status,400);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  const broken=structuredClone(exported);broken.tag_aliases=[{tag_id:'group-expression-smiling',language:'hu',alias:'mosoly',alias_key:'invalid'}];assert.equal((await request('/api/restore',broken)).status,400);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  const legacy=structuredClone(exported);for(const table of ['note_tag_proposal_changes','note_tag_links','note_tag_proposals','note_tag_runs','tag_aliases','tag_localizations'])delete legacy[table];
  await call('/api/restore',legacy);assert.equal(app().db.prepare('SELECT COUNT(*) n FROM media_tags').get().n,0);assert.equal((await call('/api/taxonomy')).tags.find(t=>t.id==='group-expression-smiling').display_name,'Mosolygó');
}));

test('additive migration is repeatable; verified backup and schema rollback preserve original tables and links',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-note-tags-migration-'));const db=new DatabaseSync(path.join(temp,'test.sqlite'));let copy;
  try{
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE media(id TEXT PRIMARY KEY); INSERT INTO media VALUES('stable');");
    db.exec(await fs.readFile(new URL('../app/migrations/005-structured-tags.up.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO tag_groups VALUES('g','Original','original'); INSERT INTO structured_tags VALUES('t','g','Old label','old label'); INSERT INTO media_tags VALUES('stable','t');");
    const file=await backupBeforeNoteTagsMigration(db,temp);copy=new DatabaseSync(file,{readOnly:true});assert.equal(copy.prepare('SELECT name FROM structured_tags').get().name,'Old label');copy.close();copy=null;
    const up=await fs.readFile(new URL('../app/migrations/021-note-hashtags.up.sql',import.meta.url),'utf8');db.exec(up);db.exec(up);
    assert.equal(await backupBeforeNoteTagsMigration(db,temp),null);
    db.exec("INSERT INTO tag_localizations VALUES('t','Régi','old'); INSERT INTO note_tag_runs VALUES('r','test','applied','now'); INSERT INTO note_tag_links VALUES('stable','t','r');");
    db.exec(await fs.readFile(new URL('../app/migrations/021-note-hashtags.down.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('SELECT id FROM media').get().id,'stable');assert.equal(db.prepare('SELECT tag_id FROM media_tags').get().tag_id,'t');assert.equal(db.prepare('SELECT name FROM structured_tags').get().name,'Old label');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{copy?.close();db.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
