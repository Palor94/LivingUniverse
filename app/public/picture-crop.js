import {createCropSelection,pixelCrop} from './crop-selection.js';

export function installPictureCrop(ctx,m){
  if(m.kind!=='image')return;
  const {$,api,refresh,render,toast}=ctx,actions=$('.media-file-actions');if(!actions)return;
  const launch=document.createElement('button');launch.type='button';launch.id='crop-picture';launch.textContent='Crop picture…';actions.insertBefore(launch,$('.media-move-actions'));
  launch.onclick=async()=>{
    if($('#picture-crop-panel'))return;
    const viewer=$('.viewer-media'),panel=document.createElement('section');panel.id='picture-crop-panel';panel.className='panel picture-crop-panel';
    panel.innerHTML='<h3>Crop picture</h3><p>Drag each side or corner independently. Drag inside to move the selection, or outside it to draw a new rectangle. Arrow keys adjust the focused edge; Shift makes larger steps.</p><div class="picture-crop-host"></div><p class="picture-crop-size muted"></p><p>The saved picture replaces the OneDrive file. A verified full original is kept for Restore previous picture. Character links, notes and sorting status stay attached.</p><p class="picture-crop-status saved" role="status" aria-live="polite">Loading picture…</p><div class="actions"><button type="button" class="picture-crop-reset">Select whole picture</button><button type="button" class="picture-crop-save primary" disabled>Save crop & replace picture</button><button type="button" class="picture-crop-undo" disabled>Restore previous picture</button><button type="button" class="picture-crop-close">Close crop editor</button></div>';
    viewer.after(panel);viewer.classList.add('hidden');launch.disabled=true;let editor=null,image=null,info=null,busy=false,disposed=false,requestId=crypto.randomUUID();
    const status=panel.querySelector('.picture-crop-status'),save=panel.querySelector('.picture-crop-save'),undo=panel.querySelector('.picture-crop-undo'),host=panel.querySelector('.picture-crop-host');
    function close(){if(busy)return;disposed=true;editor?.destroy();observer.disconnect();panel.remove();viewer.classList.remove('hidden');launch.disabled=false;}
    // Sorting can replace the modal's contents without firing dialog.close.
    const observer=new MutationObserver(()=>{if(!panel.isConnected){disposed=true;editor?.destroy();observer.disconnect();}});observer.observe($('#dialog-content'),{childList:true,subtree:true});
    async function load(){
      info=await api('/api/media/'+m.id+'/image-crop');image=new Image();image.src='/media/'+m.id+'?crop='+info.source_sha256;await image.decode();if(disposed)return;
      if(image.naturalWidth*image.naturalHeight>32000000)throw Error('This picture exceeds the crop editor’s 32 megapixel limit.');editor?.destroy();editor=createCropSelection(host,image,{crop:{x:0,y:0,w:1,h:1},onChange:(_,pixels)=>{panel.querySelector('.picture-crop-size').textContent='Keep '+pixels.w+' × '+pixels.h+' pixels';}});save.disabled=info.protected;undo.disabled=info.protected||!info.latest_edit;
      status.textContent=info.protected?'This picture is protected by approved reference history. Its pixels cannot be replaced.':'Choose the part to keep, then save.';
    }
    async function perform(restoring){
      if(busy||!editor)return;busy=true;for(const b of panel.querySelectorAll('button'))b.disabled=true;status.className='picture-crop-status saved';status.textContent=restoring?'Restoring the verified original…':'Saving crop and verifying the original backup…';
      try{
        let body={edit_id:restoring?info.latest_edit.id:requestId,source_sha256:info.source_sha256};
        if(!restoring){const crop=editor.getCrop(),p=pixelCrop(image.naturalWidth,image.naturalHeight,crop),canvas=document.createElement('canvas');canvas.width=p.w;canvas.height=p.h;canvas.getContext('2d').drawImage(image,p.x,p.y,p.w,p.h,0,0,p.w,p.h);const ext=m.relative_path.split('.').pop().toLowerCase(),mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg',data=canvas.toDataURL(mime,.95);if(!data.startsWith('data:'+mime+';'))throw Error('This browser cannot save this picture format.');if(data.length>32*1024*1024)throw Error('This crop is too large to save (24 MB maximum).');body={...body,crop,image_data:data};}
        const result=await api('/api/media/'+m.id+'/image-crop'+(restoring?'/restore':''),body);requestId=crypto.randomUUID();Object.assign(m,await api('/api/media/'+m.id));const preview=viewer.querySelector('img');if(preview)preview.src='/media/'+m.id+'?crop='+result.source_sha256;await load();await refresh();await render();status.textContent=restoring?'Previous picture restored.':'Crop saved. The full original is recoverable with Restore previous picture.';toast(restoring?'Previous picture restored':'Picture cropped · original saved for recovery');
      }catch(e){status.className='picture-crop-status error';status.textContent=e.message;}
      finally{busy=false;for(const b of panel.querySelectorAll('button'))b.disabled=false;save.disabled=!editor||info?.protected;undo.disabled=!info?.latest_edit||info?.protected;}
    }
    save.onclick=()=>perform(false);undo.onclick=()=>perform(true);panel.querySelector('.picture-crop-reset').onclick=()=>editor?.reset();panel.querySelector('.picture-crop-close').onclick=close;
    try{await load();}catch(e){status.className='picture-crop-status error';status.textContent=e.message==='Not found'?'Restart Living Universe and refresh the browser to enable picture cropping.':e.message;}
  };
}
