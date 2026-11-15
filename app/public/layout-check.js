// Layout self-check (debugging package, 2026-11-13): finds the layout faults that were reported
// by hand so far, on the live page, at any window size. Reads only sizes and positions (never
// picture content). Used by the Play F9 panel and by the sandbox click-through check.
//  - page wider than the window (horizontal scrollbar);
//  - elements sticking out of the window, unless a scrolling/clipping parent holds them;
//  - buttons covered by something else (cannot be clicked where they are drawn);
//  - the arrival or talk panel covering more than a third of a figure;
//  - pictures that failed to load; tap targets under 32 px on a phone-sized window.
const describe=el=>{
  if(!el||el===document.body)return 'body';
  const cls=[...el.classList].slice(0,2).map(c=>'.'+c).join('');
  return el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+cls;
};
// Visible means drawn: not inside a closed <details>, a hidden or transparent ancestor.
const visible=el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return false;
  if(el.checkVisibility)return el.checkVisibility({opacityProperty:true,visibilityProperty:true,contentVisibilityAuto:true});
  const s=getComputedStyle(el);return s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0.05;};
// A point hidden by a scrolling/clipping ancestor is not "covered": it is simply scrolled away.
const insideClips=(el,x,y)=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);
  if(s.overflowX!=='visible'||s.overflowY!=='visible'){const r=p.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return false;}}return true;};
const clipped=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowX!=='visible'||s.overflow!=='visible')return true;if(s.position==='fixed')return false;}return false;};
const overlap=(a,b)=>{const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return w*h;};

export function layoutProblems(root=document.body,{win=window}={}){
  const out=[],W=win.innerWidth,H=win.innerHeight;
  const add=(kind,where,detail='')=>{if(out.length<60)out.push({kind,where,detail});};
  const doc=document.documentElement;
  if(doc.scrollWidth>W+1)add('page_wider',`${doc.scrollWidth}px > ${W}px`);
  const all=[...root.querySelectorAll('*')].filter(el=>!el.closest('svg')||el.tagName==='svg');
  for(const el of all){
    if(!visible(el))continue;
    const r=el.getBoundingClientRect();
    if((r.right>W+2||r.left<-2)&&!clipped(el)&&getComputedStyle(el).position!=='fixed'||(getComputedStyle(el).position==='fixed'&&(r.right>W+2||r.left<-2)))
      add('sticks_out',describe(el),`${Math.round(r.left)}…${Math.round(r.right)} / ${W}`);
  }
  // Covered buttons: the point at the centre of a button must belong to it.
  if(!document.querySelector('dialog[open]'))for(const b of root.querySelectorAll('button,a[href],summary,[role="button"]')){
    if(!visible(b)||b.disabled)continue;
    const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||y<0||x>W||y>H||!insideClips(b,x,y))continue;
    const hit=document.elementFromPoint(x,y);
    // The debug panel itself is an overlay on purpose.
    if(hit&&hit!==b&&!b.contains(hit)&&!hit.contains(b)&&!hit.closest('.pdbg')&&!b.closest('.pdbg'))add('covered',describe(b),'← '+describe(hit));
  }
  const panel=root.querySelector('.vn-arrival:not([hidden]),.vn-panel,.vn-talk-panel');
  if(panel&&visible(panel)){const p=panel.getBoundingClientRect();
    for(const f of root.querySelectorAll('.vn-figure')){if(!visible(f))continue;const r=f.getBoundingClientRect(),area=r.width*r.height;
      if(area&&overlap(p,r)/area>1/3)add('figure_covered',describe(f),Math.round(100*overlap(p,r)/area)+'%');}}
  for(const img of root.querySelectorAll('img')){if(img.complete&&img.getAttribute('src')&&img.naturalWidth===0)add('image_failed',describe(img),String(img.getAttribute('src')).split('?')[0].slice(0,80));}
  if(W<=600){let small=0;for(const b of root.querySelectorAll('button,a[href],summary,input,select')){if(!visible(b))continue;const r=b.getBoundingClientRect();if(r.height<32&&r.width<32)small++;}if(small)add('small_targets',String(small),'< 32px');}
  return out;
}
