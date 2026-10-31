export async function deleteSelectedImage({selected,capability,request}){
  if(!Array.isArray(selected)||selected.length!==1||selected[0].kind!=='image')throw Error('Pontosan egy képet jelölj ki a végleges törléshez.');
  const media=selected[0];if(capability?.media_id!==media.id||!capability.version||!capability.csrf)throw Error('A kijelölt kép törlési adatai még nem érhetők el.');
  if(capability.protected)throw Error('Jóváhagyott kanonikus referencia nem törölhető.');
  const result=await request('/api/media/'+encodeURIComponent(media.id)+'/permanent-delete',{expected_version:capability.version},capability.csrf);
  if(result.ok!==true||result.complete!==true||result.media_id!==media.id)throw Error('A teljes törlést a szerver nem igazolta vissza.');
  return result;
}

export function installPermanentDeleteUI({$,$$,api,toast,render}){
  let gallery=[],viewer=null,targets=[],capabilities=new Map(),loading=false,busy=false,epoch=0,progress='';
  function paint(){
    const eligible=targets.filter(m=>capabilities.get(m.id)&&!capabilities.get(m.id).protected),protectedCount=targets.filter(m=>capabilities.get(m.id)?.protected).length;
    for(const b of $$('#permanent-delete,#library-permanent-delete,#viewer-permanent-delete')){
      b.disabled=busy||loading||!eligible.length;
      b.textContent=busy?'Törlés folyamatban… '+progress:targets.length>1?'Törlés ('+targets.length+')':'Törlés';
      b.title=busy?'Várd meg a törlés eredményét.':loading?'A kijelölt képek védelmének ellenőrzése…':!targets.length?'Jelölj ki egy vagy több képet.':protectedCount===targets.length?'Védett: jóváhagyott kanonikus referenciák.':!eligible.length?'A kijelölt képek törlési állapota nem érhető el.':'A kijelölt képek végleges törlése minden szereplő-hozzárendeléssel. Nincs megerősítő ablak.'+(protectedCount?' '+protectedCount+' védett referencia kimarad.':'');
    }
  }
  async function choose(){
    const token=++epoch,selected=viewer?[viewer]:gallery;
    targets=[...new Map(selected.filter(m=>m.kind==='image').map(m=>[m.id,m])).values()];capabilities=new Map();loading=!!targets.length;paint();if(!targets.length)return;
    const chosen=[...targets],results=await Promise.allSettled(chosen.map(m=>api('/api/media/'+encodeURIComponent(m.id)+'/permanent-delete')));
    if(token!==epoch)return;
    for(const [i,result]of results.entries())if(result.status==='fulfilled')capabilities.set(chosen[i].id,result.value);
    loading=false;paint();if(!capabilities.size)toast(results.find(r=>r.status==='rejected')?.reason?.message||'A kijelölés törlési adatai nem érhetők el.',true);
  }
  async function erase(){
    if(busy||loading||!targets.some(m=>capabilities.get(m.id)&&!capabilities.get(m.id).protected))return;
    const selected=targets.map(m=>({id:m.id,kind:m.kind})),selectedCapabilities=new Map(capabilities),deleted=new Set(),failed=[];let protectedCount=0,onedrive=false,processed=0;
    busy=true;progress='0/'+selected.length;paint();
    try{
      for(const media of selected){
        const capability=selectedCapabilities.get(media.id);
        try{
          if(capability?.protected){protectedCount++;continue;}
          const result=await deleteSelectedImage({selected:[media],capability,request:async(route,body,csrf)=>{
            const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-LU-Delete-CSRF':csrf},body:JSON.stringify(body)}),value=await response.json();
            if(!response.ok)throw Error(value.error||'A törlés nem fejeződött be.');return value;
          }});deleted.add(media.id);onedrive ||= result.onedrive===true;
        }catch(e){failed.push({id:media.id,message:e.message});}
        finally{processed++;progress=processed+'/'+selected.length;paint();}
      }
      gallery=gallery.filter(m=>!deleted.has(m.id));
      if(viewer&&deleted.has(viewer.id)){viewer=null;$('#dialog').close();}
      await render();toast(deleted.size+' kép, előnézetei és hozzárendelései végleg törölve.'+(protectedCount?' '+protectedCount+' védett referencia kimaradt.':'')+(failed.length?' '+failed.length+' sikertelen: '+failed[0].message:'')+(onedrive?' A OneDrive felhős szinkronja külön fut.':''),failed.length>0);
    }catch(e){toast(e.message,true);}finally{busy=false;await choose();}
  }
  function selection(items){gallery=[...items];const button=$('#library-permanent-delete');if(button)button.onclick=erase;if(!viewer)void choose();}
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
