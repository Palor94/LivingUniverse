import {approvedReferenceUrl} from './character-reference-crops.js';
const statusNames={pending:'Jóváhagyásra vár',approved:'Indítható',running:'Készül a kép',generated:'A kép elkészült, mentésre vár',succeeded:'Elmentve',uncertain:'Ellenőrzést igényel',failed:'Sikertelen',rejected:'Elvetve',withdrawn:'Visszavonva'};
const roleNames={face:'Arc és szemek',body:'Test és arányok',detail:'Jellegzetes részlet',general:'Általános megjelenés'};
export function sogniPresetLabel(value){const names={'krea2-mystic-x':'Mystic X','krea2-realism-engine':'Realism Engine v3'};return (value?.loras||[]).map((id,i)=>(names[id]||id)+' · '+Number(value.lora_strengths[i]).toLocaleString('hu-HU')).join(' / ');}
export function installCharacterGeneration({api,esc,mediaDialog,onSaved=async()=>{},$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],request=fetch}){
  const drafts=new Map(),watching=new Set();let dispose=()=>{};
  async function render(character){
    dispose();const host=$('#profile-content');host.innerHTML='<p role="status">Sogni betöltése…</p>';
    let active=true,timer,busy=false,plan=null,context,loadVersion=0;
    dispose=()=>{active=false;clearTimeout(timer);};
    const route='/api/characters/'+character.id+'/generation';
    const alive=()=>active&&host.isConnected;
    const draft=drafts.get(character.id)||{prompt:'',size:'1024x1024',selected:new Set(),request:null};drafts.set(character.id,draft);
    try{context=await api(route);}catch(error){if(alive())host.innerHTML='<p class="error">'+esc(error.message)+'</p>';return;}
    if(!alive())return;
    const provider=context.providers.find(p=>p.provider==='sogni'),refs=context.canon?.references||[],limit=provider?.max_references||0;
    draft.selected=new Set([...draft.selected].filter(id=>refs.some(r=>r.media_id===id&&r.available)));
    const ready=context.enabled&&provider?.available&&refs.some(r=>r.available);
    host.innerHTML=`<div class="generation-layout"><section class="panel generation-composer"><div class="eyebrow">Képműhely · Sogni</div><h2>Új jelenet ${esc(character.name)} karakterével</h2><p>A jóváhagyott megjelenés és az általad kiválasztott képek vezetik a generálást.</p>
      ${!context.enabled?'<div class="note">A generálási szolgáltatás még nincs bekapcsolva ezen a példányon.</div>':!provider?.available?'<div class="note">A Sogni még nem érhető el. Futtasd a Connect Sogni.cmd fájlt, majd indítsd újra a Living Universe-t.</div>':''}
      ${!refs.some(r=>r.available)?'<div class="note">Először válassz és hagyj jóvá képreferenciákat az Approved identity lapon. A profil vagy a borítókép mentése önmagában nem elég.</div>':''}
      <form id="generation-composer" class="form-grid"><label>Milyen jelenetet szeretnél?<textarea id="generation-scene" rows="5" maxlength="12000" required placeholder="Például: egy kávézó ablakánál olvas, természetes reggeli fényben…">${esc(draft.prompt)}</textarea></label>
      <div class="two-cols"><label>Képformátum<select id="generation-size"><option value="1024x1024">Négyzet · 1024 × 1024</option><option value="1536x1024">Fekvő · 1536 × 1024</option><option value="1024x1536">Álló · 1024 × 1536</option></select></label><div class="generation-model"><span>Modell</span><b>${esc(provider?.model_label||provider?.model||'Nincs beállítva')}</b>${provider?.loras?.length?`<small>LoRA: ${esc(sogniPresetLabel(provider))}</small>`:''}<small>A fiók hozzáférését és a karakterhűséget a helyi beállítás önmagában nem igazolja.</small></div></div>
      <fieldset class="generation-reference-picker"><legend>Jóváhagyott referenciák</legend><p id="generation-selection" role="status"></p><div class="generation-reference-grid">${refs.map(ref=>`<label class="generation-reference ${ref.available?'':'unavailable'}"><input type="checkbox" data-generation-ref="${esc(ref.media_id)}" ${draft.selected.has(ref.media_id)?'checked':''} ${!ref.available?'disabled':''}><span>${ref.available?`<img loading="lazy" src="${approvedReferenceUrl(character.id,ref,context.canon.revision_id)}" alt="${esc(roleNames[ref.role]||ref.role)} referencia">`:`<span class="generation-missing">${esc(ref.unavailable_reason||'Nem elérhető képreferencia')}</span>`}<b>${esc(roleNames[ref.role]||ref.role)}</b><small>${esc(ref.name)}</small></span></label>`).join('')}</div><small>Az arcot és a testarányokat külön is érdemes lefedni. Képválasztáskor nem módosul a karakter jóváhagyott megjelenése.</small></fieldset>
      <p class="muted">Az előkészítés nem küld képet a Sogninak és nem indít fizetős kérést.</p><button class="primary" id="generation-prepare" ${ready?'':'disabled'}>Kérés előkészítése</button></form></section>
      <aside><section id="generation-plan" class="panel" aria-live="polite"><h2>Előnézet és indítás</h2><p>Az előkészített kérés itt jelenik meg. Indítás előtt ellenőrizheted és jóváhagyhatod.</p></section><p id="generation-error" class="error" role="alert"></p><section class="panel"><h2>Korábbi képgenerálások</h2><div id="generation-history"></div></section></aside></div>`;
    const scoped=s=>$(s,host),all=s=>$$(s,host),error=message=>{if(alive())scoped('#generation-error').textContent=message;};
    scoped('#generation-size').value=draft.size;
    function sync(){const count=draft.selected.size;scoped('#generation-selection').textContent=limit?`${count} / ${limit} kép kiválasztva`:`${count} kép kiválasztva`;scoped('#generation-prepare').disabled=busy||!ready||!count||count>limit||!draft.prompt.trim();}
    scoped('#generation-scene').oninput=e=>{draft.prompt=e.target.value;sync();};scoped('#generation-size').onchange=e=>{draft.size=e.target.value;};
    for(const input of all('[data-generation-ref]'))input.onchange=()=>{if(input.checked)draft.selected.add(input.dataset.generationRef);else draft.selected.delete(input.dataset.generationRef);sync();};
    async function write(suffix,body){const res=await request(route+suffix,{method:'POST',headers:{'Content-Type':'application/json','X-LU-Generation-CSRF':context.csrf},body:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw Error(value.error||'A művelet nem sikerült.');return value;}
    async function act(fn){if(busy||!alive())return;busy=true;error('');for(const b of all('button'))b.disabled=true;try{await fn();}catch(e){error(e.message);}finally{busy=false;if(alive()){for(const b of all('button'))b.disabled=false;sync();const approve=scoped('#generation-approve');if(approve)approve.disabled=!scoped('#generation-ack').checked;}}}
    function history(){const target=scoped('#generation-history');target.innerHTML=context.runs.length?context.runs.map(run=>`<button type="button" class="generation-history-item" data-generation-run="${esc(run.run_id)}"><span>${esc(statusNames[run.status]||run.status)} · ${esc(new Date(run.created_at).toLocaleString('hu-HU'))}</span><b>${esc(run.prompt)}</b><small>${esc(run.provider)} · ${esc(run.model)}</small></button>`).join(''):'<p class="muted">Még nincs próbálkozás ehhez a karakterhez.</p>';for(const b of all('[data-generation-run]'))b.onclick=()=>act(()=>load(b.dataset.generationRun));}
    function remember(value){const summary={run_id:value.run_id,status:value.status,created_at:value.created_at,prompt:value.manifest.prompt,provider:value.manifest.provider,model:value.manifest.model,output:value.output};context.runs=[summary,...context.runs.filter(r=>r.run_id!==value.run_id)].slice(0,30);history();}
    function show(value){
      if(!alive())return;loadVersion++;plan=value;clearTimeout(timer);remember(value);if(['succeeded','uncertain','failed','rejected','withdrawn'].includes(value.status))draft.request=null;
      if(value.status==='succeeded'&&value.output?.active&&watching.delete(value.run_id)){Promise.resolve(onSaved(character.id,value.output.media_id)).catch(e=>error(e.message));return;}
      const target=scoped('#generation-plan'),cost=value.manifest.estimated_cost_usd===null?'A pontos költség nem ismert. Ellenőrizd a Sogni-fiókod díjazását és egyenlegét.':`Becsült költség: ${value.manifest.estimated_cost_usd} USD. A tényleges díj eltérhet.`;
      target.innerHTML=`<div class="eyebrow">${esc(statusNames[value.status]||value.status)}</div><h2>Előkészített kérés</h2><p class="generation-scene-preview">${esc(value.manifest.prompt)}</p><p>${esc(value.manifest.model_label||value.manifest.model)} · ${esc(value.manifest.size)} · egy kép</p>${value.manifest.loras?.length?`<p>LoRA: ${esc(sogniPresetLabel(value.manifest))}</p>`:''}<div class="generation-reference-grid compact">${value.manifest.characters.flatMap(c=>c.references.map(ref=>`<figure><img loading="lazy" src="${approvedReferenceUrl(c.character_id,ref,c.revision_id)}" alt="${esc(roleNames[ref.role]||ref.role)} referencia"><figcaption>${esc(c.name)} · ${esc(roleNames[ref.role]||ref.role)}</figcaption></figure>`)).join('')}</div><p class="note">${esc(cost)}</p><details><summary>A Sogninak küldendő teljes leírás</summary><pre class="generation-prompt">${esc(value.manifest.provider_prompt)}</pre></details>
      ${value.status==='pending'?'<label class="generation-ack"><input type="checkbox" id="generation-ack">Jóváhagyom ennek a leírásnak és ezeknek a referenciaképeknek a kiküldését, és vállalom a Sogni esetleges díját.</label><div class="actions"><button id="generation-approve" class="primary" disabled>Jóváhagyom a tervet</button><button id="generation-reject">Elvetem</button></div>':''}
      ${['approved','generated'].includes(value.status)?`<button id="generation-execute" class="primary">${value.status==='generated'?'Elkészült kép mentésének újrapróbálása':'Egy kép generálása Sognival'}</button>`:''}
      ${value.status==='running'?'<p role="status">A Sogni dolgozik. Az állapot automatikusan frissül; a kép a katalógusba kerül, amikor elkészült.</p>':''}
      ${value.status==='uncertain'?'<p class="note">A kérés megszakadt vagy a Sogni további lépést kér. Már történhetett terhelés. Új próbálkozás előtt ellenőrizd a Sogni-fiókot.</p>':''}
      ${value.error_code==='PROVIDER_REVIEW_REQUIRED'?'<p class="note">A Sogni ellenőrzésre várakoztatja ezt a feladatot. Még nem adott vissza képet, ezért nincs új kép a profil médiái között.</p>':''}
      ${value.error_code?`<p class="error">${esc(value.error_code)}</p>`:''}
      ${value.output?.active?`<div class="generation-result"><img src="/media/${encodeURIComponent(value.output.media_id)}" alt="Elkészült, még elbírálatlan kép"><p>A kép már a profil médiái között van.</p><button id="generation-open-gallery">Megnyitás a profil médiái között</button><button id="generation-open-result">Kép megnyitása és értékelése</button><small>Az eredmény nincs automatikusan jóváhagyva vagy referenciává emelve.</small></div>`:''}
      <button type="button" class="subtle" id="generation-refresh">Állapot frissítése</button>`;
      if(scoped('#generation-ack')){scoped('#generation-ack').onchange=e=>{scoped('#generation-approve').disabled=!e.target.checked||busy;};scoped('#generation-approve').onclick=()=>act(async()=>show(await write('/'+value.run_id+'/decision',{decision:'approve',manifest_hash:value.manifest_hash,acknowledge_external_upload_and_cost:scoped('#generation-ack').checked})));scoped('#generation-reject').onclick=()=>act(async()=>show(await write('/'+value.run_id+'/decision',{decision:'reject',manifest_hash:value.manifest_hash})));}
      if(scoped('#generation-execute'))scoped('#generation-execute').onclick=()=>act(async()=>{watching.add(value.run_id);show(await write('/'+value.run_id+'/execute',{manifest_hash:value.manifest_hash}));});
      if(scoped('#generation-open-gallery'))scoped('#generation-open-gallery').onclick=()=>act(()=>onSaved(character.id,value.output.media_id));
      if(scoped('#generation-open-result'))scoped('#generation-open-result').onclick=()=>act(()=>mediaDialog(value.output.media_id));
      scoped('#generation-refresh').onclick=()=>act(()=>load(value.run_id));
      if(value.status==='running')timer=setTimeout(async()=>{if(!alive())return;if(busy){show(plan);return;}try{await load(value.run_id);}catch(e){error(e.message);}},3000);
    }
    async function load(rid){const version=++loadVersion,value=await api(route+'/'+rid);if(alive()&&version===loadVersion)show(value);}
    scoped('#generation-composer').onsubmit=e=>{e.preventDefault();return act(async()=>{
      const fields={prompt:draft.prompt,size:draft.size,revision_id:context.canon?.revision_id,reference_ids:[...draft.selected]},signature=JSON.stringify(fields);
      if(!draft.request||draft.request.signature!==signature)draft.request={signature,body:{request_key:'desktop_'+crypto.randomUUID(),...fields}};
      show(await write('',draft.request.body));
    });};
    history();sync();if(context.runs.length)try{await load(context.runs[0].run_id);}catch(e){error(e.message);}
  }
  return {render,cleanup:()=>dispose()};
}
