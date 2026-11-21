// Town plan for Play (2026-11-13, redrawn the same day): a small illustrated street map instead of
// a grid — a curving main road and side streets, little roofed houses along them (with gardens in
// a village), fields and tree clumps at the edge of a village, parks in a town, the Danube in
// Budapest, a light paper texture. Every place of the town is a pictogram pin where that kind of
// place would be: shops and pubs on the main road near the centre, homes down the side streets,
// nature at the edges. The owner can drag the pins and save the arrangement (presentation only),
// and may put an illustrated map picture under them (20_SHARED_MEDIA/Játék térképek/<town>.png).
// Inline SVG from code: no tiles, no outside requests; the same town always looks the same. The
// drawing reaches beyond the 1200×720 frame so a wider screen shows more town, not empty bands.

import {t} from './i18n.js';
import {townLabelLayout} from './play-map-layout.js';
export const TM_W=1200,TM_H=720;
const X0=-700,Y0=-360,XW=TM_W+1400,YH=TM_H+720;// drawn area around the frame
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export const townSize=name=>({budapest:'city',szekesfehervar:'town',pecs:'town'})[fold(name)]||'village';
export const KIND_ICON={transit:'🚏',room:'🚪',home:'🏠',shop:'🛒',public:'🏛',work:'🏢',leisure:'🍺',nature:'🌳',vehicle:'🚗',place:'📍',area:'🏘'};
const KIND_TONE={transit:'#7d8798',room:'#c9a46a',home:'#d9845a',shop:'#4f9fd6',public:'#8f7fd6',work:'#5fa585',leisure:'#d95f88',nature:'#55a658',vehicle:'#7d8798',place:'#b8a07a',area:'#c9824f'};
const STYLE={
  village:{land:'#dfe6c4',road:22,street:13,casing:'#c9bf9e',roof:['#c0603f','#b5553a','#a8644a','#cf7b52','#9e5b45'],wall:'#f1e6d2',step:34,rows:1,garden:true},
  town:{land:'#e3dfcf',road:30,street:16,casing:'#bdb6a2',roof:['#b8664a','#9a968e','#a77a5a','#8b8a86','#c27b5c'],wall:'#ece5d6',step:25,rows:2,garden:false},
  city:{land:'#dcdad3',road:36,street:18,casing:'#b3aea2',roof:['#8e9096','#a0a2a8','#7f838c','#b09a86','#9a8f86'],wall:'#e6e2da',step:21,rows:2,garden:false}
};

// Smooth path through points (Catmull-Rom → cubic Bézier).
function smooth(p){
  const q=[p[0],...p,p.at(-1)];let d=`M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for(let i=1;i<q.length-2;i++){const [a,b,c,e]=[q[i-1],q[i],q[i+1],q[i+2]];
    d+=` C${(b[0]+(c[0]-a[0])/6).toFixed(1)},${(b[1]+(c[1]-a[1])/6).toFixed(1)} ${(c[0]-(e[0]-b[0])/6).toFixed(1)},${(c[1]-(e[1]-b[1])/6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;}
  return d;
}
// Dense points along the same curve, for placing houses and measuring distances.
function sampleCurve(p,per=10){
  const q=[p[0],...p,p.at(-1)],out=[];
  for(let i=1;i<q.length-2;i++){const [a,b,c,e]=[q[i-1],q[i],q[i+1],q[i+2]];
    for(let k=0;k<per;k++){const t=k/per,t2=t*t,t3=t2*t;
      out.push([0,1].map(j=>0.5*((2*b[j])+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-e[j])*t2+(-a[j]+3*b[j]-3*c[j]+e[j])*t3)));}}
  out.push(p.at(-1));return out;
}
const distTo=(pts,x,y)=>{let best=Infinity;for(let i=0;i<pts.length-1;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1],dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy||1;let t=((x-ax)*dx+(y-ay)*dy)/l;t=Math.max(0,Math.min(1,t));best=Math.min(best,Math.hypot(ax+t*dx-x,ay+t*dy-y));}return best;};

// The street network: a gently winding main road, side streets crossing it, a river in Budapest.
function network(town){
  const name=town.short_name||town.name,size=townSize(name),r=seeded(hash(town.id)),mid=TM_H*0.52;
  const main=[];for(let x=X0;x<=X0+XW;x+=200)main.push([x,mid+Math.sin(x/260+r()*2)*26+(r()-0.5)*18]);
  const mainPts=sampleCurve(main,12);
  const yAt=x=>{let best=mainPts[0];for(const p of mainPts)if(Math.abs(p[0]-x)<Math.abs(best[0]-x))best=p;return best[1];};
  const n={village:3,town:5,city:6}[size];
  const cross=[];for(let i=0;i<n;i++){const x=TM_W*(i+1)/(n+1)+(r()-0.5)*60,y=yAt(x),bend=()=>(r()-0.5)*90;
    const pts=[[x+bend(),Y0],[x+bend()*0.7,y-260],[x,y],[x+bend()*0.7,y+260],[x+bend(),Y0+YH]];
    cross.push({x,y,pts,dense:sampleCurve(pts,10)});}
  const xAt=(c,y)=>{let best=c.dense[0];for(const p of c.dense)if(Math.abs(p[1]-y)<Math.abs(best[1]-y))best=p;return best[0];};
  const river=fold(name)==='budapest'?(()=>{const x=TM_W*0.36,pts=[[x-80,Y0],[x+30,TM_H*0.15],[x-40,TM_H*0.55],[x+20,TM_H*0.9],[x-30,Y0+YH]];return {pts,dense:sampleCurve(pts,10),width:96};})():null;
  // A few winding lanes in a village; a ring road around the centre of a town.
  const lanes=[];
  if(size==='village')for(let i=0;i<3;i++){const sx=TM_W*(0.15+0.35*i)+(r()-0.5)*80,up=r()<0.5?-1:1;lanes.push(sampleCurve([[sx,yAt(sx)],[sx+60+r()*80,yAt(sx)+up*120],[sx+20+r()*160,yAt(sx)+up*(230+r()*80)]],10));}
  return {size,r,main,mainPts,cross,yAt,xAt,river,lanes};
}
// Candidate spots for pins: along the main road and along both sides of every side street.
function spots(net){
  const out=[],cx=TM_W/2,cy=TM_H/2,maxD=Math.hypot(cx,cy);
  const add=(x,y,onMain)=>{if(x<60||x>TM_W-60||y<70||y>TM_H-60)return;if(net.river&&distTo(net.river.dense,x,y)<net.river.width/2+30)return;out.push({x,y,onMain,c:Math.hypot(x-cx,y-cy)/maxD});};
  const xs=[0,...net.cross.map(c=>c.x),TM_W];
  for(let i=0;i<xs.length-1;i++)for(const f of [0.33,0.66]){const x=xs[i]+(xs[i+1]-xs[i])*f;for(const dy of [-52,52])add(x,net.yAt(x)+dy,true);}
  for(const c of net.cross)for(const d of [-270,-180,-95,95,180,270])for(const side of [-1,1]){const y=c.y+d;add(net.xAt(c,y)+side*50,y,false);}
  return out;
}
const SCORE={transit:s=>(s.onMain?0:1)+s.c*0.5,shop:s=>(s.onMain?0:0.6)+s.c,leisure:s=>(s.onMain?0:0.6)+s.c,public:s=>(s.onMain?0.1:0.5)+s.c,work:s=>(s.onMain?0.3:0.4)+s.c,
  home:s=>(1-s.c)+(s.onMain?0.6:0),nature:s=>(1-s.c)*1.5+(s.onMain?0.5:0),vehicle:s=>s.c+(s.onMain?0:0.3),place:s=>s.c,area:s=>(1-s.c)*0.8+(s.onMain?0.4:0),room:s=>s.c};
const ORDER=['transit','shop','leisure','public','work','area','home','nature','vehicle','place','room'];
// Where each place stands: saved positions first, then the best free spot for its kind.
export function layoutPins(town,places,saved={}){
  const net=network(town),free=spots(net),pos=new Map();
  for(const p of places)if(Array.isArray(saved[p.id])&&saved[p.id].length===2)pos.set(p.id,saved[p.id]);
  const taken=s=>[...pos.values()].some(([x,y])=>Math.abs(x-s.x)<130&&Math.abs(y-s.y)<80);
  const rest=places.filter(p=>!pos.has(p.id)).sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind));
  for(const p of rest){const score=SCORE[p.kind]||SCORE.place;const best=free.filter(s=>!taken(s)).sort((a,b)=>score(a)-score(b))[0];
    if(best)pos.set(p.id,[Math.round(best.x),Math.round(best.y)]);
    else{const k=pos.size;pos.set(p.id,[90+(k*137)%(TM_W-180),100+Math.floor(k*137/(TM_W-180))*90]);}}
  return {net,pos};
}

// Káloz határa until its painted map arrives (2026-11-14): fields by the village, the big lake,
// a dense forest with the car park at its edge, the mountain far away. No houses.
function countryside({slot,town}){
  const r=seeded(hash(town.id)+11),p=[`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" fill="#d4dfaa"/>`];
  const fields=['#cfdca5','#e3dba0','#bfd396','#d8cf92'];
  for(let i=0;i<26;i++){const x=TM_W*(0.55+r()*0.45),y=TM_H*r(),w=90+r()*120,h=50+r()*70;p.push(`<rect x="${(x-w/2).toFixed(0)}" y="${(y-h/2).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="6" fill="${fields[i%4]}" opacity=".85" transform="rotate(${((r()-0.5)*24).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`);}
  p.push(`<ellipse cx="${TM_W*0.36}" cy="${TM_H*0.55}" rx="${TM_W*0.36}" ry="${TM_H*0.46}" fill="#5f8a48" opacity=".55"/>`);
  for(let i=0;i<420;i++){const a=r()*Math.PI*2,d=Math.sqrt(r()),x=TM_W*0.36+Math.cos(a)*d*TM_W*0.35,y=TM_H*0.55+Math.sin(a)*d*TM_H*0.45,s=6+r()*7;
    p.push(`<circle cx="${(x+2).toFixed(0)}" cy="${(y+3).toFixed(0)}" r="${s.toFixed(1)}" fill="#000" opacity=".14"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="${['#4c7a44','#3f6a3a','#5a8a4c'][i%3]}"/>`);}
  p.push(`<path d="M${TM_W*0.08} ${TM_H*0.32} L${TM_W*0.16} ${TM_H*0.12} L${TM_W*0.22} ${TM_H*0.24} L${TM_W*0.29} ${TM_H*0.07} L${TM_W*0.38} ${TM_H*0.32} Z" fill="#8a8170" stroke="#4d4636" stroke-width="2"/>`);
  p.push(`<ellipse cx="${TM_W*0.72}" cy="${TM_H*0.62}" rx="${TM_W*0.17}" ry="${TM_H*0.2}" fill="#efe6c8"/><ellipse cx="${TM_W*0.72}" cy="${TM_H*0.62}" rx="${TM_W*0.155}" ry="${TM_H*0.18}" fill="#7fb0d6"/>`);
  p.push(`<path d="M${TM_W} ${TM_H*0.2} Q${TM_W*0.75} ${TM_H*0.3} ${TM_W*0.58} ${TM_H*0.42}" stroke="#d9c79c" stroke-width="10" fill="none" stroke-linecap="round"/>`);
  if(slot===3)p.push(`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" fill="#0b1030" opacity=".3"/>`);
  return p.join('');
}
function ground(net,{slot,town,pins}){
  if(town.region)return countryside({slot,town});
  const S=STYLE[net.size],r=seeded(hash(town.id)+7),parts=[],roads=[net.mainPts,...net.cross.map(c=>c.dense),...net.lanes];
  const nearRoad=(x,y,m)=>roads.some((pts,i)=>distTo(pts,x,y)<(i===0?S.road:S.street)/2+m);
  const nearPin=(x,y,m)=>pins.some(([px,py])=>Math.hypot(px-x,py-y)<m);
  const inRiver=(x,y,m=0)=>net.river&&distTo(net.river.dense,x,y)<net.river.width/2+m;
  parts.push(`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" fill="${S.land}"/>`);
  // Village: field patchwork and orchards away from the houses; town and city: parks.
  if(net.size==='village'){
    const fields=['#cfdca5','#e3dba0','#bfd396','#d8cf92','#c7d9a2'];
    for(let i=0;i<70;i++){const x=X0+r()*XW,y=Y0+r()*YH;if(Math.abs(y-net.yAt(x))<200||nearRoad(x,y,40))continue;
      const w=90+r()*150,h=50+r()*90,a=(r()-0.5)*30;parts.push(`<rect x="${(x-w/2).toFixed(0)}" y="${(y-h/2).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="6" fill="${fields[i%fields.length]}" opacity=".85" transform="rotate(${a.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`);
      if(r()<0.5)for(let k=1;k<4;k++)parts.push(`<line x1="${(x-w/2+8).toFixed(0)}" y1="${(y-h/2+k*h/4).toFixed(0)}" x2="${(x+w/2-8).toFixed(0)}" y2="${(y-h/2+k*h/4).toFixed(0)}" stroke="#b9c48a" stroke-width="2" opacity=".6" transform="rotate(${a.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`);}
  }else{
    for(let i=0;i<(net.size==='city'?4:3);i++){const x=TM_W*(0.15+r()*0.7),y=TM_H*(0.12+r()*0.76);if(inRiver(x,y,60))continue;
      parts.push(`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(70+r()*60).toFixed(0)}" ry="${(45+r()*40).toFixed(0)}" fill="#b9d49a" opacity=".9"/>`);}
  }
  if(net.river){parts.push(`<path d="${smooth(net.river.pts)}" stroke="#9cc1dc" stroke-width="${net.river.width+14}" fill="none" stroke-linecap="round"/><path d="${smooth(net.river.pts)}" stroke="#7fb0d6" stroke-width="${net.river.width}" fill="none" stroke-linecap="round"/>`);
    for(let i=0;i<14;i++){const p=net.river.dense[Math.floor(r()*net.river.dense.length)];parts.push(`<path d="M${(p[0]-14).toFixed(0)},${p[1].toFixed(0)} q7,-4 14,0 t14,0" stroke="#d6e8f5" stroke-width="2" fill="none" opacity=".7"/>`);}}
  // Roads: a soft casing under a light surface; the main road has a dashed centre line.
  for(const [i,pts] of [[1,net.main],...net.cross.map(c=>[0,c.pts])]){const w=i?S.road:S.street;
    parts.push(`<path d="${smooth(pts)}" stroke="${S.casing}" stroke-width="${w+5}" fill="none" stroke-linecap="round"/><path d="${smooth(pts)}" stroke="#f6f2e8" stroke-width="${w}" fill="none" stroke-linecap="round"/>`);}
  for(const pts of net.lanes)parts.push(`<path d="M${pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' L')}" stroke="#efe6cf" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="1 0"/>`);
  parts.push(`<path d="${smooth(net.main)}" stroke="#e2c46a" stroke-width="2" stroke-dasharray="14 12" fill="none"/>`);
  // Houses along every road, turned to face it; gardens behind them in a village.
  const houses=[],roofs=[];
  for(const [i,pts] of [[1,net.mainPts],...net.cross.map(c=>[0,c.dense]),...net.lanes.map(l=>[2,l])]){
    const half=(i===1?S.road:i===0?S.street:9)/2;let walked=0;
    for(let k=1;k<pts.length;k++){const [ax,ay]=pts[k-1],[bx,by]=pts[k],seg=Math.hypot(bx-ax,by-ay);walked+=seg;if(walked<S.step)continue;walked=0;
      const ang=Math.atan2(by-ay,bx-ax),nx=-Math.sin(ang),ny=Math.cos(ang);
      for(const side of [-1,1])for(let row=0;row<(i===2?1:S.rows);row++){
        if(r()<(net.size==='village'?0.35:0.12))continue;
        const w=(net.size==='city'?18:14)+r()*14,h=(net.size==='city'?16:11)+r()*9,off=half+8+h/2+row*(h+14);
        const x=bx+nx*side*off,y=by+ny*side*off;
        if(x<X0||x>X0+XW||y<Y0||y>Y0+YH||nearPin(x,y,48)||inRiver(x,y,8)||roads.some((p2,j)=>p2!==pts&&distTo(p2,x,y)<(j===0?S.road:S.street)/2+h))continue;
        if(houses.some(([hx,hy])=>Math.hypot(hx-x,hy-y)<Math.max(w,h)*0.9))continue;houses.push([x,y]);
        const deg=(ang*180/Math.PI).toFixed(1),tr=`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${deg})`;
        if(S.garden&&r()<0.7)roofs.push(`<rect transform="${tr}" x="${(-w/2-6).toFixed(1)}" y="${(side>0?h/2:-h/2-22).toFixed(1)}" width="${(w+12).toFixed(1)}" height="22" rx="3" fill="#c5d89c" opacity=".9"/>`);
        roofs.push(`<g transform="${tr}"><rect x="${(-w/2+2).toFixed(1)}" y="${(-h/2+3).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#000" opacity=".16" rx="1.5"/><rect x="${(-w/2).toFixed(1)}" y="${(-h/2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${S.roof[Math.floor(r()*S.roof.length)]}" rx="1.5"/><line x1="${(-w/2).toFixed(1)}" y1="0" x2="${(w/2).toFixed(1)}" y2="0" stroke="#000" stroke-opacity=".18" stroke-width="1"/></g>`);
      }
    }
  }
  parts.push(...roofs);
  // Tree clumps in the gaps.
  for(let i=0;i<(net.size==='village'?160:80);i++){const x=X0+r()*XW,y=Y0+r()*YH;if(nearRoad(x,y,14)||nearPin(x,y,40)||inRiver(x,y,10)||houses.some(([hx,hy])=>Math.hypot(hx-x,hy-y)<16))continue;
    const s=5+r()*6;parts.push(`<circle cx="${(x+2).toFixed(0)}" cy="${(y+3).toFixed(0)}" r="${s.toFixed(1)}" fill="#000" opacity=".12"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="${['#6f9a52','#7aa65a','#5f8a48'][i%3]}"/>`);}
  if(net.size==='village'){const c=net.cross[Math.floor(net.cross.length/2)];
    parts.push(`<circle cx="${c.x.toFixed(0)}" cy="${c.y.toFixed(0)}" r="40" fill="#efe6cf" stroke="#d8c9a3" stroke-width="3"/><text x="${c.x.toFixed(0)}" y="${(c.y+10).toFixed(0)}" text-anchor="middle" font-size="28">⛪</text>`);}
  parts.push(`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" filter="url(#tm-paper)" opacity=".08" class="tm-paper"/>`);
  if(slot===3)parts.push(`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" fill="#0b1030" opacity=".3"/>`);else if(slot===2)parts.push(`<rect x="${X0}" y="${Y0}" width="${XW}" height="${YH}" fill="#3a1e40" opacity=".16"/>`);
  return parts.join('');
}
// pins: [{id,name,kind,count,avatars:[url],here,rooms}]; image: optional map picture URL.
// height: the plan height for a map picture (its own proportions, 1200 wide); 720 otherwise.
export function townMapSvg({town,pins,saved,image,slot,esc,ariaLabel,editing=false,height=TM_H}){
  const H=image?height:TM_H;
  // Pins without a saved place on a picture start where the drawn plan would put them, scaled.
  const free=Object.fromEntries(Object.entries(saved||{}));const {net,pos:auto}=layoutPins(town,pins,free);
  const pos=new Map([...auto].map(([id,[x,y]])=>[id,saved?.[id]?[x,y]:[x,Math.round(y*H/TM_H)]]));
  const labels=townLabelLayout(pins,pos,{width:TM_W,height:H});
  const bg=image?`<rect x="${X0}" y="${Y0}" width="${XW}" height="${H+720}" fill="#2a2430"/><image href="${esc(image)}" x="0" y="0" width="${TM_W}" height="${H}" preserveAspectRatio="none"/>${slot===3?`<rect width="${TM_W}" height="${H}" fill="#0b1030" opacity=".3"/>`:''}`:ground(net,{slot,town,pins:[...pos.values()]});
  const pin=p=>{const [x,y]=pos.get(p.id),tone=KIND_TONE[p.kind]||KIND_TONE.place,label=labels.get(p.id),name=label.name,w=label.width,dx=label.x+w/2-x,dy=label.y-y;
    const presence=t('play.peopleHereCount',{count:p.count||0}),rooms=t('play.roomsCount',{count:p.rooms||0});
    return `<g class="tm-pin${p.here?' tm-here':''}${editing?' tm-drag':''}" data-town-pin="${esc(p.id)}" transform="translate(${x},${y})" role="button" tabindex="0" aria-label="${esc(p.name+' — '+presence+(p.rooms?' · '+rooms:''))}">
      <title>${esc(p.name)}</title>
      ${p.here?'<circle r="34" class="tm-ring"/>':''}<g filter="url(#tm-shadow)"><circle r="22" fill="#fff"/><circle r="18.5" fill="${tone}" class="tm-dot"/></g><text y="7" text-anchor="middle" font-size="19" class="tm-icon">${KIND_ICON[p.kind]||KIND_ICON.place}</text>
      ${Math.abs(dx)>1||dy!==27?`<path d="M0 0L${dx.toFixed(1)} ${(dy+10).toFixed(1)}" fill="none" stroke="${tone}" stroke-width="2" opacity=".7"/>`:''}
      <g class="tm-pin-label" transform="translate(${dx.toFixed(1)},${dy.toFixed(1)})"><rect x="${(-w/2).toFixed(1)}" width="${w.toFixed(1)}" height="21" rx="10.5" class="tm-label-bg"/><text y="15" text-anchor="middle" class="tm-label">${esc(name)}</text></g>
      ${p.rooms?`<g class="tm-rooms-badge" transform="translate(-20,-18)" role="img" aria-label="${esc(rooms)}"><title>${esc(rooms)}</title><circle r="9" class="tm-rooms-bg"/><text y="4" text-anchor="middle" class="tm-rooms">${p.rooms}</text></g>`:''}
      ${p.count?`<g class="tm-people-badge" transform="translate(21,-19)" role="img" aria-label="${esc(presence)}"><title>${esc(presence)}</title>${p.avatars?.[0]?`<clipPath id="tmc-${esc(p.id)}"><circle r="13"/></clipPath><image href="${esc(p.avatars[0])}" x="-13" y="-13" width="26" height="26" clip-path="url(#tmc-${esc(p.id)})" preserveAspectRatio="xMidYMid slice"/><circle r="13" fill="none" stroke="#ffd166" stroke-width="2.5"/>`:''}<circle cx="11" cy="-10" r="9" class="tm-count-bg"/><text x="11" y="-6" text-anchor="middle" class="tm-count">${p.count}</text></g>`:''}
    </g>`;};
  const c=net.cross[Math.floor(net.cross.length/2)],px=c.x-70,palor=[px,net.yAt(px)];
  // Filters are always defined: a pin pointing to a missing filter would not be drawn at all.
  const defs=`<defs><filter id="tm-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="${hash(town.id)%97}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <filter id="tm-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/></filter></defs>`;
  return `<svg class="tm-map" viewBox="0 0 ${TM_W} ${H}" data-plan-height="${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(ariaLabel)}">${defs}${bg}
    <g class="tm-palor" transform="translate(${palor[0].toFixed(0)},${palor[1].toFixed(0)})" filter="url(#tm-shadow)"><circle r="14" fill="#ffd166" stroke="#5a3d00" stroke-width="3"/><text y="5" text-anchor="middle" font-size="13" font-weight="700" fill="#5a3d00">★</text></g>
    ${pins.map(pin).join('')}</svg>`;
}
// Converts a pointer position to map units (for dragging pins).
export function toMap(svg,e){const H=Number(svg.dataset.planHeight)||TM_H,pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();if(!m)return [0,0];const p=pt.matrixTransform(m.inverse());return [Math.round(Math.max(30,Math.min(TM_W-30,p.x))),Math.round(Math.max(40,Math.min(H-40,p.y)))];}
