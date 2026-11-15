// Picture tools for places, in Alkotói stúdió › Helyszínek (moved out of Play, owner 2026-11-14:
// the play screen is for playing).
//  - "Képek beolvasása": reads the three watched folders the owner or an assistant saves pictures
//    into by hand: place backgrounds (20_SHARED_MEDIA\Helyszín hátterek\<place>), character
//    figures (Szereplő-alakok\<name>) and shared scene pictures of Palor with a character.
//  - "Hiányzó hátterek": the places without a usable backdrop, with a copyable prompt each.
//  - "Háttércsomag (ZIP) betöltése": one ZIP of background pictures sorted by place folders.
import {t,translateServerMessage} from './i18n.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,body){const r=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||r.statusText);return v;}

export async function scanPictures(tell){
  const [r,s,sc]=await Promise.all([api('/api/backgrounds/scan',{}),api('/api/sprites/scan',{}),api('/api/play/scenes/scan',{}).catch(()=>({added:0,errors:[]}))]);
  if(r.busy||s.busy)return tell(t('play.scanBusy'));
  const errors=(r.errors?.length||0)+(s.errors?.length||0);
  tell([t('play.scanned',{added:r.added,folders:r.folders_created}),t('play.figuresScanned',{added:s.added+s.updated,folders:s.folders_created}),sc.added?t('play.scenesScanned',{count:sc.added}):'',errors?t('play.scanErrors',{count:errors}):''].filter(Boolean).join(' '),!!errors);
  // Wrongly named folders are only reported (2026-11-14): the owner renames or moves them himself.
  const bad=r.misnamed_folders||[],stray=r.unmatched_folders||[];
  // Folders matching no place (or several) are listed too, with candidates (2026-11-14).
  if(bad.length||stray.length)showBox(t('place.misnamedTitle',{count:bad.length+stray.length}),t('place.misnamedLead'),`<div class="mb-list">${bad.map(x=>`<div class="mb-row"><span>${esc(x.folder)} → <b>${esc(x.expected_folder)}</b></span></div>`).join('')}${stray.map(x=>`<div class="mb-row"><span>${esc(x.folder)}</span><span class="muted">${esc(x.candidates?.length?t('place.zipCandidates',{list:x.candidates.join(' · ')}):t('place.zipNoCandidate'))}</span></div>`).join('')}</div>`);
}

function showBox(title,lead,html){
  document.querySelector('.play-album')?.remove();
  const box=document.createElement('div');box.className='play-album';box.setAttribute('role','dialog');box.setAttribute('aria-label',title);
  box.innerHTML=`<div class="play-album-inner"><header><b>${esc(title)}</b><span class="muted">${esc(lead)}</span><button type="button" class="subtle" data-album-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header>${html}</div>`;
  document.body.appendChild(box);
  const close=()=>{box.remove();document.removeEventListener('keydown',onKey);};const onKey=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',onKey);
  box.onclick=e=>{if(e.target===box||e.target.closest('[data-album-close]'))close();};
  box.querySelector('[data-album-close]').focus();
}

// "Háttércsomag (ZIP) betöltése" (owner, 2026-11-14): one ZIP whose folders are place names; the
// server puts each picture into its place and sets aside what it cannot place without guessing.
export function importBackgroundZip(tell){
  const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(file.size>300*1024*1024)return tell(t('place.zipTooLarge'),true);
    tell(t('place.zipLoading',{name:file.name}));
    try{
      const res=await fetch('/api/backgrounds/zip',{method:'POST',headers:{'Content-Type':'application/zip','X-LU-Filename':encodeURIComponent(file.name)},body:file});
      const v=await res.json().catch(()=>({}));if(!res.ok)throw new Error(translateServerMessage(v.error||res.statusText));
      tell(t('place.zipDone',{placed:v.placed.length,duplicates:v.duplicates.length,unmatched:v.unmatched.length,refused:v.refused.length}),!!(v.unmatched.length||v.refused.length));
      const row=(a,b)=>`<div class="mb-row"><span>${a}</span>${b?`<span class="muted">${b}</span>`:''}</div>`;
      showBox(t('place.zipTitle'),t('place.zipDone',{placed:v.placed.length,duplicates:v.duplicates.length,unmatched:v.unmatched.length,refused:v.refused.length}),
        (v.set_aside_folder?`<p class="muted">${esc(t('place.zipSetAside',{folder:v.set_aside_folder}))}</p>`:'')+
        (v.unmatched.length?`<h4>${esc(t('place.zipUnmatched'))}</h4><div class="mb-list">${v.unmatched.map(x=>row(esc(x.entry),x.candidates?.length?esc(t('place.zipCandidates',{list:x.candidates.join(' · ')})):esc(t('place.zipNoCandidate')))).join('')}</div>`:'')+
        (v.refused.length?`<h4>${esc(t('place.zipRefused'))}</h4><div class="mb-list">${v.refused.map(x=>row(esc(x.entry),esc(translateServerMessage(x.reason)))).join('')}</div>`:'')+
        (v.placed.length?`<h4>${esc(t('place.zipPlaced'))}</h4><div class="mb-list">${v.placed.map(x=>row(esc(x.entry)+' → <b>'+esc(x.location)+'</b>',x.match==='tolerant'?esc(t('place.zipTolerant')):'')).join('')}</div>`:''));
    }catch(e){tell(e.message,true);}
  };
  input.click();
}

export async function openMissingBackdrops(tell){
  const {places}=await api('/api/play/backdrops/missing');document.querySelector('.play-album')?.remove();
  const box=document.createElement('div');box.className='play-album';box.setAttribute('role','dialog');box.setAttribute('aria-label',t('play.missingBackdrops'));
  box.innerHTML=`<div class="play-album-inner"><header><b>${esc(t('play.missingBackdrops'))} (${places.length})</b><span class="muted">${esc(t('place.missingLead'))}</span><button type="button" class="subtle" data-album-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header>
    ${places.length?`<div class="mb-list">${places.map(x=>`<div class="mb-row"><span>${esc(x.path)}</span><span class="play-top-actions"><button type="button" class="subtle" data-mb-prompt="${esc(x.location_id)}">📋 ${esc(t('play.bgPrompt'))}</button></span></div>`).join('')}</div>`:`<p class="muted">${esc(t('play.missingBackdropsNone'))}</p>`}</div>`;
  document.body.appendChild(box);
  const close=()=>{box.remove();document.removeEventListener('keydown',onKey);};const onKey=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',onKey);
  box.onclick=e=>{if(e.target===box||e.target.closest('[data-album-close]'))close();};
  for(const b of box.querySelectorAll('[data-mb-prompt]'))b.onclick=async()=>{try{const r=await api('/api/play/prompts?'+new URLSearchParams({location_id:b.dataset.mbPrompt}));await navigator.clipboard.writeText(r.background.base+'\n\n'+r.background.evening+'\n\n'+r.background.night+'\n\nMentés: '+r.background.save_as);tell(t('play.promptCopied'));}catch(e){tell(e.message,true);}};
  box.querySelector('[data-album-close]').focus();
}
