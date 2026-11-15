import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

function png(r,g,b){
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,r,g,b,r,g,b,0,r,g,b,r,g,b]))),chunk('IEND',Buffer.alloc(0))]);
}
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});

test('talk: each reply carries a scene beat, suggested replies and a spark; the scene picture follows the moment',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-scenes-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];let next={reply:'Szia, Palor!',beat:'kiss',spark:1,choices:['Örülök, hogy látlak.','Jól nézel ki ma.','Gyere, igyunk valamit!','negyedik']};
  const provider=createMockProvider(req=>{requests.push(req);if(req.system.includes('beszélgetést foglalsz össze'))return {title:'Kávé',summary:'Beszélgettek.',character_memory:'Jó volt.',palor_memory:'Jó volt.',level_delta:1,reason:'kedves volt'};if(next==='TIMEOUT')throw Object.assign(new Error('timeout'),{code:'AI_UNCERTAIN'});return next;});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-11T10:00:00')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const palor=(await call('/api/characters',{name:'Palor'})).data,a=(await call('/api/characters',{name:'Teszt Aladár'})).data;
    const cafe=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+a.id,JSON.stringify({version:1,values:{goals:entry('Dolgozni.')},history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:a.id,location_id:cafe.id,role:'work'});
    const node=(id,name,parent_id,source_id)=>({id,name,parent_id,kind:'place',source_id,type_ids:[],placed:true,archived:false,order:0,note:'',x:null,y:null});
    await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[node('n-city','Város',null,null),node('n-cafe','Kávézó','n-city',cafe.id)]}}]}));
    // Three pictures of the two of them: two everyday, one with nudity.
    await fs.mkdir(path.join(root,'Kepek'),{recursive:true});
    for(const [f,c] of [['e1.png',10],['e2.png',60],['n1.png',120]])await fs.writeFile(path.join(root,'Kepek',f),png(c,c,c));
    await call('/api/scan',{});
    const id=Object.fromEntries((await call('/api/media')).data.items.map(m=>[path.basename(m.relative_path),m.id]));
    await call('/api/media/bulk',{operation:'assign',media_ids:Object.values(id),character_ids:[a.id,palor.id]});
    for(const [f,l] of [['e1.png','non_intimate'],['e2.png','non_intimate'],['n1.png','nudity']])await call('/api/play/content',{media_id:id[f],level:l});
    await call('/api/play/travel',{node_id:'n-cafe'});

    // Opener: he speaks first; a scene picture for the moment, three suggested replies, no spark.
    let talk=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',opener:true})).data;
    let last=talk.lines.at(-1);
    assert.equal(last.beat,'kiss');assert.ok(last.scene,'a scene picture for the first moment');assert.equal(last.scene.level,'non_intimate','a kiss is an everyday picture');
    assert.deepEqual(talk.choices,next.choices.slice(0,3));assert.equal(talk.chemistry,0,'the opener has no spark');
    assert.ok(requests.at(-1).system.includes('"beat"')&&requests.at(-1).system.includes('choices'));
    const first=last.scene.media_id;
    // Same beat right after: the picture stays (no flicker).
    talk=(await call('/api/play/talk',{conversation_id:talk.id,text:'Szia!'})).data;last=talk.lines.at(-1);
    assert.equal(last.scene,undefined);assert.equal(talk.chemistry,1);
    // An explicit beat in an ordinary conversation is held back to everyday talk; a new, different picture.
    next={...next,beat:'sex',spark:-1};
    talk=(await call('/api/play/talk',{conversation_id:talk.id,text:'Mi újság?'})).data;last=talk.lines.at(-1);
    assert.equal(last.beat,'talk','undress/sex beats need an intimate scene');assert.ok(last.scene&&last.scene.media_id!==first,'a fresh picture, never the same twice');
    assert.equal(last.scene.level,'non_intimate');assert.equal(talk.chemistry,0);
    // Garbage from the model never reaches the screen.
    next={reply:'Jó.',beat:'???',spark:7,choices:'nem lista'};
    talk=(await call('/api/play/talk',{conversation_id:talk.id,text:'Oké.'})).data;last=talk.lines.at(-1);
    assert.equal(last.beat,'talk');assert.equal(last.spark,0);assert.deepEqual(talk.choices,[]);
    // Ending: the summary hears how the conversation went (only when it leaned one way).
    next={reply:'Ez jólesett.',beat:'flirt',spark:1,choices:[]};
    talk=(await call('/api/play/talk',{conversation_id:talk.id,text:'Hiányoztál.'})).data;assert.equal(talk.chemistry,1);
    assert.equal(talk.lines.at(-1).scene,undefined,'a flirt never shows the nude picture, even when nothing else is left');
    const ended=(await call(`/api/play/conversations/${talk.id}/end`,{})).data;assert.equal(ended.status,'closed');
    assert.match(requests.at(-1).user,/reakciói/);
    // Album: the two scene pictures shown are unlocked; the nude one is still locked (counted, not shown).
    const album=(await call('/api/play/album/'+a.id)).data;
    assert.equal(album.unlocked.length,2);assert.equal(album.total,3);assert.deepEqual(album.locked,{non_intimate:0,nudity:1,sexual_activity:0});
    assert.ok(album.unlocked.every(m=>m.media_id!==id['n1.png']));
    assert.equal((await call('/api/play/album/00000000-0000-4000-8000-000000000000')).status,404);
    // Intimate scene (cycle 8): the beat may now reach undressing; the nude picture fits it.
    app.db.prepare('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,seen_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('ev-int','2026-11-10','meeting','applied','Közel','Közel kerültek.',JSON.stringify({character_ids:[a.id],with_palor:true,intimate:true}),'test','2026-11-10T10:00:00Z','2026-11-10T10:00:00Z');
    next={reply:'Gyere közelebb.',beat:'undress',spark:1,choices:['Lassan.','Gyönyörű vagy.','Most.']};
    let close=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',intimate:true,text:'Közelebb lépek.'})).data;
    assert.equal(close.mode,'intimate');last=close.lines.at(-1);assert.equal(last.beat,'undress');assert.equal(last.scene?.media_id,id['n1.png'],'nudity for the undressing moment');
    // Pace: slower is a stage direction the character hears; stop ends the intimate scene.
    close=(await call('/api/play/talk',{conversation_id:close.id,pace:'slower'})).data;
    assert.match(requests.at(-1).user,/RENDEZŐI JELZÉS: Palor lassítani/);assert.match(close.lines.at(-2).text,/lassít/);
    close=(await call('/api/play/talk',{conversation_id:close.id,pace:'stop'})).data;assert.equal(close.mode,'normal');
    assert.match(requests.at(-1).user,/intim jelenet itt véget ér/);
    assert.equal((await call('/api/play/talk',{conversation_id:close.id,pace:'continue'})).status,409,'no pace outside an intimate scene');
    assert.equal((await call('/api/play/talk',{conversation_id:close.id,pace:'faster'})).status,400);
    const closeEnd=(await call(`/api/play/conversations/${close.id}/end`,{})).data;assert.equal(closeEnd.summary.intimate,true,'a stopped intimate scene is still recorded as intimate');
    // The browser for the current moment: a talk beat never lists the nude picture.
    const browse=(await call('/api/play/photos/'+a.id+'?beat=talk')).data;assert.ok(browse.photos.every(p=>p.level==='non_intimate'));
    // Dates (cycle 9): an accepted invitation for now and here is a date he knows about…
    const slot=(await call('/api/play')).data.clock.slot_index;
    const inv=(await call('/api/play/invite',{character_id:a.id,node_id:'n-cafe',slot_index:slot})).data;assert.equal(inv.status,'accepted');
    next={reply:'Eljöttél!',beat:'talk',spark:1,choices:[]};
    let date=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',text:'Itt vagyok.'})).data;
    assert.match(requests.at(-1).user,/RANDEVÚ: ezt a találkozót Palorral beszéltétek meg ide/);
    const dateEnd=(await call(`/api/play/conversations/${date.id}/end`,{})).data;assert.match(requests.at(-1).user,/megbeszélt randevú volt/);
    assert.equal(dateEnd.summary.level_delta,1,'third step closer today is still allowed');assert.equal(dateEnd.summary.held_back,undefined);
    // …and a date Palor missed is brought up once.
    app.db.prepare("INSERT INTO play_appointments VALUES('ap-miss',?,?,'2026-11-10','reggel','accepted','2026-11-09T10:00:00Z')").run(a.id,cafe.id);
    app.db.prepare("INSERT INTO play_dates(appointment_id,created_at) VALUES('ap-miss','2026-11-09T10:00:00Z')").run();
    date=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',text:'Szia!'})).data;assert.match(requests.at(-1).user,/ELMARADT RANDEVÚ: Palor nem jött el/);
    await call('/api/play/talk',{conversation_id:date.id,text:'Bocsánat.'});assert.doesNotMatch(requests.at(-1).user,/ELMARADT RANDEVÚ/,'mentioned once');
    const fourth=(await call(`/api/play/conversations/${date.id}/end`,{})).data;
    assert.equal(fourth.summary.level_delta,0);assert.equal(fourth.summary.held_back,true,'at most three steps closer per day (owner, 2026-11-11)');
    // Walking up and leaving without a word: no paid summary (cycle 10).
    const before=requests.length,walk=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',opener:true})).data;
    const left=(await call(`/api/play/conversations/${walk.id}/end`,{})).data;assert.equal(left.status,'closed');assert.equal(requests.length,before+1,'only the opener call, no summary');
    // A Grok timeout is a clear 504 for the player, not a generic server error.
    next='TIMEOUT';const slow=await call('/api/play/talk',{character_id:a.id,channel:'in_person',opener:true});assert.equal(slow.status,504);assert.match(slow.data.error,/did not answer in time/);
    next={reply:'Szia.',beat:'talk',spark:0,choices:[]};
    // The setting can switch the automatic scene off; then nothing is picked or counted as seen.
    assert.equal((await call('/api/play/settings',{auto_scene:false})).data.auto_scene,false);
    const seenBefore=app.db.prepare('SELECT count(*) n FROM play_seen').get().n;
    const quiet=(await call('/api/play/talk',{character_id:a.id,channel:'in_person',opener:true})).data;
    assert.equal(quiet.lines.at(-1).scene,undefined);assert.equal(app.db.prepare('SELECT count(*) n FROM play_seen').get().n,seenBefore);
    assert.equal((await call('/api/play/settings',{auto_scene:'x'})).status,400);
  }finally{await app.close();}
});
