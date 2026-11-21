import {t} from './i18n.js';
export const travelOptionKey=option=>JSON.stringify([option.mode,option.vehicle?.id||null,option.ride_with?.id||null,option.line||null]);
export const travelPayload=option=>({mode:option.mode,...(option.vehicle?{vehicle_id:option.vehicle.id}:{}),...(option.ride_with?{ride_with:option.ride_with.id}:{})});
export function rememberedTravel(option,options){return {choice:travelOptionKey(option),options:options.filter(o=>!o.unavailable).map(travelOptionKey)};}
export function preferredTravel(options,remembered,{alwaysAsk=false,force=false}={}){
  if(alwaysAsk||force||!remembered||!Array.isArray(remembered.options))return null;
  const available=options.filter(o=>!o.unavailable),match=available.find(o=>travelOptionKey(o)===remembered.choice);
  const newOpportunity=available.some(o=>(o.mode==='train'||o.ride_with)&&!remembered.options.includes(travelOptionKey(o)));
  return match&&!newOpportunity?match:null;
}
// Returns a choice only. Sending a travel request belongs to the caller.
export function travelOptionsDialog({options,from,to,esc}){
  return new Promise(resolve=>{
    const focused=document.activeElement,box=document.createElement('dialog');box.className='travel-options-dialog';box.setAttribute('aria-label',t('play.howTravel'));
    const icon={bike:'🚲',car:'🚗',train:'🚆'},duration=m=>m>=60?t('play.hoursMinutes',{h:Math.floor(m/60),m:m%60}):t('play.minutesShort',{minutes:m});
    box.innerHTML=`<header><h2>${t('play.howTravel')}</h2><button type="button" data-tr-close aria-label="${esc(t('common.closeDialog'))}">✕</button></header><p>${esc(from)} → ${esc(to)}</p><div class="tr-options">${options.map((o,i)=>`<button type="button" class="tr-option" data-tr="${i}" ${o.unavailable?'disabled':''}><span class="tr-icon" aria-hidden="true">${icon[o.mode]||'⌖'}</span><b>${esc(o.ride_with?t('play.rideWith',{name:o.ride_with.name}):t('play.mode.'+o.mode))}</b><small>${o.unavailable==='night'?esc(t('play.trainNight')):`${esc(duration(o.minutes))}${o.line?' · '+esc(o.line):''}${o.vehicle?' · '+esc(o.vehicle.name):''}`}</small></button>`).join('')}</div>`;
    let chosen=null;const done=option=>{chosen=option;box.close();};
    box.addEventListener('close',()=>{box.remove();if(focused?.isConnected)focused.focus();resolve(chosen);},{once:true});
    box.querySelector('[data-tr-close]').onclick=()=>done(null);
    for(const button of box.querySelectorAll('[data-tr]'))button.onclick=()=>done(options[Number(button.dataset.tr)]);
    box.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const index=Number(e.key)-1;if(index>=0&&index<options.length){e.preventDefault();box.querySelector(`[data-tr="${index}"]:not([disabled])`)?.click();}});
    document.body.appendChild(box);box.showModal();box.querySelector('[data-tr]:not([disabled])')?.focus();
  });
}
// A brief preflight lets "másképp" change this trip before any state-changing call.
export function tripChoiceNotice({place,mode,esc,ms=1200}){
  if(document.hidden)return Promise.resolve(null);
  return new Promise(resolve=>{
    const box=document.createElement('div');box.className='play-going play-trip-choice';box.setAttribute('role','status');
    box.innerHTML=`<span>${esc(t('play.going',{place}))} · ${esc(t('play.mode.'+mode))}</span><button type="button" data-trip-change>${t('play.travelChange')}</button><button type="button" data-trip-cancel>${t('common.cancel')}</button>`;
    let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);document.removeEventListener('keydown',keys,true);document.removeEventListener('visibilitychange',visibility);box.remove();resolve(value);};
    const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(null);}},visibility=()=>{if(document.hidden)finish(null);};
    const timer=setTimeout(()=>finish('go'),ms);box.querySelector('[data-trip-change]').onclick=()=>finish('change');box.querySelector('[data-trip-cancel]').onclick=()=>finish(null);
    document.addEventListener('keydown',keys,true);document.addEventListener('visibilitychange',visibility);document.body.appendChild(box);
  });
}
