import {t} from './i18n.js';
export async function renderFactProposals(root,{api,esc,toast}){
  const {proposals}=await api('/api/play/facts');if(!proposals.length)return;
  const box=document.createElement('section');box.className='we-section';
  box.innerHTML=`<h3>${t('facts.title')}</h3>${proposals.map(p=>`<article data-fact="${esc(p.id)}"><b>${esc(p.people)}</b><p>${esc(p.fact.title||'')} ${esc(p.fact.text||p.fact.summary||p.fact.reason||'')}${p.fact.delta?` (${p.fact.delta>0?'+':''}${p.fact.delta})`:''}</p>${p.stale?`<small>${t('facts.stale')}</small>`:`<button data-approve>${t('we.hiddenApprove')}</button>`}<button data-reject class="subtle">${t('facts.reject')}</button></article>`).join('')}`;
  root.append(box);
  for(const p of proposals){const card=box.querySelector('[data-fact="'+CSS.escape(p.id)+'"]');for(const action of ['approve','reject'])card.querySelector('[data-'+action+']')?.addEventListener('click',async()=>{try{await api('/api/play/facts/'+p.id+'/'+action,{source_hash:p.source_hash});card.remove();toast(t('play.saved'));}catch(e){toast(e.message,true);}});}
}
