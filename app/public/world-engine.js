// "Élő világ" screen: world-engine switch and cost cap, what happened while away,
// serious events to accept/refuse, messages to Palor, place links and relationship levels.
import {t} from './i18n.js';

export function installWorldEngineUI({$,$$,esc,api,toast,heading,openPlay=()=>{},openProfile=()=>{}}){
  let levelsOpen=false;
  const usd=v=>Number(v||0).toFixed(v<0.1?4:2);
  // The last world round, step by step (2026-11-13): finished, still running, or stopped half-way
  // and why. A round that did not finish stays due and runs again at the next check.
  const roundLine=r=>{
    if(!r)return '';const when=new Date(r.started_at).toLocaleString('hu-HU');
    const step=t('we.roundStep.'+r.step),agents=`${r.agents_done||0}/${r.agents_total||0}`;
    const text=r.step==='done'?t('we.roundDone',{when,events:r.events??0,agents}):r.error?t('we.roundStopped',{when,step,agents,message:r.error.message}):t('we.roundRunning',{when,step,agents});
    return `<p class="we-round${r.error?' we-round-bad':''}">${esc(text)}${r.truncated?` <em>${esc(t('we.roundTruncated',{count:r.salvaged??0}))}</em>`:''}</p>`;
  };
  const roleOptions=sel=>['home','work','routine','other'].map(r=>`<option value="${r}"${r===sel?' selected':''}>${t('we.role.'+r)}</option>`).join('');
  const eventCard=(e,actions='')=>`<article class="we-event we-${e.kind}"><div class="we-event-head"><b>${esc(e.title)}</b><small>${esc(e.world_day)}${e.slot?' '+esc(e.slot):''} · ${t('we.kind.'+e.kind)}${e.location?' · '+esc(e.location):''}</small></div><p>${esc(e.summary)}</p><small class="we-people">${e.characters.map(c=>esc(c.name)).join(', ')}</small>${e.level_changes.length?`<small class="we-levels">${e.level_changes.map(l=>esc(t('we.levelChange',{source:l.source_name,target:l.target_name,delta:(l.delta>0?'+':'')+l.delta}))).join(' · ')}</small>`:''}${actions}</article>`;

  async function render(root){
    const [s,ready,ins,gen,social]=await Promise.all([api('/api/world-engine'),api('/api/play/readiness').catch(()=>null),api('/api/play/inserts').catch(()=>({inserts:[]})),api('/api/play/generation').catch(()=>null),api('/api/world-engine/social').catch(()=>null)]);
    const st=s.settings;
    // Owner only: what the characters think of people, and who heard what from whom.
    const socialHtml=social?`<section class="we-section"><h2>${t('we.socialTitle')}</h2><p class="muted">${t('we.socialLead')}</p>
      ${social.beliefs.length?`<table class="we-table"><tbody>${social.beliefs.map(b=>`<tr><td><b>${esc(b.character_name)}</b> → ${esc(b.about_name)}</td><td>${esc(b.text)}</td><td class="muted">${esc(b.world_day)} · ${t('we.socialMemories',{count:b.memory_count})}</td></tr>`).join('')}</tbody></table>`:`<p class="muted">${t('we.socialNoBeliefs')}</p>`}
      ${social.told.length?`<details class="we-log"><summary>${t('we.socialTold',{count:social.told.length})}</summary><table class="we-table"><tbody>${social.told.map(k=>`<tr><td>${esc(k.world_day)}</td><td>${esc(k.via_name)} → ${esc(k.character_name)}</td><td>${esc(k.title)}</td></tr>`).join('')}</tbody></table></details>`:''}
    </section>`:'';
    // Grok picture pipeline: what is missing, and jobs (refused ones can be offered again by the owner).
    const targetLabel=n=>t('we.gen.'+n.target)+(n.expression?' · '+n.expression:'')+(n.time_of_day?' · '+n.time_of_day:'');
    const genHtml=gen?`<section class="we-section"><h2>${t('we.genTitle')}</h2><p class="muted">${t('we.genLead')}</p>
        <p>${t('we.genCounts',{needs:gen.total,done:gen.counts.done||0,refused:gen.counts.refused||0,open:gen.counts.open||0})}</p>
        <div class="we-row"><button class="subtle" id="gen-task">📋 ${t('we.genCopyTask')}</button><button class="subtle" id="gen-find">🔎 ${t('we.genFind')}</button></div><div id="gen-candidates"></div>
        ${gen.needs.length?`<details class="we-log"><summary>${t('we.genNeeds')}</summary><table class="we-table"><tbody>${gen.needs.slice(0,15).map(n=>`<tr><td>${esc(targetLabel(n))}</td><td>${esc(n.name||'')}</td><td class="muted">${esc(n.why)}${n.reference_policy==='text_only'?' · '+esc(t('we.genTextOnly')):''}</td></tr>`).join('')}</tbody></table></details>`:''}
        ${gen.jobs.filter(j=>['refused','failed'].includes(j.status)).length?`<details class="we-log" open><summary>${t('we.genRefused')}</summary><table class="we-table"><tbody>${gen.jobs.filter(j=>['refused','failed'].includes(j.status)).map(j=>`<tr><td>${esc(t('we.gen.'+j.target))}</td><td>${esc(j.character||j.location||'')}</td><td class="muted">${esc(j.status)}${j.note?': '+esc(j.note):''}</td><td><button class="subtle" data-gen-clear="${esc(j.id)}">↺ ${t('we.genRetry')}</button></td></tr>`).join('')}</tbody></table></details>`:''}</section>`:'';
    // What the world still needs to feel alive, per character and for the places.
    const readyHtml=ready?`<section class="we-section"><h2>${t('we.readiness')}</h2>
        <div class="we-ready-grid">${ready.cast.map(c=>`<div class="we-ready"><button class="vn-link" data-open-profile="${esc(c.id)}">${esc(c.name)}</button>
          <span class="${c.figures?'ok':'todo'}">${c.figures?'✓':c.stand_in?'◐':'○'} ${c.figures||!c.stand_in?t('we.readyFigures',{count:c.figures}):t('we.readyStandIn')}</span>
          <span class="${c.has_home?'ok':'todo'}">${c.has_home?'✓':'○'} ${c.has_home?t('we.readyHome'):t('we.readyNoHome')}</span>
          <span class="${c.places?'ok':'todo'}">${c.places?'✓':'○'} ${t('we.readyPlaces',{count:c.places})}</span>
          <span class="${c.photos?'ok':'todo'}">${c.photos?'✓':'○'} ${t('we.readyPhotos',{count:c.photos})}</span>
          <button class="subtle" data-figure-prompt="${esc(c.id)}">📋 ${t('we.figurePrompt')}</button></div>`).join('')}</div>
        ${ready.next_profiles?.length?`<p><b>${t('we.nextProfiles')}</b> ${ready.next_profiles.map(c=>`<button class="vn-link" data-open-profile="${esc(c.id)}">${esc(c.name)}</button> <small class="muted">(${c.photos})</small>`).join(', ')}</p>`:''}<div id="we-prompt"></div>${ins.inserts.length?`<details class="we-log"><summary>${t('we.inserts')}</summary><table class="we-table"><tbody>${ins.inserts.map(i=>`<tr><td>${esc(new Date(i.created_at).toLocaleString('hu-HU'))}</td><td>${esc(i.character||'')}</td><td>${esc(i.source)}</td><td class="muted">${esc(i.relative_path.split(/[\\/]/).slice(-2).join(' / '))}</td></tr>`).join('')}</tbody></table></details>`:''}
        <p class="muted">${t('we.readyCast',{cast:ready.cast.length,total:ready.characters_total})}</p>
        ${ready.cast.some(c=>!c.figures)?`<div class="we-row"><button class="subtle" id="we-missing-figures">📋 ${t('we.copyMissingFigures',{count:ready.cast.filter(c=>!c.figures).length})}</button></div>`:''}
        <p>${t('we.readyBackgrounds',{done:ready.places_with_background,total:ready.places_on_map})}${ready.missing_backgrounds.length?` <details class="we-missing"><summary>${t('we.readyMissing',{count:ready.missing_backgrounds.length})}</summary><p class="muted">${t('we.bgPromptLead')}</p><div class="we-chips">${ready.missing_backgrounds.map(b=>`<button class="we-chip" data-bg-prompt="${esc(b.location_id)}" title="${esc(t('we.bgPromptCopy'))}">📋 ${esc(b.name)}</button>`).join('')}</div></details>`:''}</p></section>`:'';
    const statusLines=[s.provider?t('we.provider',{model:s.provider.model}):t('we.noProvider'),t('we.spent',{spent:usd(s.spent_today_usd),cap:usd(st.daily_cap_usd)}),t('we.estimate',{value:usd(s.estimate_per_day_usd)}),...(s.uncertain_today_usd>0?[t('we.uncertain',{value:usd(s.uncertain_today_usd)})]:[]),t('we.lastDay',{day:st.last_day?st.last_day+' '+(st.last_slot||''):t('we.never')}),...(st.paused_at?[t('we.pausedSince',{at:new Date(st.paused_at).toLocaleString('hu-HU')})]:[]),...(st.enabled&&st.resumed?[t('we.resumedFrom',{day:st.resumed.from_day})]:[]),...(st.last_error?[t('we.lastError',{message:st.last_error.message})]:[])];
    // Media director test bench: what Play would show for these people, here, in this mood.
    const labHtml=`<section class="we-section"><details id="ml-box"><summary><b>${t('ml.title')}</b></summary><p class="muted">${t('ml.lead')}</p>
      <form id="ml-form" class="ml-form"><label>${t('ml.panel')}<select name="panel">${['journal','scene','phone','portrait','memory'].map(p=>`<option value="${p}">${t('ml.panel.'+p)}</option>`).join('')}</select></label>
        <label>${t('ml.mood')}<select name="mood">${['everyday','flirt','intimate'].map(m=>`<option value="${m}">${t('ml.mood.'+m)}</option>`).join('')}</select></label>
        <label class="ml-wide">${t('ml.characters')}<select name="characters" multiple size="6"></select></label>
        <label>${t('ml.place')}<select name="location"><option value="">${t('ml.anywhere')}</option></select></label>
        <label>${t('ml.progress')}<select name="progress"><option value="">—</option><option value="0">${t('ml.progress.start')}</option><option value="1">${t('ml.progress.late')}</option></select></label>
        <label>${t('ml.daypart')}<select name="daypart"><option value="">—</option><option value="day">${t('ml.daypart.day')}</option><option value="night">${t('ml.daypart.night')}</option></select></label>
        <label class="ml-wide">${t('ml.context')}<input name="context" maxlength="300" placeholder="${esc(t('ml.contextHint'))}"></label>
        <button class="primary">${t('ml.run')}</button></form><div id="ml-result"></div></details></section>`;
    root.innerHTML=heading(t('world.kicker'),t('world.title'),t('world.lead'),`<button id="we-play" class="primary">▶ ${t('we.openPlay')}</button>`)+readyHtml+genHtml+labHtml+
      `<section class="we-section we-today"><div><b>${t('we.todayTitle')}</b> ${t('we.todayLine',{events:s.today.events,messages:s.today.messages})}</div>
        <div class="we-bar" title="${esc(t('we.spent',{spent:usd(s.spent_today_usd),cap:usd(st.daily_cap_usd)}))}"><span id="we-bar-fill" data-pct="${Math.min(100,Math.round(100*s.spent_today_usd/Math.max(st.daily_cap_usd,0.0001)))}"></span></div>
        <small class="muted">${s.due.length?t('we.dueNow',{list:s.due.map(d=>d.day+' '+d.slot).join(', ')}):t('we.nextSlot',{slot:s.next_slot})}</small>
        <button class="subtle" id="we-export">⬇ ${t('we.export')}</button></section>
      <section class="we-section"><h2>${t('we.status')}</h2>
        <label class="we-toggle"><input type="checkbox" id="we-enabled"${st.enabled?' checked':''}> ${t('we.enabled')}</label>
        <label class="we-toggle"><input type="checkbox" id="we-while-playing"${st.while_playing?' checked':''}${st.enabled?' disabled':''}> ${t('we.whilePlaying')}</label>
        <p class="muted">${t(st.enabled?'we.whilePlayingOverridden':s.playing&&st.while_playing?'we.whilePlayingNow':'we.whilePlayingLead')}</p>
        <div class="we-row"><label>${t('we.cap')} <input id="we-cap" type="number" min="0" max="20" step="0.1" value="${esc(st.daily_cap_usd)}"></label><button id="we-save-cap" class="subtle">${t('we.saveCap')}</button></div>
        ${s.models?.length?`<div class="we-row"><label>${t('we.model')} <select id="we-model">${s.models.map(m=>`<option value="${esc(m.id)}"${st.model===m.id?' selected':''}>${esc(m.label)} · ${esc(t('we.modelPrice',{input:m.prices.input,output:m.prices.output}))}</option>`).join('')}</select></label></div><p class="muted">${t('we.modelHint')}</p>`:''}
        ${s.models?.length?`<div class="we-row"><label>${t('we.worldModel')} <select id="we-world-model">${s.models.map(m=>`<option value="${esc(m.id)}"${st.world_model===m.id?' selected':''}>${esc(m.label)} · ${esc(t('we.modelPrice',{input:m.prices.input,output:m.prices.output}))}</option>`).join('')}</select></label></div><p class="muted">${t('we.worldModelHint')}</p>`:''}
        ${roundLine(s.round)}
        <div class="we-row"><label>${t('we.tempo')} <select id="we-tempo">${['calm','normal','lively'].map(x=>`<option value="${x}"${st.tempo===x?' selected':''}>${t('we.tempo.'+x)}</option>`).join('')}</select></label></div>
        <ul class="we-status">${statusLines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>
        ${s.usage_history?.length?`<details class="we-log"><summary>${t('we.costHistory')}</summary><table class="we-table"><tbody>${s.usage_history.map(u=>`<tr><td>${esc(u.day)}</td><td>${u.calls} ${t('we.calls')}</td><td>$${Number(u.cost_usd).toFixed(4)}</td><td>${u.input_tokens>0?t('we.cachedShare',{percent:Math.round(100*(u.cached_tokens||0)/u.input_tokens)}):''}</td></tr>`).join('')}</tbody></table></details>`:''}
        ${s.runs?.length?`<details class="we-log"><summary>${t('we.runLog')}</summary><table class="we-table"><tbody>${s.runs.map(r=>`<tr><td>${esc(r.world_day)} ${esc(r.slot||'')}</td><td>${t('we.runLine',{events:r.events,messages:r.messages,dropped:r.dropped})}</td><td>$${Number(r.cost_usd).toFixed(4)}</td></tr>`).join('')}</tbody></table></details>`:''}
        <div class="we-row"><button id="we-run" class="primary"${st.enabled&&s.provider&&!s.running?'':' disabled'}>${t('we.run')}</button><button id="we-extra" class="subtle"${st.enabled&&s.provider&&!s.running?'':' disabled'}>${t('we.extra')}</button>${s.running?`<span>${t('we.running')}</span>`:''}</div></section>`+
      (s.proposed.length?`<section class="we-section"><h2>${t('we.proposed')}</h2><p class="muted">${t('we.proposedLead')}</p>${s.proposed.map(e=>eventCard(e,`<div class="we-row"><button class="primary" data-we-accept="${e.id}">${t('we.accept')}</button><button class="subtle" data-we-refuse="${e.id}">${t('we.refuse')}</button></div>`)).join('')}</section>`:'')+
      `<section class="we-section"><h2>${t('we.away')}</h2>${s.unseen.length?[...new Set(s.unseen.map(e=>e.world_day))].map(d=>`<h3 class="jr-day">${esc(d)}</h3>`+s.unseen.filter(e=>e.world_day===d).map(e=>eventCard(e)).join('')).join('')+`<button id="we-seen" class="subtle">${t('we.markSeen')}</button>`:`<p class="muted">${t('we.nothing')}</p>`}</section>`+
      `<section class="we-section"><h2>${t('we.messages')}</h2>${s.messages.length?s.messages.map(m=>`<article class="we-message"><b>${esc(m.from)}</b> <small>${esc(m.world_day)}</small><p>${esc(m.text)}</p></article>`).join(''):`<p class="muted">${t('we.noMessages')}</p>`}</section>`+
      `<section class="we-section"><h2>${t('we.places')}</h2><p class="muted">${t('we.placesLead')}</p><button id="we-suggest" class="subtle">${t('we.suggestPlaces')}</button>
        ${s.characters.length?s.characters.map(c=>`<div class="we-character"><h3>${esc(c.name)}</h3><div class="we-chips">${c.places.length?c.places.map(p=>`<span class="we-chip">${esc(p.location_name)} <select class="we-role" aria-label="${esc(t('we.roleLabel'))}" data-we-role-of="${p.id}">${['home','work','routine','other'].map(r=>`<option value="${r}"${r===p.role?' selected':''}>${t('we.role.'+r)}</option>`).join('')}</select><button class="subtle" data-we-remove="${p.id}" aria-label="✕">✕</button></span>`).join(''):`<small class="muted">${t('we.noPlaces')}</small>`}</div>
          <div class="we-row"><select data-we-loc="${c.id}" aria-label="${esc(t('we.placeLabel'))}">${s.locations.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><select data-we-role="${c.id}" aria-label="${esc(t('we.roleLabel'))}">${roleOptions('routine')}</select><button class="subtle" data-we-add="${c.id}">${t('we.addPlace')}</button></div></div>`).join(''):`<p class="muted">${t('we.noCast')}</p>`}</section>`+
      socialHtml+`<section class="we-section"><h2>${t('we.levels')}</h2><p class="muted">${t('we.levelsLead')}</p><div class="we-row"><button id="we-propose-levels" class="subtle"${s.provider?'':' disabled'}>${t('we.proposeLevels')}</button><button id="we-show-levels" class="subtle">${t('we.showLevels')}</button></div><div id="we-levels"></div></section>`;
    bind(root,s);bindLab();
    if(levelsOpen)await renderLevels(s.level_labels);
  }
  function bindLab(){
    const box=$('#ml-box');if(!box)return;let loaded=false;
    box.addEventListener('toggle',wrap(async()=>{if(!box.open||loaded)return;loaded=true;
      const [st,places]=await Promise.all([api('/api/state'),api('/api/quick-tag/locations?untagged=0&q=__none__')]);
      const form=$('#ml-form');
      form.characters.innerHTML=st.characters.slice().sort((a,b)=>a.name.localeCompare(b.name,'hu')).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      form.location.insertAdjacentHTML('beforeend',places.places.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''));
    }));
    $('#ml-form').onsubmit=wrap(async e=>{e.preventDefault();const f=e.target,characters=[...f.characters.selectedOptions].map(o=>o.value);
      if(!characters.length){toast(t('ml.pickSomeone'),true);return;}
      const q=new URLSearchParams({panel:f.panel.value,mood:f.mood.value,characters:characters.join(','),location:f.location.value,context:f.context.value,progress:f.progress.value,daypart:f.daypart.value,limit:'8'});
      const r=await api('/api/play/media/pick?'+q);const out=$('#ml-result');
      out.innerHTML=`<p class="muted">${t('ml.summary',{total:r.total,level:t('ml.level.'+(r.max_level||'non_intimate'))})}</p>`+(r.items.length?`<div class="ml-grid">${r.items.map((m,i)=>`<article class="ml-card"><div class="ml-thumb${m.level!=='non_intimate'?' ml-blur':''}" data-ml-reveal>${m.kind==='video'?`<video src="/media/${encodeURIComponent(m.media_id)}" muted preload="metadata"></video>`:`<img src="/thumb/${encodeURIComponent(m.media_id)}" alt="" loading="lazy">`}<span class="ml-rank">${i+1}</span></div>
        <small><b>${t('ml.level.'+m.level)}</b> · ${t('ml.score',{score:m.score})}${m.kind==='video'?' · '+t('ml.video'):''}${m.complete?'':' · '+t('ml.partial')} · ${t('ml.confidence.'+m.confidence)}</small><small class="muted">${esc(m.reasons.join(' · '))}</small>
        <div class="we-row"><button class="subtle" data-ml-verdict="1" data-ml-media="${esc(m.media_id)}">👍 ${t('play.mediaFits')}</button><button class="subtle" data-ml-verdict="-1" data-ml-media="${esc(m.media_id)}" aria-label="${esc(t('play.mediaWrong'))}">👎</button></div>
        <label class="ml-level">${t('ml.setLevel')}<select data-ml-level="${esc(m.media_id)}"><option value="">—</option>${['non_intimate','nudity','sexual_activity'].map(l=>`<option value="${l}">${t('ml.level.'+l)}</option>`).join('')}</select></label></article>`).join('')}</div>`:`<p>${t('ml.nothing')}</p>`);
      // The creator's own label beats the AI analysis (and the "unknown counts as intimate" rule).
      for(const s of out.querySelectorAll('[data-ml-level]'))s.onchange=wrap(async()=>{if(!s.value)return;await api('/api/play/content',{media_id:s.dataset.mlLevel,level:s.value});toast(t('ml.levelSaved'));});
      for(const th of out.querySelectorAll('[data-ml-reveal]'))th.onclick=()=>th.classList.remove('ml-blur');
      for(const b of out.querySelectorAll('[data-ml-verdict]'))b.onclick=wrap(async()=>{await api('/api/play/media/feedback',{media_id:b.dataset.mlMedia,panel:f.panel.value,characters,verdict:Number(b.dataset.mlVerdict)});toast(t('ml.saved'));if(b.dataset.mlVerdict==='-1')b.closest('.ml-card').remove();});
    });
  }
  async function renderLevels(labels){
    const {levels}=await api('/api/world-engine/levels');
    const options=v=>`<option value=""${v===null?' selected':''}>${t('we.noLevel')}</option>`+Object.entries(labels).sort((a,b)=>a[0]-b[0]).map(([k,l])=>`<option value="${k}"${String(v)===k?' selected':''}>${esc(l)}</option>`).join('');
    $('#we-levels').innerHTML=`<div class="we-row"><input id="we-level-q" type="search" aria-label="${esc(t('we.levelSearch'))}" placeholder="${esc(t('we.levelSearch'))}"></div><table class="we-table"><tbody>${levels.map(r=>`<tr><td>${esc(r.source_name)} → ${esc(r.target_name)}</td><td><select data-we-level="${r.source_id}|${r.target_id}">${options(r.level)}</select></td><td class="muted">${esc(r.note)}</td></tr>`).join('')}</tbody></table>`;
    $('#we-level-q').oninput=e=>{const q=e.target.value.toLocaleLowerCase('hu');for(const tr of $$('#we-levels tr'))tr.hidden=q&&!tr.textContent.toLocaleLowerCase('hu').includes(q);};
    for(const sel of $$('[data-we-level]'))sel.onchange=wrap(async()=>{if(sel.value==='')return;const [source_id,target_id]=sel.dataset.weLevel.split('|');await api('/api/world-engine/levels',{source_id,target_id,level:Number(sel.value)});});
  }
  const wrap=fn=>async e=>{try{await fn(e);}catch(err){toast(err.message,true);}};
  let refreshTimer=null;
  function bind(root,s){
    const fill=$('#we-bar-fill');if(fill)fill.style.width=fill.dataset.pct+'%';
    for(const b of $$('[data-open-profile]'))b.onclick=()=>openProfile(b.dataset.openProfile);
    for(const sel of $$('[data-we-role-of]'))sel.onchange=wrap(async()=>{await api('/api/world-engine/places/'+sel.dataset.weRoleOf,{role:sel.value});toast(t('play.saved'));});
    $('#we-export').onclick=wrap(async()=>{const r=await api('/api/play/export');const a=document.createElement('a');a.href='data:text/markdown;charset=utf-8,'+encodeURIComponent(r.markdown);a.download=r.filename;a.click();});
    // While this page is open and the engine is on, it refreshes itself once a minute.
    clearInterval(refreshTimer);if(s.settings.enabled)refreshTimer=setInterval(()=>{if(!document.body.contains(root)||!root.querySelector('.we-today')){clearInterval(refreshTimer);return;}if(!document.hidden&&!root.contains(document.activeElement))render(root).catch(()=>{});},60_000);
    $('#we-play').onclick=()=>openPlay();
    $('#we-tempo').onchange=wrap(async e=>{await api('/api/world-engine/settings',{tempo:e.target.value});toast(t('play.saved'));});
    if($('#we-model'))$('#we-model').onchange=wrap(async e=>{await api('/api/world-engine/settings',{model:e.target.value});toast(t('we.modelSaved'));await again();});
    if($('#we-world-model'))$('#we-world-model').onchange=wrap(async e=>{await api('/api/world-engine/settings',{world_model:e.target.value});toast(t('we.modelSaved'));await again();});
    // Figure prompt for Grok Imagine: base + expression follow-ups, with copy buttons.
    // One place background prompt (base + evening + night + where to save) to the clipboard.
    for(const b of $$('[data-bg-prompt]'))b.onclick=wrap(async()=>{const r=await api('/api/play/prompts?'+new URLSearchParams({location_id:b.dataset.bgPrompt}));
      await navigator.clipboard.writeText([r.background.base,r.background.evening,r.background.night,'Mentés: '+r.background.save_as].join('\n\n'));toast(t('we.copied'));});
    // Every character without a figure: one text for a single Grok session (folder + prompts).
    if($('#we-missing-figures'))$('#we-missing-figures').onclick=wrap(async()=>{const r=await api('/api/sprites/missing');
      await navigator.clipboard.writeText([t('we.missingFiguresHead',{files:r.file_names}),...r.characters.map(c=>`### ${c.name}\nMappa: ${c.folder}\n\n${c.base_prompt}\n\n${c.expression_prompts}`)].join('\n\n'));toast(t('we.copiedCount',{count:r.characters.length}));});
    for(const b of $$('[data-figure-prompt]'))b.onclick=wrap(async()=>{
      const p=await api('/api/sprites/prompt/'+b.dataset.figurePrompt);
      const promptBox=$('#we-prompt');if(!promptBox)return;
      promptBox.innerHTML=`<div class="we-prompt"><h3>${esc(t('we.figurePromptFor',{name:p.name}))}</h3>
        <p class="muted">${esc(p.reference_count?t('we.figureRefs',{count:p.reference_count}):t('we.figureNoRefs'))} ${esc(t('we.figureSaveTo',{folder:p.folder}))}</p>
        <label>${t('we.figureBase')}<textarea readonly rows="9" id="we-prompt-base">${esc(p.base)}</textarea></label><button class="primary" data-copy="we-prompt-base">${t('we.copy')}</button>
        <label>${t('we.figureVariants')}<textarea readonly rows="7" id="we-prompt-variants">${esc(p.variants)}</textarea></label><button class="subtle" data-copy="we-prompt-variants">${t('we.copy')}</button>
        <p class="muted">${esc(p.howto)}</p></div>`;
      for(const c of $$('[data-copy]'))c.onclick=wrap(async()=>{await navigator.clipboard.writeText($('#'+c.dataset.copy).value);toast(t('we.copied'));});
      promptBox.scrollIntoView({behavior:'smooth',block:'start'});
    });
    const again=()=>render(root);
    $('#we-enabled').onchange=wrap(async e=>{await api('/api/world-engine/settings',{enabled:e.target.checked});await again();});
    $('#we-while-playing').onchange=wrap(async e=>{await api('/api/world-engine/settings',{while_playing:e.target.checked});await again();});
    $('#we-save-cap').onclick=wrap(async()=>{await api('/api/world-engine/settings',{daily_cap_usd:Number($('#we-cap').value)});await again();});
    const run=extra=>wrap(async()=>{toast(t('we.running'));const r=await api('/api/world-engine/run',{extra});const sum=k=>r.days.reduce((n,d)=>n+(d[k]||0),0);toast(r.stopped?t('we.stopped',{message:r.stopped.message}):t('we.ran',{days:r.days.length,events:sum('events'),messages:sum('messages')}),!!r.stopped);await again();});
    $('#we-run').onclick=run(false);$('#we-extra').onclick=run(true);
    for(const b of $$('[data-we-accept]'))b.onclick=wrap(async()=>{await api('/api/world-engine/events/'+b.dataset.weAccept,{accept:true});toast(t('we.accepted'));await again();});
    for(const b of $$('[data-we-refuse]'))b.onclick=wrap(async()=>{await api('/api/world-engine/events/'+b.dataset.weRefuse,{accept:false});toast(t('we.refused'));await again();});
    if($('#we-seen'))$('#we-seen').onclick=wrap(async()=>{await api('/api/world-engine/seen',{});await again();});
    $('#we-suggest').onclick=wrap(async()=>{const r=await api('/api/world-engine/places/suggest',{});toast(t('we.suggested',{count:r.added}));await again();});
    for(const b of $$('[data-we-add]'))b.onclick=wrap(async()=>{const cid=b.dataset.weAdd;await api('/api/world-engine/places',{character_id:cid,location_id:$(`[data-we-loc="${cid}"]`).value,role:$(`[data-we-role="${cid}"]`).value});await again();});
    // A ready instruction for Grok: work through the next batch with the MCP picture tools.
    if($('#gen-task'))$('#gen-task').onclick=wrap(async()=>{const g=await api('/api/play/generation');
      const top=g.needs.slice(0,10).map((n,i)=>`${i+1}. ${t('we.gen.'+n.target)}${n.name?' – '+n.name:''}${n.expression?' ('+n.expression+')':''}${n.time_of_day?' ('+n.time_of_day+')':''}`).join('\n');
      await navigator.clipboard.writeText(t('we.genTaskText',{count:Math.min(10,g.needs.length)})+'\n\n'+top);toast(t('we.genCopied'));});
    // Credentialed pictures that could become approved references (approval stays in the profile editor).
    if($('#gen-find'))$('#gen-find').onclick=wrap(async()=>{const box=$('#gen-candidates');box.textContent=t('we.genSearching');
      const r=await api('/api/play/generation/candidates');
      box.innerHTML=r.characters.length?r.characters.map(c=>`<div class="we-cand"><button class="vn-link" data-open-profile="${esc(c.character_id)}">${esc(c.name)}</button> <small class="muted">${t('we.genCandCount',{count:c.count,approved:c.approved_references})}</small><div class="we-cand-row">${c.media_ids.map(id=>`<img src="/thumb/${encodeURIComponent(id)}" alt="" loading="lazy">`).join('')}</div></div>`).join(''):`<p class="muted">${t('we.genNoCandidates')}</p>`;
      for(const b of box.querySelectorAll('[data-open-profile]'))b.onclick=()=>openProfile(b.dataset.openProfile);});
    for(const b of $$('[data-gen-clear]'))b.onclick=wrap(async()=>{await api('/api/play/generation/jobs/'+b.dataset.genClear+'/clear',{});await again();});
    for(const b of $$('[data-we-remove]'))b.onclick=wrap(async()=>{await api('/api/world-engine/places/'+b.dataset.weRemove,null,'DELETE');await again();});
    $('#we-propose-levels').onclick=wrap(async()=>{const r=await api('/api/world-engine/levels/propose',{});toast(t('we.levelsSet',{count:r.set}));levelsOpen=true;await again();});
    $('#we-show-levels').onclick=wrap(async()=>{levelsOpen=true;await renderLevels(s.level_labels);});
  }
  return {render};
}
