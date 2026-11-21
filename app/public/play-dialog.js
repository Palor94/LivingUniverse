import {t} from './i18n.js';

export function bindGrowingInput(input,{submit,lastLine=()=>'',view=window}){
  if(!input)return;
  const resize=()=>{const css=view.getComputedStyle(input),line=parseFloat(css.lineHeight)||22,padding=(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)+2;input.style.height='auto';input.style.height=Math.min(input.scrollHeight,line*5+padding)+'px';input.style.overflowY=input.scrollHeight>line*5+padding?'auto':'hidden';};
  input.addEventListener('input',resize);
  input.onkeydown=e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}
    else if(e.key==='ArrowUp'&&!input.value&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const text=lastLine();if(text){e.preventDefault();input.value=text;input.setSelectionRange(text.length,text.length);resize();}}
  };
  resize();return resize;
}

export function previousConversationHtml(detail,esc){
  if(!detail)return '';
  const talk=detail.talks?.[0],thread=detail.threads?.find(x=>x.status==='open'),appointment=detail.appointments?.find(x=>['accepted','invited'].includes(x.status));
  const lines=[talk?[talk.world_day,talk.title,talk.summary].filter(Boolean).join(' · '):'',thread?t('play.cardPromise',{text:thread.text}):'',appointment?t('play.cardAppointment',{day:appointment.world_day,slot:appointment.slot,place:appointment.place}):''].filter(Boolean);
  return lines.length?`<aside class="play-previous"><b>${t('play.previously')}</b>${lines.map(line=>`<p>${esc(line)}</p>`).join('')}</aside>`:'';
}

export function openPersonCard({person,esc,portrait,load,onTalk,onMessage,onAlbum,onError,canTalk=true,talkLabel=t('play.addressPerson')}){
  document.querySelector('.play-person-card')?.close();
  const focused=document.activeElement,box=document.createElement('dialog');box.className='play-person-card';box.setAttribute('aria-label',t('play.personCard',{name:person.name}));
  box.innerHTML=`<header>${portrait(person)}<h2>${esc(person.name)}</h2><button type="button" data-card-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header><p>${esc(person.activity||'')}</p><section data-card-details aria-live="polite"><p>${t('common.loading')}</p></section><footer><button type="button" class="primary" data-card-talk ${canTalk?'':'disabled'}>${esc(talkLabel)}</button><button type="button" data-card-message>${t('play.cardMessage')}</button><button type="button" data-card-album>${t('play.cardAlbum')}</button></footer>`;
  const close=()=>box.close();
  if(!canTalk)box.querySelector('[data-card-talk]').title=t('play.finishCurrentFirst');
  box.addEventListener('close',()=>{box.remove();if(focused?.isConnected)focused.focus();},{once:true});
  for(const button of box.querySelectorAll('[data-card-close]'))button.onclick=close;
  for(const [selector,action] of [['[data-card-talk]',onTalk],['[data-card-message]',onMessage],['[data-card-album]',onAlbum]])box.querySelector(selector).onclick=()=>{close();void action();};
  const details=box.querySelector('[data-card-details]');
  const refresh=async()=>{try{const data=await load();if(!box.isConnected)return;const p=data.person||{},label=value=>data.labels?.[value]||t('play.cardUnknown');
    details.innerHTML=`<p>${esc(t('play.cardTheirLevel',{label:label(p.their_level)}))}</p><p>${esc(t('play.cardPalorLevel',{label:label(p.palor_level)}))}</p>${previousConversationHtml(data,esc)}`;
  }catch(error){if(!box.isConnected)return;details.replaceChildren();const text=document.createElement('p'),retry=document.createElement('button');text.textContent=error.message;retry.type='button';retry.textContent=t('api.retry');retry.onclick=()=>{retry.disabled=true;void refresh();};details.append(text,retry);onError?.(error);}};
  document.body.appendChild(box);box.showModal();box.querySelector(canTalk?'[data-card-talk]':'[data-card-close]').focus();void refresh();return box;
}
