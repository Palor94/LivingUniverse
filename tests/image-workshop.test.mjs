import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

function png(r,g,b){
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,r,g,b,r,g,b,0,r,g,b,r,g,b]))),chunk('IEND',Buffer.alloc(0))]);
}
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('Képműhely: inbox steps, carry-over suggestions, checks feed back into briefs, readiness, tagging and benchmark plans',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-workshop-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const assetDownload=async()=>({stream:(async function*(){yield png(7,7,7);})()});
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>new Date('2026-11-10T13:00:00'),assetDownload});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args={})=>call('/api/mcp-backgrounds',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const mk=async(name,bio)=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;await call(`/api/characters/${c.id}/profile-field`,{field:'biography',value:bio});return c;};
  const palor=await mk('Palor','Nem: férfi.'),inv=await mk('Teszt Aladár','Nem: férfi.\nKitalált karakter.');
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+inv.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Rutin.')},history:[],proposals:[]}));
  const cafe=(await call('/api/locations',{name:'Teszt kávézó',kind:'tag'})).data;
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n-cafe',name:'Teszt kávézó',parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0}]}}]}));

  // Six pictures in one folder: four linked to Aladár, two not; two of them near-duplicates.
  await fs.mkdir(path.join(root,'Aladar'),{recursive:true});
  for(let i=0;i<6;i++)await fs.writeFile(path.join(root,'Aladar',`k${i}.png`),png(20+i*30,40,60));
  await call('/api/scan',{});
  const id=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
  await call('/api/media/bulk',{operation:'assign',media_ids:['k0.png','k1.png','k2.png','k3.png'].map(f=>id[f]),character_ids:[inv.id]});

  // Inbox: nothing analysed yet, so every item is waiting; the next step is the local signals.
  let box=(await call('/api/workshop/inbox')).data;
  assert.equal(box.counts.total,6);assert.equal(box.counts.ready,0);assert.equal(box.counts.signals,6);
  assert.ok(box.items.every(i=>i.next==='signals'));
  const sig=app.db.prepare("INSERT INTO media_signals(media_id,dhash,group_id,frames,updated_at) VALUES(?,?,?,0,'x')");
  for(const f of ['k0.png','k1.png','k2.png','k3.png','k5.png'])sig.run(id[f],'0000000000000000',null);
  sig.run(id['k4.png'],'0000000000000001','g1');app.db.prepare("UPDATE media_signals SET group_id='g1' WHERE media_id=?").run(id['k0.png']);
  box=(await call('/api/workshop/inbox?missing=duplicate')).data;
  assert.deepEqual(box.items.map(i=>i.file).sort(),['k0.png','k4.png'],'both members of an open near-duplicate pair');
  // "Nobody on it" settles the people step; the content level settles the last required one.
  assert.equal((await call('/api/workshop/inbox/no-characters',{media_id:id['k5.png'],value:true})).status,200);
  await call('/api/play/content',{media_id:id['k5.png'],level:'non_intimate'});
  box=(await call('/api/workshop/inbox?missing=ready')).data;
  assert.deepEqual(box.items.map(i=>i.file),['k5.png']);assert.equal(box.items[0].next,'tagged','AI tags are optional');
  assert.equal((await call('/api/workshop/inbox?missing=nonsense')).status,400);
  assert.equal((await call('/api/workshop/inbox/no-characters',{media_id:{},value:true})).status,404);

  // Suggestions: the duplicate pair carries Aladár's link and level to k4; nothing applied by itself.
  await call('/api/play/content',{media_id:id['k0.png'],level:'nudity'});
  let sug=(await call('/api/workshop/suggestions')).data.suggestions;
  const people=sug.find(s=>s.kind==='people'&&s.reason==='duplicate'),content=sug.find(s=>s.kind==='content');
  assert.deepEqual(people.media_ids,[id['k4.png']]);assert.deepEqual(people.character_ids,[inv.id]);
  assert.equal(content.level,'nudity');assert.deepEqual(content.media_ids,[id['k4.png']]);
  assert.ok(!app.db.prepare('SELECT 1 FROM depictions WHERE media_id=?').get(id['k4.png']),'a suggestion changes nothing');
  await call('/api/workshop/suggestions/dismiss',{key:content.key});
  sug=(await call('/api/workshop/suggestions')).data.suggestions;assert.ok(!sug.some(s=>s.key===content.key),'dismissed stays away');

  // Paid tagging priority: a plan file and the commands, nothing sent.
  const tag=(await call('/api/workshop/tagging')).data;assert.equal(tag.untagged,6);assert.equal(tag.per_image_usd,null,'no measured calls yet: unknown, never free');
  const plan=(await call('/api/workshop/tagging/plan',{limit:3})).data;
  assert.equal(plan.count,3);assert.match(plan.estimate_command,/--ids-file/);assert.match(plan.trial_command,/--ack-upload --ack-cost --ack-adult --max-usd/);
  assert.equal(JSON.parse(await fs.readFile(plan.file,'utf8')).media_ids.length,3);
  // The tagging CLI takes that list in its order; the estimate makes no call.
  const cli=spawnSync(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),'..','app','run-vision-tag.mjs'),'--estimate','--database',path.join(dataDir,'universe.sqlite'),'--media-root',root,'--ids-file',plan.file,'--limit','3','--report',path.join(temp,'r.json')],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''}});
  assert.equal(cli.status,0,cli.stderr);const est=JSON.parse(cli.stdout);assert.equal(est.images,3);assert.equal(est.live_calls,0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp,'r.json'),'utf8')).items.map(i=>i.media_id),JSON.parse(await fs.readFile(plan.file,'utf8')).media_ids);

  // Generated figure by link → shows up in Ellenőrzés; a rejection takes it out of use, the
  // need comes back, and the next brief carries the owner's note.
  await mcp('place_asset',{target:'figure',character_id:inv.id,expression:'alap',url:'https://imgs.example/a.png'});
  let checks=(await call('/api/workshop/checks')).data.items;const fig=checks.find(c=>c.target==='figure');
  assert.ok(fig&&fig.item_key.startsWith('sprite:'));assert.equal(fig.name,'Teszt Aladár');
  assert.ok(!(await mcp('needs',{target:'figure'})).data.needs.some(n=>n.character_id===inv.id&&n.expression==='alap'&&!n.outfit));
  assert.equal((await call('/api/workshop/checks',{item_key:fig.item_key,verdict:'reject',face:'mismatch',body:'match'})).status,400,'a rejection says why');
  const rej=(await call('/api/workshop/checks',{item_key:fig.item_key,verdict:'regenerate',face:'mismatch',body:'match',note:'Az arca túl fiatal.'})).data;
  assert.ok(rej.job_id);assert.equal(rej.remove_media,null,'figures are not catalogue media');
  const sprites=app.db.prepare("SELECT count(*) n FROM character_sprites WHERE character_id=? AND missing=0").get(inv.id).n;assert.equal(sprites,1,'the file stays');
  const brief=(await mcp('brief',{target:'figure',character_id:inv.id})).data;assert.deepEqual(brief.owner_feedback,['Az arca túl fiatal.']);
  const open=(await mcp('jobs',{status:'open'})).data.jobs.find(j=>j.id===rej.job_id);assert.equal(open.brief.owner_note,'Az arca túl fiatal.');
  // Asking again reuses the open job.
  const again=(await call('/api/workshop/generation/open',{target:'figure',character_id:inv.id,expression:'alap',note:'Szakáll kell.'})).data;
  assert.equal(again.job_id,rej.job_id);assert.equal(again.reused,true);
  assert.ok(!(await call('/api/workshop/checks')).data.items.some(c=>c.item_key===fig.item_key),'checked items leave the open list');
  assert.ok((await call('/api/workshop/checks?status=done')).data.items.some(c=>c.item_key===fig.item_key));

  // Generation queue and brief for the desktop.
  const gen=(await call('/api/workshop/generation')).data;assert.ok(gen.needs.length&&Array.isArray(gen.jobs));
  assert.ok((await call('/api/workshop/generation/brief?'+new URLSearchParams({target:'background',location_id:cafe.id}))).data.prompt);

  // Readiness: Aladár lacks references and a usable figure; the next fix is named.
  const ready=(await call('/api/workshop/readiness')).data.characters;const al=ready.find(c=>c.character_id===inv.id);
  assert.ok(al.score<100);assert.equal(al.checks.find(c=>c.id==='figure').ok,false,'the rejected figure does not count');assert.ok(al.next.fix);
  // Benchmark: nothing reviewed yet → nothing to save; the estimate is shown.
  const bm=(await call('/api/workshop/benchmark')).data;assert.equal(bm.count,0);assert.ok(bm.estimate);
  assert.equal((await call('/api/workshop/benchmark',{})).status,409);
});
