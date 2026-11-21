import {sortNames,searchableSelect} from './name-picker.js';
// Quick tagging screen: confirm who is who (p1, p2…) in AI-analysed pictures, a page at a time.
// Suggestions come only from characters already linked to each picture; nothing is saved
// until you press confirm, and only the ticked cards are saved.
import {t} from './i18n.js';

const SPECIAL=['unknown','not_character','ignore'];

export function installQuickTag({$,$$,esc,api,toast,mediaDialog,getState}){
  let initialized=false;const namedCharacters=()=>sortNames(getState().characters);
  let group='single',offset=0,data=null,choices=[],busy=false,counts=null;
  // "Egyéb" filters and the brush (a character applied by clicking person rows).
  let fChar='',fPeople='',fUnlinked=false,brush='';
  const palorCharacter=()=>namedCharacters().find(c=>c.name.trim().toLocaleLowerCase('hu')==='palor');
  // Single place that changes a person's choice and keeps select, chips and tick box in sync.
  function setChoice(index,person,choice){
    if(choice)choices[index][person]=choice;else delete choices[index][person];
    const value=encode(choice),select=$(`[data-qt-person="${index}"][data-person="${person}"]`);if(select)select.value=value;
    for(const chip of $$(`[data-qt-chip="${index}"][data-person="${person}"]`))chip.classList.toggle('active',choice?.state==='character'&&chip.dataset.cid===choice.character_id);
    const box=$(`[data-qt-select="${index}"]`);if(box&&!box.disabled)box.checked=complete(index);updateToolbar();
  }
  // Location tab state: search text, filters, page and the chosen location.
  let locQuery='',locUntagged=true,locNoAi=false,locNeutral=false,locSuggested=false,locOffset=0,locData=null,locPlace='';
  const heading=()=>`<div class="heading"><div><div class="eyebrow">${t('qt.kicker')}</div><h1>${t('qt.title')}</h1><p>${t('qt.lead')}</p></div></div>`;
  const tabs=()=>`<div class="tabs">${['single','pair','other'].map(key=>`<button type="button" data-qt-group="${key}" class="${group===key?'active':''}">${t('qt.group.'+key)}${counts?' · '+counts[key]:''}</button>`).join('')}<button type="button" data-qt-group="locations" class="${group==='locations'?'active':''}">${t('qt.group.locations')}</button></div>`;
  function bindTabs(host){for(const button of $$('[data-qt-group]'))button.classList.toggle('qt-empty',button.dataset.qtGroup!=='locations'&&counts&&counts[button.dataset.qtGroup]===0);for(const b of $$('[data-qt-group]'))b.onclick=()=>{group=b.dataset.qtGroup;offset=0;render(host).catch(e=>toast(e.message,true));};}

  // Encodes a choice as a <select> value: 'c:<id>' for a character, or a special state.
  const encode=choice=>!choice?'':choice.state==='character'?'c:'+choice.character_id:choice.state;
  const decode=value=>!value?null:value.startsWith('c:')?{state:'character',character_id:value.slice(2)}:{state:value};
  // A card is ready once at least one person is picked; unpicked people are removed on confirm.
  const complete=index=>{const people=data.items[index].participants;return !people.length||people.some(p=>choices[index][p.id]);};

  function options(item,selected){
    const linked=new Set(item.linked.map(c=>c.id));
    const others=namedCharacters().filter(c=>!linked.has(c.id));
    const option=(value,label)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
    // Groups stand for several people and may be chosen for more than one person.
    const name=c=>c.is_group?t('qt.groupName',{name:c.name}):c.name;
    return option('',t('qt.choose'))
      +(item.linked.length?`<optgroup label="${esc(t('qt.linkedGroup'))}">${sortNames(item.linked).map(c=>option('c:'+c.id,name(c))).join('')}</optgroup>`:'')
      +`<optgroup label="${esc(t('qt.allGroup'))}">${sortNames(others).map(c=>option('c:'+c.id,name(c))).join('')}</optgroup>`
      +`<optgroup label="${esc(t('qt.otherGroup'))}">${SPECIAL.map(s=>option(s,t('qt.special.'+s))).join('')}</optgroup>`;
  }

  function card(item,index){
    // One-click chips: the picture's linked characters plus Palor; "Más…" dropdown for anyone else.
    const chipChars=[...item.linked];const palor=palorCharacter();if(palor&&!chipChars.some(c=>c.id===palor.id))chipChars.push(palor);
    const people=item.participants.map(p=>{const current=choices[index][p.id];return `<div class="qt-person" data-qt-row="${index}" data-person="${esc(p.id)}"><span>${esc(p.id)}${p.description?' · '+esc(p.description):''}</span><div class="qt-chips">${chipChars.map(c=>`<button type="button" class="qt-chip${current?.character_id===c.id?' active':''}" data-qt-chip="${index}" data-person="${esc(p.id)}" data-cid="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div><select data-qt-person="${index}" data-person="${esc(p.id)}" aria-label="${esc(t('qt.other'))}">${options(item,encode(current))}</select></div>`;}).join('');
    const preview=item.kind==='video'?`<video src="/media/${encodeURIComponent(item.media_id)}" preload="metadata" muted></video>`:`<img src="/thumb/${encodeURIComponent(item.media_id)}?w=640" loading="lazy" alt="${esc(item.filename)}">`;
    return `<article class="qt-card" data-qt-card="${index}"><label class="qt-select"><input type="checkbox" data-qt-select="${index}" ${complete(index)?'checked':''} aria-label="${esc(t('qt.selectCard',{name:item.filename}))}"></label><button type="button" class="qt-thumb" data-qt-open="${esc(item.media_id)}" title="${esc(t('qt.openFull'))}">${preview}</button><div class="qt-people">${people||`<p class="muted">${t('qt.noPeople')}</p>`}</div>${item.participants.length===2?`<button type="button" class="subtle qt-swap" data-qt-swap="${index}">${t('qt.swap')}</button>`:''}<label class="qt-check"><input type="checkbox" data-qt-collage="${index}" ${item.collage?'checked':''}> ${t('qt.collage')}</label><small class="qt-file" title="${esc(item.folder+'\\'+item.filename)}">${esc(item.filename)}</small><div class="qt-card-actions"><button type="button" class="subtle qt-exclude" data-qt-plan="${index}">${t('qt.plan')}</button><button type="button" class="subtle qt-exclude" data-qt-exclude="${index}">${t('qt.exclude')}</button></div><p class="qt-error" role="status"></p></article>`;
  }

  function selected(){return $$('[data-qt-select]:checked').map(box=>Number(box.dataset.qtSelect));}
  function updateToolbar(){const n=selected().length;$('#qt-count').textContent=t('sort.selectedOnPage',{count:n});$('#qt-confirm').disabled=!n||busy;$('#qt-confirm').textContent=t('qt.confirm',{count:n});}

  async function render(host){
    if(!initialized){const summary=await api('/api/quick-tag/summary');counts=summary.identity;group=['single','pair','other'].find(key=>counts[key]>0)||(summary.locations?.untagged?'locations':'single');initialized=true;}
    if(group==='locations')return renderLocations(host);
    const params=new URLSearchParams({group,offset});if(group==='other'){if(fChar)params.set('character_id',fChar);if(fPeople)params.set('people',fPeople);if(fUnlinked)params.set('unlinked','1');}
    data=await api('/api/quick-tag?'+params);counts=data.counts;
    if(offset&&offset>=data.total&&data.total){offset=Math.max(0,Math.floor((data.total-1)/48)*48);return render(host);}
    choices=data.items.map(item=>({...item.suggested}));
    host.innerHTML=heading()+tabs()
      +`<div class="note">${t('qt.hint.'+group)}</div>`
      +(group==='other'?`<div class="toolbar qt-filters"><label class="qt-place">${t('qt.filterCharacter')}<select id="qt-f-char"><option value="">${t('qt.filterAll')}</option>${data.characters.map(c=>`<option value="${esc(c.id)}" ${c.id===fChar?'selected':''}>${esc(c.name)} (${c.count})</option>`).join('')}</select></label><label class="qt-place">${t('qt.filterPeople')}<select id="qt-f-people">${['','3','4','5+'].map(v=>`<option value="${v}" ${v===fPeople?'selected':''}>${v||t('qt.filterAll')}</option>`).join('')}</select></label><label class="qt-check"><input type="checkbox" id="qt-f-unlinked" ${fUnlinked?'checked':''}> ${t('qt.filterUnlinked',{count:data.unlinked_count})}</label><span class="count">${t('library.matching',{count:data.total})}</span></div>`:'')
      +`<div class="toolbar qt-brushbar"><label class="qt-place"><i class="qt-brush-icon">🖌</i> ${t('qt.brush')}<select id="qt-brush"><option value="">${t('qt.brushOff')}</option>${namedCharacters().map(c=>`<option value="${esc(c.id)}" ${c.id===brush?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><small class="muted">${t('qt.brushHint')}</small></div>`
      +`<div class="bulk-toolbar qt-toolbar"><strong id="qt-count" aria-live="polite"></strong><button type="button" id="qt-all">${t('sort.selectVisible')}</button><button type="button" id="qt-none">${t('sort.clearSelection')}</button><button type="button" id="qt-confirm" class="primary"></button><small>${t('qt.keyboard')}</small></div>`
      +(data.items.length?`<div class="qt-grid">${data.items.map(card).join('')}</div>`:`<div class="empty"><div class="symbol">✓</div><h2>${t('qt.emptyTitle')}</h2><p>${t('qt.emptyText')}</p></div>`)
      +(data.total>48?`<div class="pager"><button id="qt-prev" ${offset?'':'disabled'}>${t('common.previous')}</button><span>${t('common.pageRange',{from:offset+1,to:Math.min(offset+48,data.total),total:data.total})}</span><button id="qt-next" ${offset+48>=data.total?'disabled':''}>${t('common.next')}</button></div>`:'');
    bind(host);updateToolbar();
  }

  // ── Location tab ──────────────────────────────────────────────────────────
  function locationCard(item,index){
    const preview=item.kind==='video'?`<video src="/media/${encodeURIComponent(item.media_id)}" preload="metadata" muted></video>`:`<img src="/thumb/${encodeURIComponent(item.media_id)}?w=640" loading="lazy" alt="${esc(item.filename)}">`;
    const guess=item.ai_label?`<p class="qt-guess"><b>${t('qt.aiGuess')}</b> ${esc(item.ai_label)}${item.ai_settings.length?' · '+esc(item.ai_settings.join(', ')):''}</p>`:`<p class="qt-guess muted">${t('qt.noAi')}</p>`;
    const s=item.suggestion,hint=s?`<div class="qt-suggest"><span><b>${t('qt.suggest')}</b> ${esc(s.name)}<small>${esc(t('qt.suggestWhy.'+s.reason,{count:s.count||0,total:s.total||0}))}</small></span><button type="button" class="primary" data-ql-accept="${index}">${t('qt.accept')}</button></div>`:'';
    return `<article class="qt-card" data-ql-card="${index}"><label class="qt-select"><input type="checkbox" data-ql-select="${index}" ${locQuery?'checked':''} aria-label="${esc(t('qt.selectCard',{name:item.filename}))}"></label><button type="button" class="qt-thumb" data-qt-open="${esc(item.media_id)}" title="${esc(t('qt.openFull'))}">${preview}</button>${hint}${guess}${item.locations.length?`<p class="qt-guess"><b>${t('qt.already')}</b> ${esc(item.locations.join(', '))}</p>`:''}${item.characters.length?`<small class="qt-people-names">${esc(item.characters.join(' · '))}</small>`:''}<small class="qt-file" title="${esc(item.folder+'\\'+item.filename)}">${esc(item.folder?item.folder.split('\\').pop()+' · ':'')}${esc(item.filename)}</small><div class="qt-card-actions"><button type="button" class="subtle qt-exclude" data-ql-type="collage" data-ql-index="${index}">${t('qt.markCollage')}</button><button type="button" class="subtle qt-exclude" data-ql-type="reference" data-ql-index="${index}">${t('qt.markReference')}</button><button type="button" class="subtle qt-exclude" data-ql-trash="${index}">${t('qt.trash')}</button></div></article>`;
  }
  function locSelected(){return $$('[data-ql-select]:checked').map(box=>Number(box.dataset.qlSelect));}
  function updateLocToolbar(){const n=locSelected().length;$('#ql-count').textContent=t('sort.selectedOnPage',{count:n});const apply=$('#ql-apply');apply.disabled=!n||!locPlace||busy;apply.textContent=t('qt.applyLocation',{count:n});}
  async function renderLocations(host){
    locData=await api('/api/quick-tag/locations?'+new URLSearchParams({q:locQuery,untagged:locUntagged?'1':'0',noai:locNoAi?'1':'0',neutral:locNeutral?'1':'0',suggested:locSuggested?'1':'0',offset:locOffset}));
    const pageHints=locData.items.filter(i=>i.suggestion).length;
    if(locOffset&&locOffset>=locData.total&&locData.total){locOffset=0;return renderLocations(host);}
    if(!locData.places.some(p=>p.id===locPlace))locPlace='';
    host.innerHTML=heading()+tabs()+`<div class="note">${t('qt.hint.locations')}</div>`
      +`<form id="ql-search" class="toolbar"><input id="ql-q" type="search" maxlength="200" value="${esc(locQuery)}" placeholder="${esc(t('qt.searchPlaceholder'))}" aria-label="${esc(t('qt.searchPlaceholder'))}"><label class="qt-check"><input type="checkbox" id="ql-untagged" ${locUntagged?'checked':''}> ${t('qt.onlyUntagged')}</label><label class="qt-check"><input type="checkbox" id="ql-noai" ${locNoAi?'checked':''}> ${t('qt.onlyNoAi')}</label><label class="qt-check"><input type="checkbox" id="ql-neutral" ${locNeutral?'checked':''}> ${t('qt.showNeutral',{count:locData.neutral_hidden})}</label><label class="qt-check"><input type="checkbox" id="ql-suggested" ${locSuggested?'checked':''}> ${t('qt.onlySuggested',{count:locData.suggested_total})}</label><button class="primary">${t('events.searchButton')}</button><span class="count">${t('library.matching',{count:locData.total})}</span></form>`
      +(pageHints?`<div class="qt-suggest-bar"><span>${t('qt.suggestBar',{count:pageHints})}</span><button type="button" id="ql-accept-all" class="primary">${t('qt.acceptAll',{count:pageHints})}</button></div>`:'')
      +`<div class="bulk-toolbar qt-toolbar"><strong id="ql-count" aria-live="polite"></strong><button type="button" id="ql-all">${t('sort.selectVisible')}</button><button type="button" id="ql-none">${t('sort.clearSelection')}</button><label class="qt-place">${t('qt.location')}<select id="ql-place"><option value="">${t('qt.choose')}</option>${locData.places.map(p=>`<option value="${esc(p.id)}" ${p.id===locPlace?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button type="button" id="ql-apply" class="primary"></button><small>${t('qt.locationNote')}</small></div>`
      +(locData.items.length?`<div class="qt-grid">${locData.items.map(locationCard).join('')}</div>`:`<div class="empty"><div class="symbol">⌖</div><h2>${t('qt.noResults')}</h2><p>${t('qt.noResultsText')}</p></div>`)
      +(locData.total>96?`<div class="pager"><button id="ql-prev" ${locOffset?'':'disabled'}>${t('common.previous')}</button><span>${t('common.pageRange',{from:locOffset+1,to:Math.min(locOffset+96,locData.total),total:locData.total})}</span><button id="ql-next" ${locOffset+96>=locData.total?'disabled':''}>${t('common.next')}</button></div>`:'');
    bindTabs(host);
    $('#ql-search').onsubmit=e=>{e.preventDefault();locQuery=$('#ql-q').value.trim();locUntagged=$('#ql-untagged').checked;locNoAi=$('#ql-noai').checked;locNeutral=$('#ql-neutral').checked;locSuggested=$('#ql-suggested').checked;locOffset=0;renderLocations(host).catch(err=>toast(err.message,true));};
    $('#ql-suggested').onchange=()=>$('#ql-search').requestSubmit();
    // Suggestions are only applied on click: one card, or every suggestion on this page.
    for(const b of $$('[data-ql-accept]'))b.onclick=()=>acceptHints(host,[Number(b.dataset.qlAccept)]).catch(e=>toast(e.message,true));
    if($('#ql-accept-all'))$('#ql-accept-all').onclick=()=>acceptHints(host,locData.items.map((item,i)=>item.suggestion?i:-1).filter(i=>i>=0)).catch(e=>toast(e.message,true));
    $('#ql-all').onclick=()=>{for(const box of $$('[data-ql-select]'))box.checked=true;updateLocToolbar();};
    $('#ql-none').onclick=()=>{for(const box of $$('[data-ql-select]'))box.checked=false;updateLocToolbar();};
    for(const box of $$('[data-ql-select]'))box.onchange=updateLocToolbar;
    $('#ql-place').onchange=e=>{locPlace=e.target.value;updateLocToolbar();};searchableSelect($('#ql-place'));
    for(const b of $$('[data-qt-open]'))b.onclick=()=>mediaDialog(b.dataset.qtOpen).catch(e=>toast(e.message,true));
    $('#ql-apply').onclick=()=>applyLocation(host).catch(e=>toast(e.message,true));
    // One click, no confirmation (owner request): the file moves to the recoverable
    // trash folder and can be restored from Removed items.
    const finish=index=>{const card=$(`[data-ql-card="${index}"]`);card.classList.add('qt-done');for(const x of card.querySelectorAll('.qt-exclude'))x.disabled=true;const box=$(`[data-ql-select="${index}"]`);box.checked=false;box.disabled=true;updateLocToolbar();};
    for(const b of $$('[data-ql-trash]'))b.onclick=async()=>{
      const index=Number(b.dataset.qlTrash),item=locData.items[index];b.disabled=true;
      try{
        const result=await api('/api/media/'+encodeURIComponent(item.media_id)+'/remove',{mode:'file'});if(result.ok!==true)throw Error(t('sort.removalNotConfirmed'));
        finish(index);toast(t('qt.trashed'));
      }catch(e){b.disabled=false;toast(e.message,true);}
    };
    // Kollázs / Referenciakép: one click, adds the picture-type tag; no location needed.
    for(const b of $$('[data-ql-type]'))b.onclick=async()=>{
      const index=Number(b.dataset.qlIndex),item=locData.items[index];b.disabled=true;
      try{await api('/api/quick-tag/picture-type',{media_ids:[item.media_id],type:b.dataset.qlType});await api('/api/quick-tag/sync',{});finish(index);toast(t(b.dataset.qlType==='collage'?'qt.markedCollage':'qt.markedReference'));}
      catch(e){b.disabled=false;toast(e.message,true);}
    };
    if($('#ql-prev'))$('#ql-prev').onclick=()=>{locOffset=Math.max(0,locOffset-96);renderLocations(host).catch(e=>toast(e.message,true));};
    if($('#ql-next'))$('#ql-next').onclick=()=>{locOffset+=96;renderLocations(host).catch(e=>toast(e.message,true));};
    updateLocToolbar();
  }
  async function acceptHints(host,indices){
    if(busy||!indices.length)return;busy=true;
    for(const b of $$('[data-ql-accept],#ql-accept-all'))b.disabled=true;
    try{
      const byTag=new Map();for(const i of indices){const s=locData.items[i].suggestion;if(!byTag.has(s.tag_id))byTag.set(s.tag_id,[]);byTag.get(s.tag_id).push(locData.items[i].media_id);}
      let updated=0;for(const [tag,ids] of byTag)updated+=(await api('/api/taxonomy/apply',{media_ids:ids,tag_ids:[tag],operation:'add'})).updated;
      const synced=await api('/api/quick-tag/sync',{});
      toast(t('qt.suggestApplied',{count:updated})+(synced.completed?' '+t('qt.sortingSynced',{count:synced.completed}):''));
    }finally{busy=false;}
    await renderLocations(host);
  }
  async function applyLocation(host){
    const place=locData.places.find(p=>p.id===locPlace),indices=locSelected();if(busy||!place||!indices.length)return;
    busy=true;updateLocToolbar();
    try{
      // Additive only: the location's tag is added; existing tags stay.
      const result=await api('/api/taxonomy/apply',{media_ids:indices.map(i=>locData.items[i].media_id),tag_ids:[place.tag_id],operation:'add'});
      const synced=await api('/api/quick-tag/sync',{});
      toast(t('qt.locationApplied',{count:result.updated,place:place.name})+(synced.completed?' '+t('qt.sortingSynced',{count:synced.completed}):''));
    }finally{busy=false;}
    await renderLocations(host);
  }

  function bind(host){
    bindTabs(host);
    $('#qt-all').onclick=()=>{for(const box of $$('[data-qt-select]'))box.checked=true;updateToolbar();};
    $('#qt-none').onclick=()=>{for(const box of $$('[data-qt-select]'))box.checked=false;updateToolbar();};
    for(const box of $$('[data-qt-select]'))box.onchange=updateToolbar;
    for(const select of $$('[data-qt-person]'))select.onchange=()=>setChoice(Number(select.dataset.qtPerson),select.dataset.person,decode(select.value));
    // Chips toggle: clicking the active chip clears the choice.
    for(const chip of $$('[data-qt-chip]'))chip.onclick=e=>{e.stopPropagation();const index=Number(chip.dataset.qtChip),person=chip.dataset.person,current=choices[index][person];setChoice(index,person,current?.character_id===chip.dataset.cid?null:{state:'character',character_id:chip.dataset.cid});};
    // Brush: while a character is chosen, clicking a person row assigns it.
    for(const row of $$('[data-qt-row]'))row.onclick=e=>{if(!brush||e.target.closest('select,button'))return;setChoice(Number(row.dataset.qtRow),row.dataset.person,{state:'character',character_id:brush});};
    $('#qt-brush').onchange=e=>{brush=e.target.value;host.classList.toggle('qt-brushing',!!brush);};host.classList.toggle('qt-brushing',!!brush);searchableSelect($('#qt-brush'));
    if($('#qt-f-char'))$('#qt-f-char').onchange=e=>{fChar=e.target.value;offset=0;render(host).catch(err=>toast(err.message,true));};
    if($('#qt-f-people'))$('#qt-f-people').onchange=e=>{fPeople=e.target.value;offset=0;render(host).catch(err=>toast(err.message,true));};
    if($('#qt-f-unlinked'))$('#qt-f-unlinked').onchange=e=>{fUnlinked=e.target.checked;offset=0;render(host).catch(err=>toast(err.message,true));};
    // One click: remove from the AI list (✕) or mark as a generation plan / comic idea.
    const retire=async(b,index,plan)=>{const item=data.items[index];try{await api('/api/quick-tag/exclude',{media_ids:[item.media_id],plan});const cardNode=$(`[data-qt-card="${index}"]`);cardNode.classList.add('qt-done');const box=$(`[data-qt-select="${index}"]`);box.checked=false;box.disabled=true;for(const x of cardNode.querySelectorAll('.qt-exclude'))x.disabled=true;updateToolbar();toast(plan?t('qt.planned'):t('qt.excluded'));}catch(e){toast(e.message,true);}};
    for(const b of $$('[data-qt-exclude]'))b.onclick=()=>retire(b,Number(b.dataset.qtExclude),false);
    for(const b of $$('[data-qt-plan]'))b.onclick=()=>retire(b,Number(b.dataset.qtPlan),true);
    for(const b of $$('[data-qt-swap]'))b.onclick=()=>{const index=Number(b.dataset.qtSwap),[a,c]=data.items[index].participants.map(p=>p.id),first=choices[index][a],second=choices[index][c];setChoice(index,a,second);setChoice(index,c,first);};
    for(const b of $$('[data-qt-open]'))b.onclick=()=>mediaDialog(b.dataset.qtOpen).catch(e=>toast(e.message,true));
    $('#qt-confirm').onclick=()=>confirm(host).catch(e=>toast(e.message,true));
    if($('#qt-prev'))$('#qt-prev').onclick=()=>{offset=Math.max(0,offset-48);render(host).catch(e=>toast(e.message,true));};
    if($('#qt-next'))$('#qt-next').onclick=()=>{offset+=48;render(host).catch(e=>toast(e.message,true));};
  }

  async function confirm(host){
    if(busy)return;const indices=selected();if(!indices.length)return;
    const incomplete=indices.filter(i=>!complete(i));
    for(const i of incomplete)$(`[data-qt-card="${i}"] .qt-error`).textContent=t('qt.incomplete');
    if(incomplete.length){toast(t('qt.incompleteToast',{count:incomplete.length}),true);return;}
    busy=true;updateToolbar();const button=$('#qt-confirm');let confirmed=0,failed=0,staleCount=0;
    try{
      // Small batches: each picture's file fingerprint is checked before saving.
      for(let start=0;start<indices.length;start+=12){
        const batch=indices.slice(start,start+12);button.textContent=t('qt.saving',{done:start,total:indices.length});
        const result=await api('/api/quick-tag/confirm',{items:batch.map(i=>({source_id:data.items[i].source_id,source_sha256:data.items[i].source_sha256,expected_version:data.items[i].version,choices:choices[i],collage:Boolean($(`[data-qt-collage="${i}"]`)?.checked)}))});
        result.results.forEach((r,k)=>{const i=batch[k],cardNode=$(`[data-qt-card="${i}"]`);if(r.ok){confirmed++;if(r.stale){staleCount++;if(cardNode)cardNode.querySelector('.qt-error').textContent=t('qt.staleSaved');}cardNode?.classList.add('qt-done');const box=$(`[data-qt-select="${i}"]`);if(box){box.checked=false;box.disabled=true;}}else{failed++;if(cardNode)cardNode.querySelector('.qt-error').textContent=r.error;}});
      }
    }finally{busy=false;}
    toast((failed?t('qt.resultWithErrors',{confirmed,failed}):t('qt.result',{confirmed}))+(staleCount?' '+t('qt.staleToast',{count:staleCount}):''),Boolean(failed));
    if(!failed)await render(host);else updateToolbar();
  }

  function controls(){document.addEventListener('keydown',e=>{if(e.key==='Escape'&&brush&&$('#qt-brush')&&!$('#dialog').open){brush='';$('#qt-brush').value='';$('#content').classList.remove('qt-brushing');return;}if(!(e.ctrlKey||e.metaKey)||e.key!=='Enter'||$('#dialog').open)return;const target=$('#qt-confirm')||$('#ql-apply');if(target&&!target.disabled){e.preventDefault();target.click();}});}
  return {render,controls,reset:()=>{offset=0;},open:(nextGroup,query='')=>{initialized=true;group=nextGroup;offset=0;if(nextGroup==='locations'){locQuery=query;locOffset=0;}}};
}
