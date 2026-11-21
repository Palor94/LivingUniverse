import {t} from './i18n.js';
let serial=0;
const queues=new WeakMap(),pending=new Map();
export function cancelUndoWindows(){for(const cancel of [...pending.values()])cancel();}
function stylesheet(){if(document.querySelector('link[data-interactions]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/interactions.css';link.dataset.interactions='';document.head.append(link);}
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
export function ask({title=t('modal.title'),message='',fields=[],accept=t('modal.continue'),cancellable=true}={}){
  stylesheet();const dialog=node('dialog');dialog.className='lu-modal';
  const form=node('form'),heading=node('h2',title),description=node('p',message),body=node('div'),actions=node('div'),cancel=node('button',t('common.cancel')),save=node('button',accept);
  heading.id='lu-question-'+(++serial);dialog.setAttribute('aria-labelledby',heading.id);body.className='lu-modal-fields';actions.className='lu-modal-actions';cancel.type='button';save.type='submit';save.className='primary';
  for(const field of fields){const label=node('label'),input=node(field.options?'select':field.multiline?'textarea':'input');input.name=field.name;if(field.options)for(const [value,text] of field.options){const option=node('option',text);option.value=value;input.append(option);}else if(!field.multiline)input.type=field.type||'text';if(field.type==='number')input.step=field.step||'any';if(field.type==='checkbox')input.checked=!!field.value;else input.value=field.value||'';if(field.required)input.required=true;if(field.maxLength)input.maxLength=field.maxLength;label.append(node('span',field.label),input);body.append(label);}
  cancel.hidden=!cancellable;actions.append(cancel,save);form.append(heading,description,body,actions);dialog.append(form);document.body.append(dialog);const previous=document.activeElement;
  return new Promise(resolve=>{
    let finished=false;const finish=value=>{if(finished)return;finished=true;window.removeEventListener('pagehide',abandon);const notices=dialog.querySelector('#toast');if(notices)document.body.append(notices);dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);},abandon=()=>finish(null);
    cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();if(cancellable)finish(null);});window.addEventListener('pagehide',abandon,{once:true});
    dialog.onclick=event=>{if(event.target!==dialog||!cancellable)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)finish(null);};
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;finish(Object.fromEntries(fields.map(field=>{const input=form.elements.namedItem(field.name);return [field.name,field.type==='checkbox'?input.checked:input.value];})));};
    dialog.showModal();(body.querySelector('input:not([type="checkbox"]),textarea,select')||(cancellable?cancel:save)).focus();
  });
}
export async function confirmBox(message,{title=t('modal.title'),accept=t('modal.continue')}={}){return await ask({title,message,accept})!==null;}
export async function askText(message,{value='',maxLength=1000}={}){const result=await ask({title:message,fields:[{name:'text',label:message,value,maxLength,required:true}],accept:t('modal.continue')});return result?.text??null;}
export function notify(message,error=false,retry=null){
  stylesheet();let host=document.getElementById('toast');if(!host){host=node('div');host.id='toast';document.body.append(host);}const parent=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;if(host.parentElement!==parent){parent.append(host);if(parent!==document.body)parent.addEventListener('close',()=>document.body.append(host),{once:true});}host.classList.add('lu-notifications');host.style.display='flex';host.classList.remove('error');host.removeAttribute('role');
  if(!queues.has(host))queues.set(host,new Set());const cards=queues.get(host),card=node('div'),text=node('span',message),close=node('button','✕');card.className='lu-notification'+(error?' error':'');card.setAttribute('role',error?'alert':'status');close.type='button';close.className='toast-close';close.setAttribute('aria-label',t('common.dismiss'));card.append(text);
  let timer;const remove=()=>{clearTimeout(timer);card.remove();cards.delete(card);if(!cards.size)host.style.display='none';};
  if(retry){const button=node('button',t('api.retry'));button.type='button';button.className='api-retry';button.onclick=async()=>{button.disabled=true;try{await retry();remove();}catch(error){notify(error.message,true);}finally{button.disabled=false;}};card.append(button);}
  card.append(close);close.onclick=remove;host.append(card);cards.add(card);if(!error)timer=setTimeout(remove,5000);return {card,remove,close};
}
// No command has been sent during this window; cancelling needs no compensating write.
export function undoWindow(message,{delay=5000,key=message}={}){
  if(pending.has(key))return Promise.resolve(false);
  return new Promise(resolve=>{
    const notice=notify(t('modal.pending',{message}),true),button=node('button',t('modal.undo'));button.type='button';button.className='lu-undo';notice.card.insertBefore(button,notice.close);
    let settled=false;const finish=proceed=>{if(settled)return;settled=true;clearTimeout(timer);pending.delete(key);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',cancel);window.removeEventListener('keydown',escape);notice.remove();resolve(proceed);},cancel=()=>finish(false),visibility=()=>{if(document.hidden)cancel();},escape=event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))cancel();};
    const timer=setTimeout(()=>finish(true),delay);pending.set(key,cancel);button.onclick=cancel;notice.close.onclick=cancel;document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',cancel,{once:true});window.addEventListener('keydown',escape);
  });
}
