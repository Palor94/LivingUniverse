// Unexpected server errors (2026-11-11): before, a real 500 left no trace unless LU_DEBUG was set.
// One JSON line per error in <dataDir>/logs/errors.log (outside OneDrive): time, method, route
// (path only, never query strings or request bodies), message and stack. The file is capped:
// past MAX_BYTES it is renamed to errors.1.log (replacing the previous one) and a new file starts.
// Writing is synchronous and best effort: logging must never become a second failure.
import {appendFileSync,mkdirSync,readFileSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';

export const MAX_BYTES=1024*1024;

export function createErrorLog(dataDir,{now=()=>new Date(),maxBytes=MAX_BYTES}={}){
  const dir=path.join(dataDir,'logs'),file=path.join(dir,'errors.log');
  // requestId links the entry to the request log and the browser; steps are the browser's last
  // clicks and views (debug-trail.js), never typed text.
  function write(error,{method=null,route=null,source='server',requestId=null,steps=null}={}){
    const entry={at:now().toISOString(),source,method,route:route?String(route).slice(0,300):null,
      message:String(error?.message??error).slice(0,1000),code:typeof error?.code==='string'?error.code:null,stack:String(error?.stack||'').slice(0,4000),
      ...(requestId?{request_id:String(requestId).slice(0,16)}:{}),...(Array.isArray(steps)&&steps.length?{steps:steps.slice(-20).map(s=>String(s).slice(0,200))}:{})};
    try{
      mkdirSync(dir,{recursive:true});
      try{if(statSync(file).size>maxBytes)renameSync(file,path.join(dir,'errors.1.log'));}catch(e){if(e.code!=='ENOENT')throw e;}
      appendFileSync(file,JSON.stringify(entry)+'\n');
    }catch{/* The log itself failed (disk full, locked): nothing more to do. */}
    return entry;
  }
  // The newest entries first, without stacks (the status panel shows only what and where).
  function recent({limit=5,sinceMs=24*3600e3}={}){
    let text='';try{text=readFileSync(file,'utf8');}catch{return [];}
    const since=now().getTime()-sinceMs,out=[];
    for(const line of text.trimEnd().split('\n').reverse()){
      let e;try{e=JSON.parse(line);}catch{continue;}
      if(Date.parse(e.at)<since)break;
      out.push({at:e.at,source:e.source,method:e.method,route:e.route,message:e.message,code:e.code,request_id:e.request_id||null});
      if(out.length>=limit)break;
    }
    return out;
  }
  return {write,recent,file};
}
