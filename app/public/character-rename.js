import {appRouteHash} from './app-routes.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const query=new URLSearchParams(location.search),cid=query.get('character');
if(cid)document.querySelector('main>a').href='/'+appRouteHash({view:'profile',cid});
const labels={characters:'Karakterprofil',relationships:'Kapcsolat',media:'Médiafájl',media_notes:'Médiajegyzet',locations:'Helyszín',location_profiles:'Helyszínprofil',story_event_revisions:'Esemény',application_settings:'Strukturált profil / előzmény',canon:'Jóváhagyott megjelenés',name:'Név',biography:'Életrajz',personality:'Személyiség',appearance:'Megjelenésvázlat',sexuality:'Szexualitás',speech_style:'Beszédstílus',notes:'Jegyzet',description:'Leírás',tags:'Címkék',english_name:'Angol név',category:'Kategória',required:'Kötelező névváltoztatás',linked:'ID-val kapcsolt találat',uncertain:'Kétes hivatkozás',other_person:'Más személyre is utalhat',protected:'Védett találat',pending:'Jóváhagyásra vár',applied:'Mentve',rejected:'Elvetve',undone:'Visszavonva'};
const label=v=>labels[v]||v;
const date=v=>new Date(v).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'});
let csrf,plan,items=[],preparingKey=crypto.randomUUID(),undoKey=crypto.randomUUID(),locked=false;
async function api(path,body){const response=await fetch(path,{...(body?{method:'PUT',headers:{'Content-Type':'application/json','X-LU-Rename-CSRF':csrf,'X-LU-CSRF':csrf},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'A művelet nem sikerült.');return data;}
function action(fn){return async event=>{if(locked)return;locked=true;$('#status').textContent='';try{await fn(event);}catch(e){$('#status').textContent=e.message;}finally{locked=false;}};}
async function load(id){
  let offset=0;items=[];
  do{const page=await api('/api/character-renames/'+id+'?offset='+offset);if(plan?.plan_id===id&&plan.plan_hash!==page.plan_hash)throw Error('Eltérő előnézet.');plan=page;items.push(...page.items);offset=page.next_offset;}while(offset!==null);
  query.set('plan',id);history.replaceState(null,'','?'+query);render();if(cid)await refreshHistory();
}
function render(){
  const pending=plan.status==='pending',undo=plan.operation==='undo',savedIds=new Set(plan.history?.at(-1)?.selected_ids||[]);
  if($('#prepare h2')&&plan.status==='applied')$('#prepare h2').textContent=plan.new_name;
  $('#preview').innerHTML=`<h2>${undo?'Visszavonás: ':''}${esc(plan.old_name)} → ${esc(plan.new_name)}</h2><small>Karakter-ID: ${esc(plan.character_id)} · ${items.length} találat · ${esc(label(plan.undone_by?'undone':plan.status))}<br>Érvényes: ${esc(date(plan.expires_at))}</small><p><b>OneDrive-mappa:</b> ${esc(plan.folder?.source||'Új karaktermappa')} → ${esc(plan.folder?.destination)} · ${esc(plan.folder?.file_count??0)} fájl</p><p>Mentéskor minden az új nevet kapja: a kánon (kinézet és referenciák, a korábbi változatok is), a történeti és eredetszövegek, az események, a karaktermappa, valamint a régi nevet viselő fájl- és almappanevek a közös médiatárban is. A fájlok tartalma, az azonosítók és a linkek megmaradnak; foglalt célnév esetén nincs felülírás, az a fájl kimarad és jelezzük. A jóváhagyott esemény jóváhagyott marad. Más karakter nevét (pl. ha a régi név annak része) nem érinti. Az átnevezés végleges; előtte ellenőrzött adatbázismentés készül.</p>${pending?'<div class="toolbar"><button id="all">Összes egyértelmű kijelölése</button><button id="none">Kijelölések törlése</button></div>':''}<div id="hits">${items.map((hit,i)=>`<article class="hit ${esc(hit.classification)}"><label><input type="checkbox" data-hit="${i}" ${!pending||!hit.editable?'disabled':''} ${pending?(hit.id==='primary-name'||undo?'checked':''):(savedIds.has(hit.id)?'checked':'')}><b>${esc(label(hit.table))} · ${esc(label(hit.field))}</b></label><small>${esc(label(hit.classification))}</small><details><summary>Rekordazonosító</summary><small>${esc(JSON.stringify(hit.record_key))} · ${esc(hit.field)}</small></details><p>${esc(hit.reason)}</p><p><del>${esc(hit.before)}</del> → <ins>${hit.after===null?'Nincs biztonságos automatikus javaslat':esc(hit.after)}</ins></p>${hit.context?`<pre>${esc(hit.context)}</pre>`:''}${['uncertain','other_person'].includes(hit.classification)&&pending?`<label><input type="checkbox" data-confirm="${i}">Ellenőriztem: ez a hivatkozás az átnevezendő karakterre mutat.</label>`:''}${hit.text?`<details><summary>Teljes mező</summary><pre>${esc(hit.text)}</pre></details>`:''}</article>`).join('')}</div>${pending?'<div class="sticky"><p id="count"></p><div class="toolbar"><button id="save" class="save">Kijelölt változtatások jóváhagyása és mentése</button><button id="reject">Előnézet elvetése</button></div></div>':`<p>${plan.result?.applied?'Mentve. A fő alkalmazásban frissítsd a karakterprofil nézetét.':''}</p>${plan.status==='applied'?'<p>Az átnevezés végleges: a régi név minden rekordból kikerült, és nem vonható vissza.</p>':''}`}`;
  if(pending){
    const boxes=[...document.querySelectorAll('[data-hit]')];
    const update=()=>{$('#count').textContent=boxes.filter(b=>b.checked&&items[Number(b.dataset.hit)].editable).length+' változtatás kijelölve';};
    boxes.forEach(b=>b.onchange=update);
    $('#all').onclick=()=>{boxes.forEach(b=>{const h=items[Number(b.dataset.hit)];if(h.editable&&['linked','required'].includes(h.classification))b.checked=true;});update();};
    $('#none').onclick=()=>{boxes.forEach(b=>b.checked=items[Number(b.dataset.hit)].id==='primary-name');update();};
    $('#save').onclick=action(async()=>{
      const selected_ids=boxes.filter(b=>b.checked&&items[Number(b.dataset.hit)].editable).map(b=>items[Number(b.dataset.hit)].id),confirmed_ids=[...document.querySelectorAll('[data-confirm]:checked')].map(b=>items[Number(b.dataset.confirm)].id).filter(id=>selected_ids.includes(id));
      const done=await api('/api/character-renames/'+plan.plan_id+'/decision',{plan_hash:plan.plan_hash,decision:'approve',selected_ids,confirmed_ids});
      // A final rename deletes its own plan, so the answer is shown as it is (no reload).
      if(done.final){plan={...plan,...done,status:'applied'};items=done.items||[];render();$('#status').textContent=`Végleges átnevezés kész: ${done.old_name} → ${done.new_name}. A régi név minden rekordból kikerült.${done.result?.game?.skipped?.length?` Foglalt célnév miatt kimaradt: ${done.result.game.skipped.map(s=>s.from).join(', ')}.`:''}${done.result?.game?.error?` Fájlátnevezési hiba: ${done.result.game.error}`:''}`;}
      else{await load(plan.plan_id);$('#status').textContent='A jóváhagyott változtatásokat együtt mentettük.';}
    });
    $('#reject').onclick=action(async()=>{await api('/api/character-renames/'+plan.plan_id+'/decision',{plan_hash:plan.plan_hash,decision:'reject'});await load(plan.plan_id);});update();
  }
}
function renderHistory(entries){
    $('#history').innerHTML='<h2>Átnevezési előzmények</h2>'+entries.map(h=>`<p><button data-plan="${esc(h.plan_id)}">${esc(h.old_name)} → ${esc(h.new_name)} · ${esc(label(h.status))} · ${esc(date(h.created_at))}</button></p>`).join('');
    for(const b of document.querySelectorAll('[data-plan]'))b.onclick=action(()=>load(b.dataset.plan));
}
async function refreshHistory(){const context=await api('/api/character-renames?character_id='+encodeURIComponent(cid));renderHistory(context.history);}
async function start(){
  const context=await api('/api/character-renames'+(cid?'?character_id='+encodeURIComponent(cid):''));csrf=context.csrf;
  if(cid){
    const c=await api('/api/characters/'+encodeURIComponent(cid));
    $('#prepare').innerHTML=`<h2>${esc(c.name)}</h2><form id="rename-form"><label>Új név<input id="new-name" required maxlength="200" autocomplete="off"></label><p><button>Csak előnézet készítése</button></p></form>`;
    if(query.has('new_name'))$('#new-name').value=query.get('new_name');
    $('#new-name').oninput=()=>{preparingKey=crypto.randomUUID();};
    $('#rename-form').onsubmit=action(async e=>{e.preventDefault();const result=await api('/api/character-renames',{request_key:preparingKey,character_id:cid,new_name:$('#new-name').value});await load(result.plan_id);});
    renderHistory(context.history);
  }
  if(query.has('plan'))await load(query.get('plan'));
}
start().catch(e=>{$('#status').textContent=e.message;});
