import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('play mode: map positions, live talk only where the character is, save point on end',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-play-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.user.includes('Küldesz egy képet'))return {reply:'Tessék!',photo:'everyday'};
    if(req.system.includes('foglalsz össze'))return {title:'Kávé',summary:'Megbeszélték a napot.',character_memory:'Palor kedves volt.',palor_memory:'Aladár fáradt.',level_delta:3,reason:'jó beszélgetés'};
    return {reply:'Szia, Palor! *rámosolyog*'};});
  // Tuesday morning 09:00: weekday daytime → characters are at work.
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,method)=>{const r=await fetch(origin+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const mk=async name=>(await call('/api/characters',{name,gender:'férfi'})).data;
    const palor=await mk('Palor'),a=await mk('Teszt Aladár');
    const work=(await call('/api/locations',{name:'Kórház',kind:'tag'})).data,home=(await call('/api/locations',{name:'Aladár háza',kind:'tag'})).data,flat=(await call('/api/locations',{name:'Palor lakása',kind:'tag'})).data;
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Jó orvos lenni.'),weekly_routine:entry('Hétköznap kórház.'),anatomy:entry('TITKOS-EXPLICIT')},history:[],proposals:[]}));
    app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('22222222-2222-4222-8222-222222222222',a.id,palor.id,'Kollégák, kedvelik egymást.');
    app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run('33333333-3333-4333-8333-333333333333',palor.id,a.id,'PALOR-TITKOS-ÉRZÉS');
    await call('/api/world-engine/places',{character_id:a.id,location_id:work.id,role:'work'});
    await call('/api/world-engine/places',{character_id:a.id,location_id:home.id,role:'home'});
    // Approved location tree: city → hospital, house, Palor's flat.
    const node=(id,name,parent_id,source_id,kind='place')=>({id,name,parent_id,kind,source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    const nodes=[node('n-city','Város',null,null),node('n-work','Kórház','n-city',work.id),node('n-home','Aladár háza','n-city',home.id),node('n-flat','Palor lakása','n-city',flat.id)];
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes}}]}));

    let o=(await call('/api/play')).data;
    assert.equal(o.clock.slot,'reggel');assert.equal(o.node_id,'n-flat','Palor starts at home');
    assert.equal(o.people.find(p=>p.id===a.id).location_id,work.id,'weekday morning: at work');

    // Not here → cannot talk in person; phone works anywhere.
    assert.equal((await call('/api/play/talk',{character_id:a.id,text:'Szia!'})).status,409);
    // A town is not a room: nobody stands "in Város"; its hospital card counts one person.
    const city=(await call('/api/play/place/n-city')).data;assert.deepEqual(city.people,[]);
    assert.equal(city.children.find(c=>c.id==='n-work').people_count,1);
    assert.ok((await call('/api/play')).data.nodes.every(n=>'image_id' in n));
    const at=(await call('/api/play/travel',{node_id:'n-work'})).data;assert.deepEqual(at.people.map(p=>p.id),[a.id]);
    // Without a world event this day part, the activity comes from the place role.
    assert.equal(at.people[0].activity,'Dolgozik.');assert.deepEqual(at.today,[]);
    // Walking up: he speaks first; the prompt knows what he is doing and how close they are.
    let conv=(await call('/api/play/talk',{character_id:a.id,opener:true})).data;
    assert.equal(conv.status,'open');assert.deepEqual(conv.lines.map(l=>l.speaker),['character']);
    assert.ok(requests.at(-1).user.includes('MOST ÉPPEN: Dolgozik.')&&requests.at(-1).user.includes('szólalj meg te elsőként'));
    assert.ok(requests.at(-1).user.includes('ÍGY BESZÉLSZ VELE: idegen'));
    assert.ok(requests.at(-1).user.includes('HANGULATOD MA: átlagos A munkahelyeden vagy'),'mood and whose place it is');
    conv=(await call('/api/play/talk',{conversation_id:conv.id,text:'Szia, hogy vagy?'})).data;
    conv=(await call('/api/play/talk',{conversation_id:conv.id,text:'Kávé?'})).data;assert.equal(conv.lines.length,5);
    assert.equal((await call('/api/play/talk',{conversation_id:conv.id,opener:true})).status,400,'opener only starts a talk');
    // Knowledge boundary: Palor's private note and explicit fields never reach the character.
    assert.ok(requests.every(r=>!r.user.includes('PALOR-TITKOS-ÉRZÉS')&&!r.user.includes('TITKOS-EXPLICIT')));
    assert.ok(requests.at(-1).user.includes('Kollégák, kedvelik egymást.'));

    // Save point: memories for both, level moves by at most one step, world sees the event.
    const ended=(await call(`/api/play/conversations/${conv.id}/end`,{})).data;
    assert.equal(ended.status,'closed');assert.equal(ended.summary.level_delta,1);
    const mem=id=>app.db.prepare("SELECT text FROM character_memories WHERE character_id=? AND reason LIKE 'Világmotor%'").all(id).map(r=>r.text);
    assert.deepEqual(mem(a.id),['Palor kedves volt.']);assert.deepEqual(mem(palor.id),['Aladár fáradt.']);
    assert.equal(app.db.prepare('SELECT level FROM world_relationship_levels WHERE source_id=? AND target_id=?').get(a.id,palor.id).level,1);
    assert.equal(app.db.prepare("SELECT count(*) n FROM world_events WHERE title='Kávé' AND kind='meeting'").get().n,1);
    assert.equal((await call('/api/play/talk',{conversation_id:conv.id,text:'Még valami'})).status,409);

    const phone=(await call('/api/play/talk',{character_id:a.id,channel:'phone',text:'Ráérsz este?'})).data;
    assert.equal(phone.channel,'phone');

    // Photo scenes: own pictures of him at this place; collages are never scenes.
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
    await fs.mkdir(path.join(root,'Kepek'),{recursive:true});
    await fs.writeFile(path.join(root,'Kepek','korhaz.png'),png);await fs.writeFile(path.join(root,'Kepek','kollazs.png'),Buffer.from('synthetic collage'));
    await call('/api/scan',{});
    const media=(await call('/api/media')).data.items,byName=Object.fromEntries(media.map(m=>[path.basename(m.relative_path),m.id]));
    const both=[byName['korhaz.png'],byName['kollazs.png']];
    await call('/api/media/bulk',{operation:'assign',media_ids:both,character_ids:[a.id]});
    const workTag=app.db.prepare('SELECT tag_id FROM locations WHERE id=?').get(work.id).tag_id;
    await call('/api/taxonomy/apply',{media_ids:both,tag_ids:[workTag],operation:'add'});
    await call('/api/quick-tag/picture-type',{media_ids:[byName['kollazs.png']],type:'collage'});
    // Not analysed yet → treated as possibly intimate: hidden while the owner switch is off.
    await call('/api/play/settings',{adult:false});
    const locked=(await call('/api/play/photos/'+a.id)).data;assert.deepEqual([locked.photos.length,locked.hidden],[0,1]);
    await call('/api/play/settings',{adult:true});
    await call('/api/world-engine/levels',{source_id:a.id,target_id:palor.id,level:3});
    const shots=(await call('/api/play/photos/'+a.id)).data;
    assert.deepEqual(shots.photos.map(p=>p.media_id),[byName['korhaz.png']]);
    assert.equal(shots.photos[0].at_place,true);assert.equal(shots.photos[0].anchor,null,'no confirmed position yet');
    assert.equal(shots.photos[0].seen,false);
    await call('/api/play/photos/seen',{character_id:a.id,media_id:byName['korhaz.png']});
    assert.equal((await call('/api/play/photos/'+a.id+'?context=kórház')).data.photos[0].seen,true,'seen pictures are remembered');
    // Showing a shared photo: only pictures with both of them; the prompt describes it.
    assert.equal((await call('/api/play/talk',{character_id:a.id,channel:'phone',photo_id:byName['korhaz.png']})).status,400);
    await call('/api/media/bulk',{operation:'assign',media_ids:[byName['korhaz.png']],character_ids:[palor.id]});
    assert.deepEqual((await call('/api/play/shared-photos/'+a.id)).data.photos.map(p=>p.media_id),[byName['korhaz.png']]);
    const shown=(await call('/api/play/talk',{character_id:a.id,channel:'phone',photo_id:byName['korhaz.png']})).data;
    // The phone talk opened above is still open, so showing the photo continues it (one open talk per character and channel).
    assert.equal(shown.id,phone.id);assert.match(shown.lines.at(-2).text,/közös fotót/);assert.match(requests.at(-1).user,/Megmutat neked/);
    // A picture by phone: the reply asks for one, the media director picks one of his own.
    const sent=(await call('/api/play/talk',{conversation_id:shown.id,text:'Küldesz egy képet magadról?'})).data;
    assert.match(requests.at(-1).system,/"photo"/);assert.equal(sent.lines.at(-1).media.media_id,byName['korhaz.png']);
    assert.equal(sent.lines.at(-1).media.blur,true,'not confirmed as everyday → starts blurred');
    // Relationship depth: history, talks, memories; invitations move him at that time.
    const det=(await call('/api/play/relationship/'+a.id)).data;
    assert.ok(det.history.length>=1&&det.talks.length>=1&&det.memories.includes('Palor kedves volt.'));
    const inv=(await call('/api/play/invite',{character_id:a.id,node_id:'n-home',slot_index:0})).data;
    assert.equal(inv.status,'accepted');
    assert.equal((await call('/api/play')).data.people.find(p=>p.id===a.id).location_id,home.id,'he waits at the agreed place');
    // Travel remembers the previous place (Back) and the recent ones.
    await call('/api/play/travel',{node_id:'n-home'});
    const ov=(await call('/api/play')).data;assert.equal(ov.previous_id,'n-work');assert.deepEqual(ov.recent,['n-work']);
    // Phone: one contact with the whole phone thread, oldest first.
    const contacts=(await call('/api/play/phone')).data.contacts;assert.deepEqual(contacts.map(c=>c.name),['Teszt Aladár']);
    const thread=(await call('/api/play/phone/'+a.id)).data.items;
    assert.ok(thread.length>=4&&thread[0].who==='me'&&thread.some(i=>i.who==='them'));
  }finally{await app.close();}
});
