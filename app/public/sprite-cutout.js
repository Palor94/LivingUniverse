// Removes a plain (green, white, grey…) background from a character figure, in the
// browser, so the figure can stand on a location background. The background colour is
// taken from the picture's border; only pixels connected to the border and close to that
// colour are cleared (so a white shirt inside the figure stays). Pictures that already
// have transparent corners are used as they are. Results are cached per page session.
const cache=new Map();
// The finished cut-outs are also kept in the browser's Cache storage (2026-11-13), keyed by the
// figure URL with its version, so a figure is cut out once, not on every start. Without Cache
// storage (private window, old browser) it simply works per session as before.
const STORE='lu-cutouts-v1';
async function stored(url){try{const c=await caches.open(STORE),r=await c.match(url);return r?await r.text():null;}catch{return null;}}
async function keep(url,dataUrl){try{if(!dataUrl.startsWith('data:'))return;const c=await caches.open(STORE);await c.put(url,new Response(dataUrl,{headers:{'Content-Type':'text/plain'}}));}catch{}}
export function cutout(url){if(!cache.has(url))cache.set(url,(async()=>{const hit=await stored(url);if(hit)return hit;const out=await make(url);keep(url,out);return out;})().catch(()=>url));return cache.get(url);}

async function make(url){
  const img=new Image();img.decoding='async';img.src=url;await img.decode();
  const scale=Math.min(1,1600/img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  const frame=ctx.getImageData(0,0,w,h),d=frame.data,at=(x,y)=>(y*w+x)*4;
  // Already transparent (e.g. a PNG cut-out): no keying, only the empty margins are trimmed.
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([x,y])=>d[at(x,y)+3]);
  if(corners.every(a=>a<20))return trimmed(canvas,ctx,frame,w,h);
  // Background colour = per-channel median of border samples.
  const border=[];for(let x=0;x<w;x+=3){border.push(at(x,0),at(x,h-1));}for(let y=0;y<h;y+=3){border.push(at(0,y),at(w-1,y));}
  const median=c=>{const v=border.map(i=>d[i+c]).sort((a,b)=>a-b);return v[v.length>>1];};
  const bg=[median(0),median(1),median(2)];
  const dist=i=>Math.hypot(d[i]-bg[0],d[i+1]-bg[1],d[i+2]-bg[2]);
  const TOL=58,SOFT=95,greenScreen=bg[1]>bg[0]+40&&bg[1]>bg[2]+40;
  const seen=new Uint8Array(w*h),stack=[];
  const push=(x,y)=>{const p=y*w+x;if(seen[p])return;seen[p]=1;const i=p*4,dd=dist(i);
    if(dd<TOL){d[i+3]=0;stack.push(p);}
    else if(dd<SOFT){d[i+3]=Math.min(d[i+3],Math.round((dd-TOL)/(SOFT-TOL)*255));if(greenScreen)d[i+1]=Math.min(d[i+1],Math.round((d[i]+d[i+2])/2)+12);}};
  const drain=()=>{while(stack.length){const p=stack.pop(),x=p%w,y=(p-x)/w;if(x>0)push(x-1,y);if(x<w-1)push(x+1,y);if(y>0)push(x,y-1);if(y<h-1)push(x,y+1);}};
  for(let x=0;x<w;x++){push(x,0);push(x,h-1);}for(let y=0;y<h;y++){push(0,y);push(w-1,y);}
  drain();
  // Green screen only: background pockets enclosed by the figure (between arm and body,
  // between the legs) are not connected to the border. Clear every still-untouched
  // key-coloured region big enough not to be a stray speck. A plain white/grey backdrop
  // is skipped here, since a white shirt would match it.
  if(greenScreen){
    const MIN=Math.max(24,Math.round(w*h/40000)),comp=[];
    for(let s=0;s<w*h;s++){
      if(seen[s]||dist(s*4)>=TOL)continue;
      comp.length=0;seen[s]=1;comp.push(s);
      for(let k=0;k<comp.length;k++){const p=comp[k],x=p%w,y=(p-x)/w;
        for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])
          if(q>=0&&!seen[q]&&dist(q*4)<TOL){seen[q]=1;comp.push(q);}}
      if(comp.length<MIN)continue;
      for(const p of comp)seen[p]=0;
      for(const p of comp)push(p%w,(p-p%w)/w);
      drain();
    }
  }
  ctx.putImageData(frame,0,0);
  return trimmed(canvas,ctx,frame,w,h);
}
// Crops the empty space around the figure (2026-11-13): figures saved with more room above the
// head looked smaller on the stage. The scene then scales every trimmed figure by his height.
// data: URL (the page's security policy allows data: images, not blob:).
function trimmed(canvas,ctx,frame,w,h){
  const d=frame.data;let top=h,bottom=-1,left=w,right=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>24){if(y<top)top=y;if(y>bottom)bottom=y;if(x<left)left=x;if(x>right)right=x;}
  if(bottom<0||bottom-top<h*0.2)return canvas.toDataURL('image/png');
  const pad=Math.round((bottom-top)*0.01),x0=Math.max(0,left-pad),y0=Math.max(0,top-pad),cw=Math.min(w,right+pad+1)-x0,ch=Math.min(h,bottom+pad+1)-y0;
  const out=document.createElement('canvas');out.width=cw;out.height=ch;out.getContext('2d').drawImage(canvas,x0,y0,cw,ch,0,0,cw,ch);
  return out.toDataURL('image/png');
}
