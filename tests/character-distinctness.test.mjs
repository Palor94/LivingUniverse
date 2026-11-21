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
import {castProfileTexts,GROUP_LEVELS} from '../app/profile-prompt.mjs';

const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'teszt',visibility:'creator'});
// Five synthetic men, deliberately unlike each other in goals, fears, motives and voice.
export const CAST={
  'Teszt Aladár':{personality:'Melegszívű, gondoskodó pék.',goals:'Saját pékséget nyitni a főtéren.',fears:'Hogy csalódást okoz a családjának.',conflicts:'Mindenkinek segítene, közben magára nem marad ideje.',speech:'Hosszú, kedves mondatok, sokszor mondja: „drága barátom”.',agreeableness:9,attachment:9,sarcasm:1,bluntness:2},
  'Teszt Béla':{personality:'Sértett, csípős nyelvű volt könyvelő.',goals:'Bosszút állni a volt főnökén, aki kirúgta.',fears:'Hogy kinevetik és lenézik.',conflicts:'Elismerést akar, de mindenkit eltaszít.',speech:'Rövid, gúnyos mondatok, kérdésre kérdéssel felel.',agreeableness:2,recognition:9,sarcasm:9,bluntness:8},
  'Teszt Csaba':{personality:'Zárkózott, önálló erdész.',goals:'Elköltözni egy tanyára, egyedül.',fears:'A bezártság és a kötelező társaság.',conflicts:'Szereti a testvérét, de fojtogatja a közelsége.',speech:'Szűkszavú, sokat hallgat, ha beszél, tárgyilagos.',extraversion:1,autonomy:10,expressiveness:1,directness:8},
  'Teszt Dénes':{personality:'Szorongó, ragaszkodó családapa.',goals:'Egyben tartani a családját.',fears:'Hogy elhagyják.',conflicts:'Félti a feleségét, ezért féltékenykedik, és ettől romlik a házassága.',speech:'Sokat kérdez vissza, bizonytalankodik, bocsánatot kér.',emotional_stability:2,attachment:10,security:9},
  'Teszt Ernő':{personality:'Kalandor, könnyelmű vállalkozó.',goals:'Egy év alatt meggazdagodni.',fears:'Az unalom és a hétköznapok.',conflicts:'Ígérget, de semmit nem fejez be.',speech:'Lelkes, túlzó, sok felkiáltás, nagy tervek.',reward:10,extraversion:9,agreeableness:6}
};
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
