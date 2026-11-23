import {t} from './i18n.js';
export async function renderQuality(root,{api,esc,toast}){
  const {characters}=await api('/api/state');let crop=null,report=null;
  root.innerHTML=`<h2>${t('iq.title')}</h2><form><label>${t('iq.character')}<select name="character">${characters.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>${t('iq.image')}<select name="media"></select></label><div class="iq-preview"><img draggable="false" alt=""><i></i></div><label><input name="scope" type="checkbox"> ${t('iq.scope')}</label><button type="submit">${t('iq.compare')}</button></form><div class="iq-result"></div>`;
  const f=root.querySelector('form'),preview=root.querySelector('.iq-preview'),img=preview.querySelector('img'),box=preview.querySelector('i'),out=root.querySelector('.iq-result');
  Object.assign(preview.style,{position:'relative',maxWidth:'480px'});Object.assign(img.style,{width:'100%',display:'block',touchAction:'none'});Object.assign(box.style,{position:'absolute',border:'2px solid #60d9b1',pointerEvents:'none',display:'none'});
  const clear=()=>{crop=null;report=null;out.innerHTML='';box.style.display='none';f.scope.checked=false;};
  const show=()=>{clear();img.src='/thumb/'+encodeURIComponent(f.media.value)+'?w=960';};
  const load=async()=>{const cid=f.character.value;const {items}=await api('/api/media?kind=image&character='+encodeURIComponent(cid)+'&limit=100');if(cid!==f.character.value)return;f.media.innerHTML=items.filter(m=>m.kind==='image').map(m=>`<option value="${esc(m.id)}">${esc(m.relative_path.split(/[\\/]/).pop())}</option>`).join('');if(f.media.value)show();};
  f.character.onchange=()=>load().catch(e=>toast(e.message,true));f.media.onchange=show;
  let start;
  const point=e=>{const r=img.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  img.onpointerdown=e=>{e.preventDefault();start=point(e);img.setPointerCapture(e.pointerId);};
  img.onpointerup=e=>{if(!start)return;const p=point(e),x=Math.min(start.x,p.x),y=Math.min(start.y,p.y),w=Math.abs(start.x-p.x),h=Math.abs(start.y-p.y);start=null;clear();if(w<0.02||h<0.02)return;crop={x,y,w,h};Object.assign(box.style,{display:'block',left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'});};
  f.onsubmit=async e=>{e.preventDefault();f.querySelector('button').disabled=true;try{
    report=await api('/api/identity/quality/compare',{character_id:f.character.value,media_id:f.media.value,crop,single_person:f.scope.checked,body_visible:f.scope.checked});
    const side=key=>`<section><b>${t('iq.'+key)}</b><p>${t('iq.advisory')}</p>${report.references[key].map(s=>`<img src="/api/characters/${encodeURIComponent(report.character_id)}/references/${encodeURIComponent(s.media_id)}/image?revision_id=${encodeURIComponent(report.canon_id)}${s.reference_id?'&reference_id='+encodeURIComponent(s.reference_id):''}" alt="" loading="lazy"><small>${report[key].scores.find(x=>x.media_id===s.media_id)?.score.toFixed(3)||t('iq.unknown')}</small>`).join('')||t('iq.unknown')}<select data-verdict="${key}">${['unknown','match','mismatch'].map(v=>`<option value="${v}">${t('iq.'+v)}</option>`).join('')}</select></section>`;
    out.innerHTML=`<div class="id-grid">${side('face')}${side('body')}</div><button data-save>${t('iq.save')}</button>`;
    for(const ref of out.querySelectorAll('img'))Object.assign(ref.style,{maxWidth:'100%',maxHeight:'240px',objectFit:'contain',display:'block'});
    out.querySelector('[data-save]').onclick=async()=>{try{await api('/api/identity/quality/review',{report_id:report.id,face:out.querySelector('[data-verdict="face"]').value,body:out.querySelector('[data-verdict="body"]').value});out.innerHTML='';toast(t('play.saved'));}catch(error){toast(error.message,true);}};
  }catch(error){toast(error.message,true);}finally{f.querySelector('button').disabled=false;}};
  await load();
}
