import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {validateStory} from '../app/play-stories.mjs';
import {travelMinutes} from '../app/place-network.mjs';

// A small valid story: two branches that meet again, two endings, longest path 5 blocks.
const story=(id,setting='road',extra={})=>{
  const c=(a,b)=>[{key:'A',text:'Az első lehetőség.',to:a},{key:'B',text:'A második lehetőség.',to:b}];
  return {id,title:'Teszt '+id,setting,content:'everyday',start:'s1',nodes:{
    s1:{text:'Egy idegen férfi integet az út szélén.',choices:c('s2','s3')},s2:{text:'Megállsz.',choices:c('s4','s5')},s3:{text:'Továbbmész.',choices:c('s4','s5')},
    s4:{text:'Beszélgettek.',choices:c('s6','s7')},s5:{text:'Hallgattok.',choices:c('s6','s7')},s6:{text:'Elbúcsúztok.',choices:c('e1','e2')},s7:{text:'Kezet fogtok.',choices:c('e1','e2')},
    e1:{text:'Jó volt.',ending:'good'},e2:{text:'Ennyi.',ending:'neutral'}},...extra};
};

test('story check: shape, reachability, loops, endings, adults only, men only',()=>{
  assert.deepEqual(validateStory(story('ok-story')),[]);
  const loop=story('loop');loop.nodes.s6.choices[0].to='s1';
  assert.match(validateStory(loop).join(' '),/körbe fut/);
  const missing=story('missing');missing.nodes.s2.choices[1].to='nope';
  assert.match(validateStory(missing).join(' '),/nem létező blokkra/);
  const lonely=story('lonely');lonely.nodes.x1={text:'Senki nem jut ide.',choices:[{key:'A',text:'a',to:'e1'},{key:'B',text:'b',to:'e2'}]};
  assert.match(validateStory(lonely).join(' '),/Elérhetetlen blokkok: x1/);
  const oneEnd=story('one-end');oneEnd.nodes.e2={text:'Még nem vége.',choices:[{key:'A',text:'a',to:'e1'},{key:'B',text:'b',to:'e1'}]};
  assert.match(validateStory(oneEnd).join(' '),/két befejezés/);
  const young=story('young');young.nodes.s2.text='A srác 17 éves.';
  assert.match(validateStory(young).join(' '),/felnőtt/);
  const woman=story('woman');woman.nodes.s3.text='Egy nő áll a buszmegállóban.';
  assert.match(validateStory(woman).join(' '),/csak férfiak/);
  const keys=story('keys');keys.nodes.s1.choices[1].key='C';
  assert.match(validateStory(keys).join(' '),/A, B, C, D/);
  assert.match(validateStory({...story('bad-setting'),setting:'mars'}).join(' '),/setting/);
});

test('travel minutes: stepping out onto the town street is short',()=>{
  const byId=new Map([['t',{id:'t',name:'Budapest',kind:'place'}],['h',{id:'h',name:'Kávézó',parent_id:'t',kind:'place'}]]);
  assert.equal(travelMinutes(byId,'h','t'),2);
  assert.ok(travelMinutes(byId,'t','h')>2);
});

test('play stories: load, road story between towns, town story inside Budapest, town plan',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-stories-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({reply:'Szia!'})),worldClock:()=>new Date('2026-11-13T10:00:00'),playRandom:()=>0});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  await call('/api/characters',{name:'Palor',gender:'férfi'});
  const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data,shop=(await call('/api/locations',{name:'Bolt',kind:'tag'})).data;
  const node=(id,name,parent,src,order=0)=>({id,name,parent_id:parent,kind:'place',source_id:src,placed:true,archived:false,order});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[
    node('proposal:bp','Budapest',null,null,0),node('n-cafe','Kávézó','proposal:bp',cafe.id),node('n-fv','Székesfehérvár',null,null,1),node('n-shop','Bolt','n-fv',shop.id)]}}]}));

  // Loading: checked first, nothing saved by a dry run; a broken story is reported and skipped.
  const broken={...story('broken'),start:'nincs'};
  const text='```json\n'+JSON.stringify({stories:[story('kamionos'),story('pest-sarok','budapest'),broken]})+'\n```';
  const dry=(await call('/api/play/stories/import',{text,dry_run:true})).data;
  assert.deepEqual(dry.results.map(r=>r.status),['new','new','invalid']);assert.equal(dry.saved,0);
  assert.equal((await call('/api/play/stories')).data.stories.length,0);
  const saved=(await call('/api/play/stories/import',{text})).data;assert.equal(saved.saved,2);
  assert.equal((await call('/api/play/stories/import',{text})).data.results[0].status,'exists','no silent overwrite');
  assert.equal((await call('/api/play/stories/import',{text:'nem json'})).status,400);

  // Budapest café → Székesfehérvár street: a road trip with its road story.
  await call('/api/play/travel',{node_id:'n-cafe'});
  const trip=(await call('/api/play/travel',{node_id:'n-fv'})).data.trip;
  assert.deepEqual(trip.road,{from_town:'Budapest',to_town:'Székesfehérvár'});
  assert.ok(trip.minutes>40,'real road distance');
  assert.equal(trip.story.story.id,'kamionos');assert.notEqual(trip.encounter?.kind,'event','the story replaces the small happening');
  const done=(await call('/api/play/story-runs/'+trip.story.run_id+'/finish',{path:['s1','s2','s4','s6','e1'],ending:'e1'})).data;
  assert.equal(done.ending,'good');
  assert.equal((await call('/api/play/stories')).data.stories.find(s=>s.id==='kamionos').runs,1);

  // Journal list of finished stories; travel times ahead of a trip; the clock shows the time.
  assert.equal((await call('/api/play/story-runs')).data.runs[0].ending_kind,'good');
  const eta=(await call('/api/play/eta?to='+encodeURIComponent('n-cafe')+','+encodeURIComponent('nincs'))).data.minutes;
  assert.ok(Number.isFinite(eta['n-cafe'])&&eta['n-cafe']>40,'from Székesfehérvár to the Budapest café');assert.equal(eta.nincs,undefined);
  assert.match((await call('/api/play')).data.clock.time,/^\d\d:\d\d$/);

  // Backdrops: a picture of a character is never a place's backdrop; a picture of the place is.
  await fs.writeFile(path.join(root,'kavezo.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64'));
  await call('/api/scan',{});const pic=app.db.prepare("SELECT id FROM media WHERE relative_path='kavezo.png'").get().id,cafeTag=app.db.prepare('SELECT tag_id FROM locations WHERE id=?').get(cafe.id).tag_id;
  app.db.prepare('INSERT INTO media_tags(media_id,tag_id) VALUES(?,?)').run(pic,cafeTag);
  const palorId=app.db.prepare("SELECT id FROM characters WHERE name='Palor'").get().id;app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(pic,palorId);
  assert.ok((await call('/api/play/backdrops/missing')).data.places.some(x=>x.id==='n-cafe'),'his picture is not a backdrop');
  assert.equal((await call('/api/play/place/n-cafe')).data.image_id,null);
  app.db.prepare('DELETE FROM depictions WHERE media_id=?').run(pic);
  assert.ok(!(await call('/api/play/backdrops/missing')).data.places.some(x=>x.id==='n-cafe'),'a picture of the place itself is');
  assert.equal((await call('/api/play/place/n-cafe')).data.image_id,pic);

  // Inside Budapest: street → café may bring a Budapest story; café → street is a short step.
  await call('/api/play/travel',{node_id:'proposal:bp'});
  const inTown=(await call('/api/play/travel',{node_id:'n-cafe'})).data.trip;
  assert.equal(inTown.road,null);assert.equal(inTown.story?.story.setting,'budapest');
  assert.equal((await call('/api/play/travel',{node_id:'proposal:bp'})).data.trip.minutes,2);

  // Switched off: no story at all; a disabled story never comes.
  await call('/api/play/settings',{story_rate:'off'});
  assert.equal((await call('/api/play/travel',{node_id:'n-fv'})).data.trip.story,null);
  await call('/api/play/settings',{story_rate:'often'});
  await call('/api/play/stories/kamionos',{enabled:false});
  assert.equal((await call('/api/play/travel',{node_id:'proposal:bp'})).data.trip.story,null);
  assert.equal((await call('/api/play/settings',{story_rate:'sometimes'})).status,400);
  // A short wait moves the clock by the chosen minutes; odd amounts are refused.
  const w15=await call('/api/play/wait',{until:'minutes',minutes:15});assert.equal(w15.status,200);assert.match(w15.data.clock.time,/^\d\d:\d\d$/);
  assert.equal((await call('/api/play/wait',{until:'minutes',minutes:7})).status,400);

  // Town plan: pin positions of the town's own places only.
  assert.deepEqual((await call('/api/play/town-layout/'+encodeURIComponent('proposal:bp'))).data,{positions:{},image:null,height:720});
  assert.deepEqual((await call('/api/play/town-layout/'+encodeURIComponent('proposal:bp'),{positions:{'n-cafe':[300,200]}})).data.positions,{'n-cafe':[300,200]});
  // A pin of a place that is not on this map (moved elsewhere) is dropped quietly (2026-11-14).
  assert.deepEqual((await call('/api/play/town-layout/'+encodeURIComponent('proposal:bp'),{positions:{'n-cafe':[300,200],'n-shop':[1,1]}})).data.positions,{'n-cafe':[300,200]});
  // A map picture dropped into the folder is found by the town name and served.
  await fs.writeFile(path.join(root,'20_SHARED_MEDIA','Játék térképek','Budapest.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64'));
  const withMap=(await call('/api/play/town-layout/'+encodeURIComponent('proposal:bp'))).data;assert.match(withMap.image,/^\/api\/play\/town-map\/proposal%3Abp\?v=\d+$/);
  const img=await fetch(origin+withMap.image);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
});

test('play stories: Grok saves its stories through the connector (trusted mode only)',async t=>{
  const {randomBytes}=await import('node:crypto');const {databaseIdentity}=await import('../app/character-edit.mjs');
  const {backgroundTools,backgroundOperations}=await import('../mcp/backgrounds.mjs');
  assert.equal(backgroundOperations.save_play_stories,'stories_save');assert.equal(backgroundTools.find(x=>x.name==='list_play_stories').annotations.readOnlyHint,true);
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-stories-mcp-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(dataDir,{recursive:true});
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const mcp=async(operation,args={},token=config.token)=>{const r=await fetch(origin+'/api/mcp-backgrounds',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({operation,arguments:args})});return {status:r.status,data:await r.json()};};
  const woman=story('noi');woman.nodes.s2.text='Egy lány integet.';
  const r=(await mcp('stories_save',{stories:[story('mcp-ut'),story('mcp-pest','budapest'),woman],model:'Grok 4'})).data;
  assert.equal(r.saved,2);assert.deepEqual(r.results.map(x=>x.status),['saved','saved','invalid']);assert.match(r.results[2].errors.join(' '),/lány/);
  assert.deepEqual((await mcp('stories_list')).data.by_setting,{road:1,kaloz:0,szekesfehervar:0,budapest:1});
  // The connector's shape: the stories as one JSON text.
  assert.equal((await mcp('stories_save',{stories_json:JSON.stringify([story('mcp-kaloz','kaloz')])})).data.saved,1);
  assert.equal((await mcp('stories_save',{stories_json:'[{'})).status,400);
  assert.equal((await mcp('stories_save',{stories:Array.from({length:11},(_,i)=>story('sok-'+i))})).status,400,'at most 10 per call');
  assert.equal((await mcp('stories_list',{},'x'.repeat(64))).status,403,'token required');

  // Town maps: the town's places, the drawn map picture (old one kept), pin positions as fractions.
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[
    {id:'t-kaloz',name:'Káloz',parent_id:null,kind:'place',source_id:null,placed:true,archived:false,order:0},{id:'p-cafe',name:'Kávézó',parent_id:'t-kaloz',kind:'place',source_id:cafe.id,placed:true,archived:false,order:0},
    {id:'h-laci',name:'Laci háza',parent_id:null,kind:'place',source_id:null,placed:true,archived:false,order:1}]}}]}));
  // A house at the top of the tree is not a town: listed apart, and no town map is saved for it.
  const all=(await mcp('town_places')).data;
  assert.deepEqual(all.towns.map(t=>t.name),['Káloz']);assert.deepEqual(all.standalone_places.map(p=>p.name),['Laci háza']);
  assert.equal((await mcp('town_map_save',{town_id:'h-laci',media_id:'00000000-0000-4000-8000-000000000000'})).status,409);
  const places=(await mcp('town_places',{town_id:'t-kaloz'})).data.towns[0];
  assert.equal(places.name,'Káloz');assert.deepEqual(places.places.map(p=>[p.id,p.kind]),[['p-cafe','leisure']]);assert.equal(places.has_map_picture,false);
  await fs.writeFile(path.join(root,'terkep.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64'));
  await call('/api/scan',{});const mid=app.db.prepare("SELECT id FROM media WHERE relative_path='terkep.png'").get().id;
  const saved1=(await mcp('town_map_save',{town_id:'t-kaloz',media_id:mid})).data;assert.equal(saved1.previous_kept,false);assert.equal(saved1.plan_size.height,1200,'a square picture gives a square plan');
  assert.equal((await mcp('town_map_save',{town_id:'t-kaloz',media_id:mid})).data.previous_kept,true,'the earlier picture is renamed, never overwritten');
  const files=await fs.readdir(path.join(root,'20_SHARED_MEDIA','Játék térképek'));assert.equal(files.length,2);assert.ok(files.includes('Káloz.png'));
  const lay=(await mcp('town_layout_save',{town_id:'t-kaloz',positions:{'p-cafe':[0.5,0.25],'nincs-ilyen':[0.1,0.1]}})).data;
  assert.deepEqual(lay.unknown_place_ids,['nincs-ilyen']);
  assert.deepEqual((await call('/api/play/town-layout/t-kaloz')).data.positions,{'p-cafe':[600,300]});
  assert.equal((await mcp('town_layout_save',{town_id:'t-kaloz',positions:{'p-cafe':[1.5,0]}})).status,400);
  // The connector's shape: a list of {place_id,x,y}.
  assert.deepEqual((await mcp('town_layout_save',{town_id:'t-kaloz',positions:[{place_id:'p-cafe',x:0.25,y:0.5}]})).data.unknown_place_ids,[]);
  assert.deepEqual((await call('/api/play/town-layout/t-kaloz')).data.positions,{'p-cafe':[300,600]});
});

test('room exits: neighbours of a room, door places saved as fractions, only real neighbours',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-doors-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(dataDir,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const loc=async name=>(await call('/api/locations',{name,kind:'tag'})).data.id;
  const [house,kitchen,bath,pub]=[await loc('Ház'),await loc('Konyha'),await loc('Fürdő'),await loc('Kocsma')];
  const n=(id,name,parent,src)=>({id,name,parent_id:parent,kind:'place',source_id:src,placed:true,archived:false,order:0});
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[
    n('t','Káloz',null,null),n('h','Ház','t',house),n('k','Konyha','h',kitchen),n('b','Fürdő','h',bath),n('p','Kocsma','t',pub)]}}]}));
  const v=(await call('/api/play/room-exits/k')).data;
  assert.deepEqual(v.neighbours.map(x=>[x.id,x.relation]),[['b','next'],['h','back']],'the bathroom next door and back to the house; the street only through the house (2026-11-14)');
  const saved=(await call('/api/play/room-exits/k',{exits:{b:{x:0.7,y:0.45},h:{dir:'back'},p:{x:0.1,y:0.1}}})).data.saved;
  assert.deepEqual(saved,{b:{x:0.7,y:0.45},h:{dir:'back'}},'the pub is not a neighbour of the kitchen');
  assert.deepEqual((await call('/api/play/place/k')).data.room_exits,saved);
  assert.equal((await call('/api/play/room-exits/k',{exits:{b:{x:2,y:0}}})).status,400);
  assert.deepEqual((await call('/api/play/room-exits/k',{exits:{},replace:true})).data.saved,{},'back to arrows');
});

test('story pictures: saved through the connector or dropped in the folder, shown beside the text, heated only for adults',async t=>{
  const {randomBytes}=await import('node:crypto');const {databaseIdentity}=await import('../app/character-edit.mjs');
  const {backgroundTools,backgroundOperations}=await import('../mcp/backgrounds.mjs');
  assert.equal(backgroundOperations.save_story_picture,'story_picture_save');assert.equal(backgroundTools.find(x=>x.name==='list_story_picture_needs').annotations.readOnlyHint,true);
  assert.deepEqual(backgroundTools.find(x=>x.name==='save_story_picture')._meta['openai/fileParams'],['image']);
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-story-pics-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(dataDir,{recursive:true});
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null,playRandom:()=>0});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const mcp=async(operation,args={})=>{const r=await fetch(origin+'/api/mcp-backgrounds',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({operation,arguments:args})});return {status:r.status,data:await r.json()};};
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  assert.equal((await mcp('stories_save',{stories:[story('vonat'),{...story('kamion'),content:'flirt'}]})).data.saved,2);
  // What needs pictures: every story with its blocks; the flirt story wants a heated picture too.
  const needs=(await mcp('story_pictures_needs',{limit:10})).data;
  assert.deepEqual([needs.total,needs.missing],[2,2]);
  const k=needs.stories.find(s=>s.id==='kamion');assert.equal(k.wants_heated_picture,true);assert.equal(k.nodes.s1.text,'Egy idegen férfi integet az út szélén.');assert.equal(k.nodes.s1.choices[0].to,'s2');
  // Saving: an existing catalogue picture as the source (the connector also takes image or url).
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
  await fs.writeFile(path.join(root,'forras.png'),png);await call('/api/scan',{});const mid=app.db.prepare("SELECT id FROM media WHERE relative_path='forras.png'").get().id;
  const s1=(await mcp('story_picture_save',{story_id:'kamion',node_id:'s1',media_id:mid,model:'Grok',prompt:'Photorealistic adult man, about 40, truck driver.'})).data;
  assert.equal(s1.file,path.join('20_SHARED_MEDIA','Játék sztorik','kamion','s1.png'));assert.equal(s1.previous_kept,false);
  assert.equal((await mcp('story_picture_save',{story_id:'kamion',node_id:'s1',media_id:mid})).data.previous_kept,true,'the earlier picture is kept, never overwritten');
  assert.equal((await mcp('story_picture_save',{story_id:'kamion',node_id:'s4',heated:true,media_id:mid})).status,200);
  assert.equal((await mcp('story_picture_save',{story_id:'vonat',node_id:'s4',heated:true,media_id:mid})).status,400,'no heated picture in an everyday story');
  assert.equal((await mcp('story_picture_save',{story_id:'kamion',node_id:'nincs',media_id:mid})).status,400);
  assert.match((await mcp('story_picture_save',{story_id:'kamion',node_id:'s2',media_id:mid,prompt:'a young woman'})).data.error,/woman/);
  // The owner may drop a file by hand: <block>.png in the story's folder.
  await fs.mkdir(path.join(root,'20_SHARED_MEDIA','Játék sztorik','vonat'),{recursive:true});await fs.writeFile(path.join(root,'20_SHARED_MEDIA','Játék sztorik','vonat','s2.png'),png);
  // A story run carries the pictures; the scan never takes them into the catalogue.
  await call('/api/scan',{});assert.equal(app.db.prepare("SELECT count(*) n FROM media WHERE relative_path LIKE '%Játék sztorik%'").get().n,0);
  const run=(await call('/api/play/stories/kamion/play',{})).data;
  assert.deepEqual(Object.keys(run.story.pictures).sort(),['s1','s4']);assert.equal(run.story.pictures.s4.heat,true);
  const img=await fetch(origin+run.story.pictures.s1.url);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
  assert.deepEqual(Object.keys((await call('/api/play/stories/vonat/play',{})).data.story.pictures),['s2']);
  // Hand saving from the Grok app: one folder, '<story id> - <block>.png'.
  await fs.writeFile(path.join(root,'20_SHARED_MEDIA','Játék sztorik','vonat - s5.png'),png);
  const flat=(await call('/api/play/stories/vonat/play',{})).data.story.pictures;assert.deepEqual(Object.keys(flat).sort(),['s2','s5']);
  assert.equal((await fetch(origin+flat.s5.url)).status,200);
  assert.equal((await fetch(origin+'/api/play/story-pictures/kamion/'+encodeURIComponent('vonat - s5.png'))).status,404,'a file of another story is not served under this story');
  // Adult switch off: no heated picture, not even by its address.
  await call('/api/play/settings',{adult:false});
  assert.deepEqual(Object.keys((await call('/api/play/stories/kamion/play',{})).data.story.pictures),['s1']);
  assert.equal((await fetch(origin+run.story.pictures.s4.url)).status,404);
  assert.equal((await fetch(origin+'/api/play/story-pictures/kamion/..%2F..%2Fforras.png')).status,404,'no path escape');
  assert.equal((await mcp('story_pictures_needs',{limit:10})).data.missing,0);
  // Grok with an old tool list: list_play_stories (no arguments) hands out the stories that still
  // need pictures, 3 at a time, moving on with every call.
  assert.equal((await mcp('stories_save',{stories:['a1','a2','a3','a4'].map(id=>story('kep-'+id))})).data.saved,4);
  const w1=(await mcp('stories_list')).data.picture_work,w2=(await mcp('stories_list')).data.picture_work;
  assert.equal(w1.missing,4);assert.deepEqual(w1.stories.map(s=>s.id),['kep-a1','kep-a2','kep-a3']);assert.ok(w1.stories[0].nodes.s1.text);
  assert.deepEqual(w2.stories.map(s=>s.id),['kep-a4','kep-a1','kep-a2'],'moves on and starts over at the end');
});
