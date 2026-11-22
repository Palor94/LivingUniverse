import {openGenerationQueue} from './generation-queue.js';
import {openPictureOrder} from './picture-order.js';
import {openAssetGeneration} from './asset-generation.js';
import {sortNames} from './name-picker.js';
// Képműhely: one screen for getting pictures ready for use (server: app/image-workshop.mjs).
// Tabs: Új képek (inbox with steps), Képgyártás (Grok queue with briefs), Ellenőrzés (verdicts
// on generated pictures), Javaslatok (carry-over and paid-tagging priority), Készültség.
// Keyboard in the inbox: ← → select, 1 2 3 content level, N nobody on it, Enter open.
// In Ellenőrzés: A accept, R reject, G ask again, F / B cycle the face / body verdict.
import {t} from './i18n.js';
import {createSignalsWorker} from './media-signals.js';

const TABS=['inbox','generation','checks','suggestions','readiness','ideas'];
const IDEA_KINDS=['comic','inspiration'];
const STEPS=['signals','duplicate','people','content','tagged'];
const LEVELS=[['non_intimate','☀','1'],['nudity','🔥','2'],['sexual_activity','🔞','3']];
const MARKS=['none','match','mismatch','unsure'],MARK_ICON={none:'·',match:'✓',mismatch:'✗',unsure:'?'};
const STARTER='Use the Living Universe connector. First call get_generation_instructions and follow it exactly for this whole chat. Then start: list_generation_needs, open a batch of 3 jobs and make them one by one. Reply to me in Hungarian.';

export function installImageWorkshopUI({$,$$,esc,api,toast,mediaDialog,openProfile,openMediaReview,getState}){
  let tab='inbox',keyHandler=null,busy=false,moreObserver=null;let autoSignals=true;try{autoSignals=localStorage.getItem('lu-workshop-auto-signals')!=='off';}catch{}
  const inbox={missing:'any',character:'',items:[],total:0,counts:null,sel:0};
  const checks={status:'open',items:[],sel:0,marks:new Map()};
  const signals=createSignalsWorker(api);
  const media=id=>'/media/'+encodeURIComponent(id),small=id=>'/thumb/'+encodeURIComponent(id);
  const thumb=(id,kind='image')=>kind==='video'?`<video src="${media(id)}" muted preload="metadata"></video>`:`<img src="${small(id)}" alt="" loading="lazy">`;
  const run=fn=>async(...a)=>{if(busy)return;busy=true;try{await fn(...a);}catch(e){toast(e.message,true);}finally{busy=false;}};

  async function render(root,preset){
    moreObserver?.disconnect();if(preset&&TABS.includes(preset))tab=preset;if(tab!=='inbox')signals.stop?.();
    root.innerHTML=`<div class="iw"><header class="mr-head"><h1>${t('iw.title')}</h1><p class="muted">${t('iw.lead')}</p>
      <div class="mr-tabs" role="tablist">${TABS.map(x=>`<button role="tab" aria-selected="${x===tab}" class="${x===tab?'active':''}" data-iw-tab="${x}">${t('iw.tab.'+x)}</button>`).join('')}</div></header><div id="iw-body"></div></div>`;
    for(const b of $$('[data-iw-tab]'))b.onclick=()=>{tab=b.dataset.iwTab;render(root);};
    detachKeys();
    await ({inbox:paintInbox,generation:paintGeneration,checks:paintChecks,suggestions:paintSuggestions,readiness:paintReadiness,ideas:paintIdeas})[tab](root);
  }
  function leave(){detachKeys();moreObserver?.disconnect();signals.stop?.();}
  function detachKeys(){if(keyHandler)document.removeEventListener('keydown',keyHandler);keyHandler=null;}
  function attachKeys(root,fn){keyHandler=e=>{if(!root.isConnected||!$('#iw-body')){detachKeys();return;}if(e.target.closest?.('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;fn(e);};document.addEventListener('keydown',keyHandler);}

  // ---- 1. Új képek ---------------------------------------------------------------------------
  async function loadInbox(more=false){
    const r=await api('/api/workshop/inbox?'+new URLSearchParams({missing:inbox.missing,limit:'30',offset:String(more?inbox.items.length:0),...(inbox.character?{character:inbox.character}:{})}));
    inbox.items=more?inbox.items.concat(r.items):r.items;inbox.total=r.total;inbox.counts=r.counts;if(!more)inbox.sel=0;
  }
  async function paintInbox(root){
    await loadInbox();drawInbox();if(autoSignals&&tab==='inbox'&&root.isConnected)void runSignals();
    attachKeys(root,e=>{const item=inbox.items[inbox.sel];
      if(e.key==='ArrowRight'||e.key==='j'){e.preventDefault();select(inbox.sel+1);}
      else if(e.key==='ArrowLeft'||e.key==='k'){e.preventDefault();select(inbox.sel-1);}
      else if(item&&LEVELS.some(l=>l[2]===e.key)){e.preventDefault();setLevel(item,LEVELS.find(l=>l[2]===e.key)[0]);}
      else if(item&&(e.key==='n'||e.key==='N')){e.preventDefault();nobody(item);}
      else if(item&&e.key==='Enter'){e.preventDefault();mediaDialog(item.media_id);}});
  }
  function select(i){if(!inbox.items.length)return;inbox.sel=Math.max(0,Math.min(inbox.items.length-1,i));for(const el of $$('[data-iw-item]'))el.classList.toggle('iw-sel',Number(el.dataset.iwItem)===inbox.sel);$(`[data-iw-item="${inbox.sel}"]`)?.scrollIntoView({block:'nearest'});}
  function drawInbox(){
    const box=$('#iw-body');if(!box)return;const c=inbox.counts||{};const chars=sortNames(getState()?.characters||[]);
    const filters=['any','ready',...STEPS].map(k=>`<button class="${k===inbox.missing?'active':''}" data-iw-missing="${k}">${t('iw.missing.'+k)} <small>${k==='any'?Math.max(0,(c.total||0)-(c.ready||0)):k==='ready'?c.ready||0:c[k]||0}</small></button>`).join('');
    box.innerHTML=`<div class="mr-filter">${filters}<select id="iw-char" aria-label="${t('iw.characterFilter')}"><option value="">${t('iw.allCharacters')}</option>${chars.map(ch=>`<option value="${esc(ch.id)}"${ch.id===inbox.character?' selected':''}>${esc(ch.name)}</option>`).join('')}</select></div>
      ${c.signals?`<div class="iw-banner"><label class="play-check"><input type="checkbox" id="iw-auto-signals" ${autoSignals?'checked':''}>${t('iw.autoSignals')}</label><span>${t('iw.signalsMissing',{count:c.signals})}</span><button id="iw-signals">${t('iw.signalsStart')}</button><span id="iw-sig-progress" class="muted"></span></div>`:''}
      <p class="muted iw-keys">${t('iw.inboxKeys')}</p>
      ${inbox.items.length?`<div class="iw-grid">${inbox.items.map((it,i)=>({it,i})).filter(({it})=>!it.availability||it.availability==='local').map(({it,i})=>card(it,i)).join('')}</div>${inbox.items.some(it=>it.availability&&it.availability!=='local')?`<section class="iw-cloud"><h3>${t('iw.cloudTitle')}</h3><p>${t('iw.cloudLead')}</p><div class="iw-grid">${inbox.items.map((it,i)=>({it,i})).filter(({it})=>it.availability&&it.availability!=='local').map(({it,i})=>card(it,i)).join('')}</div></section>`:''}`:`<div class="empty"><div class="symbol">✓</div><h2>${t('iw.inboxEmpty')}</h2></div>`}
      ${inbox.items.length<inbox.total?`<button id="iw-more" class="subtle">${t('iw.more',{count:inbox.total-inbox.items.length})}</button>`:''}
      <datalist id="iw-names">${chars.map(ch=>`<option value="${esc(ch.name)}"></option>`).join('')}</datalist>`;
    for(const b of $$('[data-iw-missing]'))b.onclick=run(async()=>{inbox.missing=b.dataset.iwMissing;await loadInbox();drawInbox();});
    $('#iw-char').onchange=run(async e=>{inbox.character=e.target.value;await loadInbox();drawInbox();});
    moreObserver?.disconnect();if($('#iw-more')){const more=run(async()=>{const y=window.scrollY;await loadInbox(true);drawInbox();window.scrollTo(0,y);});$('#iw-more').onclick=more;moreObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void more();},{rootMargin:'300px'});moreObserver.observe($('#iw-more'));}
    if($('#iw-auto-signals'))$('#iw-auto-signals').onchange=()=>{autoSignals=$('#iw-auto-signals').checked;try{localStorage.setItem('lu-workshop-auto-signals',autoSignals?'on':'off');}catch{}if(autoSignals)void runSignals();else signals.stop();};
    // The page stays usable while it runs; a stop by error re-enables the button (no silent hang).
    if($('#iw-signals'))$('#iw-signals').onclick=()=>void runSignals();
    for(const el of $$('[data-iw-item]')){const it=inbox.items[Number(el.dataset.iwItem)];
      el.querySelector('.iw-thumb').onclick=()=>{select(Number(el.dataset.iwItem));mediaDialog(it.media_id);};
      for(const b of el.querySelectorAll('[data-iw-level]'))b.onclick=()=>setLevel(it,b.dataset.iwLevel);
      el.querySelector('[data-iw-nobody]')?.addEventListener('click',()=>nobody(it));
      el.querySelector('[data-iw-dup]')?.addEventListener('click',()=>openMediaReview('duplicates'));
      el.querySelector('[data-iw-tagq]')?.addEventListener('click',()=>{tab='suggestions';render($('#content'));});
      for(const b of el.querySelectorAll('[data-iw-idea]'))b.onclick=()=>toIdeas(it,b.dataset.iwIdea);
      const form=el.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();assign(it,form.querySelector('input').value);};
      el.addEventListener('focusin',()=>select(Number(el.dataset.iwItem)));}
    for(const button of $$('[data-iw-download]'))button.onclick=run(async()=>{button.disabled=true;await api('/api/workshop/hydrate',{media_ids:[button.dataset.iwDownload]});await loadInbox();drawInbox();if(autoSignals)void runSignals();});
    select(inbox.sel);
  }
  async function runSignals(){if(signals.running||tab!=='inbox')return;if($('#iw-signals'))$('#iw-signals').disabled=true;
    try{await signals.start(n=>{const el=$('#iw-sig-progress');if(el)el.textContent=t('sig.running',{done:n});});}
    catch(error){toast(error.message,true);}finally{if(tab==='inbox'&&$('#iw-body')){await loadInbox().catch(()=>{});drawInbox();}}
  }
  function card(it,i){
    const metadata=[new Date(it.created_at).toLocaleDateString('hu-HU'),it.size!=null?t('iw.fileSize',{size:(it.size/1048576).toFixed(1)}):''].filter(Boolean).join(' · ');
    if(it.availability&&it.availability!=='local')return `<article class="iw-card" data-cloud-item="${i}"><div class="iw-thumb iw-offline">☁</div><div class="iw-info"><b>${esc(it.people.map(p=>p.name).join(', ')||t('mr.nobody'))}</b><small title="${esc(it.file)}">${esc(metadata)}</small><button type="button" data-iw-download="${esc(it.media_id)}">${t('iw.download')}</button></div></article>`;

    const steps=STEPS.map(s=>`<span class="iw-step ${it.steps[s]?'ok':it.next===s?'next':'todo'}" title="${t('iw.step.'+s)}">${it.steps[s]?'✓':'•'} ${t('iw.stepShort.'+s)}</span>`).join('');
    const action=it.next==='people'?`<form class="iw-assign"><input list="iw-names" placeholder="${t('iw.who')}" aria-label="${t('iw.who')}"><button>${t('iw.link')}</button><button type="button" class="subtle" data-iw-nobody>${t('iw.nobody')} <kbd>N</kbd></button></form>`
      :it.next==='content'?`<div class="iw-levels">${LEVELS.map(([l,icon,k])=>`<button data-iw-level="${l}" title="${t('ml.level.'+l)}">${icon} <kbd>${k}</kbd></button>`).join('')}</div>`
      :it.next==='duplicate'?`<button class="subtle" data-iw-dup>${t('iw.openDuplicates')}</button>`
      :it.next==='tagged'?`<button class="subtle" data-iw-tagq>${t('iw.toTagging')}</button>`
      :it.next==='signals'?`<span class="muted">${t('iw.needsSignals')}</span>`:`<span class="muted">${t('iw.ready')}</span>`;
    return `<article class="iw-card" data-iw-item="${i}" tabindex="0"><button class="iw-thumb" aria-label="${esc(it.file)}">${thumb(it.media_id,it.kind)}</button>
      <div class="iw-info"><b>${esc(it.people.map(p=>p.name).join(', ')||t('mr.nobody'))}</b><small class="muted" title="${esc(it.file)}">${esc(metadata)}</small>
      <small class="iw-steps" title="${esc(STEPS.map(s=>t('iw.step.'+s)+': '+(it.steps[s]?'✓':'○')).join(' · '))}">${it.next?t('iw.step.'+it.next):t('iw.ready')}</small>${it.next==='signals'?'':action}
      <div class="iw-idea-actions"><small class="muted">${t('iw.ideas.put')}</small>${IDEA_KINDS.map(k=>`<button type="button" class="subtle" data-iw-idea="${k}">${t('iw.ideas.kind.'+k)}</button>`).join('')}</div></div></article>`;
  }
  // After an action the item is re-read, so its steps and next action stay true.
  async function refreshItem(it){await loadInbox();drawInbox();const i=inbox.items.findIndex(x=>x.media_id===it.media_id);if(i>=0)select(i);}
  const setLevel=run(async(it,level)=>{await api('/api/play/content',{media_id:it.media_id,level});toast(t('ml.level.'+level));await refreshItem(it);});
  // Ötletláda: the picture moves into the idea folder and leaves the sorting list.
  const toIdeas=run(async(it,kind)=>{await api('/api/workshop/ideas',{media_id:it.media_id,kind});toast(t('iw.ideas.added',{kind:t('iw.ideas.kind.'+kind)}));await loadInbox();drawInbox();});
  const nobody=run(async it=>{await api('/api/workshop/inbox/no-characters',{media_id:it.media_id,value:true});toast(t('iw.nobodySaved'));await refreshItem(it);});
  const assign=run(async(it,name)=>{const ch=(getState()?.characters||[]).find(c=>c.name.toLocaleLowerCase('hu')===String(name).trim().toLocaleLowerCase('hu'));if(!ch)throw new Error(t('iw.unknownCharacter'));
    await api('/api/media/bulk',{operation:'assign',media_ids:[it.media_id],character_ids:[ch.id]});toast(t('iw.linked',{name:ch.name}));await refreshItem(it);});

  // ---- 6. Ötletláda ----------------------------------------------------------------------------
  // Comic crops and inspiring pictures for later generation; a note says what to make from each.
  const ideas={kind:'',items:[],counts:null,total:0};
  async function paintIdeas(){
    const r=await api('/api/workshop/ideas?'+new URLSearchParams({limit:'500',...(ideas.kind?{kind:ideas.kind}:{})}));if(!$('#iw-body'))return;
    Object.assign(ideas,{items:r.items,counts:r.counts,total:r.total});
    const c=r.counts,all=c.comic+c.inspiration+c.plan;
    const filters=[['',all],['comic',c.comic],['inspiration',c.inspiration],['plan',c.plan]].map(([k,n])=>`<button class="${k===ideas.kind?'active':''}" data-iw-ideakind="${k}">${t(k?'iw.ideas.kind.'+k:'iw.ideas.all')} <small>${n}</small></button>`).join('');
    $('#iw-body').innerHTML=`<div class="iw-banner"><span>${t('iw.ideas.lead')}</span></div><div class="mr-filter">${filters}</div>
      ${r.items.length?`<div class="iw-grid">${r.items.map((it,i)=>`<article class="iw-card" data-iw-ideaitem="${i}"><button class="iw-thumb" aria-label="${esc(it.file)}">${thumb(it.media_id,it.media_kind)}</button>
        <div class="iw-info"><b>${t('iw.ideas.kind.'+it.kind)}</b><small class="muted">${esc(it.file)}</small>
        <textarea rows="2" maxlength="1000" placeholder="${esc(t('iw.ideas.notePlaceholder'))}" aria-label="${esc(t('iw.ideas.note'))}">${esc(it.note)}</textarea>
        <div class="iw-idea-actions">${IDEA_KINDS.filter(k=>k!==it.kind).map(k=>`<button type="button" class="subtle" data-iw-ideamove="${k}">${t('iw.ideas.moveTo',{kind:t('iw.ideas.kind.'+k)})}</button>`).join('')}<button type="button" class="subtle" data-iw-ideaout>${t('iw.ideas.remove')}</button></div></div></article>`).join('')}</div>`:`<div class="empty"><div class="symbol">💡</div><h2>${t('iw.ideas.empty')}</h2></div>`}`;
    for(const b of $$('[data-iw-ideakind]'))b.onclick=run(async()=>{ideas.kind=b.dataset.iwIdeakind;await paintIdeas();});
    for(const el of $$('[data-iw-ideaitem]')){const it=ideas.items[Number(el.dataset.iwIdeaitem)];
      el.querySelector('.iw-thumb').onclick=()=>mediaDialog(it.media_id);
      const note=el.querySelector('textarea');note.onchange=run(async()=>{await api('/api/workshop/ideas/note',{media_id:it.media_id,note:note.value});it.note=note.value.trim();toast(t('iw.ideas.noteSaved'));});
      for(const b of el.querySelectorAll('[data-iw-ideamove]'))b.onclick=run(async()=>{await api('/api/workshop/ideas',{media_id:it.media_id,kind:b.dataset.iwIdeamove});await paintIdeas();});
      el.querySelector('[data-iw-ideaout]').onclick=run(async()=>{await api('/api/workshop/ideas/remove',{media_id:it.media_id});toast(t('iw.ideas.removed'));await paintIdeas();});}
  }

  // ---- 2. Képgyártás ---------------------------------------------------------------------------
  async function paintGeneration(){
    const box=$('#iw-body');const g=await api('/api/workshop/generation');if(!$('#iw-body'))return;
    const open=g.jobs.filter(j=>j.status==='open'),stuck=g.jobs.filter(j=>['refused','failed'].includes(j.status));
    box.innerHTML=`<div class="iw-banner"><span>${t('iw.gen.lead')}</span><button type="button" id="iw-queue">${t('queue.title')}</button><button class="primary" id="iw-starter">${t('iw.gen.copyStarter')}</button></div>
      <h2>${t('iw.gen.needs',{count:g.total})}</h2>
      <div class="iw-needs">${g.needs.map((n,i)=>`<details class="iw-need" data-iw-need="${i}"><summary><span class="iw-target">${t('we.gen.'+n.target)}</span> <b>${esc(n.name||'')}</b>${n.target==='figure'?` · ${t('iw.gen.outfit.'+(n.outfit||'dressed'))}`:''}${n.expression?` · ${esc(n.expression)}`:''}${n.time_of_day?` · ${esc(n.time_of_day)}`:''} <small class="muted">${esc(n.why||'')}</small></summary><div class="iw-brief muted">${t('iw.loading')}</div></details>`).join('')||`<p class="muted">${t('iw.gen.none')}</p>`}</div>
      ${g.blocked_figures?.length?`<h2>${t('iw.gen.missingPictures')}</h2><ul class="iw-jobs">${g.blocked_figures.map(c=>`<li><b>${esc(c.name)}</b> · ${esc(c.source_folder)}</li>`).join('')}</ul>`:''}
      ${open.length?`<h2>${t('iw.gen.open',{count:open.length})}</h2><ul class="iw-jobs">${open.map(j=>`<li>${t('we.gen.'+j.target)} · ${esc(j.character||j.location||'')}${j.brief?.owner_note?` — <i>${esc(j.brief.owner_note)}</i>`:''}</li>`).join('')}</ul>`:''}
      ${stuck.length?`<h2>${t('iw.gen.stuck')}</h2><ul class="iw-jobs">${stuck.map(j=>`<li>${t('we.gen.'+j.target)} · ${esc(j.character||j.location||'')} · ${esc(j.status)}${j.note?` — ${esc(j.note)}`:''} <button class="subtle" data-iw-clear="${esc(j.id)}">${t('iw.gen.offerAgain')}</button></li>`).join('')}</ul>`:''}`;
    $('#iw-queue').onclick=run(()=>openGenerationQueue({needs:g.needs,api,esc}));
    $('#iw-starter').onclick=run(async()=>{await navigator.clipboard.writeText(STARTER);toast(t('iw.copied'));});
    for(const b of $$('[data-iw-clear]'))b.onclick=run(async()=>{await api('/api/play/generation/jobs/'+b.dataset.iwClear+'/clear',{});await paintGeneration();});
    for(const d of $$('[data-iw-need]'))d.addEventListener('toggle',()=>{if(d.open&&!d.dataset.loaded){d.dataset.loaded='1';loadBrief(d,g.needs[Number(d.dataset.iwNeed)]);}});
  }
  async function loadBrief(d,n){
    const q={target:n.target,...(n.character_id?{character_id:n.character_id}:{}),...(n.location_id?{location_id:n.location_id}:{}),...(n.expression?{expression:n.expression}:{}),...(n.outfit?{outfit:n.outfit}:{}),...(n.time_of_day?{time_of_day:n.time_of_day}:{})};
    const box=d.querySelector('.iw-brief');
    try{const b=await api('/api/workshop/generation/brief?'+new URLSearchParams(q));const save=b.save?`${b.save.folder}\\${b.save.file}`:'';
      box.classList.remove('muted');
      box.innerHTML=`<textarea readonly rows="7" aria-label="${t('iw.gen.prompt')}">${esc(b.prompt)}</textarea>
        <p><b>${t('iw.gen.saveAs')}</b> <code>${esc(save)}</code> · ${t('iw.gen.content')}: ${t('ml.level.'+(b.content_expected||'non_intimate'))}</p>
        ${b.references?.length?`<div class="iw-refs">${b.references.map(r=>`<img src="${small(r.media_id)}" alt="" loading="lazy" title="${esc(r.role||'')}">`).join('')}</div>`:`<p class="muted">${t('iw.gen.textOnly')}</p>`}
        ${b.owner_feedback?.length?`<p class="iw-feedback">${t('iw.gen.feedback')}: ${b.owner_feedback.map(esc).join(' · ')}</p>`:''}
        <div class="we-row">${n.target==='figure'||n.target==='background'?`<button data-sogni-order>${t('iw.gen.sogniOrder')}</button>`:''}<button data-copy>${t('iw.gen.copyPrompt')}</button><input data-note placeholder="${t('iw.gen.notePlaceholder')}" aria-label="${t('iw.gen.notePlaceholder')}"><button class="primary" data-open>${t('iw.gen.openJob')}</button></div>`;
      if(box.querySelector('[data-sogni-order]'))box.querySelector('[data-sogni-order]').onclick=run(()=>n.target==='background'?openAssetGeneration({targetId:n.location_id,time:n.time_of_day||'nappal',api}):openPictureOrder({target:q,api}));
      box.querySelector('[data-copy]').onclick=run(async()=>{await navigator.clipboard.writeText(b.prompt+(save?'\n\nSave as: '+save:''));toast(t('iw.copied'));});
      box.querySelector('[data-open]').onclick=run(async()=>{const j=await api('/api/workshop/generation/open',{...q,note:box.querySelector('[data-note]').value});toast(j.reused?t('iw.gen.jobUpdated'):t('iw.gen.jobOpened'));await paintGeneration();});
    }catch(e){box.textContent=e.message;}
  }

  // ---- 3. Ellenőrzés ---------------------------------------------------------------------------
  async function paintChecks(root){
    const r=await api('/api/workshop/checks?status='+checks.status);checks.items=r.items;checks.sel=Math.min(checks.sel,Math.max(0,r.items.length-1));drawChecks(r.stats);
    attachKeys(root,e=>{const it=checks.items[checks.sel];if(!it||checks.status!=='open')return;const k=e.key.toLowerCase();
      if(k==='a'){e.preventDefault();verdict(it,'accept');}else if(k==='r'){e.preventDefault();verdict(it,'reject');}else if(k==='g'){e.preventDefault();verdict(it,'regenerate');}
      else if(k==='f'||k==='b'){e.preventDefault();cycle(it,k==='f'?'face':'body');}
      else if(e.key==='ArrowRight'){e.preventDefault();checks.sel=Math.min(checks.items.length-1,checks.sel+1);drawChecks();}else if(e.key==='ArrowLeft'){e.preventDefault();checks.sel=Math.max(0,checks.sel-1);drawChecks();}});
  }
  function marks(it){if(!checks.marks.has(it.item_key))checks.marks.set(it.item_key,{face:it.verdict?.face||'none',body:it.verdict?.body||'none'});return checks.marks.get(it.item_key);}
  function cycle(it,part){const m=marks(it);m[part]=MARKS[(MARKS.indexOf(m[part])+1)%MARKS.length];drawChecks();}
  function drawChecks(stats){
    const box=$('#iw-body');if(!box)return;const it=checks.items[checks.sel];
    const head=`<div class="mr-filter">${['open','done'].map(s=>`<button class="${s===checks.status?'active':''}" data-iw-cstatus="${s}">${t('iw.checks.'+s)}</button>`).join('')}<span class="muted">${t('iw.checks.count',{count:checks.items.length})}${stats?' · '+t('iw.checks.stats',{accept:stats.accept||0,reject:(stats.reject||0)+(stats.regenerate||0)}):''}</span></div>`;
    if(!it){box.innerHTML=head+`<div class="empty"><div class="symbol">✓</div><h2>${t('iw.checks.empty')}</h2></div>`;bindStatus();return;}
    const m=marks(it),person=it.character_id&&it.target!=='background';
    box.innerHTML=head+`<div class="iw-check"><figure class="mr-stage"><img src="${esc(it.image)}" alt=""></figure>
      <aside><h2>${t('we.gen.'+(it.target==='generated'?'scene':it.target))}${it.name?' · '+esc(it.name):''}${it.location?' · '+esc(it.location):''}</h2><p class="muted">${esc(it.source||'')} · ${esc((it.created_at||'').slice(0,16).replace('T',' '))}</p>
        <div class="iw-steps">${it.checks.map(c=>`<span class="iw-step ${c.ok===true?'ok':c.ok===false?'next':'todo'}">${c.ok===true?'✓':c.ok===false?'!':'?'} ${t('iw.check.'+c.id)}${c.detail?` <small>${esc(String(c.detail))}</small>`:''}</span>`).join('')}</div>
        ${it.references.length?`<p>${t('iw.checks.references')}</p><div class="iw-refs">${it.references.map(r=>`<figure><img src="${small(r.media_id)}" alt="" loading="lazy"><figcaption>${esc(r.role||'')}</figcaption></figure>`).join('')}</div>`:person?`<p class="muted">${t('iw.checks.noReferences')}</p>`:''}
        ${person?`<div class="we-row"><button data-iw-mark="face">${t('iw.checks.face')} ${MARK_ICON[m.face]} <kbd>F</kbd></button><button data-iw-mark="body">${t('iw.checks.body')} ${MARK_ICON[m.body]} <kbd>B</kbd></button></div>`:''}
        ${it.verdict?`<p>${t('iw.checks.verdict.'+it.verdict.verdict)}${it.verdict.note?' — '+esc(it.verdict.note):''}</p>`:`<textarea id="iw-note" rows="2" placeholder="${t('iw.checks.notePlaceholder')}" aria-label="${t('iw.checks.notePlaceholder')}"></textarea>
        <div class="mr-keys"><button class="primary" data-iw-v="accept">${t('iw.checks.accept')} <kbd>A</kbd></button><button data-iw-v="reject">${t('iw.checks.reject')} <kbd>R</kbd></button><button data-iw-v="regenerate">${t('iw.checks.regenerate')} <kbd>G</kbd></button></div>`}
        <div class="we-row"><button class="subtle" data-iw-prev${checks.sel?'':' disabled'}>←</button><span class="muted">${checks.sel+1} / ${checks.items.length}</span><button class="subtle" data-iw-next${checks.sel<checks.items.length-1?'':' disabled'}>→</button></div></aside></div>`;
    bindStatus();
    for(const b of $$('[data-iw-mark]'))b.onclick=()=>cycle(it,b.dataset.iwMark);
    for(const b of $$('[data-iw-v]'))b.onclick=()=>verdict(it,b.dataset.iwV);
    $('[data-iw-prev]').onclick=()=>{checks.sel--;drawChecks();};$('[data-iw-next]').onclick=()=>{checks.sel++;drawChecks();};
  }
  function bindStatus(){for(const b of $$('[data-iw-cstatus]'))b.onclick=run(async()=>{checks.status=b.dataset.iwCstatus;checks.sel=0;await paintChecks($('#content'));});}
  const verdict=run(async(it,v)=>{
    const note=$('#iw-note')?.value.trim()||'',m=marks(it);
    if(v!=='accept'&&!note){$('#iw-note')?.focus();throw new Error(t('iw.checks.needNote'));}
    const r=await api('/api/workshop/checks',{item_key:it.item_key,verdict:v,face:m.face,body:m.body,note});
    // A rejected catalogue picture goes to the recoverable Removed items, so Play stops using it.
    if(r.remove_media)await api('/api/media/'+encodeURIComponent(r.remove_media)+'/remove',{mode:'catalogue'}).catch(e=>toast(e.message,true));
    toast(t('iw.checks.saved.'+v));checks.items.splice(checks.sel,1);checks.sel=Math.min(checks.sel,Math.max(0,checks.items.length-1));drawChecks();
  });

  // ---- 4. Javaslatok -----------------------------------------------------------------------------
  async function paintSuggestions(){
    const box=$('#iw-body');const [s,tg]=await Promise.all([api('/api/workshop/suggestions'),api('/api/workshop/tagging')]);if(!$('#iw-body'))return;
    box.innerHTML=`<h2>${t('iw.sug.title',{count:s.total})}</h2><p class="muted">${t('iw.sug.lead')}</p>
      <div class="iw-sugs">${s.suggestions.map((x,i)=>`<article class="iw-sug" data-iw-sug="${i}"><p>${x.kind==='content'?t('iw.sug.content',{count:x.media_ids.length,level:t('ml.level.'+x.level)}):t('iw.sug.people',{count:x.media_ids.length+(x.more||0),names:esc(x.names.join(', '))})}
        <small class="muted">${x.reason==='folder'?t('iw.sug.folder',{folder:esc(x.folder),share:x.share}):t('iw.sug.duplicate')}</small></p>
        <div class="iw-refs">${x.examples.map(id=>`<img class="iw-example" src="${small(id)}" alt="" loading="lazy">`).join('')}<span class="iw-arrow">→</span>${x.media_ids.slice(0,8).map(id=>`<img src="${small(id)}" alt="" loading="lazy">`).join('')}</div>
        <div class="we-row"><button class="primary" data-apply>${t('iw.sug.apply')}</button><button class="subtle" data-dismiss>${t('iw.sug.dismiss')}</button></div></article>`).join('')||`<p class="muted">${t('iw.sug.none')}</p>`}</div>
      <h2>${t('iw.tag.title')}</h2>
      <p>${t('iw.tag.lead',{count:tg.untagged,per:tg.per_image_usd===null?'?':tg.per_image_usd.toFixed(3),total:tg.total_usd===null?'?':tg.total_usd.toFixed(2),calls:tg.measured_calls})}</p>
      <ol class="iw-taglist">${tg.next.map(x=>`<li>${esc(x.file)} <small class="muted">${esc(x.people.join(', ')||t('mr.nobody'))}${x.usable!==null?' · '+t('iw.tag.usable',{count:x.usable}):''}</small></li>`).join('')}</ol>
      <div class="we-row"><button id="iw-tagplan"${tg.next.length?'':' disabled'}>${t('iw.tag.plan',{count:tg.next.length})}</button></div><div id="iw-tagcmd"></div>`;
    for(const el of $$('[data-iw-sug]')){const x=s.suggestions[Number(el.dataset.iwSug)];
      el.querySelector('[data-apply]').onclick=run(async()=>{
        if(x.kind==='content')for(const id of x.media_ids)await api('/api/play/content',{media_id:id,level:x.level});
        else await api('/api/media/bulk',{operation:'assign',media_ids:x.media_ids,character_ids:x.character_ids});
        toast(t('iw.sug.applied',{count:x.media_ids.length}));await paintSuggestions();});
      el.querySelector('[data-dismiss]').onclick=run(async()=>{await api('/api/workshop/suggestions/dismiss',{key:x.key});el.remove();});}
    $('#iw-tagplan').onclick=run(async()=>{const p=await api('/api/workshop/tagging/plan',{limit:25});
      $('#iw-tagcmd').innerHTML=`<p>${t('iw.tag.written',{count:p.count,usd:p.usd===null?'?':p.usd.toFixed(2)})}</p><p class="muted">${t('iw.tag.estimateFirst')}</p><pre>${esc(p.estimate_command)}</pre><p class="muted">${t('iw.tag.thenTrial')}</p><pre>${esc(p.trial_command)}</pre>`;});
  }

  // ---- 5. Készültség -----------------------------------------------------------------------------
  async function paintReadiness(){
    const box=$('#iw-body');const [r,bm]=await Promise.all([api('/api/workshop/readiness'),api('/api/workshop/benchmark').catch(()=>null)]);if(!$('#iw-body'))return;
    box.innerHTML=`<div class="iw-ready">${r.characters.map((c,i)=>`<article class="iw-rcard"><header><b>${esc(c.name)}</b><span class="iw-score" data-iw-score="${c.score}">${c.score}%</span></header>
        <div class="iw-meter"><span data-iw-meter="${c.score}"></span></div>
        <ul>${c.checks.map(x=>`<li class="${x.ok?'ok':''}">${x.ok?'✓':'•'} ${t('iw.ready.'+x.id)}${x.detail!==undefined?` <small class="muted">(${esc(String(x.detail))})</small>`:''}</li>`).join('')}</ul>
        ${c.next?`<button class="primary" data-iw-fix="${i}">${t('iw.fix.'+c.next.fix)}</button>`:`<p class="muted">${t('iw.ready.done')}</p>`}</article>`).join('')||`<p class="muted">${t('iw.ready.noCast')}</p>`}</div>
      ${bm?`<section class="iw-bench"><h2>${t('iw.bench.title')}</h2><p class="muted">${t('iw.bench.lead')}</p>
        <p>${t('iw.bench.counts',{ready:bm.characters_ready,solo:bm.available.solo,multi:bm.available.multi,unknown:bm.available.unknown})}</p>
        <p>${t('iw.bench.sample',{count:bm.count,usd:bm.estimate.estimated_additional_usd.toFixed(2)})}</p>
        <div class="we-row"><button id="iw-bench"${bm.count?'':' disabled'}>${t('iw.bench.save')}</button><span id="iw-bench-out" class="muted"></span></div></section>`:''}`;
    // Meter widths through the CSSOM (the page's CSP forbids inline style attributes).
    for(const el of $$('[data-iw-meter]'))el.style.width=el.dataset.iwMeter+'%';
    for(const b of $$('[data-iw-fix]'))b.onclick=()=>{const c=r.characters[Number(b.dataset.iwFix)];
      if(c.next.fix==='profile')openProfile(c.character_id);
      else if(c.next.fix==='generate'){tab='generation';render($('#content'));}
      else{tab='inbox';inbox.character=c.character_id;inbox.missing=c.next.id==='levels'?'content':'any';render($('#content'));}};
    if($('#iw-bench'))$('#iw-bench').onclick=run(async()=>{const o=await api('/api/workshop/benchmark',{});const out=$('#iw-bench-out');if(out)out.textContent=t('iw.bench.saved',{count:o.count,file:o.file});});
  }

  return {render,leave};
}
