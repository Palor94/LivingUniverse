#!/usr/bin/env node
// Robot player (2026-11-23, owner): plays random valid actions on a COPY of the live world and runs
// the consistency checks (app/invariants.mjs) after every step, plus mechanical checks on every
// character reply. It finds rule breaks (lost people, wrong places, crashes, empty / cut / repeated
// replies, a character writing Palor's lines, prompt text leaking into a reply). It cannot judge
// whether a talk feels right: with --live the report keeps the transcripts for the owner to read.
//
//   node ops/robot-player.mjs                       mock AI, 150 steps, free
//   node ops/robot-player.mjs --steps 400 --seed 7  longer run, repeatable
//   node ops/robot-player.mjs --live --max-usd 1 --i-accept-cost [--model grok-4-1-fast-non-reasoning]
//
// Safety: the live catalogue is copied with SQLite's backup API into a throwaway "sandbox" folder and
// deleted afterwards (--keep keeps it). No media folder (an empty one), no MCP, no image generation,
// no Grok gateway. --live calls xAI directly through a budget guard: every call reserves its worst
// case (input bytes + 256 tokens, full output) before it is sent and is refused once the reservation
// would pass --max-usd; an uncertain failure counts its full reservation as spent. Not retried.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createApp,resolveDataDir} from '../app/server.mjs';
import {createMockProvider,createXaiProvider,readXaiKey,priceOf,pricesFor,DEFAULT_MODEL} from '../app/world-ai.mjs';
import {copyCatalogue,seededRandom,removeCopy} from './sandbox.mjs';
import {checkReply} from '../app/invariants.mjs';

const argv=process.argv.slice(2);
const arg=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0?argv[i+1]:d;};
const flag=n=>argv.includes('--'+n);

// Palor's lines: ordinary talk plus the situations that tend to break characters.
export const PALOR_LINES=[
  'Szia! Mi újság veled mostanában?','Mit csinálsz itt ilyenkor?','Ráérsz egy kicsit?','Szerintem ebben nincs igazad.',
  'Holnap segítek, ígérem.','Erről most nem szeretnék beszélni.','Mesélj valamit magadról, amit még nem tudok.',
  'Haragszol rám valamiért?','Hogy vagy igazából?','Mit gondolsz a többiekről itt?','Elnézést, ma nagyon fáradt vagyok.',
  'Te mindig ilyen vagy?','Na jó, mennem kell lassan.','*leül mellé, és csendben néz*','Csak úgy beugrottam.'
];

// Mock replies shaped like the real ones: a talk reply, a group reply, a summary.
export function mockProvider(rand){
  let n=0;
  return createMockProvider(req=>{n++;const s=String(req.system||''),u=String(req.user||'');
    const names=[...u.matchAll(/^## (.+?)\n/gm)].map(m=>m[1]);
    if(s.includes('társas jelenetet foglalsz'))return {title:'Teszt társaság',summary:'Beszélgettek.',memories:Object.fromEntries(names.map(x=>[x,'Palorral beszélgettem.'])),importance:2};
    if(s.includes('foglalsz össze'))return {title:'Teszt beszélgetés',summary:'Beszélgettek pár szót.',character_memory:'Palorral beszélgettem.',level_delta:0,importance:2,tags:['csevegés']};
    if(s.includes('játék Rendszere'))return {answer:'Próba.'};
    if(s.includes('játékmester'))return {events:[]};
    if(s.includes('szimulációjában'))return {intention:'Pihen.',location_id:null,wants_to_meet:[],message_to_palor:null};
    if(s.includes('társas jelenetét'))return {replies:names.slice(0,2).map(name=>({name,text:'Próbaválasz '+n+'.'})),beat:'talk',choices:['Igen.','Nem.','Majd meglátjuk.']};
    return {reply:'*Bólint.* Próbaválasz '+n+'.',mood:'alap',beat:'talk',spark:0,choices:['Igen.','Nem.','Mesélj.']};
  });
}

export function budgetGuard(provider,{maxUsd,prices}){
  const state={spent:0,calls:0,refused:0,exhausted:false};
  return {state,provider:{name:provider.name,model:provider.model,async complete(req){
    const reserve=priceOf({input:Buffer.byteLength(String(req.system)+'\n'+String(req.user),'utf8')+256,output:req.maxTokens||600},prices);
    if(state.spent+reserve>maxUsd){state.refused++;state.exhausted=true;throw Object.assign(new Error('Robot budget reached.'),{code:'AI_FAILED'});}
    state.calls++;
    try{const r=await provider.complete(req);state.spent+=priceOf(r.usage||{},prices);return r;}
    catch(e){if(e.code!=='AI_FAILED'&&e.code!=='AI_KEY')state.spent+=reserve;throw e;}
  }}};
}

async function main(){
  const live=flag('live'),steps=Number(arg('steps',live?120:150)),seed=Number(arg('seed',Date.now()%100000));
  const maxUsd=Number(arg('max-usd','0'));
  if(live){
    if(!flag('i-accept-cost'))throw Error('--live spends real money: add --i-accept-cost.');
    if(!(maxUsd>0)||maxUsd>1&&!flag('allow-more'))throw Error('--live needs --max-usd between 0 and 1 (add --allow-more for a larger budget).');
  }
  const liveDir=arg('data',resolveDataDir());
  const base=path.join(process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'LivingUniverse'):os.tmpdir());
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const dataDir=path.join(base,'sandbox','robot-'+stamp);
  const outDir=arg('out',path.join(base,'robot-reports'));
  console.log('Copying the world…');await copyCatalogue({liveDir,target:dataDir});
  const root=path.join(dataDir,'media');await fs.mkdir(root,{recursive:true});
  const rand=seededRandom(seed),pick=a=>a[Math.floor(rand()*a.length)];
  let guard=null,provider=mockProvider(rand);
  if(live){
    const model=arg('model',DEFAULT_MODEL),key=await readXaiKey(liveDir);if(!key)throw Error('No xAI key found (Windows only, or set XAI_API_KEY).');
    guard=budgetGuard(createXaiProvider({key,model}),{maxUsd,prices:pricesFor(model)});provider=guard.provider;
    console.log(`LIVE: ${model}, budget $${maxUsd}`);
  }
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,playRandom:seededRandom(seed),worldProvider:provider});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const report={started:new Date().toISOString(),seed,live,model:live?arg('model',DEFAULT_MODEL):'mock',steps:0,actions:{},http_errors:[],refused:0,invariant_issues:new Map(),reply_issues:[],talks:[],cost:null};
  const trail=[];const note=t=>{trail.push(t);if(trail.length>8)trail.shift();};
  async function call(method,route,body){
    const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json().catch(()=>null);
    if(r.status>=500)report.http_errors.push({step:report.steps,route,status:r.status,error:data?.error||'',trail:[...trail]});
    else if(r.status>=400)report.refused++;
    return r.ok?data:null;
  }
  const charLines=v=>(v?.lines||[]).filter(l=>l.speaker==='character');
  async function converse(start,more){
    let v=await call('POST',start.route,start.body);if(!v)return;
    const talk={with:v.participants?.map(p=>p.name).join(', ')||v.character?.name,channel:v.channel,lines:[]};
    const seen=[],own=new Map();const checkNew=view=>{for(const l of charLines(view).slice(seen.length)){const who=l.speaker_name||talk.with,mine=own.get(who)||[];const issues=checkReply(l.text,{previous:mine});for(const i of issues)report.reply_issues.push({...i,step:report.steps,who,text:String(l.text).slice(0,300)});seen.push(l.text);own.set(who,[...mine,l.text]);}};
    checkNew(v);
    for(let i=0;i<more&&!guard?.state.exhausted;i++){
      const text=pick(PALOR_LINES);note('mondja: '+text);
      const n=await call('POST',start.route,{conversation_id:v.id,...(start.route==='/api/play/talk'?{character_id:start.body.character_id,channel:start.body.channel}:{}),text});
      if(!n)break;v=n;checkNew(v);
    }
    talk.lines=(v.lines||[]).map(l=>`${l.speaker==='palor'?'Palor':l.speaker_name||talk.with}: ${l.text}`);report.talks.push(talk);
    await call('POST',`/api/play/conversations/${v.id}/end`,{});note('vége a beszélgetésnek');
  }
  const ACTIONS=[['talk',40],['travel',28],['group',10],['phone',10],['wait',12]];
  const weighted=()=>{let r=rand()*100;for(const [a,w] of ACTIONS){if((r-=w)<0)return a;}return 'wait';};
  try{
    for(let s=0;s<steps;s++){
      if(guard?.state.exhausted){console.log('Budget reached, stopping.');break;}
      report.steps=s+1;const ov=await call('GET','/api/play');if(!ov)break;
      const places=ov.nodes.filter(n=>!n.archived&&n.placed!==false&&!n.passage&&n.location_id);
      const peopled=places.filter(n=>ov.people.some(p=>p.location_id===n.location_id));
      const here=ov.nodes.find(n=>n.id===ov.node_id);
      const present=here?.location_id?ov.people.filter(p=>p.location_id===here.location_id):[];
      let a=weighted();if((a==='talk'||a==='group')&&!present.length)a='travel';if(a==='group'&&present.length<2)a='talk';
      report.actions[a]=(report.actions[a]||0)+1;
      if(a==='travel'){const to=rand()<0.6&&peopled.length?pick(peopled):pick(places);note('megy: '+(to.short_name||to.name));await call('POST','/api/play/travel',{node_id:to.id});}
      else if(a==='wait'){const until=rand()<0.8?'next_slot':'morning';note('vár: '+until);await call('POST','/api/play/wait',{until});}
      else if(a==='talk'){const c=pick(present);note('beszél vele: '+c.id);await converse({route:'/api/play/talk',body:{character_id:c.id,channel:'in_person',opener:true}},1+Math.floor(rand()*4));}
      else if(a==='group'){const ids=[...present].sort(()=>rand()-0.5).slice(0,Math.min(3,present.length)).map(p=>p.id);note('társaság: '+ids.length);await converse({route:'/api/play/group-talk',body:{character_ids:ids,opener:true}},1+Math.floor(rand()*3));}
      else if(a==='phone'){const ph=await call('GET','/api/play/phone');const c=ph?.contacts?.length?pick(ph.contacts):null;if(c){note('telefon: '+(c.name||c.id));await converse({route:'/api/play/talk',body:{character_id:c.id,channel:'phone',opener:true}},1+Math.floor(rand()*3));}}
      const inv=await call('GET','/api/play/invariants');
      for(const e of [...(inv?.errors||[]).map(x=>({...x,level:'error'})),...(inv?.warnings||[]).map(x=>({...x,level:'warning'}))]){
        const k=e.code+'|'+e.ids.join(',');if(!report.invariant_issues.has(k))report.invariant_issues.set(k,{...e,first_step:report.steps,day:inv.day,slot:inv.slot,trail:[...trail],times:0});report.invariant_issues.get(k).times++;}
      if((s+1)%25===0)console.log(`step ${s+1}/${steps}${guard?` – $${guard.state.spent.toFixed(3)} spent`:''}`);
    }
  }finally{
    await app.close();
    if(guard)report.cost={spent_usd:Number(guard.state.spent.toFixed(4)),calls:guard.state.calls,refused_by_budget:guard.state.refused,max_usd:maxUsd};
    if(!flag('keep'))await removeCopy(dataDir).catch(()=>{});
  }
  const issues=[...report.invariant_issues.values()];
  await fs.mkdir(outDir,{recursive:true});
  const file=path.join(outDir,'robot-'+stamp);
  await fs.writeFile(file+'.json',JSON.stringify({...report,invariant_issues:issues},null,1));
  const md=[`# Robotjátékos – ${stamp}`,`Mód: ${live?'ÉLŐ ('+report.model+')':'próba (mock AI)'} · seed ${seed} · ${report.steps} lépés · ${JSON.stringify(report.actions)}`,
    ...(report.cost?[`Költség: $${report.cost.spent_usd} / $${maxUsd} (${report.cost.calls} hívás)`]:[]),'',
    `## Szabálysértések (${issues.filter(i=>i.level==='error').length} hiba, ${issues.filter(i=>i.level==='warning').length} figyelmeztetés)`,
    ...issues.map(i=>`- **${i.level==='error'?'HIBA':'figyelem'} ${i.code}** (${i.times}×, először a ${i.first_step}. lépésnél, ${i.day} ${i.slot}): ${i.text}\n  előtte: ${i.trail.join(' → ')}`),'',
    `## Szerverhibák (${report.http_errors.length})`,...report.http_errors.map(e=>`- ${e.step}. lépés ${e.route} → ${e.status}: ${e.error}\n  előtte: ${e.trail.join(' → ')}`),'',
    `## Válaszhibák (${report.reply_issues.length})`,...report.reply_issues.map(r=>`- ${r.code} (${r.step}. lépés, ${r.who}): ${r.text}`),'',
    `Elutasított kérések (4xx, általában rendben): ${report.refused}`,'',
    ...(live?['## Beszélgetések (olvasd el: ezt a robot nem tudja megítélni)',...report.talks.flatMap(t=>['',`### ${t.with} (${t.channel})`,...t.lines.map(l=>'> '+l)])]:[])].join('\n');
  await fs.writeFile(file+'.md',md);
  console.log(`\nKész: ${issues.filter(i=>i.level==='error').length} hiba, ${issues.filter(i=>i.level==='warning').length} figyelmeztetés, ${report.http_errors.length} szerverhiba, ${report.reply_issues.length} válaszhiba.\nJelentés: ${file}.md`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Robot stopped: '+e.message);process.exitCode=1;});
