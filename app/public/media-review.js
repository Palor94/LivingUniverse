import {confirmBox} from './interactions.js';
// "Tartalom és hasonlók": two quick review screens for the creator's own collection.
//  1. Content labelling: one picture/video at a time whose content level is unknown;
//     keys 1 / 2 / 3 (everyday / nudity / explicit), S = skip, Backspace = undo the last.
//     Videos loop muted at double speed. The label beats the AI estimate everywhere.
//  2. Near-duplicate groups: side by side with a suggested keeper; "Keep this one" sends the
//     others to the recoverable Removed items; "Not duplicates" splits the group for good.
import {t} from './i18n.js';

const LEVELS=[['non_intimate','☀','1'],['nudity','🔥','2'],['sexual_activity','🔞','3']];

export function installMediaReviewUI({$,$$,esc,api,toast}){
  let tab='content',kind='all',queue=[],idx=0,total=0,history=[],busy=false,keyHandler=null;
  const src=id=>'/media/'+encodeURIComponent(id);

  async function render(root){
    root.innerHTML=`<div class="mr"><header class="mr-head"><h1>${t('mr.title')}</h1><p class="muted">${t('mr.lead')}</p>
      <div class="mr-tabs" role="tablist">${['content','duplicates'].map(x=>`<button role="tab" aria-selected="${x===tab}" class="${x===tab?'active':''}" data-mr-tab="${x}">${t('mr.tab.'+x)}</button>`).join('')}</div></header><div id="mr-body"></div></div>`;
    for(const b of $$('[data-mr-tab]'))b.onclick=()=>{tab=b.dataset.mrTab;render(root);};
    detachKeys();
    if(tab==='content'){await loadQueue();paintContent();attachKeys(root);}else await paintDuplicates();
  }

  // ---- 1. content labelling ------------------------------------------------------------
  // more=true appends the next page (offset = items already held, see media-review.mjs).
  async function loadQueue(more=false){const r=await api('/api/review/content?'+new URLSearchParams({kind,limit:'40',offset:String(more?queue.length:0)}));queue=more?queue.concat(r.items):r.items;total=r.total;if(!more)idx=0;}
  const topUp=async()=>{if(idx>=queue.length-5&&queue.length<total)await loadQueue(true);};
  function paintContent(){
    const box=$('#mr-body');if(!box)return;const item=queue[idx];
    const filter=`<div class="mr-filter">${['all','image','video'].map(k=>`<button class="${k===kind?'active':''}" data-mr-kind="${k}">${t('mr.kind.'+k)}</button>`).join('')}<span class="muted">${t('mr.left',{count:Math.max(0,total)})}</span></div>`;
    // End of the list: either everything is labelled, or only skipped items are left.
    if(!item){const left=queue.length;box.innerHTML=filter+(left?`<div class="empty"><h2>${t('mr.queueEnd',{count:left})}</h2><button class="primary" id="mr-restart">${t('mr.restart')}</button></div>`:`<div class="empty"><div class="symbol">✓</div><h2>${t('mr.contentDone')}</h2></div>`);
      if($('#mr-restart'))$('#mr-restart').onclick=()=>{idx=0;paintContent();};bindKind();return;}
    box.innerHTML=filter+`<div class="mr-stage">${item.kind==='video'?`<video src="${src(item.media_id)}" muted loop autoplay playsinline></video>`:`<img src="${src(item.media_id)}" alt="${esc(item.file)}">`}</div>
      <p class="mr-meta"><b>${esc(item.people.join(', ')||t('mr.nobody'))}</b> · ${esc(item.file)}${item.duration?` · ${Math.round(item.duration)} mp`:''}</p>
      <div class="mr-keys">${LEVELS.map(([l,icon,key])=>`<button class="mr-level" data-mr-level="${l}"><span>${icon}</span>${t('ml.level.'+l)}<kbd>${key}</kbd></button>`).join('')}
        <button class="subtle" id="mr-skip">${t('mr.skip')} <kbd>S</kbd></button><button class="subtle" id="mr-undo"${history.length?'':' disabled'}>${t('mr.undo')} <kbd>⌫</kbd></button></div>`;
    const v=box.querySelector('video');if(v){v.playbackRate=2;v.play?.().catch(()=>{});}
    // Preload the next picture so the queue feels instant.
    const next=queue[idx+1];if(next?.kind==='image'){const im=new Image();im.src=src(next.media_id);}
    for(const b of $$('[data-mr-level]'))b.onclick=()=>label(b.dataset.mrLevel);
    $('#mr-skip').onclick=()=>advance();$('#mr-undo').onclick=()=>undo();bindKind();
  }
  function bindKind(){for(const b of $$('[data-mr-kind]'))b.onclick=async()=>{kind=b.dataset.mrKind;history=[];await loadQueue();paintContent();};}
  async function advance(){if(idx<queue.length)idx++;await topUp();paintContent();}
  async function label(level){
    const item=queue[idx];if(!item||busy)return;busy=true;
    try{await api('/api/play/content',{media_id:item.media_id,level});history.push(item);total--;queue.splice(idx,1);await topUp();paintContent();}
    catch(e){toast(e.message,true);}finally{busy=false;}
  }
  async function undo(){
    const item=history.pop();if(!item||busy)return;busy=true;
    try{await api('/api/play/content',{media_id:item.media_id,level:null});queue.splice(idx,0,item);total++;paintContent();toast(t('mr.undone'));}
    catch(e){history.push(item);toast(e.message,true);}finally{busy=false;}
  }
  function attachKeys(root){
    keyHandler=e=>{
      if(!root.isConnected||!$('#mr-body')){detachKeys();return;}
      if(e.target.closest?.('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;
      const l=LEVELS.find(x=>x[2]===e.key);
      if(l){e.preventDefault();label(l[0]);}else if(e.key==='s'||e.key==='S'||e.key==='ArrowRight'){e.preventDefault();advance();}else if(e.key==='Backspace'){e.preventDefault();undo();}
    };
    document.addEventListener('keydown',keyHandler);
  }
  function detachKeys(){if(keyHandler)document.removeEventListener('keydown',keyHandler);keyHandler=null;}

  // ---- 2. near-duplicate groups ----------------------------------------------------------
  async function paintDuplicates(){
    const box=$('#mr-body');if(!box)return;const r=await api('/api/review/duplicates?limit=30');
    if(!r.groups.length){box.innerHTML=`<div class="empty"><div class="symbol">✓</div><h2>${t('mr.noDuplicates')}</h2><p class="muted">${t('mr.noDuplicatesLead')}</p></div>`;return;}
    box.innerHTML=`<p class="muted">${t('mr.dupLead',{count:r.total})}</p>`+r.groups.map(g=>`<section class="mr-group" data-group="${esc(g.group_id)}"><div class="mr-group-items">${g.items.map(i=>`<figure class="mr-dup${i.media_id===g.keeper?' mr-keeper':''}">
        <img src="/thumb/${encodeURIComponent(i.media_id)}" alt="" loading="lazy"><figcaption><b>${esc(i.file)}</b><small>${i.width&&i.height?`${i.width}×${i.height}`:''}${i.size?` · ${Math.round(i.size/1024)} KB`:''}${i.captured_at?` · ${esc(i.captured_at.replace('T',' '))}`:''}</small>
        <small>${esc(i.people.join(', '))}${i.protected?` · <b>${t('mr.protected')}</b>`:''}</small>
        <button class="${i.media_id===g.keeper?'primary':'subtle'}" data-keep="${esc(i.media_id)}">${t('mr.keepThis')}</button></figcaption></figure>`).join('')}</div>
      <div class="we-row"><button class="subtle" data-distinct="${esc(g.group_id)}">${t('mr.notDuplicates')}</button></div></section>`).join('');
    const groupItems=gid=>r.groups.find(g=>g.group_id===gid).items;
    for(const b of $$('[data-keep]'))b.onclick=async()=>{
      const sec=b.closest('[data-group]'),items=groupItems(sec.dataset.group),keep=b.dataset.keep;
      const drop=items.filter(i=>i.media_id!==keep&&!i.protected);
      if(!drop.length)return toast(t('mr.nothingToRemove'));
      if(!await confirmBox(t('mr.confirmRemove',{count:drop.length})))return;
      let done=0;for(const i of drop){try{const res=await api('/api/media/'+encodeURIComponent(i.media_id)+'/remove',{mode:'catalogue'});if(res.ok===true)done++;}catch(e){toast(e.message,true);break;}}
      toast(t('mr.removed',{count:done}));await paintDuplicates();
    };
    for(const b of $$('[data-distinct]'))b.onclick=async()=>{await api('/api/review/duplicates/distinct',{media_ids:groupItems(b.dataset.distinct).map(i=>i.media_id)});toast(t('mr.markedDistinct'));await paintDuplicates();};
  }
  // Another screen (Képműhely) can open a given tab on the next render.
  return {render,leave:detachKeys,show:next=>{if(['content','duplicates'].includes(next))tab=next;}};
}
