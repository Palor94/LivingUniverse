import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

// A distinct, valid 2×2 PNG per colour (different bytes → different media).
function png(r,g,b,text=null){
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,r,g,b,r,g,b,0,r,g,b,r,g,b]))),...(text?[chunk('tEXt',Buffer.from(text,'latin1'))]:[]),chunk('IEND',Buffer.alloc(0))]);
}
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('Play picture pipeline over MCP: owner-declared collection origin, approvals, briefs, jobs and placing',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-assets-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  // Links Grok hands back: one serves a PNG, anything else is not downloadable.
  const fetched=[];
  const assetDownload=async url=>{fetched.push(url);if(url!=='https://imgs.example/x.png')throw Object.assign(new Error('The address could not be downloaded.'),{status:400});return {stream:(async function*(){yield png(1,2,3);})()};};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>new Date('2026-11-10T13:00:00'),assetDownload});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args={})=>call('/api/mcp-backgrounds',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const mk=async(name,bio)=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;await call(`/api/characters/${c.id}/profile-field`,{field:'biography',value:bio});return c;};
  const palor=await mk('Palor','Nem: férfi.'),inv=await mk('Teszt Aladár','Nem: férfi.\nKitalált karakter.'),legacy=await mk('Teszt Béla','Nem: férfi.\nA bolt pénztárosa.');
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('55555555-5555-4555-8555-555555555555',legacy.id,palor.id,'Palor egykori osztálytársa.');
  for(const c of [inv,legacy])app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Cél.'),weekly_routine:entry('Rutin.')},history:[],proposals:[]}));
  const cafe=(await call('/api/locations',{name:'Teszt kávézó',kind:'tag'})).data;
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes:[{id:'n-cafe',name:'Teszt kávézó',parent_id:null,kind:'place',source_id:cafe.id,placed:true,archived:false,order:0}]}}]}));

  // Fictional collection fixtures carry misleading legacy AI/camera metadata.
  // Their declared origin is identical; reference approval remains separate.
  await fs.mkdir(path.join(root,'Refs'),{recursive:true});
  await fs.writeFile(path.join(root,'Refs','gen.png'),png(50,60,70,'c2pa\0jumb\0digitalSourceType http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'));
  await fs.writeFile(path.join(root,'Refs','cam1.png'),png(80,90,100,'Make\0Apple\0Model\0iPhone 15'));
  await fs.writeFile(path.join(root,'Refs','cam2.png'),png(81,91,101,'Make\0Apple\0Model\0iPhone 14'));
  await call('/api/scan',{});
  const refId=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
  const canon=(cid,ids)=>{app.db.prepare('INSERT INTO canon(id,character_id,parent_id,appearance,references_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),cid,null,'Magas, szakállas.',JSON.stringify(ids.map(id=>({media_id:id,role:'face'}))),'teszt',new Date().toISOString());for(const mid of ids)app.db.prepare('INSERT OR IGNORE INTO depictions VALUES(?,?)').run(mid,cid);};
  canon(inv.id,[refId['gen.png'],refId['cam1.png']]);canon(legacy.id,[refId['cam2.png']]);
  // Old metadata does not override the collection-wide owner declaration.
  const invOrigin=(await mcp('character_origin',{character_id:inv.id})).data,legacyOrigin=(await mcp('character_origin',{character_id:legacy.id})).data;
  assert.equal(invOrigin.reference_photos_allowed,true);assert.deepEqual(invOrigin.reference_proofs,{owner_declared_fictional_ai:2});
  assert.equal(legacyOrigin.reference_photos_allowed,true);assert.deepEqual(legacyOrigin.reference_proofs,{owner_declared_fictional_ai:1});
  assert.equal(legacyOrigin.origin_basis,'owner_declaration');assert.equal(legacyOrigin.independently_verified,false);
  assert.equal(legacyOrigin.origin_policy.grants_provider_permission,false);
  // Every approved in-scope image is origin-eligible, independently of old metadata.
  assert.deepEqual((await mcp('brief',{target:'figure',character_id:inv.id})).data.references.map(r=>r.media_id).sort(),[refId['gen.png'],refId['cam1.png']].sort());
  assert.equal(invOrigin.everyday_references_allowed,true);assert.equal(legacyOrigin.everyday_references_allowed,true);
  // A new assigned collection image is a candidate even without usable credentials; nothing is approved.
  await fs.writeFile(path.join(root,'Refs','gen2.png'),png(55,65,75));await call('/api/scan',{});
  const gen2=app.db.prepare('SELECT id FROM media WHERE relative_path=?').get(path.join('Refs','gen2.png')).id;
  await call('/api/media/bulk',{operation:'assign',media_ids:[gen2,refId['cam2.png']],character_ids:[legacy.id]});
  const cands=(await call('/api/play/generation/candidates')).data.characters;
  assert.deepEqual(cands.find(c=>c.character_id===legacy.id)?.media_ids,[gen2],'only the unapproved candidate, not already approved images');
  assert.equal((await mcp('reference_candidates',{})).data.characters.length,cands.length);
  assert.equal((await mcp('character_origin',{character_id:legacy.id})).data.reference_photos_allowed,true);
  assert.deepEqual((await mcp('visual_pack',{character_id:legacy.id})).data.references.map(r=>r.media_id),[refId['cam2.png']],'the candidate was not auto-approved');
  assert.equal((await mcp('character_origin',{character_id:palor.id})).data.reference_photos_allowed,false,'no in-scope reference is assigned to Palor yet');

  // Needs reflect declared collection origin, regardless of old record wording.
  let needs=(await mcp('needs',{})).data.needs;
  const has=(target,id)=>needs.some(n=>n.target===target&&(n.character_id===id||n.location_id===id));
  assert.ok(has('figure',inv.id)&&has('figure',legacy.id)&&has('figure',palor.id));
  assert.ok(has('background',cafe.id));assert.ok(has('scene',inv.id));assert.ok(has('scene',legacy.id),'legacy origin text no longer vetoes collection fiction');
  assert.equal(needs[0].target,'figure','base figures first');

  const legacyBrief=(await mcp('brief',{target:'figure',character_id:legacy.id})).data;
  assert.equal(legacyBrief.reference_policy,'approved_references');assert.deepEqual(legacyBrief.references.map(r=>r.media_id),[refId['cam2.png']]);
  const sceneInv=(await mcp('brief',{target:'scene',character_id:inv.id,location_id:cafe.id})).data;
  assert.ok(sceneInv.references.some(r=>r.media_id===refId['cam1.png']),'camera-like metadata does not override the declaration');
  assert.ok(sceneInv.references.every(r=>r.proof==='owner_declared_fictional_ai'&&r.media_id!==gen2));
  assert.match((await mcp('brief',{target:'figure',character_id:inv.id,expression:'mosoly'})).data.prompt,/warm, genuine smile/);
  assert.equal((await mcp('brief',{target:'figure',character_id:inv.id,expression:'vigyor'})).status,400);

  // Import a picture the normal way (catalogue), then finish a job with it: placed as alap.png.
  await fs.mkdir(path.join(root,'Import'),{recursive:true});
  for(const [file,bytes] of [['a.png',png(200,10,10)],['b.png',png(10,200,10)],['c.png',png(10,10,200)]])await fs.writeFile(path.join(root,'Import',file),bytes);
  await call('/api/scan',{});
  const media=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
  const job=(await mcp('job_start',{target:'figure',character_id:inv.id})).data;
  assert.ok(job.job_id);assert.equal(job.save.file,'alap.png');
  const done=(await mcp('job_finish',{job_id:job.job_id,outcome:'done',media_id:media['a.png'],model:'grok-imagine'})).data;
  assert.equal(done.placed.file,'alap.png');assert.ok(done.placed.sprite_id);
  assert.deepEqual(await fs.readFile(path.join(root,'Szereplő-alakok','Teszt Aladár','alap.png')),png(200,10,10));
  assert.equal((await mcp('job_finish',{job_id:job.job_id,outcome:'done',media_id:media['a.png']})).status,409,'a job closes once');
  // The uploaded source of a figure is not a picture to sort (owner report 2026-11-10).
  assert.ok(!(await call('/api/media?inbox=1')).data.items.some(m=>m.id===media['a.png']),'not in Rendezésre vár');
  assert.ok((await call('/api/media?inbox=1')).data.items.some(m=>m.id===media['b.png']),'ordinary pictures still are');
  // Nor in any other sorting list: quick-tag locations, the Képműhely inbox, the content-level queue (owner 2026-11-12).
  const qt=(await call('/api/quick-tag/locations?untagged=1&limit=500')).data.items.map(i=>i.media_id);
  assert.ok(!qt.includes(media['a.png'])&&qt.includes(media['b.png']),'quick-tag location list');
  const ws=(await call('/api/workshop/inbox?missing=any&limit=100')).data.items.map(i=>i.media_id);
  assert.ok(!ws.includes(media['a.png']),'Képműhely inbox');
  assert.ok(!app.db.prepare("SELECT 1 FROM active_media m WHERE m.id=? AND NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id)").get(media['a.png']),'marked as a figure source');
  needs=(await mcp('needs',{target:'figure'})).data.needs;
  assert.ok(!needs.some(n=>n.character_id===inv.id&&n.expression==='alap'&&!n.outfit));assert.ok(needs.some(n=>n.character_id===inv.id&&n.expression!=='alap'&&!n.outfit),'then expressions');
  // A second, different picture replaces alap.png (owner, 2026-11-10); the old file is backed up
  // outside the media folder first, and a leftover version (alap-2.png) is cleared too.
  const figDir=path.join(root,'Szereplő-alakok','Teszt Aladár');
  await fs.writeFile(path.join(figDir,'alap-2.png'),png(1,1,1));
  const again=(await mcp('place_asset',{media_id:media['b.png'],target:'figure',character_id:inv.id,expression:'alap'})).data;
  assert.equal(again.file,'alap.png');assert.equal(again.expression,'alap');
  assert.deepEqual(await fs.readFile(path.join(figDir,'alap.png')),png(10,200,10));
  assert.deepEqual((await fs.readdir(figDir)).sort(),['alap.png']);
  const kept=path.join(dataDir,'backups','figures','Teszt Aladár'),[stamp]=await fs.readdir(kept);
  assert.deepEqual((await fs.readdir(path.join(kept,stamp))).sort(),['alap-2.png','alap.png']);
  assert.deepEqual(await fs.readFile(path.join(kept,stamp,'alap.png')),png(200,10,10),'the previous figure is kept in the backup');
  // The same picture again changes nothing and makes no new backup.
  await mcp('place_asset',{media_id:media['b.png'],target:'figure',character_id:inv.id,expression:'alap'});
  assert.equal((await fs.readdir(kept)).length,1);

  // Shirtless set (2026-11-11): offered once the dressed base exists, saved into "felmeztelen",
  // never touching the dressed figure; a dressed job is not reused for it.
  needs=(await mcp('needs',{target:'figure'})).data.needs;
  assert.ok(needs.some(n=>n.character_id===inv.id&&n.outfit==='shirtless'&&n.expression==='alap'));
  const bareJob=(await mcp('job_start',{target:'figure',character_id:inv.id,expression:'alap',outfit:'shirtless'})).data;
  assert.equal(bareJob.outfit,'shirtless');assert.match(bareJob.prompt,/Clothing: shirtless/);assert.equal(path.basename(bareJob.save.folder),'felmeztelen');
  assert.equal(bareJob.content_expected,'non_intimate');
  assert.equal((await mcp('job_start',{target:'figure',character_id:inv.id,outfit:'naked'})).status,400);
  // Waist-up intimate figure: its own prompt and folder, only a few expressions.
  const close=(await mcp('brief',{target:'figure',character_id:inv.id,expression:'alap',outfit:'intimate'})).data;
  assert.match(close.prompt,/waist-up character figure/);assert.match(close.prompt,/nothing below the waist is in the frame/);assert.doesNotMatch(close.prompt,/full body from head to toe/);
  assert.equal(path.basename(close.save.folder),'intim');
  assert.equal((await mcp('brief',{target:'figure',character_id:inv.id,expression:'nevet',outfit:'intimate'})).status,400);
  const bareDone=(await mcp('job_finish',{job_id:bareJob.job_id,outcome:'done',media_id:media['c.png']})).data;
  assert.equal(bareDone.placed.outfit,'shirtless');
  assert.deepEqual(await fs.readFile(path.join(figDir,'felmeztelen','alap.png')),png(10,10,200));
  assert.deepEqual(await fs.readFile(path.join(figDir,'alap.png')),png(10,200,10),'the dressed figure is untouched');
  needs=(await mcp('needs',{target:'figure'})).data.needs;
  assert.ok(!needs.some(n=>n.character_id===inv.id&&n.outfit==='shirtless'&&n.expression==='alap'));
  assert.ok(needs.some(n=>n.character_id===inv.id&&n.outfit==='shirtless'&&n.expression!=='alap'),'then shirtless expressions');

  // A refusal is recorded and the item is left alone for a week (no automatic retry).
  const bg=(await mcp('job_start',{target:'background',location_id:cafe.id})).data;
  assert.equal(bg.time_of_day,'nappal');
  assert.equal((await mcp('job_finish',{job_id:bg.job_id,outcome:'refused',note:'declined by the generator'})).data.status,'refused');
  assert.ok(!(await mcp('needs',{target:'background'})).data.needs.some(n=>n.location_id===cafe.id));
  // Background placed directly carries its time of day in the file name.
  const night=(await mcp('place_asset',{media_id:media['c.png'],target:'background',location_id:cafe.id,time_of_day:'ejjel'})).data;
  assert.match(app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(night.placed_media_id).relative_path,/ejjel-/);

  // No assigned collection media still blocks non-everyday placement.
  assert.equal((await mcp('place_asset',{media_id:media['b.png'],target:'scene',character_id:palor.id,content:'nudity'})).status,403);
  assert.equal((await mcp('place_asset',{media_id:media['b.png'],target:'scene',character_id:legacy.id,content:'nudity'})).status,200);
  assert.equal((await mcp('place_asset',{media_id:media['b.png'],target:'scene',character_id:legacy.id,content:'non_intimate'})).status,200);
  assert.equal((await mcp('place_asset',{media_id:media['c.png'],target:'scene',character_id:inv.id,location_id:cafe.id,content:'nudity'})).status,200);

  const jobs=(await mcp('jobs',{})).data;assert.deepEqual([jobs.counts.done,jobs.counts.refused],[2,1],'dressed alap + shirtless alap done, one refused');
  // Visual pack: one call per character; sources of placed pictures never show as his photos.
  const pack=(await mcp('visual_pack',{character_id:inv.id})).data;
  assert.equal(pack.reference_photos_allowed,true);assert.ok(pack.figures.have.includes('alap'));assert.ok(pack.figures.missing.includes('mosoly'));
  // Visual packs expose the same declared origin and exact approved input set.
  const legacyPack=(await mcp('visual_pack',{character_id:legacy.id})).data;
  assert.deepEqual(legacyPack.references.map(r=>r.media_id),[refId['cam2.png']]);assert.equal(legacyPack.reference_photos_allowed,true);assert.equal(legacyPack.origin_basis,'owner_declaration');
  assert.ok(app.db.prepare('SELECT 1 FROM play_asset_sources WHERE media_id=?').get(media['a.png']));
  // The source upload gets a note about where its copy went.
  assert.match(app.db.prepare('SELECT notes FROM media_notes WHERE media_id=?').get(media['a.png']).notes,/Szereplő-alakok/);
  // Only the owner (desktop) can offer a refused item again; then it is a need again.
  const panel=(await call('/api/play/generation')).data;assert.ok(panel.jobs.some(j=>j.status==='refused'));
  assert.equal((await call(`/api/play/generation/jobs/${bg.job_id}/clear`,{})).data.status,'cleared');
  assert.ok((await mcp('needs',{target:'background'})).data.needs.some(n=>n.location_id===cafe.id));
  // A batch opens several jobs from the top of the list.
  const batch=(await mcp('job_batch',{target:'figure',count:2})).data;
  assert.equal(batch.jobs.length,2);assert.ok(batch.jobs.every(j=>j.job_id&&j.prompt));

  // Hand-back by public link (2026-11-10): background without any character link.
  const bgJob=(await mcp('job_start',{target:'background',location_id:cafe.id,time_of_day:'este'})).data;
  assert.equal((await mcp('job_finish',{job_id:bgJob.job_id,outcome:'done',url:'https://imgs.example/x.png',media_id:media['a.png']})).status,400,'url or media_id, not both');
  assert.equal((await mcp('job_finish',{job_id:bgJob.job_id,outcome:'done',url:'http://imgs.example/x.png'})).status,400,'https only');
  assert.equal((await mcp('job_finish',{job_id:bgJob.job_id,outcome:'done',url:'https://login.example/private.png'})).status,400,'a link that needs login fails; the job stays open');
  const byLink=(await mcp('job_finish',{job_id:bgJob.job_id,outcome:'done',url:'https://imgs.example/x.png',model:'grok-imagine'})).data;
  assert.equal(byLink.status,'done');assert.equal(byLink.placed.time_of_day,'este');
  assert.match(app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(byLink.placed.placed_media_id).relative_path,/este-/);
  assert.equal((await mcp('place_asset',{target:'figure',character_id:'00000000-0000-4000-8000-000000000000',url:'https://imgs.example/x.png'})).status,404);
  assert.equal(fetched.filter(u=>u==='https://imgs.example/x.png').length,1,'no download before the cheap checks pass');
  // A figure by link has no catalogue original.
  const figLink=(await mcp('place_asset',{target:'figure',character_id:legacy.id,expression:'alap',url:'https://imgs.example/x.png'})).data;
  assert.equal(figLink.file,'alap.png');assert.ok(!app.db.prepare('SELECT 1 FROM play_asset_sources WHERE media_id IS NULL').get());
  // ChatGPT file parameter: the picture from the chat as {download_url,file_id}; downloaded like a link.
  const chatJob=(await mcp('job_start',{target:'figure',character_id:legacy.id,expression:'mosoly',outfit:'shirtless'})).data;
  assert.equal((await mcp('job_finish',{job_id:chatJob.job_id,outcome:'done',image:{download_url:'https://imgs.example/x.png',file_id:'file_1'},url:'https://imgs.example/x.png'})).status,400,'only one source');
  assert.equal((await mcp('job_finish',{job_id:chatJob.job_id,outcome:'done',image:{file_id:'file_1'}})).status,400,'needs download_url');
  const byFile=(await mcp('job_finish',{job_id:chatJob.job_id,outcome:'done',image:{download_url:'https://imgs.example/x.png',file_id:'file_1',mime_type:'image/png',file_name:'a.png'},model:'ChatGPT'})).data;
  assert.equal(byFile.status,'done');assert.equal(byFile.placed.outfit,'shirtless');assert.equal(byFile.placed.file,'mosoly.png');
  assert.equal(path.basename(byFile.placed.folder),'felmeztelen');
  // Saved into the folder by the owner instead: the open job closes itself.
  const handJob=(await mcp('job_start',{target:'figure',character_id:palor.id})).data;
  await fs.mkdir(path.join(root,handJob.save.folder),{recursive:true});await fs.writeFile(path.join(root,handJob.save.folder,'alap.png'),png(9,9,9));
  await call('/api/sprites/scan',{}).catch(()=>{});
  const closed=(await mcp('jobs',{})).data.jobs.find(j=>j.id===handJob.job_id);
  assert.equal(closed.status,'done');assert.match(closed.note,/outside the job/);
  // The full instructions come over MCP.
  const ins=(await mcp('instructions',{})).data;assert.match(ins.instructions,/get_approved_references/);assert.ok(ins.version);
  assert.equal((await mcp('instructions',{x:1})).status,400);
  const doc=await fs.readFile(new URL('../docs/GROK_GENERATION_PROMPT.md',import.meta.url),'utf8');
  assert.ok(doc.includes(ins.instructions)&&doc.includes(ins.version),'the pasteable copy matches what the tool serves');

  // The Grok gateway's MCP client sees and routes the new tools.
  const writeConfig=path.join(dataDir,'mcp-writes.json');
  await fs.writeFile(writeConfig,JSON.stringify({enabled:true,approval_mode:'trusted',app_url:base,token:config.token,database_id:config.database_id,origin:config.origin}));
  const {createWriteClient}=await import('../mcp/writes.mjs');const {backgroundTools}=await import('../mcp/backgrounds.mjs');
  const writer=await createWriteClient({database:path.join(dataDir,'universe.sqlite'),writeConfig});
  assert.ok(backgroundTools.some(x=>x.name==='finish_generation_job'));
  assert.match((await writer.call('get_generation_instructions',{})).data.instructions,/Living Universe/);
  assert.ok(backgroundTools.find(x=>x.name==='finish_generation_job').inputSchema.properties.url);
  assert.ok((await writer.call('list_generation_needs',{})).data.needs.length>0);
  assert.equal((await writer.call('get_character_origin',{character_id:legacy.id})).data.reference_photos_allowed,true);
  const originTool=backgroundTools.find(x=>x.name==='get_character_origin');
  assert.match(originTool.description,/owner declaration/);assert.equal(originTool.annotations.readOnlyHint,true);
});
