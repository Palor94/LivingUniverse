// Szereplőgyár (2026-11-14): form → order → Grok profile (auto-accepted, checked) → ChatGPT avatars
// and gallery (face-checked). Synthetic data; a fake face analyser: a file containing "MISMATCH"
// has another face.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {profileGaps} from '../app/character-orders.mjs';
import {crc32} from 'node:zlib';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
// A valid PNG carrying a text chunk (the fake analyser reads the marker; image checks still pass).
const marked=text=>{const data=Buffer.from('Comment\0'+text),len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from('tEXt'),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body)>>>0);const iend=PNG.length-12;return Buffer.concat([PNG.subarray(0,iend),len,body,crc,PNG.subarray(iend)]);};
const vec=v=>{const a=new Float32Array(512);a[v]=1;return Buffer.from(a.buffer).toString('base64');};
const fakeAnalyser=Object.assign(async file=>({faces:[{box:{x:0,y:0,w:100,h:100},score:0.9,px:100,embedding:vec(readFileSync(file).includes('MISMATCH')?1:0)}]}),{available:()=>true,close(){}});

test('profile gaps: empty and placeholder fields, optional ones ignored',()=>{
  const fields=[{id:'goals',type:'text'},{id:'birth_date',type:'text'},{id:'extraversion',type:'scale'},{id:'fears',type:'text'}];
  const g=profileGaps({goals:{value:'Ismeretlen.'},extraversion:{value:3}},fields);
  assert.deepEqual([g.missing,g.weak,g.complete],[['fears'],['goals'],false]);
  assert.equal(profileGaps({goals:{value:'Jó orvos akar lenni.'},extraversion:{value:3},fears:{value:'Fél a magánytól, és ezt rejti.'}},fields).complete,true);
});

test('Szereplőgyár: one form, Grok profile accepted and checked, avatars and gallery face-checked',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-orders-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(dataDir,{recursive:true});
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null,identityAnalyser:fakeAnalyser});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=async(operation,args={},route='/api/mcp-backgrounds')=>{const r=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({operation,arguments:args})});return {status:r.status,data:await r.json()};};
  const dataUrl=b=>'data:image/png;base64,'+b.toString('base64');

  // The form: a woman is refused; a man with two pictures is created with his folder.
  assert.equal((await call('/api/character-orders',{name:'Teszt Anna',description:'Egy nő a szomszédból.',pictures:[{name:'a.png',data_url:dataUrl(PNG)}]})).status>=400,true);
  assert.equal((await call('/api/character-orders',{name:'Nincs Kép',pictures:[]})).status,400);
  const created=await call('/api/character-orders',{name:'Teszt Gyuri',description:'Harmincas kamionos Kálozról.',pictures:[{name:'a.png',data_url:dataUrl(PNG),note:'  Frontal,  full body a kamion mellett; fullbodyx nem '},{name:'b.png',data_url:dataUrl(Buffer.concat([PNG,Buffer.from('x')]))}],gallery:true,gallery_count:2});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const o=created.data,cid=o.character_id;
  assert.equal(o.source_pictures.length,2);
  // The per-picture note is kept and tagged from existing vocabulary only (no new tags).
  const noted=o.source_pictures.find(s=>s.owner_note),plain=o.source_pictures.find(s=>!s.owner_note);
  assert.equal(noted.owner_note,'Frontal, full body a kamion mellett; fullbodyx nem');
  assert.deepEqual(noted.tags,['frontal','full body']);
  assert.equal(plain.tags,undefined);
  assert.equal(app.db.prepare('SELECT count(*) n FROM depictions WHERE character_id=?').get(cid).n,2,'pictures linked to him');
  assert.equal(app.db.prepare('SELECT count(*) n FROM canon WHERE character_id=?').get(cid).n,0,'never canon');
  assert.deepEqual([o.profile.state,o.avatars.state,o.gallery.state],['open','waiting','waiting']);

  // Grok's view: the open order with what is missing.
  const listed=(await mcp('orders_list')).data;
  assert.equal(listed.open,1);assert.ok(listed.orders[0].profile.missing_fields.length>40);
  assert.equal((await mcp('order_picture_save',{order_id:o.order_id,media_id:o.source_pictures[0].media_id})).status,409,'gallery waits for the profile');
  // Each assistant gets only its own part.
  const forGrok=(await mcp('orders_list',{for:'grok'})).data;
  assert.equal(forGrok.open,1);assert.equal(forGrok.orders[0].avatars,undefined);assert.equal(forGrok.orders[0].gallery,undefined);assert.deepEqual(Object.keys(forGrok.how),['profile']);
  const forGpt=(await mcp('orders_list',{for:'chatgpt'})).data;
  assert.equal(forGpt.orders[0].profile,undefined);assert.equal(forGpt.orders[0].profile_state,'open');assert.deepEqual(Object.keys(forGpt.how),['avatars','gallery']);
  assert.equal((await mcp('orders_list',{for:'claude'})).status,400);

  // Grok proposes part of the profile: accepted at once, the gaps come back.
  const ghost=async()=>(await call('/api/characters/'+cid+'/ghost')).data;
  let g=await ghost();
  const entry=(f,value)=>({value,interpretation:'',kind:'hypothesis',source:'Grok',visibility:'creator'});
  const part={goals:entry(null,'Saját fuvarozó céget szeretne.')};
  const first=(await mcp('propose',{character_id:cid,expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,values:part,model:'Grok'},'/api/mcp-ghost')).data;
  assert.equal(first.status,'accepted');assert.equal(first.character_order.profile_complete,false);assert.ok(first.character_order.missing_fields.length>30);
  // The rest: every field filled with real text (scales with a number in range).
  g=await ghost();
  const all={};for(const f of g.template.fields){if(['birth_date','origin'].includes(f.id))continue;all[f.id]=entry(f,f.type==='scale'?(f.min??1):f.id==='gender'?'férfi, egyértelműen férfiként azonosítja magát':'Részletes, valódi szöveg a(z) '+f.id+' mezőhöz.');}
  const second=(await mcp('propose',{character_id:cid,expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,values:all,model:'Grok'},'/api/mcp-ghost')).data;
  assert.equal(second.character_order.profile_complete,true,JSON.stringify(second.character_order||second).slice(0,400));

  // Gallery: a matching picture is saved into his folder, a mismatch is not kept, a refusal counts.
  await fs.writeFile(path.join(root,'mas-arc.png'),marked('MISMATCH'));await call('/api/scan',{});
  const other=app.db.prepare("SELECT id FROM media WHERE relative_path='mas-arc.png'").get().id;
  const bad=(await mcp('order_picture_save',{order_id:o.order_id,media_id:other})).data;assert.equal(bad.saved,false,JSON.stringify(bad));assert.equal(bad.face.state,'mismatch');
  assert.equal((await mcp('order_picture_save',{order_id:o.order_id,media_id:o.source_pictures[0].media_id,label:'Teszt Gyuri'})).status,400,'label cannot be a character name');
  assert.equal((await mcp('order_picture_save',{order_id:o.order_id,media_id:o.source_pictures[0].media_id,location_id:'nincs-ilyen'})).status,404,'unknown place');
  const good=(await mcp('order_picture_save',{order_id:o.order_id,media_id:o.source_pictures[0].media_id,content:'nudity',label:'reggel'})).data;
  assert.equal(good.saved,true,JSON.stringify(good));assert.equal(good.face.state,'ok');
  const day=new Date().toISOString().slice(0,10);
  const srcRel=app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(o.source_pictures[0].media_id).relative_path;
  assert.equal(path.basename(srcRel),`Teszt Gyuri - forrás - hetkoznapi - ${day}-1.png`,'attached pictures follow the naming rule');
  assert.equal(path.basename(path.dirname(srcRel)),'Teszt Gyuri','attached pictures sit in his folder');
  assert.equal(app.db.prepare('SELECT level FROM play_content WHERE media_id=?').get(o.source_pictures[0].media_id).level,'non_intimate');
  assert.equal(good.file,`Teszt Gyuri - reggel - meztelen - ${day}-1.png`,'Új képek naming rule');
  const rel=app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(good.media_id).relative_path;assert.ok(rel.endsWith(path.join('Galéria',good.file)),rel);
  assert.equal(app.db.prepare('SELECT level FROM play_content WHERE media_id=?').get(good.media_id).level,'nudity');
  const refused=(await mcp('order_picture_save',{order_id:o.order_id,outcome:'refused',note:'policy'})).data;assert.equal(refused.gallery.state,'done');

  // Avatars: a placed figure that matches counts; one that does not is listed for redoing.
  const sprite=async(file,expression,bytes)=>{await fs.writeFile(path.join(root,file),bytes);app.db.prepare('INSERT INTO character_sprites(id,character_id,expression,relative_path,sha256,size,width,height,updated_at,missing,outfit) VALUES(?,?,?,?,?,?,?,?,?,0,?)').run(randomUUID(),cid,expression,file,'x',bytes.length,1,1,new Date().toISOString(),'dressed');};
  await sprite('alap.png','alap',PNG);await sprite('mosoly.png','mosoly',marked('MISMATCH'));
  const view=(await call('/api/character-orders/'+o.order_id)).data;
  assert.equal(view.avatars.want,17,'7 dressed + 7 shirtless + 3 intimate');
  assert.deepEqual(view.avatars.missing.filter(m=>m.outfit==='intimate').map(m=>m.expression),['alap','mosoly','flortol']);
  assert.equal(view.avatars.have,1);assert.equal(view.avatars.state,'open');
  assert.deepEqual(view.avatars.missing.filter(m=>m.redo).map(m=>m.expression),['mosoly']);
  assert.equal(view.profile.state,'done');

  // Listing and closing.
  assert.equal((await call('/api/character-orders')).data.orders.length,1);
  assert.equal((await call('/api/character-orders/'+o.order_id+'/cancel',{})).data.status,'cancelled');
  assert.equal((await mcp('orders_list')).data.open,0);

  // Scene gallery: ticked sets, content per picture and per scene; shared scenes link Palor too.
  const scenePics=[{name:'a.png',data_url:dataUrl(PNG),content:'nudity'}];
  assert.equal((await call('/api/character-orders',{name:'Teszt Bandi',pictures:scenePics,profile:false,with_palor:true})).status,409,'no Palor yet');
  assert.equal((await call('/api/characters',{name:'Palor'})).status<300,true);
  const s=(await call('/api/character-orders',{name:'Teszt Bandi',description:'Humanoid szörny a hegyekből.',pictures:scenePics,profile:false,avatars:false,solo_set:true,with_palor:true,scene_content:{coffee:'sexual_activity'}})).data;
  assert.equal(s.gallery.want,12);assert.equal(s.gallery.state,'open');
  assert.equal(s.gallery.scenes.find(x=>x.scene==='coffee').content,'sexual_activity');assert.equal(s.gallery.scenes.find(x=>x.scene==='selfie').with_palor,false);
  const bandiSrc=app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(s.source_pictures[0].media_id).relative_path;
  assert.equal(path.basename(bandiSrc),`Teszt Bandi - forrás - meztelen - ${day}-1.png`,'content chosen per picture');
  assert.equal((await mcp('order_picture_save',{order_id:s.order_id,media_id:s.source_pictures[0].media_id})).status,400,'scene is required');
  // No origin gate in the Szereplőgyár (owner): the intimate shared scene is made as chosen.
  assert.equal(s.gallery.scenes.find(x=>x.scene==='coffee').state,'open');
  const coffee=(await mcp('order_picture_save',{order_id:s.order_id,scene:'coffee',media_id:s.source_pictures[0].media_id})).data;
  assert.equal(coffee.file,`Palor + Teszt Bandi - közös kávé - szex - ${day}-1.png`,JSON.stringify(coffee));
  const shared=(await mcp('order_picture_save',{order_id:s.order_id,scene:'walk',media_id:s.source_pictures[0].media_id,content:'sexual_activity'})).data;
  assert.equal(shared.file,`Palor + Teszt Bandi - séta - hetkoznapi - ${day}-1.png`,'Palor first, scene label, the scene content wins');
  const palorId=app.db.prepare("SELECT id FROM characters WHERE name='Palor'").get().id;
  assert.ok(app.db.prepare('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?').get(shared.media_id,palorId),'Palor linked');
  assert.equal((await mcp('order_picture_save',{order_id:s.order_id,scene:'walk',media_id:s.source_pictures[0].media_id})).status,409,'scene already done');
  // Life moments for existing characters: daily + shirtless always, Palor scenes only with a recorded relationship.
  const lajos=(await call('/api/characters',{name:'Teszt Lajos',gender:'férfi'})).data,feri=(await call('/api/characters',{name:'Teszt Feri',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),feri.id,palorId,'Régi edzőtársak, hetente együtt futnak.');
  const cands=(await call('/api/character-orders/life')).data.characters;
  assert.equal(cands.some(c=>c.name==='Palor'),false,'not for Palor');assert.equal(cands.find(c=>c.id===feri.id).relationship,true);assert.equal(cands.find(c=>c.id===lajos.id).relationship,false);
  const onlyPalor=(await call('/api/character-orders/life',{character_ids:[lajos.id],daily:false,shirtless:false})).data;
  assert.deepEqual([onlyPalor.made.length,onlyPalor.skipped[0].reason],[0,'no_relationship'],'no relationship → nothing invented');
  const lifeL=(await call('/api/character-orders/life',{character_ids:[lajos.id]})).data.made[0];
  assert.equal(lifeL.kind,'life');assert.equal(lifeL.relationship_with_palor,'none recorded: do not invent one');
  assert.equal(lifeL.gallery.want,11);assert.equal(lifeL.gallery.scenes.filter(x=>x.with_palor).length,0,'no Palor without a relationship');
  assert.equal(lifeL.gallery.scenes.filter(x=>x.content==='nudity').length,6);
  const lifeF=(await call('/api/character-orders/life',{character_ids:[feri.id]})).data.made[0];
  assert.equal(lifeF.gallery.want,14);assert.equal(lifeF.gallery.scenes.filter(x=>x.with_palor).length,6,'3 relationship + 3 shirtless with Palor');
  assert.deepEqual(lifeF.relationship_with_palor.notes,['Régi edzőtársak, hetente együtt futnak.']);
  assert.equal((await call('/api/character-orders/life',{character_ids:[feri.id]})).data.skipped[0].reason,'open','one open life order per character');
  const forGpt2=(await mcp('orders_list',{for:'chatgpt'})).data;assert.ok(forGpt2.orders.some(x=>x.order_id===lifeF.order_id),'ChatGPT gets life orders');
  assert.equal((await mcp('orders_list',{for:'grok'})).data.orders.some(x=>x.order_id===lifeF.order_id),false,'Grok does not');
  // A new approved shared event → its own order with one picture of that moment.
  const ev=randomUUID();
  app.db.prepare('INSERT INTO story_events VALUES(?,?,?,?,?,?)').run(ev,1,'k-'+ev,'h',null,new Date().toISOString());
  app.db.prepare('INSERT INTO story_event_revisions VALUES(?,?,?,?,?,?,?)').run(ev,1,'approved',JSON.stringify({title:'Közös futás a Velencei-tónál',summary:'Feri és Palor együtt futnak le tíz kilométert.'}),'test','test',new Date().toISOString());
  for(const id of [feri.id,palorId])app.db.prepare('INSERT INTO story_event_participants VALUES(?,?,?,?)').run(ev,id,'participant',1);
  const auto=(await call('/api/character-orders')).data.orders.filter(x=>x.character_id===feri.id&&x.kind==='palor_event');
  assert.equal(auto.length,1);assert.equal(auto[0].gallery.want,1);assert.match(auto[0].gallery.scenes[0].default_idea,/Velencei-tónál/);
  assert.equal((await call('/api/character-orders')).data.orders.filter(x=>x.kind==='palor_event').length,1,'an event is ordered once');
  const couch=(await mcp('order_picture_save',{order_id:lifeF.order_id,scene:'bare_couch',media_id:s.source_pictures[0].media_id})).data;
  assert.equal(couch.file,`Palor + Teszt Feri - kanapén - meztelen - ${day}-1.png`,JSON.stringify(couch));
  const lifePic=(await mcp('order_picture_save',{order_id:lifeF.order_id,scene:'palor_1',media_id:s.source_pictures[0].media_id})).data;
  assert.equal(lifePic.saved,true,JSON.stringify(lifePic));assert.equal(lifePic.file,`Palor + Teszt Feri - közös pillanat - hetkoznapi - ${day}-1.png`);
  assert.equal(lifePic.face.state,'unchecked','no approved references yet');

  const ref=(await mcp('order_picture_save',{order_id:s.order_id,scene:'selfie',outcome:'refused',note:'no'})).data;
  assert.equal(ref.gallery.scenes.find(x=>x.scene==='selfie').state,'refused');assert.equal(ref.gallery.have+ref.gallery.refused,3);assert.equal(ref.gallery.state,'open');
});
