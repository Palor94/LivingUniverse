import {crowdLayout} from './play-map-layout.js';
// Illustrated world map for Play: an atlas-style picture of the real region (Budapest, Fejér
// county, Lake Balaton). Farmland patchwork, forested hills with relief, vineyards on the
// Balaton uplands, lakes with ripples, the Danube, the M7, road 63 and the railway. Every
// town in the place tree that the map knows gets its own small drawing (Parliament for
// Budapest, the cathedral for Székesfehérvár, a village church for Káloz…), a name ribbon,
// who is there now, and a "you are here" ring. Windows light up at night.
// Everything is inline SVG drawn from code: no map tiles, no outside requests (works
// offline and fits the page CSP). Random-looking detail uses a fixed seed, so the map
// looks the same on every visit.

// Wider than tall (2026-11-14): fills a desktop screen; the east side holds the way to Pécs.
const W=1500,H=880;
// lon/lat → map units (equirectangular, y stretched for 47°N so distances look right).
const P=(lon,lat)=>[Math.round((lon-17.15)*560+40),Math.round((47.62-lat)*830+40)];
const pts=list=>list.map(([lon,lat])=>P(lon,lat));

// Known places by tree name (lower case). art = the drawing; lab = ribbon offset from the
// town point (keeps neighbouring ribbons apart). Pécs lies south of the frame: a signpost.
export const PLACES={
  'budapest':{at:P(19.040,47.497),art:'budapest',lab:[-40,30],scale:1.3},
  'székesfehérvár':{at:P(18.410,47.190),art:'fehervar',lab:[-22,30],scale:1.25,av:-1},
  'gárdony':{at:P(18.620,47.200),art:'gardony',lab:[34,26]},
  'káloz':{at:P(18.485,46.955),art:'village',lab:[0,26]},
  'sárbogárd':{at:P(18.620,46.887),art:'farmtown',lab:[0,26]},
  'balaton':{at:P(17.900,46.840),art:'balaton',lab:[0,26]},
  'm7-es autópálya':{at:P(18.880,47.378),art:'motel',lab:[0,26]},
  // Pécs lies far south; it is reached only by the Budapest – Sárbogárd – Pécs train, so its
  // signpost stands on the east side at the end of that line (owner, 2026-11-14).
  'pécs':{at:[W-120,H-190],art:'signpost',lab:[0,26],offmap:'vonattal, Sárbogárdon át'}
};

// Smooth closed/open path through points (Catmull-Rom → cubic Bézier).
function smooth(points,closed=false){
  const p=closed?[points.at(-1),...points,points[0],points[1]]:[points[0],...points,points.at(-1)];
  let d=`M${points[0][0]},${points[0][1]}`;
  for(let i=1;i<p.length-2;i++){const [a,b,c,e]=[p[i-1],p[i],p[i+1],p[i+2]];
    d+=` C${(b[0]+(c[0]-a[0])/6).toFixed(1)},${(b[1]+(c[1]-a[1])/6).toFixed(1)} ${(c[0]-(e[0]-b[0])/6).toFixed(1)},${(c[1]-(e[1]-b[1])/6).toFixed(1)} ${c[0]},${c[1]}`;}
  return d+(closed?' Z':'');
}
// Deterministic pseudo-random numbers (mulberry32), so the map never "jumps".
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

const BALATON_N=[[18.16,47.03],[18.03,47.03],[17.95,46.99],[17.89,46.955],[17.90,46.92],[17.85,46.91],[17.74,46.87],[17.60,46.82],[17.46,46.78],[17.34,46.76],[17.25,46.73]];
const BALATON=pts([...BALATON_N,[17.24,46.70],[17.30,46.70],[17.45,46.73],[17.58,46.76],[17.70,46.79],[17.85,46.84],[17.98,46.88],[18.07,46.92],[18.13,46.97]]);
const VINES=pts([...BALATON_N.map(([a,b])=>[a,b+0.012]),...BALATON_N.slice().reverse().map(([a,b])=>[a+0.01,b+0.05])]);
const VELENCE=pts([[18.53,47.235],[18.58,47.245],[18.64,47.235],[18.69,47.222],[18.67,47.205],[18.61,47.205],[18.55,47.215]]);
const DANUBE=pts([[19.07,47.66],[19.06,47.58],[19.05,47.50],[19.02,47.42],[18.97,47.32],[18.94,47.20],[18.93,47.06],[18.94,46.96],[18.91,46.84],[18.87,46.70],[18.86,46.60]]);
const SIO=pts([[18.05,46.905],[18.12,46.86],[18.20,46.82],[18.30,46.78],[18.42,46.72],[18.55,46.62]]);
const M7=pts([[19.04,47.48],[18.93,47.40],[18.80,47.32],[18.66,47.25],[18.52,47.21],[18.36,47.13],[18.20,47.04],[18.06,46.95],[17.92,46.88],[17.72,46.80],[17.55,46.74]]);
const ROAD63=pts([[18.41,47.19],[18.44,47.08],[18.485,46.955],[18.56,46.92],[18.62,46.887]]);
const RAIL=pts([[19.02,47.47],[18.86,47.37],[18.70,47.215],[18.55,47.195],[18.41,47.185],[18.30,47.10],[18.24,46.99],[18.12,46.93],[18.05,46.905]]);
const RAIL2=pts([[18.41,47.185],[18.50,47.07],[18.57,46.96],[18.62,46.887],[18.66,46.75]]);
// Line 40 on from Sárbogárd: drawn east to the Pécs signpost at the edge of the map.
const RAIL3=[P(18.620,46.887),[P(18.62,46.887)[0]+120,P(18.62,46.887)[1]+38],[W-330,H-182],[W-150,H-190]];
const FOREST={c:P(18.25,46.80),r:[155,72],rot:-14},LAKE={c:P(18.30,46.862),r:[38,19]},PARKING=P(18.375,46.838),PEAK=P(18.10,46.735);
function countrySide(rnd,esc){
  const [fx,fy]=FOREST.c,[lx,ly]=LAKE.c;
  let s=`<g class="lm-region-hit" data-play-region="kaloz-hatara" tabindex="0" role="button" aria-label="Káloz határa: tó, erdő, hegy"><title>Káloz határa · tó, erdő, hegy</title>`;
  s+=`<g transform="translate(${fx},${fy}) rotate(${FOREST.rot})"><ellipse rx="${FOREST.r[0]+16}" ry="${FOREST.r[1]+14}" fill="#2f4a2a" opacity=".35" filter="url(#lm-soft)"/><ellipse rx="${FOREST.r[0]}" ry="${FOREST.r[1]}" fill="#4f6f45" opacity=".55"/>`;
  for(let i=0;i<230;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd()),x=Math.cos(a)*d*FOREST.r[0],y=Math.sin(a)*d*FOREST.r[1],r=4+rnd()*4;
    s+=`<circle cx="${(x+1.5).toFixed(0)}" cy="${(y+2).toFixed(0)}" r="${r.toFixed(1)}" fill="#22361f" opacity=".5"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${['#3f6a3a','#4c7a44','#355d33'][i%3]}"/>`;}
  s+='</g>';
  // The mountain: a few rocky peaks over the far end of the forest.
  const [px,py]=PEAK;s+=`<g transform="translate(${px},${py})" filter="url(#lm-shadow)"><path d="M-46 14L-18 -34L2 -6L20 -46L52 14Z" fill="#8a8170" stroke="#4d4636" stroke-width="1.4"/><path d="M-18 -34L-10 -20L-24 -22ZM20 -46L28 -30L12 -32Z" fill="#f4f0e6"/></g><text class="lm-region" x="${px}" y="${py+34}" text-anchor="middle">Hegy</text>`;
  s+=`<text class="lm-region" x="${fx-10}" y="${fy+6}" text-anchor="middle">Erdő</text>`;
  // The lake with its small sandy shore on the village side.
  s+=`<ellipse cx="${lx}" cy="${ly}" rx="${LAKE.r[0]+7}" ry="${LAKE.r[1]+6}" fill="#efe6c8"/><ellipse cx="${lx}" cy="${ly}" rx="${LAKE.r[0]}" ry="${LAKE.r[1]}" fill="url(#lm-water)"/><ellipse cx="${lx}" cy="${ly}" rx="${LAKE.r[0]}" ry="${LAKE.r[1]}" fill="url(#lm-ripple)"/><text class="lm-water" x="${lx}" y="${ly+5}" text-anchor="middle">Tó</text>`;
  // The forest car park at the edge nearest Káloz, with the dirt road from the village.
  const [kx,ky]=P(18.485,46.955),[cx,cy]=PARKING;
  s+=`<path d="M${kx-6},${ky+8} Q${(kx+cx)/2+18},${(ky+cy)/2} ${cx},${cy}" fill="none" stroke="#a88a5a" stroke-width="3" stroke-dasharray="6 4"/><g transform="translate(${cx},${cy})"><rect x="-9" y="-9" width="18" height="18" rx="3" fill="#1f5fa8" stroke="#fff" stroke-width="1.6"/><text class="lm-shield" y="5" text-anchor="middle">P</text></g>`;
  return s+'</g>';
}
const HILLS=[{name:'Vértes',c:P(18.35,47.40),r:[120,55],rot:-25,n:120},{name:'Bakony',c:P(17.75,47.20),r:[150,85],rot:-20,n:200},{name:'Velencei-hegység',c:P(18.60,47.285),r:[46,15],rot:-10,n:26,quiet:true}];
// Orientation only: real towns that are not places in the game (small grey dots, not clickable).
const LANDMARKS=[['Veszprém',17.91,47.093,1],['Siófok',18.05,46.905,1],['Dunaújváros',18.93,46.96,-1],['Enying',18.24,46.93,1],['Tihany',17.89,46.915,-1]];

// ---- small drawings (ground line at y=0, roughly 100×70 units) --------------------------
const ink='class="lm-ink"';
const win=(x,y,w=4,h=5)=>`<rect class="lm-win" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
function house(x,w=16,h=12,roof='#b8573c',wall='#f3e8cf'){
  return `<g transform="translate(${x},0)"><rect x="${-w/2}" y="${-h}" width="${w}" height="${h}" fill="${wall}" ${ink}/><path d="M${-w/2-2} ${-h}L0 ${-h-w*.5}L${w/2+2} ${-h}Z" fill="${roof}" ${ink}/>${win(-w/4-2,-h*.7)}${win(w/4-2,-h*.7)}</g>`;
}
function tree(x,y=0,r=7,c='#6f9161'){return `<g transform="translate(${x},${y})"><rect x="-1.2" y="-5" width="2.4" height="5" fill="#6b5236"/><circle cy="${-5-r*.8}" r="${r}" fill="${c}" ${ink}/><circle cx="${-r*.3}" cy="${-5-r}" r="${r*.45}" fill="#ffffff" opacity=".18"/></g>`;}
function church(x,h=40){
  return `<g transform="translate(${x},0)"><rect x="-4" y="-16" width="24" height="16" fill="#f3e8cf" ${ink}/><path d="M-6 -16L8 -25L22 -16Z" fill="#b8573c" ${ink}/><rect x="-11" y="${-h+12}" width="11" height="${h-12}" fill="#f6eedb" ${ink}/><path d="M-12.5 ${-h+12}L-5.5 ${-h-6}L1.5 ${-h+12}Z" fill="#5e7f86" ${ink}/><path d="M-5.5 ${-h-6}v-7M-8 ${-h-10}h5" stroke="#4d3f2e" stroke-width="1.4"/>${win(-7.5,-h+18,4,6)}<path d="M5 0v-7a3 3 0 0 1 6 0v7" fill="#7a5a3a"/></g>`;
}
function boat(x,y,s=1){return `<g transform="translate(${x},${y}) scale(${s})"><path d="M-12 0h24l-4 5h-16Z" fill="#8a5a3a" ${ink}/><path d="M0 -1V-26L13 -3Z" fill="#fffaf0" ${ink}/><path d="M-1 -3V-20L-10 -3Z" fill="#e2563c" ${ink}/></g>`;}
function car(x,c='#c84b3a'){return `<g transform="translate(${x},0)"><path d="M-9 -3v-4l3-4h9l4 4h3v4Z" fill="${c}" ${ink}/><circle cx="-5" cy="-2" r="2.4" fill="#2b2b2b"/><circle cx="6" cy="-2" r="2.4" fill="#2b2b2b"/></g>`;}

const ART={
  // Parliament on the Danube bank, apartment blocks behind, Chain Bridge in front.
  budapest:()=>`<rect x="-52" y="-30" width="16" height="30" fill="#e9dcc0" ${ink}/>${win(-48,-25)}${win(-42,-25)}${win(-48,-16)}${win(-42,-16)}
    <rect x="34" y="-34" width="18" height="34" fill="#e9dcc0" ${ink}/>${win(38,-28)}${win(44,-28)}${win(38,-19)}${win(44,-19)}
    <rect x="-40" y="-18" width="80" height="18" fill="#f4ead2" ${ink}/><path d="M-42 -18h84l-4 -5h-76Z" fill="#a8473a" ${ink}/>
    ${[-34,-24,-14,14,24,34].map(x=>`<path d="M${x-2} -23v-6l2 -5 2 5v6" fill="#f4ead2" ${ink}/>`).join('')}
    <rect x="-10" y="-34" width="20" height="16" fill="#f4ead2" ${ink}/><path d="M-12 -34a12 13 0 0 1 24 0Z" fill="#7a3a33" ${ink}/><path d="M0 -47v-9" stroke="#4d3f2e" stroke-width="1.6"/>
    ${[-30,-20,-6,6,20,30].map(x=>win(x-2,-13,3.5,6)).join('')}
    <path d="M-56 8h112" stroke="#6d6a62" stroke-width="3"/><path d="M-56 8Q-28 -4 0 8Q28 -4 56 8" fill="none" stroke="#6d6a62" stroke-width="1.4"/><rect x="-3" y="-1" width="6" height="11" fill="#d8ccb0" ${ink}/>`,
  // Cathedral with twin towers among old-town houses.
  fehervar:()=>`${house(-34,16,12)}${house(-18,14,10,'#9a4a34')}${house(32,16,12)}${house(46,12,9,'#9a4a34')}
    <rect x="-9" y="-24" width="20" height="24" fill="#f5ecd6" ${ink}/><path d="M-11 -24L1 -32L13 -24Z" fill="#8f3f30" ${ink}/>
    ${[-12,8].map(x=>`<rect x="${x}" y="-42" width="7" height="42" fill="#f8f0dc" ${ink}/><path d="M${x-1} -42q4.5 -9 9 0Z" fill="#4f7a74" ${ink}/><path d="M${x+3.5} -51v-5" stroke="#4d3f2e" stroke-width="1.3"/>${win(x+1.5,-36,4,6)}`).join('')}
    <path d="M-2 0v-9a3 3 0 0 1 6 0v9" fill="#7a5a3a"/>${tree(-48,0,6)}${tree(60,0,5,'#7aa06a')}`,
  // Lakeside resort: houses, a pier and a sailboat on the Velencei-tó.
  gardony:()=>`${house(-20,16,11,'#c7653f')}${house(-2,14,10)}${tree(14,0,6)}<path d="M18 -4h30" stroke="#7a5a3a" stroke-width="3"/>${[24,32,40].map(x=>`<path d="M${x} -4v6" stroke="#7a5a3a" stroke-width="1.5"/>`).join('')}${boat(30,-30,.85)}${boat(56,-40,.6)}`,
  // Village: church, cottages, orchards.
  village:()=>`${tree(-40,0,6,'#7aa06a')}${house(-26,14,10,'#c7653f')}${church(0,40)}${house(32,14,10)}${tree(46,0,6)}${tree(54,-2,5,'#7aa06a')}`,
  // Farm town on the plain: houses, a grain silo and the water tower.
  farmtown:()=>`${house(-34,16,11)}${house(-16,14,10,'#9a4a34')}<rect x="0" y="-34" width="12" height="34" fill="#e7dcc1" ${ink}/><path d="M-1 -34a7 5 0 0 1 14 0Z" fill="#9aa3a6" ${ink}/><rect x="13" y="-26" width="9" height="26" fill="#ddd2b6" ${ink}/>
    <path d="M34 0l3 -26M44 0l-3 -26" stroke="#5c5440" stroke-width="1.6"/><ellipse cx="39" cy="-31" rx="10" ry="7" fill="#d9e1e4" ${ink}/>${tree(56,0,6)}`,
  // Lake Balaton: sailboats, a lighthouse, beach umbrellas.
  balaton:()=>`${boat(-34,-8,1)}${boat(-6,-22,.75)}<rect x="22" y="-34" width="8" height="34" fill="#fbf6ea" ${ink}/><rect x="22" y="-26" width="8" height="6" fill="#d04a35"/><rect x="22" y="-12" width="8" height="6" fill="#d04a35"/><path d="M20 -34h12l-2 -6h-8Z" fill="#3c4a55" ${ink}/><circle class="lm-lamp" cx="26" cy="-37" r="2"/>
    ${[40,52].map((x,i)=>`<path d="M${x} 0v-14" stroke="#5c5440" stroke-width="1.3"/><path d="M${x-8} -14a8 5 0 0 1 16 0Z" fill="${i?'#f2c14e':'#e2563c'}" ${ink}/>`).join('')}`,
  // Motorway rest stop: motel, fuel canopy, cars.
  motel:()=>`<rect x="-44" y="-20" width="44" height="20" fill="#f1e6cd" ${ink}/><path d="M-46 -20h48v-4h-48Z" fill="#3d6aa6" ${ink}/>${[-40,-32,-24,-16,-8].map(x=>win(x,-15,5,5)).join('')}<text class="lm-artlabel" x="-22" y="-26" text-anchor="middle">MOTEL</text>
    <path d="M10 -24h40v4h-40Z" fill="#e2563c" ${ink}/><path d="M16 0v-20M44 0v-20" stroke="#5c5440" stroke-width="2"/><rect x="26" y="-12" width="8" height="12" fill="#e7e7e7" ${ink}/>${car(-30,'#3d6aa6')}${car(60)}`,
  // Off-map signpost for Pécs.
  signpost:()=>`<path d="M0 0v-40" stroke="#6b5236" stroke-width="4"/><path d="M-36 -44h58l10 8-10 8h-58Z" fill="#c9a46a" ${ink}/><text class="lm-artlabel lm-sign" x="-4" y="-32" text-anchor="middle">PÉCS →</text>`
};
const FALLBACK=()=>`${house(-14,16,12)}${house(6,14,10,'#9a4a34')}${tree(24,0,6)}`;

const TINT=['rgba(255,214,150,.10)','','rgba(255,120,60,.16)','rgba(8,18,52,.56)'];

export function mapSvg({towns,label,peopleIn,placeCount,palorTownId,slot,avatar,esc,ariaLabel}){
  const night=slot===3,rnd=seeded(20261110);
  const shown=towns.map(n=>({n,g:PLACES[n.name.toLocaleLowerCase('hu')]})).filter(x=>x.g);
  const here=shown.find(x=>x.n.id===palorTownId);
  const ribbons=shown.map(({n,g})=>{
    const people=peopleIn(n.id),places=placeCount(n.id),name=label(n),title=(n.id===palorTownId?'★ ':'')+name;
    // Only the name, and the way there when it is off the map (owner, 2026-11-21: no place and
    // people counts under every city; the face badge already shows who is there).
    const sub=g.offmap||'',width=Math.max(84,title.length*8.8+34,sub.length*6.3+30);
    // One face plus a count badge: the crowd box is sized for two circles at most.
    return {id:n.id,x:Math.max(24,Math.min(W-width-24,g.at[0]+g.lab[0]-width/2)),y:g.at[1]+g.lab[1]-6,width,height:sub?34:24,count:Math.min(2,people.length),title,sub};
  });
  const crowds=crowdLayout(ribbons),frontRibbons=[];
  let s=`<svg class="play-svg lu-map${night?' lm-night':''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}"${here?` data-focus="${(here.g.at[0]/W).toFixed(3)}"`:''}>
  <defs>
    <linearGradient id="lm-land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dfb6"/><stop offset=".5" stop-color="#c6d19f"/><stop offset="1" stop-color="#b3c48d"/></linearGradient>
    <radialGradient id="lm-water" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#6db3d1"/><stop offset=".7" stop-color="#4790b5"/><stop offset="1" stop-color="#357aa0"/></radialGradient>
    <pattern id="lm-ripple" width="34" height="14" patternUnits="userSpaceOnUse"><path d="M2 8q4-4 8 0t8 0" fill="none" stroke="#e9f6fb" stroke-width="1.2" opacity=".45"/></pattern>
    <pattern id="lm-vine" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><path d="M0 3.5h7" stroke="#6c8a4e" stroke-width="1.6" stroke-dasharray="2 1.2"/></pattern>
    <filter id="lm-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .08 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="lm-soft"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="lm-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#2a2414" flood-opacity=".35"/></filter>
    <radialGradient id="lm-glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="lm-vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#3a3020" stop-opacity="0"/><stop offset="1" stop-color="#3a3020" stop-opacity=".22"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#lm-land)"/>`;
  // Farmland patchwork (the "seen from above" look): jittered, tilted fields.
  const FIELD=['#c9d49a','#b5c483','#d8d29a','#a9bd7e','#cfc78c','#bfcf92','#d6dcae'];
  for(let gy=-1;gy<H/52+1;gy++)for(let gx=-1;gx<W/70+1;gx++){
    const x=gx*70+rnd()*16,y=gy*52+rnd()*14,w=58+rnd()*22,h=40+rnd()*16;
    s+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${FIELD[Math.floor(rnd()*FIELD.length)]}" opacity=".55" transform="rotate(${(rnd()*10-5).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})" rx="2"/>`;
  }
  s+=`<rect width="${W}" height="${H}" fill="#000" filter="url(#lm-grain)"/>`;
  // Scattered copses (kept away from the town drawings).
  const busy=shown.map(x=>x.g.at);
  for(let i=0;i<70;i++){const x=40+rnd()*(W-80),y=40+rnd()*(H-80);if(busy.some(([bx,by])=>Math.hypot(bx-x,by-y)<95))continue;
    for(let k=0;k<3;k++)s+=`<circle cx="${(x+rnd()*14-7).toFixed(0)}" cy="${(y+rnd()*10-5).toFixed(0)}" r="${(3+rnd()*3).toFixed(1)}" fill="${rnd()>.5?'#6f9161':'#5f8455'}" opacity=".8"/>`;}
  // Hills: soft shadow, contour lines, then a forest of individual crowns.
  for(const h of HILLS){
    s+=`<g transform="translate(${h.c[0]},${h.c[1]}) rotate(${h.rot})"><ellipse rx="${h.r[0]+14}" ry="${h.r[1]+12}" fill="#4f6440" opacity=".28" filter="url(#lm-soft)"/>`;
    for(const k of [1,.72,.45])s+=`<ellipse rx="${(h.r[0]*k).toFixed(0)}" ry="${(h.r[1]*k).toFixed(0)}" fill="none" stroke="#7d7450" stroke-width="1" opacity=".35"/>`;
    for(let i=0;i<h.n;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd()),x=Math.cos(a)*d*h.r[0],y=Math.sin(a)*d*h.r[1],r=4+rnd()*4;
      s+=`<circle cx="${(x+1.5).toFixed(0)}" cy="${(y+2).toFixed(0)}" r="${r.toFixed(1)}" fill="#3f5a36" opacity=".45"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${['#6f9161','#5f8455','#7aa06a'][i%3]}"/>`;}
    s+='</g>';
  }
  for(const h of HILLS.filter(h=>!h.quiet))s+=`<text class="lm-region" x="${h.c[0]}" y="${h.c[1]+5}" text-anchor="middle">${esc(h.name)}</text>`;
  // Vineyards on the Balaton uplands.
  s+=`<path d="${smooth(VINES,true)}" fill="#d7d39a" opacity=".4"/><path d="${smooth(VINES,true)}" fill="url(#lm-vine)" opacity=".5"/>`;
  // Water: Danube and Sió, then the lakes with a sandy shore and ripples.
  for(const r of [DANUBE]){const w=10;s+=`<path d="${smooth(r)}" fill="none" stroke="#efe6c8" stroke-width="${w+6}" stroke-linecap="round" opacity=".8"/><path d="${smooth(r)}" fill="none" stroke="#4790b5" stroke-width="${w}" stroke-linecap="round"/>`;}
  for(const [shape,name,at] of [[BALATON,'Balaton',P(17.52,46.795)],[VELENCE,'Velencei-tó',P(18.80,47.232)]])
    s+=`<path d="${smooth(shape,true)}" fill="#efe6c8" stroke="#efe6c8" stroke-width="9"/><path d="${smooth(shape,true)}" fill="url(#lm-water)"/><path d="${smooth(shape,true)}" fill="url(#lm-ripple)"/><text class="lm-water" x="${at[0]}" y="${at[1]+5}" text-anchor="middle">${name}</text>`;
  const dl=P(18.985,47.12);s+=`<text class="lm-water" x="${dl[0]}" y="${dl[1]}" transform="rotate(-80 ${dl[0]} ${dl[1]})" text-anchor="middle">Duna</text>`;
  // Railway (black and white ties), road 63, then the M7 with its shield.
  // The countryside of Káloz (owner, 2026-11-14): a large forest south-west of the village like
  // the Bakony or Vértes, the lake beside it nearer the village, the forest car park at the
  // village-side edge, and the little-explored mountain rising from the far side. One click opens
  // its own map (Káloz határa).
  s+=countrySide(rnd,esc);
  for(const r of [RAIL,RAIL2,RAIL3])s+=`<path d="${smooth(r)}" fill="none" stroke="#3b3a36" stroke-width="3.2"/><path d="${smooth(r)}" fill="none" stroke="#f4f0e4" stroke-width="1.6" stroke-dasharray="7 7"/>`;
  s+=`<path d="${smooth(ROAD63)}" fill="none" stroke="#7d6a4c" stroke-width="7" stroke-linecap="round" opacity=".6"/><path d="${smooth(ROAD63)}" fill="none" stroke="#f6e7bc" stroke-width="3.5" stroke-linecap="round"/>`;
  s+=`<path d="${smooth(M7)}" fill="none" stroke="#6b4a2a" stroke-width="11" stroke-linecap="round" opacity=".55"/><path d="${smooth(M7)}" fill="none" stroke="#f2b84b" stroke-width="6" stroke-linecap="round"/><path d="${smooth(M7)}" fill="none" stroke="#fff6dc" stroke-width="1.2" stroke-dasharray="10 9"/>`;
  const shield=P(18.25,47.07);s+=`<g transform="translate(${shield[0]},${shield[1]})" filter="url(#lm-shadow)"><rect x="-17" y="-11" width="34" height="22" rx="5" fill="#1f5fa8" stroke="#fff" stroke-width="2"/><text class="lm-shield" y="5" text-anchor="middle">M7</text></g>`;
  const r63=P(18.455,47.05);s+=`<g transform="translate(${r63[0]},${r63[1]})"><rect x="-12" y="-9" width="24" height="18" rx="4" fill="#fff" stroke="#4d3f2e" stroke-width="1.5"/><text class="lm-shield lm-shield-dark" y="4.5" text-anchor="middle">63</text></g>`;
  // Orientation towns (not places in the game).
  for(const [name,lon,lat,side] of LANDMARKS){const [x,y]=P(lon,lat);s+=`<circle cx="${x}" cy="${y}" r="3.2" fill="#fbf6e6" stroke="#5c5440" stroke-width="1.4"/><text class="lm-landmark" x="${x+side*7}" y="${y+4}" text-anchor="${side>0?'start':'end'}">${name}</text>`;}
  // Time-of-day tint, then a soft frame vignette.
  if(TINT[slot])s+=`<rect width="${W}" height="${H}" fill="${TINT[slot]}" pointer-events="none"/>`;
  s+=`<rect width="${W}" height="${H}" fill="url(#lm-vignette)" pointer-events="none"/>`;
  // Towns: drawing, "you are here" ring, ribbon with counts, and who is there now.
  for(const {n,g} of shown){
    const [x,y]=g.at,isHere=n.id===palorTownId,people=peopleIn(n.id),places=placeCount(n.id),name=label(n);
    s+=`<g class="lm-pin${isHere?' lm-here':''}" data-play-town="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(name)}"><title>${esc(name)}</title>`;
    if(night)s+=`<circle cx="${x}" cy="${y-14}" r="70" fill="url(#lm-glow)"/>`;
    s+=`<ellipse cx="${x}" cy="${y+3}" rx="62" ry="15" class="lm-ground"/>`;
    if(isHere)s+=`<ellipse class="lm-pulse" cx="${x}" cy="${y+3}" rx="64" ry="17"/>`;
    s+=`<g transform="translate(${x},${y})" filter="url(#lm-shadow)"><g class="lm-art"><g transform="scale(${g.scale||1})">${(ART[g.art]||FALLBACK)()}</g></g></g>`;
    const ribbon=ribbons.find(r=>r.id===n.id),{title,sub,width:pw}=ribbon,lx=ribbon.x+pw/2,ly=ribbon.y+6;
    const ribbonHtml=`<g class="lm-ribbon" transform="translate(${lx},${ly})" filter="url(#lm-shadow)"><path d="M${-pw/2-10} 4l8 -8v${sub?28:20}l-8 -8Z M${pw/2+10} 4l-8 -8v${sub?28:20}l8 -8Z" class="lm-ribbon-tail"/><rect x="${-pw/2}" y="-6" width="${pw}" height="${sub?34:24}" rx="3" class="lm-plate"/><text class="lm-name" y="11" text-anchor="middle">${esc(title)}</text>${sub?`<text class="lm-sub" y="24" text-anchor="middle">${esc(sub)}</text>`:''}</g>`;
    s+=ribbonHtml;frontRibbons.push(ribbonHtml);
    // One round portrait above the drawing and, with more people there, how many in all.
    const crowd=crowds.get(n.id),ax=i=>(crowd?.x||0)+14+i*24,ay=(crowd?.y||0)+14;
    if(people.length)s+='<g class="lm-crowd">';
    people.slice(0,1).forEach((p,i)=>{const px=ax(i),src=avatar(p);
      s+=`<g filter="url(#lm-shadow)"><clipPath id="lm-av-${esc(n.id)}-${i}"><circle cx="${px}" cy="${ay}" r="12"/></clipPath><circle cx="${px}" cy="${ay}" r="14" fill="#fffaf0" stroke="#5c5440" stroke-width="1"/>${src?`<image href="${esc(src)}" x="${px-12}" y="${ay-12}" width="24" height="24" preserveAspectRatio="xMidYMid slice" clip-path="url(#lm-av-${esc(n.id)}-${i})"/>`:`<circle cx="${px}" cy="${ay}" r="12" fill="#b8452d"/><text class="lm-initial" x="${px}" y="${ay+4}" text-anchor="middle">${esc(p.name[0]||'?')}</text>`}<title>${esc(p.name)}</title></g>`;});
    if(people.length>1)s+=`<g><circle cx="${ax(1)}" cy="${ay}" r="12" fill="#3d3a33"/><text class="lm-more" x="${ax(1)}" y="${ay+4}" text-anchor="middle">${people.length}</text></g>`;
    if(people.length)s+='</g>';
    s+='</g>';
  }
  s+=`<g class="lm-front-ribbons" aria-hidden="true" pointer-events="none">${frontRibbons.join('')}</g>`;
  // Cartouche, compass, scale bar and a double frame.
  s+=`<g transform="translate(34,34)" filter="url(#lm-shadow)"><rect width="250" height="66" rx="6" class="lm-cartouche"/><rect x="5" y="5" width="240" height="56" rx="4" fill="none" stroke="#8a7650" stroke-width="1"/><text class="lm-title" x="125" y="32" text-anchor="middle">Világtérkép</text><text class="lm-subtitle" x="125" y="50" text-anchor="middle">Budapest · Fejér · Balaton</text></g>`;
  s+=`<g transform="translate(${W-74},${H-92})" class="lm-compass"><circle r="32" fill="rgba(255,250,236,.75)" stroke="#5c5440" stroke-width="1.5"/><circle r="25" fill="none" stroke="#5c5440" stroke-width=".8" stroke-dasharray="2 3"/><path d="M0-26L7 0 0 26-7 0Z" fill="#5c5440"/><path d="M0-26L7 0H-7Z" fill="#b8452d"/><path d="M-26 0L0 5 26 0 0-5Z" fill="#8a7650" opacity=".6"/><text y="-38" text-anchor="middle">É</text></g>`;
  const km20=Math.round(560*20/75);s+=`<g transform="translate(44,${H-44})" class="lm-scale"><rect x="-8" y="-24" width="${km20+16}" height="38" rx="5" fill="rgba(255,250,236,.75)"/><rect width="${km20}" height="6" fill="#5c5440"/><rect width="${km20/4}" height="6" fill="#f4efe0"/><rect x="${km20/2}" width="${km20/4}" height="6" fill="#f4efe0"/><text y="-8">0</text><text x="${km20}" y="-8" text-anchor="end">20 km</text></g>`;
  s+=`<rect x="6" y="6" width="${W-12}" height="${H-12}" rx="10" fill="none" stroke="#5c4a2e" stroke-width="3"/><rect x="13" y="13" width="${W-26}" height="${H-26}" rx="7" fill="none" stroke="#8a7650" stroke-width="1"/>`;
  return s+'</svg>';
}
