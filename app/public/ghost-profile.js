import {anatomyGenerationGuide} from './profile-appearance-guide.js';
import {normalizeGhostValues} from './ghost-import.js';
const overviewExcerpt=(value,max=260)=>{const text=String(value??'').replace(/\s+/g,' ').trim();if(text.length<=max)return text;const cut=text.slice(0,max);return cut.slice(0,cut.lastIndexOf(' ')>max*.6?cut.lastIndexOf(' '):max)+'…';};
export function buildProfileOverview(c,g){
  const sections=[...new Set(g.template.fields.map(f=>f.group))].map(group=>({title:group,entries:[]}));
  for(const f of g.template.fields){
    const approved=g.values[f.id],legacy=!approved&&f.source?g.legacy?.[f.source]:null;
    const value=approved?.value??legacy;
    if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
    const section=sections.find(section=>section.title===f.group);
    section.entries.push({label:f.label,text:overviewExcerpt(f.type==='scale'?`${value}/${f.max}${approved.interpretation?' · '+approved.interpretation:''}`:value),kind:approved?.kind||'legacy',visibility:approved?.visibility||'creator'});
  }
  if(c.canon?.appearance){const appearance=sections.find(s=>s.title==='Megjelenés');appearance?.entries.unshift({label:'Jóváhagyott vizuális identitás',text:overviewExcerpt(c.canon.appearance),kind:'canon',visibility:'creator'});}
  sections.push({title:'Kapcsolatok',entries:(c.relationships||[]).map(r=>({label:r.target_name||'Kapcsolat',text:overviewExcerpt(r.description),kind:'relationship',visibility:'creator'})).filter(e=>e.text)});
  return sections;
}
export const profileQuestionGuides={
  identity:{question:'Milyen háttértörténete és életútja legyen?',parts:[['background','Családi háttér és felnövekedés'],['education','Tanulmányok, munka és életkörülmények'],['turning_points','Meghatározó élmények és fordulópontok'],['present','Hogyan jutott a jelenlegi helyzetébe?']]},
  personality:{question:'Milyen személyisége és hétköznapi viselkedése legyen?',parts:[['traits','Főbb vonások, erősségek és gyengeségek'],['social','Viselkedése társaságban és közeli kapcsolatokban'],['stress','Konfliktusok és stressz kezelése'],['contradictions','Humor, érzékeny pontok és ellentmondások']]},
  sexuality:{question:'Milyen legyen a szexualitása és az intimitáshoz való viszonya?',parts:[['orientation','Orientáció és önmeghatározás'],['attractions','Megélt vonzalmak és esetleges ambivalencia'],['desire','Libidó és kezdeményezőkészség'],['preferences','Preferenciák, nyitottság és kísérletezés'],['intimacy','Érzelmi közelség, határok és intimitás']]},
  sexual_penis_use:{question:'Milyen preferenciái vannak a pénisze használatával kapcsolatban?',parts:[]},
  sexual_anal_use:{question:'Milyen preferenciái vannak a végbéltájékát érintően?',parts:[]},
  sexual_tongue_use:{question:'Milyen preferenciái vannak a nyelve használatával kapcsolatban?',parts:[]},
  sexual_hand_use:{question:'Milyen preferenciái vannak a keze használatával kapcsolatban?',parts:[]},
  speech:{question:'Hogyan beszéljen, és milyen mondatok legyenek rá jellemzők?',parts:[]},
  appearance_summary:{question:'Milyen legyen a megjelenése a meglévő leírások alapján?',parts:[]}
};
export function buildProfileGenerationPackage(c,g){
  const supplement=structuredClone(anatomyGenerationGuide);
  for(const f of g.template.fields)if(supplement.fields[f.id]&&f.guidance)supplement.fields[f.id].template_guidance=f.guidance;
  return {
    generation_package_version:2,
    appearance_supplement:supplement,
    instructions:'Készíts teljes, koherens fiktív karakterprofil-javaslatot a közös Szellemprofil alapján. Ne csak belső folyamatokat vagy számszerű skálákat adj: kötelezően térj ki a háttértörténetre (identity), személyiségre (personality), szexualitásra (sexuality), kommunikációra (speech) és megjelenésre (appearance_summary). Ezekben írj olvasható, összefüggő profiljavaslatot; az alkérdésekre is adj javaslatot, ahol releváns. A meglévő profileszövegekből és elfogadott értékekből indulj ki, őrizd meg a konkrét részleteket. Új, koherens fiktív kiegészítést javasolhatsz hypothesis jelöléssel; meglévő tényt ne írj felül és forrást ne találj ki. Ha nem javasolsz új részletet, az ismeretlen maradjon üres/null. A forrás külön jelezze a meglévő adatot és az új AI-javaslatot. A karakter benyomása impression, megerősített adat fact. A technikai eredetet különítsd el az életrajztól. A vágy, vonzalom, önmeghatározás és nyilvánosan mutatott viselkedés eltérhet, de ezt ne sztereotípiából vezesd le. A felnőtt karakter anatómiai adatai csak meglévő adat vagy külön megjelölt, jóváhagyandó javaslat alapján tölthetők. Nem módosítasz profilt vagy vizuális kánont. Válaszod letölthető JSON legyen character_id, model és values kulcsokkal. Minden values-bejegyzésben value, interpretation, kind, source és visibility szerepeljen; új javaslatnál alapértelmezés hypothesis és creator. A fő témákon túl dolgozd fel a sablon további mezőit és az egyéni bővítéseket is. A mezők guidance szövege a közös sablon aktuális útmutatója; ezt vedd elsődlegesnek. A Megjelenés részhez kövesd az appearance_supplement feltételeit, A–D ellenőrzőlistáját és forrásjelölési szabályait. Az anatomy mezőbe A–C, az appearance_detail mezőbe D kerüljön.\n\n'+anatomyGenerationGuide.instructions,
    character_id:c.id,name:c.name,template_version:g.template.version,template:g.template,
    reference_context:{approved_revision_id:c.canon?.id??null,approved_appearance:c.canon?.appearance??'',images_included:false,note:'A csomag képfájlokat nem tartalmaz. Csak ténylegesen megtekintett referencia látható jellemzőire hivatkozz; a kép hiányát ne helyettesítsd feltételezett megfigyeléssel.'},
    required_sections:['identity','personality','sexuality','speech','appearance_summary'].filter(id=>g.template.fields.some(f=>f.id===id)),
    optional_preference_fields:['sexual_penis_use','sexual_anal_use','sexual_tongue_use','sexual_hand_use'].filter(id=>g.template.fields.some(f=>f.id===id)),
    questions:profileQuestionGuides,legacy:g.legacy,relationships:c.relationships||[],values:g.values
  };
}
// Accept both the complete model response and a standalone values object.
export function parseGhostImport(text,characterId){
  let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('A fájl vagy a beillesztett szöveg nem érvényes JSON.');}
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!object(input))throw Error('A JSON-nak profiljavaslatot tartalmazó objektumnak kell lennie.');
  if(input.character_id!==undefined&&input.character_id!==characterId)throw Error('Ez a fájl másik karakterhez tartozik. Nyisd meg a megfelelő karaktert.');
  const values=Object.hasOwn(input,'values')?input.values:input;
  if(!object(values)||!Object.keys(values).length||Object.values(values).some(v=>!object(v)||!Object.hasOwn(v,'value')))throw Error('Nem található kitölthető profiljavaslat. Válaszd a values mezőket tartalmazó JSON-fájlt.');
  return {values:normalizeGhostValues(values),model:typeof input.model==='string'?input.model:''};
}
export function installGhostProfile({$,esc,api,action,toast}){
  const entry=()=>({value:'',interpretation:'',kind:'hypothesis',source:'Szerzői szerkesztés',visibility:'creator'});
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function render(c,reviewId=null,container=null){
    const host=container||$('#profile-content'),base='/api/characters/'+c.id+'/ghost',g=await api(base);if(!host?.isConnected)return;
    let overview=host.parentElement.querySelector('#profile-overview');
    if(!overview){overview=document.createElement('section');overview.id='profile-overview';overview.className='panel profile-overview';if(host.id==='structured-profile'){const first=host.parentElement.firstElementChild;if(first?.tagName==='H2')first.after(overview);else host.parentElement.prepend(overview);}else host.before(overview);}
    const overviewKinds={hypothesis:'Hipotézis',impression:'Benyomás',legacy:'Korábbi profilszöveg',canon:'Vizuális kánon',fact:'Tény',relationship:'Irányított kapcsolat'};
    overview.innerHTML=`<h2>Profiláttekintő</h2><p>Automatikus összefoglaló az elfogadott mezőkből és a meglévő profilszövegekből.</p><div class="profile-overview-grid">${buildProfileOverview(c,g).map(section=>`<section><h3>${esc(section.title)}</h3>${section.entries.length?section.entries.map(e=>`<p><strong>${esc(e.label)}:</strong> ${esc(e.text)} <small>${esc(overviewKinds[e.kind]||e.kind)}${e.visibility==='creator'?' · csak szerző':''}</small></p>`).join(''):'<p class="muted">Még nincs megadott adat.</p>'}</section>`).join('')}</div>`;
    const rerender=(id=null)=>render(c,id,host);
    const pending=g.proposals.filter(p=>p.status==='pending'),latest=pending.at(-1);
    host.innerHTML=`<div class="panel"><h2>Szellemprofil alapján bővített profil</h2><p>A profil mezőit a külön Szellemprofil határozza meg. Az itt elfogadott adatok ezen a profilon jelennek meg. A megjelenés referencia-kánonja külön jóváhagyás marad.</p><div class="actions"><button id="ghost-legacy">Meglévő szövegek átvételének javaslata</button><button id="ghost-export">Teljes profilgenerálási csomag letöltése</button><button id="ghost-empty-template">Üres profilsablon letöltése</button></div><details><summary>AI-javaslat betöltése</summary><p>Töltsd fel a modelltől kapott .json fájlt, vagy illeszd be a javaslat szövegét. A teljes, values mezőt tartalmazó válasz és a külön mezőobjektum is használható. A betöltés után minden mező szerkeszthető és külön jóváhagyható.</p><label>Modell / forrás<input id="ghost-model" placeholder="Például ChatGPT, Grok vagy szerző"></label><label>JSON-fájl feltöltése<input id="ghost-file" type="file" accept=".json,application/json"></label><p id="ghost-file-status" role="status" aria-live="polite"></p><label>Vagy JSON-szöveg beillesztése<textarea id="ghost-import" rows="8" placeholder='{"values":{…}}'></textarea></label><button id="ghost-load">Javaslat betöltése</button></details></div>${latest?`<div class="panel" role="status"><h2>Van már betöltött javaslat</h2><p>${pending.length} javaslat vár elbírálásra. A legutóbbi ${Object.keys(latest.values).length} mezőt tartalmaz. Az alábbi profilba csak külön jóváhagyás után kerülnek át.</p><label>Megnyitandó javaslat<select id="ghost-review-choice">${pending.slice().reverse().map(p=>`<option value="${p.id}">${esc(p.model)} · ${Object.keys(p.values).length} mező · ${esc(p.at)}</option>`).join('')}</select></label><button id="ghost-latest-review" class="primary">Javaslat áttekintése kérdésenként</button></div>`:''}<form id="ghost-form" class="panel form-grid"><h2 id="ghost-form-heading">${esc(c.name)} · profiladatok</h2><p id="ghost-review-note">${g.version===0?'Még nincsenek jóváhagyott strukturált profiladatok. A betöltött javaslatot a fenti gombbal nyithatod meg.':'Itt az eddig jóváhagyott mezők láthatók.'}</p>${[...new Set(g.template.fields.map(f=>f.group))].map(group=>`<details ${g.template.fields.some(f=>f.group===group&&g.values[f.id])?'open':''}><summary>${esc(group)}</summary>${g.template.fields.filter(f=>f.group===group).map(f=>{const e=g.values[f.id]||entry();return `<fieldset data-ghost="${f.id}"><legend><label><input type="checkbox" data-select ${Object.hasOwn(g.values,f.id)?'checked':''}> ${esc(f.label)}</label></legend>${f.type==='scale'?`<input data-value aria-label="${esc(f.label)}" type="number" min="0" max="${f.max}" step="any" value="${esc(e.value)}" placeholder="Ismeretlen (0–${f.max})">`:`<textarea data-value aria-label="${esc(f.label)}" rows="3" placeholder="Nincs megadva">${esc(e.value)}</textarea>`}<details><summary>Értelmezés, forrás és tudáshatár</summary><label>Rövid értelmezés<textarea data-interpretation>${esc(e.interpretation)}</textarea></label><label>Állítás típusa<select data-kind>${[['fact','Megerősített tény'],['impression','Palor benyomása'],['hypothesis','Hipotézis']].map(([v,l])=>`<option value="${v}" ${e.kind===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Forrás<input data-source value="${esc(e.source)}"></label><label>Tudáshatár<select data-visibility><option value="creator">Csak szerző</option><option value="public" ${e.visibility==='public'?'selected':''}>Nyilvános világbeli adat</option></select></label></details></fieldset>`;}).join('')}</details>`).join('')}<button class="primary">Adatok jóváhagyása</button><p>A meglévő életrajz, kommunikációs példák és kapcsolatok megmaradnak.</p></form><div class="panel"><h2>Javaslatok és előzmények</h2>${g.proposals.slice().reverse().map(p=>`<details><summary>${esc(p.model)} · ${esc(({pending:'Jóváhagyásra vár',accepted:'Elfogadva',rejected:'Elutasítva'})[p.status]||p.status)} · ${esc(p.at)}</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(p.values,null,2))}</pre>${p.status==='pending'?`<button data-review="${p.id}">Áttekintés kérdésenként</button><button data-reject="${p.id}">Elutasítás</button>`:''}</details>`).join('')||'<p>Még nincs javaslat.</p>'}<p>Elfogadott verzió: ${g.version}. Korábbi változatok: ${g.history.length}.</p><button id="ghost-history">Teljes előzmény letöltése</button><label>Korábbi verzió visszaállításának javaslata<select id="ghost-restore-version"><option value="">Válassz verziót</option>${g.history.filter(h=>Object.keys(h.values).length).map(h=>`<option value="${h.version}">${h.version}. verzió</option>`).join('')}</select></label><button id="ghost-restore">Visszaállítási javaslat készítése</button></div>`;
    const collect=()=>Object.fromEntries([...document.querySelectorAll('[data-ghost]')].filter(el=>$('[data-select]',el).checked).map(el=>{const f=g.template.fields.find(f=>f.id===el.dataset.ghost),raw=$('[data-value]',el).value;return [f.id,{value:f.type==='scale'?(raw===''?null:Number(raw)):raw,interpretation:$('[data-interpretation]',el).value,kind:$('[data-kind]',el).value,source:$('[data-source]',el).value,visibility:$('[data-visibility]',el).value}];}));
    const draftKey='lu-ghost-draft:'+c.id;
    const clearDraft=()=>{try{sessionStorage.removeItem(draftKey);}catch{}};
    try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft&&draft.version===g.version){for(const el of document.querySelectorAll('[data-ghost]')){const e=draft.values[el.dataset.ghost];if(e){$('[data-select]',el).checked=true;el.closest('details').open=true;for(const k of ['value','interpretation','kind','source','visibility'])$('[data-'+k+']',el).value=e[k]??'';}}}}catch{}
    $('#ghost-form').oninput=()=>{try{sessionStorage.setItem(draftKey,JSON.stringify({version:g.version,values:collect()}));}catch{}};
    const proposal=values=>api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:'Szerzői szerkesztés',values});
    let approving=false;
    $('#ghost-form').onsubmit=action(async e=>{
      e.preventDefault();if(approving)return;const values=collect();if(!Object.keys(values).length)throw Error('Jelölj ki legalább egy jóváhagyandó mezőt.');
      const form=e.target,button=form.querySelector('button.primary');approving=true;button.disabled=true;button.textContent='Jóváhagyás…';
      try{
        const saved=await proposal(values);
        await api(base+'/proposals/'+saved.id+'/decision',{expected_version:g.version,decision:'accept',values:saved.values});
        clearDraft();toast('A kijelölt adatok jóváhagyva és elmentve.');await rerender();
      }finally{approving=false;if(button.isConnected){button.disabled=false;button.textContent='Adatok jóváhagyása';}}
    });
    $('#ghost-legacy').onclick=action(async()=>{await api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:'Helyi szövegátvétel · AI-hívás nélkül',from_legacy:true});await rerender();});
    $('#ghost-export').onclick=()=>download('teljes-profilgeneralasi-csomag.json',buildProfileGenerationPackage(c,g));
    $('#ghost-restore').onclick=action(async()=>{const value=$('#ghost-restore-version').value,h=g.history.find(h=>String(h.version)===value);if(!h)throw Error('Válassz korábbi, kitöltött verziót.');const values={...h.values};for(const id of Object.keys(g.values))if(!Object.hasOwn(values,id)){const f=g.template.fields.find(f=>f.id===id);values[id]={value:f.type==='scale'?null:'',interpretation:'Visszaállításkor ismeretlenre állítva.',kind:'hypothesis',source:'Korábbi verzió visszaállítása',visibility:'creator'};}await proposal(values);await rerender();});
    $('#ghost-history').onclick=()=>download('szellemprofil-elozmeny.json',g);
    $('#ghost-load').onclick=action(async()=>{const input=parseGhostImport($('#ghost-import').value,c.id);const saved=await api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:$('#ghost-model').value.trim()||input.model||'AI-javaslat (modell nincs megadva)',values:input.values});await rerender(saved.id);toast('A javaslat betöltve: '+Object.keys(saved.values).length+' mező vár az ellenőrzésedre.');});
    $('#ghost-file').onchange=async e=>{
      const chooser=e.target,file=chooser.files?.[0],status=$('#ghost-file-status'),textArea=$('#ghost-import');if(!file)return;
      const original=textArea.value;status.textContent='Fájl olvasása…';
      try{
        if(!/\.json$/i.test(file.name))throw Error('Válassz .json kiterjesztésű fájlt.');
        if(file.size>1024*1024)throw Error('A JSON-fájl legfeljebb 1 MiB lehet.');
        const text=await file.text(),input=parseGhostImport(text,c.id);
        if(!host.isConnected||chooser.files?.[0]!==file)return;
        if(textArea.value!==original)throw Error('A szöveget közben szerkesztetted. Válaszd ki újra a fájlt, ha azt szeretnéd betölteni.');
        textArea.value=JSON.stringify({values:input.values},null,2);
        if(!$('#ghost-model').value.trim())$('#ghost-model').value=input.model||'AI-javaslat (modell nincs megadva)';
        status.textContent=file.name+' · '+Object.keys(input.values).length+' mező beolvasva. A mentéshez kattints a Javaslat betöltése gombra.';
      }catch(error){if(host.isConnected)status.textContent=error.message;}
      finally{chooser.value='';}
    };
    $('#ghost-empty-template').onclick=()=>download('ures-karakterprofil-sablon.json',{character_id:c.id,template_version:g.template.version,template:g.template,model:'',values:Object.fromEntries(g.template.fields.map(f=>[f.id,{value:f.type==='scale'?null:'',interpretation:'',kind:'hypothesis',source:'',visibility:'creator'}]))});

    for(const b of document.querySelectorAll('[data-reject]'))b.onclick=action(async()=>{await api(base+'/proposals/'+b.dataset.reject+'/decision',{decision:'reject'});await rerender();});
    function review(p){openGhostWizard({character:c,proposal:p,profile:g,esc,api,base,onSaved:async()=>{clearDraft();toast('A kiválasztott mezők jóváhagyva.');await rerender();}});}
    for(const b of document.querySelectorAll('[data-review]'))b.onclick=()=>review(g.proposals.find(p=>p.id===b.dataset.review));
    if(latest)$('#ghost-latest-review').onclick=()=>review(pending.find(p=>p.id===$('#ghost-review-choice').value));
    if(reviewId){const p=g.proposals.find(p=>p.id===reviewId&&p.status==='pending');if(p)review(p);}
  }
  async function renderTemplate(container,onBack){
    const template=await api('/api/ghost-template');if(!container.isConnected)return;
    const fields=structuredClone(template.fields);
    container.innerHTML=`<div class="panel"><div class="eyebrow">Nem játszható sablonkarakter</div><h1>◇ Szellemprofil</h1><p>Ez az üres alapkarakter határozza meg az összes karakter profiljának felépítését. Nincsenek saját történetbeli értékei, kapcsolatai vagy emlékei.</p><button id="template-back">← Karakterek</button></div><form id="template-fields-form" class="panel form-grid"><h2>Közös profilmezők · ${template.version}. verzió</h2><p>Új mező hozzáadásakor minden meglévő és új karakter profilján megjelenik egy üres, kitölthető mező. A korábban elfogadott értékek megmaradnak.</p><div id="template-fields-list"></div><fieldset><legend>Új kitölthető mező</legend><label>Mező neve<input id="template-new-label" maxlength="150" placeholder="Például: Péniszméret"></label><label>Csoport<input id="template-new-group" maxlength="100" placeholder="Például: Anatómia"></label><label>Adattípus<select id="template-new-type"><option value="text">Szöveg (méretekhez mértékegységgel is)</option><option value="scale10">0–10 skála</option><option value="scale5">0–5 skála</option></select></label><button type="button" id="template-add-field">Mező hozzáadása a sablonhoz</button></fieldset><p id="template-status" role="status"></p><button class="primary">Szellemprofil mentése · alkalmazás minden karakterre</button></form>`;
    const list=$('#template-fields-list');
    function collectLabels(){for(const el of list.querySelectorAll('[data-template-field]')){const f=fields.find(f=>f.id===el.dataset.templateField);f.label=el.querySelector('[data-label]').value.trim();f.group=el.querySelector('[data-group]').value.trim();const guide=el.querySelector('[data-guidance]');if(guide)f.guidance=guide.value;}}
    function draw(){list.innerHTML=fields.map(f=>`<div data-template-field="${f.id}" class="template-field-row"><label>Mező neve<input data-label aria-label="${esc(f.label)} mezőnév" maxlength="150" value="${esc(f.label)}" required></label><label>Csoport<input data-group aria-label="${esc(f.label)} csoport" maxlength="100" value="${esc(f.group)}"></label><small>${f.type==='scale'?'0–'+f.max+' skála':'Szöveg'} · üres alapérték</small><details><summary>Kitöltési és generálási útmutató</summary><textarea data-guidance rows="8" maxlength="20000" aria-label="${esc(f.label)} kitöltési útmutató">${esc(f.guidance||'')}</textarea></details></div>`).join('');}
    $('#template-back').onclick=onBack;
    $('#template-add-field').onclick=()=>{
      collectLabels();const label=$('#template-new-label').value.trim();if(!label){$('#template-status').textContent='Adj nevet az új mezőnek.';$('#template-new-label').focus();return;}
      const type=$('#template-new-type').value;
      const f={id:'custom_'+crypto.randomUUID().replaceAll('-',''),label,group:$('#template-new-group').value.trim()||'Egyéb',type:type==='text'?'text':'scale',...(type==='text'?{}:{max:type==='scale5'?5:10})};fields.push(f);draw();$('#template-new-label').value='';$('#template-status').textContent='A(z) '+label+' mező hozzáadva. A közös szerkezethez mentsd a Szellemprofilt.';
    };
    $('#template-fields-form').onsubmit=action(async e=>{e.preventDefault();collectLabels();await api('/api/ghost-template',{expected_version:template.version,fields},'PUT');toast('A Szellemprofil frissült. Az új mezők minden karakteren kitölthetők.');await renderTemplate(container,onBack);});
    draw();
  }
  return {render,renderTemplate};
}

export function openGhostWizard({character,proposal,profile,esc,api,base,onSaved}){
  document.querySelector('#ghost-wizard')?.remove();
  const dialog=document.createElement('dialog');dialog.id='ghost-wizard';dialog.className='ghost-wizard';
  dialog.setAttribute('aria-labelledby','ghost-question-title');document.body.append(dialog);
  const priority=['identity','personality','sexuality','speech','appearance_summary'];
  const fields=profile.template.fields.filter(f=>Object.hasOwn(proposal.values,f.id)).sort((a,b)=>(priority.includes(a.id)?priority.indexOf(a.id):priority.length)-(priority.includes(b.id)?priority.indexOf(b.id):priority.length));
  const key='lu-ghost-wizard:'+character.id+':'+proposal.id;
  let state={index:0,answers:{},summary:false},saving=false;
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.question_order===fields.map(f=>f.id).join('|')&&saved?.version===profile.version&&saved?.profile_version===profile.profile_version&&saved?.template_version===profile.template.version&&saved.state&&Number.isInteger(saved.state.index)&&saved.state.index>=0&&saved.state.index<=fields.length)state=saved.state;}catch{}
  const $=s=>dialog.querySelector(s);
  const store=()=>{try{sessionStorage.setItem(key,JSON.stringify({question_order:fields.map(f=>f.id).join('|'),version:profile.version,profile_version:profile.profile_version,template_version:profile.template.version,state}));}catch{}};
  const names={fact:'Megerősített tény',impression:'Palor benyomása',hypothesis:'Hipotézis'};
  const anatomy=[['flaccid','Pénisz hossza nyugalmi állapotban (cm)'],['erect','Pénisz hossza merev állapotban (cm)'],['girth','Pénisz körfogata (cm, az állapot megjelölésével)'],['foreskin','Fityma / körülmetéltség'],['testicles','Herék és herezacskó jellemzői'],['hair','Intim szőrzet és egyéb anatómiai sajátosságok']];
  function capture(){
    if(state.summary)return;const f=fields[state.index];if(!f||!$('[data-answer]'))return;
    const previous=state.answers[f.id]||{},raw=$('[data-answer]').value;
    const extra=Object.fromEntries([...dialog.querySelectorAll('[data-anatomy]')].map(input=>[input.dataset.anatomy,input.value]));
    const narrative=Object.fromEntries([...dialog.querySelectorAll('[data-narrative]')].map(input=>[input.dataset.narrative,input.value]));
    state.answers[f.id]={...previous,entry:{value:f.type==='scale'?(raw===''?null:Number(raw)):raw,interpretation:$('#wizard-interpretation').value,kind:$('#wizard-kind').value,source:$('#wizard-source').value,visibility:$('#wizard-visibility').value},anatomy:extra,narrative};store();
  }
  function finalEntry(answer,fieldId){
    const e={...answer.entry};const lines=anatomy.filter(([id])=>answer.anatomy?.[id]?.trim()).map(([id,label])=>label+': '+answer.anatomy[id].trim());
    const parts=profileQuestionGuides[fieldId]?.parts||[];for(const [id,label]of parts)if(answer.narrative?.[id]?.trim())lines.push(label+': '+answer.narrative[id].trim());
    if(lines.length)e.value=[e.value,lines.join('\n')].filter(Boolean).join('\n\n');return e;
  }
  function pause(){if(saving)return;capture();store();dialog.close();dialog.remove();}
  dialog.oncancel=e=>{e.preventDefault();pause();};
  function draw(){
    const reviewed=Object.values(state.answers).filter(a=>typeof a.accept==='boolean').length;
    const accepted=fields.filter(f=>state.answers[f.id]?.accept===true);
    const stale=proposal.base_version!==profile.version||proposal.template_version!==profile.template.version||proposal.profile_version!==profile.profile_version;
    dialog.innerHTML=`<div class="ghost-wizard-top"><span>${esc(character.name)} · profiljavaslat</span><button type="button" id="wizard-close" aria-label="Bezárás és folytatás később">Bezárás</button></div><p class="ghost-wizard-progress">${state.summary?'Összefoglaló':`${state.index+1}. kérdés / ${fields.length}`} · ${reviewed} átnézve</p><progress max="${fields.length}" value="${reviewed}" aria-label="Átnézett kérdések"></progress><div id="wizard-body"></div><p id="wizard-error" role="alert"></p>`;
    $('#wizard-close').onclick=pause;
    if(stale){$('#wizard-body').innerHTML='<h2 id="ghost-question-title" tabindex="-1">A javaslat alapadatai megváltoztak</h2><p>Készíts friss javaslatot az aktuális profil alapján. A korábbi javaslat megmarad.</p>';return;}
    if(state.summary){
      $('#wizard-body').innerHTML=`<h2 id="ghost-question-title" tabindex="-1">Ezeket szeretnéd elmenteni?</h2><p>${accepted.length} mezőt választottál ki. A kihagyott és még át nem nézett mezők változatlanok maradnak.</p><div class="ghost-wizard-summary">${fields.map((f,i)=>{const a=state.answers[f.id];return `<div><strong>${esc(f.label)}</strong><span>${a?.accept===true?'Elfogadva':a?.accept===false?'Kihagyva':'Még nincs átnézve'}</span>${a?.accept===true?`<p>${esc(finalEntry(a,f.id).value??'Ismeretlen')}</p>`:''}<button type="button" data-return="${i}">Átnézem</button></div>`;}).join('')}</div><div class="ghost-wizard-actions"><button type="button" id="wizard-back">Vissza a kérdésekhez</button><button type="button" id="wizard-save" class="primary" ${accepted.length?'':'disabled'}>${accepted.length} mező jóváhagyása és mentése</button></div>`;
      for(const b of dialog.querySelectorAll('[data-return]'))b.onclick=()=>{state.index=Number(b.dataset.return);state.summary=false;store();draw();};
      $('#wizard-back').onclick=()=>{state.index=Math.min(state.index,fields.length-1);state.summary=false;store();draw();};
      $('#wizard-save').onclick=async()=>{if(saving)return;saving=true;$('#wizard-save').disabled=true;$('#wizard-save').textContent='Mentés…';try{
        const values=Object.fromEntries(accepted.map(f=>[f.id,finalEntry(state.answers[f.id],f.id)]));
        await api(base+'/proposals/'+proposal.id+'/decision',{expected_version:profile.version,decision:'accept',values});
        try{sessionStorage.removeItem(key);}catch{}dialog.close();dialog.remove();await onSaved();
      }catch(error){if(dialog.isConnected){$('#wizard-error').textContent=error.message;$('#wizard-save').disabled=false;$('#wizard-save').textContent='Mentés újrapróbálása';}}finally{saving=false;}};
    }else{
      const f=fields[state.index],a=state.answers[f.id],e=a?.entry||proposal.values[f.id],current=profile.values[f.id];
      $('#wizard-body').innerHTML=`<p class="ghost-wizard-group">${esc(f.group)}</p><h2 id="ghost-question-title" tabindex="-1">${esc(profileQuestionGuides[f.id]?.question||f.label+' — így legyen?')}</h2><p>A javaslatot elfogadhatod, átírhatod vagy kihagyhatod. Az ismeretlen adat maradhat üres.</p>${current?`<details><summary>Jelenleg elfogadott érték</summary><p class="ghost-wizard-text">${esc(current.value??'Ismeretlen')}</p></details>`:''}<label>Javasolt válasz${f.type==='scale'?`<input data-answer type="number" min="0" max="${f.max}" step="any" value="${esc(e.value)}" placeholder="Ismeretlen (0–${f.max})">`:`<textarea data-answer rows="5">${esc(e.value)}</textarea>`}</label>${profileQuestionGuides[f.id]?.parts.length?`<details><summary>Főbb kérdések részletesebben</summary><p>A fenti javaslatot itt is kiegészítheted. A kitöltött válaszok a jóváhagyott profilszöveg részei lesznek.</p>${profileQuestionGuides[f.id].parts.map(([id,label])=>`<label>${esc(label)}<textarea data-narrative="${id}" rows="2" maxlength="4000">${esc(a?.narrative?.[id]||'')}</textarea></label>`).join('')}</details>`:''}${f.guidance?`<details><summary>Közös sablon kitöltési útmutatója</summary><p style="white-space:pre-wrap">${esc(f.guidance)}</p></details>`:''}${f.id==='anatomy'?`<details open><summary>Intim anatómia és méretek · opcionális</summary><p>Csak ismert vagy általad megadott adatok. Az üres mezőket nem töltjük ki találgatással.</p>${anatomy.map(([id,label])=>`<label>${label}<input data-anatomy="${id}" maxlength="1000" value="${esc(a?.anatomy?.[id]||'')}" placeholder="Ismeretlen / nincs megadva"></label>`).join('')}</details>`:''}<label>Mit jelent ez a karakternél?<textarea id="wizard-interpretation" maxlength="4000" rows="2">${esc(e.interpretation)}</textarea></label><details><summary>Forrás és tudáshatár · ${esc(names[e.kind]||e.kind)} · ${e.visibility==='public'?'Nyilvános':'Csak szerző'}</summary><label>Állítás típusa<select id="wizard-kind">${Object.entries(names).map(([id,label])=>`<option value="${id}" ${e.kind===id?'selected':''}>${label}</option>`).join('')}</select></label><label>Forrás<input id="wizard-source" maxlength="4000" value="${esc(e.source)}"></label><label>Ki tudhat róla?<select id="wizard-visibility"><option value="creator">Csak szerző</option><option value="public" ${e.visibility==='public'?'selected':''}>Nyilvános világbeli adat</option></select></label></details><div class="ghost-wizard-actions"><button type="button" id="wizard-back" ${state.index===0?'disabled':''}>Vissza</button><button type="button" id="wizard-skip">Kihagyom</button><button type="button" id="wizard-accept" class="primary">${state.index===fields.length-1?'Elfogadom · összefoglaló':'Elfogadom · következő'}</button><button type="button" id="wizard-summary">Összefoglaló</button></div><p class="ghost-wizard-hint">Még nem mentünk profiladatot. Bezárás után ugyanebben a böngészőlapban folytathatod.</p>`;
      const advance=accept=>{const invalid=dialog.querySelector(':invalid');if(invalid){invalid.reportValidity();return;}capture();state.answers[f.id].accept=accept;if(state.index+1===fields.length)state.summary=true;else state.index++;store();draw();};
      $('#wizard-accept').onclick=()=>advance(true);$('#wizard-skip').onclick=()=>{capture();state.answers[f.id].accept=false;if(state.index+1===fields.length)state.summary=true;else state.index++;store();draw();};
      $('#wizard-back').onclick=()=>{capture();state.index--;store();draw();};$('#wizard-summary').onclick=()=>{capture();state.summary=true;store();draw();};
      $('#wizard-body').oninput=()=>capture();$('#wizard-body').onchange=()=>capture();
    }
    $('#ghost-question-title')?.focus();dialog.scrollTop=0;
  }
  dialog.showModal();draw();return dialog;
}
