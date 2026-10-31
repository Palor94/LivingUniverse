import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {PassThrough} from 'node:stream';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {findNameMentions,nameForms} from '../app/hungarian-names.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {serve} from '../mcp/server.mjs';
import {createDispatcher} from '../mcp/http-gateway.mjs';

async function fixture({mobile=false,mode='trusted',...options}={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rename-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),writeConfig=path.join(dataDir,'mcp-writes.json'),config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'fixture@example.test',approval_mode:mode,database_id:databaseIdentity(database)};
  const f={temp,root,dataDir,database,config};
  f.boot=async()=>{f.app=await createApp({root,dataDir,mcpWrites:config,mobile:mobile?{enabled:true,origin:config.origin,login:config.login}: {enabled:false},...options});await new Promise(r=>f.app.server.listen(0,'127.0.0.1',r));f.base='http://127.0.0.1:'+f.app.server.address().port;await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:f.base}));f.writer=await createWriteClient({database,writeConfig});f.reader=await createCatalogue({database,mediaRoot:root});};
  f.stop=async()=>{f.reader?.close();await f.app.close();};f.close=async()=>{await f.stop();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});};
  await f.boot();
  f.ids={c:randomUUID(),other:randomUUID(),m:randomUUID(),r:randomUUID(),l:randomUUID(),canon:randomUUID()};const {c,other,m,r,l,canon}=f.ids;
  const run=(sql,...v)=>f.app.db.prepare(sql).run(...v);f.run=run;f.row=(sql,...v)=>f.app.db.prepare(sql).get(...v);
  run('INSERT INTO characters(id,name,biography,notes,created_at) VALUES(?,?,?,?,?)',c,'Áron','Áron Áronnal Áronhoz. Árontalan marad.','PRIVATE Áron',new Date().toISOString());
  run('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)',other,'Béla','Áronnal találkozik.',new Date().toISOString());
  run('INSERT INTO relationships VALUES(?,?,?,?)',r,other,c,'Áronhoz és Áronnal.');
  run('INSERT INTO media VALUES(?,?,?,?,?,?,?)',m,'Áron.png','','image',1,null,new Date().toISOString());run('INSERT INTO depictions VALUES(?,?)',m,c);run('INSERT INTO media_notes VALUES(?,?,?)',m,'Áron','Áronnal a képen.');
  run('INSERT INTO canon VALUES(?,?,?,?,?,?,?)',canon,c,null,'Áron kanonikus.','[]','Áron jóváhagyás',new Date().toISOString());
  run('INSERT INTO locations(id,name,name_key,created_at,parent_id) VALUES(?,?,?,?,NULL)',l,'Áron kertje','áron kertje',new Date().toISOString());run('INSERT INTO location_profiles VALUES(?,?,?,?,NULL)',l,'','Áron helye','Áronhoz tartozó kert.');
  run('INSERT INTO application_settings VALUES(?,?)','ghost:character:'+c,JSON.stringify({version:1,values:{identity:{value:'Áronnal együtt.',interpretation:'Áronhoz kötődik.',kind:'fact',source:'Áron eredet',visibility:'creator'}},history:[],proposals:[]}));
  f.request=async(route,body,headers={})=>fetch(f.base+route,{...(body?{method:'PUT',headers:{'Content-Type':'application/json',Origin:f.base,'X-LU-Rename-CSRF':f.app.characterRename.csrf,...headers},body:JSON.stringify(body)}:{headers})});
  f.prepare=(key='fixture_rename_01',name='Ábel')=>f.app.characterRename.prepare({request_key:key,character_id:c,new_name:name});
  f.full=p=>{const result=[];let offset=0;do{const page=f.app.characterRename.get({plan_id:p.plan_id,offset},true);result.push(...page.items);offset=page.next_offset;}while(offset!==null);return result;};
  f.approval=(p,ids)=>({plan_hash:p.plan_hash,decision:'approve',selected_ids:ids??f.full(p).filter(h=>h.editable&&['required','linked'].includes(h.classification)).map(h=>h.id),confirmed_ids:[]});
  f.commit=(p,args)=>f.app.characterRename.decide(p.plan_id,args??f.approval(p),'fixture-human');
  f.domain=()=>JSON.stringify(['characters','relationships','media','media_notes','canon','locations','location_profiles','story_events','story_event_revisions'].map(t=>f.app.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
  return f;
}

test('Hungarian inflection maps cases, assimilation, casing, boundaries and unknown suffixes',()=>{
  const text='Áronnal → Áronhoz, Áronnak, Áront, Áronban, Áronból, Áronról, Áronnál, Áronon, Áronért. ÁRONNAL áronhoz; XÁron Árontalan.',hits=findNameMentions(text,'Áron','Ábel');
  assert.deepEqual(hits.map(h=>h.after),['Ábellel','Ábelhez','Ábelnek','Ábelt','Ábelben','Ábelből','Ábelről','Ábelnél','Ábelen','Ábelért','ÁBELLEL','ábelhez',null]);
  assert.equal(nameForms('Anna').get('Annával'),'instrumental');assert.equal(nameForms('Ferenc').get('Ferenccel'),'instrumental');assert.equal(nameForms('Károly').get('Károllyal'),'instrumental');
  assert.equal(findNameMentions('Kiss Áronnal','Kiss Áron','Nagy Ábel')[0].after,'Nagy Ábellel');assert.equal(findNameMentions('áram Áronium','Áron','Ábel')[0].after,null);
  assert.equal(findNameMentions('Áronnal'.normalize('NFD'),'Áron','Ábel')[0].after,'Ábellel');
  for(const [name,form] of [['Ákos','Ákost'],['Tamás','Tamást'],['Balázs','Balázst'],['Szabolcs','Szabolcsot'],['Örs','Örsöt'],['Ádám','Ádámot']])assert.equal(nameForms(name).get(form),'accusative');
  assert.equal(findNameMentions('Áronnal','Áron','Alex')[0].after,null);
});

test('preview searches every domain, protects originals/canon/provenance, is paginated and changes no domain data',async()=>{
  const f=await fixture();try{
    const before=f.domain(),p=f.prepare(),hits=f.full(p);assert.equal(f.domain(),before);assert.equal(p.approval_required,true);
    for(const table of ['characters','relationships','media','media_notes','canon','locations','location_profiles','application_settings'])assert.ok(hits.some(h=>h.table===table),table);
    assert.ok(hits.some(h=>h.before==='Áronnal'&&h.after==='Ábellel'));assert.ok(hits.some(h=>h.classification==='uncertain'));assert.ok(hits.some(h=>h.grammar==='unknown_suffix'&&!h.editable));
    assert.ok(hits.filter(h=>['canon','media'].includes(h.table)).every(h=>!h.editable));assert.ok(hits.filter(h=>h.field.includes('.source')).every(h=>!h.editable));
    const page=f.app.characterRename.get({plan_id:p.plan_id,limit:2});assert.equal(page.items.length,2);assert.equal(page.next_offset,2);assert.ok(!JSON.stringify(page).includes('PRIVATE'));
    assert.deepEqual(f.prepare(),p);assert.throws(()=>f.prepare('fixture_rename_01','Dávid'),{code:'IDEMPOTENCY_CONFLICT'});
    assert.throws(()=>f.app.characterRename.applyApproved({plan_id:p.plan_id,plan_hash:p.plan_hash}),{code:'HUMAN_REVIEW_REQUIRED'});
  }finally{await f.close();}
});

test('selection commits atomically, retains IDs, preserves unselected matches and can be undone after restart/export/restore',async()=>{
  const f=await fixture();try{
    const {c,r,m,canon}=f.ids,p=f.prepare(),args=f.approval(p),beforeCanon=f.row('SELECT * FROM canon WHERE id=?',canon),beforeMedia=f.row('SELECT * FROM media WHERE id=?',m);
    const result=f.commit(p,args);assert.equal(result.status,'applied');assert.equal(f.row('SELECT name FROM characters WHERE id=?',c).name,'Ábel');
    assert.equal(f.row('SELECT description FROM relationships WHERE id=?',r).description,'Ábelhez és Ábellel.');assert.equal(f.row('SELECT target_id FROM relationships WHERE id=?',r).target_id,c);
    assert.equal(f.row('SELECT biography FROM characters WHERE id=?',f.ids.other).biography,'Áronnal találkozik.');assert.deepEqual(f.row('SELECT * FROM canon WHERE id=?',canon),beforeCanon);assert.deepEqual(f.row('SELECT * FROM media WHERE id=?',m),beforeMedia);
    assert.equal(JSON.parse(f.row('SELECT value FROM application_settings WHERE key=?','ghost:character:'+c).value).version,2);assert.deepEqual(f.commit(p,args),result);
    const exported=await (await fetch(f.base+'/api/export')).json();assert.ok(exported.application_settings.some(s=>s.key.startsWith('rename:v1:audit:')));
    await f.stop();await f.boot();assert.deepEqual(f.commit(p,args),result);
    const restored=await createApp({root:f.root,dataDir:path.join(f.temp,'restored'),mobile:{enabled:false}});try{
      await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(exported)});assert.equal(response.status,200,await response.text());
      const undo=restored.characterRename.prepareUndo({plan_id:p.plan_id,request_key:'restore_undo_01'});let offset=0,all=[];do{const page=restored.characterRename.get({plan_id:undo.plan_id,offset},true);all.push(...page.items);offset=page.next_offset;}while(offset!==null);
      restored.characterRename.decide(undo.plan_id,{plan_hash:undo.plan_hash,decision:'approve',selected_ids:all.map(h=>h.id)},'fixture-human');assert.equal(restored.db.prepare('SELECT name FROM characters WHERE id=?').get(c).name,'Áron');
      assert.equal(restored.db.prepare('SELECT description FROM relationships WHERE id=?').get(r).description,'Áronhoz és Áronnal.');
      assert.throws(()=>restored.characterRename.prepareUndo({plan_id:p.plan_id,request_key:'restore_undo_02'}),{code:'ALREADY_UNDONE'});
    }finally{await restored.close();}
  }finally{await f.close();}
});

test('ambiguous and other-person hits require individual confirmation; protected hits cannot be forced',async()=>{
  const f=await fixture();try{
    f.run('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)',randomUUID(),'Kiss Áron','Kiss Áronnal beszél.',new Date().toISOString());const p=f.prepare(),hits=f.full(p),ambiguous=hits.find(h=>h.editable&&h.classification==='other_person');assert.ok(ambiguous);
    const selected=['primary-name',ambiguous.id];assert.throws(()=>f.commit(p,f.approval(p,selected)),{code:'AMBIGUOUS_MATCH'});
    const protectedHit=hits.find(h=>!h.editable);assert.throws(()=>f.commit(p,{...f.approval(p,['primary-name',protectedHit.id]),confirmed_ids:[protectedHit.id]}),{code:'PROTECTED_MATCH'});
    f.commit(p,{...f.approval(p,selected),confirmed_ids:[ambiguous.id]});assert.equal(f.row('SELECT name FROM characters WHERE id=?',f.ids.c).name,'Ábel');
  }finally{await f.close();}
});

test('name/alias collisions, stale plans, unrelated new mentions and concurrent connections fail without partial writes',async()=>{
  const f=await fixture();try{
    f.run('UPDATE characters SET aliases=? WHERE id=?','Alias, Ábel',f.ids.other);assert.throws(()=>f.prepare(),{code:'NAME_COLLISION'});f.run('UPDATE characters SET aliases=? WHERE id=?','',f.ids.other);
    assert.throws(()=>f.prepare('same_name_key','BÉLA'),{code:'NAME_COLLISION'});
    const p=f.prepare(),before=f.domain();const otherDb=new DatabaseSync(f.database);try{otherDb.prepare('UPDATE media_notes SET notes=? WHERE media_id=?').run('Concurrent Áronhoz',f.ids.m);}finally{otherDb.close();}
    assert.throws(()=>f.commit(p),{code:'STALE_PLAN'});assert.equal(f.row('SELECT name FROM characters WHERE id=?',f.ids.c).name,'Áron');assert.notEqual(f.domain(),before);
    const priorInsert=f.prepare('before_insert_key');f.run('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)',randomUUID(),'New synthetic person','Új Áronnal hivatkozás.',new Date().toISOString());assert.throws(()=>f.commit(priorInsert),{code:'STALE_PLAN'});
    const fresh=f.prepare('fresh_rename_key'),competing=f.prepare('competing_rename','Dávid');f.commit(fresh);assert.throws(()=>f.commit(competing),{code:'STALE_PLAN'});
    f.run('UPDATE relationships SET description=? WHERE id=?','Later edit',f.ids.r);assert.throws(()=>f.app.characterRename.prepareUndo({plan_id:fresh.plan_id,request_key:'conflicting_undo'}),{code:'UNDO_CONFLICT'});
  }finally{await f.close();}
});

test('selected location-name collision rolls back the whole rename and preserves sibling identities',async()=>{
  const f=await fixture();try{
    f.run('INSERT INTO locations(id,name,name_key,created_at,parent_id) VALUES(?,?,?,?,NULL)',randomUUID(),'Ábel kertje','ábel kertje',new Date().toISOString());
    const p=f.prepare(),selected=f.full(p).filter(h=>h.editable),before=f.domain(),args={...f.approval(p,selected.map(h=>h.id)),confirmed_ids:selected.filter(h=>['uncertain','other_person'].includes(h.classification)).map(h=>h.id)};
    assert.throws(()=>f.commit(p,args),{code:'LOCATION_COLLISION'});assert.equal(f.domain(),before);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM location_changes').get().n,0);
  }finally{await f.close();}
});

test('oversized occurrence sets fail without partial previews; applied name-only history blocks character deletion',async()=>{
  const f=await fixture();try{
    f.run('UPDATE characters SET biography=? WHERE id=?','Áron '.repeat(3100),f.ids.c);assert.throws(()=>f.prepare(),{code:'PLAN_LIMIT'});assert.equal(f.app.db.prepare("SELECT COUNT(*) n FROM application_settings WHERE key LIKE 'rename:v1:plan:%'").get().n,0);
    f.run('UPDATE characters SET biography=? WHERE id=?','Small profile',f.ids.c);
    const cid=randomUUID();f.run('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)',cid,'Synthetic empty',new Date().toISOString());const p=f.app.characterRename.prepare({request_key:'empty_rename_key',character_id:cid,new_name:'Synthetic renamed'});f.commit(p,f.approval(p,['primary-name']));
    const result=await fetch(f.base+'/api/characters/'+cid,{method:'DELETE'});assert.equal(result.status,409);assert.match((await result.json()).error,/rename audit history/);
  }finally{await f.close();}
});

test('SQL failure halfway through selected edits rolls back name, text, audit and receipt',async()=>{
  const f=await fixture();try{
    const p=f.prepare(),before=f.domain();f.app.db.exec("CREATE TRIGGER fail_rename BEFORE UPDATE ON relationships BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    assert.throws(()=>f.commit(p),/synthetic failure/);assert.equal(f.domain(),before);assert.equal(f.app.characterRename.get({plan_id:p.plan_id}).status,'pending');
    assert.equal(f.app.db.prepare("SELECT COUNT(*) n FROM application_settings WHERE key LIKE 'rename:v1:audit:%' AND json_extract(value,'$.event')='applied'").get().n,0);
  }finally{await f.close();}
});

test('event edits append a new revision, preserve sources, links, old approved snapshot and require story reapproval',async()=>{
  const f=await fixture();try{
    const event={title:'Áron találkozása',summary:'Áronnal együtt.',details:'Áronhoz mennek.',sources:[{system:'Creator',excerpt:'Áron eredeti forrás'}],participants:[{character_id:f.ids.c,role:'Áron barát',knows:true}],location_ids:[f.ids.l],visibility:'public'};
    let response=await fetch(f.base+'/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_key:'synthetic_event_01',event})});assert.equal(response.status,201,await response.clone().text());let saved=await response.json();
    response=await fetch(f.base+'/api/events/'+saved.id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:saved.version,status:'approved',reason:'Fixture approval'})});assert.equal(response.status,200,await response.clone().text());saved=await response.json();
    const prior=f.row('SELECT * FROM story_event_revisions WHERE event_id=? AND version=?',saved.id,saved.version),p=f.prepare();assert.ok(f.full(p).some(h=>h.table==='story_event_revisions'&&h.editable));f.commit(p);
    const current=f.row('SELECT r.* FROM story_events e JOIN story_event_revisions r ON r.event_id=e.id AND r.version=e.version WHERE e.id=?',saved.id);
    assert.equal(current.version,prior.version+1);assert.equal(current.status,'proposed');assert.equal(JSON.parse(current.payload_json).summary,'Ábellel együtt.');assert.equal(JSON.parse(current.payload_json).sources[0].excerpt,'Áron eredeti forrás');assert.deepEqual(f.row('SELECT * FROM story_event_revisions WHERE event_id=? AND version=?',saved.id,saved.version),prior);
    assert.equal(f.row('SELECT role FROM story_event_participants WHERE event_id=? AND character_id=?',saved.id,f.ids.c).role,'Ábel barát');
    const undo=f.app.characterRename.prepareUndo({plan_id:p.plan_id,request_key:'event_undo_key'});f.commit(undo,f.approval(undo,f.full(undo).map(h=>h.id)));assert.equal(f.row('SELECT version FROM story_events WHERE id=?',saved.id).version,prior.version+2);
  }finally{await f.close();}
});

test('desktop CSRF/origin and old rename bypasses; expired/rejected proposals and empty selection are refused',async()=>{
  let now=Date.now();const f=await fixture({renameTestOptions:{clock:()=>now}});try{
    const p=f.prepare();assert.equal((await f.request('/api/character-renames/'+p.plan_id+'/decision',f.approval(p),{'X-LU-Rename-CSRF':''})).status,403);
    assert.equal((await f.request('/api/character-renames/'+p.plan_id+'/decision',f.approval(p),{Origin:'https://attacker.invalid'})).status,403);
    const bypass=await fetch(f.base+'/api/characters/'+f.ids.c+'/profile-field',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({field:'name',value:'Ábel'})});assert.equal(bypass.status,409);
    assert.equal((await f.request('/api/characters/'+f.ids.c,{name:'Ábel'})).status,409);assert.throws(()=>f.commit(p,f.approval(p,[])),{code:'INVALID_SELECTION'});
    now+=25*3600e3;assert.throws(()=>f.commit(p),{code:'EXPIRED'});const fresh=f.prepare('reject_rename_01');const reject={plan_hash:fresh.plan_hash,decision:'reject'};f.commit(fresh,reject);assert.equal(f.commit(fresh,reject).status,'rejected');assert.throws(()=>f.commit(fresh),{code:'ALREADY_DECIDED'});
    assert.equal((await fetch(f.base+'/character-rename.html')).status,200);assert.match((await fetch(f.base+'/character-rename.css')).headers.get('content-type'),/css/);
  }finally{await f.close();}
});

test('MCP stdio and Grok dispatcher discover preview tools; trusted/review clients cannot forge human approval or leak private text',async()=>{
  for(const mode of ['trusted','review']){const f=await fixture({mode});try{
    assert.equal(f.writer.renameAvailable,true);const data=(await f.writer.call('rename_character',{request_key:'mcp_rename_key',character_id:f.ids.c,new_name:'Ábel'})).data;assert.match(data.approval_url,/^https:\/\/fixture.example.ts.net\/character-rename.html/);assert.equal(data.status,'pending');assert.ok(!JSON.stringify(data).includes('PRIVATE'));
    await assert.rejects(f.writer.call('apply_approved_character_rename',{plan_id:data.plan_id,plan_hash:data.plan_hash}),{code:'HUMAN_REVIEW_REQUIRED'});
    const unauthorized=await fetch(f.base+'/api/mcp-rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'prepare',arguments:{}})});assert.equal(unauthorized.status,403);
    const forged=await fetch(f.base+'/api/mcp-rename',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.config.token},body:JSON.stringify({operation:'decision',arguments:{plan_id:data.plan_id,approved:true}})});assert.equal(forged.status,400);
    const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);const done=serve({catalogue:f.reader,writer:f.writer,input,output});input.end([{jsonrpc:'2.0',id:1,method:'initialize'},{jsonrpc:'2.0',id:2,method:'tools/list'}].map(JSON.stringify).join('\n')+'\n');await done;
    const listed=wire.trim().split('\n').map(JSON.parse)[1].result.tools;for(const name of ['rename_character','get_character_rename','apply_approved_character_rename','undo_character_rename'])assert.ok(listed.some(t=>t.name===name));
    const dispatcher=createDispatcher({catalogue:f.reader,refreshWriter:async()=>f.writer}),got=await dispatcher({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_character_rename',arguments:{plan_id:data.plan_id}}});assert.equal(got.result.structuredContent.status,'pending');
    f.commit(data);assert.equal((await f.writer.call('apply_approved_character_rename',{plan_id:data.plan_id,plan_hash:data.plan_hash})).data.result.applied,true);
    const undo=(await f.writer.call('undo_character_rename',{plan_id:data.plan_id,request_key:'mcp_undo_key_01'})).data;assert.equal(undo.status,'pending');assert.ok(!JSON.stringify(undo).includes('PRIVATE'));assert.equal(f.row('SELECT name FROM characters WHERE id=?',f.ids.c).name,'Ábel');
  }finally{await f.close();}}
});

test('private mobile approval checks Tailscale identity, exact origin and CSRF before saving',async()=>{
  const f=await fixture({mobile:true});try{
    await new Promise(r=>f.app.mobileServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+f.app.mobileServer.address().port,headers={Host:new URL(f.config.origin).host,'Tailscale-User-Login':f.config.login};
    const context=await (await fetch(base+'/api/session',{headers})).json(),p=f.prepare();
    assert.equal((await fetch(base+'/character-rename.html?plan='+p.plan_id,{headers})).status,200);assert.match((await fetch(base+'/character-rename.css',{headers})).headers.get('content-type'),/css/);
    assert.equal((await fetch(base+'/api/character-renames/'+p.plan_id,{headers:{...headers,'Tailscale-User-Login':'someone@else.test'}})).status,403);
    const body=JSON.stringify(f.approval(p));assert.equal((await fetch(base+'/api/character-renames/'+p.plan_id+'/decision',{method:'PUT',headers:{...headers,'Content-Type':'application/json',Origin:f.config.origin},body})).status,403);
    const result=await fetch(base+'/api/character-renames/'+p.plan_id+'/decision',{method:'PUT',headers:{...headers,'Content-Type':'application/json',Origin:f.config.origin,'X-LU-CSRF':context.csrf},body});assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).status,'applied');
  }finally{await f.close();}
});
