// Pop-ups between screens of the Play mode (2026-11-13):
//  - roadTransition: a short "on the road" moment when Palor goes from one town to another —
//    the road between the two towns on a small map, with a dot gliding along it.
//  - playStory: an interactive story (text blocks, choices A–D) shown before the destination
//    loads. Nothing is saved but the run itself (path and ending), through /finish.
import {PLACES} from './play-map.js';

const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
const pointOf=name=>{const key=Object.keys(PLACES).find(k=>fold(k)===fold(name));return key?PLACES[key].at:null;};
const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function overlay(cls){const el=document.createElement('div');el.className='ps-overlay '+cls;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.appendChild(el);return el;}

// About 1.6 s; any click or key skips it. Resolves when it is gone.
export function roadTransition({from,to,minutes,vehicle,mode=null,line=null,esc,t}){
  return new Promise(resolve=>{
    const a=pointOf(from),b=pointOf(to);
    const el=overlay('ps-road');
    // Named map (2026-11-14): it shadowed the train line shown in the text below.
    const map=a&&b?(()=>{const [x1,y1]=a,[x2,y2]=b,mx=(x1+x2)/2+(y2-y1)*0.12,my=(y1+y2)/2-(x2-x1)*0.12;
      const minX=Math.min(x1,x2,mx)-60,minY=Math.min(y1,y2,my)-60,w=Math.max(x1,x2,mx)-minX+60,h=Math.max(y1,y2,my)-minY+60;
      return `<svg class="ps-road-map" viewBox="${minX} ${minY} ${w} ${h}" aria-hidden="true"><path id="ps-road-path" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" class="ps-road-line"/><circle cx="${x1}" cy="${y1}" r="9" class="ps-road-town"/><circle cx="${x2}" cy="${y2}" r="9" class="ps-road-town"/><circle r="7" class="ps-road-dot"><animateMotion dur="1.4s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1"><mpath href="#ps-road-path"/></animateMotion></circle></svg>`;})():'<div class="ps-road-plain">🛣</div>';
    el.innerHTML=`<div class="ps-road-card">${map}<p class="ps-road-text"><b>${esc(from)}</b> → <b>${esc(to)}</b></p><small>${esc(mode&&mode!=='foot'?t('play.roadBy.'+mode,{minutes,line:line||'',vehicle:vehicle||''}):t(vehicle?'play.roadByCar':'play.roadOnFoot',{minutes,vehicle:vehicle||''}))}</small></div>`;
    let done=false;const close=()=>{if(done)return;done=true;el.classList.add('ps-out');setTimeout(()=>{el.remove();resolve();},reduced()?0:220);};
    el.onclick=close;document.addEventListener('keydown',close,{once:true});
    setTimeout(close,reduced()?400:1700);
  });
}

// Someone by the road on a car trip (owner, 2026-11-14): "Megállsz?" with A (stop) and B (drive
// on); keys A/B or 1/2, Escape drives on. Resolves true when Palor stops.
export function roadsideChoice({text,esc,t}){
  return new Promise(resolve=>{
    const el=overlay('ps-story ps-roadside');
    const opt=(key,stop,label)=>`<button type="button" class="ps-choice" data-stop="${stop}"><span class="ps-key">${key}</span><span>${esc(label)}</span></button>`;
    el.innerHTML=`<div class="ps-card"><header class="ps-head"><span class="ps-icon" aria-hidden="true">🛣</span><b>${esc(t('play.roadsideAsk'))}</b></header>
      <div class="ps-main"><div class="ps-body"><p class="ps-text">${esc(text)}</p></div></div>
      <div class="ps-choices">${opt('A',1,t('play.roadsideStop'))}${opt('B',0,t('play.roadsideDrive'))}</div></div>`;
    let gone=false;const done=v=>{if(gone)return;gone=true;document.removeEventListener('keydown',keys);el.remove();resolve(v);};
    const keys=e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toUpperCase();
      if(k==='A'||k==='1'){e.preventDefault();done(true);}else if(k==='B'||k==='2'||k==='ESCAPE'){e.preventDefault();done(false);}};
    for(const b of el.querySelectorAll('[data-stop]'))b.onclick=()=>done(b.dataset.stop==='1');
    document.addEventListener('keydown',keys);el.querySelector('.ps-choice')?.focus();
  });
}

// Plays one story. Resolves {ending|null, path}. Keys: A–D or 1–4 choose, Enter continues at an ending.
export function playStory({run_id,story,api,esc,t,toast=()=>{}}){
  return new Promise(resolve=>{
    const el=overlay('ps-story');const path=[];let nodeId=story.start;
    // Story pictures: a block's picture stays beside the text until a later block has its own.
    const pictures=story.pictures||{};let shown=null;
    for(const p of Object.values(pictures)){const im=new Image();im.src=p.url;}
    const icon={road:'🛣',kaloz:'🌾',szekesfehervar:'🏰',budapest:'🌉'}[story.setting]||'✦';
    const finish=async ending=>{document.removeEventListener('keydown',keys);
      try{await api('/api/play/story-runs/'+run_id+'/finish',{path,ending:ending||null});}catch(e){toast(e.message,true);}
      el.classList.add('ps-out');setTimeout(()=>{el.remove();resolve({ending:ending||null,path});},reduced()?0:200);};
    function draw(){
      const n=story.nodes[nodeId];path.push(nodeId);
      const step=path.length;
      const fresh=pictures[nodeId]&&pictures[nodeId]!==shown;if(pictures[nodeId])shown=pictures[nodeId];
      const pic=shown?`<figure class="ps-pic${shown.heat?' ps-pic-heat':''}${fresh?' ps-pic-new':''}"><img src="${esc(shown.url)}" alt="${esc(t('play.storyPicture'))}"></figure>`:'';
      el.innerHTML=`<div class="ps-card${shown?' ps-with-pic':''}"><header class="ps-head"><span class="ps-icon" aria-hidden="true">${icon}</span><b>${esc(story.title)}</b><button type="button" class="ps-skip" data-skip>${esc(t('play.storySkip'))}</button></header>
        <div class="ps-main">${pic}<div class="ps-body"><p class="ps-text">${esc(n.text).replace(/\n+/g,'</p><p class="ps-text">')}</p></div></div>
        ${n.ending?`<div class="ps-end ps-end-${esc(n.ending)}"><span>${esc(t('play.storyEnd.'+n.ending))}</span><button type="button" class="primary" data-continue>${esc(t('play.storyContinue'))}</button></div>`
          :`<div class="ps-choices">${n.choices.map(c=>`<button type="button" class="ps-choice" data-to="${esc(c.to)}"><span class="ps-key">${esc(c.key)}</span><span>${esc(c.text)}</span></button>`).join('')}</div>`}
        <small class="ps-step">${esc(t('play.storyStep',{step}))}</small></div>`;
      el.querySelector('[data-skip]').onclick=()=>finish(null);
      for(const b of el.querySelectorAll('[data-to]'))b.onclick=()=>{nodeId=b.dataset.to;draw();};
      const cont=el.querySelector('[data-continue]');if(cont){cont.onclick=()=>finish(nodeId);cont.focus();}else el.querySelector('.ps-choice')?.focus();
      el.querySelector('.ps-body').scrollTop=0;
    }
    const keys=e=>{const n=story.nodes[nodeId];if(!n)return;
      if(n.ending&&(e.key==='Enter'||e.key===' ')){e.preventDefault();finish(nodeId);return;}
      if(e.key==='Escape'){finish(null);return;}
      const i='ABCD'.indexOf(e.key.toUpperCase())>=0?'ABCD'.indexOf(e.key.toUpperCase()):'1234'.indexOf(e.key);
      if(!n.ending&&i>=0&&n.choices[i]&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();nodeId=n.choices[i].to;draw();}};
    document.addEventListener('keydown',keys);
    draw();
  });
}
