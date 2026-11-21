// Small cached previews for picture grids, cards and play scenes (NEXT_GEN_PLAN O1/1.1).
// GET /thumb/<mediaId>?w=320|640|1600 answers a JPEG made once from the original and kept in
// <dataDir>/thumbs (outside OneDrive). The original is only read, never changed. The cache key
// holds the original's size and modification time, so an edited original gets a new preview.
// Videos, small originals and pictures the converter cannot read are answered with a redirect
// to the original (/media/<id>), so a preview never hides a picture.
import {promises as fs} from 'node:fs';
import {imageDecoderPool} from './windows-image-decoder.mjs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const WIDTHS=[320,640,1600];
const SMALL=96*1024,JOB_TIMEOUT=30_000,IDLE=60_000;

// Converts with long-lived PowerShell/System.Drawing workers (no install; one process start
// per worker instead of one per picture).
export function powershellConverter({workers=2}={}){
  const decoder=imageDecoderPool({workers,idle:60000});
  const convert=(src,dst,edge)=>decoder({src,dst,edge}).then(()=>{});
  convert.close=decoder.close;return convert;
}

export function installThumbnails({dataDir,asset,safeFile,convert=powershellConverter()}){
  const dir=path.join(dataDir,'thumbs'),pending=new Map(),failed=new Map(),RETRY_AFTER=10*60_000;
  const stats={made:0,served:0,fallback:0};
  async function locate(mediaId,width){
    const m=asset(mediaId);
    if(m.kind!=='image')return {original:true};
    const full=await safeFile(m),s=await fs.stat(full);
    if(s.size<=SMALL)return {original:true};
    const key=createHash('sha256').update([m.id,s.size,Math.round(s.mtimeMs),width].join('|')).digest('hex').slice(0,32);
    const file=path.join(dir,key.slice(0,2),key+'.jpg');
    if(await fs.stat(file).then(x=>x.size>0,()=>false))return {file,key};
    // A failure (file only in the cloud, worker timeout) is retried after a while, not never.
    if(Date.now()-(failed.get(key)??-Infinity)<RETRY_AFTER)return {original:true};
    failed.delete(key);
    let job=pending.get(key);
    if(!job){
      job=(async()=>{
        await fs.mkdir(path.dirname(file),{recursive:true});
        const tmp=file+'.'+process.pid+'.partial';
        try{await convert(full,tmp,width);await fs.rename(tmp,file);stats.made++;}
        catch(e){await fs.rm(tmp,{force:true});if(failed.size>5000)failed.clear();failed.set(key,Date.now());throw e;}
      })().finally(()=>pending.delete(key));
      pending.set(key,job);
    }
    try{await job;return {file,key};}catch{return {original:true};}
  }
  async function handle({p,req,res}){
    const match=p.match(/^\/thumb\/([^/]+)$/);
    if(!match||!['GET','HEAD'].includes(req.method))return false;
    let mediaId;try{mediaId=decodeURIComponent(match[1]);}catch{res.writeHead(404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Media not found'}));return true;}
    const asked=Number(new URL(req.url,'http://x').searchParams.get('w'))||WIDTHS[0];
    const width=WIDTHS.find(w=>w>=asked)||WIDTHS.at(-1);
    const found=await locate(mediaId,width);
    if(found.original){stats.fallback++;res.writeHead(307,{Location:'/media/'+encodeURIComponent(mediaId),'Cache-Control':'private, max-age=600'});res.end();return true;}
    const etag='"t'+found.key+'"';
    const headers={'Content-Type':'image/jpeg','Cache-Control':'private, max-age=600, stale-while-revalidate=86400','ETag':etag,'X-Content-Type-Options':'nosniff'};
    if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return true;}
    stats.served++;
    if(req.method==='HEAD'){const s=await fs.stat(found.file);res.writeHead(200,{...headers,'Content-Length':s.size});res.end();return true;}
    const data=await fs.readFile(found.file);
    res.writeHead(200,{...headers,'Content-Length':data.length});res.end(data);return true;
  }
  return {handle,locate,stats,dir,close:()=>convert.close?.()};
}
