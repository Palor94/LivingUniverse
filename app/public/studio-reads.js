// Bounded, coalesced reads only. An attempted write invalidates even if its
// response is lost; a slower old response cannot repopulate the new cache.
export function createStudioReads({read,clock=Date.now,ttl=30000,max=80}){
  const entries=new Map();let epoch=0;
  const eligible=route=>route==='/api/state'||route==='/api/characters/readiness'||/^\/api\/characters\/[a-f0-9-]{36}$/i.test(route);
  const invalidate=()=>{epoch++;entries.clear();};
  async function get(route){if(!eligible(route))return read(route);const prior=entries.get(route);if(prior&&clock()-prior.at<ttl)return structuredClone(await prior.promise);entries.delete(route);const version=epoch,entry={at:clock()};entry.promise=Promise.resolve().then(()=>read(route)).then(value=>{if(version!==epoch&&entries.get(route)===entry)entries.delete(route);return value;}).catch(error=>{if(entries.get(route)===entry)entries.delete(route);throw error;});entries.set(route,entry);while(entries.size>max)entries.delete(entries.keys().next().value);return structuredClone(await entry.promise);}
  return {get,invalidate};
}

// Lifecycle cleanup does not download a screen that has never been opened.
export function lazyScreen(load,{passive=['leave','cleanup','controls','listing']}={}){
  let instance=null,pending=null,epoch=0;const ready=()=>pending??=(Promise.resolve().then(load).then(value=>(instance=value),error=>{pending=null;throw error;}));
  return new Proxy({},{get:(_,name)=>name==='loaded'?!!instance:(...args)=>{if(passive.includes(name)){if(['leave','cleanup'].includes(name))epoch++;return instance?.[name]?.(...args);}if(instance)return instance[name]?.(...args);const version=epoch;return ready().then(value=>name==='render'&&version!==epoch?undefined:value[name]?.(...args));}});
}
