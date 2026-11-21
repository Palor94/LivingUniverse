// Local media analysis in the creator's own browser (free, nothing leaves the computer):
//  - a 64-bit difference hash (dHash) per picture, so near-identical pictures form a group;
//  - stills from each video at the planned times (1 every 4 s + the last frame), saved as
//    derived cache files outside OneDrive for a later, separately approved analysis.
// The server checks and stores the results (/api/signals, app/media-signals.mjs).
const once=(el,ev,ms=20000)=>new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(Error('timeout')),ms);el.addEventListener(ev,()=>{clearTimeout(timer);ok();},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);bad(Error('cannot decode'));},{once:true});});

import {differenceHash} from './image-hash.js';

// dHash, the same 9×8 hash as the duplicate finder (image-hash.js), so both share results.
// A 64×64 step first keeps the shrink smooth for large pictures.
function dhash(source,w,h){
  const mid=document.createElement('canvas');mid.width=64;mid.height=64;const m=mid.getContext('2d');m.imageSmoothingQuality='high';m.drawImage(source,0,0,w,h,0,0,64,64);
  const c=document.createElement('canvas');c.width=9;c.height=8;const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(mid,0,0,9,8);
  return differenceHash(g.getImageData(0,0,9,8).data);
}

async function imageSignal(id){
  // A picture that never finishes decoding is recorded as an error after 20 s, like videos.
  const im=new Image();im.decoding='async';im.src='/media/'+encodeURIComponent(id);
  await Promise.race([im.decode(),new Promise((_,bad)=>setTimeout(()=>bad(Error('timeout')),20000))]);
  return {media_id:id,dhash:dhash(im,im.naturalWidth,im.naturalHeight),width:im.naturalWidth,height:im.naturalHeight};
}

export async function videoSignal(id,api){
  // Metadata first: a video that is skipped (over 35 s) is never downloaded in full.
  const v=document.createElement('video');v.muted=true;v.preload='metadata';v.playsInline=true;
  const loaded=once(v,'loadedmetadata');v.src='/media/'+encodeURIComponent(id);await loaded;
  const duration=v.duration;
  // Videos over 35 seconds are skipped (owner decision): only their length is recorded.
  if(duration>35){v.removeAttribute('src');v.load();return {media_id:id,duration,width:v.videoWidth,height:v.videoHeight,frames:[]};}
  v.preload='auto';
  const {times}=await api('/api/signals/plan?duration='+encodeURIComponent(duration));
  const W=v.videoWidth,H=v.videoHeight,scale=Math.min(1,1280/Math.max(W,H)),c=document.createElement('canvas');c.width=Math.round(W*scale);c.height=Math.round(H*scale);
  const g=c.getContext('2d'),frames=[];
  for(const t of times){const seeked=once(v,'seeked');v.currentTime=Math.min(t,Math.max(0,duration-0.05));await seeked;
    g.drawImage(v,0,0,c.width,c.height);frames.push({t,data_url:c.toDataURL('image/jpeg',0.85),dhash:dhash(c,c.width,c.height)});}
  v.removeAttribute('src');v.load();
  return {media_id:id,duration,width:W,height:H,frames};
}

// Runs until everything is done or stop() is called; onProgress gets the running count.
export function createSignalsWorker(api){
  let running=false,working=false;
  // Saving is local and free: a short "busy" answer (e.g. another catalogue write at that
  // moment) is waited out a few times instead of ending the whole run.
  async function send(items){for(let i=0;;i++){try{return await api('/api/signals',{items});}catch(e){if(i>=3||!running)throw e;await new Promise(r=>setTimeout(r,2000*(i+1)));}}}
  async function start(onProgress){
    if(working)return;running=true;working=true;let done=0;
    try{
      while(running){
        const {items}=await api('/api/signals/queue?limit=24');if(!items.length)break;
        const images=items.filter(i=>i.kind==='image'),videos=items.filter(i=>i.kind==='video');
        // Pictures four at a time; a picture that cannot be decoded is recorded, not retried.
        const results=[];
        for(let i=0;i<images.length&&running;i+=4)results.push(...await Promise.all(images.slice(i,i+4).map(x=>imageSignal(x.id).catch(e=>({media_id:x.id,error:e.message})))));
        if(results.length)await send(results);done+=results.length;onProgress?.(done);
        // Videos one at a time (each request carries its stills).
        for(const x of videos){if(!running)break;const r=await videoSignal(x.id,api).catch(e=>({media_id:x.id,error:e.message}));await send([r]);done++;onProgress?.(done);}
      }
    }finally{running=false;working=false;}
    return done;
  }
  return {start,stop:()=>{running=false;},get running(){return running;}};
}
