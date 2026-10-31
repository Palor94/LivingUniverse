const $=s=>document.querySelector(s),status=$('#status'),filter=$('#filter');
let csrf,offset=0,next=null,working=false;
const mib=n=>(n/1048576).toLocaleString('hu-HU',{maximumFractionDigits:2})+' MiB';
const label={open:'Nyitott',expired:'Lejárt',cancelled:'Megszakított'};
async function request(url,options){const r=await fetch(url,options),value=await r.json();if(!r.ok)throw Error(value.error||'A művelet nem sikerült.');return value;}
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
function controls(){for(const button of document.querySelectorAll('button'))button.disabled=working;$('#previous').disabled=working||offset===0;$('#next').disabled=working||next===null;filter.disabled=working;}
async function load(){
 const value=await request('/api/media-imports?status='+filter.value+'&limit=20&offset='+offset);
 if(offset>0&&!value.imports.length){offset=Math.max(0,offset-20);return load();}
 next=value.next_offset;const c=value.capacity;
 $('#capacity').textContent=`Nyitott importok: ${c.active_imports}/${c.active_import_limit} · Lefoglalt feltöltési keret: ${mib(c.reserved_upload_bytes)} / ${mib(c.reserved_upload_limit_bytes)}`;
 const list=$('#imports');list.replaceChildren();
 for(const item of value.imports){
  const card=element('article',''),heading=element('h2',item.characters.map(c=>c.name||c.character_id).join(', '));card.append(heading);
  card.append(element('p',`${label[item.status]} · ${new Date(item.created_at).toLocaleString('hu-HU')} · ${item.import_id}`));
  card.append(element('p',`Elmentett fájlok: ${item.items.committed} · Sikertelen: ${item.items.failed} · Lefoglalt keret: ${mib(item.uploads.reserved_bytes)} · Beérkezett képdarabok: ${mib(item.uploads.received_bytes)}`));
  const link=element('a','Részletek és elmentett fájlok');link.href='/media-import/'+item.import_id;card.append(link);
  if(item.can_cancel){const button=element('button',item.status==='cancelled'?'Ideiglenes fájlok törlésének újrapróbálása':'Függő import megszakítása');button.addEventListener('click',()=>perform(async()=>{
    const result=await request('/api/media-imports/'+item.import_id+'/cancel',{method:'PUT',headers:{'Content-Type':'application/json','X-LU-CSRF':csrf},body:'{}'});
    await load();status.textContent=result.cleanup_complete?'Megszakítva. A keret felszabadult, a már elmentett képek megmaradtak.':'A keret felszabadult, de néhány ideiglenes fájl törlése még függőben van. Próbáld újra a Megszakított listán.';
  }));card.append(element('p',''),button);}
  list.append(card);
 }
 if(!value.imports.length)list.append(element('p','Nincs ilyen állapotú import.'));
}
async function perform(fn){if(working)return;working=true;controls();status.textContent='Feldolgozás…';try{await fn();}catch(e){status.textContent=e.message;}finally{working=false;controls();}}
async function refresh(){await load();status.textContent='Lista frissítve.';}
$('#refresh').addEventListener('click',()=>perform(refresh));
filter.addEventListener('change',()=>{offset=0;perform(refresh);});
$('#next').addEventListener('click',()=>{offset=next??offset;perform(refresh);});
$('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-20);perform(refresh);});
await perform(async()=>{csrf=(await request('/api/session')).csrf;await refresh();});
