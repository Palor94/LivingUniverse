// Exactly 30 stable acceptance situations: 10 checks × in person / phone / group.
// Synthetic profiles, bounded prompts and a mock provider; no live quality claims.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateTokens} from '../app/world-ai.mjs';
import {livingWorld} from './helpers/living-world.mjs';

const situations=[
  ['own-voice',(r)=>assert.match(r.user,/ALADAR-HANG: nyugodtan, hosszú mondatokban/)],
  ['inner-motives',(r)=>{assert.match(r.user,/elismerés|Elismerés/);assert.match(r.user,/közelség|Kötődés/);}],
  ['palor-private-notes',(r)=>assert.doesNotMatch(r.system+r.user,/PALOR-ADMIN-PRIVAT/)],
  ['offstage-knowledge',(r)=>assert.doesNotMatch(r.system+r.user,/KIVULALLO-TITOK|KIVULALLO-ADMIN/)],
  ['everyday-explicit-boundary',(r)=>assert.doesNotMatch(r.system+r.user,/ALADAR-EXPLICIT|BELA-EXPLICIT/)],
  ['salient-memory',(r)=>{for(const tag of ['KONYV','SZERSZAM','CSOMAG'])assert.ok(r.user.includes('FORDULOPONT-'+tag));}],
  ['bounded-prompt',(r)=>{assert.ok(estimateTokens(r.system+r.user)<=4096);assert.ok(r.maxTokens<=1200);}],
  ['player-agency',(r)=>assert.match(r.system,/Palor helyett|Palor.*(?:nem|soha)|(?:csak|Csak) azt tudod Palorról/)],
  ['fact-save-gate',async(r,w,conv)=>{
    w.control.summary={...w.control.summary,experiences:[{kind:'praise',quote:'Ügyes vagy?'}],promises:[]};
    if(conv.mode==='group')w.control.summary.experiences={'Teszt Aladár':[{kind:'praise',quote:'Ügyes vagy?'}]};
    await w.end(conv);assert.match(w.requests.at(-1).system,/Ténykezelés/);
    assert.equal(w.app.db.prepare('SELECT count(*) n FROM social_experiences WHERE conversation_id=?').get(conv.id).n,0);
  }],
  ['own-profile-isolation',(r,w,conv,channel)=>{
    const own=channel==='group'?r.user.split('## Teszt Aladár\n')[1]?.split(/\n## /)[0]:r.user.split('KAPCSOLATOD PALORRAL')[0];
    assert.ok(own);assert.doesNotMatch(own,/BELA-HANG|BELA-TITOK/);
  }],
];

test('conversation acceptance matrix: thirty fixed situations',async t=>{
  const w=await livingWorld(t);let maximum=0;
  // A full 200-memory fixture, with the relevant turning point behind newer routine memories.
  for(let i=0;i<200;i++){const tag=({60:'KONYV',80:'SZERSZAM',100:'CSOMAG'})[i];w.app.worldEngine.internals.remember(w.a.id,tag?'FORDULOPONT-'+tag+': Palor visszahozta a könyvet, a szerszámot és a csomagot a Teszt kávézóba.':'Rutin: teát ittam. '+i,'synthetic-'+i,{importance:tag?5:1});}
  for(const channel of ['in_person','phone','group'])for(const [id,check] of situations)await t.test(channel+'/'+id,async()=>{
    w.control.summary={title:'Teszt',summary:'Beszélgettek.',character_memory:'A könyvről beszéltünk.',level_delta:0};
    const conv=await w.start(channel,'A könyvet és Palor korábbi segítségét említem.');
    const req=w.requests.at(-1);maximum=Math.max(maximum,estimateTokens(req.system+req.user));
    await check(req,w,conv,channel);
    if(id!=='fact-save-gate')await w.end(conv);
  });
  t.diagnostic('baseline: 30/30 acceptance situations; maximum estimated input tokens '+maximum+' (guard 4096); three relevant memories out of 200');
});
