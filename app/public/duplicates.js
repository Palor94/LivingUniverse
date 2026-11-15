import {differenceHash,visualVersion} from './image-hash.js';
import {mediaFormPayload} from './media-form.js';
import {t} from './i18n.js';

export function installDuplicatesUI({$,$$,esc,api,action,toast,openDialog,mediaDialog,getState,refresh:ctxRefresh}){
  let scanning=false,stop=false,mode='exact',threshold=6,comparisonGroups=[],comparisonIndex=0,recordContext=null;
  async function hashImage(item){
    const image=new Image();
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error(t('dup.decodeTimeout')));},20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error(t('dup.cannotDecode')));};image.src=`/media/${encodeURIComponent(item.id)}?fingerprint=${item.visual.sha256}`;});
    const canvas=document.createElement('canvas');canvas.width=9;canvas.height=8;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,9,8);ctx.drawImage(image,0,0,9,8);
    await api('/api/duplicates/visual',{id:item.id,...item.visual,hash:differenceHash(ctx.getImageData(0,0,9,8).data),version:visualVersion,width:image.naturalWidth,height:image.naturalHeight});
  }
  async function home(){
    if(scanning){toast(t('dup.alreadyRunning'));return;}
    openDialog(t('dup.title'),`<p>${t('dup.intro')}</p><label>${t('dup.analyze')}<select id="duplicate-folder"><option value="*">${t('dup.allMedia')}</option>${getState().folders.map(f=>`<option value="${esc(f.folder)}">${esc(f.folder||t('filters.loose'))} (${f.count})</option>`).join('')}</select></label><label class="duplicate-check"><input type="checkbox" id="duplicate-download"> ${t('dup.allowDownload')}</label><p class="muted">${t('dup.downloadHint')}</p><div class="toolbar"><button id="duplicate-start" class="primary">${t('dup.start')}</button><button id="duplicate-results">${t('dup.showCached')}</button></div><p class="note">${t('dup.visualNote')}</p>`);
    $('#duplicate-results').onclick=action(()=>results());$('#duplicate-start').onclick=action(()=>analyze($('#duplicate-folder').value,$('#duplicate-download').checked));
  }
  async function analyze(folder,allow_download){
    if(scanning)return;scanning=true;stop=false;const counts={hashed:0,cached:0,skipped:0,visual:0,visualFailed:0},issues=[];
    openDialog(t('dup.analyzingTitle'),`<p id="duplicate-progress" role="status">${t('dup.preparing')}</p><p>${t('dup.localNote')}</p><button id="duplicate-stop">${t('dup.stop')}</button>`);
    const dialog=$('#dialog'),panel=$('#duplicate-progress');const onClose=()=>{stop=true;};dialog.addEventListener('close',onClose,{once:true});$('#duplicate-stop').onclick=()=>{stop=true;$('#duplicate-stop').disabled=true;};
    try{const plan=await api('/api/duplicates/plan'+(folder==='*'?'':'?folder='+encodeURIComponent(folder)));let processed=0;
      for(let i=0;i<plan.ids.length&&!stop&&panel.isConnected;i+=25){const batch=await api('/api/duplicates/analyze',{ids:plan.ids.slice(i,i+25),allow_download});
        for(const item of batch.results){counts[item.status]++;if(item.reason)issues.push(`${item.id}: ${item.reason}`);if(item.visual&&!stop&&panel.isConnected){try{await hashImage(item);counts.visual++;}catch(e){counts.visualFailed++;issues.push(`${item.id}: ${e.message}`);}}processed++;if(panel.isConnected)panel.textContent=t('dup.progress',{processed,total:plan.ids.length,hashed:counts.hashed,cached:counts.cached,skipped:counts.skipped,visual:counts.visual});}
      }
      if(panel.isConnected){panel.insertAdjacentHTML('afterend',`<p>${stop?t('dup.stopped'):t('dup.finished')} ${t('dup.decodeFailures',{count:counts.visualFailed})}</p>${issues.length?`<details><summary>${t('dup.issues',{count:issues.length})}</summary><pre>${esc(issues.slice(0,100).join('\n'))}</pre></details>`:''}<button id="duplicate-show">${t('dup.reviewResults')}</button>`);$('#duplicate-show').onclick=action(()=>results());}
      toast(t('dup.toast',{hashed:counts.hashed,cached:counts.cached,skipped:counts.skipped}));
    }finally{scanning=false;dialog.removeEventListener('close',onClose);}
  }
  async function results(offset=0){
    const data=await api(`/api/duplicates/groups?mode=${mode}&threshold=${threshold}&offset=${offset}`);
    openDialog(t('dup.reviewTitle'),`<div class="toolbar"><button id="duplicate-home">${t('dup.options')}</button><label>${t('dup.show')}<select id="duplicate-mode"><option value="exact" ${mode==='exact'?'selected':''}>${t('dup.exactGroups')}</option><option value="similar" ${mode==='similar'?'selected':''}>${t('dup.similarPairs')}</option></select></label>${mode==='similar'?`<label>${t('dup.tolerance')}<select id="duplicate-threshold">${[0,3,6,9,12].map(n=>`<option ${threshold===n?'selected':''} value="${n}">${t('dup.bits',{count:n})}</option>`).join('')}</select></label>`:''}</div><p>${t('dup.cacheStatus',{cached:data.cached,active:data.active,stale:data.stale})}</p><p class="note">${mode==='exact'?t('dup.exactNote'):t('dup.similarNote')} ${t('dup.previewNote')}</p>${data.truncated?`<p class="note">${t('dup.truncated')}</p>`:''}<div>${data.items.map((g,i)=>`<div class="duplicate-group"><b>${mode==='exact'?t('dup.identicalCount',{count:g.items.length}):t('dup.bitsDifferent',{count:g.distance})}</b><ul>${g.items.map(m=>`<li>${esc(m.relative_path)}${m.canonical?t('dup.canonicalNote'):''}${m.characters.length?' · '+esc(m.characters.join(', ')):''}</li>`).join('')}</ul><button data-duplicate-compare="${i}">${t('dup.compare')}</button></div>`).join('')||`<p>${t('dup.noMatches')}</p>`}</div><div class="dialog-footer"><span>${mode==='exact'?t('dup.groupsTotal',{count:data.total}):t('dup.pairsTotal',{count:data.total})}</span><button id="duplicate-prev" ${offset===0?'disabled':''}>${t('common.previous')}</button><button id="duplicate-next" ${offset+25>=data.total?'disabled':''}>${t('common.next')}</button></div>`);
    $('#duplicate-home').onclick=action(home);$('#duplicate-mode').onchange=action(async e=>{mode=e.target.value;await results();});if($('#duplicate-threshold'))$('#duplicate-threshold').onchange=action(async e=>{threshold=Number(e.target.value);await results();});
    $('#duplicate-prev').onclick=action(()=>results(Math.max(0,offset-25)));$('#duplicate-next').onclick=action(()=>results(offset+25));
    for(const b of $$('[data-duplicate-compare]'))b.onclick=action(()=>startComparison(offset+Number(b.dataset.duplicateCompare),offset));
  }
  async function startComparison(index,offset){
    const groups=[];let total=0;
    do{const data=await api('/api/duplicates/groups?mode='+mode+'&threshold='+threshold+'&offset='+groups.length+'&limit=2000');total=data.total;groups.push(...data.items);if(!data.items.length)break;}while(groups.length<total);
    comparisonGroups=groups;comparisonIndex=Math.min(index,groups.length-1);
    if(comparisonIndex<0){await results();return;}
    compare(comparisonGroups[comparisonIndex],offset);
  }
  function compare(group,offset,page=0){group.items.sort((a,b)=>Number(a.categorization_complete)-Number(b.categorization_complete));const visible=group.items.slice(page,page+12);
    openDialog(t('dup.compareTitle'),`<p>${t('dup.compareIntro')}</p><button id="duplicate-back">${t('dup.backToMatches')}</button><div class="toolbar"><button id="duplicate-group-prev" ${comparisonIndex===0?'disabled':''}>${t('dup.prevGroup')}</button><span>${t('dup.groupPosition',{current:comparisonIndex+1,total:comparisonGroups.length})}</span><button id="duplicate-group-next" ${comparisonIndex+1>=comparisonGroups.length?'disabled':''}>${t('dup.nextGroup')}</button></div><div class="duplicate-comparison">${visible.map(m=>`<article>${m.kind==='image'?`<img src="/media/${encodeURIComponent(m.id)}" loading="lazy" alt="${esc(m.relative_path)}">`:`<video src="/media/${encodeURIComponent(m.id)}" controls preload="metadata"></video>`}<p>${esc(m.relative_path)}</p><p>${esc(m.characters.join(', ')||t('dup.noCharacters'))}${m.canonical?t('dup.canonicalNoteCap'):''}</p><p class="${m.categorization_complete?'muted':'duplicate-unfinished'}">${m.categorization_complete?t('dup.sortingComplete'):t('dup.sparePreferred')}</p><button data-duplicate-open="${esc(m.id)}">${t('recon.openRecord')}</button><button type="button" class="danger" data-duplicate-trash="${esc(m.id)}" ${m.canonical||group.items.length<2?'disabled':''}>${m.canonical?t('dup.protected'):t('dup.moveToTrash')}</button></article>`).join('')}</div><div class="toolbar"><button id="duplicate-members-prev" ${page===0?'disabled':''}>${t('dup.prevCopies')}</button><span>${t('common.pageRange',{from:page+1,to:Math.min(page+12,group.items.length),total:group.items.length})}</span><button id="duplicate-members-next" ${page+12>=group.items.length?'disabled':''}>${t('dup.moreCopies')}</button></div>`);
    $('#duplicate-group-prev').onclick=()=>{if(group.removing||comparisonIndex===0)return;comparisonIndex--;compare(comparisonGroups[comparisonIndex],offset);};
    $('#duplicate-group-next').onclick=()=>{if(group.removing||comparisonIndex+1>=comparisonGroups.length)return;comparisonIndex++;compare(comparisonGroups[comparisonIndex],offset);};
    $('#duplicate-back').onclick=action(()=>results(offset));$('#duplicate-members-prev').onclick=()=>compare(group,offset,page-12);$('#duplicate-members-next').onclick=()=>compare(group,offset,page+12);for(const b of $$('[data-duplicate-open]'))b.onclick=action(async()=>{recordContext={group,offset,page,index:comparisonIndex,mid:b.dataset.duplicateOpen};await mediaDialog(b.dataset.duplicateOpen);});
    for(const b of $$('[data-duplicate-trash]'))b.onclick=async()=>{
      if(group.removing||group.items.length<2)return;
      group.removing=true;for(const button of $$('[data-duplicate-trash]'))button.disabled=true;
      b.textContent=t('dup.moving');
      try{
        const result=await api('/api/media/'+encodeURIComponent(b.dataset.duplicateTrash)+'/remove',{mode:'file'});
        for(const entry of comparisonGroups)entry.items=entry.items.filter(item=>item.id!==b.dataset.duplicateTrash);
        await ctxRefresh();compare(group,offset,Math.min(page,Math.max(0,Math.floor((group.items.length-1)/12)*12)));
        toast(result.warning||t('dup.moved'),Boolean(result.warning));
      }catch(err){toast(err.message,true);compare(group,offset,page);}
      finally{group.removing=false;}
    }

  }
  async function returnAfterSave(mid){
    if(!recordContext||recordContext.mid!==mid)return false;
    const context=recordContext,fresh=await api('/api/media/'+encodeURIComponent(mid));
    for(const entry of comparisonGroups)for(const item of entry.items)if(item.id===mid){item.relative_path=fresh.relative_path;item.characters=fresh.characters.map(c=>c.name);item.categorization_complete=fresh.categorization_complete;item.canonical=item.canonical||Boolean(fresh.canonicalFor?.length);}
    comparisonIndex=context.index;recordContext=null;compare(context.group,context.offset,context.page);return true;
  }
  function viewer(m){
    if(!recordContext||recordContext.mid!==m.id)return;
    $('.dialog-head').insertAdjacentHTML('afterend',`<div class="viewer-sort-nav"><button type="button" id="return-duplicate-comparison">${t('dup.backToComparison')}</button><small>${t('dup.backHint')}</small></div>`);
    $('#return-duplicate-comparison').onclick=action(async e=>{const button=e.currentTarget;button.disabled=true;try{await api('/api/media/'+encodeURIComponent(m.id),await mediaFormPayload($('#media-form'),$('#categorization-complete').checked),'PUT');await ctxRefresh();await returnAfterSave(m.id);}finally{button.disabled=false;}});
    $('#sort-save-next').textContent=t('dup.finishReturn');
  }
  function controls(){$('.sidebar-bottom').insertAdjacentHTML('afterbegin',`<button id="duplicate-tool">${t('dup.title')}</button>`);$('#duplicate-tool').onclick=action(home);$('#dialog')?.addEventListener('close',()=>{recordContext=null;});}
  return {controls,viewer,returnAfterSave};
}
