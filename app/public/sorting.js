import {mediaFormPayload} from './media-form.js';
import {installSortingPickers} from './sorting-pickers.js';
export async function removeSelectedMedia({ids,mode,api,onProgress=()=>{},isCanceled=()=>false}){
  if(!['catalogue','file'].includes(mode))throw Error('Choose how to remove the selected files.');
  const removed=[],failed=[],warnings=[];
  for(const mid of [...new Set(ids)]){
    if(isCanceled())break;
    try{const result=await api('/api/media/'+encodeURIComponent(mid)+'/remove',{mode});if(result.ok!==true)throw Error('Removal was not confirmed.');removed.push(mid);if(result.warning)warnings.push({id:mid,message:result.warning});}
    catch(e){failed.push({id:mid,message:e.message});}
    onProgress({removed:removed.length,failed:failed.length,processed:removed.length+failed.length});
  }
  return {removed,failed,warnings,unprocessed:[...new Set(ids)].filter(id=>!removed.includes(id)&&!failed.some(f=>f.id===id))};
}
export function installSorting(ctx){
  const {$,$$,esc,api,action,toast,openDialog,getState,reload,render,mediaDialog}=ctx;
  let page=[],scope='',queueUrl='',queue=[],queueScope='',anchor=null,status='',saving=false,needsRefresh=false;
  const selected=new Set();
  const labels={location:'Location reference',unassigned:'Unassigned',pending:'Assigned · not finished',multiple:'Multiple characters · not finished',complete:'Categorization complete'};
  function reset(){selected.clear();anchor=null;page=[];queueUrl='';scope='';queue=[];queueScope='';status='';ctx.onSelectionChange?.([]);}
  function setPage(items,url,nextScope){if(scope!==nextScope){selected.clear();anchor=null;queue=[];queueScope='';}scope=nextScope;page=items;queueUrl=url;const visible=new Set(page.map(m=>m.id));for(const id of selected)if(!visible.has(id))selected.delete(id);}
  function updateSelection(){ctx.onSelectionChange?.(page.filter(m=>selected.has(m.id)));for(const tile of $$('.media-tile')){const checked=selected.has(tile.dataset.item);tile.classList.toggle('selected',checked);$('.media-select',tile).checked=checked;}
    if($('#selection-count'))$('#selection-count').textContent=`${selected.size} selected on this page`;
    for(const b of $$('[data-bulk-action]')){b.disabled=!selected.size;b.title=selected.size?'Applies to selected media on this page':'Select at least one picture or video first';}
  }
  function select(mid,range=false){const index=page.findIndex(m=>m.id===mid);if(range&&anchor!==null){const from=Math.min(anchor,index),to=Math.max(anchor,index);for(let n=from;n<=to;n++)selected.add(page[n].id);}else{if(selected.has(mid))selected.delete(mid);else selected.add(mid);anchor=index;}updateSelection();}
  function listing(){if(!$('.media-grid')&&!$('#media-search'))return;
    const toolbar=$('.toolbar');if(toolbar&&!$('#sorting-status')){toolbar.insertAdjacentHTML('beforeend',`<select id="sorting-status" aria-label="Sorting status"><option value="">All sorting statuses</option>${Object.entries(labels).filter(([v])=>ctx.getView()!=='inbox'||!['complete','location'].includes(v)).map(([v,label])=>`<option value="${v}" ${status===v?'selected':''}>${esc(label)}</option>`).join('')}</select>`);$('#sorting-status').onchange=action(async e=>{status=e.target.value;await ctx.resetPage();await reload();});}
    const target=$('#media-type-tabs')||toolbar;if(!target)return;
    target.insertAdjacentHTML('afterend','<div class="bulk-toolbar"><strong id="selection-count" aria-live="polite">0 selected on this page</strong><button id="select-visible">Select all visible (this page)</button><button id="clear-selected">Clear selection</button><button data-bulk-action="assign">Add characters…</button><button data-bulk-action="location">Set location…</button><button data-bulk-action="unlocation">Return to character media</button><button data-bulk-action="structured">Structured tags…</button><button data-bulk-action="analysis">Mock képelemzés…</button><button data-bulk-action="tags_add">Add tags…</button><button data-bulk-action="tags_remove">Remove tags…</button><button data-bulk-action="complete">Mark complete</button><button data-bulk-action="reopen">Needs review</button><small>Checkbox or Ctrl-click to select · Shift-click for a range. Page/filter changes clear selection. Bulk actions affect only selected items on this page.</small></div>');
    if(ctx.getView()==='library')$('#clear-selected').insertAdjacentHTML('afterend','<button type="button" class="danger" id="library-permanent-delete" disabled>Törlés</button>');
    if(ctx.getView()==='inbox')$('#clear-selected').insertAdjacentHTML('afterend','<button type="button" class="danger" data-bulk-action="remove">Remove selected…</button>');
    $('#select-visible').onclick=()=>{page.forEach(m=>selected.add(m.id));updateSelection();};$('#clear-selected').onclick=()=>{selected.clear();anchor=null;updateSelection();};
    for(const card of $$('[data-media]')){const mid=card.dataset.media,m=page.find(m=>m.id===mid);if(!m)continue;const tile=document.createElement('div');tile.className='media-tile';tile.dataset.item=mid;card.replaceWith(tile);tile.append(card);const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='media-select';checkbox.setAttribute('aria-label','Select '+m.relative_path.split(/[\\/]/).pop());checkbox.onclick=e=>select(mid,e.shiftKey);tile.append(checkbox);const badge=document.createElement('small');badge.className='sorting-state '+m.sorting_status;badge.textContent=labels[m.sorting_status]||labels.unassigned;tile.append(badge);card.onclick=action(async e=>{if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();select(mid,e.shiftKey);return;}await mediaDialog(mid);});}
    for(const button of $$('[data-bulk-action]'))button.onclick=action(()=>bulkDialog(button.dataset.bulkAction));updateSelection();
  }
  async function apply(operation,ids,extra={}){const result=await api('/api/media/bulk',{operation,media_ids:ids,...extra});await ctx.refresh();await reload();toast(`${result.updated} of ${result.selected} selected files updated${operation==='assign'?` · ${result.associations} character links added`:''}. Canon and original files unchanged.`);}
  async function bulkDialog(operation){const ids=[...selected];if(!ids.length)return;
    if(operation==='remove')return removeDialog(ids);
    if(operation==='analysis')return ctx.analysisDialog(ids);
    if(operation==='structured')return ctx.structuredTags(ids);
    if(operation==='location')return ctx.locationDialog(ids);
    if(['complete','reopen','unlocation'].includes(operation))return apply(operation,ids);
    const isCharacters=operation==='assign';openDialog(isCharacters?'Add characters to selected media':operation==='tags_add'?'Add tags to selected media':'Remove selected tags',`<form id="bulk-form" class="form-grid"><div class="note">Applies to ${ids.length} selected files on this page only. ${isCharacters?'Existing character assignments are preserved.':operation==='tags_add'?'Existing tags and notes are preserved.':'Only the exact comma-separated tags entered below will be removed.'}</div>${isCharacters?`<input id="bulk-character-search" aria-label="Find characters" placeholder="Find a character…"><div class="checks">${getState().characters.map(c=>`<label><input type="checkbox" name="character" value="${c.id}">${esc(c.name)}</label>`).join('')}</div>`:`<label>Comma-separated tags<input name="tags" maxlength="2000" required placeholder="white tank top, smiling, full body"></label>`}<div class="dialog-footer"><button type="button" id="bulk-cancel">Cancel</button><button class="primary" id="bulk-submit">${isCharacters?'Add characters':operation==='tags_add'?'Add tags':'Remove these tags'}</button></div></form>`);
    $('#bulk-cancel').onclick=()=>$('#dialog').close();if($('#bulk-character-search'))$('#bulk-character-search').oninput=e=>{for(const label of $$('#bulk-form .checks label'))label.hidden=!label.textContent.toLocaleLowerCase().includes(e.target.value.toLocaleLowerCase());};
    $('#bulk-form').onsubmit=action(async e=>{e.preventDefault();const f=new FormData(e.target);const button=$('#bulk-submit');button.disabled=true;try{const result=await api('/api/media/bulk',{operation,media_ids:ids,...(isCharacters?{character_ids:f.getAll('character')}:{tags:f.get('tags')})});$('#dialog').close();await ctx.refresh();await reload();toast(`${result.updated} of ${result.selected} files updated${isCharacters?` · ${result.associations} character links added`:''}.`);}finally{if(button.isConnected)button.disabled=false;}});
  }
  function removeDialog(ids){
    const names=new Map(page.map(m=>[m.id,m.relative_path]));let busy=false,stopped=false;
    openDialog('Remove selected media',`<form id="bulk-remove-form" class="form-grid"><div class="note">Only the ${ids.length} selected items on this page are affected. Nothing is permanently erased. Approved identity references remain protected.</div><label class="radio-label"><input type="radio" name="mode" value="catalogue" checked> Remove from catalogue only · keep the original files</label><label class="radio-label"><input type="radio" name="mode" value="file"> Remove from catalogue and move files to recoverable application trash</label><small>Restore removed items from Removed items. Application trash is separate from the Windows Recycle Bin. Notes, assignments and history stay attached to each record.</small><details><summary>Selected files (${ids.length})</summary>${ids.map(id=>`<p>${esc(names.get(id)||id)}</p>`).join('')}</details><p id="bulk-remove-status" role="status" aria-live="polite"></p><div id="bulk-remove-results"></div><div class="dialog-footer"><button type="button" id="bulk-remove-cancel">Cancel</button><button type="submit" class="danger" id="bulk-remove-submit">Remove ${ids.length} selected items</button></div></form>`);
    const form=$('#bulk-remove-form'),submit=$('#bulk-remove-submit'),cancel=$('#bulk-remove-cancel'),feedback=$('#bulk-remove-status'),results=$('#bulk-remove-results'),dialog=$('#dialog');
    const onClose=()=>{stopped=true;};dialog.addEventListener('close',onClose,{once:true});
    cancel.onclick=()=>{if(busy){stopped=true;cancel.disabled=true;feedback.textContent='Stopping after the current item…';}else{dialog.removeEventListener('close',onClose);dialog.close();}};
    form.onsubmit=async e=>{
      e.preventDefault();if(busy||submit.disabled)return;const selectedMode=new FormData(form).get('mode');busy=true;submit.disabled=true;cancel.textContent='Stop after current item';for(const radio of form.querySelectorAll('input'))radio.disabled=true;
      try{
        const result=await removeSelectedMedia({ids,mode:selectedMode,api,isCanceled:()=>stopped||!form.isConnected,onProgress:p=>{feedback.textContent=`${p.processed} / ${ids.length} processed · ${p.removed} removed · ${p.failed} not removed`;}});
        for(const id of result.removed)selected.delete(id);updateSelection();
        feedback.textContent=`${result.removed.length} removed · ${result.failed.length} not removed${result.unprocessed.length?' · '+result.unprocessed.length+' left untouched':''}. Restore removed items from Removed items.`;
        results.innerHTML=[...result.failed.map(f=>`<p class="error">${esc(names.get(f.id)||f.id)}: ${esc(f.message)}</p>`),...result.warnings.map(f=>`<p>${esc(names.get(f.id)||f.id)}: ${esc(f.message)}</p>`)].join('');
        await ctx.refresh();await reload();toast(`${result.removed.length} selected items removed${result.failed.length?' · '+result.failed.length+' could not be removed':''}.`);
      }catch(error){feedback.textContent='The list could not finish refreshing: '+error.message+'. Check Removed items before retrying.';}
      finally{busy=false;cancel.disabled=false;cancel.textContent='Close';dialog.removeEventListener('close',onClose);}
    };
  }
  async function viewer(m){
    if(queueScope!==scope||!queue.includes(m.id)){const result=queueUrl?await api(queueUrl):{ids:[m.id]};queue=result.ids.includes(m.id)?result.ids:[m.id];queueScope=scope;}
    const index=queue.indexOf(m.id),form=$('#media-form');if(!form)return;
    form.insertAdjacentHTML('beforeend',`<input type="checkbox" id="categorization-complete" hidden ${m.categorization_complete?'checked':''}><small>Finish sorting removes this item from Needs sorting, including multicharacter scenes. Save for later keeps it in review. Neither action approves canon.</small><button type="button" id="sort-draft">Save for later / needs review</button><span id="media-save-status" class="saved" role="status"></span>`);
    $('button[type="submit"],button.primary',form).textContent='Finish sorting & save';
    $('.dialog-head').insertAdjacentHTML('afterend',`<div class="viewer-sort-nav"><button id="sort-prev" ${index===0?'disabled':''} title="Alt+Left">← Previous (keep status)</button><span>${index+1} / ${queue.length} in this filtered sorting session</span><button id="sort-next" ${index===queue.length-1?'disabled':''} title="Alt+Right">Next (keep status) →</button><button id="sort-save-next" class="primary" title="Ctrl+Enter">${index===queue.length-1?'Finish sorting':'Finish sorting & next'}</button></div>`);
    async function save(complete=$('#categorization-complete').checked){const values=await mediaFormPayload(form,complete);const updated=await api('/api/media/'+m.id,values,'PUT');if(updated?.characters)form._afterMediaSave?.(updated);$('#categorization-complete').checked=complete;needsRefresh=true;const location=values.location_reference;$('#media-save-status').textContent=location?'Location reference saved':complete?'Sorting finished':'Draft saved · still needs review';await ctx.refresh();toast(location?'Saved to location references. Removed from Needs sorting.':complete?'Sorting finished. Removed from Needs sorting.':'Saved for later. Remains in Needs sorting.');}
    async function navigate(direction,finish=false){if(saving)return;const next=index+direction;if(next<0)return;if(next>=queue.length&&!finish)return;saving=true;for(const b of $$('.viewer-sort-nav button'))b.disabled=true;try{await save(finish?true:undefined);if(finish&&await ctx.afterFinish?.(m.id))return;if(next>=queue.length){$('#dialog').close();return;}await mediaDialog(queue[next]);}finally{saving=false;for(const b of $$('.viewer-sort-nav button'))b.disabled=false;const current=queue.indexOf($('#media-form')?.dataset.mediaId);if($('#sort-prev'))$('#sort-prev').disabled=current===0;if($('#sort-next'))$('#sort-next').disabled=current===queue.length-1;}}
    form.dataset.mediaId=m.id;
    $('#sort-prev').onclick=action(()=>navigate(-1));$('#sort-next').onclick=action(()=>navigate(1));$('#sort-save-next').onclick=action(()=>navigate(1,true));
    form.onsubmit=action(async e=>{e.preventDefault();if(saving)return;saving=true;try{await save(true);if(await ctx.afterFinish?.(m.id))return;needsRefresh=false;$('#dialog').close();await reload();}finally{saving=false;}});
    $('#sort-draft').onclick=action(async()=>{if(saving)return;saving=true;try{await save(false);}finally{saving=false;}});
    const move=$('#move-original-button');if(move?.insertAdjacentHTML){move.insertAdjacentHTML('beforebegin','<button type="button" id="sort-save" class="primary">Save</button>');$('#sort-save').onclick=action(async()=>{if(saving)return;saving=true;$('#sort-save').disabled=true;try{await save(true);}finally{saving=false;if($('#sort-save'))$('#sort-save').disabled=false;}});}
    if(form.querySelector)installSortingPickers({form,m,getState});
    form._sortNavigate=navigate;
  }
  function controls(){document.addEventListener('keydown',action(async e=>{if(!$('#dialog').open||typeof $('#media-form')?._sortNavigate!=='function'||saving)return;if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();await $('#media-form')._sortNavigate(1,true);}else if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();await $('#media-form')._sortNavigate(e.key==='ArrowLeft'?-1:1);}}));$('#dialog').addEventListener('close',()=>{queue=[];queueScope='';if(needsRefresh){needsRefresh=false;render().catch(e=>toast(e.message,true));}});}
  return {setPage,listing,viewer,controls,reset,getStatus:()=>status};
}
