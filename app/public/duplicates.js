import {differenceHash,visualVersion} from './image-hash.js';
import {mediaFormPayload} from './media-form.js';

export function installDuplicatesUI({$,$$,esc,api,action,toast,openDialog,mediaDialog,getState,refresh:ctxRefresh}){
  let scanning=false,stop=false,mode='exact',threshold=6,comparisonGroups=[],comparisonIndex=0,recordContext=null;
  async function hashImage(item){
    const image=new Image();
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('Image decoding timed out'));},20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('Browser cannot decode this image'));};image.src=`/media/${encodeURIComponent(item.id)}?fingerprint=${item.visual.sha256}`;});
    const canvas=document.createElement('canvas');canvas.width=9;canvas.height=8;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,9,8);ctx.drawImage(image,0,0,9,8);
    await api('/api/duplicates/visual',{id:item.id,...item.visual,hash:differenceHash(ctx.getImageData(0,0,9,8).data),version:visualVersion,width:image.naturalWidth,height:image.naturalHeight});
  }
  async function home(){
    if(scanning){toast('An analysis is already running. Stop it or wait for completion.');return;}
    openDialog('Duplicates & similar pictures',`<p>Optional local analysis. Results are suggestions for manual comparison. Nothing is deleted, merged, reassigned, or approved.</p><label>Analyze collection<select id="duplicate-folder"><option value="*">All catalogued media</option>${getState().folders.map(f=>`<option value="${esc(f.folder)}">${esc(f.folder||'Loose files')} (${f.count})</option>`).join('')}</select></label><label class="duplicate-check"><input type="checkbox" id="duplicate-download"> Allow reading online-only files (OneDrive may download originals)</label><p class="muted">Unchecked: skip online-only files or files whose local availability cannot be verified. SHA-256 checks pictures and videos. Visual suggestions use browser-decoded pictures only; unsupported formats are skipped. Unchanged fingerprints are reused.</p><div class="toolbar"><button id="duplicate-start" class="primary">Analyze chosen collection</button><button id="duplicate-results">Show cached results</button></div><p class="note">Visual similarity compares overall image patterns, not character identity. Crops, pose changes, and different generations can be missed; unrelated pictures can match. No face recognition or AI provider is used.</p>`);
    $('#duplicate-results').onclick=action(()=>results());$('#duplicate-start').onclick=action(()=>analyze($('#duplicate-folder').value,$('#duplicate-download').checked));
  }
  async function analyze(folder,allow_download){
    if(scanning)return;scanning=true;stop=false;const counts={hashed:0,cached:0,skipped:0,visual:0,visualFailed:0},issues=[];
    openDialog('Analyzing duplicates',`<p id="duplicate-progress" role="status">Preparing…</p><p>Analysis is local. Closing this window stops after the current file batch. Cached work is retained.</p><button id="duplicate-stop">Stop after current batch</button>`);
    const dialog=$('#dialog'),panel=$('#duplicate-progress');const onClose=()=>{stop=true;};dialog.addEventListener('close',onClose,{once:true});$('#duplicate-stop').onclick=()=>{stop=true;$('#duplicate-stop').disabled=true;};
    try{const plan=await api('/api/duplicates/plan'+(folder==='*'?'':'?folder='+encodeURIComponent(folder)));let processed=0;
      for(let i=0;i<plan.ids.length&&!stop&&panel.isConnected;i+=25){const batch=await api('/api/duplicates/analyze',{ids:plan.ids.slice(i,i+25),allow_download});
        for(const item of batch.results){counts[item.status]++;if(item.reason)issues.push(`${item.id}: ${item.reason}`);if(item.visual&&!stop&&panel.isConnected){try{await hashImage(item);counts.visual++;}catch(e){counts.visualFailed++;issues.push(`${item.id}: ${e.message}`);}}processed++;if(panel.isConnected)panel.textContent=`${processed} / ${plan.ids.length} checked · ${counts.hashed} hashed · ${counts.cached} reused · ${counts.skipped} skipped · ${counts.visual} visual fingerprints`;}
      }
      if(panel.isConnected){panel.insertAdjacentHTML('afterend',`<p>${stop?'Stopped.':'Finished.'} ${counts.visualFailed} visual decoding failures. Cached exact hashes remain usable.</p>${issues.length?`<details><summary>Skipped files / decoding issues (${issues.length})</summary><pre>${esc(issues.slice(0,100).join('\n'))}</pre></details>`:''}<button id="duplicate-show">Review results</button>`);$('#duplicate-show').onclick=action(()=>results());}
      toast(`${counts.hashed} hashed · ${counts.cached} cached · ${counts.skipped} skipped. No originals changed.`);
    }finally{scanning=false;dialog.removeEventListener('close',onClose);}
  }
  async function results(offset=0){
    const data=await api(`/api/duplicates/groups?mode=${mode}&threshold=${threshold}&offset=${offset}`);
    openDialog('Duplicate review',`<div class="toolbar"><button id="duplicate-home">Analysis options</button><label>Show<select id="duplicate-mode"><option value="exact" ${mode==='exact'?'selected':''}>Identical file groups</option><option value="similar" ${mode==='similar'?'selected':''}>Similar picture pairs</option></select></label>${mode==='similar'?`<label>Difference tolerance<select id="duplicate-threshold">${[0,3,6,9,12].map(n=>`<option ${threshold===n?'selected':''} value="${n}">${n} / 64 bits</option>`).join('')}</select></label>`:''}</div><p>${data.cached} of ${data.active} active files have current exact hashes. ${data.stale} stale or unavailable cached files excluded. Results cover all analyzed folders.</p><p class="note">${mode==='exact'?'Same SHA-256 means identical file contents; each catalogue record keeps its own metadata.':'Pairs are suggestions based on overall image patterns. Lower bit difference means closer hashes, not a confidence percentage or proof of character identity.'} Previews load only after you choose Compare; OneDrive may download those files.</p>${data.truncated?'<p class="note">Showing at most 2,000 candidate pairs. Choose a lower tolerance to narrow results.</p>':''}<div>${data.items.map((g,i)=>`<div class="duplicate-group"><b>${mode==='exact'?`${g.items.length} identical files`:`${g.distance} / 64 bits different`}</b><ul>${g.items.map(m=>`<li>${esc(m.relative_path)}${m.canonical?' · canonical reference (current or historical)':''}${m.characters.length?' · '+esc(m.characters.join(', ')):''}</li>`).join('')}</ul><button data-duplicate-compare="${i}">Compare</button></div>`).join('')||'<p>No matches in the current cached results. Run an analysis first if files have not been checked.</p>'}</div><div class="dialog-footer"><span>${data.total} ${mode==='exact'?'groups':'pairs'}</span><button id="duplicate-prev" ${offset===0?'disabled':''}>Previous</button><button id="duplicate-next" ${offset+25>=data.total?'disabled':''}>Next</button></div>`);
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
    openDialog('Compare files',`<p>Unfinished copies are shown first. Move to trash removes that copy in one click; restore it from Removed items. This uses the application’s recoverable trash, not Windows Recycle Bin. Notes and assignments are not transferred to the remaining copy.</p><button id="duplicate-back">Back to matches</button><div class="toolbar"><button id="duplicate-group-prev" ${comparisonIndex===0?'disabled':''}>Previous group</button><span>Group ${comparisonIndex+1} / ${comparisonGroups.length}</span><button id="duplicate-group-next" ${comparisonIndex+1>=comparisonGroups.length?'disabled':''}>Next group</button></div><div class="duplicate-comparison">${visible.map(m=>`<article>${m.kind==='image'?`<img src="/media/${encodeURIComponent(m.id)}" loading="lazy" alt="${esc(m.relative_path)}">`:`<video src="/media/${encodeURIComponent(m.id)}" controls preload="metadata"></video>`}<p>${esc(m.relative_path)}</p><p>${esc(m.characters.join(', ')||'No assigned characters')}${m.canonical?' · Canonical reference (current or historical)':''}</p><p class="${m.categorization_complete?'muted':'duplicate-unfinished'}">${m.categorization_complete?'Sorting complete':'Not finished sorting · preferred spare copy'}</p><button data-duplicate-open="${esc(m.id)}">Open record</button><button type="button" class="danger" data-duplicate-trash="${esc(m.id)}" ${m.canonical||group.items.length<2?'disabled':''}>${m.canonical?'Protected reference':'Move to trash'}</button></article>`).join('')}</div><div class="toolbar"><button id="duplicate-members-prev" ${page===0?'disabled':''}>Previous copies in this group</button><span>${page+1}–${Math.min(page+12,group.items.length)} / ${group.items.length}</span><button id="duplicate-members-next" ${page+12>=group.items.length?'disabled':''}>More copies in this group</button></div>`);
    $('#duplicate-group-prev').onclick=()=>{if(group.removing||comparisonIndex===0)return;comparisonIndex--;compare(comparisonGroups[comparisonIndex],offset);};
    $('#duplicate-group-next').onclick=()=>{if(group.removing||comparisonIndex+1>=comparisonGroups.length)return;comparisonIndex++;compare(comparisonGroups[comparisonIndex],offset);};
    $('#duplicate-back').onclick=action(()=>results(offset));$('#duplicate-members-prev').onclick=()=>compare(group,offset,page-12);$('#duplicate-members-next').onclick=()=>compare(group,offset,page+12);for(const b of $$('[data-duplicate-open]'))b.onclick=action(async()=>{recordContext={group,offset,page,index:comparisonIndex,mid:b.dataset.duplicateOpen};await mediaDialog(b.dataset.duplicateOpen);});
    for(const b of $$('[data-duplicate-trash]'))b.onclick=async()=>{
      if(group.removing||group.items.length<2)return;
      group.removing=true;for(const button of $$('[data-duplicate-trash]'))button.disabled=true;
      b.textContent='Moving to trash…';
      try{
        const result=await api('/api/media/'+encodeURIComponent(b.dataset.duplicateTrash)+'/remove',{mode:'file'});
        for(const entry of comparisonGroups)entry.items=entry.items.filter(item=>item.id!==b.dataset.duplicateTrash);
        await ctxRefresh();compare(group,offset,Math.min(page,Math.max(0,Math.floor((group.items.length-1)/12)*12)));
        toast(result.warning||'Copy moved to recoverable trash. Restore it from Removed items.',Boolean(result.warning));
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
    $('.dialog-head').insertAdjacentHTML('afterend','<div class="viewer-sort-nav"><button type="button" id="return-duplicate-comparison">← Back to duplicate comparison</button><small>Saves current edits and keeps the current sorting status.</small></div>');
    $('#return-duplicate-comparison').onclick=action(async e=>{const button=e.currentTarget;button.disabled=true;try{await api('/api/media/'+encodeURIComponent(m.id),await mediaFormPayload($('#media-form'),$('#categorization-complete').checked),'PUT');await ctxRefresh();await returnAfterSave(m.id);}finally{button.disabled=false;}});
    $('#sort-save-next').textContent='Finish sorting & return to duplicates';
  }
  function controls(){$('.sidebar-bottom').insertAdjacentHTML('afterbegin','<button id="duplicate-tool">Duplicates & similar pictures</button>');$('#duplicate-tool').onclick=action(home);$('#dialog')?.addEventListener('close',()=>{recordContext=null;});}
  return {controls,viewer,returnAfterSave};
}
