import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createMediaDirector,imageSize} from '../app/media-director.mjs';

// Synthetic catalogue: two characters (A, B), a third (C), one place, labelled media.
function setup({adult=true}={}){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT);
    CREATE TABLE media_hidden(media_id TEXT PRIMARY KEY);
    CREATE VIEW active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);
    CREATE TABLE depictions(media_id TEXT,character_id TEXT);
    CREATE TABLE tag_groups(id TEXT,name TEXT);CREATE TABLE structured_tags(id TEXT,group_id TEXT,name TEXT);
    CREATE TABLE media_tags(media_id TEXT,tag_id TEXT);CREATE TABLE locations(id TEXT,name TEXT,tag_id TEXT);
    CREATE TABLE play_content(media_id TEXT PRIMARY KEY,level TEXT,set_at TEXT);
    CREATE TABLE play_asset_sources(media_id TEXT PRIMARY KEY);
    CREATE TABLE world_review_sources(id TEXT,media_id TEXT,raw_json TEXT);
    CREATE TABLE world_review_documents(source_id TEXT,document_json TEXT);`);
  const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
  run("INSERT INTO characters VALUES('A','Aba'),('B','Bandi'),('C','Csaba')");
  run("INSERT INTO tag_groups VALUES('g','Setting & location'),('k','Kép típusa')");
  run("INSERT INTO structured_tags VALUES('t-room','g','Feri háza - Hálószoba'),('t-town','g','Feri háza - Konyha'),('t-col','k','Kollázs')");
  run("INSERT INTO locations VALUES('l-room','Feri háza - Hálószoba','t-room'),('l-kitchen','Feri háza - Konyha','t-town'),('l-house','Feri háza','t-house')");
  const media=(id,cast,{kind='image',ai=null,owner=null,tags=[],people=null,desc='',rel=null,framing=null,region=null}={})=>{
    run('INSERT INTO media VALUES(?,?,?)',id,rel||id+'.png',kind);for(const c of cast)run('INSERT INTO depictions VALUES(?,?)',id,c);for(const t of tags)run('INSERT INTO media_tags VALUES(?,?)',id,t);
    if(ai||desc||people||framing){run('INSERT INTO world_review_sources VALUES(?,?,?)','s'+id,id,JSON.stringify({world_details:{content:{level:ai},camera:{framing}},description:{hu:desc}}));
      run('INSERT INTO world_review_documents VALUES(?,?)','s'+id,JSON.stringify({participants:Array.from({length:people||cast.length},(_,i)=>({id:'p'+i,character_id:region&&i===0?cast[0]:null,region:region&&i===0?region:null}))}));}
    if(owner)run("INSERT INTO play_content VALUES(?,?,'x')",id,owner);
  };
  media('ab-sex-room',['A','B'],{ai:'sexual_activity',tags:['t-room'],desc:'Ágyban a hálószobában'});
  media('ab-sex-elsewhere',['A','B'],{ai:'sexual_activity'});
  media('ab-everyday-room',['A','B'],{ai:'non_intimate',tags:['t-room']});
  media('abc-sex-room',['A','B','C'],{ai:'sexual_activity',tags:['t-room']});
  media('a-nude',['A'],{ai:'nudity'});
  media('a-unknown',['A']);
  media('a-video',['A'],{kind:'video'});
  media('a-everyday',['A'],{ai:'non_intimate',desc:'Kávézik a konyhában'});
  media('a-labelled',['A'],{ai:'sexual_activity',owner:'non_intimate'});
  media('a-collage',['A'],{ai:'non_intimate',tags:['t-col']});
  let isAdult=adult;
  const d=createMediaDirector({db,one,all,run,root:null,adult:()=>isAdult});
  return {d,db,one,run,media,setAdult:v=>{isAdult=v;}};
}

test('media director: an intimate scene between two NPCs gets explicit media of exactly those two, at that place',async()=>{
  const {d,setAdult}=setup();
  const r=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate',context:'ágyban'});
  assert.equal(r.items[0].media_id,'ab-sex-room');assert.equal(r.items[0].blur,true,'journal starts intimate media blurred');
  assert.ok(r.items.findIndex(i=>i.media_id==='abc-sex-room')>r.items.findIndex(i=>i.media_id==='ab-sex-elsewhere'),'a third person in the picture ranks lower');
  assert.ok(r.items.every(i=>i.media_id!=='a-collage'));
  setAdult(false);
  const off=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate'});
  assert.ok(off.items.length&&off.items.every(i=>i.level==='non_intimate'),'adult switch off: everyday media only');
  assert.equal(off.items[0].media_id,'ab-everyday-room');
});

test('media director: levels — everyday never shows nudity, unknown counts as intimate, owner label wins',async()=>{
  const {d}=setup();
  const everyday=await d.pick({panel:'phone',characters:['A'],mood:'everyday',limit:20});
  assert.ok(everyday.items.every(i=>i.level==='non_intimate'),'unknown picture and unlabelled video stay hidden');
  assert.ok(everyday.items.some(i=>i.media_id==='a-labelled'),'the owner label (everyday) overrides the AI level');
  assert.ok(everyday.items.findIndex(i=>i.media_id==='a-everyday')<everyday.items.findIndex(i=>i.media_id==='ab-everyday-room'),'alone ranks above with others on the phone');
  const flirt=await d.pick({panel:'phone',characters:['A'],mood:'flirt',limit:20});
  assert.ok(flirt.items.some(i=>i.media_id==='a-unknown')&&!flirt.items.some(i=>i.media_id==='a-video'),'unknown image = nudity; unknown video = explicit');
  const portrait=await d.pick({panel:'portrait',characters:['A'],mood:'intimate',limit:20});
  assert.ok(portrait.items.every(i=>i.level==='non_intimate'&&i.kind==='image'),'portraits are always everyday pictures');
});

test('media director: a talk picture shows only the people of the talk, from this place (2026-11-13)',async()=>{
  const {d,media}=setup();
  media('a-kitchen',['A'],{ai:'non_intimate',tags:['t-town']});
  media('a-house',['A'],{ai:'non_intimate',tags:['t-house']});
  media('a-room',['A'],{ai:'non_intimate',tags:['t-room']});
  const loose=(await d.pick({panel:'scene',characters:['A'],location_id:'l-room',mood:'everyday',limit:30})).items.map(i=>i.media_id);
  assert.ok(loose.includes('ab-everyday-room')&&loose.includes('a-kitchen'),'without the rules: others and other rooms can appear');
  const strict=(await d.pick({panel:'scene',characters:['A'],location_id:'l-room',mood:'everyday',limit:30,onlyCast:true,samePlace:true})).items.map(i=>i.media_id);
  assert.ok(!strict.some(id=>id.startsWith('ab')),'B is in the room, but a talk with A never shows him');
  assert.ok(!strict.includes('a-kitchen'),'a picture tagged with another room is left out');
  assert.ok(strict.includes('a-room')&&strict.includes('a-house')&&strict.includes('a-everyday'),'this room, the house around it and untagged pictures stay');
});

test('media director: feedback and stable journal picks',async()=>{
  const {d,one}=setup();
  const event={id:'e1',title:'Éjszaka',summary:'Ágyban a hálószobában',payload_json:JSON.stringify({character_ids:['A','B'],location_id:'l-room',intimate:true})};
  const first=await d.forEvent(event);assert.equal(first.media_id,'ab-sex-room');
  assert.equal((await d.forEvent(event)).media_id,'ab-sex-room','the same picture on every visit');
  const next=await d.forEvent(event,{repick:true});assert.notEqual(next.media_id,'ab-sex-room');
  d.feedback({media_id:'ab-sex-room',panel:'journal',characters:['B','A'],verdict:-1});
  const r=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate',limit:20});
  assert.ok(!r.items.some(i=>i.media_id==='ab-sex-room'),'"does not fit" removes it for this panel and cast');
  d.feedback({media_id:'ab-everyday-room',panel:'journal',characters:['A','B'],verdict:1});
  const lone={id:'e2',title:'Reggel',summary:'',payload_json:JSON.stringify({character_ids:['C']})};
  assert.equal(await d.forEvent(lone),null,'no picture with C alone: no misleading photo');
  assert.equal(one("SELECT media_id FROM play_event_media WHERE event_id='e2'").media_id,null);
});

test('media director next-gen: escalation, near-duplicates, continuity, video stills, cross-panel feedback, stand-in',async()=>{
  const {d,run,media}=setup();
  // An intimate scene starts with nudity and becomes explicit as it goes on.
  media('ab-nude-room',['A','B'],{ai:'nudity',tags:['t-room']});
  const early=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate',progress:0});
  const late=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate',progress:1});
  assert.equal(early.items[0].media_id,'ab-nude-room');assert.equal(early.want_level,'nudity');
  assert.equal(late.items[0].media_id,'ab-sex-room');
  // Allowed vs wanted: an everyday moment may still offer nudity when allowed, ranked lower.
  const allowed=await d.pick({panel:'phone',characters:['A'],mood:'everyday',allow:'nudity',limit:20});
  assert.ok(allowed.items.some(i=>i.level==='nudity')&&allowed.items[0].level==='non_intimate');
  // Near-duplicates: only the best of a group is offered; a shown one makes its twin less fresh.
  media('ab-sex-room-2',['A','B'],{ai:'sexual_activity',tags:['t-room'],desc:'Ágyban a hálószobában'});
  run("INSERT INTO media_signals(media_id,group_id,updated_at) VALUES('ab-sex-room','g1','x'),('ab-sex-room-2','g1','x')");
  const dup=await d.pick({panel:'journal',characters:['A','B'],location_id:'l-room',mood:'intimate',limit:20});
  assert.equal(dup.items.filter(i=>i.group_id==='g1').length,1);
  // Continuity: after a picture, the next one from the same shoot ranks higher.
  media('shoot-1',['A'],{ai:'non_intimate',rel:'Shoot/IMG_1001.jpg'});media('shoot-2',['A'],{ai:'non_intimate',rel:'Shoot/IMG_1004.jpg'});media('other',['A'],{ai:'non_intimate',rel:'Other/IMG_1002.jpg'});
  const cont=await d.pick({panel:'phone',characters:['A'],mood:'everyday',after:'shoot-1',limit:20});
  const pos=id=>cont.items.findIndex(i=>i.media_id===id);
  assert.ok(pos('shoot-2')<pos('other'));assert.ok(cont.items[pos('shoot-2')].reasons.includes('ugyanabból a sorozatból'));
  // Video stills: the most intimate analysed still sets the level; the loop starts at the best one.
  run("INSERT INTO media_video_frames(media_id,t,file,sha256,level) VALUES('a-video',0,'f0','h','non_intimate'),('a-video',4,'f4','h','sexual_activity')");
  const vid=(await d.pick({panel:'scene',characters:['A'],mood:'intimate',progress:1,limit:20})).items.find(i=>i.media_id==='a-video');
  assert.equal(vid.level,'sexual_activity');assert.equal(vid.start_at,4);assert.ok(!vid.reasons.includes('tartalma nincs megállapítva'));
  assert.ok(!(await d.pick({panel:'scene',characters:['A'],mood:'flirt',limit:20})).items.some(i=>i.media_id==='a-video'),'explicit still → never in a flirt moment');
  // Feedback in one panel counts a little in the others.
  d.feedback({media_id:'a-everyday',panel:'scene',characters:['A'],verdict:1});
  assert.ok((await d.pick({panel:'phone',characters:['A'],mood:'everyday',limit:20})).items.find(i=>i.media_id==='a-everyday').reasons.includes('máshol jónak jelölted'));
  // Stand-in figure: his best everyday portrait, with where he stands in it.
  media('a-portrait',['A'],{ai:'non_intimate',framing:'upper_body',region:{x:0.2,y:0.1,width:0.5,height:0.9}});
  const s=await d.standIn('A');assert.equal(s.media_id,'a-portrait');assert.deepEqual(s.region,{x:0.2,y:0.1,width:0.5,height:0.9});
});

test('image size from file headers',()=>{
  const png=Buffer.alloc(32);png.writeUInt32BE(0x89504e47,0);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
  assert.deepEqual(imageSize(png),{w:1920,h:1080});
  const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,11,8,0x04,0x38,0x07,0x80,3,0,0,0,0]);
  assert.deepEqual(imageSize(jpg),{w:1920,h:1080});
  assert.equal(imageSize(Buffer.from('nope')),null);
});
