// Szereplőgyár (2026-11-14): one form for a new character; the open orders that Grok (profile) and
// ChatGPT (avatars, gallery) work through, with each step's state. Server: app/character-orders.mjs.
import {t} from './i18n.js';

const GROK_PROMPT='Use the Living Universe connector. Call list_character_orders with for:"grok" and write the profile of every listed order exactly as it says: the complete Szellemprofil with propose_ghost_profile, every field in real Hungarian text, adult males only (a non-human or fantasy being is fine if he is male). Only the profile is yours: avatars and gallery pictures are made by ChatGPT, so never start them and do not say you will continue with them. Do not stop between orders. Reply to me in Hungarian, short.';
const CHATGPT_PROMPT='Use the Living Universe connector. Call list_character_orders with for:"chatgpt" and work through every listed order exactly as it says (avatars with the figure jobs, gallery pictures with save_order_picture, attaching the picture you generated). The profile is Grok\'s: never write it; an order whose profile is not done yet waits. Remake what failed the face check. If the generator declines, record it and move on; never reword around a refusal. Do not stop between orders. Reply to me in Hungarian, short.';

// Gallery scenes (server: GALLERY_SCENES in app/character-orders.mjs); content per picture or scene.
const SCENES=[['portrait','solo'],['waist_up','solo'],['selfie','solo'],['own_place','solo'],['morning','solo'],['evening','solo'],['work_hobby','solo'],
  ['meeting','palor'],['coffee','palor'],['walk','palor'],['shared_selfie','palor'],['activity','palor']].map(([key,set])=>({key,set}));
const CONTENTS=['non_intimate','nudity','sexual_activity'];

export function installCharacterFactoryUI({$,$$,esc,api,toast,heading,openProfile}){
  let host=null,files=[],notes=[],levels=[],busy=false;
  const contentSelect=(name,what)=>`<select name="${esc(name)}" aria-label="${esc(t('cf.contentOf',{name:what}))}">${CONTENTS.map(v=>`<option value="${v}">${esc(t('cf.content.'+v))}</option>`).join('')}</select>`;
  const chip=(state,text)=>`<span class="cf-chip cf-${esc(state)}">${esc(text)}</span>`;
  const stateText=s=>t('cf.state.'+s);
  function card(o){
    const p=o.profile,a=o.avatars,g=o.gallery;
    const gaps=(p.missing_fields?.length||0)+(p.weak_fields?.length||0),redo=a.missing.filter(m=>m.redo).length;
    return `<article class="cf-order cf-order-${esc(o.status)}"><header><b>${esc(o.name)}</b> <small class="muted">${esc(new Date(o.created_at).toLocaleString('hu-HU'))} · ${esc(t('cf.status.'+o.status))}</small></header>
      ${o.description?`<p class="cf-desc">${esc(o.description)}</p>`:''}
      <div class="cf-steps">
        ${p.state==='skipped'?'':chip(p.state,t('cf.profile')+': '+stateText(p.state)+(gaps&&p.state!=='done'?' · '+t('cf.gaps',{count:gaps}):''))}
        ${a.state==='skipped'?'':chip(a.state,t('cf.avatars')+': '+a.have+'/'+a.want+(redo?' · '+t('cf.redo',{count:redo}):'')+(a.state==='waiting'?' · '+stateText('waiting'):''))}
        ${g.state==='skipped'?'':chip(g.state,t('cf.gallery')+': '+g.have+'/'+g.want+(g.refused?' · '+t('cf.refused',{count:g.refused}):'')+(g.blocked?' · '+t('cf.blocked',{count:g.blocked}):'')+(g.state==='waiting'?' · '+stateText('waiting'):''))}
      </div>
      ${g.rejected?.length?`<details class="cf-more"><summary>${t('cf.rejected',{count:g.rejected.length})}</summary><ul>${g.rejected.map(r=>`<li><small>${esc(r.reason||'')}</small></li>`).join('')}</ul></details>`:''}
      ${redo?`<details class="cf-more"><summary>${t('cf.redoList')}</summary><ul>${a.missing.filter(m=>m.redo).map(m=>`<li><small>${esc(m.expression)} · ${esc(t('cf.outfit.'+m.outfit))}: ${esc(m.reason||'')}</small></li>`).join('')}</ul></details>`:''}
      <div class="we-row"><button class="subtle" data-cf-open="${esc(o.character_id)}">${t('cf.openProfile')}</button>${o.status==='open'?`<button class="subtle" data-cf-cancel="${esc(o.order_id)}">${t('cf.cancel')}</button>`:''}</div></article>`;
  }
  async function paint(){
    if(!host)return;
    const r=await api('/api/character-orders');
    const open=r.orders.filter(o=>o.status==='open'),done=r.orders.filter(o=>o.status!=='open');
    host.innerHTML=heading(t('cf.kicker'),t('cf.title'),t('cf.lead'),'')+`
      <section class="cf-form-wrap"><form id="cf-form" class="cf-form">
        <label>${t('cf.name')}<input name="name" maxlength="80" required autocomplete="off"></label>
        <label>${t('cf.description')}<textarea name="description" rows="5" maxlength="4000" placeholder="${esc(t('cf.descriptionHint'))}"></textarea></label>
        <label class="cf-drop">${t('cf.pictures')}<input type="file" id="cf-files" accept="image/png,image/jpeg,image/webp" multiple></label>
        <div id="cf-thumbs" class="cf-thumbs"></div>
        <p class="muted"><small>${esc(t('cf.sourceNaming'))}</small></p>
        <fieldset class="cf-wants"><legend>${t('cf.wants')}</legend>
          <label><input type="checkbox" name="profile" checked> ${t('cf.wantProfile')}</label>
          <label><input type="checkbox" name="avatars" checked> ${t('cf.wantAvatars')}</label>
          ${['solo','palor'].map(set=>`<label><input type="checkbox" name="set_${set}" data-cf-set="${set}"> ${t('cf.set.'+set)}</label>
          <div class="cf-scenes" data-cf-scenes="${set}" hidden>${SCENES.filter(s=>s.set===set).map(s=>`<label class="cf-scene"><span>${esc(t('cf.scene.'+s.key))}</span>${contentSelect('scene_'+s.key,t('cf.scene.'+s.key))}</label>`).join('')}</div>`).join('')}
          <p class="muted"><small>${esc(t('cf.scenesHint'))}</small></p>
        </fieldset>
        <p class="muted"><small>${esc(t('cf.rules'))}</small></p>
        <div class="we-row"><button class="primary" type="submit">${t('cf.create')}</button><span id="cf-status" role="status" class="muted"></span></div>
      </form></section>
      <section class="cf-howto"><h3>${t('cf.howTitle')}</h3><p class="muted">${esc(t('cf.howLead'))}</p>
        <div class="we-row"><button class="subtle" data-cf-copy="grok">📋 ${t('cf.copyGrok')}</button><button class="subtle" data-cf-copy="chatgpt">📋 ${t('cf.copyChatgpt')}</button></div>
        <p class="muted"><small>${esc(t(r.face_check==='local'?'cf.faceLocal':'cf.faceMissing'))}</small></p></section>
      <section><h3>${t('cf.openOrders',{count:open.length})}</h3>${open.map(card).join('')||`<p class="muted">${t('cf.noOrders')}</p>`}</section>
      ${done.length?`<details class="cf-more"><summary>${t('cf.closedOrders',{count:done.length})}</summary>${done.map(card).join('')}</details>`:''}`;
    bind();
  }
  function showThumbs(){
    const box=$('#cf-thumbs');if(!box)return;
    for(const img of box.querySelectorAll('img'))URL.revokeObjectURL(img.src);
    box.innerHTML='';
    // Each picture gets a short note; the server stores it with the picture and tags it from known words.
    files.forEach((f,i)=>{const fig=document.createElement('figure'),img=document.createElement('img'),note=document.createElement('input');
      img.src=URL.createObjectURL(f);img.alt=f.name;img.title=f.name;
      note.type='text';note.maxLength=200;note.placeholder=t('cf.noteHint');note.setAttribute('aria-label',t('cf.noteLabel',{name:f.name}));note.dataset.cfNote=i;note.value=notes[i]||'';
      note.oninput=()=>{notes[i]=note.value;};
      const holder=document.createElement('div');holder.innerHTML=contentSelect('content_'+i,f.name);const sel=holder.firstElementChild;
      sel.value=levels[i]||'non_intimate';sel.onchange=()=>{levels[i]=sel.value;};
      fig.append(img,note,sel);box.append(fig);});
    const mb=files.reduce((s,f)=>s+f.size,0)/1048576;
    $('#cf-status').textContent=files.length?t('cf.selected',{count:files.length,mb:mb.toFixed(1)}):'';
  }
  const asDataUrl=f=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>bad(r.error);r.readAsDataURL(f);});
  function bind(){
    const input=$('#cf-files');
    if(input)input.onchange=()=>{files=[...input.files].slice(0,12);notes=[];levels=[];showThumbs();};
    for(const c of $$('[data-cf-set]',host))c.onchange=()=>{const box=host.querySelector(`[data-cf-scenes="${c.dataset.cfSet}"]`);if(box)box.hidden=!c.checked;};
    const form=$('#cf-form');
    if(form)form.onsubmit=async e=>{e.preventDefault();if(busy)return;
      if(!files.length){toast(t('cf.needPictures'),true);return;}
      if(files.reduce((s,f)=>s+f.size,0)>36*1048576){toast(t('cf.tooLarge'),true);return;}
      busy=true;$('#cf-status').textContent=t('cf.creating');const el=form.elements;
      try{
        const pictures=[];for(const [i,f] of files.entries())pictures.push({name:f.name,data_url:await asDataUrl(f),note:(notes[i]||'').trim(),content:levels[i]||'non_intimate'});
        const scene_content=Object.fromEntries(SCENES.map(s=>[s.key,el['scene_'+s.key].value]));
        const o=await api('/api/character-orders',{name:el.name.value,description:el.description.value,pictures,profile:el.profile.checked,avatars:el.avatars.checked,solo_set:el.set_solo.checked,with_palor:el.set_palor.checked,scene_content});
        files=[];notes=[];levels=[];toast(t('cf.created',{name:o.name}));await paint();
      }catch(err){$('#cf-status').textContent='';toast(err.message,true);}finally{busy=false;}
    };
    for(const b of $$('[data-cf-copy]',host))b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.cfCopy==='grok'?GROK_PROMPT:CHATGPT_PROMPT);toast(t('cf.copied'));}catch{toast(t('cf.copyFailed'),true);}};
    for(const b of $$('[data-cf-open]',host))b.onclick=()=>openProfile(b.dataset.cfOpen);
    for(const b of $$('[data-cf-cancel]',host))b.onclick=async()=>{if(!confirm(t('cf.cancelConfirm')))return;try{await api('/api/character-orders/'+b.dataset.cfCancel+'/cancel',{});await paint();}catch(e){toast(e.message,true);}};
  }
  // A small status line on the character's profile while his order is open.
  async function profileStatus(cid,before){
    if(!before)return;
    let r;try{r=await api('/api/character-orders');}catch{return;}
    const o=r.orders.find(x=>x.character_id===cid&&x.status==='open');if(!o||!before.isConnected)return;
    const line=document.createElement('p');line.className='cf-profile-line';
    const parts=[];if(o.profile.state!=='skipped')parts.push(t('cf.profile')+' '+(o.profile.state==='done'?'✓':stateText(o.profile.state)));
    if(o.avatars.state!=='skipped')parts.push(t('cf.avatars')+' '+o.avatars.have+'/'+o.avatars.want);
    if(o.gallery.state!=='skipped')parts.push(t('cf.gallery')+' '+o.gallery.have+'/'+o.gallery.want);
    line.textContent='✦ '+t('cf.title')+': '+parts.join(' · ');before.before(line);
  }
  return {render:async el=>{host=el;files=[];notes=[];levels=[];await paint();},leave:()=>{host=null;},profileStatus};
}
