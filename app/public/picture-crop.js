import {createCropSelection,pixelCrop} from './crop-selection.js';
import {t} from './i18n.js';

export function installPictureCrop(ctx,m){
  if(m.kind!=='image')return;
  const {$,api,refresh,render,toast}=ctx,actions=$('.media-file-actions');if(!actions)return;
  const launch=document.createElement('button');launch.type='button';launch.id='crop-picture';launch.textContent=t('crop.launch');actions.insertBefore(launch,$('.media-move-actions'));
  launch.onclick=async()=>{
    if($('#picture-crop-panel'))return;
    const viewer=$('.viewer-media'),panel=document.createElement('section');panel.id='picture-crop-panel';panel.className='panel picture-crop-panel';
    panel.innerHTML=`<h3>${t('crop.title')}</h3><p>${t('crop.help')}</p><div class="picture-crop-host"></div><p class="picture-crop-size muted"></p><p>${t('crop.replaceNote')}</p><p class="picture-crop-status saved" role="status" aria-live="polite">${t('enh.loadingPicture')}</p><div class="actions"><button type="button" class="picture-crop-reset">${t('crop.selectWhole')}</button><button type="button" class="picture-crop-save primary" disabled>${t('crop.save')}</button><button type="button" class="picture-crop-undo" disabled>${t('crop.restore')}</button><button type="button" class="picture-crop-close">${t('crop.close')}</button></div>`;
    viewer.after(panel);viewer.classList.add('hidden');launch.disabled=true;let editor=null,image=null,info=null,busy=false,disposed=false,requestId=crypto.randomUUID();
    const status=panel.querySelector('.picture-crop-status'),save=panel.querySelector('.picture-crop-save'),undo=panel.querySelector('.picture-crop-undo'),host=panel.querySelector('.picture-crop-host');
    function close(){if(busy)return;disposed=true;editor?.destroy();observer.disconnect();panel.remove();viewer.classList.remove('hidden');launch.disabled=false;}
    // Sorting can replace the modal's contents without firing dialog.close.
    const observer=new MutationObserver(()=>{if(!panel.isConnected){disposed=true;editor?.destroy();observer.disconnect();}});observer.observe($('#dialog-content'),{childList:true,subtree:true});
    async function load(){
      info=await api('/api/media/'+m.id+'/image-crop');image=new Image();image.src='/media/'+m.id+'?crop='+info.source_sha256;await image.decode();if(disposed)return;
      if(image.naturalWidth*image.naturalHeight>32000000)throw Error(t('crop.tooManyPixels'));editor?.destroy();editor=createCropSelection(host,image,{crop:{x:0,y:0,w:1,h:1},onChange:(_,pixels)=>{panel.querySelector('.picture-crop-size').textContent=t('crop.keepSize',{w:pixels.w,h:pixels.h});}});save.disabled=info.protected;undo.disabled=info.protected||!info.latest_edit;
      status.textContent=info.protected?t('crop.protected'):t('crop.ready');
    }
    async function perform(restoring){
      if(busy||!editor)return;busy=true;for(const b of panel.querySelectorAll('button'))b.disabled=true;status.className='picture-crop-status saved';status.textContent=restoring?t('crop.restoring'):t('crop.saving');
      try{
        let body={edit_id:restoring?info.latest_edit.id:requestId,source_sha256:info.source_sha256};
        if(!restoring){const crop=editor.getCrop(),p=pixelCrop(image.naturalWidth,image.naturalHeight,crop),canvas=document.createElement('canvas');canvas.width=p.w;canvas.height=p.h;canvas.getContext('2d').drawImage(image,p.x,p.y,p.w,p.h,0,0,p.w,p.h);const ext=m.relative_path.split('.').pop().toLowerCase(),mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg',data=canvas.toDataURL(mime,.95);if(!data.startsWith('data:'+mime+';'))throw Error(t('crop.formatUnsupported'));if(data.length>32*1024*1024)throw Error(t('crop.tooLarge'));body={...body,crop,image_data:data};}
        const result=await api('/api/media/'+m.id+'/image-crop'+(restoring?'/restore':''),body);requestId=crypto.randomUUID();Object.assign(m,await api('/api/media/'+m.id));const preview=viewer.querySelector('img');if(preview)preview.src='/media/'+m.id+'?crop='+result.source_sha256;await load();await refresh();await render();status.textContent=restoring?t('crop.restoredStatus'):t('crop.savedStatus');toast(restoring?t('crop.restoredToast'):t('crop.savedToast'));
      }catch(e){status.className='picture-crop-status error';status.textContent=e.message;}
      finally{busy=false;for(const b of panel.querySelectorAll('button'))b.disabled=false;save.disabled=!editor||info?.protected;undo.disabled=!info?.latest_edit||info?.protected;}
    }
    save.onclick=()=>perform(false);undo.onclick=()=>perform(true);panel.querySelector('.picture-crop-reset').onclick=()=>editor?.reset();panel.querySelector('.picture-crop-close').onclick=close;
    try{await load();}catch(e){status.className='picture-crop-status error';status.textContent=e.status===404?t('crop.restartNeeded'):e.message;}
  };
}
