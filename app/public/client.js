import {createStudioReads,lazyScreen} from './studio-reads.js';
import {openAssetGeneration} from './asset-generation.js';
import {createGenerationWatcher} from './generation-jobs.js';
import {cancelUndoWindows,confirmBox,undoWindow,notify} from './interactions.js';
import './app-install.js';
import {parseAppRoute,appRouteHash,startupRoute,readStartupPreference} from './app-routes.js';
import {installWorldReviewUI} from './world-review.js';
import {requestJson,appendStatusRetry} from './api-json.js';
import {renderSystemErrors} from './system-error-summary.js';
import {compactCharacterSubtitle,matchesReadiness,sortReadyCharacters} from './character-readiness.js';
import {createSignalsWorker} from './media-signals.js';
import {raceOptions,bindNameSuggestion} from './character-options.js?v=instant-race-names-20261031-1';
import {approveCharacterReference,approvedReferenceUrl} from './character-reference-crops.js';
import {installPermanentDeleteUI} from './permanent-media-delete.js?v=bulk-20261031-1';
import {installGhostProfile} from './ghost-profile.js';
import {installLocationEditor} from './location-editor.js';
import {installCharacterGeneration} from './character-generation.js';
import {installEventTimeline} from './story-events.js';
import {installEnhancements} from './enhancements.js?v=character-race-20261031-1';
import {installSorting} from './sorting.js?v=album-delete-20261031-1';
import {installReconciliationUI} from './reconciliation.js';
import {installDuplicatesUI} from './duplicates.js';
import {installTaxonomyUI} from './taxonomy.js';
import {installSuggestionsUI} from './suggestions.js';
import {installLocationsUI} from './locations.js';
import {mediaFormPayload,refreshMediaReviewControls,retainMediaSearch} from './media-form.js';
import {t,locale,translateDocument,translateServerMessage} from './i18n.js';
import {installQuickTag} from './quick-tag.js';
import {installTrail} from './debug-trail.js';
import {installCharacterFactoryUI} from './character-factory.js';
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basename = p => p.split(/[\\/]/).pop();
// Stored values (roles, decisions, move states) stay English in the database; only their display is translated.
const roleName = role => ['face','body','detail','general'].includes(role)?t('role.'+role):role;
const decisionName = value => ['approved','rejected','unreviewed'].includes(value)?t('decision.'+value):value;
const moveStatusName = value => ['preparing','verified','catalogued','complete','source_retained','needs_review','interrupted'].includes(value)?t('moveStatus.'+value):value.replaceAll('_',' ');
const formatDate = value => new Date(value).toLocaleString(locale);
// Browser errors reach the server's error log (Rendszerállapot → Hibák), source "client", with
// the last steps of the debug trail (debug-trail.js) so they can be reproduced.
const trail=installTrail();
{const report=(message,stack,file)=>{let where='';try{where=view+(file?' · '+String(file).split('/').pop():'');}catch{}
  fetch('/api/dev/client-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:String(message||'').slice(0,2000),stack:String(stack||'').slice(0,2000),where,steps:trail.steps(20).map(s=>s.at.slice(11,19)+' '+s.kind+': '+s.text),request_id:trail.api(1)[0]?.request_id||null})}).catch(()=>{});};
 window.addEventListener('error',e=>report(e.message,e.error?.stack||(e.filename?e.filename+':'+e.lineno+':'+e.colno:''),e.filename));
 window.addEventListener('unhandledrejection',e=>{const r=e.reason;if(r?.status)return;report(r?.message||String(r),r?.stack,'');});}
translateDocument();
let state={characters:[],folders:[],stats:{media:0,inbox:0,images:0,videos:0}};
const worldReviewUI=installWorldReviewUI({api,openDialog,mediaDialog,toast,getState:()=>state,esc,createCharacter:hooks=>newCharacter('',hooks)});
let locationCanvas=null;
const ghostProfile=installGhostProfile({$,esc,api,action,toast});
const permanentDeleteUI=installPermanentDeleteUI({$,$$,api,toast,render});
const initialRoute=startupRoute(location.hash,readStartupPreference(localStorage));
let view=initialRoute.view,activeCharacter=initialRoute.cid,query=history.state?.lu?.query||'',folder='',kind='image',offset=0,profileTab=initialRoute.tab,pendingGhostReview=null;
let handledHash=location.hash,locationTab=initialRoute.placeTab||'tree',locationSelection=initialRoute.placeId||null;
const extras=installEnhancements({getActiveCharacter:()=>view==='profile'?activeCharacter:null,openCharacter:async cid=>{$('#dialog').close();await navigate('profile',cid);},$,$$,esc,api,action,toast,openDialog,refresh,render,mediaDialog,getState:()=>state,getView:()=>view,getKind:()=>kind,setKind:async value=>{kind=value;offset=0;if(view==='profile')await renderProfile();else await renderLibrary();}});
const tagging=installTaxonomyUI({$,$$,esc,api,action,toast,openDialog,refresh,reload:async reset=>{if(reset)offset=0;await (view==='profile'?renderProfile():renderLibrary());}});
const suggestionsUI=installSuggestionsUI({$,$$,esc,api,action,toast,openDialog,refresh,render,mediaDialog,getState:()=>state});
const places=installLocationsUI({getView:()=>view,$,$$,esc,api,openDialog,toast,refresh,render,mediaDialog,selectTag:id=>tagging.selectTag(id),reload:async reset=>{if(reset)offset=0;await (view==='profile'?renderProfile():renderLibrary());}});
const eventTimeline=installEventTimeline({$,$$,esc,api,action,toast,openDialog,getState:()=>state,openCharacter:cid=>navigate('profile',cid)});
const openGenerationJob=job=>job.kind?openAssetGeneration({kind:job.kind,targetId:job.target_id,api,onSaved:()=>render()}):navigate('profile',job.character_id,{tab:'generation'});
const generationWatcher=createGenerationWatcher({read:()=>api('/api/generation-jobs'),onUpdate:jobs=>{let chip=$('#generation-jobs-chip');if(!chip){chip=document.createElement('button');chip.id='generation-jobs-chip';chip.className='generation-jobs-chip';$('.topbar').append(chip);}const active=jobs.filter(job=>['running','generated'].includes(job.status));chip.hidden=!active.length;chip.textContent=t('gen.active',{count:active.reduce((sum,job)=>sum+(job.count||1),0)});chip.onclick=action(()=>openGenerationJob(active[0]));},onComplete:job=>{const notice=toast(t(job.kind?'gen.completedAsset':'gen.completed',{name:job.name,count:job.count||1}));const open=document.createElement('button');open.type='button';open.textContent=t('gen.view');open.onclick=action(async()=>{notice.remove();await openGenerationJob(job);});notice.card.append(open);}});
const characterGeneration=installCharacterGeneration({$,$$,esc,api,mediaDialog,onSaved:()=>generationWatcher.poll(),onOpenGallery:async cid=>navigate('profile',cid,{tab:'media'})});
const sorting=installSorting({onSelectionChange:items=>permanentDeleteUI.selection(items),afterFinish:mid=>duplicateReview.returnAfterSave(mid),locationDialog:ids=>places.bulk(ids),structuredTags:ids=>tagging.bulk(ids),$,$$,esc,api,action,toast,openDialog,refresh,render,mediaDialog,getState:()=>state,getView:()=>view,reload:()=>view==='profile'?renderProfile():renderLibrary(),resetPage:()=>{offset=0;}});
const folderReview=installReconciliationUI({$,$$,esc,api,action,toast,openDialog,render,refresh,foldersDialog,mediaDialog});
const quickTag=installQuickTag({$,$$,esc,api,toast,mediaDialog,getState:()=>state});
const mediaReview=lazyScreen(async()=>{const {installMediaReviewUI}=await import('./media-review.js');return installMediaReviewUI({$,$$,esc,api,toast} );});
const imageWorkshop=lazyScreen(async()=>{const {installImageWorkshopUI}=await import('./image-workshop.js');return installImageWorkshopUI({$,$$,esc,api,toast,mediaDialog:id=>mediaDialog(id),openProfile:cid=>navigate('profile',cid),openMediaReview:tab=>{mediaReview.show?.(tab);return navigate('media-review');},getState:()=>state} );});
const devTasksUI=lazyScreen(async()=>{const {installDevTasksUI}=await import('./dev-tasks.js');return installDevTasksUI({api,esc,toast} );});
const worldEngineUI=lazyScreen(async()=>{const {installWorldEngineUI}=await import('./world-engine.js');return installWorldEngineUI({$,$$,esc,api,toast,heading,openPlay:()=>navigate('play'),openProfile:(cid,tab)=>navigate('profile',cid,{tab})} );});
const devTools=lazyScreen(async()=>{const {installDevToolsUI}=await import('./dev-tools.js');return installDevToolsUI({$,$$,esc,api,toast,heading} );});
const characterFactory=installCharacterFactoryUI({$,$$,esc,api,toast,heading,openProfile:cid=>navigate('profile',cid)});
const identityUI=lazyScreen(async()=>{const {installIdentityUI}=await import('./identity.js');return installIdentityUI({$,$$,esc,api,toast,heading,openMedia:mid=>mediaDialog(mid)} );});
const playUI=lazyScreen(async()=>{const {installPlayUI}=await import('./play.js');return installPlayUI({$,$$,esc,api,toast,exit:()=>navigate('home'),openStudio:(tab,id)=>navigate('location-catalogue',null,{placeTab:tab,placeId:id}),openScreen:next=>navigate(next)} );});
const duplicateReview=installDuplicatesUI({$,$$,esc,api,action,toast,openDialog,mediaDialog,refresh,getState:()=>state});
const characterAlphabet='a á b c cs d dz dzs e é f g gy h i í j k l ly m n ny o ó ö ő p q r s sz t ty u ú ü ű v w x y z zs'.split(' ');
const characterLetterRank=new Map(characterAlphabet.map((letter,index)=>[letter,index]));
const characterNameOrder={compare(a,b){
  const letters=name=>name.normalize('NFC').toLocaleLowerCase('hu').match(/dzs|cs|dz|gy|ly|ny|sz|ty|zs|./gu)||[];
  const left=letters(a),right=letters(b);
  for(let i=0;i<Math.min(left.length,right.length);i++){
    const difference=(characterLetterRank.get(left[i])??(100+left[i].codePointAt(0)))-(characterLetterRank.get(right[i])??(100+right[i].codePointAt(0)));
    if(difference)return difference;
  }
  return left.length-right.length;
}};
let toastTimer;
let storageInfo=null; // resource-root info never changes while the app runs; fetched once.
// Success messages fade after a few seconds; errors stay until dismissed so they can't be missed.
function toast(message,error=false,retry=null){if(error)try{window.__luTrail?.error(message,'üzenet');}catch{}return notify(message,error,retry);}

const studioReads=createStudioReads({read:route=>requestJson(route)});
window.addEventListener('focus',()=>studioReads.invalidate());
async function api(route,data,method){const verb=method||(data?'POST':'GET');if(verb==='GET')return studioReads.get(route);studioReads.invalidate();try{return await requestJson(route,{method:verb,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});}finally{studioReads.invalidate();}}
function reportRequestError(err){toast(err.message||t('common.unexpected'),true,err.transport?async()=>{try{await render();}catch(next){reportRequestError(next);}}:null);}
function action(fn){return async e=>{try{await fn(e);}catch(err){reportRequestError(err);}};}
async function refresh(){state=await api('/api/state');state.characters.sort((a,b)=>characterNameOrder.compare(a.name,b.name));$('#character-count').textContent=state.characters.length;$('#inbox-count').textContent=state.stats.inbox;}
function openDialog(title,content){$('#dialog-content').innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button id="close-dialog" class="subtle" aria-label="${esc(t('common.closeDialog'))}">✕</button></div><div class="dialog-body">${content}</div>`;$('#close-dialog').onclick=()=>$('#dialog').close();if(!$('#dialog').open)$('#dialog').showModal();}
function heading(kicker,title,description,actions=''){return `<div class="heading"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="actions">${actions}</div></div>`;}
function cover(c,cls='portrait'){const coverUrl=c.cover_frame?'/api/characters/'+encodeURIComponent(c.id)+'/cover-frame?v='+encodeURIComponent(c.cover_frame.captured_at):'/thumb/'+encodeURIComponent(c.cover_id||'')+'?w=640';let crop=null;try{crop=JSON.parse(c.cover_crop||'null');}catch{}return `<div class="${cls}">${c.cover_id?crop&&crop.media_id===c.cover_id?`<canvas class="cover-canvas" data-cover-src="${coverUrl}" data-crop="${esc(JSON.stringify(crop))}" aria-label="${esc(t('cover.label',{name:c.name}))}"></canvas>`:`<img src="${coverUrl}" alt="${esc(c.name)}" loading="lazy">`:`<span class="monogram">${esc(c.name.slice(0,1))}</span>`}${cls==='portrait'?`<span class="badge">${t('cover.mediaBadge',{count:c.media_count||0})}</span>${c.is_group?`<span class="badge group-badge">${t('group.badge')}</span>`:''}`:''}</div>`;}
function bindImages(){for(const img of $$('img')){const unavailable=()=>{
  const card=img.closest('.canon-ref'),open=card?.querySelector('[data-open-ref]');
  const label=document.createElement(open?'button':'div');label.className=open?'broken-label reference-unavailable':'broken-label';label.textContent=t(open?'ref.unavailableOpen':'common.previewUnavailable');
  if(open){label.type='button';label.onclick=()=>open.click();}img.replaceWith(label);
};img.onerror=unavailable;if(img.complete&&!img.naturalWidth&&img.getAttribute('src'))unavailable();}extras.covers();}
let characterListReturn=null,navigationSequence=0;
async function navigate(next,cid=null,{restoreCharacterList=false,tab='profile',historyMode='push',scrollY=null,restoreQuery=null,placeTab='tree',placeId=null}={}){
  cancelUndoWindows();const sequence=++navigationSequence;
  const returning=next==='characters'&&restoreCharacterList?characterListReturn:null;
  if(view==='characters')characterListReturn=['profile','ghost-template'].includes(next)?{y:window.scrollY,query}:null;
  else if(!['profile','ghost-template'].includes(view))characterListReturn=null;
  await Promise.all([extras.flush(),ghostProfile.flush()]);if(sequence!==navigationSequence)return;
  if(historyMode==='push')history.replaceState({lu:{y:window.scrollY,query}},'',location.href);
  characterGeneration.cleanup();sorting.reset();places.reset();locationTab=placeTab;locationSelection=placeId;view=next;activeCharacter=cid;query=restoreQuery??returning?.query??'';folder='';kind='image';offset=0;profileTab=['profile','media','canon','events','generation'].includes(tab)?tab:'profile';
  const hash=appRouteHash({view,cid:activeCharacter,tab:profileTab,placeTab:locationTab,placeId:locationSelection});
  if(historyMode!=='none'&&location.hash!==hash)history[historyMode==='replace'?'replaceState':'pushState']({lu:{y:scrollY??returning?.y??0,query}},'',hash);
  handledHash=location.hash;
  await render();
  // Rendering a profile includes its asynchronous fields. Scroll only when the destination
  // has its final height, and never let an older navigation move the newer screen.
  if(sequence===navigationSequence)window.scrollTo({top:scrollY??returning?.y??0,left:0,behavior:'instant'});
}
async function render(){
  locationCanvas?.destroy();locationCanvas=null;
  if(view!=='tasks')devTasksUI.leave();
  if(view!=='play')playUI.leave();
  if(view!=='media-review')mediaReview.leave();
  if(view!=='image-workshop')imageWorkshop.leave();
  if(view!=='system')devTools.leave();
  if(view!=='identity')identityUI.leave();
  if(view!=='factory')characterFactory.leave();
  if(view!=='profile')ghostProfile.cleanup();
  extras.cleanupPreviews();
  await refresh();for(const b of $$('#navigation button'))b.classList.toggle('active',b.dataset.view===(view==='profile'||view==='ghost-template'?'characters':view));
  $('#breadcrumb').textContent=t('view.'+view);
  if(view==='ghost-template')await renderTemplateCharacter();else if(view==='characters')await renderCharacters();else if(view==='profile')await renderProfile();else if(view==='tasks')await devTasksUI.render($('#content'));else if(view==='world')await renderWorld();else if(view==='play')await playUI.render($('#content'));else if(view==='home')await renderHome();else if(view==='quick-tag')await quickTag.render($('#content'));else if(view==='media-review')await mediaReview.render($('#content'));else if(view==='image-workshop')await imageWorkshop.render($('#content'));else if(view==='location-catalogue')await renderLocationCanvas();else if(view==='system')await devTools.render($('#content'));else if(view==='identity')await identityUI.render($('#content'));else if(view==='factory')await characterFactory.render($('#content'));else await renderLibrary();bindImages();
  if(view!=='home')void refreshBadges();
}
// Menu badges: open jobs on Kezdőlap, an unapproved place plan on Helyszínek, pictures
// waiting on Gyors címkézés. Refreshed at most once a minute (the home page always updates them).
let badgesAt=0;
function paintBadges(s,tidy){
  const jobs=[s.identity.single,s.identity.pair,s.identity.other,s.locations.untagged,state.stats.inbox,tidy?.no_cover.length,tidy?.group_covers?.length,tidy?.no_profile.length,tidy?.ghost_pending.length,tidy?.tree_draft?1:0,tidy?.removed.count].filter(n=>n>0).length;
  const home=$('#home-count'),flag=$('#locations-flag'),quick=$('#quick-tag-count'),waiting=s.identity.pictures+s.locations.untagged;
  home.hidden=!jobs;home.textContent=jobs;home.title=t('nav.homeBadge',{count:jobs});
  flag.hidden=!tidy?.tree_draft;flag.title=t('nav.treeDraft');
  quick.hidden=!waiting;quick.textContent=waiting;quick.title=t('nav.quickTagBadge',{count:waiting});
  badgesAt=Date.now();
}
async function refreshBadges(){
  if(Date.now()-badgesAt<60000)return;badgesAt=Date.now();
  try{const [s,tidy]=await Promise.all([api('/api/quick-tag/summary'),api('/api/tidy')]);paintBadges(s,tidy);}catch{}
}
let characterFilter='all',characterSort='name';
async function renderCharacters(){
  let statusError=null,statuses=new Map();
  try{const result=await api('/api/characters/readiness');statuses=new Map((Array.isArray(result.characters)?result.characters:[]).map(status=>[status.id,status]));}catch(error){statusError=error;}
  if(view!=='characters')return;
  const order=sortReadyCharacters(state.characters,statuses,characterSort);
  const subtitle=c=>{const status=statuses.get(c.id),text=compactCharacterSubtitle(c.aliases,status?.occupation);return text||t(status?.profile_filled===0?'characters.emptyProfile':'characters.subtitleUnknown');};
  const badges=c=>{const status=statuses.get(c.id);if(!status)return '<span class="character-ready-badge">'+t('characters.readinessUnknown')+'</span>';
    return '<span class="character-ready-badge">'+t('characters.profilePercent',{percent:status.profile_percent})+'</span>'+
      ['figures','routine','home','known'].map(kind=>{if(kind==='known'&&status.is_palor)return '<span class="character-ready-badge ready">'+t('characters.badge.palor')+'</span>';const present={figures:status.figures>0,routine:status.has_routine,home:status.has_home,known:status.knows_palor}[kind];return '<span class="character-ready-badge '+(present?'ready':'missing')+'">'+t('characters.badge.'+kind+'.'+(present?'yes':'no'))+'</span>';}).join('');};
  $('#content').innerHTML=heading(t('characters.kicker'),t('characters.title'),t('characters.lead'),'<button id="folders-button" class="subtle">'+t('characters.organizeFolders')+'</button><button id="add-character" class="primary">'+t('characters.new')+'</button>')+
    '<div class="metrics"><div class="metric"><b>'+state.characters.length+'</b><span>'+t('metric.characters')+'</span></div><div class="metric"><b>'+state.stats.images+'</b><span>'+t('metric.pictures')+'</span></div><div class="metric"><b>'+state.stats.videos+'</b><span>'+t('metric.videos')+'</span></div><div class="metric"><b>'+state.stats.inbox+'</b><span>'+t('metric.inbox')+'</span></div></div>'+
    (!state.stats.media?'<div class="onboarding"><div><strong>'+t('onboarding.title')+'</strong><p>'+t('onboarding.text')+'</p></div><button id="scan-button" class="primary">'+t('onboarding.button')+'</button></div>':'')+
    '<div class="toolbar"><input id="character-search" aria-label="'+esc(t('characters.searchLabel'))+'" placeholder="'+esc(t('characters.searchPlaceholder'))+'" value="'+esc(query)+'"><label>'+t('characters.filterLabel')+'<select id="character-filter">'+['all','empty','figure','routine','home','known','unknown'].map(value=>'<option value="'+value+'"'+(value===characterFilter?' selected':'')+'>'+t('characters.filter.'+value)+'</option>').join('')+'</select></label><label>'+t('characters.sortLabel')+'<select id="character-sort">'+['name','profile-desc','profile-asc','missing'].map(value=>'<option value="'+value+'"'+(value===characterSort?' selected':'')+'>'+t('characters.sort.'+value)+'</option>').join('')+'</select></label><span class="count"></span></div><div id="character-readiness-status" role="status"></div>'+
    (state.characters.length?'<p id="no-character-match" class="muted" hidden>'+t('characters.noMatch')+'</p><div class="character-grid">'+order.map(c=>'<a class="character-card" href="'+appRouteHash({view:'profile',cid:c.id})+'" data-character="'+c.id+'">'+cover(c)+'<div class="card-info"><b>'+esc(c.name)+'</b><small class="character-subtitle" title="'+esc([c.aliases,statuses.get(c.id)?.occupation].filter(Boolean).join(' — '))+'">'+esc(subtitle(c))+'</small><span class="character-ready-badges">'+badges(c)+'</span></div></a>').join('')+'</div>':'<div class="empty"><div class="symbol">◈</div><h2>'+t('characters.emptyTitle')+'</h2><p>'+t('characters.emptyText')+'</p><button id="empty-add" class="subtle">'+t('characters.createManually')+'</button></div>')+
    '<div class="panel template-character-panel"><button id="open-template-character" class="subtle">'+t('characters.template')+'</button><p>'+t('characters.templateText')+'</p></div>';
  $('#open-template-character').onclick=action(()=>navigate('ghost-template'));
  $('#add-character').onclick=action(()=>newCharacter());$('#folders-button').onclick=action(()=>foldersDialog());if($('#scan-button'))$('#scan-button').onclick=action(scanMedia);if($('#empty-add'))$('#empty-add').onclick=action(()=>newCharacter());
  const cards=new Map($$('[data-character]').map(card=>[card.dataset.character,card]));
  const apply=()=>{const q=query.toLocaleLowerCase('hu');let shown=0;for(const c of state.characters){const card=cards.get(c.id),match=(c.name+' '+c.aliases).toLocaleLowerCase('hu').includes(q)&&matchesReadiness(statuses.get(c.id),characterFilter);if(card)card.hidden=!match;shown+=match;}
    $('.toolbar .count').textContent=t('characters.count',{count:shown});if($('#no-character-match'))$('#no-character-match').hidden=shown>0;
  };
  $('#character-search').oninput=e=>{query=e.target.value;apply();};$('#character-filter').onchange=e=>{characterFilter=e.target.value;apply();};
  $('#character-sort').onchange=e=>{characterSort=e.target.value;const grid=$('.character-grid');if(grid)for(const c of sortReadyCharacters(state.characters,statuses,characterSort))grid.appendChild(cards.get(c.id));};
  for(const card of cards.values())card.onclick=action(async event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();await navigate('profile',card.dataset.character);});
  if(statusError){const host=$('#character-readiness-status');host.textContent=statusError.message;appendStatusRetry(host,()=>renderCharacters());}
  apply();
}
async function renderTemplateCharacter(){await ghostProfile.renderTemplate($('#content'),()=>navigate('characters',null,{restoreCharacterList:true}));}
function genderOptions(){return `<option value="">${t('common.choose')}</option><option value="férfi">${t('gender.male')}</option><option value="hím">${t('gender.animalMale')}</option><option value="nem-bináris">${t('gender.nonbinary')}</option>`;}
function newCharacter(initial='',hooks={}){
  openDialog(t('newCharacter.title'),`<form id="new-character-form" class="form-grid"><label>${t('newCharacter.name')}<input name="name" required maxlength="200" value="${esc(initial)}" placeholder="${esc(t('newCharacter.namePlaceholder'))}" autofocus></label><label>${t('newCharacter.gender')}<select name="gender">${genderOptions()}</select></label><p class="muted">${t('newCharacter.hint')}</p><div class="dialog-footer"><button class="primary">${t('newCharacter.submit')}</button></div></form>`);
  if(hooks.onCancel){$('#new-character-form .dialog-footer').insertAdjacentHTML('beforeend',`<button type="button" id="new-character-review-cancel">${t('newCharacter.backToReview')}</button>`);$('#new-character-review-cancel').onclick=hooks.onCancel;$('#close-dialog').onclick=hooks.onCancel;$('#dialog').oncancel=event=>{event.preventDefault();hooks.onCancel();};}
  $('#new-character-form').onsubmit=action(async e=>{e.preventDefault();const c=await api('/api/characters',{name:new FormData(e.target).get('name'),gender:new FormData(e.target).get('gender')});if(hooks.onCreated){await refresh();await hooks.onCreated(c);}else{$('#dialog').close();await navigate('profile',c.id);}toast(t('newCharacter.created'));});
}
async function scanMedia(e){const button=e?.currentTarget;if(button){button.disabled=true;button.textContent=t('scan.running');}toast(t('scan.started'));try{const result=await api('/api/scan',{});await render();toast(t('scan.result',{new:result.new,modified:result.modified,missing:result.missing,moved:result.potentially_moved}));await folderReview.report(result.modified?'modified':result.missing?'missing':'new');}finally{if(button?.isConnected){button.disabled=false;button.textContent=t('scan.findNew');}}}
async function folderNamesDialog(){
  const data=await api('/api/folder-names');const ready=data.plans.filter(p=>!p.blocked);
  openDialog(t('folderNames.title'),`<p>${t('folderNames.intro')}</p>${data.plans.map(p=>`<div class="scan-file"><span><b>${esc(p.source)}</b> → <b>${esc(p.destination)}</b><small>${t('folderNames.files',{count:p.file_count})} · ${p.blocked?esc(p.blocked):p.merge?t('folderNames.merge'):t('folderNames.rename')}</small></span></div>`).join('')||`<p>${t('folderNames.allMatch')}</p>`}<details><summary>${t('folderNames.unmapped',{count:data.unmapped.length})}</summary>${data.unmapped.map(f=>`<p>${esc(f.folder)} · ${esc(f.reason)}</p>`).join('')}</details><div id="folder-sync-status" role="status"></div><button id="folder-names-apply" class="primary" ${ready.length?'':'disabled'}>${t('folderNames.apply',{count:ready.length})}</button>`);
  $('#folder-names-apply').onclick=action(async e=>{e.currentTarget.disabled=true;$('#folder-sync-status').textContent=t('folderNames.running');try{const result=await api('/api/folder-names/sync',{token:data.token});await render();await folderNamesDialog();$('#folder-sync-status').textContent=t('folderNames.done',{done:result.completed.length,errors:result.errors.length,backup:result.backupPath||t('folderNames.noChanges')});}finally{if(e.currentTarget?.isConnected)e.currentTarget.disabled=false;}});
}
async function foldersDialog(){
  await refresh();openDialog(t('folders.title'),`<p>${t('folders.intro')}</p><div class="note">${t('folders.note')}</div><div class="actions"><button id="sort-selected" class="primary" disabled>${t('folders.previewSelected')}</button><button id="scan-again">${t('scan.findNew')}</button><button id="to-inbox" class="subtle">${t('folders.openInbox')}</button></div><p id="folder-sort-result" role="status" class="saved"></p><div class="folder-list">${state.folders.length?state.folders.map((f,i)=>`<div class="folder-row quick-folder-row" data-folder-row="${i}"><div><label class="folder-choice">${f.folder?`<input type="checkbox" data-select-folder="${i}" aria-label="${esc(t('folders.select',{folder:f.folder}))}">`:''}<strong>${esc(f.folder||t('folders.loose'))}</strong></label><small>${t('folders.count',{count:f.count})}</small></div><div>${f.folder?`<button class="primary" data-quick-sort="${i}">${t('folders.preview')}</button>`:`<span class="muted">${t('folders.sortIndividually')}</span>`}<details class="folder-options"><summary>${t('folders.other')}</summary><div class="form-grid"><select aria-label="${esc(t('folders.chooseExisting'))}" data-existing="${i}"><option value="">${t('folders.createFromName')}</option>${state.characters.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input data-name="${i}" aria-label="${esc(t('folders.newName'))}" maxlength="200" value="${esc(f.folder)}" placeholder="${esc(t('newCharacter.name'))}"><button data-assign-folder="${i}">${t('folders.previewAssignment')}</button></div></details></div></div>`).join(''):`<p>${t('folders.empty')}</p>`}</div>`);
  $('#scan-again').insertAdjacentHTML('afterend',`<button id="folder-name-sync">${t('folders.syncNames')}</button>`);$('#folder-name-sync').onclick=action(folderNamesDialog);$('#scan-again').onclick=action(scanMedia);$('#to-inbox').onclick=action(async()=>{$('#dialog').close();await navigate('inbox');});
  async function quickSort(indices){
    await folderReview.preview(indices.map(i=>state.folders[i].folder));
  }
  for(const b of $$('[data-quick-sort]'))b.onclick=action(()=>quickSort([Number(b.dataset.quickSort)]));
  for(const box of $$('[data-select-folder]'))box.onchange=()=>{const count=$$('[data-select-folder]:checked').length;$('#sort-selected').disabled=!count;$('#sort-selected').textContent=count?t('folders.sortCount',{count}):t('folders.previewSelected');};
  $('#sort-selected').onclick=action(()=>quickSort($$('[data-select-folder]:checked').map(box=>Number(box.dataset.selectFolder))));
  for(const b of $$('[data-assign-folder]'))b.onclick=action(async()=>{const i=Number(b.dataset.assignFolder),cid=$(`[data-existing="${i}"]`).value,name=$(`[data-name="${i}"]`).value.trim();if(!cid&&!name)throw Error(t('folders.nameRequired'));await folderReview.preview([{folder:state.folders[i].folder,character_id:cid||null,name:cid?'':name}]);});
}
function mediaCard(m){return `<button class="media-card" data-media="${m.id}"><div class="media-preview">${m.kind==='image'?`<img src="/thumb/${m.id}?w=640" alt="${esc(basename(m.relative_path))}" loading="lazy">`:`<video src="/media/${m.id}" preload="none" muted aria-label="${esc(t('media.videoPreview'))}"></video><span class="badge">${t('media.videoBadge')}</span>`}${m.canonicalFor.length?`<span class="badge">${t('media.approvedBadge')}</span>`:''}</div><div class="media-caption" title="${esc(m.relative_path)}">${esc(basename(m.relative_path))}<small>${esc(m.characters.map(c=>c.name).join(' · ')||t('media.needsSorting'))}</small><small class="media-source-folder">${esc(m.folder||t('media.resourceRoot'))}</small></div></button>`;}
function bindMedia(){worldReviewUI.listing();for(const b of $$('[data-media]'))b.onclick=action(()=>mediaDialog(b.dataset.media));bindImages();extras.listing();sorting.listing();tagging.listing().catch(e=>toast(e.message,true));places.listing().catch(e=>toast(e.message,true));}
function filters(){return `<div class="toolbar"><input id="media-search" aria-label="${esc(t('filters.searchLabel'))}" placeholder="${esc(t('filters.searchPlaceholder'))}" value="${esc(query)}"><select id="kind-filter" aria-label="${esc(t('filters.kind'))}"><option value="">${t('filters.all')}</option><option value="image" ${kind==='image'?'selected':''}>${t('filters.images')}</option><option value="video" ${kind==='video'?'selected':''}>${t('filters.videos')}</option></select><select id="folder-filter" aria-label="${esc(t('filters.folder'))}"><option value="">${t('filters.allFolders')}</option>${state.folders.map(f=>`<option value="${esc(f.folder||'__root__')}" ${folder===(f.folder||'__root__')?'selected':''}>${esc(f.folder||t('filters.loose'))}</option>`).join('')}</select></div>`;}
function mediaViewContext(){return JSON.stringify([view,activeCharacter,profileTab]);}
function mediaContext(){return JSON.stringify([view,activeCharacter,profileTab,query,kind,folder,offset,sorting.getStatus(),tagging.getFilter(),places.getFilter()]);}
async function fetchMedia(cid){const context=mediaContext();const params=new URLSearchParams({offset,search:query,kind,status:sorting.getStatus(),structured_tag:tagging.getFilter(),location_id:places.getFilter()});if(cid)params.set('character',cid);if(view==='inbox')params.set('inbox','1');if(view==='locations')params.set('role','location');if(folder)params.set('folder',folder==='__root__'?'':folder);const result=await api('/api/media?'+params);if(context!==mediaContext())return null;if(offset&&offset>=result.total){offset=result.total?Math.floor((result.total-1)/48)*48:0;return fetchMedia(cid);}const scope=JSON.stringify([view,cid||'',query,kind,folder,offset,sorting.getStatus(),tagging.getFilter(),places.getFilter()]);params.set('ids_only','1');sorting.setPage(result.items,'/api/media?'+params,scope);return result;}
function pager(total){return total?`<div class="pager"><button id="prev-page" ${offset===0?'disabled':''}>${t('common.previous')}</button><span>${t('common.pageRange',{from:offset+1,to:Math.min(offset+48,total),total})}</span><button id="next-page" ${offset+48>=total?'disabled':''}>${t('common.next')}</button></div>`:'';}
function bindFilters(reload,restoreSearch=()=>{}){restoreSearch($('#media-search'));const search=$('#media-search');search.oninput=e=>{query=e.target.value;clearTimeout(search._searchTimer);search._searchTimer=setTimeout(action(async()=>{if(!search.isConnected)return;offset=0;await reload();}),350);};$('#kind-filter').onchange=action(async e=>{kind=e.target.value;offset=0;await reload();});$('#folder-filter').onchange=action(async e=>{folder=e.target.value;offset=0;await reload();});if($('#prev-page'))$('#prev-page').onclick=action(async()=>{offset=Math.max(0,offset-48);await reload();});if($('#next-page'))$('#next-page').onclick=action(async()=>{offset+=48;await reload();});}
async function renderLibrary(){const data=await fetchMedia();if(!data)return;const restoreSearch=retainMediaSearch($('#media-search'));$('#content').innerHTML=heading(t('library.kicker'),t('view.'+(view==='inbox'||view==='locations'?view:'library')),view==='inbox'?t('library.inboxLead'):view==='locations'?t('library.locationsLead'):t('library.libraryLead'),`<button id="library-folders" class="subtle">${t('characters.organizeFolders')}</button><button id="library-scan" class="primary">${t('scan.findNew')}</button>`)+filters()+`<div class="section-title"><span class="muted">${t('library.matching',{count:data.total})}</span></div>`+(data.items.length?`<div class="media-grid">${data.items.map(mediaCard).join('')}</div>`:`<div class="empty"><div class="symbol">▧</div><h2>${view==='inbox'?t('library.inboxEmptyTitle'):t('library.emptyTitle')}</h2><p>${view==='inbox'?t('library.inboxEmptyText'):t('library.emptyText')}</p></div>`)+pager(data.total);$('#library-scan').onclick=action(scanMedia);$('#library-folders').onclick=action(foldersDialog);bindFilters(renderLibrary,restoreSearch);bindMedia();}
// Proposed relationship lines (e.g. the first meeting with Palor). Accepting appends to the owner's
// text on the server; nothing is shown when there is nothing to decide.
async function relationshipSuggestions(c){
  const host=$('#relationship-suggestions');if(!host)return;
  let items=[];try{items=(await api('/api/characters/'+c.id+'/relationship-suggestions')).items;}catch{return;}
  if(!host.isConnected||!items.length)return;
  host.innerHTML=items.map(s=>`<div class="pf-pending rel-suggestion"><div class="pf-pending-text"><strong>Kapcsolati javaslat · ${esc(s.target_name)}</strong><small>${esc(s.text)}</small></div><div class="pf-pending-actions"><button type="button" class="primary" data-rel-accept="${s.id}">Hozzáadom</button><button type="button" data-rel-dismiss="${s.id}">Elvetem</button></div></div>`).join('');
  for(const b of host.querySelectorAll('[data-rel-accept],[data-rel-dismiss]'))b.onclick=action(async()=>{const id=b.dataset.relAccept||b.dataset.relDismiss;await api('/api/relationship-suggestions/'+id+'/decision',{decision:b.dataset.relAccept?'accept':'dismiss'});toast(b.dataset.relAccept?'A kapcsolathoz hozzáadva.':'Javaslat elvetve.');await refresh();await renderProfile();});
}
async function renderProfile(){
  await Promise.all([extras.flush(),ghostProfile.flush()]);
  characterGeneration.cleanup();
  const profileContext=mediaViewContext();const c=await api('/api/characters/'+activeCharacter);if(profileContext!==mediaViewContext())return;const data=profileTab==='media'?await fetchMedia(c.id):null;if(profileContext!==mediaViewContext()||(profileTab==='media'&&!data))return;const restoreSearch=retainMediaSearch($('#media-search'));const approved=c.canon?JSON.parse(c.canon.references_json):[];
  const newShell=$('#content').dataset.profileId!==c.id||!$('#profile-content');
  if(newShell){$('#content').innerHTML=heading(t('profile.kicker'),c.name,c.aliases||t('profile.noAliases'),`<button id="back-characters" class="subtle">${t('profile.back')}</button>${c.deletion_block===null?`<button id="delete-empty-character" class="danger">${t('profile.delete')}</button>`:''}`)+`<div class="tabs"><button id="profile-tab" class="${profileTab==='profile'?'active':''}">${t('tabs.profile')}</button><button id="collection-tab" class="${profileTab==='media'?'active':''}">${t('tabs.media')}</button><button id="events-tab" class="${profileTab==='events'?'active':''}">${t('tabs.events')}</button><button id="canon-tab" class="${profileTab==='canon'?'active':''}">${t('tabs.canon',{count:approved.length})}</button><button id="generation-tab" class="${profileTab==='generation'?'active':''}">${t('tabs.generation')}</button></div><div id="profile-content"></div>`;$('#content').dataset.profileId=c.id;}else{$('#content .heading h1').textContent=c.name;$('#canon-tab').textContent=t('tabs.canon',{count:approved.length});}
  for(const [id,tab] of [['profile-tab','profile'],['collection-tab','media'],['canon-tab','canon'],['events-tab','events'],['generation-tab','generation']])$('#'+id).classList.toggle('active',profileTab===tab);
  if($('#delete-empty-character'))$('#delete-empty-character').onclick=()=>deleteEmptyCharacter(c);
  $('#back-characters').onclick=action(()=>navigate('characters',null,{restoreCharacterList:true}));for(const [sel,tab] of [['#profile-tab','profile'],['#collection-tab','media'],['#canon-tab','canon'],['#events-tab','events'],['#generation-tab','generation']])$(sel).onclick=action(()=>navigate('profile',c.id,{tab}));
  if(newShell){$('.cf-profile-line')?.remove();void characterFactory.profileStatus(c.id,$('.tabs'));}
  if(profileTab==='generation'){await characterGeneration.render(c);return;}
  if(profileTab==='events'){await eventTimeline.render(c);return;}
  if(profileTab==='media'){$('#profile-content').innerHTML=filters()+(data.items.length?`<div class="media-grid">${data.items.map(mediaCard).join('')}</div>`:`<div class="empty"><h2>${t('profile.noMediaTitle')}</h2><p>${t('profile.noMediaText')}</p></div>`)+pager(data.total);bindFilters(renderProfile,restoreSearch);bindMedia();return;}
  if(profileTab==='canon'){await renderCanon(c,approved);return;}
  // Owner layout (2026-11-15): compact header (portrait, names, pending proposals), one profile
  // editor below, relationships and notes folded away. No explanatory boilerplate.
  $('#profile-content').innerHTML=`<section class="panel profile-head">${cover(c,'profile-cover')}<div class="profile-head-main"><form id="profile-form" class="profile-head-fields"><label class="pf-name">${t('profile.name')}<span><input name="name" readonly required maxlength="200" value="${esc(c.name)}"><a href="/character-rename.html?character=${encodeURIComponent(c.id)}" title="${esc(t('profile.renameLink'))}">Átnevezés</a></span></label><label class="pf-aliases">${t('profile.aliases')}<input name="aliases" value="${esc(c.aliases)}" placeholder="${esc(t('profile.aliasesPlaceholder'))}"></label><label class="pf-race">${t('profile.race')}<select name="race">${raceOptions(c.race)}</select></label><label class="pf-group-toggle"><input type="checkbox" id="character-is-group" ${c.is_group?'checked':''}> ${t('group.toggle')}</label><details class="pf-notes"><summary>${t('profile.notes')}</summary><textarea name="notes" placeholder="${esc(t('profile.notesPlaceholder'))}">${esc(c.notes)}</textarea></details><span id="save-status" class="saved"></span><span id="group-status" class="saved" role="status"></span></form><div id="ghost-pending"></div><div id="relationship-suggestions"></div></div></section><div id="structured-profile"></div><details class="panel pf-relationships"><summary>${t('profile.relationships')} · ${c.relationships.length}</summary><div class="pf-relationships-body">${c.relationships.length?c.relationships.map(r=>`<div class="relationship"><b>${esc(r.target_name)}</b><div>${esc(r.description)}</div><button data-edit-relationship="${r.target_id}" class="subtle">${t('common.edit')}</button></div>`).join(''):`<p>${t('profile.noRelationships')}</p>`}<button id="add-relationship" class="subtle">${t('profile.addRelationship')}</button></div></details>`;
  // Every header field autosaves (enhancements.profile); there is no form-wide submit any more.
  $('#profile-form').onsubmit=e=>e.preventDefault();
  $('#character-is-group').onchange=action(async e=>{const box=e.target;box.disabled=true;try{await api('/api/characters/'+c.id+'/group',{group:box.checked});await refresh();$('#group-status').textContent=box.checked?t('group.marked'):t('group.unmarked');}catch(err){box.checked=!box.checked;throw err;}finally{box.disabled=false;}});
  $('#add-relationship').onclick=()=>relationshipDialog(c);for(const b of $$('[data-edit-relationship]'))b.onclick=()=>relationshipDialog(c,c.relationships.find(r=>r.target_id===b.dataset.editRelationship));bindImages();extras.profile(c);
  void relationshipSuggestions(c);
  const reviewId=pendingGhostReview;pendingGhostReview=null;
  await ghostProfile.render(c,reviewId,$('#structured-profile'),{pendingHost:$('#ghost-pending'),onChanged:async id=>{pendingGhostReview=id??null;await renderProfile();}});
}
function deleteEmptyCharacter(c){
  openDialog(t('delete.title'),`<form id="delete-character-form" class="form-grid"><p>${t('delete.confirm',{name:esc(c.name)})}</p><p id="delete-character-status" role="status"></p><div class="dialog-footer"><button type="button" id="delete-character-cancel">${t('common.cancel')}</button><button class="danger">${t('delete.submit')}</button></div></form>`);
  $('#delete-character-cancel').onclick=()=>$('#dialog').close();
  $('#delete-character-form').onsubmit=async e=>{e.preventDefault();const button=$('button.danger',e.target);button.disabled=true;try{await api('/api/characters/'+encodeURIComponent(c.id),undefined,'DELETE');$('#dialog').close();await refresh();await navigate('characters');toast(t('delete.done'));}catch(err){$('#delete-character-status').textContent=err.message;$('#delete-character-status').className='error';button.disabled=false;}};
}
function relationshipDialog(c,existing){const choices=state.characters.filter(x=>x.id!==c.id);openDialog(t('relationship.title'),`<form id="relationship-form" class="form-grid"><label>${t('relationship.target')}<select name="target_id" required>${choices.map(x=>`<option value="${x.id}" ${existing?.target_id===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>${t('relationship.perspective',{name:esc(c.name)})}<textarea name="description" placeholder="${esc(t('relationship.placeholder'))}">${esc(existing?.description||'')}</textarea><small>${t('relationship.hint')}</small></label><div class="dialog-footer"><button class="primary" ${choices.length?'':'disabled'}>${t('relationship.save')}</button></div></form>`);$('#relationship-form').onsubmit=action(async e=>{e.preventDefault();await api('/api/relationships',{source_id:c.id,...Object.fromEntries(new FormData(e.target)),expected:c.relationships.find(r=>r.target_id===new FormData(e.target).get('target_id'))?.description??null});$('#dialog').close();await renderProfile();toast(t('relationship.saved'));});}
function referenceCard(c,r){const file=(c.reference_media||[]).find(m=>m.id===r.media_id);const video=file?.kind==='video';const inactive=file&&file.active===false;const preview=video||inactive?`<div class="note">${video?t('ref.video'):t('ref.inactive')}${file?.basename?' · '+esc(file.basename):''}</div>`:`<img src="${approvedReferenceUrl(c.id,r,c.canon?.id)}" alt="${esc(t('ref.approvedAlt'))}">`;const note=video?t('ref.noteVideo'):inactive?t('ref.noteInactive'):'';return `<div class="canon-ref">${preview}<span>${esc(t('ref.label',{role:roleName(r.role),note}))}</span><button data-open-ref="${r.media_id}" class="subtle">${t('common.view')}</button><button data-remove-ref="${r.reference_id||r.media_id}" class="subtle" aria-label="${esc(t('ref.remove'))}">✕</button></div>`;}
async function renderCanon(c,refs){
  const videoCount=(c.reference_media||[]).filter(m=>m.kind==='video').length;
  $('#profile-content').innerHTML=`<div class="profile-layout"><div class="panel"><div class="eyebrow">${t('canon.kicker')}</div><h2>${t('canon.refsTitle')}</h2><p>${t('canon.refsIntro')}</p>${refs.map(r=>referenceCard(c,r)).join('')||`<p>${t('canon.noRefs')}</p>`}${videoCount?`<div class="note">${t('canon.videoNote',{count:videoCount})}</div>`:''}<div class="note">${t('canon.listNote')}</div>${c.is_group?`<div class="note">${t('group.canonNote')}</div>`:''}</div><div><form id="canon-form" class="panel form-grid"><h2>${t('canon.appearanceTitle')}</h2><label>${t('canon.appearanceLabel')}<textarea name="appearance" rows="9" placeholder="${esc(t('canon.appearancePlaceholder'))}">${esc(c.canon?.appearance||c.appearance)}</textarea></label><label>${t('canon.reason')}<input name="reason" placeholder="${esc(t('canon.reasonPlaceholder'))}"></label><button class="primary">${t('canon.approve')}</button><small class="muted">${t('canon.approveHint')}</small></form><div class="panel"><h2>${t('canon.history')}</h2>${c.history.map((h,i)=>`<details class="history"><summary>${i===0?t('canon.current'):''}${formatDate(h.created_at)} · ${esc(h.reason)}</summary><p>${esc(h.appearance)||t('canon.cleared')}</p></details>`).join('')||`<p>${t('canon.noHistory')}</p>`}</div></div></div>`;
  $('#canon-form').insertAdjacentHTML('afterend',`<div class="panel"><button id="check-integrity">${t('canon.checkFiles')}</button><p id="integrity-result" class="muted">${t('canon.checkIntro')}</p></div>`);
  $('#check-integrity').onclick=action(async e=>{e.currentTarget.disabled=true;try{const {results}=await api('/api/characters/'+c.id+'/integrity',{});const changed=results.filter(r=>r.status!=='unchanged');$('#integrity-result').textContent=!results.length?t('canon.checkNone'):changed.length?t('canon.checkChanged',{count:changed.length}):t('canon.checkOk',{count:results.length});}finally{$('#check-integrity').disabled=false;}});
  $('#canon-form').onsubmit=action(async e=>{e.preventDefault();await api('/api/characters/'+c.id+'/canon',{...Object.fromEntries(new FormData(e.target)),references:refs,expected_revision_id:c.canon?.id??null,expected_references:refs});toast(t('canon.approved'));await renderProfile();});
  for(const b of $$('[data-open-ref]'))b.onclick=action(()=>mediaDialog(b.dataset.openRef));for(const b of $$('[data-remove-ref]'))b.onclick=action(async()=>{await api('/api/characters/'+c.id+'/canon',{appearance:c.canon.appearance,references:refs.filter(r=>(r.reference_id||r.media_id)!==b.dataset.removeRef),expected_revision_id:c.canon.id,expected_references:refs});await renderProfile();toast(t('canon.refsUpdated'));});bindImages();
}
async function mediaDialog(mid){
  const m=await api('/api/media/'+mid);const chosen=new Set(m.characters.map(c=>c.id));
  openDialog(basename(m.relative_path),`<div class="viewer-layout"><div><div class="viewer-media">${m.kind==='video'?`<video controls playsinline preload="metadata" src="/media/${mid}"></video>`:`<img src="/media/${mid}" alt="${esc(basename(m.relative_path))}">`}</div><p class="muted">${esc(m.relative_path)}</p><p class="muted">${t('mediaDialog.playbackHint')}</p></div><div class="form-grid"><form id="media-form" class="form-grid"><label>${t('mediaDialog.who')}<small>${t('mediaDialog.whoHint')}</small></label><div class="checks">${state.characters.map(c=>`<label><input type="checkbox" name="character" value="${c.id}" ${chosen.has(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||`<span class="muted">${t('mediaDialog.createFirst')}</span>`}</div><label>${t('mediaDialog.tags')}<input name="tags" value="${esc(m.tags||'')}" placeholder="${esc(t('mediaDialog.tagsPlaceholder'))}"><small>${t('mediaDialog.tagsHint')}</small></label><label>${t('mediaDialog.notes')}<textarea name="notes">${esc(m.notes||'')}</textarea></label><button class="primary">${t('mediaDialog.save')}</button></form><hr><form id="review-form" class="form-grid"><h3>${t('review.title')}</h3><select name="character_id" aria-label="${esc(t('review.character'))}" required>${m.characters.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><div class="two-cols"><label>${t('review.decision')}<select name="decision"><option value="unreviewed">${t('review.unreviewed')}</option><option value="approved">${t('review.approve')}</option><option value="rejected">${t('review.reject')}</option></select></label><label>${t('review.rating')}<select name="rating"><option value="">${t('review.notRated')}</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${n} / 5${n===5?t('review.mostFaithful'):''}</option>`).join('')}</select></label></div><label>${t('review.notes')}<textarea name="notes" placeholder="${esc(t('review.notesPlaceholder'))}"></textarea></label><button ${m.characters.length?'':'disabled'}>${t('review.save')}</button><small class="muted">${t('review.hint')}</small></form><div class="actions"><button id="reference-button" ${m.characters.length?'':'disabled'}>${t('mediaDialog.approveRef')}</button><button id="cover-button" ${m.kind==='image'&&m.characters.length?'':'disabled'}>${t('mediaDialog.setCover')}</button><button id="compare-button" ${m.kind==='image'&&m.characters.length?'':'disabled'}>${t('mediaDialog.compare')}</button></div><details><summary>${t('review.history',{count:m.reviews.length})}</summary>${m.reviews.map(r=>`<div class="review-line"><b>${esc(state.characters.find(c=>c.id===r.character_id)?.name||t('review.characterFallback'))}</b> · ${esc(decisionName(r.decision))}${r.rating?' · '+r.rating+'/5':''}<br>${esc(r.notes)}<br><small>${formatDate(r.created_at)}</small></div>`).join('')}</details></div></div>`);
  const storage=storageInfo??=await api('/api/storage');
  const relativeFolder=m.relative_path.split(/[\\/]/).slice(0,-1).join('\\');
  const folderPath=[storage.resource_root.replace(/[\\/]+$/,''),relativeFolder].filter(Boolean).join('\\');
  const currentFolder=basename(folderPath);
  $('.dialog-head h2').insertAdjacentHTML('beforeend',` <small class="media-current-folder" title="${esc(folderPath)}">· ${esc(currentFolder)}</small>`);
  $('#media-form').insertAdjacentHTML('beforeend',`<button type="button" id="move-original-button" class="subtle">${t('mediaDialog.saveMove')}</button><small class="muted">${t('mediaDialog.saveMoveHint')}</small>`);
  if(m.moves?.length)$('#media-form').insertAdjacentHTML('afterend',`<details><summary>${t('moves.history',{count:m.moves.length})}</summary>${m.moves.map(r=>`<div class="review-line">${esc(r.from_path)} → ${esc(r.to_path)}<br><b>${esc(moveStatusName(r.status))}</b> · ${formatDate(r.created_at)}</div>`).join('')}<small class="muted">${t('moves.hint')}</small></details>`);
  $('#move-original-button').onclick=action(async()=>{await api('/api/media/'+mid,await mediaFormPayload($('#media-form'),true),'PUT');await refresh();await moveOriginalDialog(await api('/api/media/'+mid));});
  $('#media-form').onsubmit=action(async e=>{e.preventDefault();await api('/api/media/'+mid,await mediaFormPayload(e.target,true),'PUT');await render();await mediaDialog(mid);toast(t('mediaDialog.saved'));});
  $('#media-form')._afterMediaSave=updated=>{Object.assign(m,updated);refreshMediaReviewControls($('#dialog'),m);};
  $('#review-form').onsubmit=action(async e=>{e.preventDefault();await api('/api/media/'+mid+'/review',Object.fromEntries(new FormData(e.target)));await mediaDialog(mid);toast(t('review.saved'));});
  $('#reference-button').onclick=()=>{if(m.kind==='image')return referenceDialog(m);openDialog(t('still.title'),`<p>${t('still.text1',{file:esc(basename(m.relative_path))})}</p><p>${t('still.text2')}</p><div class="dialog-footer"><button id="reference-video-back">${t('still.back')}</button></div>`);$('#reference-video-back').onclick=action(()=>mediaDialog(m.id));};$('#cover-button').onclick=()=>extras.cropDialog(m);$('#compare-button').onclick=action(()=>compareDialog(m));bindImages();extras.media(m);folderReview.media(m);await tagging.viewer(m);await places.viewer(m);inlineCharacterCreation();suggestionsUI.viewer(m);await sorting.viewer(m);duplicateReview.viewer(m);worldReviewUI.viewer(m).catch(e=>toast(e.message,true));permanentDeleteUI.media(m);
}
function inlineCharacterCreation(){
  const form=$('#media-form'),list=$('.checks',form);
  list.insertAdjacentHTML('afterend',`<details class="inline-character-create"><summary>${t('inline.summary')}</summary><label for="sorting-character-name">${t('inline.name')}</label><div class="name-suggestion-row"><input id="sorting-character-name" maxlength="200" placeholder="${esc(t('inline.namePlaceholder'))}"><button type="button" id="sorting-name-suggest"><span aria-hidden="true">⤨</span> ${t('inline.suggest')}</button></div><p id="sorting-name-status" class="muted" role="status" aria-live="polite"></p><label>${t('inline.gender')}<select id="sorting-character-gender">${genderOptions()}</select></label><label>${t('inline.race')}<select id="sorting-character-race">${raceOptions()}</select></label><button type="button" id="sorting-character-create">${t('inline.create')}</button><p id="sorting-character-status" role="status"></p></details>`);
  const input=$('#sorting-character-name'),button=$('#sorting-character-create'),status=$('#sorting-character-status');
  const suggest=$('#sorting-name-suggest');
  bindNameSuggestion({input,button:suggest,status:$('#sorting-name-status'),api,createButton:button,raceInput:$('#sorting-character-race')});
  async function create(){
    button.disabled=true;suggest.disabled=true;
    try{
      const name=input.value.trim();if(!name)throw Error(t('inline.nameRequired'));
      const c=await api('/api/characters',{name,gender:$('#sorting-character-gender').value,race:$('#sorting-character-race').value});
      const label=document.createElement('label'),checkbox=document.createElement('input');
      checkbox.type='checkbox';checkbox.name='character';checkbox.value=c.id;checkbox.checked=true;
      label.append(checkbox,document.createTextNode(c.name));
      const next=[...list.querySelectorAll('label')].find(item=>characterNameOrder.compare(item.textContent,c.name)>0);
      list.querySelector('span.muted')?.remove();list.insertBefore(label,next||null);
      const search=$('#quick-character-search');if(search){search.value='';search.dispatchEvent(new Event('input'));}
      input.value='';$('#sorting-character-race').value='human';$('#sorting-name-status').textContent='';status.className='saved';status.textContent=t('inline.created');
      await refresh();return true;
    }catch(err){status.className='error';status.textContent=err.message;return false;}
    finally{button.disabled=false;suggest.disabled=false;}
  }
  button.onclick=()=>{if(button.disabled)return;const task=create();form._pendingCharacterCreation=task;task.finally(()=>{if(form._pendingCharacterCreation===task)form._pendingCharacterCreation=null;}).catch(()=>{});return task;};
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();button.onclick();}};
}
async function moveOriginalDialog(m){
  const ids=new Set(m.characters.map(c=>c.id));const folderPriority=name=>name.trim().toLocaleLowerCase('hu')==='palor'?2:name.includes('+')?0:1;const folders=[...new Set(m.characters.map(c=>c.name))].sort((a,b)=>folderPriority(a)-folderPriority(b));
  openDialog(t('move.title'),`<form id="move-original-form" class="form-grid"><p>${t('move.intro')}</p><label>${t('move.current')}<input readonly value="${esc(m.relative_path)}"></label><label>${t('move.destination')}<select name="folder" required>${folders.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select><small>${t('move.destinationHint')}</small></label><div class="note">${t('move.note')}</div><div class="dialog-footer"><button type="button" id="move-cancel">${t('move.backToMedia')}</button><button class="primary" ${folders.length?'':'disabled'}>${t('move.previewDestination')}</button></div></form>`);
  $('#move-cancel').onclick=action(()=>mediaDialog(m.id));
  $('#move-original-form').onsubmit=action(async e=>{e.preventDefault();const folder=new FormData(e.target).get('folder');const preview=await api('/api/media/'+m.id+'/move/preview',{folder});
    if(preview.unchanged){toast(t('move.alreadyThere'));return;}
    openDialog(t('move.confirmTitle'),`<div class="form-grid"><label>${t('move.from')}<input readonly value="${esc(preview.from)}"></label><label>${t('move.to')}<input readonly value="${esc(preview.to)}"></label><p>${t('move.confirmText')}</p><div class="dialog-footer"><button id="move-back">${t('move.chooseAnother')}</button><button class="primary" id="move-confirm">${t('move.confirm')}</button></div></div>`);
    $('#move-back').onclick=action(()=>moveOriginalDialog(m));$('#move-confirm').onclick=action(async e=>{const button=e.currentTarget;button.disabled=true;button.textContent=t('move.running');try{const result=await api('/api/media/'+m.id+'/move',{folder,from_path:preview.from});await render();await mediaDialog(m.id);toast(result.warning||t('move.done'),Boolean(result.warning));}finally{if(button.isConnected){button.disabled=false;button.textContent=t('move.confirm');}}});
  });
}
function referenceDialog(m){return approveCharacterReference({$,api,esc,openDialog,action,mediaDialog,render,toast},m);}
async function compareDialog(m){const cs=await Promise.all(m.characters.map(c=>api('/api/characters/'+c.id)));openDialog(t('compare.title'),`<div class="viewer-layout"><div><h3>${t('compare.thisPicture')}</h3><div class="viewer-media"><img src="/media/${m.id}" alt="${esc(t('compare.pictureAlt'))}"></div></div><div>${cs.map(c=>`<h3>${esc(c.name)}</h3><p>${esc(c.canon?.appearance||t('compare.noDescription'))}</p><div class="media-grid">${(c.canon?JSON.parse(c.canon.references_json):[]).map(r=>`<div><img src="${approvedReferenceUrl(c.id,r,c.canon?.id)}" alt="${esc(t('compare.refAlt',{role:roleName(r.role)}))}" width="160" loading="lazy"><p>${esc(roleName(r.role))}</p></div>`).join('')||`<p>${t('canon.noRefs')}</p>`}</div>`).join('')}</div></div><div class="dialog-footer"><button id="compare-back">${t('compare.back')}</button></div>`);$('#compare-back').onclick=action(()=>mediaDialog(m.id));bindImages();}
// Home page: progress at a glance and one-click shortcuts to the next tagging task.
// Local media analysis (free, in this browser): picture fingerprints → near-duplicate groups,
// video stills → later analysis; plus the cost estimate for analysing the videos.
const signalsWorker=createSignalsWorker(api);
async function paintSignals(){
  const box=$('#sig-box');if(!box)return;const s=await api('/api/signals/status').catch(()=>null);if(!s||!$('#sig-box'))return;
  const e=s.estimate,running=signalsWorker.running;
  box.innerHTML=`<h2>${t('sig.title')}</h2><p class="muted">${t('sig.lead')}</p>
    <div class="sig-stats"><span>${t('sig.images',{done:s.images.hashed,total:s.images.total})}</span><span>${t('sig.videos',{done:s.videos.framed,total:s.videos.total})}</span><span>${t('sig.groups',{groups:s.groups,items:s.in_groups})}</span>${s.videos.too_long?`<span>${t('sig.tooLong',{count:s.videos.too_long})}</span>`:''}</div>
    <p class="sig-estimate">${t('sig.estimate',{stills_lock:e.plans.lock.stills,usd_lock:e.plans.lock.usd.toFixed(2),stills_min:e.plans.minimal.stills,usd_min:e.plans.minimal.usd.toFixed(2)})}</p>
    <div class="we-row"><button class="primary" id="sig-start"${running?' hidden':''}>${t('sig.start')}</button><button class="subtle" id="sig-stop"${running?'':' hidden'}>${t('sig.stop')}</button><span id="sig-progress" class="muted"></span></div>`;
  $('#sig-start').onclick=action(async()=>{$('#sig-start').hidden=true;$('#sig-stop').hidden=false;
    await signalsWorker.start(n=>{const el=$('#sig-progress');if(el)el.textContent=t('sig.running',{done:n});});
    toast(t('sig.done'));await paintSignals();});
  $('#sig-stop').onclick=()=>{signalsWorker.stop();};
}
// System status: shown only when something needs fixing (startup tasks, Grok gateway, ChatGPT tunnel).
async function paintSystem(fresh=false){
  const box=$('#sys-box');if(!box)return;const s=await api('/api/system/status'+(fresh?'?fresh=1':'')).catch(()=>null);if(!s||!$('#sys-box'))return;
  const bad=(s.startup||[]).filter(x=>!x.ok);
  // Right after a start the tunnel and gateway may still be coming up: look again shortly.
  if(s.starting?.length)setTimeout(()=>paintSystem(true).catch(()=>{}),20_000);
  if(s.ok){box.hidden=true;return;}box.hidden=false;
  box.innerHTML=`<h2>⚠ ${t('sys.title')}</h2><ul class="sys-list">${bad.map(x=>`<li><b>${esc(x.name)}</b>: ${esc(t(x.problem==='missing'?'sys.taskMissing':'sys.taskBroken',{problems:x.problems?.map(p=>t('sys.part.'+p)).join(', ')||''}))}<br><small class="muted">${esc(t('sys.taskFix',{program:x.expected.program,script:x.expected.script,folder:x.expected.folder}))}</small></li>`).join('')}
    ${s.tailscale&&s.tailscale!=='Running'?`<li><b>Tailscale</b>: ${t('sys.tailscaleDown',{state:s.tailscale})}</li>`:''}
    ${s.restart_needed?`<li><b>${t('sys.restartTitle')}</b>: ${t('sys.restartNeeded',{count:s.changed_count})} <button id="sys-restart" class="primary">${t('sys.restartNow')}</button></li>`:''}
    ${s.gateway?'':`<li><b>Grok gateway</b>: ${t('sys.gatewayDown')}</li>`}${s.tunnel!==true?`<li><b>ChatGPT</b>: ${t(s.tunnel_status?.reason==='authentication_failed'?'sys.tunnelAuth':s.tunnel_status?.running===false?'sys.tunnelDown':'sys.tunnelUnverified')}</li>`:''}${renderSystemErrors(s.errors,state.characters||[],esc)}</ul><button id="sys-recheck" class="subtle">${t('sys.recheck')}</button>`;
  $('#sys-recheck').insertAdjacentHTML('afterend',` <button id="sys-details" class="subtle">${t('sys.details')}</button>`);
  for(const button of $$('[data-system-character]'))button.onclick=action(()=>navigate('profile',button.dataset.systemCharacter,{tab:'canon'}));
  $('#sys-recheck').onclick=action(()=>paintSystem(true));$('#sys-details').onclick=action(()=>navigate('system'));
  // Restart from the home screen (2026-11-13): the same guarded restart as on Rendszerállapot
  // (refused while work is running); the page reloads once the program answers again.
  if($('#sys-restart'))$('#sys-restart').onclick=action(async()=>{if(!await confirmBox(t('sys.restartConfirm')))return;await api('/api/dev/restart',{confirm:true});toast(t('sys.restarting'));
    const wait=async(n=0)=>{await new Promise(r=>setTimeout(r,3000));try{await fetch('/api/system/status',{cache:'no-store'});if(n>2)return location.reload();}catch{}if(n<40)return wait(n+1);};wait();});
}
async function renderHome(){
  // Pictures with characters and a location tag leave "Rendezésre vár" (idempotent, cheap).
  const synced=await api('/api/quick-tag/sync',{}).catch(()=>({completed:0}));if(synced.completed){await refresh();toast(t('qt.sortingSynced',{count:synced.completed}));}
  const [s,tidy,placement,newImages,resume]=await Promise.all([api('/api/quick-tag/summary'),api('/api/tidy').catch(()=>null),api('/api/media/placement').catch(()=>null),api('/api/new-images').catch(()=>null),api('/api/play').catch(()=>null)]);paintBadges(s,tidy);if(view!=='home')return;
  // One card per task, with its remaining count and the action in the same place.
  const size=bytes=>bytes>=1073741824?(bytes/1073741824).toFixed(1)+' GB':Math.max(1,Math.round(bytes/1048576))+' MB';
  const jobs=[
    ['single','◉','identity',s.identity.single],['pair','◎','identity',s.identity.pair],['other','⁂','identity',s.identity.other],
    ['locations','⌖','place',s.locations.untagged],['inbox','▧','collection',state.stats.inbox],
    ['groupcovers','▣','character',tidy?.group_covers?.length||0],['covers','▣','character',tidy?.no_cover.length||0],['profiles','✎','character',tidy?.no_profile.length||0],['ghost','✦','character',tidy?.ghost_pending.reduce((n,c)=>n+c.count,0)||0],
    ['tree','⌗','place',tidy?.tree_draft?1:0],['removed','⌫','collection',tidy?.removed.count||0],['placement','⇢','collection',placement?.count||0],['newimages','⇣','collection',newImages?.count||0]
  ].filter(j=>j[3]>0||['locations','inbox'].includes(j[0]));
  const totals={single:s.identity.analysed,pair:s.identity.analysed,other:s.identity.analysed,locations:s.locations.active,inbox:state.stats.media,covers:state.characters.length,profiles:state.characters.length};
  const job=([id,icon,tone,count])=>{
    // Queues without a known total have no invented completion percentage.
    const total=Math.max(count,totals[id]||0),done=Math.max(0,total-count),ratio=total?100*done/total:100;
    const percent=count?Math.min(99,Math.floor(ratio)):100;
    return `<article class="tidy-card home-task-card tone-${tone}"><span class="tidy-icon" aria-hidden="true">${icon}</span><div class="tidy-body"><h3>${t('home.job.'+id)}</h3><b class="home-remaining">${t('home.remaining',{count})}</b><small>${id==='removed'?t('home.jobText.removed',{size:size(tidy.removed.bytes)}):t('home.jobText.'+id)}</small><div class="home-progress" role="progressbar" aria-label="${esc(t('home.job.'+id))}" aria-valuemin="0" aria-valuemax="${total||1}" aria-valuenow="${total?done:1}" aria-valuetext="${esc(t('home.remaining',{count}))}"><i data-progress="${ratio}"${count?' data-incomplete':''}></i></div>${Object.hasOwn(totals,id)?`<small>${t('home.done',{percent})}</small>`:''}<button type="button" data-home-task="${id}"${count?'':' disabled'}>${t(count?'home.openTask':'home.completed')}</button></div></article>`;
  };
  $('#content').innerHTML=heading(t('home.kicker'),t('home.title'),t('home.lead'))
    +`<section class="home-resume"><a class="button primary" id="home-resume" href="#/play">▶ ${esc(resume?t('home.resumeAt',{place:resume.nodes.find(n=>n.id===resume.node_id)?.short_name||resume.nodes.find(n=>n.id===resume.node_id)?.name||t('home.resumeUnknown'),time:[resume.clock.weekday,resume.clock.slot,resume.clock.time].filter(Boolean).join(' · ')}):t('home.resume'))}</a><label><input id="start-in-play" type="checkbox" ${readStartupPreference(localStorage)==='play'?'checked':''}> ${t('home.startPlay')}</label></section>`
    +`<h2>${t('home.tasks')}</h2>`+(jobs.length?`<div class="tidy-grid">${jobs.map(job).join('')}</div>`:`<div class="empty"><div class="symbol">✓</div><h2>${t('home.allDone')}</h2></div>`)
    +`<section class="sys-box" id="sys-box" hidden></section><section class="sig-box" id="sig-box"></section>`;
  for(const bar of $$('[data-progress]'))bar.style.width=bar.hasAttribute('data-incomplete')?`min(${bar.dataset.progress}%, calc(100% - 4px))`:bar.dataset.progress+'%'; // CSSOM: allowed by the CSP
  $('#home-resume').onclick=action(async event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();await navigate('play');});
  $('#start-in-play').onchange=event=>{try{localStorage.setItem('lu-start-screen',event.target.checked?'play':'home');}catch{toast(t('home.preferenceUnavailable'),true);}};
  paintSignals();paintSystem();
  for(const b of $$('[data-home-task]'))b.onclick=action(async()=>{
    const id=b.dataset.homeTask;
    if(id==='inbox')return navigate('inbox');
    if(id==='tree')return navigate('location-catalogue');
    if(id==='removed')return extras.removed();
    if(id==='groupcovers'){const c=tidy.group_covers[0];await navigate('profile',c.id);return extras.cropDialog(await api('/api/media/'+c.cover_id));}
    if(id==='covers')return coverPicker();
    if(id==='profiles'){characterListDialog(t('home.job.profiles'),t('home.listText.profiles'),tidy.no_profile);
      // Collection folders (crowds of unnamed people) leave this list; nothing else changes.
      for(const b of $$('[data-tidy-character]')){const row=document.createElement('div');row.className='tidy-row';b.replaceWith(row);row.append(b);
        row.insertAdjacentHTML('beforeend',`<button type="button" data-folder-character="${esc(b.dataset.tidyCharacter)}" title="${esc(t('home.collectionFolderHint'))}">${esc(t('home.collectionFolder'))}</button>`);}
      for(const f of $$('[data-folder-character]'))f.onclick=action(async()=>{await api('/api/tidy/collection-folder',{character_id:f.dataset.folderCharacter,collection_folder:true});f.closest('.tidy-row').remove();badgesAt=0;});
      $('#dialog').addEventListener('close',()=>{if(view==='home')void renderHome();},{once:true});
      return;}
    if(id==='ghost'){characterListDialog(t('home.job.ghost'),t('home.listText.ghost'),tidy.ghost_pending);
      $('.tidy-list').insertAdjacentHTML('beforebegin',`<p><button type="button" class="primary" id="ghost-accept-all">${esc(t('home.ghostAcceptAll'))}</button></p>`);
      $('#ghost-accept-all').onclick=action(async e=>{if(!await confirmBox(t('home.ghostAcceptAllConfirm')))return;if(!await undoWindow(t('modal.acceptAll'),{key:'accept-profile-proposals'}))return;e.target.disabled=true;
        const r=await acceptAllGhostProposals(tidy.ghost_pending);$('#dialog').close();toast(t('home.ghostAcceptAllDone',r),r.skipped>0);await renderHome();});
      return;}
    if(id==='placement')return placementDialog(placement);
    if(id==='newimages')return newImagesDialog(newImages);
    quickTag.open(id);await navigate('quick-tag');
  });
}
// Pictures outside their folder (one character → his folder, more → Scenes\A + B): a preview
// of where they go, and one owner click moves them (journaled, nothing overwritten).
function placementDialog(placement){
  const shown=placement.items.slice(0,12);
  openDialog(t('home.job.placement'),`<p>${esc(t('place.lead',{count:placement.count}))}</p><ul class="place-list">${shown.map(i=>`<li><small class="muted">${esc(i.from)}</small><br>→ <b>${esc(i.folder)}</b></li>`).join('')}</ul>${placement.count>shown.length?`<p class="muted">${esc(t('place.more',{count:placement.count-shown.length}))}</p>`:''}<button type="button" class="primary" id="place-apply">${esc(t('place.apply',{count:placement.count}))}</button>`);
  $('#place-apply').onclick=action(async()=>{const b=$('#place-apply');b.disabled=true;b.textContent=t('place.working');
    const r=await api('/api/media/placement/apply',{});$('#dialog').close();
    toast(t('place.done',{moved:r.moved,skipped:r.skipped.length})+(r.remaining?' '+t('place.remaining',{count:r.remaining}):''),r.skipped.length>0);
    await refresh();await renderHome();});
}
// New files in "Új képek": who/where each one is read as from its name, and one click links and
// moves the readable ones; unreadable names stay in the folder with the reason.
function newImagesDialog(intake){
  const bad=intake.items.filter(i=>i.problem),good=intake.items.filter(i=>!i.problem);
  const row=i=>`<li><small class="muted">${esc(i.relative.split(/[\\/]/).slice(2).join('\\'))}</small><br>${i.problem?`<span class="warn">${esc(t('new.problem.'+i.problem.code,{names:i.problem.names.join(', ')}))}</span>`:`→ <b>${esc(i.folder)}</b>${i.place?' · '+esc(i.place):''}${i.content?' · '+esc(i.content==='non_intimate'?'hétköznapi':i.content==='shirtless'?'félmeztelen':i.content==='nudity'?'meztelen':'szex'):''}`}</li>`;
  openDialog(t('home.job.newimages'),`<p>${esc(t('new.lead',{folder:intake.folder}))}</p>`
    +(good.length?`<p>${esc(t('new.ready',{count:intake.ready}))}</p><ul class="place-list">${good.slice(0,12).map(row).join('')}</ul>`:'')
    +(bad.length?`<p>${esc(t('new.problems',{count:intake.count-intake.ready}))}</p><ul class="place-list">${bad.slice(0,12).map(row).join('')}</ul>`:'')
    +(intake.ready?`<button type="button" class="primary" id="new-apply">${esc(t('new.apply',{count:intake.ready}))}</button>`:''));
  const b=$('#new-apply');if(!b)return;
  b.onclick=action(async()=>{b.disabled=true;b.textContent=t('new.working');
    const r=await api('/api/new-images/apply',{});$('#dialog').close();
    toast(t('new.done',{moved:r.moved,skipped:r.skipped.length})+(r.remaining?' '+t('place.remaining',{count:r.remaining}):''),r.skipped.length>0);
    await refresh();await renderHome();});
}
// A short list of characters; clicking one opens their profile.
// "Mindet elfogadom": the server accepts every pending proposal of each character, oldest first,
// so newer ones overwrite older ones; the character policy still checks the result.
async function acceptAllGhostProposals(items){
  let accepted=0,skipped=0;
  for(const c of items){try{accepted+=(await api(`/api/characters/${c.id}/ghost/accept-all`,{})).accepted;}catch{skipped+=c.count;}}
  return {accepted,skipped};
}
function characterListDialog(title,text,items){
  openDialog(title,`<p>${esc(text)}</p><div class="tidy-list">${items.map(c=>`<button type="button" data-tidy-character="${esc(c.id)}"><span>${esc(c.name)}</span>${c.count?`<b>${c.count}</b>`:''}<small>${t('home.openProfile')}</small></button>`).join('')}</div>`);
  for(const b of $$('[data-tidy-character]'))b.onclick=action(async()=>{$('#dialog').close();await navigate('profile',b.dataset.tidyCharacter);});
}
// Cover picker: for each character without a cover, the best candidates are shown and the
// first is preselected. Saving sets only empty covers; existing covers are never replaced.
async function coverPicker(){
  const {items}=await api('/api/tidy/covers'),chosen=new Map(items.filter(c=>c.candidates.length).map(c=>[c.id,c.candidates[0].id]));
  const badge=m=>m.reference?`<i>${t('home.cover.reference')}</i>`:m.rating?`<i>★ ${m.rating}</i>`:m.alone?'':`<i>${t('home.cover.group')}</i>`;
  openDialog(t('home.job.covers'),`<p>${t('home.cover.intro')}</p><div class="cover-pick">${items.map(c=>`<section><h3>${esc(c.name)} <small class="muted">${t('home.cover.count',{count:c.total})}</small></h3>${c.candidates.length?`<div class="cover-pick-row">${c.candidates.map(m=>`<button type="button" class="cover-option${chosen.get(c.id)===m.id?' chosen':''}" data-cover-character="${esc(c.id)}" data-cover-media="${esc(m.id)}" aria-pressed="${chosen.get(c.id)===m.id}" title="${esc(m.filename)}"><img src="/thumb/${encodeURIComponent(m.id)}" alt="${esc(m.filename)}" loading="lazy">${badge(m)}</button>`).join('')}<button type="button" class="cover-skip${chosen.has(c.id)?'':' chosen'}" data-cover-skip="${esc(c.id)}">${t('home.cover.skip')}</button></div>`:`<p class="muted">${t('home.cover.none')}</p>`}</section>`).join('')}</div><div class="dialog-footer"><button type="button" id="cover-cancel">${t('common.cancel')}</button><button type="button" id="cover-save" class="primary"></button></div>`);
  const paint=()=>{for(const b of $$('[data-cover-media]')){const on=chosen.get(b.dataset.coverCharacter)===b.dataset.coverMedia;b.classList.toggle('chosen',on);b.setAttribute('aria-pressed',String(on));}for(const b of $$('[data-cover-skip]'))b.classList.toggle('chosen',!chosen.has(b.dataset.coverSkip));const save=$('#cover-save');save.textContent=t('home.cover.save',{count:chosen.size});save.disabled=!chosen.size;};
  for(const b of $$('[data-cover-media]'))b.onclick=()=>{chosen.set(b.dataset.coverCharacter,b.dataset.coverMedia);paint();};
  for(const b of $$('[data-cover-skip]'))b.onclick=()=>{chosen.delete(b.dataset.coverSkip);paint();};
  $('#cover-cancel').onclick=()=>$('#dialog').close();
  $('#cover-save').onclick=action(async()=>{const result=await api('/api/tidy/covers',{choices:[...chosen].map(([character_id,media_id])=>({character_id,media_id}))});$('#dialog').close();await render();toast(t('home.cover.saved',{count:result.set}));});
  paint();bindImages();
}
async function renderLocationCanvas(){const sequence=navigationSequence,tab=locationTab,selection=locationSelection;const {mountLocationHub}=await import('./location-hub.js');if(view!=='location-catalogue'||sequence!==navigationSequence)return;const instance=await mountLocationHub({host:$('#content'),api,toast,mediaDialog,initialTab:tab,initialSelection:selection,isCurrent:()=>view==='location-catalogue'&&sequence===navigationSequence,onRoute:(next,id)=>navigate('location-catalogue',null,{placeTab:next,placeId:id}),openPlay:async id=>{await navigate('play');await playUI.travelToPlace(id);}});if(sequence===navigationSequence)locationCanvas=instance;else instance.destroy();}
function renderWorld(){return worldEngineUI.render($('#content'));}
for(const b of $$('#navigation button'))b.onclick=action(()=>navigate(b.dataset.view));
$('#backup').onclick=()=>{location.href='/api/export';toast(t('export.started'));};
$('#restore').onclick=()=>$('#restore-file').click();
$('#restore-file').onchange=action(async e=>{const f=e.target.files[0];if(!f)return;try{const backup=JSON.parse(await f.text());await api('/api/restore',backup);await navigate('characters');toast(t('restore.done'));}finally{e.target.value='';}});
$('#dialog').addEventListener('close',()=>{for(const v of $$('#dialog video'))v.pause();});
window.addEventListener('unhandledrejection',e=>{reportRequestError(e.reason||{});e.preventDefault();});
permanentDeleteUI.controls();
extras.controls();
sorting.controls();
folderReview.controls();
duplicateReview.controls();
tagging.controls();
suggestionsUI.controls();
quickTag.controls();
$('.sidebar-bottom').insertAdjacentHTML('afterbegin',`<button id="system-tool">${t('sidebar.system')}</button>`);$('#system-tool').onclick=action(()=>navigate('system'));
$('.sidebar-bottom').insertAdjacentHTML('afterbegin',`<button id="location-library">${t('sidebar.locationReferences')}</button>`);$('#location-library').onclick=action(()=>navigate('location-catalogue',null,{placeTab:'backgrounds'}));
$('.sidebar-bottom').insertAdjacentHTML('afterbegin',`<button id="folder-names-tool">${t('sidebar.folderNames')}</button>`);$('#folder-names-tool').onclick=action(folderNamesDialog);
// Added before the first render so the button exists even if that render fails.
$('.sidebar-bottom').insertAdjacentHTML('afterbegin',`<button id="location-editor-tool">${t('sidebar.locationEditor')}</button>`);$('#location-editor-tool').onclick=action(()=>navigate('location-catalogue'));
// Phones hide the sidebar tools; this toggle (visible only on narrow screens) reveals them.
$('#navigation').insertAdjacentHTML('beforeend',`<button id="sidebar-more" type="button" aria-expanded="false" aria-controls="sidebar-tools"><span>⋯</span> ${t('nav.more')}</button>`);
$('.sidebar-bottom').id='sidebar-tools';
$('#sidebar-more').onclick=()=>{const open=$('.sidebar').classList.toggle('tools-open');$('#sidebar-more').setAttribute('aria-expanded',String(open));};
const restoreRoute=()=>{if(location.hash===handledHash)return;const route=parseAppRoute(location.hash)||{view:'home',cid:null,tab:'profile'};handledHash=location.hash;void navigate(route.view,route.cid,{tab:route.tab,placeTab:route.placeTab,placeId:route.placeId,historyMode:'none',scrollY:history.state?.lu?.y||0,restoreQuery:history.state?.lu?.query||''}).catch(error=>{history.replaceState(history.state,'',appRouteHash({view,cid:activeCharacter,tab:profileTab,placeTab:locationTab,placeId:locationSelection}));handledHash=location.hash;reportRequestError(error);});};
window.addEventListener('popstate',restoreRoute);window.addEventListener('hashchange',restoreRoute);
window.addEventListener('pagehide',()=>{history.replaceState({lu:{y:window.scrollY,query}},'',location.href);});
history.replaceState(history.state,'',appRouteHash({view,cid:activeCharacter,tab:profileTab,placeTab:locationTab,placeId:locationSelection}));handledHash=location.hash;
try{await render();window.scrollTo({top:history.state?.lu?.y||0,behavior:'instant'});}catch(error){reportRequestError(error);}



document.addEventListener('keydown',event=>{if(!document.body.classList.contains('play-mode')&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();void playUI.commands().catch(reportRequestError);}});
void generationWatcher.start();window.addEventListener('focus',()=>void generationWatcher.poll());
worldReviewUI.controls();
// Sidebar tools: gather the many tool buttons into two collapsible menus (handlers stay attached).
(function groupSidebarTools(){
  const bottom=$('.sidebar-bottom'),identity=$('.identity',bottom),backup=['backup','restore'];
  const menu=(id,label)=>{const d=document.createElement('details');d.className='tool-menu';d.id=id;const s=document.createElement('summary');s.textContent=label;d.append(s);return d;};
  const tools=menu('tool-menu',t('nav.toolbox')),data=menu('data-menu',t('nav.dataMenu'));
  for(const b of [...bottom.querySelectorAll(':scope > button')])(backup.includes(b.id)?data:tools).append(b);
  bottom.insertBefore(tools,identity);bottom.insertBefore(data,identity);
})();
