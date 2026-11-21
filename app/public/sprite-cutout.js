// Pixel processing runs in a worker. Versioned derived WebP images stay in the
// browser cache outside OneDrive; originals and canonical references are unchanged.
const cache=new Map(),pending=new Map(),STORE='lu-cutouts-v2-webp';
let worker=null,seq=0,unsupported=false;
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
async function stored(url){try{const response=await(await caches.open(STORE)).match(url);return response?await response.blob():null;}catch{return null;}}
async function keep(url,blob){try{const store=await caches.open(STORE);await store.put(url,new Response(blob,{headers:{'Content-Type':blob.type,'Cache-Control':'private, max-age=31536000, immutable'}}));const keys=await store.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-128)).map(key=>store.delete(key)));}catch{}}
function stopWorker(){unsupported=true;worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timer);job.resolve(null);}pending.clear();}
function process(url){
  if(unsupported)return Promise.resolve(null);
  if(!worker){
    try{
      worker=new Worker(new URL('./sprite-cutout-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);job.resolve(data.blob||null);};
      worker.onerror=stopWorker;
    }catch{unsupported=true;return Promise.resolve(null);}
  }
  return new Promise(resolve=>{const id=++seq,timer=setTimeout(stopWorker,30000);pending.set(id,{resolve,timer});try{worker.postMessage({id,url});}catch{stopWorker();}});
}
export function cutout(url){
  if(cache.has(url)){const hit=cache.get(url);cache.delete(url);cache.set(url,hit);return hit;}
  const result=(async()=>{const hit=await stored(url);if(hit)return dataUrl(hit);const blob=await process(url);if(!blob)return url;void keep(url,blob);return dataUrl(blob);})().catch(()=>url);
  cache.set(url,result);if(cache.size>64)cache.delete(cache.keys().next().value);
  return result;
}
