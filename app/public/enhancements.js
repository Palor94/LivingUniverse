import {installCharacterReferenceCrop} from './character-reference-crops.js';
import {installPictureCrop} from './picture-crop.js';
import {t} from './i18n.js';
export function preferredCoverCharacter(characters,preferred){
  return characters.some(c=>c.id===preferred)?preferred:characters.length===1?characters[0].id:'';
}

export function coverSourceRectangle(width,height,crop){
  return {x:crop.x*width,y:crop.y*height,w:crop.w*width,h:crop.h*height};
}
function croppedCoverJpeg(image,crop){
  const r=coverSourceRectangle(image.naturalWidth,image.naturalHeight,crop),canvas=document.createElement('canvas');let scale=Math.min(1,1200/Math.max(r.w,r.h));
  for(let attempt=0;attempt<4;attempt++){canvas.width=Math.max(1,Math.round(r.w*scale));canvas.height=Math.max(1,Math.round(r.h*scale));canvas.getContext('2d').drawImage(image,r.x,r.y,r.w,r.h,0,0,canvas.width,canvas.height);for(const quality of [.9,.75,.55,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=390000)return data;}scale*=.7;}
  throw Error(t('enh.frameTooLarge'));
}

// Bind the button explicitly as well as form/keyboard submission. Keep feedback
// inside the modal: a page-level toast can be hidden behind a modal dialog.
export function bindCoverSave({form,button,status,isReady,character,getCrop,save,onSaved}){
  let saving=false;
  async function submit(event){
    event?.preventDefault();if(saving)return;
    const selected=character();
    if(!selected){status.textContent=t('cover.chooseCharacter');status.className='error';return;}
    if(!isReady()){status.textContent=t('cover.waitLoading');status.className='error';return;}
    saving=true;button.disabled=true;button.textContent=t('cover.saving');status.className='saved';status.textContent=t('cover.savingFor',{name:selected.name});let saved=false;
    try{await save(selected.id,{...getCrop()});saved=true;status.textContent=t('cover.savedFor',{name:selected.name});await onSaved(selected.id);}
    catch(error){status.className='error';status.textContent=(saved?t('cover.savedNoRefresh'):t('cover.notSaved'))+error.message;}
    finally{saving=false;button.disabled=!isReady();button.textContent=t('cover.saveButton');}
  }
  button.type='button';button.onclick=submit;form.onsubmit=submit;return submit;
}

export function installEnhancements(ctx){
  const {$,$$,esc,api,action,toast,openDialog,refresh,render,mediaDialog,getState,getView,getKind,setKind}=ctx;
  const pending=new Set();
  const remember=p=>{pending.add(p);p.finally(()=>pending.delete(p)).catch(()=>{});return p;};
  function profile(c){
    const form=$('#profile-form');if(!form)return;
    for(const input of $$('input,textarea,select',form)){
      input.dataset.saved=input.value;
      input.addEventListener(input.tagName==='SELECT'?'change':'blur',()=>{if(input.value===input.dataset.saved)return;const value=input.value;const status=$('#save-status');if(status)status.textContent=t('enh.saving');remember(api('/api/characters/'+c.id+'/profile-field',{field:input.name,value,expected:input.dataset.saved})).then(async result=>{input.dataset.saved=value;if(status)status.textContent=result.folder_sync?.completed?.length?t('enh.savedFolder'):t('enh.savedAuto');const stored=getState().characters.find(x=>x.id===c.id);if(stored)stored[input.name]=value;if(input.name==='name'){await refresh();if(getView()==='profile'&&ctx.getActiveCharacter?.()===c.id){const title=$('#content .heading h1');if(title)title.textContent=value;}}}).catch(e=>{if(status)status.textContent=t('enh.notSaved')+e.message;toast(e.message,true);});});
    }
    const p=getState().protagonist;if(p&&p.id!==c.id){const relation=c.relationships.find(r=>r.target_id===p.id);const panel=$('#add-relationship')?.parentElement;
      panel?.insertAdjacentHTML('afterbegin',`<label class="primary-relationship">${t('enh.palorRelation')}<textarea id="palor-relationship" placeholder="${esc(t('enh.palorPlaceholder'))}">${esc(relation?.description||'')}</textarea><small>${t('enh.palorHint')}</small></label>`);
      const input=$('#palor-relationship');if(input){input.dataset.saved=input.value;let expected=relation?.description??null;input.onblur=()=>{if(input.dataset.saved===input.value)return;const value=input.value;remember(api('/api/relationships',{source_id:c.id,target_id:p.id,description:value,expected})).then(()=>{input.dataset.saved=value;expected=value.trim()||null;toast(t('enh.palorSaved'));}).catch(e=>toast(e.message,true));};}
    }
    if(p&&p.id!==c.id){$('#add-relationship').textContent=t('enh.otherRelationship');}
  }
  function covers(){for(const canvas of $$('canvas[data-cover-src]')){if(canvas.dataset.loaded)continue;canvas.dataset.loaded='1';const image=new Image();image.onload=()=>{const crop=JSON.parse(canvas.dataset.crop);const w=image.naturalWidth,h=image.naturalHeight;canvas.width=400;canvas.height=canvas.closest('.portrait')?470:canvas.closest('.profile-cover')?520:300;const source={x:crop.x*w,y:crop.y*h,w:crop.w*w,h:crop.h*h};const scale=Math.max(canvas.width/source.w,canvas.height/source.h),dw=source.w*scale,dh=source.h*scale;
    // Too tall for the frame: keep the top (the head) instead of cutting it off in the middle.
    canvas.getContext('2d').drawImage(image,source.x,source.y,source.w,source.h,(canvas.width-dw)/2,dh>canvas.height?0:(canvas.height-dh)/2,dw,dh);};image.onerror=()=>{canvas.replaceWith(document.createTextNode(t('enh.coverUnavailable')));};image.src=canvas.dataset.coverSrc;}}
  let previewObserver;const previewVideos=new Set();
  function cleanupPreviews(){if(previewObserver)previewObserver.disconnect();for(const v of previewVideos){v._cleanupPreview?.();v.pause();v.removeAttribute('src');v.load();}previewVideos.clear();}
  function listing(){
    const toolbar=$('.toolbar');if(toolbar&&$('#kind-filter')&&!$('#media-type-tabs')){toolbar.insertAdjacentHTML('beforebegin',`<div class="tabs media-type-tabs" id="media-type-tabs"><button data-media-kind="image" class="${getKind()==='image'?'active':''}">${t('filters.images')}</button><button data-media-kind="video" class="${getKind()==='video'?'active':''}">${t('filters.videos')}</button></div>`);$('#kind-filter').classList.add('hidden');for(const b of $$('[data-media-kind]'))b.onclick=action(()=>setKind(b.dataset.mediaKind));}
    cleanupPreviews();
    previewObserver=new IntersectionObserver(entries=>{for(const {target:v,isIntersecting} of entries){v._previewVisible=isIntersecting;if(isIntersecting&&!v._previewLoaded){v._previewLoaded=true;v.preload='auto';v.load();}v._updatePreview?.();}},{rootMargin:'0px'});
    for(const v of $$('.media-preview video')){
      v.muted=true;v.playsInline=true;const thumbnail=v.closest('.media-preview');let hovered=false;
      const stop=()=>{clearInterval(v._timer);v._timer=null;};
      const next=()=>{if(!hovered||document.hidden||!v._previewVisible||!v.isConnected){stop();return;}if(v.seeking||v.readyState<2||!v.duration||!Number.isFinite(v.duration))return;try{v.currentTime=(v.currentTime+5>=v.duration)?Math.min(.1,v.duration/2):v.currentTime+5;}catch{}};
      const update=()=>{if(hovered&&v._previewVisible&&!document.hidden&&!v.error){if(!v._timer)v._timer=setInterval(next,1400);}else stop();};
      const enter=()=>{hovered=true;update();},leave=()=>{hovered=false;stop();};
      v.addEventListener('loadedmetadata',()=>{try{v.currentTime=Math.min(.1,v.duration/2);}catch{}},{once:true});
      v.addEventListener('error',()=>{stop();if(!thumbnail.isConnected)return;thumbnail.insertAdjacentHTML('afterbegin',`<span class="broken-label">${t('enh.videoDecode')}</span>`);v.classList.add('hidden');},{once:true});
      thumbnail.addEventListener('mouseenter',enter);thumbnail.addEventListener('mouseleave',leave);document.addEventListener('visibilitychange',update);
      v._updatePreview=update;v._cleanupPreview=()=>{stop();thumbnail.removeEventListener('mouseenter',enter);thumbnail.removeEventListener('mouseleave',leave);document.removeEventListener('visibilitychange',update);};
      previewVideos.add(v);previewObserver.observe(v);
    }
    covers();
  }
  async function rename(m){openDialog(t('enh.renameTitle'),`<form id="rename-form" class="form-grid"><label>${t('enh.filename')}<input name="filename" required value="${esc(m.relative_path.split(/[\\/]/).pop())}"></label><p>${t('enh.renameText')}</p><div class="dialog-footer"><button type="button" id="rename-cancel">${t('common.cancel')}</button><button class="primary">${t('enh.renameSubmit')}</button></div></form>`);$('#rename-cancel').onclick=action(()=>mediaDialog(m.id));$('#rename-form').onsubmit=action(async e=>{e.preventDefault();const result=await api('/api/media/'+m.id+'/rename',{filename:new FormData(e.target).get('filename')});await render();await mediaDialog(m.id);toast(result.warning||t('enh.renamed'),Boolean(result.warning));});}
  function remove(m){openDialog(t('enh.removeTitle'),`<form id="remove-form" class="form-grid"><p>${esc(m.relative_path)}</p><label class="radio-label"><input type="radio" name="mode" value="catalogue" checked> ${t('enh.removeCatalogue')}</label><label class="radio-label"><input type="radio" name="mode" value="file"> ${t('enh.removeFile')}</label><div class="note">${t('enh.removeNote')}</div><div class="dialog-footer"><button type="button" id="remove-cancel">${t('common.cancel')}</button><button class="danger">${t('enh.removeSubmit')}</button></div></form>`);$('#remove-cancel').onclick=action(()=>mediaDialog(m.id));$('#remove-form').onsubmit=action(async e=>{e.preventDefault();const result=await api('/api/media/'+m.id+'/remove',{mode:new FormData(e.target).get('mode')});$('#dialog').close();await render();toast(result.warning||t('enh.removed'),Boolean(result.warning));});}
  async function removed(){
    const {items,capabilities}=await api('/api/removed'),canErase=capabilities?.permanent_erasure===true,erasable=items.filter(m=>!m.protected);
    openDialog(t('enh.removedTitle'),`${canErase?'':`<p class="error">${t('enh.restartNeeded')}</p>`}<p>${t('enh.removedIntro')}</p><button id="erase-all-removed" class="danger" ${canErase&&erasable.length?'':'disabled'}>${t('enh.eraseAll',{count:erasable.length})}</button><div class="folder-list">${items.map(m=>`<div class="folder-row"><div><b>${esc(m.original_path)}</b><small>${m.physical?t('enh.inTrash'):t('enh.originalUnchanged')}${m.protected?t('enh.protected'):''}</small></div><div class="actions"><button data-restore-item="${m.id}">${t('enh.restore')}</button><button class="danger" data-erase-item="${m.id}" ${!canErase||m.protected?'disabled':''}>${t('enh.erase')}</button></div></div>`).join('')||`<p>${t('enh.noRemoved')}</p>`}</div>`);
    for(const b of $$('[data-restore-item]'))b.onclick=action(async()=>{const result=await api('/api/media/'+b.dataset.restoreItem+'/restore-item',{});await render();await removed();toast(result.warning||t('enh.restored'),Boolean(result.warning));});
    for(const b of $$('[data-erase-item]'))b.onclick=()=>eraseRemoved(items.filter(m=>m.id===b.dataset.eraseItem));
    $('#erase-all-removed').onclick=()=>eraseRemoved(erasable);
  }
  function eraseRemoved(items){
    const physical=items.filter(m=>m.physical).length;
    openDialog(t('enh.eraseTitle'),`${t('enh.eraseText',{count:items.length,physical,catalogueOnly:items.length-physical})}<details><summary>${t('enh.eraseItems')}</summary><ul>${items.map(m=>`<li>${esc(m.original_path)}</li>`).join('')}</ul></details><p id="erase-removed-status" role="status"></p><div class="dialog-footer"><button id="erase-removed-cancel">${t('common.cancel')}</button><button id="erase-removed-confirm" class="danger">${t('enh.eraseConfirm')}</button></div>`);
    $('#erase-removed-cancel').onclick=action(removed);
    $('#erase-removed-confirm').onclick=async()=>{
      const button=$('#erase-removed-confirm'),cancel=$('#erase-removed-cancel'),status=$('#erase-removed-status');button.disabled=true;cancel.disabled=true;let count=0;const errors=[];
      for(const m of items){status.textContent=t('enh.erasing',{current:count+errors.length+1,total:items.length});try{await api('/api/media/'+encodeURIComponent(m.id)+'/erase-item',{confirm:true,expected_path:m.relative_path});count++;}catch(err){errors.push(m.original_path+': '+err.message);}}
      if(errors.length){status.className='error';status.textContent=t('enh.erasedPartial',{count})+errors.join(' · ');button.hidden=true;cancel.disabled=false;cancel.textContent=t('enh.backToRemoved');}else{await removed();toast(t('enh.erased',{count}));}
    };
  }
  const frameTimeLabel=time=>Math.floor(time/60)+':'+String(Math.floor(time%60)).padStart(2,'0');
  function videoEvent(video,name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error(t('enh.frameDecode')));},12000);function cleanup(){clearTimeout(timer);video.removeEventListener(name,ok);video.removeEventListener('error',bad);}function ok(){cleanup();resolve();}function bad(){cleanup();reject(Error(t('enh.codec')));}video.addEventListener(name,ok,{once:true});video.addEventListener('error',bad,{once:true});});}
  async function framePreview(m,time,currentVideo=null){
    let sampler=currentVideo,owned=false;const title=t('enh.frameTitle',{time:frameTimeLabel(time)});
    if(!sampler){openDialog(title,`<p id="frame-loading" role="status">${t('enh.frameLoading')}</p><button id="frame-loading-back">${t('still.back')}</button>`);$('#frame-loading-back').onclick=action(()=>mediaDialog(m.id));sampler=document.createElement('video');sampler.muted=true;sampler.preload='auto';sampler.src='/media/'+m.id;owned=true;}
    const loading=$('#frame-loading');
    try{if(sampler.readyState<2){const loaded=videoEvent(sampler,'loadeddata');if(owned)sampler.load();await loaded;}if(!Number.isFinite(sampler.duration)||!sampler.videoWidth)throw Error(t('enh.videoInfo'));const chosen=Math.max(0,Math.min(time,Math.max(0,sampler.duration-.05)));if(Math.abs(sampler.currentTime-chosen)>.01){const seek=videoEvent(sampler,'seeked');sampler.currentTime=chosen;await seek;}sampler.pause();
      if(owned&&(!loading?.isConnected||!$('#dialog').open))return;const canvas=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(sampler.videoWidth,sampler.videoHeight));canvas.width=Math.max(1,Math.round(sampler.videoWidth*scale));canvas.height=Math.max(1,Math.round(sampler.videoHeight*scale));canvas.getContext('2d').drawImage(sampler,0,0,canvas.width,canvas.height);const frame={data_url:canvas.toDataURL('image/png'),time_seconds:chosen,source_size:m.size,source_mtime:m.modified_at};
      openDialog(title,`<img class="sample-frame-full" src="${frame.data_url}" alt="${esc(t('enh.frameTitle',{time:frameTimeLabel(chosen)}))}"><p>${t('enh.frameText',{time:frameTimeLabel(chosen)})}</p><div class="dialog-footer"><button id="frame-back">${t('still.back')}</button><button id="frame-cover" class="primary" ${m.characters.length?'':'disabled'}>${t('enh.frameCover')}</button></div>${m.characters.length?'':`<p>${t('enh.frameAssign')}</p>`}`);
      $('#frame-back').onclick=action(async()=>{await mediaDialog(m.id);const video=$('.viewer-media video');video.onloadedmetadata=()=>{video.currentTime=chosen;};if(video.readyState>=1)video.currentTime=chosen;});$('#frame-cover').onclick=()=>cropDialog(m,frame);
    }catch(e){if(loading?.isConnected){loading.textContent=e.message;loading.className='error';}else toast(e.message,true);}finally{if(owned){sampler.pause();sampler.removeAttribute('src');sampler.load();}}
  }
  async function storyboard(m){const video=$('.viewer-media video');if(!video)return;let host=$('#storyboard');if(!host){video.closest('.viewer-media').parentElement.insertAdjacentHTML('beforeend',`<p>${t('enh.storyboardHint')}</p><div id="storyboard" class="storyboard"></div>`);host=$('#storyboard');}host.textContent=t('enh.sampling');const sampler=document.createElement('video');sampler.muted=true;sampler.preload='auto';sampler.src='/media/'+m.id;
    function event(name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error(t('enh.framesDecode')));},12000);function cleanup(){clearTimeout(timer);sampler.removeEventListener(name,ok);sampler.removeEventListener('error',bad);}function ok(){cleanup();resolve();}function bad(){cleanup();reject(Error(t('enh.codec')));}sampler.addEventListener(name,ok,{once:true});sampler.addEventListener('error',bad,{once:true});});}
    try{const loaded=event('loadeddata');sampler.load();await loaded;host.textContent='';const duration=sampler.duration;if(!Number.isFinite(duration))throw Error(t('enh.duration'));let batch=0;
      async function batchFrames(){const last=Math.min(duration,batch+300);for(let time=batch;time<last;time+=5){if(!host.isConnected||!$('#dialog').open)return;const frameTime=Math.min(time+.05,Math.max(0,duration-.05));if(Math.abs(sampler.currentTime-frameTime)>.01){const seeked=event('seeked');sampler.currentTime=frameTime;await seeked;}const canvas=document.createElement('canvas');canvas.width=180;canvas.height=Math.max(1,Math.round(180*sampler.videoHeight/sampler.videoWidth));canvas.getContext('2d').drawImage(sampler,0,0,canvas.width,canvas.height);const button=document.createElement('button');button.type='button';button.append(canvas);const label=document.createElement('span');label.textContent=Math.floor(time/60)+':'+String(time%60).padStart(2,'0');button.append(label);button.title=t('enh.frameButton',{time:label.textContent});button.onclick=action(()=>framePreview(m,frameTime));host.append(button);}batch=last;if(batch<duration){const more=document.createElement('button');more.textContent=t('enh.sampleMore');more.onclick=action(async()=>{more.remove();await batchFrames();});host.append(more);}}
      await batchFrames();
    }catch(e){host.textContent=e.message;}finally{if(!host.isConnected){sampler.removeAttribute('src');sampler.load();}else $('#dialog').addEventListener('close',()=>{sampler.removeAttribute('src');sampler.load();},{once:true});}
  }
  function media(m){const actions=$('#media-form');actions?.insertAdjacentHTML('beforebegin',`<div class="actions media-file-actions"><button id="rename-original">${t('enh.renameSubmit')}</button><button id="remove-media" class="danger">${t('enh.removeButton')}</button>${m.kind==='video'?`<div class="actions media-video-actions"><button id="storyboard-button">${t('enh.storyboard')}</button><button id="current-frame-button">${t('enh.currentFrame')}</button></div>`:''}</div>`);$('#remove-media').insertAdjacentHTML('afterend','<span class="media-move-actions"></span>');$('.media-move-actions').append($('#move-original-button'));$('#rename-original').onclick=()=>rename(m);$('#remove-media').onclick=()=>remove(m);if($('#storyboard-button'))$('#storyboard-button').onclick=action(()=>storyboard(m));if($('#current-frame-button'))$('#current-frame-button').onclick=action(()=>{const video=$('.viewer-media video');return framePreview(m,video.currentTime,video);});installPictureCrop(ctx,m);installCharacterReferenceCrop(ctx,m);}
  function cropDialog(m,frame=null){let crop={x:0,y:0,w:1,h:1},anchor=null,ready=false;const image=new Image();const preferred=preferredCoverCharacter(m.characters,ctx.getActiveCharacter?.());
    openDialog(t('enh.cropTitle'),`<form id="crop-form" class="form-grid"><label>${t('enh.cropFor')}<select name="cid" required><option value="" disabled ${preferred?'':'selected'}>${t('enh.chooseCharacter')}</option>${m.characters.map(c=>`<option value="${c.id}" ${preferred===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><p>${t('enh.cropText')}</p><canvas id="crop-canvas" aria-label="${esc(t('enh.cropAria'))}"></canvas><p id="crop-status" class="saved" role="status" aria-live="polite">${t('enh.loadingPicture')}</p><div class="dialog-footer"><button type="button" id="crop-back">${t('move.backToMedia')}</button><button type="button" class="primary" id="crop-save" disabled>${t('cover.saveButton')}</button><button type="button" id="crop-profile" hidden>${t('enh.viewProfile')}</button></div></form>`);
    const form=$('#crop-form'),saveButton=$('#crop-save'),status=$('#crop-status'),select=$('select[name="cid"]',form),profileButton=$('#crop-profile');
    const canvas=$('#crop-canvas'),context=canvas.getContext('2d');function draw(){context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);context.fillStyle='#0008';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,crop.x*image.width,crop.y*image.height,crop.w*image.width,crop.h*image.height,crop.x*canvas.width,crop.y*canvas.height,crop.w*canvas.width,crop.h*canvas.height);context.strokeStyle='#e7c58d';context.lineWidth=3;context.strokeRect(crop.x*canvas.width,crop.y*canvas.height,crop.w*canvas.width,crop.h*canvas.height);}
    const point=e=>{const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};};
    canvas.onpointerdown=e=>{anchor=point(e);canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!anchor)return;const p=point(e);crop={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw();};canvas.onpointerup=()=>{anchor=null;if(crop.w<.01||crop.h<.01){crop={x:0,y:0,w:1,h:1};draw();}};
    image.onload=()=>{canvas.width=Math.min(900,image.naturalWidth);canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);draw();ready=true;saveButton.disabled=false;status.textContent=t('enh.cropReady');};image.onerror=()=>{ready=false;saveButton.disabled=true;status.className='error';status.textContent=t('enh.pictureUnavailable');};
    bindCoverSave({form,button:saveButton,status,isReady:()=>ready,character:()=>m.characters.find(c=>c.id===select.value),getCrop:()=>crop,save:(cid,rectangle)=>frame?api('/api/characters/'+cid+'/video-cover',{media_id:m.id,time_seconds:frame.time_seconds,source_size:frame.source_size,source_mtime:frame.source_mtime,crop:rectangle,image_data:croppedCoverJpeg(image,rectangle)}).catch(e=>{if(e.status===404)throw Error(t('enh.restartCovers'));throw e;}):api('/api/characters/'+cid+'/cover-crop',{media_id:m.id,crop:rectangle}),onSaved:async cid=>{profileButton.hidden=!ctx.openCharacter;profileButton.onclick=action(()=>ctx.openCharacter(cid));await render();}});
    $('#crop-back').onclick=action(()=>mediaDialog(m.id));image.src=frame?.data_url||'/media/'+m.id;
  }
  const names=['Ádám','Ákos','András','Balázs','Bence','Benedek','Botond','Csaba','Dániel','Dávid','Domonkos','Endre','Erik','Ferenc','Gergely','György','Hunor','Imre','János','József','Károly','Kornél','Kristóf','Lajos','László','Levente','Loránd','Máté','Márton','Miklós','Milán','Nándor','Norbert','Olivér','Ottó','Patrik','Richárd','Róbert','Roland','Sándor','Sebestyén','Szabolcs','Tamás','Viktor','Vilmos','Zoltán','Zsolt'];
  const known=new Set([...names,'Attila','Bálint','Dezső','Gábor','István','Péter','Tibor','Palor','Levi','Feri','Gergő','Márk','Norbi','Zoli','Robin','Serge','Mingi','Namjoon'].map(n=>n.toLocaleLowerCase()));
  function suggestions(c){if(c.name.trim().toLocaleLowerCase()==='pákozdi')return ['Pákozdi Péter'];let seed=[...c.id].reduce((s,x)=>s+x.charCodeAt(0),0);return [0,11,23].map(i=>names[(seed+i)%names.length]);}
  async function namesDialog(){await refresh();const cs=getState().characters.filter(c=>!c.name.split(/[\s/,–—-]+/).some(t=>known.has(t.toLocaleLowerCase())));openDialog(t('enh.namesTitle'),`<p>Kreatív névjavaslatok a munkacímekhez. A választás az átnevezési előnézetet nyitja meg; mentés csak külön jóváhagyással történik. A korábbi név az előzményekben megmarad.</p><div class="folder-list">${cs.map(c=>`<div class="name-row"><b>${esc(c.name)}</b><div class="actions">${suggestions(c).map(n=>`<a href="/character-rename.html?character=${encodeURIComponent(c.id)}&amp;new_name=${encodeURIComponent(n)}">Előnézet: ${esc(n)}</a>`).join('')}</div></div>`).join('')||'<p>Nincs névtelen munkacím. A karakterprofilon bármelyik névhez készíthetsz átnevezési előnézetet.</p>'}</div>`);}
  async function mergeDialog(){openDialog(t('enh.mergeTitle'),`<p>${t('enh.mergeText1')}</p>`);}
  async function storageDialog(){const info=await api('/api/storage');openDialog(t('enh.storageTitle'),`<p>${t('enh.storageIntro')}</p><label>${t('enh.dbFile')}<input readonly value="${esc(info.database)}"></label><p>${t('enh.storageCounts',{characters:info.characters,media:info.media})}</p><label>${t('enh.mediaFolder')}<input readonly value="${esc(info.resource_root)}"></label><p>${t('enh.storageHint')}</p><a href="/api/export" download>${t('enh.downloadBackup')}</a>`);}
  function controls(){const bottom=$('.sidebar-bottom');bottom.insertAdjacentHTML('afterbegin',`<button id="storage-tool">${t('enh.storageTitle')}</button><button id="names-tool">${t('enh.namesButton')}</button><button id="removed-tool">${t('enh.removedButton')}</button>`);$('#storage-tool').onclick=action(storageDialog);$('#names-tool').onclick=action(namesDialog);$('#removed-tool').onclick=action(removed);window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});}
  return {profile,covers,listing,media,cropDialog,controls,namesDialog,mergeDialog,cleanupPreviews,removed,flush:()=>Promise.all([...pending])};
}
