import {openCommandPalette,readFavouritePlaces,quickPlaces} from './command-palette.js';
import {openPictureOrder} from './picture-order.js';
import {openAssetGeneration} from './asset-generation.js';
import {uploadImage,uploadProgress} from './upload-image.js';
import {cancelUndoWindows,confirmBox,askText,ask,undoWindow} from './interactions.js';
// "Játék" screen, full screen. Three levels like location-based browser games:
// world map (towns) → town view (its places as picture cards, with who is where) →
// place scene (background photo, only the people actually there, talk). Ending a
// conversation saves it as a memory for both sides.
import {t,translateServerMessage} from './i18n.js';
import {cutout} from './sprite-cutout.js';
import {mapSvg,PLACES} from './play-map.js';
import {roadTransition,playStory,roadsideChoice} from './play-story.js';
import {townMapSvg,toMap,KIND_ICON} from './play-town-map.js';
import {icon} from './play-icons.js';
import {installPlayDebug} from './play-debug.js';
import {decodedImage,updateScene,memoizedRead} from './play-scene.js';
import {bindGrowingInput,openPersonCard,previousConversationHtml} from './play-dialog.js';
import {preferredTravel,rememberedTravel,travelPayload,travelOptionsDialog,tripChoiceNotice} from './play-travel.js';

// Schematic town positions: real north/south/east/west order, close towns spread apart.
const SLOT_ICON=['🌅','☀️','🌇','🌙'];

export function installPlayUI({$,$$,esc,api,toast,exit,requestHeaders=()=>({}),phone=false,studio=false,studioView=()=>({mode:'map'}),openStudio=()=>{},openScreen=async()=>{}}){
  const turnIntents=new Map();
  let settings={adult:false,text_speed:'normal'};
  const topHelp=(key,vars)=>{const text=esc(t(key,vars));return `title="${text}" aria-label="${text}"`;};
  const unreadBadge=count=>count?` <b class="play-menu-badge" ${topHelp('play.top.unread',{count})}>${count}</b>`:'';
  function paintUnread(count){
    const unread=count?t('play.top.unread',{count}):t('play.top.noUnread');
    for(const [selector,key] of [['.play-menu:not(.play-wait-menu)>summary','play.top.menu'],['.play-top [data-play-mode="messages"]','play.top.messages']]){
      const parent=$(selector);if(!parent)continue;
      parent.querySelector('.play-menu-badge')?.remove();parent.insertAdjacentHTML('beforeend',unreadBadge(count));
      parent.title=t(key,{unread});parent.setAttribute('aria-label',t(key,{unread}));
    }
  }
  let synced=false,mode='map',data=null,current=null,townId=null,mapView='visual',talk=null,talkCharacter=null,talkChannel='in_person',busy=false,root=null,drive=true;
  let spatialView={mode:'map',townId:null};
  // Debug panel (F9) and trail context: what the panel and a bug report show about this screen.
  const debugPanel=installPlayDebug({esc,api,toast,phone:phone||studio});
  // "pozíció" is where the server keeps Palor (a town id means its street); "megnyitott hely" is
  // the place screen last shown, which can differ after stepping out.
  if(!studio)window.__luTrail?.setContext('play',()=>({nézet:mode,pozíció:(data?.nodes||[]).find(n=>n.id===data?.node_id)?.name||data?.node_id||null,pozíció_id:data?.node_id||null,megnyitott_hely:mode==='place'?(current?.node?.path||current?.node?.name||null):null,hely_id:mode==='place'?current?.node?.id||null:null,település:townId,beszélgetés:talk?.id||null,beszélgetőtárs:talkCharacter?.name||null,csatorna:talkCharacter?talkChannel:null,foglalt:busy||null,idő:data?.clock?.time||null,nap:data?.clock?.day??null}));
  const img=id=>id?`/media/${encodeURIComponent(id)}`:'';
  // Pictures only: a cached preview of the given width (videos and unreadable pictures are redirected to the original).
  const pic=(id,w=320)=>id?`/thumb/${encodeURIComponent(id)}?w=${w}`:'';
  const portrait=(p,cls='play-portrait')=>p.cover_id?`<img class="${cls}" src="${pic(p.cover_id)}" alt="${esc(p.name)}" loading="lazy">`:`<span class="${cls} play-mono">${esc(p.name.slice(0,1))}</span>`;
  const wrap=fn=>async(...a)=>{try{await fn(...a);}catch(e){toast(e.message,true);}};
  // Null-safe helpers (2026-11-13): an element drawn only sometimes is never assumed to exist.
  const setClass=(sel,cls)=>{const el=$(sel);if(el)el.className=cls;};
  const submitWith=(inputSel,formSel,value)=>{const input=$(inputSel),form=$(formSel);if(!input||!form)return;input.value=value;form.requestSubmit();};
  // Lasting notices (2026-11-13): problems that need an action stay on screen with a button,
  // instead of a toast that disappears (Grok unreachable, a talk that could not be saved).
  const notices=new Map();
  function paintNotices(){
    let box=document.getElementById('play-notices');
    if(!notices.size){box?.remove();return;}
    if(!box){box=document.createElement('div');box.id='play-notices';box.className='play-notices';box.setAttribute('role','status');document.body.appendChild(box);}
    box.innerHTML=[...notices].map(([k,n])=>`<div class="play-notice"><span>⚠ ${esc(n.text)}</span>${n.action?`<button type="button" class="primary" data-notice="${esc(k)}">${t('play.retry')}</button>`:''}<button type="button" class="subtle" data-notice-close="${esc(k)}" aria-label="${esc(t('common.close'))}">✕</button></div>`).join('');
    for(const b of box.querySelectorAll('[data-notice]'))b.onclick=()=>{const n=notices.get(b.dataset.notice);notices.delete(b.dataset.notice);paintNotices();n?.action?.();};
    for(const b of box.querySelectorAll('[data-notice-close]'))b.onclick=()=>{notices.delete(b.dataset.noticeClose);paintNotices();};
    placeNotices();
  }
  // Under the top bar, wherever it ends: on a phone the bar wraps to two or three rows, and a
  // fixed 84 px put the notice over its Térkép and town buttons (found by the layout self-check).
  function placeNotices(){
    const box=document.getElementById('play-notices'),bar=document.querySelector('.play-top');
    if(box&&bar)box.style.top=Math.max(8,Math.round(bar.getBoundingClientRect().bottom)+8)+'px';
    const pill=document.querySelector('.play-talk-pill');if(pill)document.querySelector('.play')?.style.setProperty('--talk-pill-space',Math.ceil(pill.getBoundingClientRect().height)+28+'px');
  }
  const showNotice=(key,text,action=null)=>{notices.set(key,{text,action});paintNotices();};
  const clearNotice=key=>{if(notices.delete(key))paintNotices();};
  // Streamed talk (2026-11-11): the reply appears in the "typing" spot while he writes it;
  // the finished view (beat, choices, scene) arrives at the end.
  // A reply already seen while streaming is not typed out a second time.
  let liveShown=false,lastBare='';
  const showLive=text=>{for(const el of document.querySelectorAll('.vn-typing')){el.textContent=text;el.classList.add('vn-live');liveShown=true;}};
  async function talkApi(body){
    liveShown=false;
    const r=await fetch('/api/play/talk',{method:'POST',headers:{'Content-Type':'application/json',...requestHeaders()},body:JSON.stringify({...body,stream:true})});
    const failed=(message,status)=>Object.assign(Error(message?translateServerMessage(message):t('common.actionFailed')),{status});
    if(!(r.headers.get('content-type')||'').includes('ndjson')){const v=await r.json().catch(()=>({}));if(!r.ok)throw failed(v.error,r.status);return v;}
    const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});let nl;
      while((nl=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,nl).trim();buffer=buffer.slice(nl+1);if(!line)continue;
        const msg=JSON.parse(line);
        if(typeof msg.reply==='string')showLive(msg.reply);else if(msg.done)result=msg.done;else if(msg.error)throw failed(msg.error,msg.status);
      }
    }
    if(!result)throw failed(null,502);
    // When the scene reaches (or leaves) undressing, swap the figure once the caller has stored the reply.
    setTimeout(()=>{const p=talkCharacter&&current?.people?.find(x=>x.id===talkCharacter.id);const bare=(p&&closeUp(p)?'close':p&&undressed(p)?'bare':'');if(bare!==lastBare){lastBare=bare;refreshStage();}},0);
    return result;
  }
  async function commands(){if(studio)return;if(!data||!document.body.classList.contains('play-mode')){data=await api('/api/play');buildIndex();}const places=data.nodes.filter(node=>node.placed!==false&&node.location_id&&!node.passage&&node.place_kind!=='vehicle');return openCommandPalette({places,people:data.people,onError:error=>toast(error.message,true),screens:phone?[]:['play','characters','location-catalogue','image-workshop'].map(id=>({id,label:t('view.'+id)})),onScreen:openScreen,onPlace:async id=>{if(!document.body.classList.contains('play-mode'))await openScreen('play');await openPlace(id,true);}});}
  // Tree helpers over the overview data, indexed once per load (the tree has ~150 places).
  let index={byId:new Map(),children:new Map(),under:new Map()};
  function buildIndex(){
    const byId=new Map(data.nodes.map(n=>[n.id,n])),children=new Map();
    for(const n of data.nodes){if(!children.has(n.parent_id))children.set(n.parent_id,[]);children.get(n.parent_id).push(n);}
    for(const list of children.values())list.sort((a,b)=>a.order-b.order);
    index={byId,children,under:new Map()};
  }
  const kids=id=>index.children.get(id)||[];
  const node=id=>index.byId.get(id);
  const under=id=>{if(!index.under.has(id)){const out=[id];for(let i=0;i<out.length;i++)for(const c of kids(out[i]))out.push(c.id);index.under.set(id,out);}return index.under.get(id);};
  const peopleIn=id=>{const locs=new Set(under(id).map(x=>node(x)?.location_id).filter(Boolean));return data.people.filter(p=>p.location_id&&locs.has(p.location_id));};
  const peopleAt=n=>n.location_id?data.people.filter(p=>p.location_id===n.location_id):[];
  const travelHints=installTravelHints({active:()=>!!root&&document.body.classList.contains('play-mode')&&!doorsEditing,describe:target=>{
    // Only where it leads and how long it takes; no list of who is there (owner, 2026-11-20,
    // "Felesleges részletezés": the long list covered half the scene).
    return target.getAttribute('title')||target.querySelector('title')?.textContent||target.getAttribute('aria-label')||'';
  }});
  // Streets and stairwells are walked through, not visited (2026-11-14): never a pin or an exit.
  // Cars are vehicles, not rooms (owner, 2026-11-14): no pin, door or search hit; a friend's car
  // is offered in the travel window instead.
  const onMap=n=>n.placed!==false&&!n.passage&&n.place_kind!=='vehicle';
  // An icon and colour tone for places without a photo, guessed only from the name.
  const ICONS=[[/kocsma|disco|bár|pub/i,'🍺','warm'],[/fürdő|mosdó|wc|zuhany|szauna|wellness/i,'🚿','cool'],[/háló|szoba|nappali|konyha|erkély/i,'🛏','warm'],[/ház|lakás|albérlet|otthon/i,'🏠','warm'],[/udvar|kert|park|erdő|tó|strand|határ|mező/i,'🌳','green'],[/kórház|orvos|ügyelet|referáló|zárt/i,'🏥','cool'],[/autó|furgon|vonat|metro|benzinkút|pihenő|parkoló/i,'🚗','grey'],[/bolt|pláza|ikea|market|kávé/i,'🛍','warm'],[/edző|terem|öltöző|stadion/i,'🏋','grey'],[/építkezés|szerelő|műhely|szálló/i,'🛠','grey'],[/rendőr|fogda|cella/i,'🚓','cool'],[/utca|street|telep/i,'🏘','grey']];
  const placeIcon=name=>{for(const [re,icon,tone] of ICONS)if(re.test(name))return {icon,tone};return {icon:'⌖',tone:'grey'};};  // Places show their short name ("Nagyszoba"); the full path is the tooltip.
  const label=n=>n?.short_name||n?.name||'';
  // Collections (Közlekedési eszközök, Átjárók) are not places on the map (2026-11-14).
  const towns=()=>data.nodes.filter(n=>!n.parent_id).filter(onMap).flatMap(r=>r.kind==='world'?kids(r.id):[r]).filter(n=>onMap(n)&&n.kind!=='collection');
  const townOf=id=>towns().find(tw=>under(tw.id).includes(id));

  // reuse: switching between the menu screens keeps the loaded world (no refetch, no flicker);
  // anything that moves time or Palor loads it again. Settings are read once, then kept current.
  let settingsLoaded=false,aiWarned=false;
  async function render(host,{reuse=false}={}){
    cancelUndoWindows();
    root=host;
    if(!reuse||!data){const [d,s]=await Promise.all([api('/api/play'),settingsLoaded?Promise.resolve(settings):api('/api/play/settings').catch(()=>settings)]);data=d;settings=s;settingsLoaded=true;buildIndex();}
    // On opening, the screen shows where Palor really is: inside a place → that place; on a
    // town's street → that town (or the map, if it was the map). A remembered view of another
    // town is not where he is.
    if(studio){synced=true;const target=studioView();mode=target.mode||'map';townId=target.townId||null;if(target.placeId){current=await api('/api/play/place/'+encodeURIComponent(target.placeId));mode='place';}townEditing=mode==='town';placeTools=doorsEditing=mode==='place';}
    if(!synced){synced=true;mode=spatialView.mode;townId=spatialView.townId;current=null;const n=node(data.node_id),tw=n?townOf(n.id):null;
      if(!n){mode='map';townId=null;}
      if(n&&['map','town'].includes(mode)){
        if(n.location_id&&!(tw&&n.id===tw.id)){try{current=await api('/api/play/place/'+encodeURIComponent(n.id));mode='place';}catch{mode=tw&&spatialView.mode==='town'?'town':'map';townId=tw?.id||null;}}
        else if(tw){if(mode==='town')townId=tw.id;}
        else{mode='map';townId=null;}
      }
      // Tailscale down (2026-11-13): Grok, ChatGPT and the phone cannot reach the program; say so
      // while playing too, not only on the status page.
      if(!phone)api('/api/system/status').then(s=>{if(s?.tailscale&&s.tailscale!=='Running')showNotice('tailscale',t('play.tailscaleDown'));}).catch(()=>{});
      // A face-to-face talk that was open before the page was reloaded continues.
      const open=data.open_conversation;
      if(open&&mode==='place'&&current&&!talkCharacter){const person=(current.people||[]).find(p=>p.id===open.character_id);
        if(person){try{const v=await api('/api/play/conversations/'+open.id);if(v&&v.status==='open'&&v.mode!=='group'&&(!v.channel||v.channel==='in_person')){talk=v;talkCharacter=person;talkChannel='in_person';conversationContext=await participantDetails(person.id).catch(()=>null);}}catch{}}}
    }
    if(!studio)document.body.classList.add('play-mode');
    const here=node(data.node_id),slot=data.clock.slot_index;let favourites=[];try{favourites=readFavouritePlaces(localStorage);}catch{}const fast=quickPlaces(data.nodes,{recent:data.recent||[],favourites,current:data.node_id});
    // Palor's car stays where he parked it; driving moves it, walking leaves it there.
    const car=(data.items||[]).find(i=>i.kind==='vehicle');
    const crumbs=[`<button class="play-crumb" data-play-mode="map" ${topHelp('play.top.map')}>${t('play.map')}</button>`];
    const town=mode==='town'?node(townId):mode==='place'&&current?townOf(current.node.id):null;
    if(town)crumbs.push(`<button class="play-crumb" data-play-town="${esc(town.id)}" ${topHelp('play.top.town',{place:label(town)})}>${esc(label(town))}</button>`);
    if(mode==='place'&&current&&current.node.id!==town?.id)crumbs.push(`<span class="play-crumb-now">${esc(label(current.node))}</span>`);
    const markup=`<div class="play play-slot-${slot}">
      <div class="play-top">
        <div class="play-clock" title="${esc(data.clock.day)}"><span class="play-slot-icon" aria-hidden="true">${SLOT_ICON[slot]}</span> <b>${esc(data.clock.weekday)} ${esc(data.clock.slot)}${data.clock.time?` · ${esc(data.clock.time)}`:''}</b></div>
        <nav class="play-crumbs">${crumbs.join('<span class="play-sep">›</span>')}</nav>
        <div class="play-top-actions">
          ${aiMeter()}
          ${here?`<button data-play-place="${esc(here.id)}" class="play-here-chip" ${topHelp('play.top.here',{place:label(here)})}>${icon('pin')} <span class="play-here-name"><span class="play-sr">${esc(t('play.youAreHere',{place:''}).trim())} </span>${esc(label(here))}</span></button>`:''}
          ${car?(car.here?`<span class="play-seg" role="group" aria-label="${esc(t('play.howTravel'))}"><button id="play-car-on" class="${drive?'primary':'subtle'}" aria-pressed="${drive}" ${topHelp('play.top.carOn')}>${icon('car')} <span class="play-lbl">${t('play.byCar')}</span></button><button id="play-car-off" class="${drive?'subtle':'primary'}" aria-pressed="${!drive}" ${topHelp('play.top.carOff')}>${icon('walk')} <span class="play-lbl">${t('play.onFoot')}</span></button></span>`
            :`<button id="play-car" class="subtle" ${topHelp('play.top.carAt',{vehicle:car.name,place:car.place||'?'})}>${icon('car')}<span class="play-sr"> ${esc(t('play.carAt',{vehicle:car.name,place:car.place||'?'}))}</span></button>`):''}
          <details class="play-menu play-wait-menu"><summary class="subtle" ${topHelp('play.top.waitMenu')}>${icon('clock')} <span class="play-lbl">${t('play.wait')}</span></summary><div class="play-menu-list">
            ${[15,60].map(m=>`<button class="subtle" data-play-wait="minutes" data-minutes="${m}" ${topHelp('play.top.waitMinutes',{minutes:m})}>${t('play.waitMinutes',{minutes:m})}</button>`).join('')}
            <button class="subtle" data-play-wait="next_slot" ${topHelp('play.top.waitSlot')}>${t('play.waitNextSlot')}</button>
            <button data-play-wait="morning" class="subtle" ${topHelp('play.sleepTitle')}>${icon('bed')} ${t('play.sleepUntilMorning')}</button></div></details>
          <details class="play-menu"><summary class="subtle" ${topHelp('play.top.menu',{unread:data.unread_messages?t('play.top.unread',{count:data.unread_messages}):t('play.top.noUnread')})}>${icon('menu')} <span class="play-lbl">${t('play.menu')}</span>${unreadBadge(data.unread_messages)}</summary><div class="play-menu-list">
            <button data-play-mode="journal" class="${mode==='journal'?'primary':'subtle'}" ${topHelp('play.top.journal')}>${icon('book')} ${t('play.journal')}</button>
            <button data-play-mode="relationships" class="${mode==='relationships'?'primary':'subtle'}" ${topHelp('play.top.relationships')}>${icon('heart')} ${t('play.relationships')}</button>
            <button data-play-mode="messages" class="${mode==='messages'?'primary':'subtle'}" ${topHelp('play.top.messages',{unread:data.unread_messages?t('play.top.unread',{count:data.unread_messages}):t('play.top.noUnread')})}>${icon('mail')} ${t('play.messagesTitle')}${unreadBadge(data.unread_messages)}</button>
            <button data-play-mode="settings" class="${mode==='settings'?'primary':'subtle'}" ${topHelp('play.top.settings')}>${icon('gear')} ${t('play.settings')}</button>
            <button id="play-tour-open" class="subtle" ${topHelp('play.top.tour')}>${icon('help')} ${t('play.tourOpen')}</button>
            <button id="play-debug-open" class="subtle" ${topHelp('play.top.debug')}>${icon('gear')} ${t('pdbg.open')}</button>
            <button id="play-full" class="subtle" ${topHelp('play.top.fullscreen')}>${icon('expand')} ${t('play.fullscreen')}</button>
            <button id="play-exit" class="subtle" ${topHelp('play.top.exit')}>${icon('close')} ${t('play.exit')}</button></div></details>
        </div>
      </div>
      <div id="play-body"></div><div id="play-talk"></div></div>`;
    // The quick-place strip (search, favourite, recent places) is gone from every screen (owner,
    // 2026-11-20, task "Felső sáv"): it only took room from the picture. The command palette
    // still opens from the keyboard.
    const existing=host.querySelector?.('.play');
    if(existing&&mode==='place'&&current&&existing.querySelector('.vn')){
      const shell=document.createElement('div');shell.innerHTML=markup;
      existing.className='play play-slot-'+slot;
      existing.querySelector('.play-top').replaceWith(shell.querySelector('.play-top'));existing.querySelector('.play-fast-places')?.remove();
    }else host.innerHTML=markup;
    for(const b of $$('.play-top [data-play-mode]'))b.onclick=wrap(async()=>{if(b.dataset.playMode==='map')return goMap();mode=b.dataset.playMode;await render(root,{reuse:true});});
    $('#play-tour-open').onclick=()=>openTour(0);
    $('#play-debug-open').onclick=()=>debugPanel.toggle(true);
    window.__luTrail?.note('view','Játék: '+mode);
    placeNotices();
    // Game clock: waiting and sleeping move time on; the world catches up while Palor waits.
    let waitPending=false;
    for(const b of $$('.play-top [data-play-wait]'))b.onclick=wrap(async()=>{
      const until=b.dataset.playWait;if(waitPending)return;waitPending=true;b.disabled=true;try{
      // Sleeping away from a home or lodging asks first (2026-11-13).
      if(until==='morning'&&!sleepable(data.node_id)&&!await confirmBox(t('play.sleepAway',{place:label(node(data.node_id))})))return;
      if(until==='morning'&&!await undoWindow(t('modal.sleep'),{key:'sleep'}))return;
      // The server first saves any open talk (an AI summary may take a few seconds).
      document.body.classList.add('play-loading');
      let r;try{r=await api('/api/play/wait',{until,...(b.dataset.minutes?{minutes:Number(b.dataset.minutes)}:{})});}finally{document.body.classList.remove('play-loading');}
      // Those talks are closed now: the screen leaves them without ending them a second time.
      if(talk||talkCharacter){talkCharacter=null;talk=null;groupTalk=false;showHistory=false;autoSceneId=null;}
      toast(t(until==='morning'?'play.slept':'play.waited',{weekday:r.clock.weekday,slot:r.clock.slot,time:r.clock.time||''}));
      // Time moved on: people moved too, so the place is read again (it was redrawn stale before).
      // Same place, same arrival: the arrival box keeps its folded/open state (2026-11-14).
      if(mode==='place'&&current?.node?.id){const was=current;current=await api('/api/play/place/'+encodeURIComponent(current.node.id));if(arrival.of===was)arrival.of=current;}
      await render(root);
      }finally{waitPending=false;b.disabled=false;}});
    for(const b of $$('.play-top [data-play-town]'))b.onclick=wrap(()=>openTown(b.dataset.playTown));
    for(const b of $$('.play-top [data-play-place]'))b.onclick=wrap(()=>openPlace(b.dataset.playPlace,false));
    if($('#play-car'))$('#play-car').onclick=wrap(async()=>{if(car.node_id)await openPlace(car.node_id,true);});
    const carPressed=()=>{$('#play-car-on')?.setAttribute('aria-pressed',String(drive));$('#play-car-off')?.setAttribute('aria-pressed',String(!drive));};
    if($('#play-car-on'))$('#play-car-on').onclick=()=>{drive=true;setClass('#play-car-on','primary');setClass('#play-car-off','subtle');carPressed();};
    if($('#play-car-off'))$('#play-car-off').onclick=()=>{drive=false;setClass('#play-car-on','subtle');setClass('#play-car-off','primary');carPressed();};
    // Remember the screen across reloads (per browser; harmless if storage is blocked).
    rememberSpatialView();
    $('#play-full').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>{});};
    $('#play-exit').onclick=wrap(async()=>{if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});document.body.classList.remove('play-mode');await exit();});
    // Leaving the town view ends pin arranging (2026-11-14).
    if(mode!=='town')townEditing=false;
    if(mode==='place'&&current)await showPlace(current);
    else if(mode==='town'&&townId)await renderTown();
    else if(mode==='messages')await renderMessages();
    else if(mode==='journal')await renderJournal();
    else if(mode==='relationships')await renderRelationships();
    else if(mode==='settings')await renderSettings();
    else renderMap();
    renderTalk();
    bindKeys();
    // First visit: a short guided tour (once per browser; reopen it from the menu).
    let seen=true;try{seen=localStorage.getItem('lu-play-tour-v1')==='done';}catch{}
    if(!studio&&!seen&&!document.querySelector('.play-tour'))openTour(0);
  }
  // Today's AI spending against the daily cap; a warning notice once it passes 90 %.
  function aiMeter(){
    const a=data?.ai;if(!a||!(a.cap>0))return '';const pct=Math.min(100,Math.round(a.spent/a.cap*100));
    if(pct>=90&&!aiWarned){aiWarned=true;setTimeout(()=>showNotice('ai',t('play.aiAlmostOut',{pct})),0);}
    const help=topHelp('play.top.aiCache',{spent:a.spent.toFixed(2),cap:a.cap.toFixed(2),pct,cached:a.cached_percent===null||a.cached_percent===undefined?t('play.cacheUnknown'):a.cached_percent+'%'});
    return `<span class="play-ai${pct>=80?' play-ai-warn':''}" ${help}><small>${t('play.top.aiLabel')}</small><meter min="0" max="100" low="80" high="90" optimum="0" value="${pct}" ${help} aria-valuetext="${esc(t('play.top.ai',{spent:a.spent.toFixed(2),cap:a.cap.toFixed(2),pct}))}">${pct}%</meter></span>`;
  }
  // Guided tour: five short steps about the screens and controls.
  function openTour(step){
    document.querySelector('.play-tour')?.remove();
    const steps=[1,2,3,4,5],done=()=>{try{localStorage.setItem('lu-play-tour-v1','done');}catch{}box.remove();};
    const box=document.createElement('div');box.className='play-tour ps-overlay';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    const draw=()=>{box.innerHTML=`<div class="ps-card play-tour-card"><header class="ps-head">${icon('help')}<b>${esc(t('play.tour.'+steps[step]+'.title'))}</b><small>${step+1}/${steps.length}</small></header>
      <div class="ps-body"><p class="ps-text">${esc(t('play.tour.'+steps[step]+'.text'))}</p></div>
      <div class="ps-end"><button type="button" class="subtle" data-tour="skip">${t('play.tourSkip')}</button><span class="play-top-actions">${step?`<button type="button" class="subtle" data-tour="back">${t('play.tourBack')}</button>`:''}<button type="button" class="primary" data-tour="next">${step<steps.length-1?t('play.continue'):t('play.tourDone')}</button></span></div></div>`;
      box.querySelector('[data-tour="next"]').focus();
      for(const b of box.querySelectorAll('[data-tour]'))b.onclick=()=>{const a=b.dataset.tour;if(a==='skip'||a==='next'&&step===steps.length-1)return done();step+=a==='next'?1:-1;draw();};};
    document.body.appendChild(box);draw();
    box.addEventListener('keydown',e=>{if(e.key==='Escape')done();});
  }

  // Search any place by name or path (accents ignored).
  const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  function bindSearch(){
    const input=$('#play-search');if(!input)return;
    input.oninput=()=>{const q=fold(input.value.trim());const box=$('#play-search-results');
      if(q.length<2){box.innerHTML='';return;}
      // Short name, full name, path, the characters linked to the place and who is there now.
      const text=n=>fold([n.short_name,n.name,n.path,...(n.linked||[]),...data.people.filter(p=>p.location_id&&p.location_id===n.location_id).map(p=>p.name)].join(' '));
      const hits=data.nodes.filter(n=>onMap(n)&&n.kind!=='collection'&&n.kind!=='world'&&text(n).includes(q))
        .sort((a,b)=>Number(!fold(label(a)).includes(q))-Number(!fold(label(b)).includes(q))).slice(0,12);
      box.innerHTML=hits.map(n=>`<button data-search-hit="${esc(n.id)}" title="${esc(n.path||n.name)}">${esc(label(n))}<small> · ${esc((n.path||'').split(' › ').slice(0,-1).join(' › '))}</small></button>`).join('')||`<small class="muted">${t('play.noHits')}</small>`;
      for(const b of $$('[data-search-hit]'))b.onclick=wrap(()=>openPlace(b.dataset.searchHit,true));};
  }
  // Remember spatial display preferences only. Menu screens are transient, including
  // when reopening this same UI instance (not just when reloading the browser).
  function rememberSpatialView(){
    if(studio)return;
    if(!['map','town','place'].includes(mode))return;
    spatialView={mode:mode==='place'?'map':mode,townId};
    try{localStorage.setItem('lu-play-view',JSON.stringify(spatialView));}catch{}
  }
  try{const saved=JSON.parse(localStorage.getItem('lu-play-view')||'null');if(saved&&['map','town'].includes(saved.mode)){spatialView={mode:saved.mode,townId:typeof saved.townId==='string'?saved.townId:null};mode=spatialView.mode;townId=spatialView.townId;}}catch{}

  // Keyboard: M map, N journal, K relationships, T phone, ? help, Esc closes history/talk.
  let keysBound=false;
  function bindKeys(){
    if(studio)return;if(keysBound)return;keysBound=true;
    // New messages while playing: a quiet toast, checked once a minute.
    setInterval(async()=>{if(!document.body.classList.contains('play-mode')||!data)return;try{const r=await api('/api/play/unread');
      // A new message: a toast once, and the menu button's badge shows the count and pulses.
      if(r.unread_messages>data.unread_messages){toast(t('play.newMessage',{count:r.unread_messages}));const s=document.querySelector('.play-menu:not(.play-wait-menu)>summary');
        if(s){s.classList.remove('play-pulse');void s.offsetWidth;s.classList.add('play-pulse');}}
      paintUnread(r.unread_messages);
      data.unread_messages=r.unread_messages;}catch{}},60_000);
    window.addEventListener('resize',()=>{if(photoMode)placeBubbles();fitStage();if(mode==='place')paintDoors();placeNotices();fitMaps();});
    document.addEventListener('fullscreenchange',()=>setTimeout(fitMaps,60));
    // The top-bar menu closes when anything outside it is clicked.
    document.addEventListener('click',e=>{for(const menu of document.querySelectorAll('.play-menu[open]:not([data-keep-open])'))if(!menu.contains(e.target))menu.open=false;},{capture:true});
    document.addEventListener('keydown',e=>{
      if(document.body.classList.contains('play-mode')&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!document.querySelector('dialog[open]'))void commands();return;}
      if(!document.body.classList.contains('play-mode')||e.ctrlKey||e.metaKey||e.altKey)return;
      // A story or road pop-up owns the keyboard while it is open.
      if(document.querySelector('.ps-overlay,.play-album,.play-tour,.play-group-picker,.play-person-card,.vn-zoom,.travel-options-dialog,.play-trip-choice'))return;
      if(e.key==='Escape'){if(showHistory){showHistory=false;renderTalk();}else if(talkCharacter&&!talkMinimized){talkMinimized=true;photoMode=false;photoSmall=false;$('.vn')?.classList.remove('vn-photo-mode','vn-photo-small');$('.vn-photo')?.remove();renderTalk();refreshStage();}return;}
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||''))return;
      if(e.key==='?'){const old=$('.play-help');if(old)return old.remove();const h=document.createElement('div');h.className='play-help';h.innerHTML=`<h3>${t('play.helpTitle')}</h3><p>${t('play.helpKeys')}</p>`;h.onclick=()=>h.remove();document.body.appendChild(h);return;}
      // Number keys (2026-11-13): in a place 1–9 take the exits and G starts the group talk;
      // in a talk 1–3 pick the suggested replies.
      if(mode==='place'&&!talkCharacter){
        if(/^[1-9]$/.test(e.key)){const ex=$$('#vn-doors [data-door]')[Number(e.key)-1];if(ex){e.preventDefault();ex.click();return;}}
        if(e.key.toLowerCase()==='g'&&$('#vn-group-start')){e.preventDefault();$('#vn-group-start')?.click();return;}
      }
      if(talkCharacter&&!busy&&/^[1-3]$/.test(e.key)){const q=$$('[data-quick]')[Number(e.key)-1];if(q){e.preventDefault();q.click();return;}}
      const go={m:'map',n:'journal',k:'relationships',t:'messages'}[e.key.toLowerCase()];
      if(go==='map')goMap().catch(err=>toast(err.message,true));
      // Same as the menu buttons: switching screens keeps the loaded world (2026-11-14).
      else if(go){mode=go;render(root,{reuse:true}).catch(err=>toast(err.message,true));}
    });
  }

  // ---- journal: the story so far, decisions, save points --------------------------------
  let journalFilter='';
  // The picture the media director chose for an event: intimate ones start blurred and open
  // on click; videos play muted in a loop. Small controls: another picture / fits / does not fit.
  function journalMedia(e){
    const m=e.media,src=img(m.media_id),cls=`jr-media jr-fit-${m.fit}${m.blur?' jr-blurred':''}`;
    const body=m.kind==='video'?`<video src="${src}" muted loop playsinline preload="metadata"${m.blur?'':' autoplay'}></video>`:`<img src="${src}" alt="${esc(e.title)}" loading="lazy">`;
    return `<figure class="${cls}" data-media="${esc(m.media_id)}" title="${esc(m.reasons.join(' · '))}">${body}${m.blur?`<button class="jr-reveal" data-reveal>${t('play.mediaReveal')}</button>`:''}<figcaption class="jr-media-tools"><button class="subtle" data-media-next title="${esc(t('play.mediaNext'))}">↻</button><button class="subtle" data-media-verdict="1" title="${esc(t('play.mediaFits'))}">👍</button><button class="subtle" data-media-verdict="-1" title="${esc(t('play.mediaNotFits'))}">👎</button></figcaption></figure>`;
  }
  function bindJournalMedia(){
    for(const f of $$('.jr-media')){
      const card=f.closest('[data-event]'),eventId=card.dataset.event;
      f.querySelector('[data-reveal]')?.addEventListener('click',ev=>{ev.stopPropagation();f.classList.remove('jr-blurred');ev.currentTarget.remove();f.querySelector('video')?.play().catch(()=>{});});
      const replace=wrap(async body=>{const {media}=await api('/api/play/journal/'+encodeURIComponent(eventId)+'/media',body);
        if(body.verdict===1){toast(t('play.mediaThanks'));return;}
        if(!media){f.remove();card.classList.remove('jr-has-media');toast(t('play.mediaNone'));return;}
        const e={id:eventId,title:card.querySelector('b')?.textContent||'',media};f.outerHTML=journalMedia(e);card.classList.add('jr-has-media');bindJournalMedia();});
      f.querySelector('[data-media-next]').onclick=()=>replace({});
      for(const b of f.querySelectorAll('[data-media-verdict]'))b.onclick=()=>replace({verdict:Number(b.dataset.mediaVerdict)});
      // Click on a revealed picture opens it full size.
      f.querySelector('img,video').onclick=()=>{if(!f.classList.contains('jr-blurred'))window.open(img(f.dataset.media),'_blank','noopener');};
    }
  }
  // Journal (2026-11-13): days fold (the newest three open), ten days at a time, the pop-up
  // stories Palor lived through are listed on their day; proposed events are the creator's job
  // and are only pointed to (Élő világ page).
  let journalDays=10;
  async function renderJournal(){
    const [{events},{points,last_rewind:last},{runs}]=await Promise.all([api('/api/play/journal'),api('/api/play/save-points'),api('/api/play/story-runs').catch(()=>({runs:[]}))]);
    const people=[...new Set(events.flatMap(e=>e.characters))].sort((a,b)=>a.localeCompare(b,'hu'));
    const shown=journalFilter?events.filter(e=>e.characters.includes(journalFilter)):events;
    const proposedCount=shown.filter(e=>e.status==='proposed').length,story=shown.filter(e=>e.status!=='proposed');
    const byDay=new Map();for(const e of story){if(!byDay.has(e.world_day))byDay.set(e.world_day,[]);byDay.get(e.world_day).push(e);}
    const runsByDay=new Map();if(!journalFilter)for(const r of runs){const d=r.world_day||String(r.finished_at).slice(0,10);if(!runsByDay.has(d))runsByDay.set(d,[]);runsByDay.get(d).push(r);if(!byDay.has(d))byDay.set(d,[]);}
    const days=[...byDay].sort((a,b)=>b[0].localeCompare(a[0])),visible=days.slice(0,journalDays);
    const ev=e=>`<article class="jr-event jr-${e.kind}${e.with_palor?' jr-palor':''}${e.media?' jr-has-media':''}" data-event="${esc(e.id)}">${e.media?journalMedia(e):''}<div class="jr-text"><div class="jr-head"><b>${esc(e.title)}</b><small>${esc(e.slot||'')} · ${esc(e.characters.join(', '))}</small></div><p>${esc(e.summary)}</p></div></article>`;
    $('#play-body').innerHTML=`<div class="jr">
      <section class="jr-main">
        ${last?`<div class="jr-rewound">${t('play.rewoundNote',{label:last.label||last.target_time})} <button id="jr-undo" class="subtle">${t('play.undoRewind')}</button></div>`:''}
        ${proposedCount?`<p class="jr-proposed-note">📝 ${t('play.proposedElsewhere',{count:proposedCount})}</p>`:''}
        <h2>${t('play.storySoFar')}</h2><label class="jr-filter">${t('play.filterBy')} <select id="jr-filter"><option value="">${t('play.everyone')}</option>${people.map(n=>`<option${n===journalFilter?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
        ${visible.length?visible.map(([day,list],i)=>`<details class="jr-day-box"${i<3?' open':''}><summary class="jr-day">${esc(day)} <small class="jr-recap">${t('play.dayRecap',{events:list.length,palor:list.filter(e=>e.with_palor).length,serious:list.filter(e=>e.kind==='serious').length})}</small></summary>
          ${list.map(ev).join('')}${(runsByDay.get(day)||[]).map(r=>`<p class="jr-story">🛣 ${esc(t('play.storyRunLine',{title:r.title,end:t(r.ending_kind==='skipped'?'play.storySkipped':'play.storyEnd.'+r.ending_kind)}))}</p>`).join('')}</details>`).join('')
          +(days.length>visible.length?`<button class="subtle" id="jr-more">${t('play.olderDays',{count:days.length-visible.length})}</button>`:''):`<p class="muted">${t('we.nothing')}</p>`}
      </section>
      <aside class="jr-side"><h2>${t('play.savePoints')}</h2>
        ${points.length?points.map((p,i)=>`<div class="jr-point"><div><b>${esc(p.label)}</b><small>${esc(new Date(p.time).toLocaleString('hu-HU'))}</small></div>${i?`<button class="subtle" data-rewind="${esc(p.time)}" data-label="${esc(p.label)}">${t('play.rewindHere')}</button>`:`<small class="muted">${t('play.now')}</small>`}</div>`).join(''):`<p class="muted">${t('play.noSavePoints')}</p>`}
      </aside></div>`;
    $('#jr-filter').onchange=wrap(async e=>{journalFilter=e.target.value;journalDays=10;await renderJournal();});
    if($('#jr-more'))$('#jr-more').onclick=wrap(async()=>{journalDays+=10;await renderJournal();});
    for(const b of $$('[data-rewind]'))b.onclick=wrap(async()=>{if(!await confirmBox(t('play.rewindConfirm',{label:b.dataset.label})))return;const r=await api('/api/play/rewind',{time:b.dataset.rewind,label:b.dataset.label});toast(t('play.rewound',{events:r.events,memories:r.memories,levels:r.levels}));talkCharacter=null;talk=null;await render(root);});
    if($('#jr-undo'))$('#jr-undo').onclick=wrap(async()=>{await api('/api/play/rewind/undo',{});toast(t('play.rewindUndone'));await render(root);});
    bindJournalMedia();
  }

  // One relationship in depth: history both ways, talks, his memories of Palor, friends,
  // appointments; Palor's own feeling can be set; Palor can invite him somewhere.
  async function renderRelDetail(cid,person,labels){
    const box=$('#rel-detail-'+cid);if(box.innerHTML){box.innerHTML='';return;}
    const d=await api('/api/play/relationship/'+cid);
    // Invitation place in two steps: first the town, then its places (2026-11-13).
    const places=data.nodes.filter(n=>n.location_id&&n.placed!==false);
    const inviteTowns=towns().filter(tw=>places.some(n=>under(tw.id).includes(n.id)));
    box.innerHTML=`<div class="rel-more">
      <label>${t('play.palorFeels')} <select id="rf-${cid}">${person.palor_level===null||person.palor_level===undefined?`<option value="" selected disabled>${esc(t('we.noLevel'))}</option>`:''}${Object.entries(labels).sort((a,b)=>a[0]-b[0]).map(([k,l])=>`<option value="${k}"${String(person.palor_level)===k?' selected':''}>${esc(l)}</option>`).join('')}</select></label>
      ${person.can_talk?`<div class="rel-invite"><b>${t('play.invite')}</b> <select id="ri-town-${cid}" aria-label="${esc(t('play.inviteTown'))}">${inviteTowns.map(tw=>`<option value="${esc(tw.id)}">${esc(label(tw))}</option>`).join('')}</select><select id="ri-place-${cid}" aria-label="${esc(t('play.invitePlace'))}"></select><select id="ri-slot-${cid}" aria-label="${esc(t('play.inviteSlot'))}">${['reggel','délután','este','éjszaka'].map((s,i)=>`<option value="${i}">${s}</option>`).join('')}</select><button class="subtle" id="ri-go-${cid}">${t('play.inviteSend')}</button></div>`:''}
      ${d.appointments.length?`<p><b>${t('play.appointments')}</b> ${d.appointments.map(a=>`${esc(a.world_day)} ${esc(a.slot)} – ${esc(a.place)} (${t('play.appt.'+a.status)})`).join(' · ')}</p>`:''}
      ${d.threads?.length?`<p><b>${t('play.threads')}</b> ${d.threads.map(x=>`${t('play.thread.'+x.promised_by)}: ${esc(x.text)}${x.due_day?' ('+esc(x.due_day)+')':''} – ${t('play.thread.'+x.status)}`).join(' · ')}</p>`:''}
      ${d.friends.length?`<p><b>${t('play.friends')}</b> ${d.friends.map(f=>`${esc(f.name)} (${esc(f.label)})`).join(', ')}</p>`:''}
      ${d.memories.length?`<details><summary>${t('play.hisMemories',{count:d.memories.length})}</summary>${d.memories.map(m=>`<p class="muted">– ${esc(m)}</p>`).join('')}</details>`:''}
      ${d.talks.length?`<details><summary>${t('play.talks',{count:d.talks.length})}</summary>${d.talks.map(x=>`<p><small>${esc(x.world_day)} ${x.channel==='phone'?'✆':''}${x.intimate?' ♥':''}</small> <b>${esc(x.title)}</b> ${esc(x.summary)}</p>`).join('')}</details>`:''}
      ${d.history.length?`<details><summary>${t('play.levelHistory')}</summary>${d.history.map(h=>`<p class="muted"><small>${esc(new Date(h.created_at).toLocaleDateString('hu-HU'))}</small> ${h.direction==='palor'?'Palor → '+esc(person.name):esc(person.name)+' → Palor'}: ${esc(h.label)} – ${esc(h.reason)}</p>`).join('')}</details>`:''}</div>`;
    const fillPlaces=()=>{const sel=$('#ri-place-'+cid),tw=$('#ri-town-'+cid)?.value;if(!sel||!tw)return;const set=new Set(under(tw));
      sel.innerHTML=places.filter(n=>set.has(n.id)).sort((a,b)=>(a.path||label(a)).localeCompare(b.path||label(b),'hu')).map(n=>`<option value="${esc(n.id)}">${esc(label(n))}${n.parent_id&&n.parent_id!==tw&&node(n.parent_id)?` · ${esc(label(node(n.parent_id)))}`:''}</option>`).join('');};
    if($('#ri-town-'+cid)){const mine=townOf(data.node_id)?.id;if(mine&&inviteTowns.some(x=>x.id===mine))$('#ri-town-'+cid).value=mine;$('#ri-town-'+cid).onchange=fillPlaces;fillPlaces();}
    $('#rf-'+cid).onchange=wrap(async e=>{await api('/api/world-engine/levels',{source_id:data.palor_id,target_id:cid,level:Number(e.target.value)});toast(t('play.saved'));});
    if($('#ri-go-'+cid))$('#ri-go-'+cid).onclick=wrap(async()=>{const r=await api('/api/play/invite',{character_id:cid,node_id:$('#ri-place-'+cid).value,slot_index:Number($('#ri-slot-'+cid).value)});toast(r.status==='accepted'?t('play.inviteYes',{name:person.name,place:r.place,day:r.day,slot:r.slot}):t('play.inviteNo.'+r.reason,{name:person.name}),r.status!=='accepted');box.innerHTML='';await renderRelDetail(cid,person,labels);});
  }

  // ---- settings: dialogue text speed and play options (the adult switch was removed 2026-11-22) --------------------------------
  async function renderSettings(){
    settings=await api('/api/play/settings');
    $('#play-body').innerHTML=`<div class="rel play-settings"><h2>${t('play.settings')}</h2>
      <label class="play-check"><input type="checkbox" id="ps-auto-scene"${settings.auto_scene!==false?' checked':''}> ${t('play.autoScene')}</label>
      <label class="play-check"><input type="checkbox" id="ps-quick-send"${settings.quick_send?' checked':''}> ${t('play.quickSendSetting')}</label>
      <label class="play-check"><input type="checkbox" id="ps-travel-ask"${settings.travel_always_ask?' checked':''}> ${t('play.travelAlwaysAsk')}</label>
      <label>${t('play.guestProvider')}<select id="ps-guest-provider">${['openai','sogni'].map(value=>`<option value="${value}"${(settings.guest_image_provider||'openai')===value?' selected':''}>${t('play.guestProvider.'+value)}</option>`).join('')}</select></label>
      <label>${t('play.textSpeed')} <select id="ps-speed">${['slow','normal','fast','instant'].map(s=>`<option value="${s}"${settings.text_speed===s?' selected':''}>${t('play.speed.'+s)}</option>`).join('')}</select></label>
      <section class="ps-stories" id="ps-stories"></section></div>`;
    $('#ps-auto-scene').onchange=wrap(async e=>{settings=await api('/api/play/settings',{auto_scene:e.target.checked});toast(t('play.saved'));});
    $('#ps-quick-send').onchange=wrap(async e=>{settings=await api('/api/play/settings',{quick_send:e.target.checked});toast(t('play.saved'));});
    $('#ps-travel-ask').onchange=wrap(async e=>{settings=await api('/api/play/settings',{travel_always_ask:e.target.checked});toast(t('play.saved'));});
    $('#ps-guest-provider').onchange=wrap(async e=>{settings=await api('/api/play/settings',{guest_image_provider:e.target.value});toast(t('play.saved'));});
    $('#ps-speed').onchange=wrap(async e=>{settings=await api('/api/play/settings',{text_speed:e.target.value});toast(t('play.saved'));});
    await renderStories();
  }
  // Pop-up stories: how often they come, loading a pasted or saved batch (checked first), the list.
  const SETTING_ICON={road:'🛣',kaloz:'🌾',szekesfehervar:'🏰',budapest:'🌉'};
  let storiesOpen=false;
  async function renderStories(preview=null,text=''){
    const box=$('#ps-stories');if(!box)return;
    const lib=await api('/api/play/stories');
    const bySetting=s=>lib.stories.filter(x=>x.setting===s);
    // Settings show only what a player chooses (owner, 2026-11-21): how often stories come. Loading
    // stories and the story list are authoring tools, folded away; no per-story statistics.
    box.innerHTML=`<h3>${t('play.storiesTitle')}</h3>
      <label>${t('play.storyRate')} <select id="ps-story-rate">${['off','rare','normal','often'].map(r=>`<option value="${r}"${lib.rate===r?' selected':''}>${t('play.storyRate.'+r)}</option>`).join('')}</select></label>
      <details class="ps-manage"${preview||text||storiesOpen?' open':''}><summary>${t('play.storyManage',{count:lib.stories.length})}</summary>
      <details class="ps-import"${preview||text?' open':''}><summary>${t('play.storyImport')}</summary>
        <textarea id="ps-story-text" rows="8" spellcheck="false" placeholder='[{"id":"…","title":"…","setting":"road",…}]'>${esc(text)}</textarea>
        <div class="play-top-actions"><label class="play-upload">${t('play.storyFile')}<input type="file" accept=".json,application/json,text/plain" id="ps-story-file" hidden></label>
          <button class="subtle" id="ps-story-check">${t('play.storyCheck')}</button>
          ${preview?.results.some(r=>['new','replace','exists'].includes(r.status))?`<label class="play-check"><input type="checkbox" id="ps-story-replace"> ${t('play.storyReplace')}</label><button class="primary" id="ps-story-save">${t('play.storySave',{count:preview.results.filter(r=>['new','replace'].includes(r.status)).length})}</button>`:''}</div>
        ${preview?`<ul class="ps-check">${preview.results.map(r=>`<li class="ps-check-${r.status}"><b>${esc(r.title||r.id)}</b> <small>${esc(SETTING_ICON[r.setting]||'')} ${esc(r.id)} · ${r.blocks} ${t('play.storyBlocks')}</small> — ${esc(t('play.storyStatus.'+r.status))}${r.errors.length?`<ul>${r.errors.slice(0,6).map(e=>`<li>${esc(e)}</li>`).join('')}${r.errors.length>6?`<li>… +${r.errors.length-6}</li>`:''}</ul>`:''}</li>`).join('')}</ul>`:''}
      </details>
      ${['road','kaloz','szekesfehervar','budapest'].map(s=>`<h4>${SETTING_ICON[s]} ${t('play.storySetting.'+s)} <small class="muted">${bySetting(s).length}</small></h4>${bySetting(s).length?`<div class="ps-list">${bySetting(s).map(x=>`<div class="ps-row${x.enabled?'':' ps-off'}"><span><b>${esc(x.title)}</b>${x.summary?`<small>${esc(x.summary)}</small>`:''}</span><span class="play-top-actions"><button class="subtle" data-story-play="${esc(x.id)}">▶ ${t('play.storyTry')}</button><button class="subtle" data-story-toggle="${esc(x.id)}" data-on="${x.enabled?'0':'1'}">${t(x.enabled?'play.storyOff':'play.storyOn')}</button></span></div>`).join('')}</div>`:`<p class="muted">${t('play.storyNone')}</p>`}`).join('')}</details>`;
    // Re-rendering after a toggle or a try keeps the section open.
    box.querySelector('.ps-manage').ontoggle=e=>{storiesOpen=e.target.open;};
    $('#ps-story-rate').onchange=wrap(async e=>{settings=await api('/api/play/settings',{story_rate:e.target.value});toast(t('play.saved'));});
    const current=()=>$('#ps-story-text').value;
    $('#ps-story-file').onchange=wrap(async e=>{const f=e.target.files[0];if(!f)return;if(f.size>3*1024*1024)throw Error(t('play.tooLarge'));const txt=await f.text();await renderStories(await api('/api/play/stories/import',{text:txt,dry_run:true}),txt);});
    $('#ps-story-check').onclick=wrap(async()=>{const txt=current();await renderStories(await api('/api/play/stories/import',{text:txt,dry_run:true}),txt);});
    if($('#ps-story-save'))$('#ps-story-save').onclick=wrap(async()=>{const txt=current(),r=await api('/api/play/stories/import',{text:txt,replace:!!$('#ps-story-replace')?.checked});toast(t('play.storySaved',{count:r.saved}));await renderStories(r.saved?null:r,r.saved?'':txt);});
    for(const b of $$('[data-story-toggle]'))b.onclick=wrap(async()=>{await api('/api/play/stories/'+b.dataset.storyToggle,{enabled:b.dataset.on==='1'});await renderStories();});
    for(const b of $$('[data-story-play]'))b.onclick=wrap(async()=>{const r=await api('/api/play/stories/'+b.dataset.storyPlay+'/play',{});await playStory({run_id:r.run_id,story:r.story,api,esc,t,toast});await renderStories();});
  }

  // ---- album: moments seen together; intimate ones stay blurred until tapped ------------------
  async function openAlbum(person){
    const a=await api('/api/play/album/'+person.id);document.querySelector('.play-album')?.remove();
    const box=document.createElement('div');box.className='play-album';box.setAttribute('role','dialog');box.setAttribute('aria-label',t('play.albumOf',{name:person.name}));
    const lockedCount=Object.values(a.locked).reduce((x,y)=>x+y,0);
    box.innerHTML=`<div class="play-album-inner"><header><b>${esc(t('play.albumOf',{name:person.name}))}</b><span class="muted">${t('play.albumCount',{seen:a.unlocked.length,total:a.total})}</span><button type="button" class="subtle" data-album-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header>
      ${a.unlocked.length?`<div class="play-album-grid">${a.unlocked.map(m=>`<button type="button" class="play-album-item${m.blur?' rel-blur':''}" data-album-item>${m.kind==='video'?`<video src="${img(m.media_id)}" muted loop playsinline preload="metadata"></video><span class="play-album-video">▶</span>`:`<img src="${pic(m.media_id,640)}" alt="" loading="lazy">`}</button>`).join('')}</div>`:`<p class="muted">${t('play.albumEmpty')}</p>`}
      ${lockedCount?`<p class="play-album-locked">🔒 ${t('play.albumLocked',{count:lockedCount})}${a.locked.sexual_activity?' · 🔞 '+a.locked.sexual_activity:''}${a.locked.nudity?' · 🔥 '+a.locked.nudity:''}${a.locked.non_intimate?' · ☀ '+a.locked.non_intimate:''}</p>`:''}${a.hidden_by_stage?`<p class="muted">${t('play.albumStage',{count:a.hidden_by_stage})}</p>`:''}</div>`;
    document.body.appendChild(box);
    const close=()=>{box.remove();document.removeEventListener('keydown',esc_);};const esc_=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',esc_);
    box.onclick=e=>{if(e.target===box||e.target.closest('[data-album-close]'))close();};
    for(const el of box.querySelectorAll('[data-album-item]'))el.onclick=()=>{if(el.classList.contains('rel-blur')){el.classList.remove('rel-blur');return;}const v=el.querySelector('video');if(v){v.paused?v.play().catch(()=>{}):v.pause();}else el.classList.toggle('play-album-big');};
    box.querySelector('[data-album-close]').focus();
  }
  // ---- relationships ------------------------------------------------------------------------
  // Relationships (2026-11-13): a filter, and the shared photos of a card load only when the card
  // scrolls into view (before: one request per person on every opening).
  let relFilter='all';
  async function renderRelationships(){
    const {people:all_,labels}=await api('/api/play/relationships');
    const known=p=>(p.their_level??-9)>=1||(p.palor_level??-9)>=1;
    const people=all_.filter(p=>relFilter==='all'||relFilter==='known'&&known(p)||relFilter==='strangers'&&!known(p)||relFilter==='talk'&&p.can_talk);
    const bar=level=>level===null?`<span class="rel-bar rel-none">${t('we.noLevel')}</span>`:`<span class="rel-bar"><span class="rel-fill rel-l${level}"></span><em>${esc(labels[level])}</em></span>`;
    $('#play-body').innerHTML=`<div class="rel"><h2>${t('play.relationships')}</h2>
      <label class="jr-filter">${t('play.filterBy')} <select id="rel-filter">${['all','known','strangers','talk'].map(f=>`<option value="${f}"${relFilter===f?' selected':''}>${t('play.relFilter.'+f)}</option>`).join('')}</select></label>
      <div class="rel-grid">${people.map(p=>`<article class="rel-card">${portrait(p,'rel-photo')}
      <div class="rel-body"><b>${esc(p.name)}</b>
        <div class="rel-row"><small>${t('play.theirSide')}</small>${bar(p.their_level)}</div>
        <div class="rel-row"><small>${t('play.palorSide')}</small>${bar(p.palor_level)}</div>
        ${p.last_talk?`<p class="rel-last"><small>${t('play.lastTalk')}</small> ${esc(p.last_talk.summary||p.last_talk.title||'')}</p>`:''}
        ${p.can_talk?`<div class="rel-shared" data-shared-for="${esc(p.id)}"></div>`:''}
        <div class="rel-actions"><button class="subtle" data-rel-detail="${esc(p.id)}">☰ ${t('play.details')}</button>${p.can_talk?`<button class="subtle" data-rel-album="${esc(p.id)}">🖼 ${t('play.album')}</button><button class="subtle" data-rel-phone="${esc(p.id)}">✆ ${t('play.message')}</button>`:''}</div><div class="rel-detail" id="rel-detail-${esc(p.id)}"></div></div></article>`).join('')||`<p class="muted">—</p>`}</div></div>`;
    $('#rel-filter').onchange=wrap(async e=>{relFilter=e.target.value;await renderRelationships();});
    const fill=async el=>{const photos=(await api('/api/play/shared-photos/'+el.dataset.sharedFor).catch(()=>({photos:[]}))).photos;if(!photos.length||!el.isConnected)return;
      el.innerHTML=`<small>${t('play.sharedPhotos',{count:photos.length})}</small><div class="rel-thumbs">${photos.slice(0,5).map(s=>`<img src="${pic(s.media_id)}" alt="" loading="lazy" class="${s.intimate?'rel-blur':''}" title="${esc(s.description||'')}">`).join('')}</div>`;};
    const io='IntersectionObserver' in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){io.unobserve(e.target);fill(e.target);}},{rootMargin:'200px'}):null;
    for(const el of $$('[data-shared-for]'))io?io.observe(el):fill(el);
    for(const b of $$('[data-rel-detail]'))b.onclick=wrap(()=>renderRelDetail(b.dataset.relDetail,people.find(x=>x.id===b.dataset.relDetail),labels));
    for(const b of $$('[data-rel-album]'))b.onclick=wrap(()=>openAlbum(people.find(x=>x.id===b.dataset.relAlbum)));
    for(const b of $$('[data-rel-phone]'))b.onclick=wrap(async()=>{const p=people.find(x=>x.id===b.dataset.relPhone);phoneWith=p.id;phoneExtra={id:p.id,name:p.name,cover_id:p.cover_id,can_talk:true,last_at:new Date().toISOString(),unread:0};phoneTalk=null;mode='messages';await render(root);});
  }

  // Maps fit the window (2026-11-13, owner: the town map was too small, the world map too big):
  // as large as the space under the top bar and the map bar allows, never larger, keeping the
  // picture's proportions; works the same in full screen. On a phone the world map keeps its
  // wide, sideways-panning drawing.
  function fitMaps(){
    for(const box of $$('.map-fit')){
      const svg=box.querySelector('svg');if(!svg)continue;
      if(box.classList.contains('lu-map-wrap')&&innerWidth<=760){box.style.width='';box.style.height='';continue;}
      const vb=svg.viewBox?.baseVal,aspect=vb?.width&&vb?.height?vb.width/vb.height:1.5;
      const holder=box.parentElement,cs=getComputedStyle(holder);
      const availW=holder.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      const bar=document.querySelector('.play-top'),head=holder.querySelector(':scope > .map-bar');
      const top=Math.max(0,box.getBoundingClientRect().top+window.scrollY);
      const availH=Math.max(180,innerHeight-top-16-parseFloat(cs.paddingBottom||0));
      // Use the screen (owner, 2026-11-14): a desktop shows the whole map as large as it fits;
      // a tablet fills the width and scrolls the rest.
      const w=Math.max(160,Math.min(availW,availH*aspect));
      box.style.width=Math.round(w)+'px';box.style.height=Math.round(w/aspect)+'px';
    }
  }

  // ---- level 1: world map --------------------------------------------------------------
  function renderMap(){
    mode='map';
    const tops=towns(),palorTown=townOf(data.node_id)?.id;
    // Illustrated geographic map for real places; other groups (categories) as cards below.
    const svg=mapSvg({towns:tops,label,peopleIn,placeCount:id=>kids(id).filter(onMap).length,palorTownId:palorTown,slot:data.clock.slot_index,
      avatar:p=>p.cover_id?pic(p.cover_id):'',esc,ariaLabel:t('play.map')});
    // The whole play area is the map (owner, 2026-11-14): no bar above it. Search hides behind a
    // small 🔍 button on the map; list view, recent places, the "other places" categories, the
    // explanation and the picture tools are gone (tools: Alkotói stúdió › Helyszínek).
    $('#play-body').innerHTML=`<div class="play-visual lu-map-wrap map-fit map-full play-sky-${data.clock.slot_index}">${svg}${searchFloat()}</div>`;
    fitMaps();bindSearchFloat();
    // The countryside around Káloz (lake, forest, mountain) opens its own map.
    for(const g of $$('.lu-map [data-play-region]')){g.onclick=wrap(()=>{const r=data.nodes.find(n=>n.region);if(r)openTown(r.id);});g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.onclick();}};}
    // Hovering a town shows how long the trip takes from here.
    const townPins=$$('.lu-map [data-play-town]');etaFor(townPins.map(g=>g.dataset.playTown)).then(eta=>{for(const g of townPins){const m=eta[g.dataset.playTown];if(!Number.isFinite(m)||!m)continue;let ti=g.querySelector(':scope > title');if(!ti){ti=document.createElementNS('http://www.w3.org/2000/svg','title');g.prepend(ti);ti.textContent=g.getAttribute('aria-label')||'';}ti.textContent+=' · '+t('play.minutesShort',{minutes:m});}}).catch(()=>{});
    // On narrow screens the map pans sideways: open it centred on Palor's town.
    const mapBox=$('.lu-map-wrap'),focus=Number($('.lu-map')?.dataset.focus);
    if(mapBox&&mapBox.scrollWidth>mapBox.clientWidth&&Number.isFinite(focus))mapBox.scrollLeft=Math.max(0,focus*mapBox.scrollWidth-mapBox.clientWidth/2);
    for(const g of $$('[data-play-town]')){g.onclick=wrap(()=>openTown(g.dataset.playTown));
      // SVG pins are role="button": Enter and Space must open them too (keyboard users).
      if(g.tagName.toLowerCase()==='g')g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.onclick();}};}
  }
  // Place search, hidden behind a small button on the map (owner, 2026-11-14: needed rarely).
  const searchFloat=()=>`<div class="map-search-float"><button type="button" class="map-search-btn" id="map-search-btn" aria-expanded="false" title="${esc(t('play.searchPlace'))}" aria-label="${esc(t('play.searchPlace'))}">🔍</button><div class="play-tools map-search" id="map-search-box" hidden><input id="play-search" type="search" placeholder="${esc(t('play.searchPlace'))}" aria-label="${esc(t('play.searchPlace'))}"><div id="play-search-results" class="play-children"></div></div></div>`;
  function bindSearchFloat(){const btn=$('#map-search-btn'),box=$('#map-search-box');if(!btn||!box)return;
    btn.onclick=()=>{box.hidden=!box.hidden;btn.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden)$('#play-search')?.focus();};bindSearch();}
  // ---- where Palor is (2026-11-13) --------------------------------------------------------
  // The screen follows reality: looking at a town's places means standing on its street (the
  // town's own node); the world map means standing on the street of the last town. Choosing
  // another town is a trip along the road between the two, with its travel time, the road
  // moment and perhaps a story on the way.
  const carHere=()=>(data?.items||[]).find(i=>i.kind==='vehicle'&&i.here);
  // Between two towns a small window asks how Palor travels (owner, 2026-11-14): bicycle, car or,
  // where a direct line runs, train, each with its travel time. Resolves the choice or null.
  let travelPreference=null;
  try{const saved=JSON.parse(localStorage.getItem('lu-travel-preference-v1'));if(typeof saved?.choice==='string'&&saved.choice.length<1000&&Array.isArray(saved.options)&&saved.options.length<=16&&saved.options.every(key=>typeof key==='string'&&key.length<1000))travelPreference=saved;}catch{}
  async function chooseTravel(nodeId,{force=false}={}){
    const here=data?.node_id?townOf(data.node_id):null,there=townOf(nodeId);
    if(!here||!there||here.id===there.id)return {};
    const {options}=await api('/api/play/travel-options?'+new URLSearchParams({to:nodeId}));if(!options?.length)return {};
    const automatic=preferredTravel(options,travelPreference,{alwaysAsk:settings.travel_always_ask,force});
    const selected=automatic||await travelOptionsDialog({options,from:label(here),to:label(there),esc});if(!selected)return null;
    travelPreference=rememberedTravel(selected,options);try{localStorage.setItem('lu-travel-preference-v1',JSON.stringify(travelPreference));}catch{}
    return {...travelPayload(selected),automatic:!!automatic};
  }
  // The trip's small state delta (C1, 2026-11-14) is merged into the loaded overview, so the next
  // render reuses it instead of fetching /api/play again. False (= full reload) when the delta is
  // missing or the cast changed. peopleIn/peopleAt read data.people directly (no cache to clear).
  function mergeState(s){
    if(!data||!s||typeof s.node_id!=='string'||!s.clock||!Array.isArray(s.people)||!Array.isArray(s.items))return false;
    const at=new Map(s.people.map(p=>[p.id,p.location_id||null]));
    if(at.size!==data.people.length||data.people.some(p=>!at.has(p.id))||!node(s.node_id))return false;
    // The studio changed the tree since the last overview: reload it (2026-11-14).
    if(s.tree_version!==data.tree_version)return false;
    data.people=data.people.map(p=>({...p,location_id:at.get(p.id)}));
    Object.assign(data,{node_id:s.node_id,clock:s.clock,ai:s.ai||null,items:s.items,unread_messages:s.unread_messages||0,open_conversation:s.open_conversation||null,previous_id:s.previous_id||null,recent:s.recent||[]});
    return true;
  }
  let travelling=false;
  async function travelTo(nodeId){
    if(travelling)return null;travelling=true;
    try{
    townNote=null;
    let selected=await chooseTravel(nodeId);if(selected===null)return null;
    if(selected.automatic){const decision=await tripChoiceNotice({place:label(node(nodeId)),mode:selected.mode,esc});if(decision===null)return null;if(decision==='change'){selected=await chooseTravel(nodeId,{force:true});if(selected===null)return null;}}
    const {automatic,...choice}=selected;
    document.body.classList.add('play-loading');
    // "Úton ide: …" appears if the trip takes more than a moment, so a click never seems ignored.
    const going=document.createElement('div');going.className='play-going';going.setAttribute('role','status');going.textContent=t('play.going',{place:label(node(nodeId))});
    const show=setTimeout(()=>document.body.appendChild(going),180);
    let result;try{const car=carHere();result=await api('/api/play/travel',{node_id:nodeId,...(choice.mode?choice:drive&&car?{vehicle_id:car.id}:{})});}finally{clearTimeout(show);going.remove();document.body.classList.remove('play-loading');}
    if(talkCharacter&&talkChannel!=='phone'&&!(result?.people||[]).some(p=>p.id===talkCharacter.id))leaveTalk();
    // The overview's position follows the trip (debug panel, "here" marks) until the next reload.
    // The server may set him down elsewhere: the living room of a home, the shore of the lake.
    if(data&&result){if(mergeState(result.state))result.merged=true;else data.node_id=result.node?.id||nodeId;}
    // A story on the way can take minutes of game time: the merged snapshot is stale then (2026-11-14).
    if(await afterTrip(result?.trip)&&result)result.merged=false;
    return result;
    }finally{travelling=false;}
  }
  // The road moment between towns (or the street and stairwell walked through), then a story if
  // one came up, before the destination shows.
  // True when a story was played (time went on meanwhile).
  async function afterTrip(trip){
    if(!trip)return false;let story=false;
    if(trip.road)await roadTransition({from:trip.road.from_town,to:trip.road.to_town,minutes:trip.minutes,vehicle:trip.vehicle||trip.ride_with?.vehicle||null,mode:trip.mode,line:trip.line,esc,t});
    else if(trip.via?.length)await passageMoment(trip.via,trip.encounter?.kind==='event'?trip.encounter.text:null);
    // Real pictures on the way between towns (owner, 2026-11-14): one after another, the road
    // happening with the last one.
    if(trip.road&&trip.scenes?.length)for(let i=0;i<trip.scenes.length;i++){const last=i===trip.scenes.length-1;
      await passageMoment([trip.scenes[i]],last&&trip.encounter?.kind==='event'?trip.encounter.text:null,1200,i>0);}
    if(trip.ride_with?.parted)toast(t('play.rideParted',{name:trip.ride_with.name}));
    // Someone by the road (car trip, no story): stop or drive on; stopping starts a road story.
    if(trip.roadside&&!trip.story&&await roadsideChoice({text:trip.roadside.text,esc,t})){
      try{const r=await api('/api/play/roadside',{token:trip.roadside.token});
        if(r?.story){story=true;await playStory({run_id:r.story.run_id,story:r.story.story,api,esc,t,toast});}else toast(t('play.roadsideGone'));}
      catch(e){toast(e.message,true);}
    }
    if(trip.story){story=true;await playStory({run_id:trip.story.run_id,story:trip.story.story,api,esc,t,toast});}
    return story;
  }
  // A short look at the street or stairwell on the way (about a second, a click skips it).
  // cut: the next trip picture replaces the last one without a fade (2026-11-14).
  function passageMoment(via,text,ms=1100,cut=false){
    const shown=via.filter(v=>v.image_id);if(!shown.length&&!text)return Promise.resolve();
    return new Promise(resolve=>{
      const el=document.createElement('div');el.className='ps-overlay ps-passage'+(cut?' ps-cut':'');el.setAttribute('role','status');
      const v=shown.at(-1)||via.at(-1);
      el.innerHTML=`${v.image_id?`<img src="${pic(v.image_id,1600)}" alt="">`:''}<div class="ps-passage-card"><b>${esc(via.map(x=>x.name).join(' → '))}</b>${text?`<p>${esc(text)}</p>`:''}</div>`;
      // The skipping key must not also press the next overlay's focused button (2026-11-14).
      document.body.appendChild(el);let gone=false,timer;const close=e=>{if(gone)return;gone=true;clearTimeout(timer);if(e?.type==='keydown')e.preventDefault();document.removeEventListener('keydown',close);setTimeout(()=>{resolve();setTimeout(()=>el.remove(),0);},0);};
      el.onclick=close;document.addEventListener('keydown',close,{once:true});
      const ready=async()=>{const image=el.querySelector('img');if(image){el.classList.add('ps-passage-loading');const loaded=await decodedImage(image);if(gone)return;if(!loaded)image.remove();el.classList.remove('ps-passage-loading');}if(!gone){el.classList.add('ps-passage-ready');timer=setTimeout(close,text?2600:ms);}};
      void ready();
    });
  }
  // Travel times from Palor's place (server: same rule as the trip itself), by car when he drives.
  async function etaFor(ids){
    ids=[...new Set(ids.filter(Boolean))];if(!ids.length)return {};
    const car=carHere();return (await api('/api/play/eta?'+new URLSearchParams({to:ids.map(encodeURIComponent).join(','),vehicle:drive&&car?'1':'0'}))).minutes||{};
  }
  // The next places' backdrops are fetched in advance, so stepping through a door feels instant.
  const warmExits=memoizedRead(async id=>{
    const n=node(id);if(n?.image_id){const image=new Image();image.src=pic(n.image_id,1600);void decodedImage(image);}
    const place=await api('/api/play/place/'+encodeURIComponent(id));
    await Promise.all((place.people||[]).map(async person=>{const sprite=spriteFor(person);if(sprite)await cutout('/api/sprites/'+sprite.id+(sprite.updated_at?'?v='+encodeURIComponent(sprite.updated_at):''));else if(person.stand_in?.media_id){const image=new Image();image.src=pic(person.stand_in.media_id,1600);await decodedImage(image);}}));
  },{ttl:30000,max:12});
  function preloadExits(ids){for(const id of [...new Set(ids)].slice(0,6))void warmExits(id).catch(()=>{});}
  // Only a real town has a street; a grouping layer ("Egyéb helyek") is not a place to stand in.
  const isStreet=n=>!!n&&(!n.kind||n.kind==='place');
  // Where sleeping fits: a home (or a room of one), lodging, a dormitory, a tent.
  const sleepable=id=>{for(let n=node(id);n;n=n.parent_id?node(n.parent_id):null){if(n.place_kind==='home'||/szálló|szállás|motel|hotel|kollégium|\bkoli|sátor|háló/i.test(n.short_name||n.name||''))return true;}return false;};
  async function goMap(){
    const street=data?.node_id?townOf(data.node_id):null;
    const r=isStreet(street)&&data.node_id!==street.id?await travelTo(street.id):null;
    mode='map';await render(root,{reuse:!!r?.merged});
  }
  // ---- level 2: town view ---------------------------------------------------------------
  let townNote=null;
  async function openTown(id,{move=true}={}){
    if(studio)move=false;
    // Someone met on the way stays mentioned on the town view until the next step.
    let merged=false;
    if(move&&data?.node_id!==id&&isStreet(node(id))){const r=await travelTo(id);if(!r)return;merged=!!r.merged;const met=r?.trip?.encounter;townNote=met?.kind==='person'?met.text:null;}
    if(id!==townId)townEditing=false;
    // Already standing there: nothing changed, keep the loaded world (2026-11-14).
    townId=id;mode='town';await render(root,{reuse:merged||data?.node_id===id});
  }
  // The town as a street map with pictogram pins; the card view is gone and pin arrangement sits
  // behind a small ⋯ menu (owner, 2026-11-14). While arranging, Mentés/Alaphelyzet/Mégse sit
  // inline in the bar so no open list covers the map.
  let townEditing=false;
  const townLayout=memoizedRead(id=>api('/api/play/town-layout/'+encodeURIComponent(id)));
  async function renderTown(){
    if(studio)townEditing=true;
    const tw=node(townId);if(!tw){mode='map';return renderMap();}
    const extra=await townLayout(tw.id).catch(()=>({positions:{},image:null}));
    // A region map (Káloz határa) shows its places at every depth: lake, car park, forest,
    // mountain (not the lake shore, which is the lake's way in).
    const deep=id=>kids(id).filter(onMap).flatMap(c=>[...(c.origin?[]:[c]),...deep(c.id)]);
    const places=tw.region?deep(tw.id):kids(tw.id).filter(onMap),isArea=n=>!tw.region&&!n.origin_id&&kids(n.id).some(c=>kids(c.id).length);
    const pins=places.map(n=>{const ps=peopleIn(n.id);return {id:n.id,name:label(n),kind:isArea(n)?'area':n.place_kind||'place',count:ps.length,people:ps.map(p=>p.name),avatars:ps.filter(p=>p.cover_id).slice(0,1).map(p=>pic(p.cover_id)),rooms:kids(n.id).filter(onMap).length,here:under(n.id).includes(data.node_id)};});
    let saved={...(extra.positions||{})};
    // The countryside without a painted map: pins where the drawn lake, forest and mountain are.
    if(tw.region&&!extra.image){const SPOT=[[/^tó$/i,[0.72,0.56]],[/parkoló/i,[0.6,0.4]],[/^erdő$/i,[0.4,0.6]],[/mountain|hegy$/i,[0.24,0.2]],[/kiránduló/i,[0.14,0.38]]];
      for(const p of pins){const s=SPOT.find(([re])=>re.test(p.name));if(s&&!saved[p.id])saved[p.id]=[Math.round(s[1][0]*1200),Math.round(s[1][1]*720)];}}
    const draw=()=>townMapSvg({town:tw,pins,saved,image:extra.image,height:extra.height||720,slot:data.clock.slot_index,esc,ariaLabel:label(tw),editing:townEditing});
    const here=peopleIn(tw.id);
    // Play: only the top bar stays above the map (owner, 2026-11-20, "Pici térkép"). The way out of
    // the town sits on the map's top-left corner and the map takes all the remaining room; search,
    // the "who is where" list, studio editing and the badge explanation are gone. The studio keeps
    // its arranging bar.
    const leave=`<button class="map-back tm-corner" id="tm-back" title="${esc(t('play.backToMapTitle'))}">${icon('map')} ${tw.region?esc(label(townOf(tw.id))||t('play.backToMap')):t('play.backToMap')}</button>`;
    const studioBar=studio?`<div class="map-bar"><h2 class="map-title">${esc(label(tw))}</h2>
        ${townEditing?`<span class="map-lead muted">${t('play.townEditLead')}</span>`:''}
      ${townEditing?`<span class="play-top-actions tm-edit-actions"><button class="primary" id="tm-save">${t('play.townSave')}</button><button class="subtle" id="tm-reset">${t('play.townReset')}</button><button class="subtle" id="tm-cancel">${t('common.cancel')}</button></span>`:`<span class="play-top-actions"><details class="play-menu tm-tools"><summary class="subtle" title="${esc(t('play.townTools'))}" aria-label="${esc(t('play.townTools'))}">⋯</summary><div class="play-menu-list"><button class="subtle" id="tm-edit" title="${esc(t('play.townEditTitle'))}">✥ ${t('play.townEdit')}</button></div></details></span>`}</div>`:'';
    $('#play-body').innerHTML=`<div class="play-town-view tm-view${studio?'':' tm-full'} play-sky-${data.clock.slot_index}">${studioBar}
      <div class="tm-wrap map-fit">${draw()}${studio?'':leave}${townNote&&!studio?`<span class="tm-encounter tm-corner-note">🤝 ${esc(townNote)}</span>`:''}<div class="tm-pop" id="tm-pop" hidden></div></div>
      ${places.length?'':`<p class="muted">${t('play.empty')}</p>`}</div>`;
    fitMaps();
    // From the countryside the way back leads to the village, not straight to the world map.
    if($('#tm-back'))$('#tm-back').onclick=wrap(tw.region?()=>openTown(townOf(tw.id)?.id||tw.parent_id):goMap);
    for(const b of $$('#play-body .play-intown [data-play-place]'))b.onclick=wrap(()=>openPlace(b.dataset.playPlace,true));
    bindSearchFloat();
    $('#tm-edit')?.addEventListener('click',()=>{townEditing=true;renderTown();});
    $('#tm-cancel')?.addEventListener('click',()=>{townEditing=false;renderTown();});
    $('#tm-reset')?.addEventListener('click',wrap(async()=>{await api('/api/play/town-layout/'+encodeURIComponent(tw.id),{positions:{}});townLayout.invalidate(tw.id);townEditing=false;await renderTown();}));
    const svg=$('.tm-map'),pop=$('#tm-pop');
    // Hover shows who is inside (in the pin's title) and how long the walk or drive takes.
    etaFor(pins.map(p=>p.id)).then(eta=>{for(const g of $$('[data-town-pin]')){const m=eta[g.dataset.townPin],ti=g.querySelector('title');if(ti&&Number.isFinite(m))ti.textContent+=' · '+t('play.minutesShort',{minutes:m});}}).catch(()=>{});
    if(townEditing){
      // Drag a pin; the arrangement is saved only with "Mentés".
      let drag=null;
      svg.addEventListener('pointerdown',e=>{const g=e.target.closest('[data-town-pin]');if(!g)return;drag=g;g.setPointerCapture?.(e.pointerId);e.preventDefault();});
      svg.addEventListener('pointermove',e=>{if(!drag)return;const [x,y]=toMap(svg,e);drag.setAttribute('transform',`translate(${x},${y})`);saved[drag.dataset.townPin]=[x,y];});
      svg.addEventListener('pointerup',()=>{drag=null;});
      if($('#tm-save'))$('#tm-save').onclick=wrap(async()=>{for(const g of $$('[data-town-pin]')){const m=/translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform'));if(m)saved[g.dataset.townPin]=[Math.round(+m[1]),Math.round(+m[2])];}
        await api('/api/play/town-layout/'+encodeURIComponent(tw.id),{positions:saved});townLayout.invalidate(tw.id);townEditing=false;toast(t('play.townSaved'));await renderTown();});
      return;
    }
    // A building with rooms opens a small list next to its pin; a single place opens at once.
    const open=g=>{const n=node(g.dataset.townPin);if(!n)return;const sub=kids(n.id).filter(onMap);
      // Káloz határa opens its own map; a home or the lake is entered at its entry room.
      if(n.region){pop.hidden=true;return openTown(n.id);}
      // A place with its own screen (Cigánytelep) opens at once; its inner places are reached from
      // there through its ways out. Only a grouping without its own screen asks with a list.
      if(!sub.length||n.origin_id||tw.region||n.location_id){pop.hidden=true;return openPlace(n.id,true);}
      const row=(x,depth=0)=>{const c=peopleIn(x.id).length,inner=kids(x.id).filter(onMap);return `<button class="tm-pop-row tm-depth-${depth}" data-play-place="${esc(x.id)}" ${!x.location_id&&inner.length?'disabled':''}><span>${esc(KIND_ICON[x.place_kind]||placeIcon(x.name).icon)} ${esc(label(x))}</span>${c?`<b>${c}</b>`:''}</button>`+(depth<1?inner.map(y=>row(y,depth+1)).join(''):'');};
      pop.innerHTML=`<header><b>${esc(label(n))}</b><button type="button" class="subtle" id="tm-pop-close" aria-label="${esc(t('common.close'))}">✕</button></header>${n.location_id?`<button class="tm-pop-row" data-play-place="${esc(n.id)}"><span>${esc(t('play.areaItself',{name:label(n)}))}</span>${peopleAt(n).length?`<b>${peopleAt(n).length}</b>`:''}</button>`:''}${sub.map(x=>row(x,0)).join('')}`;
      const wrapBox=$('.tm-wrap');if(!wrapBox)return;const box=wrapBox.getBoundingClientRect(),r=g.getBoundingClientRect();
      pop.style.left=Math.min(box.width-280,Math.max(8,r.left-box.left+r.width/2-130))+'px';pop.hidden=false;
      // Below the pin in the upper half of the map, above it in the lower half.
      const below=r.bottom-box.top<box.height*0.55;pop.style.top=(below?Math.max(8,r.bottom-box.top+6):Math.max(8,r.top-box.top-pop.offsetHeight-6))+'px';
      for(const b of pop.querySelectorAll('[data-play-place]:not([disabled])'))b.onclick=wrap(()=>openPlace(b.dataset.playPlace,true));
      $('#tm-pop-close').onclick=()=>{pop.hidden=true;};
    };
    for(const g of $$('[data-town-pin]')){g.onclick=wrap(()=>open(g));g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(g);}};}
  }
  // ---- level 3: place scene ---------------------------------------------------------------
  async function openPlace(nodeId,move=true){
    if(studio)move=false;
    const n=node(nodeId);
    // A town (no real location) is not a room: show its places instead.
    // A home with a living room is entered there (the server sets him down in it).
    if(n&&!n.location_id&&kids(n.id).length&&!n.origin_id)return openTown(n.id);
    // Palor left: a face-to-face talk with someone who is not at the new place ends (and is
    // saved, in travelTo). A phone call goes with him.
    // While the place loads, its outline is shown instead of the old screen (2026-11-13).
    const body=$('#play-body');if(move&&body)body.setAttribute('aria-busy','true');
    let merged=false;
    if(move){let r;try{r=await travelTo(nodeId);}finally{body?.removeAttribute('aria-busy');}if(!r){mode==='place'&&current?showPlace(current):await render(root,{reuse:true});return;}current=r;merged=!!r.merged;}
    else{document.body.classList.add('play-loading');try{current=await api('/api/play/place/'+encodeURIComponent(nodeId));}finally{document.body.classList.remove('play-loading');}}
    mode='place';return render(root,{reuse:merged});
  }
  // Visual-novel scene: background photo, figures standing on it, dialogue box below.
  const moodBy=new Map();
  // The shirtless set ("felmeztelen" subfolder) shows only when the scene with him has reached
  // undressing (an intimate scene, or an undress/sex/after beat); otherwise the dressed figures.
  const UNDRESSED_BEATS=new Set(['undress','sex','after']);
  const undressed=person=>{if(!talk||talk.status!=='open'||talk.character?.id!==person.id)return false;const beat=[...(talk.lines||[])].reverse().find(l=>l.speaker==='character')?.beat;return talk.mode==='intimate'||UNDRESSED_BEATS.has(beat);};
  // The waist-up set ("intim" subfolder) takes over for the sex and after beats; it is drawn
  // faded out below the waist (vn-fade), so nothing explicit ever shows.
  const CLOSE_BEATS=new Set(['sex','after']);
  const closeUp=person=>{if(!talk||talk.status!=='open'||talk.character?.id!==person.id)return false;const beat=[...(talk.lines||[])].reverse().find(l=>l.speaker==='character')?.beat;return CLOSE_BEATS.has(beat);};
  const spriteFor=person=>{
    const pick=s=>s.find(x=>x.expression===moodBy.get(person.id))||s.find(x=>x.expression==='alap')||s[0]||null;
    const bare=person.sprites_shirtless||[],close=person.sprites_intimate||[];
    return (closeUp(person)&&close.length?pick(close):null)||(undressed(person)&&bare.length?pick(bare):null)||pick(person.sprites||[]);
  };
  function figure(person){
    const s=spriteFor(person);
    // In a group talk the one who spoke last steps forward; people outside the talk are dimmed.
    const speaking=groupTalk?[...(talk?.lines||[])].reverse().find(l=>l.speaker==='character')?.speaker_id||null:talkCharacter?.id;
    const inTalk=groupTalk?(talk?.participants||[]).some(x=>x.id===person.id)||speaking===person.id:talkCharacter?.id===person.id;
    return `<button class="vn-figure${talkCharacter&&!talkMinimized&&talkChannel==='in_person'?(speaking===person.id?' vn-speaking':inTalk?'':' vn-dim'):''}" data-play-talk="${esc(person.id)}" data-inspect-person="${esc(person.id)}" title="${esc(person.name+(person.activity?' — '+person.activity:''))}" aria-label="${esc(t('play.inspectPerson',{name:person.name})+' — '+(person.activity||''))}">`
      +(s?`<img class="vn-sprite${s.outfit==='intimate'?' vn-fade':''}" data-sprite="${esc(s.id)}" data-v="${esc(s.updated_at||'')}" data-height="${esc(person.height_cm||'')}" alt="${esc(person.name)}">`:person.stand_in?standIn(person):`<span class="vn-card">${portrait(person,'vn-card-photo')}</span>`)
      +`<span class="vn-name">${esc(person.name)}</span></button>`;
  }
  // Photo figure for someone without a drawn figure: his own everyday picture, cropped to
  // where he stands in it (when known) and faded at the edges so it sits in the scene.
  function standIn(person){
    return `<span class="vn-standin" data-standin="${esc(person.id)}"><img src="${pic(person.stand_in.media_id,1600)}" alt="${esc(person.name)}" loading="lazy"></span>`;
  }
  // Crop by scaling the picture so his region fills the box (CSSOM: the CSP forbids inline
  // style attributes). Without a known region the whole picture is used.
  function paintStandIns(people){
    for(const el of $$('[data-standin]')){
      const s=people.find(p=>p.id===el.dataset.standin)?.stand_in,im=el.querySelector('img');if(!s||!im)continue;const r=s.region;
      const ratio=r&&s.width&&s.height?(r.width*s.width)/(r.height*s.height):s.width&&s.height?s.width/s.height:0.6;
      el.style.aspectRatio=Math.max(0.35,Math.min(1.2,ratio)).toFixed(3);
      if(r&&r.width>0&&r.height>0)Object.assign(im.style,{width:(100/r.width).toFixed(2)+'%',height:(100/r.height).toFixed(2)+'%',left:(-100*r.x/r.width).toFixed(2)+'%',top:(-100*r.y/r.height).toFixed(2)+'%'});
      else Object.assign(im.style,{width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover'});
    }
  }
  // Figures are trimmed to the man himself (sprite-cutout) and stand as tall as his recorded
  // height: 200 cm fills 96 % of the stage; unknown counts as 178 cm. The waist-up intimate
  // figure keeps its own size.
  const FIGURE_CM=178;
  async function paintFigures(){if(studio)return;paintStandIns(current?.people||[]);fitStage();const prepared=await Promise.all($$('[data-sprite]').map(async el=>{
    if(!el.classList.contains('vn-fade')){const cm=Math.min(210,Math.max(155,Number(el.dataset.height)||FIGURE_CM));el.style.height=(cm/200*96).toFixed(1)+'%';}
    const src=await cutout('/api/sprites/'+el.dataset.sprite+(el.dataset.v?'?v='+encodeURIComponent(el.dataset.v):''));
    if(el.getAttribute('src')!==src){const image=new Image();image.src=src;await decodedImage(image);}return {el,src};
  }));for(const {el,src} of prepared)if(el.isConnected){el.onload=fitStage;if(el.getAttribute('src')!==src)el.src=src;}fitStage();}
  // Shrinks all figures together when they do not fit beside each other (CSS var --fit).
  function fitStage(){
    const stage=$('.vn-stage');if(!stage)return;const figs=[...stage.querySelectorAll('.vn-figure')];if(!figs.length)return;
    // Measured at full size (reading the boxes forces the layout), then shrunk in one step.
    stage.style.setProperty('--fit','1');
    // The gaps (a % of the stage) do not shrink with the figures: only the figures' share scales.
    const cs=getComputedStyle(stage),avail=stage.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    const widths=figs.reduce((s,f)=>s+f.offsetWidth,0),span=figs.at(-1).getBoundingClientRect().right-figs[0].getBoundingClientRect().left,gaps=Math.max(0,span-widths);
    stage.style.setProperty('--fit',span>avail&&widths>0?Math.max(0.4,(avail-gaps)/widths*0.98).toFixed(3):'1');
  }
  async function showPlace(p){
    if(studio){placeTools=true;doorsEditing=true;}
    // No usable backdrop: a calm placeholder in the colours of the place's kind, with its icon.
    const kind=p.node.place_kind||'place';
    const html=`<div class="vn vn-sky-${data.clock.slot_index}"><div class="vn-bg vn-bg-empty vn-tone-${esc(kind)}" aria-hidden="true"><span>${KIND_ICON[kind]||'⌖'}</span></div><div class="vn-shade play-shade"></div>
      <div class="vn-info"><div class="vn-title-row"><h2 class="vn-title" tabindex="0">${esc(label(p.node))}</h2>
        ${studio?`<button type="button" class="vn-place-tools-btn" id="vn-place-tools" aria-expanded="${placeTools}" title="${esc(t('play.toolsTitle'))}">${placeTools?'✕':'⋯'} ${t('play.tools')}</button>`:''}</div>
        ${p.node.kind_label?`<p class="vn-kind">${esc(p.node.kind_label)}${p.town&&p.town!==label(p.node)?` · ${esc(p.town)}`:''}</p>`:''}
        ${p.branches?.length?`<div class="play-children"><small>${t('play.branches')}</small>${p.branches.map(b=>`<button data-play-place="${esc(b.id)}">${esc(b.short_name)} · ${esc(b.town)}</button>`).join('')}</div>`:''}
        ${itemsRow()}
        <div class="vn-place-tools"${studio&&placeTools?'':' hidden'}>
          <div class="play-items"><button data-item-add="item" class="subtle">${t('play.addItem')}</button>${(data?.items||[]).some(i=>i.kind==='vehicle')?'':`<button data-item-add="vehicle" class="subtle">${t('play.addVehicle')}</button>`}</div>
          ${p.node.location_id?`<div class="play-upload-row">${phone?'':`<button type="button" class="play-upload" id="play-generate-background">${t('play.makeBackground')}</button>`}<button type="button" class="play-upload" id="play-bg-prompt">📋 ${t('play.bgPrompt')}</button>${phone?'':`<label class="play-upload">${t('play.uploadBackground')}<input type="file" accept="image/png,image/jpeg" id="play-upload" hidden></label>`}${!p.image_id||p.image_busy?`<small>${t('play.noBackground')}</small>`:''}</div>`:''}
          <span class="play-top-actions"><button type="button" class="subtle" id="vn-notes">${t('play.notes')}</button>${doorsEditing?`<button type="button" class="primary" id="vn-doors-save">${t('play.doorsSave')}</button><button type="button" class="subtle" id="vn-doors-reset">${t('play.doorsReset')}</button><button type="button" class="subtle" id="vn-doors-cancel">${t('common.cancel')}</button>`:`<button type="button" class="subtle" id="vn-doors-edit">🚪 ${t('play.doorsEdit')}</button>`}</span></div></div>
      <div class="vn-doors" id="vn-doors"></div>
      <div class="vn-stage">${p.people.map(figure).join('')}</div>
      <div class="vn-dialog vn-establish" id="vn-dialog"></div></div>`;
    if(!await updateScene($('#play-body'),html,{placeId:p.node.id,imageUrl:pic(p.image_id,1600),busy:p.image_busy}))return;
    // A missing or unreadable picture never leaves a broken icon in the scene.
    for(const im of $$('.vn img:not(.vn-bg)'))im.onerror=()=>im.remove();
    paintFigures();
    for(const b of $$('#play-body [data-play-place]'))b.onclick=wrap(()=>openPlace(b.dataset.playPlace,true));
    // Free fallback: an image saved from the Grok app (or any own picture) for this place.
    if($('#play-generate-background'))$('#play-generate-background').onclick=wrap(()=>openAssetGeneration({kind:'background',targetId:p.node.location_id,time:data.clock.slot_index===3?'ejjel':data.clock.slot_index===2?'este':'nappal',api,requestHeaders,onSaved:()=>openPlace(p.node.id,false)}));
    if($('#play-bg-prompt'))$('#play-bg-prompt').onclick=wrap(async()=>{const r=await api('/api/play/prompts?'+new URLSearchParams({location_id:p.node.location_id}));await navigator.clipboard.writeText(r.background.base+'\n\n'+r.background.evening+'\n\n'+r.background.night+'\n\nMentés: '+r.background.save_as);toast(t('play.promptCopied'));});
    if($('#play-upload'))$('#play-upload').onchange=wrap(async e=>{
      const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error(t('play.tooLarge'));
      const progress=uploadProgress(e.target);e.target.disabled=true;try{await uploadImage({url:'/api/backgrounds/upload',file,fields:{location_id:p.node.location_id},headers:requestHeaders(),onProgress:progress.update});toast(t('play.uploaded'));await openPlace(p.node.id,false);}finally{progress.close();e.target.disabled=false;e.target.value='';}
    });
    for(const b of $$('[data-play-talk]'))b.onclick=()=>inspectPerson(p.people.find(x=>x.id===b.dataset.playTalk));
    // Door markers: drawn once the backdrop's size is known (and again on resize).
    // Doors appear once the background picture has its size, at their final spot (no jump).
    const bgImg=$('.vn > img.vn-bg-current');if(bgImg&&!bgImg.hidden&&!bgImg.complete){bgImg.addEventListener('load',paintDoors,{once:true});bgImg.addEventListener('error',()=>paintDoors(true),{once:true});}else paintDoors();
    if($('#vn-notes'))$('#vn-notes').onclick=wrap(()=>openNotes(p));
    if($('#vn-doors-edit'))$('#vn-doors-edit').onclick=()=>{doorsEditing=true;placeTools=true;showPlace(current);};
    if($('#vn-doors-cancel'))$('#vn-doors-cancel').onclick=()=>{doorsEditing=false;showPlace(current);};
    if($('#vn-doors-save'))$('#vn-doors-save').onclick=wrap(async()=>{await saveDoors();doorsEditing=false;showPlace(current);});
    if($('#vn-doors-reset'))$('#vn-doors-reset').onclick=wrap(async()=>{const r=await api('/api/play/room-exits/'+encodeURIComponent(current.node.id),{exits:{},replace:true});current.room_exits=r.saved;doorsEditing=false;showPlace(current);});
    if($('#vn-place-tools'))$('#vn-place-tools').onclick=()=>{placeTools=!placeTools;$('.vn-place-tools').hidden=!placeTools;$('#vn-place-tools').setAttribute('aria-expanded',String(placeTools));$('#vn-place-tools').textContent=(placeTools?'✕ ':'⋯ ')+t('play.tools');};
    // Touch screens: a tap on the title shows the small place details (hover elsewhere).
    $('.vn-title').onclick=()=>$('.vn-info').classList.toggle('vn-show-kind');
    for(const b of $$('[data-item-add]'))b.onclick=wrap(async()=>{const name=await askText(t(b.dataset.itemAdd==='vehicle'?'play.vehicleName':'play.itemName'));if(!name?.trim())return;await api('/api/play/items',{name,kind:b.dataset.itemAdd});await render(root);});
    for(const b of $$('[data-item-take],[data-item-drop]'))b.onclick=wrap(async()=>{if(b.disabled)return;b.disabled=true;try{if(b.dataset.itemDrop&&!await undoWindow(t('modal.putDown'),{key:'drop:'+b.dataset.itemDrop}))return;await api('/api/play/items/'+(b.dataset.itemTake||b.dataset.itemDrop),{action:b.dataset.itemTake?'take':'drop'});await render(root);}finally{b.disabled=false;}});
    renderTalk();
  }
  // The owner's corrections for a character (2026-11-15): written during play, they apply at once
  // to the character's next replies (server: play_director_notes) and can be withdrawn here.
  async function openNotes(p){
    const who=new Map();if(talkCharacter?.id)who.set(talkCharacter.id,talkCharacter.name);for(const x of p.people||[])who.set(x.id,x.name);
    if(!who.size){toast(t('play.notesNobody'));return;}
    $('.play-notes')?.remove();
    const box=document.createElement('div');box.className='play-album play-notes';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    let cid=talkCharacter?.id&&who.has(talkCharacter.id)?talkCharacter.id:[...who.keys()][0];
    const close=()=>{box.remove();document.removeEventListener('keydown',onKey);};
    const onKey=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',onKey);
    const draw=async()=>{
      const {notes}=await api('/api/play/notes/'+encodeURIComponent(cid));
      box.setAttribute('aria-label',t('play.notesTitle',{name:who.get(cid)}));
      box.innerHTML=`<div class="play-album-inner"><header><b>${esc(t('play.notesTitle',{name:who.get(cid)}))}</b><button type="button" class="subtle" data-notes-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header>
        <p class="muted">${esc(t('play.notesLead'))}</p>
        ${who.size>1?`<label>${esc(t('play.notesWho'))} <select id="play-notes-who">${[...who].map(([id,name])=>`<option value="${esc(id)}"${id===cid?' selected':''}>${esc(name)}</option>`).join('')}</select></label>`:''}
        <textarea id="play-notes-text" rows="3" maxlength="600" placeholder="${esc(t('play.notesPlaceholder'))}"></textarea>
        <p><button type="button" class="primary" id="play-notes-add">${esc(t('play.notesAdd'))}</button></p>
        ${notes.length?`<ul class="play-notes-list">${notes.map(n=>`<li><span>${esc(n.text)}</span> <small class="muted">${esc(new Date(n.created_at).toLocaleString('hu-HU'))}</small> <button type="button" class="subtle" data-note-withdraw="${esc(n.id)}">${esc(t('play.notesWithdraw'))}</button></li>`).join('')}</ul>`:`<p class="muted">${esc(t('play.notesNone'))}</p>`}</div>`;
      box.querySelector('[data-notes-close]').onclick=close;
      box.querySelector('#play-notes-who')?.addEventListener('change',e=>{cid=e.target.value;draw().catch(err=>toast(err.message,true));});
      box.querySelector('#play-notes-add').onclick=wrap(async()=>{const text=box.querySelector('#play-notes-text').value.trim();if(!text)return;await api('/api/play/notes',{character_id:cid,text});toast(t('play.notesSaved'));await draw();});
      for(const b of box.querySelectorAll('[data-note-withdraw]'))b.onclick=wrap(async()=>{await api('/api/play/notes/'+encodeURIComponent(b.dataset.noteWithdraw),undefined,'DELETE');await draw();});
      box.querySelector('#play-notes-text').focus();
    };
    box.onclick=e=>{if(e.target===box)close();};
    document.body.appendChild(box);await draw();
  }
  // Palor's bag and the things left in this building (a car is shown in the top bar).
  // Shown only when there is something to show; adding things is under "Eszközök".
  let placeTools=false;
  function itemsRow(){
    const items=data?.items||[],carried=items.filter(i=>i.carried),left=items.filter(i=>!i.carried&&i.here&&i.kind==='item');
    if(!carried.length&&!left.length)return '';
    return `<div class="play-items">${carried.length?`<small>🎒 ${t('play.bag')}</small>${carried.map(i=>`<button data-item-drop="${esc(i.id)}" title="${esc(t('play.drop'))}">${esc(i.name)} ⤓</button>`).join('')}`:''}
      ${left.length?`<small>${t('play.itemsHere')}</small>${left.map(i=>`<button data-item-take="${esc(i.id)}" title="${esc(t('play.take'))}">${esc(i.name)} ⤒</button>`).join('')}`:''}</div>`;
  }
  function refreshStage(){if(mode!=='place'||!current)return;const stage=$('.vn-stage');if(!stage)return;stage.classList.add('vn-settled');stage.innerHTML=current.people.map(figure).join('');for(const b of $$('.vn-stage [data-play-talk]'))b.onclick=()=>inspectPerson(current.people.find(x=>x.id===b.dataset.playTalk));paintFigures();}
  // The dialogue box at the bottom of the scene (in-person talks).
  // Authoring tools (scene prompt, own picture, content marks) sit behind one "⋯" button (2026-11-12):
  // the talk screen shows only what playing needs.
  let showHistory=false,showTools=false;
  // Ways out of the place, inside the scene (2026-11-13): rooms inside, the next rooms of the same
  // building, back to the building, and out onto the town's street. The breadcrumbs stay as a
  // shortcut, but walking happens here.
  // The ways out of a place, in one order for the "Merre mész?" list and the door markers:
  // rooms inside, next rooms of the building, back to the building, out to the street.
  function exitTargets(id){
    const n=id?node(id):null;if(!n)return [];
    const town=townOf(n.id),parent=n.parent_id?node(n.parent_id):null;
    const into=c=>({id:c.id,town:false,relation:'inside',ico:'enter',text:t('play.exitInto',{place:label(c)}),short:label(c),node:c});
    const back=b=>({id:b.id,town:false,relation:'back',ico:'back',text:t('play.exitBack',{place:label(b)}),short:label(b),node:null});
    // Entry rooms (2026-11-14, same rule as the server): the lake is left by its shore only; the
    // living room leads to every room and out; other rooms lead back to the living room.
    if(n.origin_id&&node(n.origin_id))return [back(node(n.origin_id))];
    const building=parent&&parent.id!==town?.id&&isStreet(parent)?parent:null,entry=building?.origin_id?node(building.origin_id):null;
    if(entry&&entry.id!==n.id)return [...kids(n.id).filter(onMap).map(into),back(entry)];
    return [...kids(n.id).filter(onMap).map(into),
      ...(building?kids(building.id).filter(c=>onMap(c)&&c.id!==n.id).map(c=>({id:c.id,town:false,relation:'next',ico:'swap',text:t('play.exitNext',{place:label(c)}),short:label(c),node:c})):[]),
      ...(building&&building.location_id&&!entry?[back(building)]:[]),
      ...(building&&building.location_id&&entry&&building.place_kind==='nature'?[{id:building.id,town:false,relation:'inside',ico:'enter',text:t('play.exitIntoWater',{place:label(building)}),short:label(building),node:building}]:[]),
      // The street only near the door (same rule as the server's streetReachable, 2026-11-14).
      ...(town&&isStreet(town)&&n.id!==town.id&&(n.origin||(()=>{let d=0;for(let p=n;p&&p.id!==town.id;p=p.parent_id?node(p.parent_id):null)d++;return d===2?!node(n.parent_id)?.location_id||(current?.node?.id===n.id&&Number.isFinite(current.room_exits?.[town.id]?.x)):d<=1;})())?[{id:town.id,town:true,relation:'street',ico:'door',text:t('play.exitLeave',{place:label(n),town:label(town)}),short:t('play.streetShort',{town:label(town)}),node:null}]:[])];
  }
  function exitsHtml(id){
    const count=x=>peopleIn(x.id).length;
    const all=exitTargets(id).map(e=>`<button type="button" class="vn-exit" ${e.town?`data-exit-town="${esc(e.id)}"`:`data-exit-place="${esc(e.id)}"`}><span aria-hidden="true">${icon(e.ico)}</span> ${esc(e.text)}${e.node&&count(e.node)?` <b>${count(e.node)}</b>`:''}</button>`);
    // Numbered for the keyboard (1–9).
    return all.length?`<div class="vn-exits"><small>${t('play.exitsTitle')}</small><div class="vn-exit-list">${all.map((h,i)=>i<9?h.replace('<button type="button" class="vn-exit"',`<button type="button" class="vn-exit" data-key="${i+1}"`):h).join('')}</div></div>`:'';
  }
  // Door markers on the room's picture (2026-11-13, point-and-click): a way out with a saved
  // place sits where its door is drawn; the others are arrows at the edge in their direction
  // (saved, else: back/street at the lower right, the rest right, left, ahead in turn). Hidden
  // during a talk. The owner can drag them into place ("Ajtók elhelyezése").
  let doorsEditing=false;
  const AUTO_DIRS=['right','left','forward'];
  const EDGE={left:[3,46],right:[97,46],forward:[50,24],up:[50,24],back:[93,74],down:[93,74]};
  function pictureBox(){
    const vn=$('.vn');if(!vn)return null;const W=vn.clientWidth,H=vn.clientHeight,img=$('.vn > img.vn-bg-current:not([hidden])');
    if(!img||!img.naturalWidth)return {W,H,s:1,dx:0,dy:0,iw:W,ih:H};
    const iw=img.naturalWidth,ih=img.naturalHeight,s=Math.max(W/iw,H/ih);return {W,H,s,dx:(W-iw*s)/2,dy:(H-ih*s)/2,iw,ih};
  }
  function paintDoors(force=false){
    const layer=$('#vn-doors');if(!layer||!current?.node)return;
    // A picture still loading would place the doors on the whole stage first, then move them.
    const bg=$('.vn > img.vn-bg-current:not([hidden])');if(force!==true&&bg&&!bg.complete)return;
    if(talkCharacter&&!talkMinimized&&!doorsEditing){layer.innerHTML='';return;}
    const box=pictureBox();if(!box)return;const saved=current.room_exits||{},targets=exitTargets(current.node.id);let auto=0;const stack={};
    const html=targets.map(e=>{const sv=saved[e.id]||{},dir=sv.dir||(['back','street'].includes(e.relation)?'back':AUTO_DIRS[auto++%AUTO_DIRS.length]);
      const placed=Number.isFinite(sv.x)&&Number.isFinite(sv.y);let left,top;
      // A door low or at the very edge of the picture can fall into the cropped part or under the
      // arrival bar: keep every marker inside the visible scene (2026-11-14, forest → car park).
      if(placed){left=Math.min(box.W-70,Math.max(70,box.dx+sv.x*box.iw*box.s));top=Math.min(box.H-90,Math.max(40,box.dy+sv.y*box.ih*box.s));}
      else{const [px,py]=EDGE[dir]||EDGE.right,k=stack[dir]=(stack[dir]||0)+1;left=px/100*box.W;top=py/100*box.H+(k-1)*46;}
      const arrow={left:'←',right:'→',forward:'↑',up:'↑',back:'↓',down:'↓'}[dir];
      return `<button type="button" class="${placed?'vn-door':'vn-arrow vn-arrow-'+dir}${doorsEditing?' vn-door-edit':''}" data-door="${esc(e.id)}" data-town="${e.town?'1':''}" data-left="${left.toFixed(1)}" data-top="${top.toFixed(1)}" title="${esc(e.text)}">${placed?`<span class="vn-door-dot" aria-hidden="true"></span>`:`<span aria-hidden="true">${dir==='left'?arrow+' ':''}</span>`}${esc(e.short)}${!placed&&dir!=='left'?` ${arrow}`:''}</button>`;});
    // Repainting (the background picture finished loading, a resize) must not replace the buttons:
    // a click whose press landed on a replaced button was lost (2026-11-15, "the bubble jumps and
    // nothing happens"). The same doors only move; new buttons are made only when the doors change.
    const sig=html.map(h=>h.replace(/ data-left="[^"]*" data-top="[^"]*"/,'')).join('')+(doorsEditing?'|edit':'');
    if(layer.dataset.sig!==sig||layer.children.length!==html.length){layer.innerHTML=html.join('');layer.dataset.sig=sig;
      if(!doorsEditing)for(const b of layer.querySelectorAll('[data-door]'))b.onclick=wrap(()=>b.dataset.town?openTown(b.dataset.door):openPlace(b.dataset.door,true));}
    else html.forEach((h,i)=>{const m=/ data-left="([^"]*)" data-top="([^"]*)"/.exec(h),b=layer.children[i];if(m&&b){b.dataset.left=m[1];b.dataset.top=m[2];}});
    // Positions through CSSOM (the page's security policy forbids inline style attributes).
    for(const b of layer.querySelectorAll('[data-door]')){b.style.left=b.dataset.left+'px';b.style.top=b.dataset.top+'px';}
    if(doorsEditing)bindDoorDrag(layer,box);
  }
  function bindDoorDrag(layer,box){
    let drag=null;
    layer.onpointerdown=e=>{const b=e.target.closest('[data-door]');if(!b)return;drag=b;b.setPointerCapture?.(e.pointerId);e.preventDefault();};
    layer.onpointermove=e=>{if(!drag)return;const r=layer.getBoundingClientRect();drag.style.left=(e.clientX-r.left)+'px';drag.style.top=(e.clientY-r.top)+'px';drag.dataset.moved='1';drag.className='vn-door vn-door-edit';};
    layer.onpointerup=()=>{drag=null;};
  }
  async function saveDoors(){
    const box=pictureBox(),exits={};
    for(const b of $$('#vn-doors [data-door][data-moved]')){const x=(parseFloat(b.style.left)-box.dx)/(box.iw*box.s),y=(parseFloat(b.style.top)-box.dy)/(box.ih*box.s);exits[b.dataset.door]={x:Math.min(1,Math.max(0,x)),y:Math.min(1,Math.max(0,y))};}
    const r=await api('/api/play/room-exits/'+encodeURIComponent(current.node.id),{exits});current.room_exits=r.saved;toast(t('play.doorsSaved'));
  }
  // One way to end a talk (2026-11-13): "Elköszönök" saves it and shows the summary card; with
  // nothing said yet it simply closes; after the card "Tovább" returns to the place.
  const goodbyeButtons=(lines,ended)=>ended?`<button type="button" id="play-close" class="primary">${t('play.continue')}</button>`
    :talk&&lines.length>=2?`<button type="button" id="play-end" class="vn-goodbye">👋 ${t('play.goodbye')}</button>`:`<button type="button" id="play-close">✕ ${t('common.cancel')}</button>`;
  // What the talk left behind: the relationship step, what he will remember, a milestone.
  function summaryCard(s){
    const d=Number(s.level_delta)||0;
    return `<div class="vn-summary"><b>${esc(s.title||t('play.saved'))}</b>${s.milestone?`<span class="vn-summary-star">★ ${esc(s.milestone)}</span>`:''}
      <p>${esc(s.summary||'')}</p>
      ${d?`<p class="vn-summary-level ${d>0?'up':'down'}">${d>0?'▲':'▼'} ${esc(t(d>0?'play.levelUp':'play.levelDown'))}${s.reason?` – ${esc(s.reason)}`:''}</p>`:s.held_back?`<p class="vn-summary-level">${t('play.heldBack')}</p>`:''}
      ${s.character_memory?`<p class="vn-summary-memory">💭 ${esc(t('play.willRemember'))} ${esc(s.character_memory)}</p>`:''}</div>`;
  }
  // Arrival box folds into a small pill (owner, 2026-11-14): about 6 s after arriving, never while
  // hovered, focused, unseen (hidden tab) or during a talk; the pill opens it again. After the
  // player opens or folds it by hand it stays as they left it.
  let arrival={of:null,collapsed:false,auto:true,timer:0};
  const ARRIVAL_FOLD_MS=6000;
  function setArrivalFold(collapsed){
    arrival.collapsed=collapsed;const el=$('.vn-box.vn-arrival');if(!el)return;
    el.classList.toggle('vn-arrival-min',collapsed);
    el.querySelector('.vn-arrival-pill')?.setAttribute('aria-expanded',String(!collapsed));
    fitStage();
  }
  function bindArrivalFold(box){
    const el=box.querySelector('.vn-arrival');if(!el)return;
    const pill=el.querySelector('.vn-arrival-pill'),hide=el.querySelector('.vn-arrival-hide');
    pill.onclick=()=>{clearTimeout(arrival.timer);arrival.auto=false;setArrivalFold(false);hide.focus();};
    hide.onclick=()=>{clearTimeout(arrival.timer);arrival.auto=false;setArrivalFold(true);pill.focus();};
    if(!arrival.auto||arrival.collapsed||arrival.timer)return;
    const st=arrival;
    const tryFold=()=>{
      if(arrival!==st||!st.auto)return;
      const now=$('.vn-box.vn-arrival');
      if(talkCharacter||!now){arrival.timer=0;return;}
      // Wait while the pointer or keyboard focus is on it, or the tab is not visible.
      if(document.hidden||now.matches(':hover')||now.contains(document.activeElement)){arrival.timer=setTimeout(tryFold,document.hidden?ARRIVAL_FOLD_MS:1500);return;}
      arrival.timer=0;arrival.auto=false;setArrivalFold(true);
    };
    st.fold=tryFold;
    arrival.timer=setTimeout(tryFold,ARRIVAL_FOLD_MS);
  }
  // Back from a hidden tab: the full 6 s start again, so the text is really seen (2026-11-14).
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden||!arrival.auto||arrival.collapsed||!arrival.timer||!arrival.fold)return;
    clearTimeout(arrival.timer);arrival.timer=setTimeout(arrival.fold,ARRIVAL_FOLD_MS);
  });
  function renderSceneDialog(box){
    const lines=talk?.lines||[],ended=talk?.status==='closed',last=lines.at(-1);
    if(!talkCharacter||talkMinimized){
      // Arrival: who is here and what they are doing, plus what happened here today.
      const p=current||{people:[],today:[]};
      // Starts as the small pill and never folds by itself (owner, 2026-11-20): a box that shrank
      // after a few seconds made the scene change under the player. What someone is doing is on
      // the figure's hover; the pill still opens the full text.
      if(arrival.of!==p){clearTimeout(arrival.timer);arrival={of:p,collapsed:true,auto:false,timer:0};}
      box.innerHTML=`<div class="vn-box vn-arrival${arrival.collapsed?' vn-arrival-min':''}">
        <button type="button" class="vn-arrival-pill" aria-expanded="false" title="${esc(t('play.arrivalShow'))}"><b>${esc(t('play.youArrive',{place:label(p.node)||''}))}</b>${p.people.length?`<span class="vn-arrival-count">${esc(t('play.peopleCount',{count:p.people.length}))}</span>`:''}<span class="vn-arrival-more">${t('play.arrivalShow')}</span></button>
        <div class="vn-text">
        <button type="button" class="vn-arrival-hide subtle" title="${esc(t('play.arrivalHide'))}" aria-label="${esc(t('play.arrivalHide'))}">–</button>
        <b class="vn-who">${esc(t('play.youArrive',{place:label(p.node)||''}))}</b>
        ${p.trip?.minutes?`<p class="vn-trip">🧭 ${esc(t('play.tripMinutes',{minutes:p.trip.minutes}))}${p.trip.vehicle?' · '+esc(t('play.tripByCar',{vehicle:p.trip.vehicle})):''}${p.trip.ride_with?' · '+esc(t('play.tripRideWith',{name:p.trip.ride_with.name})):''}</p>`:''}
        ${p.trip?.encounter?`<p class="vn-encounter"><b>${t('play.encounter')}:</b> ${esc(p.trip.encounter.text)}</p>`:''}
        ${p.people.length?p.people.map(x=>`<p class="vn-activity"><button class="vn-link" data-arrival-talk="${esc(x.id)}">${esc(x.name)}</button>${x.mood==="good"?" 🙂":x.mood==="bad"?" 😠":""}${x.level!==null&&p.level_labels?` <span class="vn-rel">${esc(p.level_labels[x.level])}</span>`:''} — ${esc(x.activity||'')}</p>`).join(''):`<p>${t('play.nobody')}</p>`}
        ${p.today?.length?`<details class="vn-today"><summary>${t('play.todayHere',{count:p.today.length})}</summary>${p.today.map(e=>`<p><b>${esc(e.slot)}:</b> ${esc(e.title)} – ${esc(e.summary)}</p>`).join('')}</details>`:''}
        ${p.people.length>=2&&!talkCharacter?`<button type="button" class="vn-group-start" id="vn-group-start">👥 ${t('play.groupChoose')}</button>`:''}
        </div></div>`;
      // The ways out are only on the picture now (owner, 2026-11-14): door markers where the door
      // is drawn, arrows at the edges; the list under the arrival text is gone.
      for(const b of $$('[data-arrival-talk]'))b.onclick=()=>inspectPerson(p.people.find(x=>x.id===b.dataset.arrivalTalk));
      const exits=$$('#vn-doors [data-door]');etaFor(exits.map(b=>b.dataset.door)).then(eta=>{for(const b of exits){const m=eta[b.dataset.door];if(Number.isFinite(m)&&m>1&&b.isConnected&&!b.title.includes('·'))b.title+=' · '+t('play.minutesShort',{minutes:m});}}).catch(()=>{});
      preloadExits(exits.filter(b=>!b.dataset.town).map(b=>b.dataset.door));
      if($('#vn-group-start'))$('#vn-group-start').onclick=wrap(async()=>{const selected=await chooseGroupParticipants(p.people,esc);if(selected)await startGroup(selected);});
      bindArrivalFold(box);
      return;
    }
    if(groupTalk)return renderGroupDialog(box,lines,ended);
    const speakerIsPalor=last?.speaker==='palor';
    // Scene guests (2026-11-18): when a guest spoke this turn, the whole turn is shown with names.
    const guests=talk?.guests||[],isGuest=l=>typeof l?.speaker_id==='string'&&l.speaker_id.startsWith('guest:');
    const turn=lines.slice(lines.map(l=>l.speaker).lastIndexOf('palor')+1),mixed=!busy&&turn.some(isGuest);
    // When the generated text is intimate right now (the server decides from the content, owner
    // 2026-11-18), a guest's shirtless picture is shown, if it was made.
    const intimateNow=talk?.intimate_now===true;
    box.innerHTML=`<div class="vn-box${guests.length?' vn-has-guests':''}">${portrait(talkCharacter,'vn-speaker')}
      <div class="vn-text"><b class="vn-who">${busy||mixed?esc(talkCharacter.name):last?(speakerIsPalor?'Palor':esc(talkCharacter.name)):esc(talkCharacter.name)}</b>${beatOf(lines)&&beatOf(lines)!=='talk'?`<span class="vn-beat">${esc(t('play.beat.'+beatOf(lines)))}</span>`:''}${talk&&Number.isFinite(talk.chemistry)?`<span class="vn-chem ${talk.chemistry>0?'vn-chem-up':talk.chemistry<0?'vn-chem-down':''}" title="${esc(t('play.chemistry'))}" aria-label="${esc(t('play.chemistry'))}: ${talk.chemistry}">${talk.chemistry>=0?'♥':'💔'} ${talk.chemistry>0?'+':''}${talk.chemistry}</span>`:''}
        <p class="vn-say" aria-live="polite">${busy?`<span class="vn-typing">${esc(t('play.typingName',{name:talkCharacter.name}))}</span>`:mixed?turn.map(l=>`<b>${esc(isGuest(l)?l.speaker_name||'?':talkCharacter.name)}:</b> ${esc(l.text)}`).join('<br>'):last?esc(last.text):''}</p>
        ${guests.length?`<div class="vn-guests">${guests.map(g=>{const bare=intimateNow&&g.bare==='done';return `<span class="vn-guest" title="${esc(g.description)}">${g.image==='done'?`<img class="vn-guest-pic" src="/api/play/guests/${esc(g.id)}/image${bare?'?bare=1':''}" alt="${esc(g.name)}">`:g.image==='pending'?`<span class="vn-guest-pic vn-guest-wait" title="${esc(t('play.guestImagePending'))}">⏳</span>`:g.image==='failed'?`<span class="vn-guest-pic vn-guest-wait" title="${esc(t('play.guestImageFailed')+(g.image_note?' '+g.image_note:''))}">⚠</span>`:''}${g.bare==='pending'&&g.image==='done'?`<span class="muted" title="${esc(t('play.guestBarePending'))}">⏳</span>`:g.bare==='failed'?`<span class="muted" title="${esc(t('play.guestBareFailed')+(g.image_note?' '+g.image_note:''))}">⚠</span>`:''}<b>${esc(g.name)}</b><span class="vn-guest-row">${g.saved?`<span class="muted">${t('play.guestSaved')}</span>`:ended?'':`<button type="button" class="subtle" data-guest-save="${esc(g.id)}">${t('play.guestSave')}</button>`}${!ended&&g.image==='done'&&(g.bare==='off'||g.bare==='failed')?`<button type="button" class="subtle" data-guest-bare="${esc(g.id)}">${t('play.guestBareMake')}</button>`:''}${!ended&&g.image!=='pending'&&g.bare!=='pending'?`<button type="button" class="subtle" data-guest-renew="${esc(g.id)}">${t('play.guestRenew')}</button>`:''}${ended?'':`<button type="button" class="subtle" data-guest-leave="${esc(g.id)}">${t('play.guestLeave')}</button>`}</span></span>`;}).join('')}</div>`:''}
        ${ended&&talk.summary?summaryCard(talk.summary):''}
        ${!ended&&talk?.leaving?`<p class="vn-leaving" role="status">🚪 ${esc(t('play.leaving',{text:talk.leaving}))}</p>`:''}
        ${ended?'':`${talk?.choices?.length&&!busy?`<div class="vn-quick vn-choices">${talk.choices.map((x,i)=>`<button type="button" data-quick="${esc(x)}" class="vn-choice vn-choice-${i}">${esc(x)}</button>`).join('')}</div>`:lines.length?`<div class="vn-quick">${['play.gesture1','play.gesture2','play.gesture3'].map(k=>`<button type="button" data-quick="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>`:`<div class="vn-quick">${['play.quick1','play.quick2','play.quick3'].map(k=>`<button type="button" data-quick="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>`}<form id="play-form" class="vn-form"><textarea id="play-input" rows="1" aria-label="${esc(t('play.inputLabel'))}" maxlength="2000" autocomplete="off" placeholder="${esc(t('play.placeholder'))}" aria-describedby="play-input-help"></textarea><button class="primary" ${busy?'disabled':''}>${t('play.send')}</button></form>`}
        ${showShared&&sharedFor.length?`<div class="vn-shared">${sharedFor.map(s=>`<button type="button" data-show-photo="${esc(s.media_id)}" title="${esc(s.description||'')}"><img src="${pic(s.media_id)}" alt="" loading="lazy" class="${s.intimate?'rel-blur':''}"></button>`).join('')}</div>`:''}
        ${!ended&&!busy&&talk?.mode==='intimate'?`<div class="vn-pace" role="group" aria-label="${esc(t('play.paceLabel'))}">${['slower','continue','stop'].map(p=>`<button type="button" data-pace="${p}" class="vn-pace-${p}">${t('play.pace.'+p)}</button>`).join('')}</div>`:''}
        <div class="vn-buttons">${showTools?`<button type="button" id="vn-talk-view">${t(settings.talk_view==='chat'?'play.viewVn':'play.viewChat')}</button>`:''}${!ended&&talk?.last_turn?`<button type="button" id="vn-undo-turn" ${busy?'disabled':''}>${t('play.undoTurn')}</button>${talk.last_turn.can_regenerate?`<button type="button" id="vn-regenerate" ${busy?'disabled':''}>${t('play.regenerate')}</button>`:''}`:''}${!ended&&talkChannel==='in_person'&&talk?.mode!=='intimate'?(talkCharacter.stage==='intimate'?`<button type="button" id="vn-closer">💋 ${t('play.closer')}</button>`:''):''}${photoMode?`<button type="button" id="vn-photo-size">${photoSmall?'⛶ '+t('play.photoBig'):'▣ '+t('play.photoSmall')}</button>`:''}${!ended&&showTools&&sharedFor.length?`<button type="button" id="vn-shared">📷 ${t('play.showShared')}</button>`:''}${talkChannel==='in_person'&&(showTools||photoMode)?`<button type="button" id="vn-photo">${photoMode?t('play.photoOff'):t('play.photoOn')}</button>${photoMode&&photoList.length?`<button type="button" id="vn-photo-prev" aria-label="${esc(t('play.prevPhoto'))}">◀</button>${showTools?`<span class="vn-mark">${['non_intimate','nudity','sexual_activity'].map(l=>`<button type="button" data-mark="${l}" title="${esc(t('play.mark.'+l))}">${{non_intimate:'☀',nudity:'🔥',sexual_activity:'🔞'}[l]}</button>`).join('')}</span>`:''}<span class="vn-photo-count">${photoIdx+1}/${photoList.length}${photoList[photoIdx]?.intimate?' 🔞':''}${photoList[photoIdx]?.with_palor?' · Palorral':''}</span><button type="button" id="vn-photo-next" aria-label="${esc(t('play.nextPhoto'))}">▶</button>`:''}`:''}${!ended&&talkChannel==='in_person'&&!photoMode&&talk&&talkCharacter.stage&&talkCharacter.stage!=='none'&&(talk.mood||talk.mode==='intimate')?`<button type="button" id="vn-moment" class="vn-moment">✨ ${t('play.moment')}</button>`:''}${talkChannel==='in_person'&&showTools?`<button type="button" id="vn-snapshot">📸 ${t('picture.snapshot')}</button><button type="button" id="vn-scene-prompt">📋 ${t('play.scenePrompt')}</button>${phone?'':`<label class="vn-add">➕ ${t('play.addScene')}<input type="file" id="vn-add-scene" accept="image/png,image/jpeg" hidden></label>`}`:''}${showTools||talkChannel!=='in_person'?`<button type="button" id="vn-talk-notes" title="${esc(t('play.notesLead'))}">${t('play.notes')}</button>`:''}${talkChannel==='in_person'?`<button type="button" id="vn-tools" class="vn-tools" aria-expanded="${showTools}" title="${esc(t('play.toolsTitle'))}">${showTools?'✕':'⋯'} ${t('play.tools')}</button>`:''}${!ended&&showTools&&talk&&talkChannel==='in_person'&&guests.length<2?`<button type="button" id="vn-guest-add" title="${esc(t('play.guestAddTitle'))}">${t('play.guestAdd')}</button>`:''}<button type="button" id="vn-history">${t('play.history')}</button>${goodbyeButtons(lines,ended)}</div></div></div>
      ${settings.talk_view==='chat'?`<div class="vn-chat-feed" role="log">${lines.slice(-12).map(l=>`<p class="${l.speaker==='palor'?'vn-chat-mine':'vn-chat-theirs'}"><b>${l.speaker==='palor'?'Palor':esc(isGuest(l)?l.speaker_name||'?':talkCharacter.name)}:</b> ${esc(l.text)}</p>`).join('')}</div>`:''}${showHistory?`<div class="vn-history">${lines.map(l=>`<p><b>${l.speaker==='palor'?'Palor':esc(isGuest(l)?l.speaker_name||'?':talkCharacter.name)}:</b> ${esc(l.text)}</p>`).join('')||`<p class="muted">—</p>`}${talk?.revised_turns?.length?`<details class="vn-revisions"><summary>${t('play.earlierVersions')}</summary>${talk.revised_turns.map(revision=>`<article><small>${esc(new Date(revision.created_at).toLocaleString('hu-HU'))} · ${esc(t('play.revision.'+revision.action))}</small>${revision.lines.map(l=>`<p><b>${l.speaker==='palor'?'Palor':esc(talkCharacter.name)}:</b> ${esc(l.text)}</p>`).join('')}</article>`).join('')}</details>`:''}</div>`:''}`;
    bindTalkControls();
    if($('#vn-talk-view'))$('#vn-talk-view').onclick=wrap(async()=>{settings=await api('/api/play/settings',{talk_view:settings.talk_view==='chat'?'vn':'chat'});renderTalk();});
    const revise=action=>wrap(async()=>{if(busy||!talk?.last_turn)return;const text=[...talk.lines].reverse().find(line=>line.speaker==='palor')?.text||'';if(action==='regenerate'&&!await confirmBox(t('play.regenerateConfirm')))return;const signature=talk.id+':'+talk.last_turn.reply_id+':'+action;if(!turnIntents.has(signature))turnIntents.set(signature,'turn_'+crypto.randomUUID());const cid=talk.id,expected=talk.last_turn.reply_id;talkDraft=text;if($('#play-input'))$('#play-input').value=text;busy=true;renderTalk();try{talk=await api('/api/play/conversations/'+cid+'/turn',{request_key:turnIntents.get(signature),expected_reply_id:expected,action,...(action==='regenerate'?{acknowledge_cost:true}:{})});talkDraft=action==='undo'?talk.draft||text:'';turnIntents.delete(signature);}finally{busy=false;if($('#play-input'))$('#play-input').value=talkDraft;renderTalk();}});
    if($('#vn-undo-turn'))$('#vn-undo-turn').onclick=revise('undo');if($('#vn-regenerate'))$('#vn-regenerate').onclick=revise('regenerate');
    const feed=$('.vn-chat-feed');if(feed)feed.scrollTop=feed.scrollHeight;
    bindGuests(guests);
    if($('#vn-photo-size'))$('#vn-photo-size').onclick=()=>{photoSmall=!photoSmall;$('.vn')?.classList.toggle('vn-photo-small',photoSmall);renderTalk();};
    typeOut(mixed?null:last,busy);
    syncScene();sparkPop(mixed?turn.find(l=>l.speaker==='character'&&!isGuest(l)):last);
    $('#vn-history').onclick=()=>{showHistory=!showHistory;renderTalk();};
    if($('#vn-tools'))$('#vn-tools').onclick=()=>{showTools=!showTools;renderTalk();};if($('#vn-talk-notes'))$('#vn-talk-notes').onclick=wrap(()=>openNotes(current||{people:[]}));
    bindQuickChoices();
    if($('#vn-photo'))$('#vn-photo').onclick=wrap(togglePhoto);
    for(const b of $$('[data-mark]'))b.onclick=wrap(async()=>{const item=photoList[photoIdx];if(!item)return;await api('/api/play/content',{media_id:item.media_id,level:b.dataset.mark});item.intimate=b.dataset.mark!=='non_intimate';photoFor=null;toast(t('play.marked'));renderTalk();});
    if($('#vn-snapshot'))$('#vn-snapshot').onclick=wrap(()=>openPictureOrder({target:{target:'snapshot',character_id:talkCharacter.id,location_id:current?.node?.location_id||'',conversation_id:talk.id},api,requestHeaders,onSaved:async()=>{talk=await api('/api/play/conversations/'+talk.id);renderTalk();}}));
    if($('#vn-scene-prompt'))$('#vn-scene-prompt').onclick=wrap(async()=>{const r=await api('/api/play/prompts?'+new URLSearchParams({character_id:talkCharacter.id,location_id:current?.node?.location_id||'',...(talk?.id&&talkChannel!=='phone'?{conversation_id:talk.id}:{})}));await navigator.clipboard.writeText(r.scene.prompt+'\n\n'+r.scene.howto);toast(t('play.promptCopied'));});
    if($('#vn-add-scene'))$('#vn-add-scene').onchange=wrap(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error(t('play.tooLarge'));
      const progress=uploadProgress(e.target);e.target.disabled=true;let r;try{r=await uploadImage({url:'/api/play/scenes/upload',file,fields:{character_id:talkCharacter.id,location_id:current?.node?.location_id||null},headers:requestHeaders(),onProgress:progress.update});}finally{progress.close();e.target.disabled=false;e.target.value='';}toast(r.duplicate?t('play.sceneDuplicate'):t('play.sceneAdded'));
      // The uploaded picture becomes the scene picture above the conversation at once (2026-11-13).
      photoList=[{media_id:r.media_id,kind:'image',at_place:true,with_palor:true,intimate:false,description:null}];photoIdx=0;photoFor=null;photoMode=true;
      renderTalk();showPhoto();$('.vn-photo')?.classList.remove('vn-scene-in');void $('.vn-photo')?.offsetWidth;$('.vn-photo')?.classList.add('vn-scene-in');placeBubbles();});
    if($('#vn-moment'))$('#vn-moment').onclick=wrap(async()=>{photoFor=null;await togglePhoto();});
    // Palor steps closer: the conversation becomes an intimate scene (both must want it).
    if($('#vn-closer'))$('#vn-closer').onclick=wrap(async()=>{
      busy=true;renderTalk();
      try{talk=await talkApi(talk?{conversation_id:talk.id,intimate:true,text:t('play.closerLine')}:{character_id:talkCharacter.id,channel:'in_person',intimate:true,text:t('play.closerLine')});photoFor=null;if(talk.mood){moodBy.set(talkCharacter.id,talk.mood);refreshStage();}}
      finally{busy=false;renderTalk();}
    });
    if($('#vn-shared'))$('#vn-shared').onclick=()=>{showShared=!showShared;renderTalk();};
    for(const b of $$('[data-pace]'))b.onclick=wrap(async()=>{busy=true;renderTalk();
      try{talk=await talkApi({conversation_id:talk.id,pace:b.dataset.pace});if(b.dataset.pace==='stop')toast(t('play.paceStopped'));if(talk.mood){moodBy.set(talkCharacter.id,talk.mood);refreshStage();}}
      finally{busy=false;renderTalk();}});
    for(const b of $$('[data-show-photo]'))b.onclick=wrap(async()=>{
      showShared=false;busy=true;renderTalk();
      try{talk=await talkApi(talk?{conversation_id:talk.id,photo_id:b.dataset.showPhoto,text:$('#play-input')?.value||''}:{character_id:talkCharacter.id,channel:talkChannel,photo_id:b.dataset.showPhoto});if(talk.mood){moodBy.set(talkCharacter.id,talk.mood);refreshStage();}}
      finally{busy=false;renderTalk();}
    });
    if($('#vn-photo-prev'))$('#vn-photo-prev').onclick=()=>{photoIdx=(photoIdx-1+photoList.length)%photoList.length;showPhoto();renderTalk();};
    if($('#vn-photo-next'))$('#vn-photo-next').onclick=()=>{photoIdx=(photoIdx+1)%photoList.length;showPhoto();renderTalk();};
    if(photoMode)placeBubbles();
  }

  // ---- group scene: Palor with 2–4 people here; each turn may get several short replies ----
  let groupTalk=false;
  async function startGroup(people){
    talkMinimized=false;talkDraft='';conversationContext=null;const oldInput=$('#play-input');if(oldInput)oldInput.value='';
    talk=null;groupTalk=true;showHistory=false;showShared=false;sharedFor=[];
    talkCharacter={id:people[0].id,name:people.map(x=>x.name.split(/\s/)[0]).join(', '),cover_id:people[0].cover_id,stage:'none'};talkChannel='in_person';
    busy=true;renderTalk();refreshStage();
    try{talk=await api('/api/play/group-talk',{opener:true,character_ids:people.map(p=>p.id)});}catch(e){talk=null;groupTalk=false;talkCharacter=null;refreshStage();toast(e.message,true);}finally{busy=false;renderTalk();$('#play-input')?.focus();}
  }
  function renderGroupDialog(box,lines,ended){
    // The newest turn: every reply since Palor last spoke, each with its speaker.
    const lastPalor=lines.map(l=>l.speaker).lastIndexOf('palor'),turn=lines.slice(lastPalor+1),said=lastPalor>=0?lines[lastPalor]:null;
    box.innerHTML=`<div class="vn-box vn-group">${portrait(talkCharacter,'vn-speaker')}<div class="vn-text"><b class="vn-who">${esc(talkCharacter.name)}</b>
        ${said?`<p class="vn-group-palor"><b>Palor:</b> ${esc(said.text)}</p>`:''}
        <div class="vn-say" aria-live="polite">${busy?`<span class="vn-typing">${t('play.waiting')}</span>`:turn.map(l=>`<p><b>${esc(l.speaker_name||'?')}:</b> ${esc(l.text)}</p>`).join('')}</div>
        ${ended&&talk.summary?summaryCard(talk.summary):''}
        ${ended||busy||!talk?.choices?.length?'':`<div class="vn-quick vn-choices">${talk.choices.map((x,i)=>`<button type="button" data-quick="${esc(x)}" class="vn-choice vn-choice-${i}">${esc(x)}</button>`).join('')}</div>`}
        ${ended?'':`<form id="play-form" class="vn-form"><textarea id="play-input" rows="1" aria-label="${esc(t('play.inputLabel'))}" maxlength="2000" autocomplete="off" placeholder="${esc(t('play.placeholderGroup'))}" aria-describedby="play-input-help"></textarea><button class="primary" ${busy?'disabled':''}>${t('play.send')}</button></form>`}
        <div class="vn-buttons"><button type="button" id="vn-history">${t('play.history')}</button>${goodbyeButtons(lines,ended)}</div></div></div>
      ${showHistory?`<div class="vn-history">${lines.map(l=>`<p><b>${l.speaker==='palor'?'Palor':esc(l.speaker_name||'?')}:</b> ${esc(l.text)}</p>`).join('')||`<p class="muted">—</p>`}</div>`:''}`;
    bindTalkControls();
    $('#vn-history').onclick=()=>{showHistory=!showHistory;renderTalk();};
    if($('#vn-tools'))$('#vn-tools').onclick=()=>{showTools=!showTools;renderTalk();};if($('#vn-talk-notes'))$('#vn-talk-notes').onclick=wrap(()=>openNotes(current||{people:[]}));
    bindQuickChoices();
    syncScene();
  }

  // ---- photo scenes: own pictures with comic speech bubbles -------------------------------
  let photoMode=false,photoSmall=false,photoList=[],photoIdx=0,photoFor=null,lastPhotoId=null,autoSceneId=null,sparkKey=null;
  // Automatic scene (2026-11-11): each reply may carry the picture or video the director chose for
  // that moment of the conversation; it replaces the previous one with a short crossfade. The
  // manual photo browser still works and is refreshed for the new moment.
  function syncScene(){
    if(settings.auto_scene===false||!talk||talkChannel!=='in_person')return;
    const line=[...(talk.lines||[])].reverse().find(l=>l.scene);if(!line||line.scene.media_id===autoSceneId)return;
    autoSceneId=line.scene.media_id;photoList=[line.scene];photoIdx=0;photoFor=null;photoMode=true;
    showPhoto();$('.vn-photo')?.classList.remove('vn-scene-in');void $('.vn-photo')?.offsetWidth;$('.vn-photo')?.classList.add('vn-scene-in');placeBubbles();
  }
  // The moment the conversation is at (the last reply's beat).
  const beatOf=lines=>[...(lines||[])].reverse().find(l=>l.beat)?.beat||null;
  // How his last reply landed: a heart or a crack floats up once per new reply.
  function sparkPop(last){
    if(!last||last.speaker!=='character'||!last.spark)return;const key=(talk?.id||'')+':'+(talk?.lines?.length||0);if(key===sparkKey)return;sparkKey=key;
    const box=$('.vn-box');if(!box)return;const el=document.createElement('span');el.className='vn-spark '+(last.spark>0?'vn-spark-up':'vn-spark-down');el.textContent=last.spark>0?'♥':'💔';el.setAttribute('aria-hidden','true');box.appendChild(el);setTimeout(()=>el.remove(),1600);
  }
  async function togglePhoto(){
    if(photoMode){photoMode=false;$('.vn')?.classList.remove('vn-photo-mode');$('.vn-photo')?.remove();return renderTalk();}
    let hidden=0;
    if(photoFor!==talkCharacter.id){const ctx=(talk?.lines||[]).slice(-6).map(l=>l.text).join(' ').slice(0,1200);
      // after: the picture shown last, so the next set continues the same shoot.
      const r=await api('/api/play/photos/'+talkCharacter.id+'?'+new URLSearchParams({context:ctx,intimate:talk?.mode==='intimate'?'1':'0',...(lastPhotoId?{after:lastPhotoId}:{}),...(beatOf(talk?.lines)?{beat:beatOf(talk?.lines)}:{})}));photoList=r.photos;hidden=r.hidden||0;photoIdx=0;photoFor=talkCharacter.id;}
    if(!photoList.length)return toast(hidden?t('play.photosLocked',{count:hidden}):t('play.noPhotos',{name:talkCharacter.name}));
    if(!photoList[0].at_place)toast(t('play.photosElsewhere'));
    photoMode=true;showPhoto();renderTalk();
  }
  function showPhoto(){
    const scene=$('.vn');if(!scene)return;scene.classList.add('vn-photo-mode');scene.classList.toggle('vn-photo-small',photoSmall);
    let box=$('.vn-photo');if(!box){box=document.createElement('div');box.className='vn-photo';box.innerHTML=`<div class="vn-photo-media"><div class="vn-photo-backdrop" aria-hidden="true"></div><img class="vn-photo-subject" alt=""></div><div class="vn-chat" aria-live="polite" aria-label="${esc(t('play.history'))}"></div>`;scene.insertBefore(box,$('#vn-dialog'));
      const observer=new ResizeObserver(()=>{if(!box.isConnected){observer.disconnect();return;}fitPhoto();});observer.observe(box.querySelector('.vn-photo-media'));observer.observe(scene);const dialog=$('#vn-dialog');if(dialog)observer.observe(dialog);
    }
    const media=box.querySelector('.vn-photo-media');
    const item=photoList[photoIdx],tag=item.kind==='video'?'VIDEO':'IMG';
    let im=media.querySelector('img,video');if(im.tagName!==tag){const next=document.createElement(tag.toLowerCase());if(tag==='VIDEO'){next.muted=true;next.loop=true;next.autoplay=true;next.playsInline=true;}im.replaceWith(next);im=next;}
    api('/api/play/photos/seen',{character_id:talkCharacter.id,media_id:item.media_id}).catch(()=>{});lastPhotoId=item.media_id;
    im.className='vn-photo-subject';im.alt=tag==='IMG'?(item.description||talkCharacter.name):'';media.querySelector('.vn-caption')?.remove();
    // Reuse the same local preview as a soft backdrop; no second video decoder.
    media.querySelector('.vn-photo-backdrop').style.backgroundImage=tag==='IMG'?`url("${pic(item.media_id,1600)}")`:'none';
    if(item.description){const cap=document.createElement('button');cap.type='button';cap.className='vn-caption';cap.textContent='ⓘ';cap.title=item.description;cap.onclick=()=>cap.classList.toggle('vn-caption-open');cap.dataset.text=item.description;media.appendChild(cap);}
    // A video starts at the analysed moment that fits the scene best (when known).
    if(tag==='VIDEO'){im.onloadedmetadata=()=>{if(item.start_at>0&&item.start_at<im.duration)im.currentTime=item.start_at;fitPhoto();placeBubbles();};im.src=img(item.media_id);im.play?.().catch(()=>{});}else{im.onload=()=>{fitPhoto();placeBubbles();};im.src=pic(item.media_id,1600);}
    fitPhoto();
  }
  // Fit the actual image box, so the fade follows its edges instead of the letterbox.
  // Without a verified person region, keep the full frame rather than guessing a crop.
  function fitPhoto(){
    const scene=$('.vn'),box=$('.vn-photo'),media=box?.querySelector('.vn-photo-media'),im=media?.querySelector('.vn-photo-subject');if(!scene||!im)return;
    const dialog=$('#vn-dialog');if(dialog)box.style.setProperty('--photo-dialog-height',`${Math.ceil(dialog.getBoundingClientRect().height)}px`);
    const w=im.naturalWidth||im.videoWidth,h=im.naturalHeight||im.videoHeight;if(!w||!h)return;
    const scale=Math.min(media.clientWidth/w,media.clientHeight/h);im.style.width=`${w*scale}px`;im.style.height=`${h*scale}px`;
  }
  // Live chat beside the picture: the recent lines as named bubbles (his on the left,
  // Palor's on the right), newest at the bottom, like a messenger thread.
  function placeBubbles(){
    const feed=$('.vn-photo .vn-chat');if(!feed)return;
    const lines=(talk?.lines||[]).slice(-12);
    const who=l=>l.speaker==='palor'?'Palor':(l.speaker_name||talkCharacter?.name||'?');
    feed.innerHTML=lines.map(l=>`<div class="vn-chat-msg ${l.speaker==='palor'?'vn-chat-palor':'vn-chat-them'}"><b class="vn-chat-name">${esc(who(l))}</b><p>${esc(l.text)}</p></div>`).join('')
      +(busy?`<div class="vn-chat-msg vn-chat-them vn-chat-typing"><b class="vn-chat-name">${esc(talkCharacter?.name||'')}</b><p>…</p></div>`:'');
    feed.scrollTop=feed.scrollHeight;
  }
  // Visual-novel typewriter for a character's new line; a click on it shows it all.
  let typedKey=null,typer=null;
  function typeOut(last,waiting){
    clearInterval(typer);
    const el=$('.vn-say');if(!el||waiting||!last||last.speaker!=='character')return;
    const key=(talk?.id||'')+':'+(talk?.lines?.length||0);if(key===typedKey)return;typedKey=key;
    if(liveShown){liveShown=false;return;}
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const full=last.text;let n=0;el.textContent='';
    const finish=()=>{clearInterval(typer);el.textContent=full;};
    el.onclick=finish;
    const step={slow:1,normal:2,fast:5}[settings.text_speed]||2;if(settings.text_speed==='instant')return finish();
    typer=setInterval(()=>{n+=step;if(!el.isConnected)return clearInterval(typer);el.textContent=full.slice(0,n);if(n>=full.length)finish();},18);
  }
  // Ends the open in-person talk: saves it (when there was a real exchange) and clears the
  // dialogue, the photo scene and its chat.
  function leaveTalk(){
    // Any open talk is ended on leaving: one with only his opening line is closed quietly by the
    // server (no AI call). Before, such a talk stayed open unseen and blocked waiting (2026-11-15).
    groupTalk=false;if(talk&&talk.status==='open'&&talk.lines.length>=1){const id=talk.id,name=talkCharacter?.name||'';
      // Saved in the background; a failure stays on screen with "Újra" instead of vanishing.
      const save=()=>api(`/api/play/conversations/${id}/end`,{}).then(r=>{clearNotice('end:'+id);toast(r.summary?.milestone?'★ '+r.summary.milestone:t('play.savedToast'));}).catch(()=>showNotice('end:'+id,t('play.endFailed',{name}),save));
      save();}
    talkCharacter=null;talk=null;showHistory=false;autoSceneId=null;
    if(photoMode){photoMode=false;$('.vn')?.classList.remove('vn-photo-mode');$('.vn-photo')?.remove();}
  }
  // Scene guests (2026-11-18): a new man joins the scene; his profile picture is made by OpenAI
  // (paid, only when the owner says yes). While it is being made, the talk is re-read every 8 s.
  let guestPoll=0;
  // Click a character picture in the talk (speaker portrait, guest picture) to see it large;
  // a click anywhere, the ✕ or Esc closes it (owner, 2026-11-18).
  function openZoom(src,alt){
    $('.vn-zoom')?.remove();
    const box=document.createElement('div');box.className='vn-zoom';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    box.innerHTML=`<img src="${esc(src)}" alt="${esc(alt||'')}"><button type="button" class="vn-zoom-close" aria-label="${esc(t('common.closeDialog'))}">✕</button>`;
    const close=()=>{box.remove();document.removeEventListener('keydown',onKey);};
    const onKey=e=>{if(e.key==='Escape')close();};
    box.onclick=close;document.addEventListener('keydown',onKey);document.body.appendChild(box);box.querySelector('button').focus();
  }
  function bindZoom(){
    const sp=$('.vn-box img.vn-speaker');if(sp)sp.onclick=()=>openZoom(sp.src.replace(/([?&]w=)\d+/,'$11600'),sp.alt);
    for(const im of $$('img.vn-guest-pic'))im.onclick=()=>openZoom(im.src,im.alt);
  }
  function bindGuests(guests){
    bindZoom();
    if($('#vn-guest-add'))$('#vn-guest-add').onclick=wrap(async()=>{
      const guest=await ask({title:t('modal.guestTitle'),fields:[{name:'hint',label:t('play.guestHintPrompt'),multiline:true,maxLength:2000},{name:'portrait',label:t(settings.guest_image_provider==='sogni'?'modal.guestSogniPortrait':'modal.guestPortrait'),type:'checkbox',value:false}],accept:t('modal.continue')});if(!guest)return;const {hint,portrait}=guest;
      busy=true;renderTalk();
      try{talk=await api('/api/play/guests',{conversation_id:talk.id,hint:hint.trim(),portrait});const g=talk.guests?.at(-1);if(g)toast(t('play.guestJoined',{name:g.name}));if(g&&portrait&&settings.guest_image_provider==='sogni')await openAssetGeneration({kind:'guest',targetId:g.id,api,requestHeaders,onSaved:async()=>{talk=await api('/api/play/conversations/'+talk.id);renderTalk();}});}
      finally{busy=false;renderTalk();}
    });
    for(const b of $$('[data-guest-bare]'))b.onclick=wrap(async()=>{if(!await confirmBox(t('play.guestBareConfirm')))return;talk=await api(`/api/play/guests/${b.dataset.guestBare}/shirtless`,{});renderTalk();});
    for(const b of $$('[data-guest-renew]'))b.onclick=wrap(async()=>{if(settings.guest_image_provider==='sogni'){await openAssetGeneration({kind:'guest',targetId:b.dataset.guestRenew,api,requestHeaders,onSaved:async()=>{talk=await api('/api/play/conversations/'+talk.id);renderTalk();}});return;}if(!await confirmBox(t('play.guestRenewConfirm')))return;talk=await api(`/api/play/guests/${b.dataset.guestRenew}/pictures`,{});renderTalk();});
    for(const b of $$('[data-guest-leave]'))b.onclick=wrap(async()=>{talk=await api(`/api/play/guests/${b.dataset.guestLeave}/leave`,{});renderTalk();});
    for(const b of $$('[data-guest-save]'))b.onclick=wrap(async()=>{const r=await api(`/api/play/guests/${b.dataset.guestSave}/save`,{});talk=r;toast(t(r.saved?.picture?'play.guestSavedToastPic':'play.guestSavedToast',{name:r.saved?.name||''}));renderTalk();});
    clearTimeout(guestPoll);
    if(talk?.id&&guests.some(g=>g.image==='pending'||g.bare==='pending')){const id=talk.id;guestPoll=setTimeout(()=>{if(talk?.id!==id||busy)return;api('/api/play/conversations/'+id).then(v=>{if(talk?.id===id&&!busy){talk={...talk,guests:v.guests,intimate_now:v.intimate_now};renderTalk();}}).catch(()=>{});},8000);}
  }
  function bindTalkControls(){
    // After two lines the talk shows "Elköszönök" (#play-end) instead of "Mégse" (#play-close):
    // the missing button threw here and left the send form without its handler (2026-11-13).
    if($('#play-close'))$('#play-close').onclick=()=>{leaveTalk();renderTalk();refreshStage();};
    if($('#play-form')){
      $('#play-form').onsubmit=wrap(async e=>{e.preventDefault();const text=($('#play-input')?.value||'').trim();if(!text||busy)return;
        talk=await sendLine(text,()=>groupTalk?api('/api/play/group-talk',talk?{conversation_id:talk.id,text}:{text}):talkApi(talk?{conversation_id:talk.id,text}:{character_id:talkCharacter.id,channel:talkChannel,text}));
        if(talk.dispersed)toast(t('play.groupDispersed'));
        if(talk.mood){moodBy.set(talkCharacter.id,talk.mood);refreshStage();}else if(groupTalk)refreshStage();
        $('#play-input')?.focus();});
    }
    if($('#play-end'))$('#play-end').onclick=wrap(async()=>{busy=true;renderTalk();try{talk=await api(`/api/play/conversations/${talk.id}/end`,{});toast(talk.summary?.milestone?'★ '+talk.summary.milestone:t('play.savedToast'));}finally{busy=false;renderTalk();}});
  }

  // ---- Palor's phone: contacts on the left, one chat thread per contact -------------------
  let phoneWith=null,phoneTalk=null,phoneBusy=false,phoneExtra=null,phoneDraft='';
  const phoneMedia=m=>`<span class="phone-media${m.blur?' phone-blur':''}" data-phone-reveal title="${esc(m.blur?t('play.tapToShow'):t('play.photoFromPhone'))}">${m.kind==='video'?`<video src="${img(m.media_id)}" muted loop autoplay playsinline></video>`:`<img src="${pic(m.media_id,640)}" alt="${esc(t('play.photoFromPhone'))}" loading="lazy">`}</span>`;
  async function renderMessages(){
    const {contacts}=await api('/api/play/phone');
    // Someone opened from Kapcsolatok who has not written yet still gets a chat.
    if(phoneExtra&&phoneExtra.id===phoneWith&&!contacts.some(c=>c.id===phoneWith))contacts.unshift(phoneExtra);
    if(!phoneWith&&contacts.length)phoneWith=contacts[0].id;
    const who=contacts.find(c=>c.id===phoneWith)||null;
    const items=who?(await api('/api/play/phone/'+who.id)).items:[];
    const time=at=>new Date(at).toLocaleString('hu-HU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    $('#play-body').innerHTML=contacts.length||phoneWith?`<div class="phone">
      <aside class="phone-list">${contacts.map(c=>`<button class="phone-contact${c.id===phoneWith?' phone-active':''}${c.unread?' phone-unread':''}" data-phone="${esc(c.id)}">${portrait(c,'play-portrait small')}<span><b>${esc(c.name)}</b><small>${esc(time(c.last_at))}</small></span>${c.unread?`<em>${c.unread}</em>`:''}</button>`).join('')}</aside>
      <section class="phone-chat">${who?`<header>${portrait(who,'play-portrait small')}<b>${esc(who.name)}</b></header>
        <div class="phone-thread" id="phone-thread">${items.map(i=>`<p class="phone-msg phone-${i.who}"><span>${esc(i.text)}</span>${i.media?phoneMedia(i.media):''}${i.invitation?invitationBox(i.invitation):''}<small>${esc(time(i.at))}</small></p>`).join('')||`<p class="muted">${t('play.noMessages')}</p>`}${phoneBusy?`<p class="phone-msg phone-them"><span class="vn-typing">…</span></p>`:''}</div>
        ${who.can_talk&&!phoneBusy&&phoneTalk?.status==='open'&&phoneTalk.choices?.length?`<div class="phone-choices">${phoneTalk.choices.map(x=>`<button type="button" data-phone-choice="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}
        ${who.can_talk?`<form class="phone-form" id="phone-form"><button type="button" class="subtle" id="phone-ask-photo" title="${esc(t('play.askPhoto'))}" aria-label="${esc(t('play.askPhotoBtn'))}">📷<span class="phone-ask-label"> ${t('play.askPhotoBtn')}</span></button><input id="phone-input" aria-label="${esc(t('play.inputLabel'))}" maxlength="2000" autocomplete="off" placeholder="${esc(t('play.placeholder'))}"><button class="primary" ${phoneBusy?'disabled':''}>${t('play.send')}</button>${phoneTalk&&phoneTalk.status==='open'?`<button type="button" class="subtle" id="phone-end">${t('play.end')}</button>`:''}</form>`:`<p class="muted">${t('play.noProfileYet')}</p>`}`:''}</section></div>`:`<div class="play-empty-guide"><h3>${t('play.phoneEmptyTitle')}</h3><p class="muted">${t('play.phoneEmptyText')}</p></div>`;
    const thread=$('#phone-thread');if(thread)thread.scrollTop=thread.scrollHeight;
    for(const b of $$('[data-phone]'))b.onclick=wrap(async()=>{phoneWith=b.dataset.phone;phoneTalk=null;await renderMessages();});
    if($('#phone-input')&&phoneDraft){$('#phone-input').value=phoneDraft;phoneDraft='';}
    if($('#phone-form'))$('#phone-form').onsubmit=wrap(async e=>{e.preventDefault();const text=($('#phone-input')?.value||'').trim();if(!text||phoneBusy)return;phoneBusy=true;await renderMessages();
      try{phoneTalk=await talkApi(phoneTalk&&phoneTalk.status==='open'?{conversation_id:phoneTalk.id,text}:{character_id:who.id,channel:'phone',text});clearNotice('talk');}
      catch(err){phoneDraft=text;if([502,503,504].includes(err.status))showNotice('talk',t('play.grokDown'),()=>$('#phone-form')?.requestSubmit());throw err;}
      finally{phoneBusy=false;await renderMessages();$('#phone-input')?.focus();}});
    for(const b of $$('[data-phone-choice]'))b.onclick=()=>submitWith('#phone-input','#phone-form',b.dataset.phoneChoice);
    if($('#phone-ask-photo'))$('#phone-ask-photo').onclick=()=>submitWith('#phone-input','#phone-form',t('play.askPhoto'));
    // Pictures he sent: intimate ones stay blurred until tapped; videos play muted in a loop.
    for(const el of $$('[data-phone-reveal]'))el.onclick=()=>el.classList.remove('phone-blur');
    if($('#phone-end'))$('#phone-end').onclick=wrap(async()=>{phoneTalk=await api(`/api/play/conversations/${phoneTalk.id}/end`,{});toast(t('play.savedToast'));await renderMessages();});
    for(const b of $$('[data-invite-answer]'))b.onclick=wrap(async()=>{const r=await api('/api/play/invitations/'+b.dataset.inviteAnswer,{accept:b.dataset.accept==='1'});toast(r.status==='accepted'?t('play.invitationAccepted',{place:r.place,day:r.day,slot:r.slot}):t('play.invitationDeclined'));await renderMessages();});
  }
  // His invitation inside a phone message: where and when, and the answer buttons while it is open.
  function invitationBox(v){
    const state=v.status==='invited'?(v.passed?t('play.invitationPassed'):''):t('play.appt.'+v.status);
    return `<span class="phone-invite"><b>📅 ${esc(v.place)}</b> ${esc(v.day)} ${esc(v.slot)}${state?` <em>(${esc(state)})</em>`:''}${v.status==='invited'&&!v.passed?`<span class="phone-invite-actions"><button type="button" class="primary" data-invite-answer="${esc(v.id)}" data-accept="1">${t('play.invitationAccept')}</button><button type="button" class="subtle" data-invite-answer="${esc(v.id)}" data-accept="0">${t('play.invitationDecline')}</button></span>`:''}</span>`;
  }

  // Walking up to someone: he notices Palor and speaks first (one short AI reply).
  let showShared=false,sharedFor=[];
  const participantDetails=memoizedRead(id=>api('/api/play/known-character/'+encodeURIComponent(id)),{ttl:30000});
  function resumeTalk(){talkMinimized=false;if(talkChannel==='in_person'&&current?.node){mode='place';return render(root,{reuse:true});}renderTalk();$('#play-input')?.focus();}
  function inspectPerson(person){
    if(!person)return;
    const same=talkCharacter&&(talkCharacter.id===person.id||(groupTalk&&talk?.participants?.some(p=>p.id===person.id)));
    openPersonCard({person,esc,portrait,load:()=>participantDetails(person.id),canTalk:!talkCharacter||!!same,talkLabel:same?t('play.backToTalk'):t('play.addressPerson'),
      onTalk:wrap(()=>talkCharacter?resumeTalk():startTalk(person,'in_person')),
      onMessage:wrap(async()=>{phoneWith=person.id;phoneExtra={id:person.id,name:person.name,cover_id:person.cover_id,can_talk:true,unread:0};phoneTalk=null;mode='messages';await render(root,{reuse:true});}),
      onAlbum:wrap(()=>openAlbum(person))});
  }
  function bindTalkInput(){
    const input=$('#play-input'),form=$('#play-form');if(!input||!form)return;
    input.setAttribute('aria-describedby','play-input-help');
    bindGrowingInput(input,{submit:()=>form.requestSubmit(),lastLine:()=>[...(talk?.lines||[])].reverse().find(line=>line.speaker==='palor')?.text||''});
    if(!$('#play-input-help'))form.insertAdjacentHTML('afterend',`<small id="play-input-help" class="play-sr">${t('play.inputHelp')}</small>`);
  }
  function bindQuickChoices(){for(const button of $$('[data-quick]')){
    button.title=t(settings.quick_send?'play.quickImmediate':'play.quickEdit');
    button.onclick=e=>{if(settings.quick_send){if(e.detail<=1)submitWith('#play-input','#play-form',button.dataset.quick);}else{const input=$('#play-input');if(input){input.value=button.dataset.quick;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);}}};
    button.ondblclick=e=>{if(!settings.quick_send){e.preventDefault();submitWith('#play-input','#play-form',button.dataset.quick);}};
  }}
  async function startTalk(person,channel){
    talkMinimized=false;talkDraft='';conversationContext=null;const oldInput=$('#play-input');if(oldInput)oldInput.value='';
    talk=null;groupTalk=false;talkCharacter=person;talkChannel=channel;showHistory=false;showShared=false;sharedFor=[];autoSceneId=null;
    api('/api/play/shared-photos/'+person.id).then(r=>{if(talkCharacter?.id===person.id){sharedFor=r.photos;renderTalk();}}).catch(()=>{});
    if(channel!=='in_person'){renderTalk();refreshStage();$('#play-input')?.focus();return;}
    busy=true;renderTalk();refreshStage();
    try{conversationContext=await participantDetails(person.id).catch(()=>null);talk=await talkApi({character_id:person.id,channel,opener:true});if(talk.mood){moodBy.set(person.id,talk.mood);refreshStage();}}
    catch(e){toast(e.message,true);}
    finally{busy=false;renderTalk();$('#play-input')?.focus();}
  }
  // Redrawing the talk never loses what Palor is typing (2026-11-13): the draft and the focus are
  // carried over; a line that could not be sent comes back into the box (failedText).
  let failedText='',talkDraft='',talkMinimized=false,conversationContext=null;
  function renderTalk(){
    const input=document.getElementById('play-input'),draft=input?.value||'',focused=document.activeElement===input,caret=input?.selectionStart,end=input?.selectionEnd;
    if(input&&talkCharacter)talkDraft=draft;if(!talkCharacter)talkDraft='';
    renderTalkInner();
    const next=document.getElementById('play-input');
    if(next&&(talkDraft||failedText)){next.value=talkDraft||failedText;talkDraft=next.value;if(failedText)failedText='';}
    if(next)bindTalkInput();
    if(next&&focused){next.focus();if(Number.isFinite(caret))try{next.setSelectionRange(caret,Number.isFinite(end)?end:caret);}catch{}}
  }
  // The narrator ("Rendszer") answers outside the story: a box over the scene until closed.
  function showNarration(n){
    $('.play-narration')?.remove();
    const box=document.createElement('div');box.className='play-narration';box.setAttribute('role','status');
    box.innerHTML=`<header><b>⚙ ${esc(t('play.narrator'))}</b><button type="button" class="subtle" aria-label="${esc(t('common.close'))}">✕</button></header><p class="muted"><em>${esc(n.question)}</em></p><p>${esc(n.answer)}</p>`;
    box.querySelector('button').onclick=()=>box.remove();
    document.body.appendChild(box);
  }
  // Sends one line; on failure the text returns to the box and the notice offers another try.
  // The answer is stored in `talk` here, before the final redraw: with the caller assigning it
  // after the await, the redraw still showed the previous line and the talk seemed stuck (2026-11-14).
  async function sendLine(text,send){
    const box=document.getElementById('play-input');if(box)box.value='';
    talkDraft='';
    busy=true;renderTalk();
    try{const r=await send();clearNotice('talk');
      // "*Rendszer! …*": the narrator's answer is shown apart; an order alone leaves the talk as it was.
      if(r?.narration)showNarration(r.narration);
      if(r?.narration_only)return talk;
      talk=r;return r;}
    catch(e){failedText=text;if([502,503,504].includes(e.status)||/Grok/i.test(e.message||''))showNotice('talk',t('play.grokDown'),()=>{const b=document.getElementById('play-input');if(b&&b.value.trim())document.getElementById('play-form')?.requestSubmit();});throw e;}
    finally{busy=false;renderTalk();}
  }
  function renderTalkInner(){
    const scene=$('#vn-dialog');
    if(talkCharacter&&talkMinimized){
      if(scene){renderSceneDialog(scene);fitStage();paintDoors();}
      const box=$('#play-talk');if(box)paintTalkPill(box);return;
    }
    if(scene&&(!talkCharacter||talkChannel==='in_person')){$('#play-talk').innerHTML='';renderSceneDialog(scene);fitStage();paintDoors();return;}
    const box=$('#play-talk');if(!box)return;
    if(!talkCharacter){box.innerHTML='';return;}
    // A face-to-face talk while another screen is open (journal, map…): one small reminder that
    // leads back to it, instead of a second chat window (2026-11-13).
    if(talkChannel==='in_person'&&current?.node){
      paintTalkPill(box);
      return;
    }
    const lines=talk?.lines||[],ended=talk?.status==='closed';
    box.innerHTML=`<div class="play-talk"><div class="play-talk-head">${portrait(talkCharacter,'play-portrait small')}<b>${esc(talkCharacter.name)}</b><small>${talkChannel==='phone'?t('play.phone'):''}</small><button class="subtle" id="play-close" aria-label="${esc(t('common.closeDialog'))}">✕</button></div>
      <div class="play-log" id="play-log">${lines.map(l=>`<p class="play-line ${l.speaker==='palor'?'play-me':'play-them'}"><b>${l.speaker==='palor'?'Palor':esc(talkCharacter.name)}</b> ${esc(l.text)}</p>`).join('')}${busy?`<p class="play-line play-them"><b>${esc(talkCharacter.name)}</b> <span class="vn-typing">${t('play.waiting')}</span></p>`:''}
      ${ended&&talk.summary?`<div class="note">${t('play.saved')}: ${esc(talk.summary.summary||talk.summary.title)}${talk.summary.level_delta?` (${talk.summary.level_delta>0?'+':''}${talk.summary.level_delta})`:''}</div>`:''}</div>
      ${!ended&&talk?.leaving?`<p class="vn-leaving" role="status">🚪 ${esc(t('play.leaving',{text:talk.leaving}))}</p>`:''}
      ${ended?'':`<form id="play-form" class="play-form"><textarea id="play-input" aria-label="${esc(t('play.inputLabel'))}" rows="2" maxlength="2000" placeholder="${esc(t('play.placeholder'))}"></textarea><button class="primary" ${busy?'disabled':''}>${busy?t('play.waiting'):t('play.send')}</button>${talk?`<button type="button" id="play-end" class="subtle">${t('play.end')}</button>`:''}</form>`}</div>`;
    const log=$('#play-log');log.scrollTop=log.scrollHeight;
    if($('#play-close'))$('#play-close').onclick=()=>{talkCharacter=null;talk=null;renderTalk();};
    if($('#play-form')){
      $('#play-form').onsubmit=wrap(async e=>{e.preventDefault();const text=($('#play-input')?.value||'').trim();if(!text||busy)return;
        talk=await sendLine(text,()=>talkApi(talk?{conversation_id:talk.id,text}:{character_id:talkCharacter.id,channel:talkChannel,text}));});
      if($('#play-input'))$('#play-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#play-form')?.requestSubmit();}};
    }
    if($('#play-end'))$('#play-end').onclick=wrap(async()=>{busy=true;renderTalk();try{talk=await api(`/api/play/conversations/${talk.id}/end`,{});toast(talk.summary?.milestone?'★ '+talk.summary.milestone:t('play.savedToast'));}finally{busy=false;renderTalk();}});
  }
  function paintTalkPill(box){
    box.innerHTML=`<div class="play-talk-pill" role="status">${portrait(talkCharacter,'play-chip')}<span>${esc(t('play.talkOngoing',{name:talkCharacter.name}))}</span><button type="button" class="primary" id="play-talk-back">${t('play.backToTalk')}</button></div>`;
    $('#play-talk-back').onclick=wrap(resumeTalk);
    placeNotices();
  }
  return {render,commands,travelToPlace:id=>openPlace(id,true),leave:()=>{travelHints.hide();if(!studio)document.body.classList.remove('play-mode');synced=false;if(studio){root=null;data=null;clearTimeout(guestPoll);}}};
}

// Delegated hints survive map/scene updates. A long press consumes only its own
// click; short taps keep the existing navigation and travel behavior.
export function installTravelHints({active=()=>true,describe,doc=document,delay=430}){
  const selector='.lu-map [data-play-town], [data-town-pin], [data-door]';
  let hint=null,target=null,timer=null,press=null,blocked=null,blockedUntil=0,observer=null;
  const cancel=()=>{clearTimeout(timer);timer=null;press=null;};
  function hide(){
    observer?.disconnect();observer=null;
    if(target&&hint){const ids=(target.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==hint.id);if(ids.length)target.setAttribute('aria-describedby',ids.join(' '));else target.removeAttribute('aria-describedby');}
    hint?.remove();hint=null;target=null;
  }
  function show(el){
    if(!active()||!el?.isConnected)return;
    hide();target=el;hint=doc.createElement('div');hint.className='play-travel-hint';hint.id='play-travel-hint';hint.setAttribute('role','tooltip');
    const update=()=>{
      hint.textContent=describe(el);const r=el.getBoundingClientRect(),view=doc.defaultView;
      const box=hint.getBoundingClientRect(),w=view.innerWidth,h=view.innerHeight;
      hint.style.left=Math.max(8,Math.min(w-box.width-8,r.left+(r.width-box.width)/2))+'px';
      hint.style.top=Math.max(8,Math.min(h-box.height-8,r.bottom+8))+'px';
    };
    doc.body.appendChild(hint);el.setAttribute('aria-describedby',[(el.getAttribute('aria-describedby')||''),hint.id].filter(Boolean).join(' '));update();
    observer=new MutationObserver(update);observer.observe(el,{attributes:true,attributeFilter:['title','aria-label'],childList:true,characterData:true,subtree:true});
  }
  const match=e=>e.target.closest?.(selector);
  doc.addEventListener('pointerover',e=>{if(e.pointerType!=='touch'){const el=match(e);if(el&&el!==target)show(el);}});
  doc.addEventListener('pointerout',e=>{if(target&&!target.contains(e.relatedTarget))hide();});
  doc.addEventListener('focusin',e=>{const el=match(e);if(el)show(el);});
  doc.addEventListener('focusout',hide);
  doc.addEventListener('pointerdown',e=>{
    cancel();blocked=null;const el=match(e);if(!el||e.pointerType!=='touch'||!active())return;
    press={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;show(el);blocked=el;blockedUntil=Date.now()+30000;},delay);
  },true);
  doc.addEventListener('pointermove',e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10){cancel();hide();}},true);
  doc.addEventListener('pointerup',()=>{cancel();if(blocked)blockedUntil=Date.now()+1500;},true);
  doc.addEventListener('pointercancel',()=>{cancel();hide();blocked=null;},true);
  doc.addEventListener('contextmenu',e=>{if(blocked&&blocked.contains(e.target)&&Date.now()<blockedUntil)e.preventDefault();},true);
  doc.addEventListener('click',e=>{if(blocked&&blocked.contains(e.target)&&Date.now()<blockedUntil){e.preventDefault();e.stopImmediatePropagation();blocked=null;}},true);
  doc.addEventListener('scroll',()=>{cancel();hide();},true);
  doc.addEventListener('keydown',e=>{if(e.key==='Escape'){cancel();hide();}},true);
  doc.defaultView.addEventListener('resize',hide);
  return {hide:()=>{cancel();hide();}};
}

// A12: opening and cancelling this chooser are entirely local. The opener is sent
// only after a valid explicit selection is returned to startGroup.
export function chooseGroupParticipants(people,esc){
  const available=[...new Map(people.map(p=>[p.id,p])).values()];
  if(available.length<2)return Promise.resolve(null);
  const previous=document.activeElement;
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='play-group-picker';
    dialog.setAttribute('aria-labelledby','play-group-picker-title');dialog.setAttribute('aria-describedby','play-group-picker-hint');
    dialog.innerHTML=`<form><header><h2 id="play-group-picker-title">${t('play.groupChoose')}</h2><button type="button" data-group-cancel aria-label="${esc(t('common.closeDialog'))}">✕</button></header>
      <p id="play-group-picker-hint">${t('play.groupChooseHint')}</p><fieldset><legend>${t('play.groupPeople')}</legend>${available.map((p,i)=>`<label><input type="checkbox" value="${esc(p.id)}" ${i<4?'checked':''}><span>${esc(p.name)}</span></label>`).join('')}</fieldset>
      <p data-group-count role="status" aria-live="polite"></p><div class="dialog-footer"><button type="button" class="subtle" data-group-cancel>${t('common.cancel')}</button><button type="submit" class="primary" data-group-confirm>${t('play.groupBegin')}</button></div></form>`;
    let result=null;
    const boxes=[...dialog.querySelectorAll('input[type="checkbox"]')],submit=dialog.querySelector('[data-group-confirm]');
    const selected=()=>available.filter((p,i)=>boxes[i].checked);
    const update=()=>{const count=selected().length;submit.disabled=count<2||count>4;dialog.querySelector('[data-group-count]').textContent=t('play.groupSelected',{count});};
    for(const box of boxes)box.onchange=update;
    for(const button of dialog.querySelectorAll('[data-group-cancel]'))button.onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=event=>{event.preventDefault();update();if(submit.disabled)return;result=selected();dialog.close();};
    dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);},{once:true});
    update();document.body.appendChild(dialog);dialog.showModal();boxes[0]?.focus();
  });
}
