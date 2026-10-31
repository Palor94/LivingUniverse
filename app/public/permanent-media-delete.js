export async function deleteSelectedImage({selected,capability,request}){
  if(!Array.isArray(selected)||selected.length!==1||selected[0].kind!=='image')throw Error('Pontosan egy képet jelölj ki a végleges törléshez.');
  const media=selected[0];if(capability?.media_id!==media.id||!capability.version||!capability.csrf)throw Error('A kijelölt kép törlési adatai még nem érhetők el.');
  if(capability.protected)throw Error('Jóváhagyott kanonikus referencia nem törölhető.');
  const result=await request('/api/media/'+encodeURIComponent(media.id)+'/permanent-delete',{expected_version:capability.version},capability.csrf);
  if(result.ok!==true||result.complete!==true||result.media_id!==media.id)throw Error('A teljes törlést a szerver nem igazolta vissza.');
  return result;
}

export function installPermanentDeleteUI({$,$$,api,toast,render}){
  let gallery=[],viewer=null,target=null,capability=null,loading=false,busy=false,epoch=0;
  function paint(){
    for(const b of $$('#permanent-delete,#viewer-permanent-delete')){
      b.disabled=busy||loading||!target||!capability||capability.protected;
      b.textContent=busy?'Törlés folyamatban…':'Törlés';
      b.title=busy?'Várd meg a törlés eredményét.':loading?'A kép védelmének ellenőrzése…':capability?.protected?'Védett: jóváhagyott kanonikus referencia.':!target?'Jelölj ki pontosan egy képet.':'Végleges törlés: az eredeti fájl, előnézetek és minden szereplő-hozzárendelés törlődik. Nincs megerősítő ablak.';
    }
  }
  async function choose(){
    const token=++epoch,selected=viewer?[viewer]:gallery;
    target=selected.length===1&&selected[0].kind==='image'?selected[0]:null;capability=null;loading=!!target;paint();if(!target)return;
    try{const result=await api('/api/media/'+encodeURIComponent(target.id)+'/permanent-delete');if(token===epoch)capability=result;}
    catch(e){if(token===epoch)toast(e.message,true);}finally{if(token===epoch){loading=false;paint();}}
  }
  async function erase(){
    if(busy||loading||!target||!capability||capability.protected)return;
    const selected=target,selectedCapability=capability;busy=true;paint();
    try{
      const result=await deleteSelectedImage({selected:[selected],capability:selectedCapability,request:async(route,body,csrf)=>{
        const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-LU-Delete-CSRF':csrf},body:JSON.stringify(body)}),value=await response.json();
        if(!response.ok)throw Error(value.error||'A törlés nem fejeződött be.');return value;
      }});
      gallery=gallery.filter(m=>m.id!==selected.id);
      if(viewer?.id===selected.id){viewer=null;$('#dialog').close();}
      await render();toast(result.onedrive?'A kép, előnézetei és hozzárendelései végleg törölve a helyi tárhelyről. A OneDrive felhős szinkronja külön fut.':'A kép, előnézetei és minden szereplő-hozzárendelése végleg törölve.');
    }catch(e){toast(e.message,true);}finally{busy=false;await choose();}
  }
  function selection(items){gallery=[...items];if(!viewer)void choose();}
  function media(m){
    viewer=m;
    if(m.kind==='image'){
      $('.viewer-sort-nav')?.insertAdjacentHTML('afterbegin','<button type="button" id="viewer-permanent-delete" class="danger" disabled>Törlés</button>');
      if($('#viewer-permanent-delete'))$('#viewer-permanent-delete').onclick=erase;
      const form=$('#media-form'),previous=form?._afterMediaSave;
      if(form)form._afterMediaSave=updated=>{previous?.(updated);viewer=updated;void choose();};
    }
    void choose();
  }
  function controls(){
    $('.topbar').insertAdjacentHTML('beforeend','<button type="button" id="permanent-delete" class="danger" disabled>Törlés</button>');$('#permanent-delete').onclick=erase;
    $('#dialog').addEventListener('close',()=>{viewer=null;void choose();});paint();
  }
  return {controls,selection,media};
}
