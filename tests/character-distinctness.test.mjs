// E1 (2026-11-21): is each person's inner life in the prompt, and are five different people
// given different material for the same situation? Offline, synthetic, mock provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {defaultTemplate} from '../app/ghost-profile.mjs';
import {innerCoverage,characterOnly,distinctness,similarity} from '../app/character-distinctness.mjs';
import {appraisalLines,appraiseEvent} from '../app/appraisal.mjs';
import {stanceLines} from '../app/stance.mjs';
import {castProfileTexts,GROUP_LEVELS,profileText,CARD_HEAD,SECRET_HEAD,GROUP_SECRET_HEAD} from '../app/profile-prompt.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
// Five synthetic men, deliberately unlike each other in goals, fears, motives and voice.
import {CAST} from './fixtures/distinctness-cast.mjs';
export {CAST};
const profileOf=values=>({template:defaultTemplate,values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,entry(v)]))});

test('distinctness metrics: shared lines dropped, names ignored, identical texts score 0',()=>{
  assert.deepEqual(characterOnly(['A\nközös\nB','C\nközös']),['A\nB','C']);
  assert.equal(similarity('a kutya ugat','a kutya ugat'),1);
  assert.equal(distinctness(['Aladár szereti a kenyeret','Béla szereti a kenyeret'],{names:['Aladár','Béla']}).mean,0);
  assert.ok(distinctness(['pékség család kenyér','bosszú főnök gúny']).mean>0.99);
  const p=profileOf(CAST['Teszt Béla']);
  const cov=innerCoverage('Tudatos célok: Bosszút állni a volt főnökén\nSzarkazmus: 9/10',p);
  assert.ok(cov.present.includes('goals')&&cov.present.includes('sarcasm')&&cov.missing.includes('fears'));
});

test('same situation, five people: inner life reaches the 1:1 prompt and the group prompt; material differs',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-distinct-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const requests=[];
  const provider=createMockProvider(req=>{requests.push(req);
    if(req.system.includes('társas jelenetét'))return {replies:Object.keys(CAST).map(name=>({name,text:'Szia!'})),choices:['a','b','c']};
    if(req.system.includes('foglalsz össze'))return {title:'x',summary:'x',memories:{}};
    return {reply:'Szia!'};});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:provider,worldClock:()=>new Date('2026-11-10T09:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const palor=(await call('/api/characters',{name:'Palor',gender:'férfi'})).data;
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+palor.id,JSON.stringify({version:1,values:{play_voice:entry('PALOR-HANG: elemző, önjavító.'),play_contradiction:entry('PALOR-ELLENTMONDAS'),speech:entry('Általános beszédstílus\nPALOR-STILUS')},history:[],proposals:[]}));
  const work=(await call('/api/locations',{name:'Kávézó',kind:'tag'})).data;
  const people=[];
  for(const [name,values] of Object.entries(CAST)){const c=(await call('/api/characters',{name,gender:'férfi'})).data;people.push({...c,name,values});
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:profileOf(values).values,history:[],proposals:[]}));
    await call('/api/world-engine/places',{character_id:c.id,location_id:work.id,role:'work'});}
  await fs.writeFile(path.join(dataDir,'location-canvas.json'),JSON.stringify({schema:1,head:'r1',approved_head:'r1',revisions:[{id:'r1',parent_id:null,kind:'approved',state:{schema:1,types:[],nodes:[{id:'n-cafe',name:'Kávézó',parent_id:null,kind:'place',source_id:work.id,placed:true,archived:false,order:0}]}}]}));
  await call('/api/play/travel',{node_id:'n-cafe'});

  // 1:1: the same sentence from Palor to each of them.
  const talk=[];
  for(const c of people){const r=await call('/api/play/talk',{character_id:c.id,text:'Szia! Mi újság veled mostanában?'});assert.equal(r.status,200,JSON.stringify(r.data));
    talk.push(requests.at(-1).user);await call(`/api/play/conversations/${r.data.id}/end`,{});}
  const talkCoverage=people.map((c,i)=>innerCoverage(talk[i],profileOf(c.values)));
  for(const [i,cov] of talkCoverage.entries())assert.equal(cov.ratio,1,people[i].name+' misses '+cov.missing.join(', '));
  const talkDistinct=distinctness(characterOnly(talk),{names:people.map(c=>c.name)});
  assert.ok(talkDistinct.mean>0.6,'1:1 material differs between people: '+talkDistinct.mean.toFixed(2));

  // Group: three of them together. Before E11 the group profile left goals, fears, conflicts
  // and the five motives out; the baseline is recorded in DECISIONS.md (2026-11-21, E1).
  const g=await call('/api/play/group-talk',{opener:true});assert.equal(g.status,200,JSON.stringify(g.data));
  const groupUser=requests.filter(r=>r.system.includes('társas jelenetét')).at(-1).user;
  const blocks=Object.fromEntries(groupUser.split(/\n(?=## )/).filter(b=>b.startsWith('## ')).map(b=>[b.slice(3,b.indexOf('\n')),b]));
  const inGroup=people.filter(c=>blocks[c.name]);assert.ok(inGroup.length>=2);
  const groupCoverage=inGroup.map(c=>({name:c.name,...innerCoverage(blocks[c.name],profileOf(c.values))}));
  t.diagnostic('group inner-life coverage: '+groupCoverage.map(c=>`${c.name} ${(c.ratio*100).toFixed(0)}% (missing: ${c.missing.join(', ')||'–'})`).join('; '));
  t.diagnostic('1:1 distinctness '+talkDistinct.mean.toFixed(2));
  // E10/E13: in his own 1:1 prompt the card comes first and his secret is there, with the rule.
  const bela=talk[people.findIndex(c=>c.name==='Teszt Béla')];
  assert.ok(bela.indexOf(CARD_HEAD)>=0&&bela.indexOf(CARD_HEAD)<bela.indexOf('Személyiség összefoglaló'),'card before the long profile');
  assert.ok(bela.includes(SECRET_HEAD)&&bela.includes('TITOK-BELA'));
  for(const [i,u] of talk.entries())if(people[i].name!=='Teszt Béla')assert.ok(!u.includes('TITOK-BELA'),'nobody else gets his secret in a 1:1');
  for(const c of inGroup)if(CAST[c.name].secrets)assert.ok(blocks[c.name].includes(GROUP_SECRET_HEAD)&&blocks[c.name].includes(CAST[c.name].secrets));
  // Palor's card leads the guide for the suggested lines (the player's character), never a character's own profile.
  for(const u of talk){const i=u.indexOf('PALOR BESZÉDMÓDJA');assert.ok(i>=0&&u.indexOf('PALOR-HANG',i)>i&&u.indexOf('PALOR-ELLENTMONDAS',i)>i,'card in the voice guide');assert.ok(u.indexOf('PALOR-HANG')>i-1,'not elsewhere');}
  // E4: with no state yet, each one's aim comes from his own goal.
  for(const [i,u] of talk.entries())assert.ok(u.includes('A SAJÁT CÉLOD EBBEN A BESZÉLGETÉSBEN: közelebb jutni a célodhoz: '+people[i].values.goals.replace(/\.$/,'')),people[i].name);
  // E5: everyone may disagree; the low-agreeableness one is told he contradicts.
  assert.ok(talk.every(u=>u.includes('NEM KELL EGYETÉRTENED')));
  assert.ok(talk[people.findIndex(c=>c.name==='Teszt Béla')].includes('Gyakran ellentmondasz'));
  // S1: he knows why he is here (the café is his workplace, a weekday morning).
  assert.ok(talk.every(u=>/MOST ÉPPEN: [^\n]*MIÉRT VAGY ITT: Itt dolgozol/.test(u)),talk[0].match(/MOST ÉPPEN[^\n]*/)?.[0]);
  // E3: the appraisal block is in his own prompt.
  assert.ok(talk.every(u=>u.includes('ÍGY HAT RÁD, AMI TÖRTÉNIK')));
  // E11: the whole inner life is there in company too.
  for(const c of groupCoverage)assert.equal(c.ratio,1,c.name+' misses in group: '+c.missing.join(', '));
});

test('E11 group detail levels: one level for everyone, background goes first, voice/goals/fears/motives never',()=>{
  const long='x'.repeat(290)+' ';
  const fat=v=>profileOf({...v,identity:'Életrajz '+long,habits:'Szokás '+long,coping:'Megküzdés '+long,emotional_traits:'Érzelmi '+long,conflicts:v.conflicts+' '+long,personality:v.personality+' '+long});
  const profiles=Object.values(CAST).map(fat);
  const roomy=castProfileTexts(profiles,{budget:1e9});assert.equal(roomy.level,0);
  const tight=castProfileTexts(profiles,{budget:1500});
  assert.equal(tight.level,GROUP_LEVELS.length-1,'a tiny budget ends on the last level');
  for(const [i,t] of tight.texts.entries()){const v=Object.values(CAST)[i];
    assert.ok(t.includes(v.goals)&&t.includes(String(v.speech).slice(0,40))&&t.includes(v.fears),'core kept: '+t);
    assert.ok(!t.includes('Életrajz')&&!t.includes('Szokás'),'background dropped first');}
  const mid=castProfileTexts(profiles,{budget:roomy.texts.join('').length-1});
  assert.ok(mid.level>=1&&mid.texts.every(t=>!t.includes('Szokás ')),'the same level for every person');
  // Intimate-only fields stay out of an ordinary group scene.
  const p=profileOf({...CAST['Teszt Aladár'],attraction:'VONZALOM'});
  assert.ok(!castProfileTexts([p]).texts[0].includes('VONZALOM'));
  assert.ok(castProfileTexts([p],{explicit:true,intimate:true}).texts[0].includes('VONZALOM'));
});

test('E10/E13 card and secrets in profile text: card first, secrets only when asked, typical lines go first in company',()=>{
  const p=profileOf(CAST['Teszt Béla']);
  const plain=profileText(p);assert.ok(plain.startsWith(CARD_HEAD)&&!plain.includes('TITOK-BELA'),'secrets are never sent by default');
  assert.ok(profileText(p,{secrets:true}).includes(SECRET_HEAD+' TITOK-BELA'));
  const long='y'.repeat(290)+' ',fat=profileOf({...CAST['Teszt Béla'],identity:'Életrajz '+long,habits:'Szokás '+long});
  const roomy=castProfileTexts([fat],{budget:1e9}),tight=castProfileTexts([fat],{budget:400});
  assert.ok(roomy.texts[0].includes('Ennyi?')&&!tight.texts[0].includes('Ennyi?'),'typical lines dropped first');
  assert.ok(tight.texts[0].includes('Mindenkit lenéz, kivéve a kutyákat')&&tight.texts[0].includes('Halkan, lassan'),'voice and contradiction kept');
});

test('E10 template: a saved template from before the card gets the card fields once, versioned, values untouched',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-card-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const opts={root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({reply:'x'})),worldClock:()=>new Date('2026-11-10T09:00:00')};
  t.after(async()=>{await fs.rm(base,{recursive:true,force:true});});
  let app=await createApp(opts);
  const old={version:7,fields:defaultTemplate.fields.filter(f=>f.group!=='Szerepkártya')};
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('ghost:template',JSON.stringify(old));
  app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:x',JSON.stringify({version:1,values:{goals:entry('Megtartani.')},history:[],proposals:[]}));
  await app.close();app=await createApp(opts);
  const read=k=>JSON.parse(app.db.prepare('SELECT value FROM application_settings WHERE key=?').get(k)?.value??'null');
  const now=read('ghost:template');assert.equal(now.version,8);
  assert.deepEqual(now.fields.slice(-5).map(f=>f.id),['play_voice','play_rules','play_contradiction','play_lines','secrets']);
  assert.deepEqual(now.fields.slice(0,old.fields.length),old.fields,'existing fields unchanged');
  assert.equal(read('ghost:template-history:8').actor,'code:E10-character-card');
  assert.equal(read('ghost:character:x').values.goals.value,'Megtartani.');
  await app.close();app=await createApp(opts);assert.equal(read('ghost:template').version,8,'only once');await app.close();
});

test('E3 appraisal: the same missed date hits five people five ways; unknown scales say nothing',()=>{
  const read=name=>appraiseEvent(profileOf(CAST[name]),'missed_date');
  assert.match(read('Teszt Aladár'),/elutasításként/);
  assert.match(read('Teszt Béla'),/sértésként/);assert.doesNotMatch(read('Teszt Béla'),/elutasításként/);
  assert.match(read('Teszt Csaba'),/megkönnyebbültél/);
  assert.match(read('Teszt Dénes'),/elutasításként.*bizalmadat.*hamar kibillen/);
  assert.equal(read('Teszt Ernő'),'','no motive that a missed date touches');
  assert.deepEqual(appraisalLines(profileOf({goals:'x'})),[]);
  const blocks=Object.values(CAST).map(v=>appraisalLines(profileOf(v)).join('\n'));
  const d=distinctness(blocks);assert.ok(d.mean>0.5,'appraisal blocks differ: '+d.mean.toFixed(2));
  assert.match(appraisalLines(profileOf(CAST['Teszt Csaba'])).join('\n'),/tolakodásnak.*\n[^]*nem mutatja ki/);
});

test('E5 stance: permission to disagree, his own reasons, grudges and bad days, secrets defended',()=>{
  const st=name=>stanceLines(profileOf(CAST[name])).join('\n');
  assert.match(st('Teszt Béla'),/Gyakran ellentmondasz/);assert.match(st('Teszt Béla'),/kertelés nélkül/);assert.match(st('Teszt Béla'),/hazudhatsz is róluk/);
  assert.match(st('Teszt Aladár'),/határaidat akkor is tartod/);assert.doesNotMatch(st('Teszt Aladár'),/hazudhatsz/);
  const hurt={mood:'megbántott',intensity:3};
  const grudge=profileOf({...CAST['Teszt Aladár'],grievances:4});
  assert.match(stanceLines(grudge,{inner:hurt,effective:2.5}).join('\n'),/napokig hűvös/);
  assert.match(stanceLines(profileOf(CAST['Teszt Ernő']),{inner:{mood:'ingerült'},effective:2.2}).join('\n'),/Rossz napod van/);
  assert.doesNotMatch(stanceLines(profileOf(CAST['Teszt Ernő']),{inner:{mood:'felvillanyozott'},effective:3}).join('\n'),/Rossz napod/);
  assert.match(stanceLines(profileOf({}),{level:-2}).join('\n'),/Rosszban vagytok/);
});
