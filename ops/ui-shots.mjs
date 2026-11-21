// T0: local Edge screenshots, using only the sandbox (never the live server).
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const origin='http://127.0.0.1:4327';
export function allowedShotRequest(url,method){
  try{return new URL(url).origin===origin&&['GET','HEAD'].includes(method);}catch{return false;}
}
async function sandboxStatus(){
  try{
    const r=await fetch(origin+'/api/dev/sandbox-status',{signal:AbortSignal.timeout(2000)});
    return r.ok&&(await r.json()).sandbox===true;
  }catch{return false;}
}
async function main(){
let sandbox,browser;
try{
  if(!await sandboxStatus()){
    // An occupied port with no sandbox marker must never receive app requests.
    if(await fetch(origin,{signal:AbortSignal.timeout(2000)}).then(()=>true).catch(()=>false))throw Error('Port 4327 is occupied by an unverified process. Stop it before running shots.');
    sandbox=spawn(process.execPath,[fileURLToPath(new URL('./sandbox.mjs',import.meta.url)),'--seed','42'],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
    let startupError; sandbox.on('error',error=>{startupError=error;});
    for(let n=0;n<120;n++){
      if(startupError)throw startupError;
      if(sandbox.exitCode!==null)throw Error('Sandbox startup failed.');
      if(await sandboxStatus())break;
      await new Promise(r=>setTimeout(r,500));
    }
    if(!await sandboxStatus())throw Error('Sandbox did not become ready within 60 seconds.');
  }
  // Use an existing package. No install or browser download is performed.
  let pw;
  try{pw=await import('playwright-core');}catch{
    const existing=process.env.LU_PLAYWRIGHT_CORE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
    pw=await import(pathToFileURL(existing).href);
  }
  browser=await pw.chromium.launch({channel:'msedge',headless:true});
  const out=path.join(process.env.LOCALAPPDATA,'LivingUniverse','ui-shots',new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(out,{recursive:true});
  const report=[];
  const state=(process.argv.includes('--references')||process.argv.includes('--system-errors'))?await fetch(origin+'/api/state').then(r=>r.json()):null;
  const requestedReferences=(process.argv.find(arg=>arg.startsWith('--reference-characters='))||'').split('=').slice(1).join('=').split(',').filter(id=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,10);
  const referenceIds=[...requestedReferences];
  if(process.argv.includes('--references')&&!referenceIds.length)for(const character of state.characters){const person=await fetch(origin+'/api/characters/'+encodeURIComponent(character.id)).then(r=>r.json());if(person.canon&&JSON.parse(person.canon.references_json||'[]').some(ref=>ref.crop))referenceIds.push(person.id);if(referenceIds.length===2)break;}
  if(process.argv.includes('--references')&&!referenceIds.length)throw Error('No approved cropped reference was found for the screenshot check.');
  const systemCharacters=state?(requestedReferences.length?state.characters.filter(c=>requestedReferences.includes(c.id)):state.characters.slice(0,2)):[];
  const systemErrorFixtures=systemCharacters.flatMap((c,index)=>Array.from({length:2},(_,i)=>({at:'2026-11-16T12:00:00Z',source:'server',method:'GET',route:`/api/characters/${c.id}/references/${index&&i?'33333333-3333-4333-8333-333333333333':'22222222-2222-4222-8222-222222222222'}/image`,message:'Thumbnail conversion unavailable.'})));
  const mobileHtml=process.argv.includes('--mobile')?await readFile(new URL('../app/public/play-mobile.html',import.meta.url),'utf8'):null;
  const mobileScript=mobileHtml?await readFile(new URL('../app/public/play-mobile.js',import.meta.url),'utf8'):null;
  for(const [width,height] of [[1366,800],[375,812]]){
    const page=await browser.newPage({viewport:{width,height}});
    const figureFixture=process.argv.includes('--figures');
    const fixturePng=figureFixture?Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=280;const x=c.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,160,280);x.fillStyle='#c4a88e';x.beginPath();x.arc(80,40,26,0,Math.PI*2);x.fill();x.fillStyle='#eeeeee';x.fillRect(35,75,90,115);x.fillStyle='#26364b';x.fillRect(42,190,30,80);x.fillRect(88,190,30,80);return c.toDataURL('image/png').split(',')[1];}),'base64'):null;
    const assetFixture=process.argv.includes('--asset-generation');let assetStage='compose',assetKind='background';
    const generationFixture=process.argv.includes('--generation-fixture'),fixtureImage=generationFixture||assetFixture?await readFile(new URL('../app/public/app-icon-192.png',import.meta.url)):null;let generationStage='pending';
    const profileFixture=process.argv.includes('--profile-fixture')||generationFixture?{
      character:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Teszt Ádám',aliases:'Ádi; Ádámka (a barátai használják). Egy hosszú megjegyzés.',race:'Ember',gender:'férfi',biography:'Korábbi tesztszöveg.',personality:'',sexuality:'',speech_style:'',appearance:'',notes:'',cover_id:null,relationships:[],history:[],canon:null,reference_media:[],deletion_block:'fixture',media_count:0},
      ghost:{version:1,profile_version:'fixture-version',template:{version:1,fields:[{id:'identity',label:'Élettörténet',group:'Alapok',type:'text',source:'biography'},{id:'occupation',label:'Foglalkozás',group:'Alapok',type:'text'},{id:'personality',label:'Személyiség',group:'Személyiség',type:'text',source:'personality'},{id:'appearance',label:'Megjelenés',group:'Megjelenés',type:'text',source:'appearance'},{id:'weekly_routine',label:'Heti rutin',group:'Életvitel',type:'text'},{id:'sexuality',label:'Intimitás',group:'Intimitás',type:'text',source:'sexuality'}]},values:{personality:{value:'Ez egy hosszú, szintetikus tesztszöveg. (Javaslat) '.repeat(140),kind:'hypothesis',source:'Tesztmodell',visibility:'creator',interpretation:''},occupation:{value:'Könyvtáros; a tesztben.',kind:'fact',source:'Teszt tulajdonos',visibility:'public',interpretation:''},sexuality:{value:'Ez egy általános hosszú mező a megjelenítés ellenőrzéséhez. '.repeat(120),kind:'hypothesis',source:'Tesztmodell',visibility:'creator',interpretation:''}},legacy:{biography:'Korábbi tesztszöveg.',personality:'',appearance:'',sexuality:'',speech_style:''},history:[],proposals:[]},writes:[]}:null;
    let simulatedFailure=null;
    if(process.argv.includes('--studio'))await page.addInitScript(()=>localStorage.setItem('lu-workshop-auto-signals','off'));
    if(process.argv.includes('--resume'))await page.addInitScript(()=>{
      localStorage.setItem('lu-play-tour-v1','done');
      if(!localStorage.getItem('shots-resume-seeded')){localStorage.setItem('lu-play-view',JSON.stringify({mode:'settings',townId:null}));localStorage.setItem('shots-resume-seeded','yes');}
    });
    // Screenshots may read media, but cannot invoke time, travel, AI or file writes.
    await page.context().route('**/*',async route=>{
      const r=route.request(),url=new URL(r.url());
      if(assetFixture&&url.origin===origin&&r.method()==='GET'&&(url.pathname.startsWith('/api/background-generation')||url.pathname.startsWith('/api/play/guest-generation'))){
        const base=assetKind==='guest'?'/api/play/guest-generation':'/api/background-generation',id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',target={kind:assetKind,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:assetKind==='guest'?'Teszt Vendég':'Teszt nappali',prompt:assetKind==='guest'?'One fully clothed adult man.':'Empty synthetic Hungarian living room. Ordinary daylight.'},count=assetKind==='guest'?1:2;
        const record={id,status:'generated',created_at:new Date().toISOString(),manifest_hash:'fixture-hash',manifest:{target,model:'z-turbo',prompt:target.prompt,n:count,max_estimated_capacity_units:10},estimate:{capacity_units:2},outputs:Array.from({length:count},(_,index)=>({index,preview_url:base+'/'+id+'/image/'+index}))};
        if(url.pathname.includes('/image/'))return route.fulfill({contentType:'image/png',body:fixtureImage});
        if(url.pathname===base)return route.fulfill({json:{csrf:'fixture-csrf',provider:{available:true,model:'z-turbo',max_estimated_capacity_units:10},target,runs:assetStage==='compose'?[]:[record]}});
        return route.fulfill({json:record});
      }
      if(generationFixture&&url.origin===origin){
        const cid=profileFixture.character.id,rid='dddddddd-dddd-4ddd-8ddd-dddddddddddd',mid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',base='/api/characters/'+cid+'/generation';
        const refs=['face','body'].map((role,index)=>({media_id:index?'33333333-3333-4333-8333-333333333333':'22222222-2222-4222-8222-222222222222',role,name:role==='face'?'Teszt arc':'Teszt test',available:true,sha256:'a'.repeat(64)}));
        const output=generationStage==='succeeded'?{media_id:mid,active:true}:null,manifest={provider:'sogni',model:'krea-identity-edit',prompt:'Szintetikus, hétköznapi olvasójelenet.',provider_prompt:'Synthetic test prompt.',size:'1024x1024',n:2,estimated_cost_usd:null,max_estimated_capacity_units:10,sogni_estimate:{capacity_units:2.4,usd:null,spark:null,estimated_at:new Date().toISOString()},characters:[{character_id:cid,name:profileFixture.character.name,revision_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',references:refs}]};
        const run={run_id:rid,status:generationStage,manifest,manifest_hash:'fixture-hash',created_at:new Date(Date.now()-10000).toISOString(),output,outputs:output?[output,{...output,media_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}]:[]};
        if(r.method()==='GET'&&url.pathname===base)return route.fulfill({json:{enabled:true,csrf:'fixture-csrf',providers:[{provider:'sogni',available:true,model:'krea-identity-edit',max_references:2,max_estimated_capacity_units:10}],canon:{revision_id:manifest.characters[0].revision_id,references:refs},runs:[{...run,prompt:manifest.prompt,provider:'sogni',model:manifest.model}]}});
        if(r.method()==='GET'&&url.pathname===base+'/'+rid)return route.fulfill({json:run});
        if(r.method()==='GET'&&url.pathname==='/api/generation-jobs')return route.fulfill({json:{jobs:[{run_id:rid,character_id:cid,name:profileFixture.character.name,status:generationStage,output}]}});
        if(r.method()==='GET'&&(url.pathname.startsWith('/api/characters/'+cid+'/references/')||(url.pathname==='/media/'+mid||url.pathname==='/media/ffffffff-ffff-4fff-8fff-ffffffffffff')))return route.fulfill({contentType:'image/png',body:fixtureImage});
      }
      if(profileFixture&&url.origin===origin){
        const base='/api/characters/'+profileFixture.character.id;
        if(url.pathname==='/api/state'&&r.method()==='GET'){const response=await route.fetch(),state=await response.json();return route.fulfill({json:{...state,characters:[profileFixture.character]}});}
        if(url.pathname===base&&r.method()==='GET')return route.fulfill({json:profileFixture.character});
        if(url.pathname===base+'/ghost'&&r.method()==='GET')return route.fulfill({json:profileFixture.ghost});
        if(url.pathname===base+'/ghost/manual'&&r.method()==='POST'){const body=r.postDataJSON();if(body.expected_version!==profileFixture.ghost.version)return route.fulfill({status:409,json:{error:'Synthetic stale version'}});profileFixture.writes.push(body);profileFixture.ghost.values={...profileFixture.ghost.values,...body.values};for(const [id,entry] of Object.entries(body.values)){const field=profileFixture.ghost.template.fields.find(field=>field.id===id);if(field?.source){profileFixture.ghost.legacy[field.source]=String(entry.value??'');profileFixture.character[field.source]=String(entry.value??'');}}profileFixture.ghost.version++;return route.fulfill({json:profileFixture.ghost});}
        if(url.pathname==='/api/characters/readiness'&&r.method()==='GET')return route.fulfill({json:{characters:[{id:profileFixture.character.id,profile_percent:67,profile_filled:4,profile_total:6,figures:2,has_routine:false,has_home:false,knows_palor:true,occupation:'Könyvtáros; a tesztben.'}]}});
      }
      if(process.argv.includes('--system-errors')&&url.pathname==='/api/system/status')return route.fulfill({json:{ok:false,gateway:true,tunnel:true,tailscale:'Running',startup:[],errors:systemErrorFixtures}});
      if(process.argv.includes('--reference-failure')&&/^\/api\/characters\/[^/]+\/references\/[^/]+\/image$/.test(url.pathname))return route.fulfill({status:500,json:{error:'Synthetic reference decoding failure'}});
      if(mobileHtml&&url.pathname==='/play'&&r.method()==='GET')return route.fulfill({contentType:'text/html',body:mobileHtml,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
      if(mobileHtml&&url.pathname==='/play-mobile.js'&&r.method()==='GET')return route.fulfill({contentType:'text/javascript',body:mobileScript});
      if(mobileHtml&&url.pathname==='/api/session'&&r.method()==='GET')return route.fulfill({json:{csrf:'shots-read-only'}});
      if(fixturePng&&url.pathname.startsWith('/api/sprites/fixture-'))return route.fulfill({contentType:'image/png',body:fixturePng});
      if(process.argv.includes('--scene-transitions')&&url.pathname.startsWith('/thumb/fixture-bg-'))return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${url.pathname.endsWith('b')?'#2d4050':'#593c32'}"/><rect x="100" y="100" width="600" height="550" fill="#917e64"/><rect x="1050" y="200" width="300" height="650" fill="#2c2729"/></svg>`});
      if(url.pathname==='/api/state'&&r.method()==='GET'&&simulatedFailure)return simulatedFailure==='html'?route.fulfill({status:502,contentType:'text/html',body:'<html>synthetic gateway error</html>'}):route.abort('connectionrefused');
      if(process.argv.includes('--group-picker')&&r.method()==='GET'){
        const town={id:'fixture-town',name:'Tesztváros',kind:'town',parent_id:null},node={id:'fixture-room',name:'Teszt találkozóhely',kind:'place',parent_id:town.id,location_id:'fixture-location'};
        const people=['Ádám','Béla','Csaba','Dénes','Emil'].map((name,i)=>({id:'fixture-man-'+i,name:'Teszt '+name,activity:'Beszélget.',location_id:node.location_id,level:0}));
        if(url.pathname==='/api/play')return route.fulfill({json:{node_id:node.id,nodes:[town,node],people,items:[],unread_messages:0,clock:{day:'2026-11-16',weekday:'hétfő',slot:'délelőtt',slot_index:1,time:'10:00'}}});
        if(url.pathname==='/api/play/place/'+node.id)return route.fulfill({json:{node,people,today:[],children:[],parent:town,branches:[],staff:[],room_exits:{},level_labels:[]}});
      }
      // Home normally synchronizes sorting on entry. A photo run only reads it.
      if(url.origin===origin&&url.pathname==='/api/quick-tag/sync'&&r.method()==='POST')return route.fulfill({json:{completed:0}});
      if(process.argv.includes('--tasks')&&url.origin===origin&&url.pathname==='/api/dev-tasks'&&r.method()==='POST')return route.continue();
      if(!allowedShotRequest(r.url(),r.method()))return route.abort();
      return route.continue();
    });
    await page.goto(origin);
    await page.locator('[data-home-task], .empty').first().waitFor();
    const shot=async name=>{
      await page.evaluate(()=>document.fonts.ready);
      const images=await page.evaluate(async()=>{
        const visible=[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight;});
        return Promise.all(visible.map(async img=>{
          let timer;
          try{return await Promise.race([img.decode().then(()=> 'loaded',()=> 'failed'),new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),10000);})]);}
          finally{clearTimeout(timer);}
        }));
      });
      await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
      await page.screenshot({path:path.join(out,`${name}-${width}x${height}.png`)});
      const progress=name==='home'?await page.locator('[data-incomplete]').evaluateAll(bars=>bars.map(bar=>({ratio:Number(bar.dataset.progress),gap:bar.parentElement.getBoundingClientRect().width-bar.getBoundingClientRect().width}))):[];
      if(progress.some(p=>p.gap<3.9))throw Error('An incomplete home task has no visible 4px gap.');
      const scrollY=await page.evaluate(()=>window.scrollY);
      const topbar=['world-map','kaloz'].includes(name)?await page.locator('.play-top button,.play-top summary,.play-top meter').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,id:n.id,title:n.title,label:n.getAttribute('aria-label')}))):[];
      const labelsVisible=name==='world-map'&&width>1280?await page.locator('.play-top .play-lbl').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>1)):null;
      report.push({name,width,height,scrollY,images,progress,topbar,labelsVisible});
      if(['world-map','kaloz'].includes(name)){
        const layout=await page.evaluate(name=>{
          const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};},overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
          if(name==='world-map'){
            const labels=[...document.querySelectorAll('.lm-front-ribbons .lm-ribbon')].map(rect),crowds=[...document.querySelectorAll('.lm-crowd')];
            const map=rect(document.querySelector('.lu-map')),clippedLabels=labels.filter(r=>r.left<map.left-.5||r.right>map.right+.5||r.top<map.top-.5||r.bottom>map.bottom+.5).length;
            return {crowdOverlaps:crowds.reduce((n,c)=>n+labels.filter(r=>overlap(rect(c),r)).length,0),maxFaces:Math.max(0,...crowds.map(c=>c.querySelectorAll('image').length)),labels:labels.length,clippedLabels,passed:labels.length>0&&clippedLabels===0&&crowds.every(c=>labels.every(r=>!overlap(rect(c),r)))};
          }
          const svg=document.querySelector('.tm-wrap'),labels=[...document.querySelectorAll('.tm-pin-label')].map(rect),badges=[...document.querySelectorAll('.tm-people-badge,.tm-rooms-badge')];
          const labelOverlaps=labels.reduce((n,r,i)=>n+labels.slice(i+1).filter(other=>overlap(r,other)).length,0),unlabelled=badges.filter(b=>!b.getAttribute('aria-label')||!b.querySelector('title')?.textContent).length,bottom=svg?.getBoundingClientRect().bottom;
          return {labelOverlaps,unlabelled,badges:badges.length,bottom,documentHeight:document.documentElement.scrollHeight,passed:!!svg&&unlabelled===0&&labelOverlaps===0&&(innerWidth<1000||(bottom<=innerHeight+1&&document.documentElement.scrollHeight<=innerHeight+1))};
        },name);
        report.push({name:'map-layout-check',mode:name,width,height,...layout});
      }
    };
    if(process.argv.includes('--system-errors'))await page.locator('#sys-box:not([hidden])').waitFor();
    await shot('home');
    if(process.argv.includes('--commands')){
      const overview=await page.evaluate(async()=>{const data=await fetch('/api/play').then(response=>response.json());localStorage.setItem('lu-play-tour-v1','done');localStorage.setItem('lu-favourite-places',JSON.stringify(data.nodes.filter(node=>node.location_id&&node.id!==data.node_id).slice(0,2).map(node=>node.id)));return {node_id:data.node_id};});
      let actions=0;page.on('request',request=>{if(request.method()==='POST'&&/\/api\/play\/(?:travel|talk|wait|group-talk)(?:\?|$)/.test(request.url()))actions++;});
      await page.goto(origin+'/#/play');await page.locator('#play-command-open').waitFor();await shot('commands-quick-places');
      await page.keyboard.press('Control+k');await page.locator('.play-command-palette').waitFor();await page.locator('.play-command-palette input').fill('Karakterek');await shot('commands-palette');await page.keyboard.press('Escape');
      await page.locator('#play-favourite').click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('lu-favourite-places')).includes(id),overview.node_id);const favourite=true;await shot('commands-favourite');
      report.push({name:'commands-check',width,height,favourite,actions,passed:favourite&&actions===0});await page.close();continue;
    }
    if(process.argv.includes('--tasks')){
      await page.goto(origin+'/#/tasks');await page.locator('[data-task-new]').waitFor();await shot('tasks-empty');
      const title='Szintetikus feladat '+width;await page.locator('[data-task-new]').click();await page.locator('.lu-modal [name="text"]').fill(title);await page.locator('.lu-modal [name="note"]').fill('Megosztott fejlesztési jegyzet.');await page.locator('.lu-modal button[type="submit"]').click();await page.locator('.task-title').filter({hasText:title}).waitFor();
      const task=await page.evaluate(async text=>{const value=await(await fetch('/api/dev-tasks')).json();return value.tree.find(task=>task.text===text);},title);
      const add=async text=>{await page.locator('[data-task-add="'+task.id+'"]').click();await page.locator('.lu-modal [name="text"]').fill(text);await page.locator('.lu-modal button[type="submit"]').click();await page.locator('.task-title').filter({hasText:text}).waitFor();};await add('Első ellenőrzés '+width);await add('Második ellenőrzés '+width);
      const state=await page.evaluate(async()=>await(await fetch('/api/dev-tasks')).json()),branch=state.tree.find(item=>item.id===task.id),first=branch.children[0].id,second=branch.children[1].id;
      await page.locator('[data-task-done="'+first+'"]').check();await page.waitForFunction(id=>document.querySelector('[data-task-done="'+id+'"]').indeterminate,task.id);const partial=true;
      await page.locator('[data-task-active="'+second+'"]').click();await page.waitForFunction(text=>document.querySelector('.task-current').textContent.includes(text),'Második ellenőrzés '+width);await page.locator('[data-task-active="'+task.id+'"]').click();await page.locator('.task-return [data-task-active="'+second+'"]').waitFor();await shot('tasks-tree');
      await page.locator('[data-task-fold="'+task.id+'"]').click();await page.reload();await page.locator('[data-task-fold="'+task.id+'"]').waitFor();const collapsed=await page.locator('[data-task-fold="'+task.id+'"]').getAttribute('aria-expanded')==='false';await page.locator('[data-task-fold="'+task.id+'"]').click();
      await page.locator('[data-task-edit="'+second+'"]').click();await page.locator('.lu-modal [name="note"]').fill('Frissítés után is megmaradó jegyzet. '+width);await page.locator('.lu-modal button[type="submit"]').click();await page.getByText('Frissítés után is megmaradó jegyzet. '+width,{exact:true}).waitFor();await page.reload();await page.getByText('Frissítés után is megmaradó jegyzet. '+width,{exact:true}).waitFor();const saved=await page.locator('[data-task-done="'+first+'"]').isChecked();await shot('tasks-reloaded');
      await page.locator('[data-task-images="'+task.id+'"]').click();await page.locator('[data-task-paste]').waitFor();await shot('tasks-paste');
      await page.locator('[data-task-paste]').evaluate(el=>{const canvas=document.createElement('canvas');canvas.width=720;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='#262135';ctx.fillRect(0,0,720,240);ctx.fillStyle='#f8d6e9';ctx.font='26px sans-serif';ctx.fillText('Synthetic bug screenshot: example error',24,80);ctx.fillText('Task attachment test',24,140);return new Promise(resolve=>canvas.toBlob(blob=>{const dt=new DataTransfer();dt.items.add(new File([blob],'pasted-bug.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));resolve();},'image/png'));});
      await page.getByText('Kép elmentve a feladathoz.',{exact:true}).waitFor();await page.locator('[data-task-image-close]').click();await page.locator('[data-task-id="'+task.id+'"] > .task-images img').waitFor();await shot('tasks-with-screenshot');
      await page.reload();const screenshot=page.locator('[data-task-id="'+task.id+'"] > .task-images img');await screenshot.waitFor();await screenshot.scrollIntoViewIfNeeded();await page.waitForFunction(id=>{const el=document.querySelector('[data-task-id="'+id+'"] > .task-images img');return el?.complete&&el.naturalWidth>0;},task.id,{timeout:10000});const imageSaved=await screenshot.evaluate(el=>el.complete&&el.naturalWidth===720);if(!imageSaved)throw Error('Pasted task screenshot did not survive reload.');
      await page.locator('[data-task-images="'+task.id+'"]').click();await page.locator('[data-task-file]').setInputFiles({name:'selected-bug.png',mimeType:'image/png',buffer:await readFile(new URL('../app/public/app-icon-192.png',import.meta.url))});await page.getByText('Kép elmentve a feladathoz.',{exact:true}).waitFor();await page.locator('[data-task-image-close]').click();if(await page.locator('[data-task-id="'+task.id+'"] > .task-images img').count()!==2)throw Error('Task file picker did not attach the image.');
      report.push({name:'tasks-check',width,height,partial,collapsed,saved,imageSaved,passed:partial&&collapsed&&saved&&imageSaved});await page.close();continue;
    }
    if(process.argv.includes('--studio')){
      const failures=[],studioRequests=[];page.on('request',request=>studioRequests.push(request.url()));page.on('pageerror',error=>failures.push(error.message));
      for(const view of ['world','image-workshop','quick-tag','factory']){await page.goto(origin+'/#/'+view);await page.locator('#content h1').waitFor();await page.waitForTimeout(700);await shot('studio-'+view);
        if(view==='world'&&process.argv.includes('--verify-studio')){const documentHeight=await page.evaluate(()=>document.documentElement.scrollHeight);report.push({name:'studio-today-check',width,height,documentHeight,lazy:!studioRequests.some(url=>url.includes('/api/play/readiness')||url.includes('/api/world-engine/social')),passed:documentHeight<=2*height&&!studioRequests.some(url=>url.includes('/api/play/readiness')||url.includes('/api/world-engine/social'))});for(const tab of ['readiness','places','relations','settings']){await page.locator('[data-world-tab="'+tab+'"]').click();await page.waitForTimeout(300);await shot('studio-world-'+tab);}}
        if(view==='factory'&&process.argv.includes('--verify-studio')){await page.locator('input[name="name"]').fill('Szintetikus piszkozat');await page.locator('textarea[name="description"]').fill('Szintetikus leírás.');await page.reload();await page.locator('#cf-form').waitFor();const restored=await page.locator('input[name="name"]').inputValue();const multi=await page.locator('select[multiple]').count();report.push({name:'studio-factory-check',width,height,passed:restored==='Szintetikus piszkozat'&&multi===0});}
      }
      report.push({name:'studio-errors-check',width,height,failures,passed:failures.length===0&&await page.locator('.lu-notification.error').count()===0});await page.close();continue;
    }
    if(assetFixture){
      const open=()=>page.evaluate(async kind=>{const {openAssetGeneration}=await import('/asset-generation.js');void openAssetGeneration({kind,targetId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',api:async url=>{const response=await fetch(url);return response.json();}});},assetKind);
      await open();await page.locator('[data-asset-form]').waitFor();const choices=await page.locator('[data-asset-count] option').allTextContents();await shot('asset-background-composer');await page.locator('[data-asset-close]').click();
      assetStage='generated';await open();await page.locator('.asset-variants').waitFor();const variants=await page.locator('[data-asset-select]').count();await shot('asset-background-variants');await page.locator('[data-asset-close]').click();
      assetKind='guest';assetStage='compose';await open();await page.locator('[data-asset-form]').waitFor();const guestSingle=await page.locator('[data-asset-count]').count()===0;await shot('asset-guest-composer');await page.locator('[data-asset-close]').click();
      await page.evaluate(async()=>{const {uploadProgress}=await import('/upload-image.js');const label=document.createElement('label'),input=document.createElement('input');input.type='file';label.textContent='Szintetikus feltöltés';label.append(input);document.querySelector('#content').prepend(label);window.shotsUpload=uploadProgress(input);window.shotsUpload.update(37);});await page.locator('.image-upload-progress').scrollIntoViewIfNeeded();await shot('asset-upload-progress');
      const progress=await page.locator('.image-upload-progress progress').getAttribute('value');report.push({name:'asset-generation-check',width,height,choices,variants,guestSingle,progress,passed:choices.join(',')==='2,3,4'&&variants===2&&guestSingle&&progress==='37'});await page.close();continue;
    }
    if(process.argv.includes('--interactions')){
      await page.locator('#home-resume').focus();
      await page.evaluate(async()=>{const {ask}=await import('/interactions.js');window.modalResult='pending';void ask({title:'Szintetikus vendég',message:'Két mező egyetlen megszakítható űrlapon.',fields:[{name:'hint',label:'Leírás',multiline:true},{name:'portrait',label:'Kérek portrét (fizetős)',type:'checkbox',value:false}]}).then(value=>window.modalResult=value);});
      await page.locator('.lu-modal[open]').waitFor();const unchecked=!await page.locator('.lu-modal [name="portrait"]').isChecked();await shot('interactions-guest');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.modalResult===null);
      const focus=await page.locator('#home-resume').evaluate(link=>document.activeElement===link);
      await page.evaluate(async()=>{const {askText}=await import('/interactions.js');void askText('Teszt tárgynév').then(value=>window.modalResult=value);});await page.locator('.lu-modal input').fill('<script>teszt</script>');await page.locator('.lu-modal button[type="submit"]').click();await page.waitForFunction(()=>window.modalResult==='<script>teszt</script>');
      await page.evaluate(async()=>{const {notify,undoWindow}=await import('/interactions.js');notify('Első szintetikus üzenet');notify('Második szintetikus üzenet');window.undoResult='pending';void undoWindow('Tesztművelet',{key:'fixture'}).then(value=>window.undoResult=value);});
      await page.locator('.lu-undo').waitFor();const queued=await page.locator('.lu-notification').count();await shot('interactions-undo');await page.locator('.lu-undo').click();await page.waitForFunction(()=>window.undoResult===false);
      const expires=await page.evaluate(async()=>{const {undoWindow}=await import('/interactions.js');return await undoWindow('Rövid időzítő',{delay:50,key:'expiry-test'});});
      report.push({name:'interactions-check',width,height,unchecked,focus,queued,expires,passed:unchecked&&focus&&queued===3&&expires});await page.close();continue;
    }
    if(process.argv.includes('--system-errors')){await page.locator('#sys-box').scrollIntoViewIfNeeded();await shot('system-errors');const text=await page.locator('#sys-box').textContent(),links=await page.locator('[data-system-character]').count();let target=true;if(process.argv.includes('--verify-system-errors')&&links){await page.locator('[data-system-character]').first().click();await page.locator('#canon-form').waitFor();target=await page.locator('#canon-tab').evaluate(button=>button.classList.contains('active'));await shot('system-error-target');}report.push({name:'system-errors-check',width,height,links,target,passed:links===2&&target&&!/\/api\/|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)});}
    if(generationFixture){
      await page.locator('[data-view="characters"]').click();await page.locator('[data-character]').first().waitFor();await page.locator('[data-character]').first().click();await page.locator('#generation-tab').click();await page.locator('#generation-approve').waitFor();await shot('generation-fixture-plan');
      const selected=await page.locator('[data-generation-ref]:checked').count(),disabled=await page.locator('#generation-approve').isDisabled();
      generationStage='running';await page.locator('#generation-refresh').click();await page.locator('#generation-plan progress').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#generation-jobs-chip:not([hidden])').waitFor();await shot('generation-fixture-running');
      await page.locator('[data-view="characters"]').click();await page.locator('#character-search').waitFor();generationStage='succeeded';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.lu-notification').filter({hasText:'Elkészült a kép'}).waitFor();const stayed=new URL(page.url()).hash==='#/characters';await shot('generation-fixture-notification');
      await page.locator('.lu-notification button').filter({hasText:'Megnézem'}).click();await page.locator('.generation-result').waitFor();await page.locator('.generation-result').scrollIntoViewIfNeeded();await shot('generation-fixture-result');await page.locator('#generation-again').click();
      const reused=await page.locator('#generation-scene').inputValue()==='Szintetikus, hétköznapi olvasójelenet.';
      report.push({name:'generation-fixture-check',width,height,selected,disabled,stayed,reused,passed:selected===2&&disabled&&stayed&&reused});await page.close();continue;
    }else if(profileFixture){
      await page.locator('[data-view="characters"]').click();await page.locator('[data-character]').first().waitFor();await shot('profile-fixture-list');
      let listReady=false;if(await page.locator('#character-filter').count()){await page.locator('#character-filter').selectOption('figure');const hidden=await page.locator('[data-character]').first().isHidden();await page.locator('#character-filter').selectOption('home');listReady=hidden&&await page.locator('[data-character]').first().isVisible()&&await page.locator('.character-ready-badge').count()===5;await page.locator('#character-filter').selectOption('all');}
      await page.locator(`[data-character="${profileFixture.character.id}"]`).click();await page.locator('.pf-group').first().waitFor();await shot('profile-fixture-top');
      await page.locator('.pf-nav [data-jump]').last().click();await shot('profile-fixture-section');
      const accordion=await page.locator('.pf-group[open]').count(),sticky=await page.locator('.pf-nav').evaluate(nav=>getComputedStyle(nav).position==='sticky');
      let readMode=false,expanded=false,filters=false,saved=false;
      if(await page.locator('#ghost-edit').count()){
        readMode=await page.locator('#ghost-overview').isVisible()&&await page.locator('#ghost-form').isHidden();
        const expand=page.locator('[data-read-expand]:visible').first();if(await expand.count()){const text=expand.locator('..').locator('.pf-read-text'),before=await text.evaluate(node=>node.clientHeight);await expand.click();expanded=await text.evaluate(node=>node.clientHeight)>before;await shot('profile-fixture-expanded');await expand.click();}
        await page.locator('#ghost-filter').selectOption('hypothesis');const hypotheses=await page.locator('#ghost-overview [data-profile-field]:not([hidden])').evaluateAll(rows=>rows.length>0&&rows.every(row=>row.dataset.kindValue==='hypothesis'));
        await page.locator('#ghost-filter').selectOption('empty');filters=hypotheses&&await page.locator('#ghost-overview [data-profile-field]:not([hidden])').evaluateAll(rows=>rows.length>0&&rows.every(row=>row.dataset.empty==='true'));await shot('profile-fixture-empty');await page.locator('#ghost-filter').selectOption('all');
        await page.locator('#ghost-edit').click();await page.locator('#ghost-form').waitFor();await page.locator('.pf-nav [data-jump="1"]').click();const input=page.locator('#pf-personality');await input.waitFor();
        await input.fill((await input.inputValue())+'\nKézi javítás a tesztben.');await page.waitForFunction(()=>document.getElementById('pf-dirty')?.textContent==='Automatikusan elmentve.');
        saved=profileFixture.writes.length===1&&profileFixture.writes[0].values.personality.kind==='hypothesis';await shot('profile-fixture-saved');
      }
      report.push({name:'profile-fixture-check',width,height,accordion,sticky,listReady,readMode,expanded,filters,saved,writes:profileFixture.writes.length,passed:accordion<=1&&sticky&&listReady&&readMode&&expanded&&filters&&saved});
    }else if(process.argv.includes('--references')){
      for(const id of referenceIds){
        const person=await page.evaluate(id=>fetch('/api/characters/'+id).then(r=>r.json()).then(p=>({id:p.id,name:p.name})),id);
        await page.locator('[data-view="characters"]').click();await page.locator('#character-search').fill(person.name);await page.locator(`[data-character="${id}"]`).click();await page.locator('#canon-tab').click();
        await page.locator('#canon-form').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.canon-ref').length>0&&[...document.querySelectorAll('.canon-ref img')].every(image=>image.complete));await shot('references-'+id.slice(0,8));
        const state=await page.evaluate(()=>({broken:[...document.querySelectorAll('.canon-ref img')].filter(im=>!im.naturalWidth).length,loaded:[...document.querySelectorAll('.canon-ref img')].filter(im=>im.naturalWidth>0).length,placeholders:document.querySelectorAll('.reference-unavailable').length}));
        report.push({name:'references-check',id,width,height,...state,passed:state.broken===0&&(process.argv.includes('--reference-failure')?state.placeholders>0:state.placeholders===0&&state.loaded>0)});
      }
    }else if(mobileHtml){
      await page.evaluate(()=>localStorage.setItem('lu-play-tour-v1','done'));await page.goto(origin+'/play');await page.locator('.play-top').waitFor();await shot('play-mobile');
      await page.locator('.play-wait-menu>summary').click();await shot('play-mobile-menu');
      const sleep=await page.locator('.play-wait-menu [data-play-wait="morning"]').isVisible();report.push({name:'mobile-check',width,height,sleep,passed:sleep});
    }else if(process.argv.includes('--dialog')){
      let dialogActions=0;page.on('request',r=>{if(r.method()==='POST'&&/\/api\/play\/(?:talk|group-talk|travel|wait)(?:\?|$)/.test(r.url()))dialogActions++;});
      await page.evaluate(async dialog2=>{
        localStorage.setItem('lu-play-tour-v1','done');
        const person={id:'fixture-man',name:'Teszt Ádám',activity:'Olvas.',location_id:'fixture-location',level:1,stage:'none',sprites:[]};
        const town={id:'fixture-town',name:'Tesztváros',kind:'town'},room={id:'fixture-room',name:'Teszt nappali',parent_id:town.id,location_id:person.location_id};
        const talk={...(dialog2?{last_turn:{reply_id:'fixture-reply',can_regenerate:true}}:{}),id:'fixture-talk',status:'open',channel:'in_person',character:person,lines:[{speaker:'palor',text:'Hogy vagy?'},{speaker:'character',text:'Örülök, hogy találkozunk.',beat:'talk'}],choices:['Mesélj a napodról.','Mit olvasol?']};
        const overview={node_id:room.id,nodes:[town,room],people:[person],items:[],open_conversation:{id:talk.id,character_id:person.id},clock:{day:'2026-11-16',weekday:'hétfő',slot:'délelőtt',slot_index:1,time:'10:00'}};
        window.__shotWrites=[];
        const {installPlayUI}=await import('/play.js');const ui=installPlayUI({$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),phone:innerWidth<500,toast(){},exit(){},api:async(route,body)=>{
          if(body){window.__shotWrites.push(route);throw Error('T0 write blocked');}
          if(route==='/api/play')return overview;
          if(route.startsWith('/api/play/place/'))return {node:room,people:[person],room_exits:{},today:[],children:[],level_labels:['idegen','ismerős']};
          if(route.startsWith('/api/play/conversations/'))return talk;
          if(route.startsWith('/api/play/known-character/'))return {person:{...person,their_level:1,palor_level:1,can_talk:true},labels:['idegen','ismerős'],talks:[{world_day:'2026-11-15',title:'A könyvről',summary:'Az olvasmányukról beszéltek.'}],threads:[{status:'open',text:'Elhozza a könyvet.'}],appointments:[]};
          if(route.startsWith('/api/play/eta'))return {minutes:{}};
          if(route==='/api/play/settings')return {auto_scene:false,text_speed:'instant',talk_view:dialog2?'chat':'vn'};
          return {};
        }});await ui.render(document.querySelector('#content'));
      },process.argv.includes('--dialog2'));
      await page.locator('#play-input').waitFor();await shot(process.argv.includes('--dialog2')?'dialog2-chat':'dialog-initial');if(process.argv.includes('--dialog2')){const chat=await page.locator('.vn-chat-feed p').count(),undo=await page.locator('#vn-undo-turn').count();report.push({name:'dialog2-check',width,height,chat,undo,passed:chat===2&&undo===1});}
      const multiline=await page.locator('#play-input').evaluate(input=>input.tagName==='TEXTAREA');
      const draft=multiline?'Egy hosszabb mondat.\nEgy második sor.':'Egy hosszabb mondat.';
      await page.locator('#play-input').fill(draft);await page.locator('#vn-history').click();await page.locator('#vn-history').click();await shot('dialog-draft');
      const keptDraft=await page.locator('#play-input').inputValue()===draft;
      let quickEdits=false;if(multiline){const quick=page.locator('[data-quick]').first(),text=await quick.getAttribute('data-quick');await quick.click();quickEdits=await page.locator('#play-input').inputValue()===text;await page.locator('#play-input').fill(draft);}
      await page.keyboard.press('Escape');await shot('dialog-minimized');
      const minimized=await page.locator('#play-talk-back').count();let restored=false,card=false;
      if(minimized){await page.locator('#play-talk-back').click();restored=await page.locator('#play-input').inputValue()===draft;await shot('dialog-restored');}
      if(await page.locator('[data-inspect-person]').count()){await page.keyboard.press('Escape');if(!await page.locator('[data-arrival-talk]').first().isVisible())await page.locator('.vn-arrival-pill').click();await page.locator('[data-arrival-talk]').first().click();await page.locator('.play-person-card [data-card-details] .play-previous').waitFor();await shot('dialog-card');card=true;await page.keyboard.press('Escape');}
      const writes=await page.evaluate(()=>window.__shotWrites);
      report.push({name:'dialog-check',width,height,multiline,keptDraft,quickEdits,minimized:!!minimized,restored,card,writes,dialogActions,passed:multiline&&keptDraft&&quickEdits&&!!minimized&&restored&&card&&writes.length===0&&dialogActions===0});
    }else if(process.argv.includes('--scene-transitions')){
      await page.evaluate(async figures=>{
        localStorage.setItem('lu-play-tour-v1','done');
        const town={id:'fixture-town',name:'Tesztváros',kind:'town',parent_id:null};
        const rooms=['a','b'].map(id=>({id:'fixture-room-'+id,name:'Teszt szoba '+id.toUpperCase(),parent_id:town.id,location_id:'fixture-location-'+id,kind:'place'}));
        let selected=0;const overview={node_id:rooms[0].id,nodes:[town,...rooms],people:[],items:[],clock:{day:'2026-11-16',weekday:'hétfő',slot:'délelőtt',slot_index:1,time:'10:00'}};
        const {installPlayUI}=await import('/play.js');
        const ui=installPlayUI({$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),phone:innerWidth<500,toast(){},exit(){},api:async route=>{
          if(route==='/api/play')return overview;
          if(route.startsWith('/api/play/place/'))return {node:rooms[selected],people:figures?['Ádám','Béla'].map((name,i)=>({id:'fixture-man-'+i,name:'Teszt '+name,activity:'Itt van.',sprites:[{id:'fixture-sprite-'+i,expression:'alap'}]})):[],image_id:'fixture-bg-'+(selected?'b':'a'),room_exits:{},today:[],children:[]};
          if(route.startsWith('/api/play/eta'))return {minutes:{}};
          if(route==='/api/play/settings')return {};
          return {};
        }});
        const host=document.querySelector('#content');await ui.render(host);
        window.__shotScene={ui,host,refresh:()=>ui.render(host),night:async()=>{overview.clock={...overview.clock,slot:'éjszaka',slot_index:3,time:'22:00'};await ui.render(host);},next:async()=>{ui.leave();selected=1;overview.node_id=rooms[1].id;await ui.render(host);}};
      },figureFixture);
      if(figureFixture)await page.waitForFunction(()=>[...document.querySelectorAll('[data-sprite]')].every(image=>image.naturalWidth>0));
      await shot('scene-initial');
      await page.evaluate(()=>{window.__shotOld={root:document.querySelector('.vn'),bg:document.querySelector('.vn > img.vn-bg-current')};});
      await page.locator('#vn-place-tools').click();await page.locator('#vn-doors-edit').click();await shot('scene-tools');
      const keptTools=await page.evaluate(()=>document.querySelector('.vn')===window.__shotOld.root);
      await page.locator('#vn-doors-cancel').click();await page.evaluate(()=>window.__shotScene.refresh());await shot('scene-refresh');
      const keptRefresh=await page.evaluate(()=>document.querySelector('.vn')===window.__shotOld.root&&document.querySelector('.vn > img.vn-bg-current')===window.__shotOld.bg);
      const supportsLayers=await page.locator('.vn-bg-current').count();let heldDuringLoad=false;
      if(supportsLayers){
        await page.evaluate(()=>{
          const original=HTMLImageElement.prototype.decode;
          HTMLImageElement.prototype.decode=function(){if(this.src.includes('fixture-bg-b')){HTMLImageElement.prototype.decode=original;return new Promise(resolve=>{window.__shotRelease=()=>resolve(original.call(this));});}return original.call(this);};
          window.__shotNext=window.__shotScene.next();
        });
        await page.waitForFunction(()=>typeof window.__shotRelease==='function');await shot('scene-loading');
        heldDuringLoad=await page.evaluate(()=>document.querySelector('.vn > img.vn-bg-current')===window.__shotOld.bg&&document.querySelector('.vn-title').textContent==='Teszt szoba A');
        await page.evaluate(async()=>{window.__shotRelease();await window.__shotNext;});
      }else await page.evaluate(()=>window.__shotScene.next());
      await shot('scene-next');
      const state=await page.evaluate(()=>({keptRoot:document.querySelector('.vn')===window.__shotOld.root,background:document.querySelector('.vn > img.vn-bg-current')?.getAttribute('src'),title:document.querySelector('.vn-title')?.textContent}));
      report.push({name:'scene-transitions-check',width,height,keptTools,keptRefresh,heldDuringLoad,...state,passed:keptTools&&keptRefresh&&heldDuringLoad&&state.keptRoot&&state.background?.includes('fixture-bg-b')&&state.title==='Teszt szoba B'});
      if(figureFixture){
        await page.waitForFunction(()=>[...document.querySelectorAll('[data-sprite]')].every(image=>image.naturalWidth>0));
        const sprites=await page.locator('[data-sprite]').evaluateAll(nodes=>nodes.map(image=>({webp:image.src.startsWith('data:image/webp'),width:image.naturalWidth,height:image.naturalHeight})));
        report.push({name:'figures-check',width,height,sprites,passed:sprites.length===2&&sprites.every(s=>s.webp&&s.width>0)});
      }
      if(process.argv.includes('--daypart')){await page.evaluate(()=>window.__shotScene.night());await shot('scene-night');const night=await page.evaluate(()=>({root:document.querySelector('.vn')===window.__shotOld.root,tint:getComputedStyle(document.querySelector('.vn-shade'),'::before').backgroundColor}));report.push({name:'daypart-check',width,height,...night,passed:night.root&&night.tint==='rgba(10, 20, 70, 0.55)'});}
    }else if(process.argv.includes('--request-errors')){
      simulatedFailure='html';await page.locator('[data-view="library"]').click();await page.locator('#toast').waitFor();await shot('request-html');
      const htmlMessage=await page.locator('#toast').textContent(),htmlRetry=await page.locator('#toast .api-retry').count();
      simulatedFailure=null;if(htmlRetry){await page.locator('#toast .api-retry').click();await page.locator('#media-search').waitFor();}
      simulatedFailure='offline';await page.locator('[data-view="characters"]').click();
      await page.waitForFunction(old=>document.querySelector('#toast')?.textContent!==old,htmlMessage);await shot('request-offline');
      const offlineMessage=await page.locator('#toast').textContent(),offlineRetry=await page.locator('#toast .api-retry').count();
      simulatedFailure=null;if(offlineRetry){await page.locator('#toast .api-retry').click();await page.locator('#character-search').waitFor();await shot('request-recovered');}
      report.push({name:'request-errors-check',width,height,htmlMessage,offlineMessage,htmlRetry,offlineRetry,passed:!!htmlRetry&&!!offlineRetry&&!/Unexpected token|Failed to fetch|synthetic gateway/.test(htmlMessage+offlineMessage)});
    }else if(process.argv.includes('--group-picker')){
      let groupRequests=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/play/group-talk'&&r.method()==='POST')groupRequests++;});
      await page.evaluate(()=>localStorage.setItem('lu-play-tour-v1','done'));
      await page.locator('[data-view="play"]').evaluate(b=>b.click());await page.locator('#vn-group-start').waitFor();
      await shot('group-arrival');
      const hasPicker=await page.evaluate(async()=>typeof(await import('/play.js')).chooseGroupParticipants==='function');
      let defaults=0,changed=0,tooManyDisabled=false,cancelled=false;
      if(hasPicker){
        await page.locator('#vn-group-start').click();await page.locator('.play-group-picker[open]').waitFor();await shot('group-picker');
        const boxes=page.locator('.play-group-picker input[type="checkbox"]');defaults=await page.locator('.play-group-picker input:checked').count();
        await boxes.nth(4).check();tooManyDisabled=await page.locator('[data-group-confirm]').isDisabled();
        await boxes.nth(0).uncheck();changed=await page.locator('.play-group-picker input:checked').count();await shot('group-changed');
        await page.keyboard.press('Escape');await page.locator('.play-group-picker').waitFor({state:'detached'});cancelled=true;
      }
      report.push({name:'group-picker-check',width,height,hasPicker,defaults,changed,tooManyDisabled,cancelled,groupRequests,passed:hasPicker&&defaults===4&&changed===4&&tooManyDisabled&&cancelled&&groupRequests===0});
    }else if(process.argv.includes('--sleep-menu')){
      let waitRequests=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/play/wait')waitRequests++;});
      await page.evaluate(()=>localStorage.setItem('lu-play-tour-v1','done'));
      await page.locator('[data-view="play"]').evaluate(b=>b.click());await page.locator('#play-body>*').first().waitFor();
      const sleep=page.locator('[data-play-wait="morning"]');
      const closedVisible=await sleep.isVisible();await shot('sleep-closed');
      await page.locator('.play-wait-menu>summary').click();await shot('sleep-open');
      const inside=await sleep.evaluate(b=>!!b.closest('.play-wait-menu'));
      const targetHeight=await sleep.evaluate(b=>b.getBoundingClientRect().height);
      const openReachable=await sleep.evaluate(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&!!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-play-wait="morning"]');});
      await page.locator('.play-wait-menu>summary').click();await shot('sleep-closed-again');
      report.push({name:'sleep-menu-check',width,height,closedVisible,inside,openReachable,targetHeight,waitRequests,passed:!closedVisible&&inside&&openReachable&&(width>760||targetHeight>=44)&&waitRequests===0&&!await sleep.isVisible()});
    }else if(process.argv.includes('--resume')){
      const expected=await page.evaluate(async()=>{const d=await fetch('/api/play').then(r=>r.json());const n=d.nodes.find(n=>n.id===d.node_id);return {id:n?.id||null,place:!!n?.location_id};});
      const state=()=>page.evaluate(()=>window.__luTrail?.context()?.play);
      const open=async()=>{await page.locator('[data-view="play"]').evaluate(b=>b.click());await page.locator('#play-body>*').first().waitFor();};
      await open();await shot('resume-legacy');const legacy=await state();
      await page.locator('.play-menu:not(.play-wait-menu)>summary').click();
      await page.locator('.play-top [data-play-mode="settings"]').click();
      await page.locator('#play-body form, #play-body input').first().waitFor();
      await page.locator('.play-menu:not(.play-wait-menu)>summary').click();await page.locator('#play-exit').click();
      await page.locator('[data-home-task]').first().waitFor();await open();await shot('resume-reopen');const reopened=await state();
      await page.reload();await page.locator('[data-home-task]').first().waitFor();await open();await shot('resume-reload');const reloaded=await state();
      const spatial=s=>s&&['map','town','place'].includes(s['nézet'])&&(!expected.place||s['hely_id']===expected.id);
      report.push({name:'resume-check',width,height,legacy:legacy?.['nézet'],reopened:reopened?.['nézet'],reloaded:reloaded?.['nézet'],passed:[legacy,reopened,reloaded].every(spatial)});
    }else if(process.argv.includes('--selection')){
      const homeDelete=await page.locator('.topbar #permanent-delete:visible').count();
      await page.locator('[data-view="library"]').click();
      await page.locator('.media-select').nth(1).waitFor();
      await shot('selection-empty');
      const emptyDelete=await page.locator('#library-permanent-delete:visible').count();
      await page.locator('.media-select').nth(0).evaluate(box=>box.click());
      await page.locator('.media-select').nth(1).evaluate(box=>box.click());
      await page.waitForFunction(()=>!document.querySelector('#library-permanent-delete')?.title.includes('ellenőrzése'));
      await page.locator('.bulk-toolbar').scrollIntoViewIfNeeded();
      await shot('selection-two');
      const label=await page.locator('#library-permanent-delete').textContent();
      await page.locator('#clear-selected').click();await shot('selection-cleared');
      const clearedDelete=await page.locator('#library-permanent-delete:visible').count();
      report.push({name:'selection-check',width,height,homeDelete,emptyDelete,label,clearedDelete,passed:homeDelete===0&&emptyDelete===0&&label==='2 kép végleges törlése'&&clearedDelete===0});
    }else if(process.argv.includes('--locations')){
      await page.locator('[data-view="location-catalogue"]').click();await page.locator('.lc-node').first().waitFor();await shot('locations-overview');
      const fit=await page.locator('.lc-board').evaluate(board=>{const b=board.getBoundingClientRect(),nodes=[...board.querySelectorAll('.lc-node')];return {nodes:nodes.length,clipped:nodes.filter(node=>{const r=node.getBoundingClientRect();return r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1;}).length};}),primary=await page.locator('.lc-heading .actions>button').count(),groups=await page.locator('.lc-source-group').count();
      await page.locator('[data-view="home"]').click();await page.locator('#home-resume').waitFor();
      await page.evaluate(async()=>{const context=await fetch('/api/location-canvas').then(r=>r.json()),state=structuredClone(context.state);state.nodes.find(node=>node.id==='world:living-universe').note='Helyi próbaszöveg';localStorage.setItem('lu-location-canvas-v1:'+context.catalogue_id,JSON.stringify({head:'stale-fixture',catalogue_version:context.catalogue_version,state,collapsed:[]}));});
      await page.locator('[data-view="location-catalogue"]').click();await page.locator('.lu-modal select').waitFor();await page.keyboard.press('Escape');const required=await page.locator('.lu-modal[open]').count()===1;await shot('locations-conflict');await page.locator('.lu-modal select').selectOption(width===1366?'server':'local');await page.locator('.lu-modal button[type="submit"]').click();await page.locator('.lc-node').first().waitFor();
      const chosen=await page.locator('.lc-inspector').textContent(),resolved=width===1366?!chosen.includes('Helyi próbaszöveg'):chosen.includes('Helyi próbaszöveg');await shot('locations-resolved');
      await page.locator('[data-hub-tab="backgrounds"]').click();await page.locator('.hub-background-row').first().waitFor();await shot('locations-backgrounds');
      await page.locator('[data-hub-tab="map"]').click();await page.locator('.location-studio-play .tm-wrap svg').waitFor();await shot('locations-map-editor');
      await page.locator('[data-hub-tab="doors"]').click();await page.locator('.location-studio-play .vn').waitFor();await shot('locations-door-editor');const studio=await page.evaluate(()=>!document.body.classList.contains('play-mode')&&!document.querySelector('.play-tour'));
      report.push({name:'locations-check',width,height,...fit,primary,groups,required,resolved,studio,passed:fit.nodes>1&&fit.clipped===0&&primary===3&&groups>0&&required&&resolved&&studio});
    }else if(process.argv.includes('--generation')){
      await page.locator('[data-view="characters"]').click();await page.locator('[data-character]').first().waitFor();await page.locator('[data-character]').first().click();await page.locator('#generation-tab').click();await page.locator('#generation-composer').waitFor();await shot('generation-composer');
      const selected=await page.locator('[data-generation-ref]:checked').count(),buttons=await page.locator('#generation-prepare').count();report.push({name:'generation-check',width,height,selected,buttons});
    }else if(process.argv.includes('--routes')){
      await page.locator('[data-view="characters"]').click();await page.locator('[data-character]').first().waitFor();
      const cid=await page.locator('[data-character]').first().getAttribute('data-character');
      await page.locator(`[data-character="${cid}"]`).first().click();await page.locator('#ghost-overview').waitFor();
      await page.locator('#canon-tab').click();await page.locator('#canon-form').waitFor();const canonicalHash=new URL(page.url()).hash;
      await page.reload();await page.locator('#canon-form').waitFor();const refreshed=new URL(page.url()).hash===canonicalHash&&canonicalHash===`#/profile/${cid}/canon`;
      await shot('routes-canon-reloaded');await page.goBack();await page.locator('#ghost-overview').waitFor();
      const back=new URL(page.url()).hash===`#/profile/${cid}/profile`;
      await page.goForward();await page.locator('#canon-form').waitFor();const forward=new URL(page.url()).hash===canonicalHash;
      await page.locator('[data-view="home"]').click();await page.locator('#home-resume').waitFor();await shot('routes-home-resume');
      await page.locator('#start-in-play').check();await page.addInitScript(()=>localStorage.setItem('lu-play-tour-v1','done'));
      await page.goto(origin+'/');await page.locator('.play-top').waitFor();const startup=new URL(page.url()).hash==='#/play';await shot('routes-start-play');
      await page.goto(origin+'/#/home');await page.locator('#home-resume').waitFor();const explicitHome=new URL(page.url()).hash==='#/home';await page.locator('#start-in-play').uncheck();
      const manifests=await page.evaluate(async()=>{const m=await fetch('/manifest.webmanifest').then(r=>r.json()),icons=await Promise.all(m.icons.map(async icon=>{const r=await fetch(icon.src);return r.ok&&r.headers.get('Content-Type')==='image/png';}));return m.start_url==='/#/play'&&icons.every(Boolean);});
      report.push({name:'routes-check',width,height,refreshed,back,forward,startup,explicitHome,manifests,passed:refreshed&&back&&forward&&startup&&explicitHome&&manifests});
    }else if(process.argv.includes('--navigation')){
      await page.locator('[data-view="characters"]').click();
      await page.locator('[data-character]').first().waitFor();
      await page.evaluate(()=>window.scrollTo(0,1800));
      const chosen=await page.locator('[data-character]').evaluateAll(cards=>cards.find(c=>{const r=c.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})?.dataset.character);
      if(!chosen)throw Error('No visible character card for the navigation check.');
      const listY=await page.evaluate(()=>window.scrollY);
      await shot('navigation-list');
      await page.locator(`[data-character="${chosen}"]`).click();
      await page.locator('#profile-content .pf-group').first().waitFor({state:'attached'});
      await shot('navigation-profile');const profileY=await page.evaluate(()=>window.scrollY);
      await page.evaluate(()=>window.scrollTo(0,3000));
      await page.locator('#back-characters').evaluate(button=>button.click());
      await page.locator('#character-search').waitFor();
      await shot('navigation-return');const returnY=await page.evaluate(()=>window.scrollY);
      await page.locator(`[data-character="${chosen}"]`).evaluate(button=>button.click());
      await page.locator('#profile-content .pf-group').first().waitFor({state:'attached'});
      await page.evaluate(()=>window.scrollTo(0,3000));
      await page.locator('[data-view="location-catalogue"]').evaluate(button=>button.click());
      await page.locator('.lc-node').first().waitFor();
      await shot('navigation-locations');const locationsY=await page.evaluate(()=>window.scrollY);
      report.push({name:'navigation-check',width,height,listY,profileY,returnY,locationsY,passed:profileY===0&&Math.abs(returnY-listY)<=1&&locationsY===0});
    }else if(!process.argv.includes('--home-only')){
      await page.locator('[data-view="characters"]').click();
      await page.locator('[data-character]').first().waitFor();await shot('characters');
      await page.locator('[data-character]').first().click();
      await page.locator('#profile-content .pf-group').first().waitFor({state:'attached'});
      await page.evaluate(()=>window.scrollTo(0,0));await shot('profile-top');
      await page.evaluate(()=>window.scrollTo(0,3000));await shot('profile-bottom');
      await page.locator('[data-view="location-catalogue"]').click();
      await page.locator('canvas, .lc-canvas, svg').first().waitFor();
      await page.evaluate(()=>window.scrollTo(0,0));await shot('locations');
      // Render the real Play UI with read-only overview data. Override only the
      // display position, so neither travel nor the Térkép action is invoked.
      for(const mode of ['map','town']){
        await page.goto(origin);
        await page.locator('[data-home-task], .empty').first().waitFor();
        await page.evaluate(async mode=>{
          const overview=await fetch('/api/play').then(r=>r.json());
          const town=overview.nodes.find(n=>n.name==='Káloz');
          localStorage.setItem('lu-play-view',JSON.stringify({mode,townId:town?.id}));
          localStorage.setItem('lu-play-tour-v1','done');
          const {installPlayUI}=await import('/play.js');
          const ui=installPlayUI({$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),api:async route=>route==='/api/play'?{...overview,node_id:mode==='town'?town?.id:null,open_conversation:null}:fetch(route).then(r=>r.json()),toast(){},exit(){}});
          await ui.render(document.querySelector('#content'));
        },mode);
        await shot(mode==='map'?'world-map':'kaloz');
        if(mode==='map'&&process.argv.includes('--travel-choice')){
          await page.evaluate(async()=>{const {travelOptionsDialog}=await import('/play-travel.js');window.__shotChoice=travelOptionsDialog({options:[{mode:'bike',minutes:120},{mode:'car',minutes:30},{mode:'train',minutes:40,line:'Teszt vonal'}],from:'Tesztváros',to:'Másik tesztváros',esc:s=>String(s)});});
          await page.locator('.travel-options-dialog[open]').waitFor();await shot('travel-options');await page.keyboard.press('Escape');const cancelled=await page.evaluate(()=>window.__shotChoice===null?false:window.__shotChoice.then(value=>value===null));
          await page.evaluate(async()=>{const {tripChoiceNotice}=await import('/play-travel.js');window.__shotPreflight=tripChoiceNotice({place:'Tesztváros',mode:'car',esc:s=>String(s),ms:60000});});
          await shot('travel-preflight');await page.locator('[data-trip-change]').click();const changed=await page.evaluate(()=>window.__shotPreflight.then(value=>value==='change'));
          report.push({name:'travel-choice-check',width,height,cancelled,changed,passed:cancelled&&changed});
        }
        if(mode==='town'&&process.argv.includes('--travel-hints')){
          const pin=page.locator('[data-town-pin]').first();
          await pin.hover();
          const available=await page.evaluate(async()=>typeof(await import('/play.js')).installTravelHints==='function');
          if(available){
            await page.locator('.play-travel-hint').waitFor();await shot('travel-hover');
            await page.mouse.move(0,0);await pin.evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:20,clientY:20}));});
            await page.locator('.play-travel-hint').waitFor();await shot('travel-touch');
            let travels=0;page.on('request',r=>{if(r.url().includes('/api/play/travel'))travels++;});
            await pin.evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});
            report.push({name:'travel-hints-check',width,height,available,travels,passed:travels===0});
          }else report.push({name:'travel-hints-check',width,height,available,passed:false});
        }
        if(mode==='map'&&process.argv.includes('--debug')){
          await page.evaluate(async()=>{
            const {installPlayDebug}=await import('/play-debug.js');
            installPlayDebug({esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),api:route=>fetch(route).then(r=>r.json()),toast(){}}).toggle(true);
          });
          await shot('play-debug');
        }
      }
    }
    await page.close();
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log('Screenshots: '+out+' ('+report.filter(r=>!r.name.endsWith('-check')).length+')');
  if(process.argv.includes('--verify-navigation')&&report.some(r=>r.name==='navigation-check'&&!r.passed))throw Error('Navigation scroll verification failed; see report.json.');
  if(process.argv.includes('--verify-routes')&&report.some(r=>r.name==='routes-check'&&!r.passed))throw Error('Route verification failed; see report.json.');
  if(process.argv.includes('--verify-interactions')&&report.some(r=>r.name==='interactions-check'&&!r.passed))throw Error('Interaction verification failed; see report.json.');
  if(process.argv.includes('--tasks')&&report.some(row=>row.name==='tasks-check'&&!row.passed))throw Error('Task checklist verification failed; see report.json.');
  if(process.argv.includes('--verify-studio')&&report.some(row=>row.name.startsWith('studio-')&&row.name.endsWith('-check')&&!row.passed))throw Error('Studio verification failed; see report.json.');
  if(process.argv.includes('--verify-generation')&&report.some(r=>r.name==='generation-fixture-check'&&!r.passed))throw Error('Generation verification failed; see report.json.');
  if(process.argv.includes('--verify-assets')&&report.some(r=>r.name==='asset-generation-check'&&!r.passed))throw Error('Asset generation verification failed; see report.json.');
  if(process.argv.includes('--verify-locations')&&report.some(r=>r.name==='locations-check'&&!r.passed))throw Error('Location canvas verification failed; see report.json.');
  if(process.argv.includes('--verify-commands')&&report.some(r=>r.name==='commands-check'&&!r.passed))throw Error('Command palette verification failed; see report.json.');
  if(process.argv.includes('--verify-selection')&&report.some(r=>r.name==='selection-check'&&!r.passed))throw Error('Selection visibility verification failed; see report.json.');
  if(process.argv.includes('--verify-topbar')&&report.some(r=>r.labelsVisible===false||r.topbar?.some(n=>!n.title||!n.label)))throw Error('Top bar accessibility verification failed; see report.json.');
  if(process.argv.includes('--verify-resume')&&report.some(r=>r.name==='resume-check'&&!r.passed))throw Error('Play resume verification failed; see report.json.');
  if(process.argv.includes('--verify-sleep-menu')&&report.some(r=>r.name==='sleep-menu-check'&&!r.passed))throw Error('Sleep menu verification failed; see report.json.');
  if(process.argv.includes('--verify-group-picker')&&report.some(r=>r.name==='group-picker-check'&&!r.passed))throw Error('Group picker verification failed; see report.json.');
  if(process.argv.includes('--verify-request-errors')&&report.some(r=>r.name==='request-errors-check'&&!r.passed))throw Error('Request error verification failed; see report.json.');
  if(process.argv.includes('--verify-travel-hints')&&report.some(r=>r.name==='travel-hints-check'&&!r.passed))throw Error('Travel hint verification failed; see report.json.');
  if(process.argv.includes('--verify-scene-transitions')&&report.some(r=>r.name==='scene-transitions-check'&&!r.passed))throw Error('Scene transition verification failed; see report.json.');
  if(process.argv.includes('--verify-figures')&&report.some(r=>r.name==='figures-check'&&!r.passed))throw Error('Worker figure verification failed; see report.json.');
  if(process.argv.includes('--verify-daypart')&&report.some(r=>r.name==='daypart-check'&&!r.passed))throw Error('Day-part verification failed; see report.json.');
  if(process.argv.includes('--dialog2')&&report.some(row=>row.name==='dialog2-check'&&!row.passed))throw Error('Dialogue II verification failed; see report.json.');
  if(process.argv.includes('--verify-dialog')&&report.some(r=>r.name==='dialog-check'&&!r.passed))throw Error('Dialogue verification failed; see report.json.');
  if(process.argv.includes('--verify-mobile')&&report.some(r=>r.name==='mobile-check'&&!r.passed))throw Error('Mobile Play verification failed; see report.json.');
  if(process.argv.includes('--verify-map-layout')&&report.some(r=>r.name==='map-layout-check'&&!r.passed))throw Error('Map layout verification failed; see report.json.');
  if(process.argv.includes('--verify-travel-choice')&&report.some(r=>r.name==='travel-choice-check'&&!r.passed))throw Error('Travel choice verification failed; see report.json.');
  if(process.argv.includes('--verify-references')&&report.some(r=>r.name==='references-check'&&!r.passed))throw Error('Reference fallback verification failed; see report.json.');
  if(process.argv.includes('--verify-system-errors')&&report.some(r=>r.name==='system-errors-check'&&!r.passed))throw Error('System error summary verification failed; see report.json.');
  if(process.argv.includes('--verify-profile-fixture')&&report.some(r=>r.name==='profile-fixture-check'&&!r.passed))throw Error('Profile layout verification failed; see report.json.');
}finally{
  await browser?.close();
  if(sandbox?.connected){
    const closed=once(sandbox,'exit');sandbox.send('sandbox-stop');
    const timer=setTimeout(()=>sandbox.kill(),15000);
    try{await closed;}finally{clearTimeout(timer);}
  }
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
