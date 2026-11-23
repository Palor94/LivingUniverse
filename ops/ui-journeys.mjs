#!/usr/bin/env node
// Click-through journeys (2026-11-23, owner: fewer UI bugs). Real player paths in Edge on the
// SANDBOX (a copy of the world, mock AI, never the live server), at desktop and phone width.
// After every step: the consistency checks (/api/play/invariants), browser console errors and page
// errors. Ideas after Covel's e2e rules (MIT): isolated test server, no real model by default,
// refresh / double-click / retry must not submit a turn twice, desktop and narrow screens.
//
//   npm run journeys            (or: node ops/ui-journeys.mjs [--headed] [--only talk])
//
// A step whose button cannot be found is reported as SKIPPED with the selector, not as a pass:
// then the selector here needs updating, or the button really disappeared.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const origin='http://127.0.0.1:4327';
const argv=process.argv.slice(2),only=argv.includes('--only')?argv[argv.indexOf('--only')+1]:null;
async function sandboxStatus(){try{const r=await fetch(origin+'/api/dev/sandbox-status',{signal:AbortSignal.timeout(2000)});return r.ok&&(await r.json()).sandbox===true;}catch{return false;}}
const api=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};};
const linesOf=async id=>(await api('/api/play/talk-log/talk/'+id)).data;

export const JOURNEYS=[
  {id:'open-play',steps:[
    {name:'open Play',run:async page=>{await page.goto(origin+'/#/play');await page.locator('[data-play-place],[data-play-town],[data-town-pin]').first().waitFor({timeout:20000});}}]},
  {id:'travel',steps:[
    {name:'open Play',run:async page=>{await page.goto(origin+'/#/play');await page.locator('[data-play-place],[data-town-pin]').first().waitFor({timeout:20000});}},
    {name:'click a place',selector:'[data-play-place]',run:async(page,el)=>{await el.click();await page.waitForLoadState('networkidle');}},
    {name:'click a town pin',selector:'[data-town-pin]',run:async(page,el)=>{await el.click();await page.waitForLoadState('networkidle');}}]},
  {id:'talk',steps:[
    {name:'go where someone is',run:async page=>{const ov=(await api('/api/play')).data;const n=ov.nodes.find(n=>!n.passage&&n.location_id&&ov.people.some(p=>p.location_id===n.location_id));if(!n)return 'SKIPPED: nobody anywhere';await api('/api/play/travel',{node_id:n.id});await page.goto(origin+'/#/play');await page.waitForLoadState('networkidle');}},
    {name:'start a talk',selector:'[data-play-talk]',run:async(page,el)=>{await el.click();const go=page.locator('[role=dialog] button.primary, dialog button.primary, .person-card button.primary').first();if(await go.count()&&!await page.locator('textarea').first().isVisible().catch(()=>false))await go.click();await page.locator('textarea').first().waitFor({timeout:15000});}},
    {name:'say something',selector:'textarea',run:async(page,el)=>{await el.fill('Szia, mi újság?');await el.press('Enter');await page.waitForLoadState('networkidle');}},
    {name:'refresh mid-talk: the talk resumes, nothing is sent twice',run:async page=>{
      const open=(await api('/api/play')).data.open_conversation;if(!open)return 'FAIL: no open talk after saying something';
      const before=JSON.stringify(await linesOf(open.id));await page.reload();await page.waitForLoadState('networkidle');
      const after=JSON.stringify(await linesOf(open.id));if(before!==after)return 'FAIL: the talk changed on refresh';
      if(!(await api('/api/play')).data.open_conversation)return 'FAIL: the talk closed on refresh';}},
    {name:'double-click send: one turn only',selector:'textarea',run:async(page,el)=>{
      const open=(await api('/api/play')).data.open_conversation;if(!open)return 'SKIPPED: no open talk';
      const count=async()=>((await linesOf(open.id))?.lines||[]).filter(l=>l.speaker==='palor').length;
      const n=await count();await el.fill('Egyszer mondom.');await Promise.all([el.press('Enter'),el.press('Enter')]);await page.waitForLoadState('networkidle');
      const m=await count();if(m-n>1)return `FAIL: ${m-n} Palor lines from one double send`;}},
    {name:'end the talk',run:async()=>{const open=(await api('/api/play')).data.open_conversation;if(open){const r=await api(`/api/play/conversations/${open.id}/end`,{});if(r.status>=500)return 'FAIL: end → '+r.status;}}}]},
  {id:'wait',steps:[
    {name:'open Play',run:async page=>{await page.goto(origin+'/#/play');await page.waitForLoadState('networkidle');}},
    {name:'wait one day part',selector:'[data-play-wait=next_slot]',open:'.play-wait-menu summary',run:async(page,el)=>{await el.click();await page.waitForLoadState('networkidle');}}]},
  {id:'phone-page',steps:[
    {name:'open the phone Play page',run:async page=>{await page.goto(origin+'/play');await page.waitForLoadState('networkidle');}}]}
];

async function main(){
  let sandbox,browser;const report={started:new Date().toISOString(),results:[]};
  try{
    if(!await sandboxStatus()){
      if(await fetch(origin,{signal:AbortSignal.timeout(2000)}).then(()=>true).catch(()=>false))throw Error('Port 4327 is occupied by an unverified process. Stop it first.');
      sandbox=spawn(process.execPath,[fileURLToPath(new URL('./sandbox.mjs',import.meta.url)),'--seed','42'],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
      for(let n=0;n<120&&!await sandboxStatus();n++){if(sandbox.exitCode!==null)throw Error('Sandbox startup failed.');await new Promise(r=>setTimeout(r,500));}
      if(!await sandboxStatus())throw Error('Sandbox did not become ready within 60 seconds.');
    }
    let pw;try{pw=await import('playwright-core');}catch{pw=await import(pathToFileURL(process.env.LU_PLAYWRIGHT_CORE||path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs')).href);}
    browser=await pw.chromium.launch({channel:'msedge',headless:!argv.includes('--headed')});
    const out=path.join(process.env.LOCALAPPDATA||'.', 'LivingUniverse','ui-journeys',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
    for(const [width,height,label] of [[1366,800,'desktop'],[390,844,'phone']])for(const j of JOURNEYS.filter(x=>!only||x.id===only)){
      const page=await browser.newPage({viewport:{width,height}});const errors=[];
      await page.addInitScript(()=>{try{localStorage.setItem('lu-play-tour-v1','done');}catch{}});
      page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,300));});
      page.on('response',r=>{if(r.status()===404)errors.push('404: '+r.url().slice(0,160));});page.on('pageerror',e=>errors.push('page: '+String(e.message).slice(0,300)));
      const res={journey:j.id,screen:label,steps:[]};
      for(const step of j.steps){
        let outcome='ok';
        try{
          let el=null;if(step.selector){el=page.locator(step.selector).first();if(step.open)await page.locator(step.open).first().click().catch(()=>{});if(!await el.count()||!await el.isVisible().catch(()=>false)){res.steps.push({step:step.name,outcome:'SKIPPED: not found '+step.selector});continue;}}
          const r=await step.run(page,el);if(typeof r==='string')outcome=r;
        }catch(e){outcome='FAIL: '+String(e.message).split('\n')[0].slice(0,300);}
        const inv=(await api('/api/play/invariants')).data;
        if(inv&&!inv.ok)outcome=(outcome==='ok'?'FAIL':outcome)+' | rule breaks: '+inv.errors.map(e=>e.code+' '+e.text).join('; ');
        if(errors.length){outcome=(outcome==='ok'?'FAIL':outcome)+' | browser errors: '+errors.join(' / ');errors.length=0;}
        if(outcome.startsWith('FAIL'))await page.screenshot({path:path.join(out,`${label}-${j.id}-${res.steps.length+1}.png`)}).catch(()=>{});
        res.steps.push({step:step.name,outcome});
        if(outcome.startsWith('FAIL'))break;
      }
      report.results.push(res);await page.close();
      console.log(`${label} ${j.id}: ${res.steps.map(s=>s.outcome==='ok'?'✓':s.outcome.startsWith('SKIPPED')?'–':'✗').join('')}`);
    }
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,1));
    const fails=report.results.flatMap(r=>r.steps.filter(s=>s.outcome.startsWith('FAIL')).map(s=>`${r.screen} ${r.journey} / ${s.step}: ${s.outcome}`));
    const skips=report.results.flatMap(r=>r.steps.filter(s=>s.outcome.startsWith('SKIPPED')).map(s=>`${r.screen} ${r.journey} / ${s.step}: ${s.outcome}`));
    console.log(`\n${fails.length} failed, ${skips.length} skipped.\n${[...fails,...skips].join('\n')}\nReport and failure screenshots: ${out}`);
    if(fails.length)process.exitCode=1;
  }finally{await browser?.close().catch(()=>{});if(sandbox){sandbox.send?.('sandbox-stop');}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Journeys stopped: '+e.message);process.exitCode=1;});
