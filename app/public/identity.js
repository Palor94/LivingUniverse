// "Arcazonosság": the local face method at work (app/identity-suggest.mjs). Suggestions of who is
// in a picture (Igen links him through the ordinary link route, Nem hides it), pictures whose link
// looks wrong, and a check of every character's approved face references. Never canon.
import {t} from './i18n.js';
import {renderQuality} from './identity-quality.js';

export function installIdentityUI({$,$$,esc,api,toast,heading,openMedia=null}){
  let poll=null;
  const leave=()=>{clearTimeout(poll);poll=null;};
  const pct=v=>Math.round(v*100)+'%';
  const thumb=(id,box)=>`<span class="id-thumb"><img src="/thumb/${encodeURIComponent(id)}?w=320" alt="" loading="lazy">${box?`<i class="id-box" data-box="${[box.x,box.y,box.w,box.h].map(Number).join(',')}"></i>`:''}</span>`;
  async function render(root){
    leave();
    const {status:s,report:r}=await api('/api/identity');
    const running=s.running;
    const progress=running?`<p class="id-progress" role="status">${t('id.scanning',{done:s.done,total:s.total,faces:s.faces})} <button id="id-stop" class="subtle">${t('id.stop')}</button></p>`:s.finished_at?`<p class="muted">${t('id.lastScan',{done:s.done,faces:s.faces,errors:s.errors})}</p>`:'';
    const weak=r.references.filter(c=>c.usable<2);
    const outliers=r.references.flatMap(c=>c.items.filter(i=>i.status!=='ok').map(i=>({...i,name:c.name,character_id:c.character_id})));
    root.innerHTML=heading(t('id.kicker'),t('id.title'),t('id.lead'),'')+
      `<section class="we-section"><h2>${t('id.scanTitle')}</h2><p class="muted">${t('id.scanLead')}</p>
        ${s.available?`<div class="we-row"><button id="id-scan" class="primary"${running?' disabled':''}>${t('id.scanUnsorted')}</button><button id="id-scan-all" class="subtle"${running?' disabled':''}>${t('id.scanAll')}</button></div>`:`<p class="error">${t('id.unavailable')}</p>`}
        ${progress}<p class="muted">${t('id.scanned',{count:s.scanned})}</p></section>`+
      `<section class="we-section"><h2>${t('id.suggestTitle',{count:r.suggestion_count})}</h2><p class="muted">${t('id.suggestLead',{min:pct(r.thresholds.suggest)})}</p>
        ${r.suggestions.length?`<div class="id-grid">${r.suggestions.map(x=>`<article class="id-card" data-media="${esc(x.media_id)}" data-character="${esc(x.character_id)}">${thumb(x.media_id,x.box)}
          <div><b>${esc(x.name)}?</b> <small class="muted">${pct(x.score)}${x.runner_up?' · '+t('id.runnerUp',{name:esc(x.runner_up.name),score:pct(x.runner_up.score)}):''}</small>
          <div class="we-row"><button class="primary" data-id-yes>${t('id.yes')}</button><button class="subtle" data-id-no>${t('id.no')}</button>${openMedia?`<button class="subtle" data-id-open>${t('id.open')}</button>`:''}</div></div></article>`).join('')}</div>`:`<p class="muted">${t(s.scanned?'id.noSuggestions':'id.notScanned')}</p>`}</section>`+
      `<section class="we-section"><h2>${t('id.mismatchTitle',{count:r.mismatches.length})}</h2><p class="muted">${t('id.mismatchLead')}</p>
        ${r.mismatches.length?`<div class="id-grid">${r.mismatches.map(x=>`<article class="id-card" data-media="${esc(x.media_id)}">${thumb(x.media_id)}<div>${t('id.mismatchLine',{linked:esc(x.linked.name),own:pct(x.linked.score),other:esc(x.looks_like.name),score:pct(x.looks_like.score)})}${openMedia?`<div class="we-row"><button class="subtle" data-id-open>${t('id.open')}</button></div>`:''}</div></article>`).join('')}</div>`:`<p class="muted">${t('id.none')}</p>`}</section>`+
      `<section class="we-section"><h2>${t('id.refsTitle')}</h2><p class="muted">${t('id.refsLead')}</p>
        ${outliers.length?`<h3>${t('id.outliers',{count:outliers.length})}</h3><div class="id-grid">${outliers.map(x=>`<article class="id-card" data-media="${esc(x.media_id)}">${thumb(x.media_id)}<div><b>${esc(x.name)}</b> <small class="muted">${t('id.refStatus.'+x.status)}${x.agreement!=null?' · '+t('id.agreement',{score:pct(x.agreement)}):''}</small>${openMedia?`<div class="we-row"><button class="subtle" data-id-open>${t('id.open')}</button></div>`:''}</div></article>`).join('')}</div>`:`<p class="muted">${t('id.noOutliers')}</p>`}
        ${r.lookalikes.length?`<h3>${t('id.lookalikes')}</h3><ul>${r.lookalikes.map(l=>`<li>${esc(l.a.name)} – ${esc(l.b.name)} <small class="muted">${pct(l.score)}</small></li>`).join('')}</ul>`:''}
        <details class="we-log"${weak.length?' open':''}><summary>${t('id.coverage',{weak:weak.length,none:r.characters_without_face_reference})}</summary><table class="we-table"><tbody>${r.references.map(c=>`<tr><td>${esc(c.name)}</td><td>${t('id.refCount',{usable:c.usable,total:c.face_references})}</td></tr>`).join('')}</tbody></table></details>
        <p class="muted">${t('id.method',{method:esc(r.method)})}</p></section>`;
    const scan=scope=>async()=>{try{await api('/api/identity/scan',{scope});toast(t('id.started'));await render(root);}catch(e){toast(e.message,true);}};
    if($('#id-scan'))$('#id-scan').onclick=scan('unsorted');
    if($('#id-scan-all'))$('#id-scan-all').onclick=scan('all');
    if($('#id-stop'))$('#id-stop').onclick=async()=>{await api('/api/identity/scan/stop',{});toast(t('id.stopping'));};
    // Face boxes are placed from script (the page's CSP allows no inline style attributes).
    for(const i of $$('.id-box')){const [x,y,w,h]=i.dataset.box.split(',').map(Number);Object.assign(i.style,{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'});}
    for(const card of $$('.id-card')){
      const media=card.dataset.media,character=card.dataset.character;
      card.querySelector('[data-id-yes]')?.addEventListener('click',async()=>{try{await api('/api/media/bulk',{operation:'assign',media_ids:[media],character_ids:[character]});card.remove();toast(t('id.linked'));}catch(e){toast(e.message,true);}});
      card.querySelector('[data-id-no]')?.addEventListener('click',async()=>{try{await api('/api/identity/feedback',{media_id:media,character_id:character,verdict:'no'});card.remove();}catch(e){toast(e.message,true);}});
      card.querySelector('[data-id-open]')?.addEventListener('click',()=>openMedia(media));
    }
    const quality=document.createElement('section');quality.className='we-section';root.append(quality);
    await renderQuality(quality,{api,esc,toast});
    // While a scan runs, refresh every few seconds (only while this view is open).
    if(running)poll=setTimeout(()=>{if(root.isConnected&&document.body.contains(root))render(root).catch(()=>{});},4000);
  }
  return {render,leave};
}
