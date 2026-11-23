import {confirmBox,undoWindow} from './interactions.js';
import {anatomyGenerationGuide} from './profile-appearance-guide.js';
import {normalizeGhostValues,MANUAL_SOURCE} from './ghost-import.js';
import {t} from './i18n.js';
import {createProfileAutosave} from './profile-autosave.js';
// One open group is remembered per browser; profiles start in reading mode.
const DEFAULT_OPEN_GROUPS=new Set(['Alapok']);
const INTIMATE_GROUPS=new Set(['Intimitás','Szexuális preferenciák']);
const OPEN_KEY='lu-profile-open-group-v2';
function openGroups(){try{const v=JSON.parse(localStorage.getItem(OPEN_KEY)||'null');return Array.isArray(v)?new Set(v):null;}catch{return null;}}
function rememberOpen(group,open){try{localStorage.setItem(OPEN_KEY,JSON.stringify(open?[group]:[]));}catch{}}
// The approved value wins; a field that maps to an older profile column shows that text until approved.
export function shownValue(f,g){const e=g.values[f.id];if(e)return e.value??'';return f.source?(g.legacy?.[f.source]??''):'';}
const overviewExcerpt=(value,max=260)=>{const text=String(value??'').replace(/\s+/g,' ').trim();if(text.length<=max)return text;const cut=text.slice(0,max);return cut.slice(0,cut.lastIndexOf(' ')>max*.6?cut.lastIndexOf(' '):max)+'…';};
export function buildProfileOverview(c,g){
  const sections=[...new Set(g.template.fields.map(f=>f.group))].map(group=>({title:group,entries:[]}));
  for(const f of g.template.fields){
    const approved=g.values[f.id],legacy=!approved&&f.source?g.legacy?.[f.source]:null;
    const value=approved?.value??legacy;
    if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
    const section=sections.find(section=>section.title===f.group);
    const fullText=f.type==='scale'?`${value}/${f.max}${approved?.interpretation?' · '+approved.interpretation:''}`:String(value);
    section.entries.push({id:f.id,label:f.label,text:overviewExcerpt(fullText),fullText,kind:approved?.kind||'legacy',visibility:approved?.visibility||'creator',source:approved?.source||''});
  }
  if(c.canon?.appearance){const appearance=sections.find(s=>s.title==='Megjelenés');appearance?.entries.unshift({id:'__canon',label:t('pf.visualCanon'),text:overviewExcerpt(c.canon.appearance),fullText:c.canon.appearance,kind:'canon',visibility:'creator',source:c.canon.reason||''});}
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
  if(g.template.character_policy?.reject_female_characters){
    const gender=String(g.values.gender?.value??'').replace(/\[[^\]]*\]/g,'').trim();
    // Owner decision 2026-11-10: a missing gender counts as male; only a female value is refused.
    // Same rule as the server (character-policy.mjs, owner 2026-11-14): male markers (férfi, hím,
    // penis/testicles wording) always pass; otherwise only female words are refused, unknown counts male.
    const maleGender=/^(?:férfi|male|man|nem-bináris|nonbinary|non-binary|hím|hímnemű)(?:$|[^\p{L}])/iu.test(gender)||/(?:^|[^\p{L}])(?:férfi|male|hím|hímnemű|pénisz\p{L}*|hímvessző\p{L}*|herék|heréi|heréje|herezacskó\p{L}*|penis|testicles?)(?:$|[^\p{L}])/iu.test(gender);
    if(gender&&!maleGender&&/(?:^|[^\p{L}])(?:nő|női|nőként|female|woman|women|girl|feminine)(?:$|[^\p{L}])/iu.test(gender))throw Error(g.template.character_policy.instructions);
  }
  const supplement=structuredClone(anatomyGenerationGuide);
  for(const f of g.template.fields)if(supplement.fields[f.id]&&f.guidance)supplement.fields[f.id].template_guidance=f.guidance;
  return {
    generation_package_version:2,
    ...(g.template.character_policy?{character_policy:g.template.character_policy}:{}),
    appearance_supplement:supplement,
    instructions:(g.template.character_policy?.instructions?g.template.character_policy.instructions+'\n\n':'')+'Készíts teljes, koherens fiktív karakterprofil-javaslatot a közös Szellemprofil alapján. Ne csak belső folyamatokat vagy számszerű skálákat adj: kötelezően térj ki a háttértörténetre (identity), személyiségre (personality), szexualitásra (sexuality), kommunikációra (speech) és megjelenésre (appearance_summary). Ezekben írj olvasható, összefüggő profiljavaslatot; az alkérdésekre is adj javaslatot, ahol releváns. A meglévő profileszövegekből és elfogadott értékekből indulj ki, őrizd meg a konkrét részleteket. Új, koherens fiktív kiegészítést javasolhatsz hypothesis jelöléssel; meglévő tényt ne írj felül és forrást ne találj ki. A „'+MANUAL_SOURCE+'” forrású értékek a tulajdonos döntései: felülírnak minden korábbi AI-következtetést, előzményt és emléket; ezekkel ellentétes korábbi állításra soha ne hivatkozz, és ne javasolj helyettük mást. Ha nem javasolsz új részletet, az ismeretlen maradjon üres/null. A forrás külön jelezze a meglévő adatot és az új AI-javaslatot. A karakter benyomása impression, megerősített adat fact. A technikai eredetet különítsd el az életrajztól. A vágy, vonzalom, önmeghatározás és nyilvánosan mutatott viselkedés eltérhet, de ezt ne sztereotípiából vezesd le. A felnőtt karakter anatómiai adatai csak meglévő adat vagy külön megjelölt, jóváhagyandó javaslat alapján tölthetők. Nem módosítasz profilt vagy vizuális kánont. Válaszod letölthető JSON legyen character_id, model és values kulcsokkal. Minden values-bejegyzésben value, interpretation, kind, source és visibility szerepeljen; új javaslatnál alapértelmezés hypothesis és creator. A fő témákon túl dolgozd fel a sablon további mezőit és az egyéni bővítéseket is. A mezők guidance szövege a közös sablon aktuális útmutatója; ezt vedd elsődlegesnek. A Megjelenés részhez kövesd az appearance_supplement feltételeit, A–D ellenőrzőlistáját és forrásjelölési szabályait. Az anatomy mezőbe A–C, az appearance_detail mezőbe D kerüljön.\n\n'+anatomyGenerationGuide.instructions,
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
export async function mergeGhostProposals({api,base}){
  const plan=await api(base+'/merge/prepare',{});
  const overlaps=plan.fields.filter(f=>f.proposals>1);
  const message=plan.api_calls
    ?`${overlaps.length} mezőhöz több függő javaslat tartozik: ${overlaps.map(f=>f.label).join(', ')}. Csak ezek szövegét küldjük a Groknak (${plan.model}), ${plan.api_calls} API-hívással. Becsült költség a válaszkerettel: $${plan.estimated_usd.toFixed(4)} USD. A legújabb tartalom az alap; az ellentmondó régebbi mezőjavaslat teljesen kimarad.`
    :'Nincs ismétlődő profilmező. A javaslatok helyben egyesülnek, Grok API-hívás és költség nélkül.';
  if(!await confirmBox(message+(plan.skipped_fields?` ${plan.skipped_fields} régi mezőjavaslat kézi módosítás vagy megszűnt sablonmező miatt kimarad.`:'')+' Az eredmény új, jóváhagyásra váró javaslat lesz.',{title:'Profiljavaslatok átfésülése',accept:plan.api_calls?'Küldés Groknak és átfésülés':'Javaslatok egyesítése'}))return null;
  return await api(base+'/merge/execute',{plan_id:plan.plan_id,ack_upload_cost:true});
}
export function installGhostProfile({$,esc,api,action,toast}){
  let profileObserver=null,navObserver=null;
  let activeSave=null;
  const flush=async()=>{await activeSave?.flush();};
  const editingModes=new Map();
  const cleanup=()=>{profileObserver?.disconnect();navObserver?.disconnect();profileObserver=navObserver=null;};
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  // Structured and legacy text are saved atomically. Manual edits retain their chosen
  // assertion kind, while the manual-version marker protects them from older proposals.
  async function render(c,reviewId=null,container=null,opts={}){
    await flush();activeSave?.stop();activeSave=null;
    const host=container||$('#profile-content'),base='/api/characters/'+c.id+'/ghost';let g=await api(base);if(!host?.isConnected)return;
    cleanup();
    const fields=g.template.fields,byId=new Map(fields.map(f=>[f.id,f])),groups=[...new Set(fields.map(f=>f.group))];
    let storedDraft=null;try{storedDraft=JSON.parse(sessionStorage.getItem('lu-ghost-draft:'+c.id)||'null');}catch{}
    const editing=editingModes.has(c.id)?editingModes.get(c.id):!!storedDraft?.raw;
    const metadata=f=>{const entry=g.values[f.id],legacy=!entry&&f.source&&String(g.legacy?.[f.source]??'').trim();return {kind:entry?.kind||(legacy?'legacy':'hypothesis'),source:entry?.source||'',visibility:entry?.visibility||'creator'};};
    const badge=entry=>`<span class="pf-kind-badge pf-kind-${entry.kind}" title="${esc(t('pf.sourceHint',{source:entry.source||t('pf.sourceUnknown')}))}">${t('pf.kind.'+entry.kind)}</span><span class="pf-visibility" title="${esc(t('pf.visibilityHelp'))}">${t('pf.visibility.'+entry.visibility)}</span>`;
    const editMetadata=f=>{const entry=metadata(f),kind=['fact','impression','hypothesis'].includes(entry.kind)?entry.kind:'hypothesis';return `<div class="pf-field-metadata">${badge(entry)}<label>${t('pf.kindLabel')}<select data-kind aria-label="${esc(t('pf.kindFor',{label:f.label}))}">${['fact','impression','hypothesis'].map(value=>`<option value="${value}"${value===kind?' selected':''}>${t('pf.kind.'+value)}</option>`).join('')}</select></label><label>${t('pf.visibilityLabel')}<select data-visibility aria-label="${esc(t('pf.visibilityFor',{label:f.label}))}">${['creator','public'].map(value=>`<option value="${value}"${value===entry.visibility?' selected':''}>${t('pf.visibility.'+value)}</option>`).join('')}</select></label></div>`;};
    const rerender=(id=null)=>opts.onChanged?opts.onChanged(id):render(c,id,host,opts);
    const pending=g.proposals.filter(p=>p.status==='pending'),latest=pending.at(-1);
    const remembered=openGroups(),isOpen=group=>remembered?remembered.has(group):DEFAULT_OPEN_GROUPS.has(group);
    const filled=f=>String(shownValue(f,g)??'').trim()!=='';
    const scaleOptions=(f,v)=>{const known=v!==''&&v!==null&&v!==undefined,label=i=>i===0?i+' · nagyon alacsony':i===f.max?i+' · nagyon magas':i===f.max/2?i+' · közepes':String(i);
      const options=['<option value="">Ismeretlen</option>'];for(let i=0;i<=f.max;i++)options.push(`<option value="${i}" ${known&&Number(v)===i?'selected':''}>${label(i)}</option>`);
      if(known&&!Number.isInteger(Number(v)))options.push(`<option value="${esc(v)}" selected>${esc(v)}</option>`);return options.join('');};
    const groupHtml=(group,i)=>{const list=fields.filter(f=>f.group===group),scales=list.filter(f=>f.type==='scale'),texts=list.filter(f=>f.type!=='scale');
      const markers=list.reduce((n,f)=>n+(String(shownValue(f,g)||'').match(/\(Javaslat\)/gi)||[]).length,0);
      return `<details class="pf-group${INTIMATE_GROUPS.has(group)?' pf-intimate':''}" id="pf-group-${i}" data-group="${esc(group)}" ${editing&&isOpen(group)?'open':''}><summary><span>${esc(group)}</span><small>${list.filter(filled).length}/${list.length}${markers?' · '+esc(t('pf.proposalMarkers',{count:markers})):''}</small></summary>`
        +(scales.length?`<div class="pf-scales">${scales.map(f=>`<div class="pf-scale" data-ghost="${f.id}"><label>${esc(f.label)}<select data-value aria-label="${esc(f.label)}">${scaleOptions(f,shownValue(f,g))}</select></label>${editMetadata(f)}</div>`).join('')}</div>`:'')
        +texts.map(f=>{const value=String(shownValue(f,g)??''),long=value.length>600;return `<div class="pf-field" data-ghost="${f.id}"><label for="pf-${f.id}">${esc(f.label)}</label>${editMetadata(f)}<textarea id="pf-${f.id}" data-value rows="${long?6:1}" ${long?'class="pf-long-collapsed"':''} maxlength="30000" placeholder="—">${esc(value)}</textarea>${long?`<button type="button" class="subtle" data-expand-field="${f.id}" aria-expanded="false">${t('pf.fullText',{count:value.length.toLocaleString('hu-HU')})}</button>`:''}</div>`;}).join('')+'</details>';};
    const overview=buildProfileOverview(c,g),readGroups=groups.map((group,i)=>{const section=overview.find(s=>s.title===group),entries=[...(section?.entries||[])];for(const f of fields.filter(f=>f.group===group))if(!entries.some(e=>e.id===f.id))entries.push({id:f.id,label:f.label,fullText:'',kind:'unknown',visibility:'creator',source:''});const markers=entries.reduce((n,e)=>n+(String(e.fullText||'').match(/\(Javaslat\)/gi)||[]).length,0);
      return `<details class="pf-group pf-read-group" id="pf-read-group-${i}" data-group="${esc(group)}" ${!editing&&isOpen(group)?'open':''}><summary><span>${esc(group)}</span><small>${fields.filter(f=>f.group===group&&filled(f)).length}/${fields.filter(f=>f.group===group).length}${markers?' · '+esc(t('pf.proposalMarkers',{count:markers})):''}</small></summary>${entries.map(entry=>`<article class="pf-overview-entry" data-profile-field="${entry.id}" data-kind-value="${entry.kind}" data-empty="${!entry.fullText}"><h3>${esc(entry.label)}</h3><div class="pf-field-metadata">${badge(entry)}</div><p class="pf-read-text${entry.fullText?.length>600?' pf-long-collapsed':''}">${esc(entry.fullText||t('pf.empty'))}</p>${entry.fullText?.length>600?`<button type="button" class="subtle" data-read-expand aria-expanded="false">${t('pf.fullText',{count:entry.fullText.length.toLocaleString('hu-HU')})}</button>`:''}</article>`).join('')}</details>`;}).join('');
    const pendingHtml=latest?`<div class="pf-pending" role="status"><div class="pf-pending-text"><strong>${pending.length===1?'Profiljavaslat vár elfogadásra':pending.length+' profiljavaslat vár elfogadásra'}</strong><small>${esc(latest.model)} · ${Object.keys(latest.values).length} mező</small></div>${pending.length>1?`<select id="ghost-review-choice" aria-label="Megnyitandó javaslat">${pending.slice().reverse().map(p=>`<option value="${p.id}">${esc(p.model)} · ${Object.keys(p.values).length} mező · ${esc(String(p.at).slice(0,10))}</option>`).join('')}</select>`:''}<div class="pf-pending-actions"><button type="button" id="ghost-latest-review" class="primary">Áttekintés</button><button type="button" id="ghost-accept-all">Mindet elfogadom</button></div></div>`:'';
    const pendingHost=opts.pendingHost?.isConnected?opts.pendingHost:null;
    if(pendingHost)pendingHost.innerHTML=pendingHtml;
    const filledCount=fields.filter(filled).length;
    host.innerHTML=`${pendingHost?'':pendingHtml}<div class="pf-view-controls"><span>${t('pf.completion',{percent:Math.round(filledCount/fields.length*100),filled:filledCount,total:fields.length})}</span><button type="button" id="ghost-edit"${editing?' hidden':''}>${t('common.edit')}</button><button type="button" id="ghost-read"${editing?'':' hidden'}>${t('pf.readMode')}</button><label>${t('pf.filterLabel')}<select id="ghost-filter"><option value="all">${t('pf.filterAll')}</option><option value="hypothesis">${t('pf.filterHypotheses')}</option><option value="empty">${t('pf.filterEmpty')}</option></select></label></div><nav class="pf-nav" aria-label="Profilrészek">${groups.map((group,i)=>`<button type="button" data-jump="${i}" class="${INTIMATE_GROUPS.has(group)?'pf-intimate':''}">${esc(group)}</button>`).join('')}</nav>
<section id="ghost-overview" class="profile-overview"${editing?' hidden':''}>${readGroups}</section><form id="ghost-form" class="pf-form"${editing?'':' hidden'}>${groups.map(groupHtml).join('')}<div class="pf-savebar" hidden><span id="pf-dirty"></span><button type="button" id="pf-discard">Elvetés</button><button class="primary">Mentés</button></div></form>
<details class="panel pf-tools"><summary>AI-eszközök és javaslatok előzménye</summary><div class="actions"><button type="button" id="ghost-legacy">Meglévő szövegek átvételének javaslata</button><button type="button" id="ghost-export">Teljes profilgenerálási csomag letöltése</button><button type="button" id="ghost-empty-template">Üres profilsablon letöltése</button></div><details><summary>AI-javaslat betöltése</summary><label>Modell / forrás<input id="ghost-model" placeholder="Például ChatGPT, Grok vagy szerző"></label><label>JSON-fájl feltöltése<input id="ghost-file" type="file" accept=".json,application/json"></label><p id="ghost-file-status" role="status" aria-live="polite"></p><label>Vagy JSON-szöveg beillesztése<textarea id="ghost-import" rows="8" placeholder='{"values":{…}}'></textarea></label><button type="button" id="ghost-load">Javaslat betöltése</button></details><h3>Javaslatok</h3>${g.proposals.slice().reverse().map(p=>`<details><summary>${esc(p.model)} · ${esc(({pending:'Jóváhagyásra vár',accepted:'Elfogadva',rejected:'Elutasítva',superseded:'Összefésülve új javaslatba'})[p.status]||p.status)} · ${esc(p.at)}</summary><pre class="prose">${esc(JSON.stringify(p.values,null,2))}</pre>${p.status==='pending'?`<button type="button" data-review="${p.id}">Áttekintés kérdésenként</button><button type="button" data-reject="${p.id}">Elutasítás</button>`:''}</details>`).join('')||'<p>Még nincs javaslat.</p>'}<p>Elfogadott verzió: ${g.version}. Korábbi változatok: ${g.history.length}.</p><div class="actions"><button type="button" id="ghost-history">Teljes előzmény letöltése</button><select id="ghost-restore-version" aria-label="Korábbi verzió"><option value="">Korábbi verzió…</option>${g.history.filter(h=>Object.keys(h.values).length).map(h=>`<option value="${h.version}">${h.version}. verzió</option>`).join('')}</select><button type="button" id="ghost-restore">Visszaállítási javaslat</button></div></details>`;
    const form=host.querySelector('#ghost-form'),bar=form.querySelector('.pf-savebar');
    const inputs=[...form.querySelectorAll('[data-value]')];for(const input of form.querySelectorAll('[data-value],[data-kind],[data-visibility]'))input.dataset.initial=input.value;
    const changed=()=>inputs.filter(input=>input.value!==input.dataset.initial||[...input.closest('[data-ghost]').querySelectorAll('[data-kind],[data-visibility]')].some(meta=>meta.value!==meta.dataset.initial));
    const collect=()=>Object.fromEntries(changed().map(input=>{const f=byId.get(input.closest('[data-ghost]').dataset.ghost),raw=input.value;
      const field=input.closest('[data-ghost]');return [f.id,{value:f.type==='scale'?(raw===''?null:Number(raw)):raw,interpretation:g.values[f.id]?.interpretation||'',kind:field.querySelector('[data-kind]').value,source:MANUAL_SOURCE,visibility:field.querySelector('[data-visibility]').value}];}));
    const draftKey='lu-ghost-draft:'+c.id;
    const clearDraft=()=>{try{sessionStorage.removeItem(draftKey);}catch{}};
    let saveState='idle',saveError=null,lastAttempt=null,formAutosave=null;const conflicts=new Set(),saveButton=form.querySelector('.pf-savebar button.primary');
    const refreshBar=()=>{const n=changed().length;bar.hidden=!editing;form.querySelector('#pf-dirty').textContent=saveError?saveError.message:saveState==='saving'?t('pf.saving'):n?t('pf.pending',{count:n}):t(saveState==='saved'?'pf.saved':'pf.autoSave');saveButton.disabled=saveState==='saving'||(!n&&!saveError);saveButton.textContent=saveError?t('pf.checkState'):t('pf.saveNow');};
    if(storedDraft?.raw)for(const input of inputs){const row=input.closest('[data-ghost]'),id=row.dataset.ghost;if(Object.hasOwn(storedDraft.raw,id)){input.value=storedDraft.raw[id];if(storedDraft.metadata?.[id])for(const [key,selector] of [['kind','[data-kind]'],['visibility','[data-visibility]']]){const meta=row.querySelector(selector);if(storedDraft.metadata[id][key])meta.value=storedDraft.metadata[id][key];}if(editing)input.closest('details').open=true;}}
    const storeDraft=()=>{const dirty=changed();if(!dirty.length){clearDraft();return;}try{sessionStorage.setItem(draftKey,JSON.stringify({version:g.version,raw:Object.fromEntries(dirty.map(input=>[input.closest('[data-ghost]').dataset.ghost,input.value])),metadata:Object.fromEntries(dirty.map(input=>{const row=input.closest('[data-ghost]');return [row.dataset.ghost,{kind:row.querySelector('[data-kind]').value,visibility:row.querySelector('[data-visibility]').value}];}))}));}catch{}};
    refreshBar();
    form.oninput=form.onchange=e=>{refreshBar();storeDraft();if(!e?.isComposing)formAutosave?.schedule();};
    const activeRoot=editing?form:host.querySelector('#ghost-overview'),sections=[...activeRoot.querySelectorAll('.pf-group')],nav=host.querySelector('.pf-nav'),buttons=[...host.querySelectorAll('[data-jump]')];
    const highlight=section=>{for(const button of buttons){const selected=section===sections[Number(button.dataset.jump)];button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}};
    for(const section of sections)section.ontoggle=()=>{if(section.open){for(const other of sections)if(other!==section&&other.open)other.open=false;rememberOpen(section.dataset.group,true);highlight(section);}};
    for(const button of buttons)button.onclick=()=>{const section=sections[Number(button.dataset.jump)];for(const other of sections)other.open=other===section;highlight(section);rememberOpen(section.dataset.group,true);section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};
    const sizeNav=()=>{const bar=document.querySelector('.topbar'),top=bar&&['sticky','fixed'].includes(getComputedStyle(bar).position)?bar.getBoundingClientRect().height:0;nav.style.top=top+8+'px';host.style.setProperty('--pf-nav-height',Math.ceil(nav.getBoundingClientRect().height)+top+16+'px');};sizeNav();
    if(typeof ResizeObserver!=='undefined'){navObserver=new ResizeObserver(sizeNav);navObserver.observe(nav);}
    if(typeof IntersectionObserver!=='undefined'){profileObserver=new IntersectionObserver(()=>{if(!host.isConnected){cleanup();return;}const visible=sections.filter(section=>{const r=section.getBoundingClientRect();return r.bottom>nav.getBoundingClientRect().bottom&&r.top<innerHeight;});highlight(visible.find(s=>s.open)||visible[0]);},{rootMargin:'-60px 0px -35% 0px'});for(const section of sections)profileObserver.observe(section);}
    highlight(sections.find(section=>section.open));
    const applyFilter=()=>{const filter=host.querySelector('#ghost-filter').value;for(const [i,section] of sections.entries()){
      const rows=[...section.querySelectorAll(editing?'[data-ghost]':'[data-profile-field]')];for(const row of rows){const field=editing?byId.get(row.dataset.ghost):null,value=editing?row.querySelector('[data-value]').value:row.dataset.empty!=='true',kind=editing?row.querySelector('[data-kind]').value:row.dataset.kindValue;row.hidden=filter==='empty'?!!String(value||'').trim():filter==='hypothesis'?kind!=='hypothesis':!editing&&row.dataset.empty==='true';}
      section.hidden=!rows.some(row=>!row.hidden);buttons[i].hidden=section.hidden;
    }if(!sections.some(section=>section.open&&!section.hidden)){const first=sections.find(section=>!section.hidden);for(const section of sections)section.open=section===first;highlight(first);}};
    host.querySelector('#ghost-filter').onchange=applyFilter;applyFilter();
    for(const button of host.querySelectorAll('[data-read-expand]'))button.onclick=()=>{const text=button.closest('.pf-overview-entry').querySelector('.pf-read-text'),expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));text.classList.toggle('pf-long-collapsed',!expanded);button.textContent=expanded?t('pf.collapseText'):t('pf.fullText',{count:text.textContent.length.toLocaleString('hu-HU')});};
    host.querySelector('#ghost-edit').onclick=action(async()=>{editingModes.set(c.id,true);await rerender();});host.querySelector('#ghost-read').onclick=action(async()=>{editingModes.set(c.id,false);await rerender();});
    for(const button of host.querySelectorAll('[data-expand-field]'))button.onclick=()=>{const input=form.querySelector('#pf-'+button.dataset.expandField),expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));input.classList.toggle('pf-long-collapsed',!expanded);button.textContent=expanded?t('pf.collapseText'):t('pf.fullText',{count:input.value.length.toLocaleString('hu-HU')});};
    const takeBaseline=(input,value,kind,visibility)=>{const row=input.closest('[data-ghost]');input.dataset.initial=value;row.querySelector('[data-kind]').dataset.initial=kind;row.querySelector('[data-visibility]').dataset.initial=visibility;};
    const refreshMetadata=()=>{for(const input of inputs){const row=input.closest('[data-ghost]'),entry=metadata(byId.get(row.dataset.ghost)),kind=row.querySelector('.pf-kind-badge');kind.className='pf-kind-badge pf-kind-'+entry.kind;kind.textContent=t('pf.kind.'+entry.kind);kind.title=t('pf.sourceHint',{source:entry.source||t('pf.sourceUnknown')});row.querySelector('.pf-visibility').textContent=t('pf.visibility.'+entry.visibility);}
      const count=fields.filter(filled).length;host.querySelector('.pf-view-controls>span').textContent=t('pf.completion',{percent:Math.round(count/fields.length*100),filled:count,total:fields.length});
      for(const section of form.querySelectorAll('.pf-group')){const list=fields.filter(field=>field.group===section.dataset.group),markers=list.reduce((n,field)=>n+(String(shownValue(field,g)||'').match(/\(Javaslat\)/gi)||[]).length,0),small=section.querySelector('summary>small');if(small)small.textContent=list.filter(filled).length+'/'+list.length+(markers?' · '+t('pf.proposalMarkers',{count:markers}):'');}
    };
    const reconcile=fresh=>{
      const dirty=new Set(changed().map(input=>input.closest('[data-ghost]').dataset.ghost)),previous=new Set(conflicts);g=fresh;
      for(const input of inputs){const row=input.closest('[data-ghost]'),id=row.dataset.ghost,meta=metadata(byId.get(id)),kind=['fact','impression','hypothesis'].includes(meta.kind)?meta.kind:'hypothesis',visibility=meta.visibility,value=String(shownValue(byId.get(id),g)??''),kindInput=row.querySelector('[data-kind]'),visibilityInput=row.querySelector('[data-visibility]');
        const remoteChanged=input.dataset.initial!==value||kindInput.dataset.initial!==kind||visibilityInput.dataset.initial!==visibility,same=input.value===value&&kindInput.value===kind&&visibilityInput.value===visibility,sent=lastAttempt?.values?.[id],confirmed=sent&&sent.value===g.values[id]?.value&&sent.kind===kind&&sent.visibility===visibility;
        row.querySelector('.pf-remote-conflict')?.remove();conflicts.delete(id);
        if(!dirty.has(id)){input.value=value;kindInput.value=kind;visibilityInput.value=visibility;}
        else if(!same&&!confirmed&&(remoteChanged||previous.has(id))){conflicts.add(id);const note=document.createElement('div');note.className='pf-remote-conflict';note.innerHTML=`<p>${esc(t('pf.remoteValue',{value:value.slice(0,500)}))}</p><button type="button" data-use-remote>${t('pf.useRemote')}</button><button type="button" data-keep-local>${t('pf.keepLocal')}</button>`;row.appendChild(note);
          const resolve=remote=>{if(remote){input.value=value;kindInput.value=kind;visibilityInput.value=visibility;}conflicts.delete(id);note.remove();if(!conflicts.size){formAutosave.resume();saveError=null;}storeDraft();refreshBar();};note.querySelector('[data-use-remote]').onclick=()=>resolve(true);note.querySelector('[data-keep-local]').onclick=()=>resolve(false);
        }
        takeBaseline(input,value,kind,visibility);
      }
      refreshMetadata();if(conflicts.size)formAutosave.pause(Error(t('pf.conflictReview')));else formAutosave.resume();storeDraft();refreshBar();
    };
    formAutosave=createProfileAutosave({snapshot:()=>{const values=collect();return Object.keys(values).length?{expected_version:g.version,template_version:g.template.version,values,expected_legacy:Object.fromEntries(Object.keys(values).map(id=>byId.get(id).source).filter(Boolean).map(field=>[field,g.legacy[field]||'']))}:null;},write:body=>api(base+'/manual',body),
      onSaved:(fresh,sent)=>{g=fresh;for(const id of Object.keys(sent.values)){const input=inputs.find(input=>input.closest('[data-ghost]').dataset.ghost===id);takeBaseline(input,String(shownValue(byId.get(id),g)??''),g.values[id].kind,g.values[id].visibility);}refreshMetadata();storeDraft();},
      onError:(error,sent)=>{lastAttempt=sent;storeDraft();},onStatus:(state,error)=>{saveState=state;saveError=error||null;refreshBar();}});activeSave=formAutosave;
    if(storedDraft?.raw&&storedDraft.version!==g.version){for(const input of changed())conflicts.add(input.closest('[data-ghost]').dataset.ghost);reconcile(g);}
    form.querySelector('#pf-discard').onclick=action(async()=>{await formAutosave.settle().catch(()=>{});formAutosave.cancel();if(formAutosave.error)reconcile(await api(base));for(const input of form.querySelectorAll('[data-value],[data-kind],[data-visibility]'))input.value=input.dataset.initial;for(const note of form.querySelectorAll('.pf-remote-conflict'))note.remove();conflicts.clear();formAutosave.resume();clearDraft();refreshBar();});
    const proposal=async(values,model='Szerzői szerkesztés')=>{await flush();return api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model,values});};
    form.onsubmit=action(async e=>{e.preventDefault();if(formAutosave.error){reconcile(await api(base));return;}await formAutosave.flush();});
    $('#ghost-legacy').onclick=action(async()=>{await api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:'Helyi szövegátvétel · AI-hívás nélkül',from_legacy:true});await rerender();});
    $('#ghost-export').onclick=()=>download('teljes-profilgeneralasi-csomag.json',buildProfileGenerationPackage(c,g));
    $('#ghost-restore').onclick=action(async()=>{const value=$('#ghost-restore-version').value,h=g.history.find(h=>String(h.version)===value);if(!h)throw Error('Válassz korábbi, kitöltött verziót.');const values={...h.values};for(const id of Object.keys(g.values))if(!Object.hasOwn(values,id)){const f=byId.get(id);values[id]={value:f.type==='scale'?null:'',interpretation:'Visszaállításkor ismeretlenre állítva.',kind:'hypothesis',source:'Korábbi verzió visszaállítása',visibility:'creator'};}await proposal(values);await rerender();});
    $('#ghost-history').onclick=()=>download('szellemprofil-elozmeny.json',g);
    $('#ghost-load').onclick=action(async()=>{const input=parseGhostImport($('#ghost-import').value,c.id);const saved=await api(base+'/proposals',{expected_version:g.version,template_version:g.template.version,profile_version:g.profile_version,model:$('#ghost-model').value.trim()||input.model||'AI-javaslat (modell nincs megadva)',values:input.values});toast('A javaslat betöltve: '+Object.keys(saved.values).length+' mező vár az ellenőrzésedre.');await rerender(saved.id);});
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
    $('#ghost-empty-template').onclick=()=>download('ures-karakterprofil-sablon.json',{character_id:c.id,template_version:g.template.version,template:g.template,model:'',values:Object.fromEntries(fields.map(f=>[f.id,{value:f.type==='scale'?null:'',interpretation:'',kind:'hypothesis',source:'',visibility:'creator'}]))});
    for(const b of document.querySelectorAll('[data-reject]'))b.onclick=action(async()=>{await api(base+'/proposals/'+b.dataset.reject+'/decision',{decision:'reject'});await rerender();});
    function review(p){openGhostWizard({character:c,proposal:p,profile:g,esc,api,base,onSaved:async(result={})=>{clearDraft();toast(result.decision==='merged'?'Az összefésült javaslat elbírálásra vár.':result.decision==='rejected'?'A javaslat elutasítva.':'A profiljavaslat frissült.');await rerender(result.proposal_id||null);}});}
    for(const b of document.querySelectorAll('[data-review]'))b.onclick=()=>review(g.proposals.find(p=>p.id===b.dataset.review));
    const reviewButton=$('#ghost-latest-review'),acceptAllButton=$('#ghost-accept-all');
    if(latest&&reviewButton&&acceptAllButton){
      if(pending.length>1){
        acceptAllButton.insertAdjacentHTML('beforebegin','<button type="button" id="ghost-merge">Profiljavaslatok átfésülése</button>');
        $('#ghost-merge').onclick=action(async e=>{const button=e.currentTarget;button.disabled=true;try{await flush();const result=await mergeGhostProposals({api,base});if(result){toast('Az összefésült javaslat elbírálásra vár.');await rerender(result.proposal.id);}}finally{button.disabled=false;}});
      }
      reviewButton.onclick=()=>review(pending.find(p=>p.id===($('#ghost-review-choice')?.value||latest.id)));
      acceptAllButton.onclick=action(async e=>{if(!await confirmBox(t('modal.ghostAcceptAll')))return;if(!await undoWindow(t('modal.acceptAll'),{key:'accept-profile-proposals'}))return;e.target.disabled=true;const r=await api(base+'/accept-all',{});toast(r.accepted+' javaslat elfogadva.'+(r.skipped_fields?' '+r.skipped_fields+' mező kimaradt.':''));await rerender();});
    }
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
  return {render,renderTemplate,cleanup,flush};
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
  async function rejectProposal(){
    if(saving)return;saving=true;
    const buttons=[...dialog.querySelectorAll('#wizard-reject, #wizard-reject-bottom')];
    for(const button of buttons){button.disabled=true;button.textContent='Elutasítás…';}
    try{
      await api(base+'/proposals/'+proposal.id+'/decision',{decision:'reject'});
      try{sessionStorage.removeItem(key);}catch{}
      dialog.close();dialog.remove();await onSaved({decision:'rejected'});
    }catch(error){if(dialog.isConnected){$('#wizard-error').textContent=error.message;for(const button of buttons){button.disabled=false;button.textContent=button.id==='wizard-reject'?'Teljes javaslat elutasítása':'Elutasítom';}}}finally{saving=false;}
  }
  dialog.oncancel=e=>{e.preventDefault();pause();};
  function draw(){
    const reviewed=Object.values(state.answers).filter(a=>typeof a.accept==='boolean').length;
    const accepted=fields.filter(f=>state.answers[f.id]?.accept===true);
    const stale=proposal.base_version!==profile.version||proposal.template_version!==profile.template.version||proposal.profile_version!==profile.profile_version;
    dialog.innerHTML=`<div class="ghost-wizard-top actions"><span>${esc(character.name)} · profiljavaslat</span><button type="button" id="wizard-close" aria-label="Bezárás és folytatás később">Bezárás</button></div><p class="ghost-wizard-progress">${state.summary?'Összefoglaló':`${state.index+1}. kérdés / ${fields.length}`} · ${reviewed} átnézve</p><progress max="${fields.length}" value="${reviewed}" aria-label="Átnézett kérdések"></progress><div id="wizard-body"></div><p id="wizard-error" role="alert"></p>`;
    $('#wizard-close').onclick=pause;
    $('#wizard-close').insertAdjacentHTML('beforebegin','<button type="button" id="wizard-reject">Teljes javaslat elutasítása</button>');
    $('#wizard-reject').onclick=rejectProposal;
    // An old proposal (made on an earlier profile or template) cannot be applied as it is, but it
    // can be carried over: the same values become a new proposal on the current profile, to be
    // reviewed field by field again; the old one is closed and kept in the history. Fields the
    // current template no longer has are left out (and named).
    if(stale){
      const known=new Set(profile.template.fields.map(f=>f.id)),manual=id=>(profile.manual?.[id]??-1)>(proposal.base_version??-1),carry=Object.fromEntries(Object.entries(proposal.values||{}).filter(([id])=>known.has(id)&&!manual(id))),dropped=Object.keys(proposal.values||{}).filter(id=>!known.has(id)||manual(id));
      $('#wizard-body').innerHTML=`<h2 id="ghost-question-title" tabindex="-1">A javaslat alapadatai megváltoztak</h2><p>Ez a javaslat ${esc(String(proposal.at||'').slice(0,10))}-n készült, azóta a profil vagy a sablon módosult, ezért így nem menthető.</p>
        <p>${Object.keys(carry).length?`Átvihetem a ${Object.keys(carry).length} javasolt mezőt egy friss javaslatba az aktuális profil alapján; ott mezőnként újra átnézheted. A régi javaslat lezárva megmarad az előzmények között.`:'A javaslat egyik mezője sincs már a sablonban, ezért nincs mit átvinni.'}${dropped.length?` A sablonból azóta kikerült mezők: ${esc(dropped.join(', '))}.`:''}</p>
        <div class="ghost-wizard-actions">${Object.keys(carry).length?'<button type="button" id="wizard-rebase" class="primary">Átvitel friss javaslatba</button>':''}<button type="button" id="wizard-retire">Elavult javaslat lezárása</button></div>`;
      const retire=async()=>{await api(base+'/proposals/'+proposal.id+'/decision',{decision:'reject'});};
      if($('#wizard-rebase'))$('#wizard-rebase').onclick=async()=>{if(saving)return;saving=true;try{
        const fresh=await api(base+'/proposals',{expected_version:profile.version,template_version:profile.template.version,profile_version:profile.profile_version,values:carry,model:String(proposal.model||'Javaslat').slice(0,170)+' (átvitt javaslat)'});
        await retire();try{sessionStorage.removeItem(key);}catch{}dialog.close();dialog.remove();await onSaved();
        const current=await api(base);openGhostWizard({character,proposal:current.proposals.find(p=>p.id===fresh.id)||fresh,profile:current,esc,api,base,onSaved});
      }catch(error){$('#wizard-error').textContent=error.message;}finally{saving=false;}};
      $('#wizard-retire').onclick=rejectProposal;
      return;}
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
      $('#wizard-body').innerHTML=`<p class="ghost-wizard-group">${esc(f.group)}</p><h2 id="ghost-question-title" tabindex="-1">${esc(profileQuestionGuides[f.id]?.question||f.label+' — így legyen?')}</h2><p>A javaslatot elfogadhatod, átírhatod vagy kihagyhatod. Az ismeretlen adat maradhat üres.</p>${current?`<details><summary>Jelenleg elfogadott érték</summary><p class="ghost-wizard-text">${esc(current.value??'Ismeretlen')}</p></details>`:''}<label>Javasolt válasz${f.type==='scale'?`<input data-answer type="number" min="0" max="${f.max}" step="any" value="${esc(e.value)}" placeholder="Ismeretlen (0–${f.max})">`:`<textarea data-answer rows="5">${esc(e.value)}</textarea>`}</label>${profileQuestionGuides[f.id]?.parts.length?`<details><summary>Főbb kérdések részletesebben</summary><p>A fenti javaslatot itt is kiegészítheted. A kitöltött válaszok a jóváhagyott profilszöveg részei lesznek.</p>${profileQuestionGuides[f.id].parts.map(([id,label])=>`<label>${esc(label)}<textarea data-narrative="${id}" rows="2" maxlength="4000">${esc(a?.narrative?.[id]||'')}</textarea></label>`).join('')}</details>`:''}${f.guidance?`<details><summary>Közös sablon kitöltési útmutatója</summary><p class="prose">${esc(f.guidance)}</p></details>`:''}${f.id==='anatomy'?`<details open><summary>Intim anatómia és méretek · opcionális</summary><p>Csak ismert vagy általad megadott adatok. Az üres mezőket nem töltjük ki találgatással.</p>${anatomy.map(([id,label])=>`<label>${label}<input data-anatomy="${id}" maxlength="1000" value="${esc(a?.anatomy?.[id]||'')}" placeholder="Ismeretlen / nincs megadva"></label>`).join('')}</details>`:''}<label>Mit jelent ez a karakternél?<textarea id="wizard-interpretation" maxlength="4000" rows="2">${esc(e.interpretation)}</textarea></label><details><summary>Forrás és tudáshatár · ${esc(names[e.kind]||e.kind)} · ${e.visibility==='public'?'Nyilvános':'Csak szerző'}</summary><label>Állítás típusa<select id="wizard-kind">${Object.entries(names).map(([id,label])=>`<option value="${id}" ${e.kind===id?'selected':''}>${label}</option>`).join('')}</select></label><label>Forrás<input id="wizard-source" maxlength="4000" value="${esc(e.source)}"></label><label>Ki tudhat róla?<select id="wizard-visibility"><option value="creator">Csak szerző</option><option value="public" ${e.visibility==='public'?'selected':''}>Nyilvános világbeli adat</option></select></label></details><div class="ghost-wizard-actions"><button type="button" id="wizard-back" ${state.index===0?'disabled':''}>Vissza</button><button type="button" id="wizard-skip">Kihagyom</button><button type="button" id="wizard-accept" class="primary">${state.index===fields.length-1?'Elfogadom · összefoglaló':'Elfogadom · következő'}</button><button type="button" id="wizard-summary">Összefoglaló</button></div><p class="ghost-wizard-hint">Még nem mentünk profiladatot. Bezárás után ugyanebben a böngészőlapban folytathatod.</p>`;
      const advance=accept=>{const invalid=dialog.querySelector(':invalid');if(invalid){invalid.reportValidity();return;}capture();state.answers[f.id].accept=accept;if(state.index+1===fields.length)state.summary=true;else state.index++;store();draw();};
      $('#wizard-accept').onclick=()=>advance(true);$('#wizard-skip').onclick=()=>{capture();state.answers[f.id].accept=false;if(state.index+1===fields.length)state.summary=true;else state.index++;store();draw();};
      $('#wizard-back').onclick=()=>{capture();state.index--;store();draw();};$('#wizard-summary').onclick=()=>{capture();state.summary=true;store();draw();};
      $('#wizard-body').oninput=()=>capture();$('#wizard-body').onchange=()=>capture();
    }
    const rejectAnchor=$('#wizard-skip')||$('#wizard-save');
    rejectAnchor.insertAdjacentHTML('afterend','<button type="button" id="wizard-reject-bottom" title="A teljes profiljavaslat elutasítása">Elutasítom</button>');
    $('#wizard-reject-bottom').onclick=rejectProposal;
    if(profile.proposals.filter(p=>p.status==='pending').length>1){
      $('#wizard-reject-bottom').insertAdjacentHTML('afterend','<button type="button" id="wizard-merge">Profiljavaslatok átfésülése</button>');
      $('#wizard-merge').onclick=async()=>{
        if(saving)return;capture();store();saving=true;const button=$('#wizard-merge');button.disabled=true;button.textContent='Átfésülés…';
        try{const result=await mergeGhostProposals({api,base});if(result){try{sessionStorage.removeItem(key);}catch{}dialog.close();dialog.remove();await onSaved({decision:'merged',proposal_id:result.proposal.id});}}
        catch(error){if(dialog.isConnected)$('#wizard-error').textContent=error.message;}
        finally{saving=false;if(dialog.isConnected){button.disabled=false;button.textContent='Profiljavaslatok átfésülése';}}
      };
    }
    $('#ghost-question-title')?.focus();dialog.scrollTop=0;
  }
  dialog.showModal();draw();return dialog;
}
