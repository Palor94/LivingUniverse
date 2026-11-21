import {mediaFormPayload} from './media-form.js';
import {installSortingPickers} from './sorting-pickers.js';
import {t} from './i18n.js';
export async function removeSelectedMedia({ids,mode,api,onProgress=()=>{},isCanceled=()=>false}){
  if(!['catalogue','file'].includes(mode))throw Error(t('sort.chooseRemoveMode'));
  const removed=[],failed=[],warnings=[];
  for(const mid of [...new Set(ids)]){
    if(isCanceled())break;
    try{const result=await api('/api/media/'+encodeURIComponent(mid)+'/remove',{mode});if(result.ok!==true)throw Error(t('sort.removalNotConfirmed'));removed.push(mid);if(result.warning)warnings.push({id:mid,message:result.warning});}
    catch(e){failed.push({id:mid,message:e.message});}
    onProgress({removed:removed.length,failed:failed.length,processed:removed.length+failed.length});
  }
  return {removed,failed,warnings,unprocessed:[...new Set(ids)].filter(id=>!removed.includes(id)&&!failed.some(f=>f.id===id))};
}
export function installSorting(ctx){
  const {$,$$,esc,api,action,toast,openDialog,getState,reload,render,mediaDialog}=ctx;
  let page=[],scope='',queueUrl='',queue=[],queueScope='',anchor=null,status='',saving=false,needsRefresh=false;
  const selected=new Set();
  const labels={location:t('sort.status.location'),unassigned:t('sort.status.unassigned'),pending:t('sort.status.pending'),multiple:t('sort.status.multiple'),complete:t('sort.status.complete')};
  function reset(){selected.clear();anchor=null;page=[];queueUrl='';scope='';queue=[];queueScope='';status='';ctx.onSelectionChange?.([]);}
  function setPage(items,url,nextScope){if(scope!==nextScope){selected.clear();anchor=null;queue=[];queueScope='';}scope=nextScope;page=items;queueUrl=url;const visible=new Set(page.map(m=>m.id));for(const id of selected)if(!visible.has(id))selected.delete(id);}
  function updateSelection(){ctx.onSelectionChange?.(page.filter(m=>selected.has(m.id)));for(const tile of $$('.media-tile')){const checked=selected.has(tile.dataset.item);tile.classList.toggle('selected',checked);$('.media-select',tile).checked=checked;}
    if($('#selection-count'))$('#selection-count').textContent=t('sort.selectedOnPage',{count:selected.size});
    for(const b of $$('[data-bulk-action]')){b.disabled=!selected.size;b.title=selected.size?t('sort.appliesToSelected'):t('sort.selectFirst');}
  }
  function select(mid,range=false){const index=page.findIndex(m=>m.id===mid);if(range&&anchor!==null){const from=Math.min(anchor,index),to=Math.max(anchor,index);for(let n=from;n<=to;n++)selected.add(page[n].id);}else{if(selected.has(mid))selected.delete(mid);else selected.add(mid);anchor=index;}updateSelection();}
  function listing(){if(!$('.media-grid')&&!$('#media-search'))return;
    const toolbar=$('.toolbar');if(toolbar&&!$('#sorting-status')){toolbar.insertAdjacentHTML('beforeend',`<select id="sorting-status" aria-label="${esc(t('sort.statusLabel'))}"><option value="">${t('sort.allStatuses')}</option>${Object.entries(labels).filter(([v])=>ctx.getView()!=='inbox'||!['complete','location'].includes(v)).map(([v,label])=>`<option value="${v}" ${status===v?'selected':''}>${esc(label)}</option>`).join('')}</select>`);$('#sorting-status').onchange=action(async e=>{status=e.target.value;await ctx.resetPage();await reload();});}
    const target=$('#media-type-tabs')||toolbar;if(!target)return;
    target.insertAdjacentHTML('afterend',`<div class="bulk-toolbar"><strong id="selection-count" aria-live="polite">${t('sort.selectedOnPage',{count:0})}</strong><button id="select-visible">${t('sort.selectVisible')}</button><button id="clear-selected">${t('sort.clearSelection')}</button><button data-bulk-action="assign">${t('sort.bulk.assign')}</button><button data-bulk-action="location">${t('sort.bulk.location')}</button><button data-bulk-action="unlocation">${t('sort.bulk.unlocation')}</button><button data-bulk-action="structured">${t('sort.bulk.structured')}</button><button data-bulk-action="tags_add">${t('sort.bulk.tagsAdd')}</button><button data-bulk-action="tags_remove">${t('sort.bulk.tagsRemove')}</button><button data-bulk-action="complete">${t('sort.bulk.complete')}</button><button data-bulk-action="reopen">${t('sort.bulk.reopen')}</button><small>${t('sort.selectionHelp')}</small></div>`);
    if(['library','profile'].includes(ctx.getView()))$('#clear-selected').insertAdjacentHTML('afterend',`<button type="button" class="danger" id="library-permanent-delete" hidden disabled>${t('permanent.selected',{count:0})}</button>`);
    if(ctx.getView()==='inbox')$('#clear-selected').insertAdjacentHTML('afterend',`<button type="button" class="danger" data-bulk-action="remove">${t('sort.bulk.remove')}</button>`);
    $('#select-visible').onclick=()=>{page.forEach(m=>selected.add(m.id));updateSelection();};$('#clear-selected').onclick=()=>{selected.clear();anchor=null;updateSelection();};
    for(const card of $$('[data-media]')){const mid=card.dataset.media,m=page.find(m=>m.id===mid);if(!m)continue;const tile=document.createElement('div');tile.className='media-tile';tile.dataset.item=mid;card.replaceWith(tile);tile.append(card);const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='media-select';checkbox.setAttribute('aria-label',t('sort.selectItem',{name:m.relative_path.split(/[\\/]/).pop()}));checkbox.onclick=e=>select(mid,e.shiftKey);tile.append(checkbox);const badge=document.createElement('small');badge.className='sorting-state '+m.sorting_status;badge.textContent=labels[m.sorting_status]||labels.unassigned;tile.append(badge);card.onclick=action(async e=>{if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();select(mid,e.shiftKey);return;}await mediaDialog(mid);});}
    for(const button of $$('[data-bulk-action]'))button.onclick=action(()=>bulkDialog(button.dataset.bulkAction));updateSelection();
  }
  async function apply(operation,ids,extra={}){const result=await api('/api/media/bulk',{operation,media_ids:ids,...extra});await ctx.refresh();await reload();toast(t('sort.applied',{updated:result.updated,selected:result.selected})+(operation==='assign'?t('sort.linksAdded',{count:result.associations}):'')+t('sort.canonUnchanged'));}
  async function bulkDialog(operation){const ids=[...selected];if(!ids.length)return;
    if(operation==='remove')return removeDialog(ids);
    if(operation==='structured')return ctx.structuredTags(ids);
    if(operation==='location')return ctx.locationDialog(ids);
    if(['complete','reopen','unlocation'].includes(operation))return apply(operation,ids);
    const isCharacters=operation==='assign';openDialog(isCharacters?t('sort.addCharactersTitle'):operation==='tags_add'?t('sort.addTagsTitle'):t('sort.removeTagsTitle'),`<form id="bulk-form" class="form-grid"><div class="note">${t('sort.appliesToCount',{count:ids.length})} ${isCharacters?t('sort.charactersPreserved'):operation==='tags_add'?t('sort.tagsPreserved'):t('sort.exactTagsRemoved')}</div>${isCharacters?`<input id="bulk-character-search" aria-label="${esc(t('sort.findCharacters'))}" placeholder="${esc(t('sort.findCharacterPlaceholder'))}"><div class="checks">${getState().characters.map(c=>`<label><input type="checkbox" name="character" value="${c.id}">${esc(c.name)}</label>`).join('')}</div>`:`<label>${t('sort.commaTags')}<input name="tags" maxlength="2000" required placeholder="${esc(t('sort.tagsPlaceholder'))}"></label>`}<div class="dialog-footer"><button type="button" id="bulk-cancel">${t('common.cancel')}</button><button class="primary" id="bulk-submit">${isCharacters?t('sort.addCharacters'):operation==='tags_add'?t('sort.addTags'):t('sort.removeTags')}</button></div></form>`);
    $('#bulk-cancel').onclick=()=>$('#dialog').close();if($('#bulk-character-search'))$('#bulk-character-search').oninput=e=>{for(const label of $$('#bulk-form .checks label'))label.hidden=!label.textContent.toLocaleLowerCase('hu').includes(e.target.value.toLocaleLowerCase('hu'));};
    $('#bulk-form').onsubmit=action(async e=>{e.preventDefault();const f=new FormData(e.target);const button=$('#bulk-submit');button.disabled=true;try{const result=await api('/api/media/bulk',{operation,media_ids:ids,...(isCharacters?{character_ids:f.getAll('character')}:{tags:f.get('tags')})});$('#dialog').close();await ctx.refresh();await reload();toast(t('sort.applied',{updated:result.updated,selected:result.selected})+(isCharacters?t('sort.linksAdded',{count:result.associations}):'')+'.');}finally{if(button.isConnected)button.disabled=false;}});
  }
  function removeDialog(ids){
    const names=new Map(page.map(m=>[m.id,m.relative_path]));let busy=false,stopped=false;
    openDialog(t('sort.removeTitle'),`<form id="bulk-remove-form" class="form-grid"><div class="note">${t('sort.removeNote',{count:ids.length})}</div><label class="radio-label"><input type="radio" name="mode" value="catalogue" checked> ${t('sort.removeCatalogue')}</label><label class="radio-label"><input type="radio" name="mode" value="file"> ${t('sort.removeFile')}</label><small>${t('sort.removeHint')}</small><details><summary>${t('sort.selectedFiles',{count:ids.length})}</summary>${ids.map(id=>`<p>${esc(names.get(id)||id)}</p>`).join('')}</details><p id="bulk-remove-status" role="status" aria-live="polite"></p><div id="bulk-remove-results"></div><div class="dialog-footer"><button type="button" id="bulk-remove-cancel">${t('common.cancel')}</button><button type="submit" class="danger" id="bulk-remove-submit">${t('sort.removeSubmit',{count:ids.length})}</button></div></form>`);
    const form=$('#bulk-remove-form'),submit=$('#bulk-remove-submit'),cancel=$('#bulk-remove-cancel'),feedback=$('#bulk-remove-status'),results=$('#bulk-remove-results'),dialog=$('#dialog');
    const onClose=()=>{stopped=true;};dialog.addEventListener('close',onClose,{once:true});
    cancel.onclick=()=>{if(busy){stopped=true;cancel.disabled=true;feedback.textContent=t('sort.stopping');}else{dialog.removeEventListener('close',onClose);dialog.close();}};
    form.onsubmit=async e=>{
      e.preventDefault();if(busy||submit.disabled)return;const selectedMode=new FormData(form).get('mode');busy=true;submit.disabled=true;cancel.textContent=t('sort.stopAfterCurrent');for(const radio of form.querySelectorAll('input'))radio.disabled=true;
      try{
        const result=await removeSelectedMedia({ids,mode:selectedMode,api,isCanceled:()=>stopped||!form.isConnected,onProgress:p=>{feedback.textContent=t('sort.removeProgress',{processed:p.processed,total:ids.length,removed:p.removed,failed:p.failed});}});
        for(const id of result.removed)selected.delete(id);updateSelection();
        feedback.textContent=t('sort.removeResult',{removed:result.removed.length,failed:result.failed.length})+(result.unprocessed.length?t('sort.untouched',{count:result.unprocessed.length}):'')+t('sort.restoreHint');
        results.innerHTML=[...result.failed.map(f=>`<p class="error">${esc(names.get(f.id)||f.id)}: ${esc(f.message)}</p>`),...result.warnings.map(f=>`<p>${esc(names.get(f.id)||f.id)}: ${esc(f.message)}</p>`)].join('');
        await ctx.refresh();await reload();toast(t('sort.removedToast',{count:result.removed.length})+(result.failed.length?t('sort.couldNotRemove',{count:result.failed.length}):'')+'.');
      }catch(error){feedback.textContent=t('sort.refreshFailed',{message:error.message});}
      finally{busy=false;cancel.disabled=false;cancel.textContent=t('sort.close');dialog.removeEventListener('close',onClose);}
    };
  }
  async function viewer(m){
    if(queueScope!==scope||!queue.includes(m.id)){const result=queueUrl?await api(queueUrl):{ids:[m.id]};queue=result.ids.includes(m.id)?result.ids:[m.id];queueScope=scope;}
    const index=queue.indexOf(m.id),form=$('#media-form');if(!form)return;
    form.insertAdjacentHTML('beforeend',`<input type="checkbox" id="categorization-complete" hidden ${m.categorization_complete?'checked':''}><small>${t('sort.finishHint')}</small><button type="button" id="sort-draft">${t('sort.saveForLater')}</button><span id="media-save-status" class="saved" role="status"></span>`);
    $('button[type="submit"],button.primary',form).textContent=t('sort.finishSave');
    $('.dialog-head').insertAdjacentHTML('afterend',`<div class="viewer-sort-nav"><button id="sort-prev" ${index===0?'disabled':''} title="Alt+Left">${t('sort.prev')}</button><span>${t('sort.position',{current:index+1,total:queue.length})}</span><button id="sort-next" ${index===queue.length-1?'disabled':''} title="Alt+Right">${t('sort.next')}</button><button id="sort-save-next" class="primary" title="Ctrl+Enter">${index===queue.length-1?t('sort.finish'):t('sort.finishNext')}</button></div>`);
    async function save(complete=$('#categorization-complete').checked){const values=await mediaFormPayload(form,complete);const updated=await api('/api/media/'+m.id,values,'PUT');if(updated?.characters)form._afterMediaSave?.(updated);$('#categorization-complete').checked=complete;needsRefresh=true;const location=values.location_reference;$('#media-save-status').textContent=location?t('sort.savedLocation'):complete?t('sort.savedFinished'):t('sort.savedDraft');await ctx.refresh();toast(location?t('sort.toastLocation'):complete?t('sort.toastFinished'):t('sort.toastDraft'));}
    async function navigate(direction,finish=false){if(saving)return;const next=index+direction;if(next<0)return;if(next>=queue.length&&!finish)return;saving=true;for(const b of $$('.viewer-sort-nav button'))b.disabled=true;try{await save(finish?true:undefined);if(finish&&await ctx.afterFinish?.(m.id))return;if(next>=queue.length){$('#dialog').close();return;}await mediaDialog(queue[next]);}finally{saving=false;for(const b of $$('.viewer-sort-nav button'))b.disabled=false;const current=queue.indexOf($('#media-form')?.dataset.mediaId);if($('#sort-prev'))$('#sort-prev').disabled=current===0;if($('#sort-next'))$('#sort-next').disabled=current===queue.length-1;}}
    form.dataset.mediaId=m.id;
    $('#sort-prev').onclick=action(()=>navigate(-1));$('#sort-next').onclick=action(()=>navigate(1));$('#sort-save-next').onclick=action(()=>navigate(1,true));
    form.onsubmit=action(async e=>{e.preventDefault();if(saving)return;saving=true;try{await save(true);if(await ctx.afterFinish?.(m.id))return;needsRefresh=false;$('#dialog').close();await reload();}finally{saving=false;}});
    $('#sort-draft').onclick=action(async()=>{if(saving)return;saving=true;try{await save(false);}finally{saving=false;}});
    const move=$('#move-original-button');if(move?.insertAdjacentHTML){move.insertAdjacentHTML('beforebegin',`<button type="button" id="sort-save" class="primary">${t('sort.save')}</button>`);$('#sort-save').onclick=action(async()=>{if(saving)return;saving=true;$('#sort-save').disabled=true;try{await save(true);}finally{saving=false;if($('#sort-save'))$('#sort-save').disabled=false;}});}
    if(form.querySelector)installSortingPickers({form,m,getState});
    form._sortNavigate=navigate;
  }
  function controls(){document.addEventListener('keydown',action(async e=>{if(!$('#dialog').open||typeof $('#media-form')?._sortNavigate!=='function'||saving)return;if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();await $('#media-form')._sortNavigate(1,true);}else if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();await $('#media-form')._sortNavigate(e.key==='ArrowLeft'?-1:1);}}));$('#dialog').addEventListener('close',()=>{queue=[];queueScope='';if(needsRefresh){needsRefresh=false;render().catch(e=>toast(e.message,true));}});}
  return {setPage,listing,viewer,controls,reset,getStatus:()=>status};
}
