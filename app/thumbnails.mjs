// Small cached previews for picture grids, cards and play scenes (NEXT_GEN_PLAN O1/1.1).
// GET /thumb/<mediaId>?w=320|640|1600 answers a JPEG made once from the original and kept in
// <dataDir>/thumbs (outside OneDrive). The original is only read, never changed. The cache key
// holds the original's size and modification time, so an edited original gets a new preview.
// Videos, small originals and pictures the converter cannot read are answered with a redirect
// to the original (/media/<id>), so a preview never hides a picture.
import {promises as fs} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const WIDTHS=[320,640,1600];
const SMALL=96*1024,JOB_TIMEOUT=30_000,IDLE=60_000;

// Converts with long-lived PowerShell/System.Drawing workers (no install; one process start
// per worker instead of one per picture).
export function powershellConverter({workers=2}={}){
  const queue=[],pool=[];let seq=0,scriptPromise=null,starting=0;
  const script=()=>scriptPromise??=fs.readFile(new URL('./thumb-worker.ps1',import.meta.url),'utf8');
  const ascii=s=>JSON.stringify(s).replace(/[\u007f-￿]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  async function startWorker(){
    const w={busy:null,buffer:'',idle:null};
    w.child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(await script(),'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    w.child.stdin.on('error',()=>{});
    const fail=()=>{const i=pool.indexOf(w);if(i>=0)pool.splice(i,1);clearTimeout(w.idle);if(w.busy){clearTimeout(w.busy.timer);w.busy.reject(Error('Thumbnail worker stopped.'));w.busy=null;}pump();};
    w.child.on('error',fail);w.child.on('exit',fail);
    w.child.stdout.setEncoding('ascii');
    w.child.stdout.on('data',d=>{w.buffer+=d;let n;while((n=w.buffer.indexOf('\n'))>=0){const line=w.buffer.slice(0,n).trim();w.buffer=w.buffer.slice(n+1);const job=w.busy;if(!job||!line.startsWith(job.id+' '))continue;clearTimeout(job.timer);w.busy=null;line.endsWith(' ok')?job.resolve():job.reject(Error('The picture could not be converted.'));pump();}});
    pool.push(w);return w;
  }
  function assign(w,job){
    clearTimeout(w.idle);w.busy=job;
    job.timer=setTimeout(()=>{w.child.kill();},JOB_TIMEOUT);
    w.child.stdin.write('{"id":'+job.id+',"src":'+ascii(job.src)+',"dst":'+ascii(job.dst)+',"edge":'+job.edge+'}\n');
  }
  function pump(){
    for(const w of pool){if(!queue.length)break;if(!w.busy)assign(w,queue.shift());}
    for(const w of pool)if(!w.busy){clearTimeout(w.idle);w.idle=setTimeout(()=>w.child.kill(),IDLE);w.idle.unref?.();}
    if(queue.length&&pool.length+starting<workers){starting++;startWorker().then(()=>{starting--;pump();},e=>{starting--;for(const job of queue.splice(0))job.reject(e);});}
  }
  const convert=(src,dst,edge)=>{
    if(process.platform!=='win32')return Promise.reject(Error('Thumbnails need the Windows image decoder.'));
    return new Promise((resolve,reject)=>{queue.push({id:++seq,src,dst,edge,resolve,reject});pump();});
  };
  convert.close=()=>{for(const job of queue.splice(0))job.reject(Error('Closed.'));for(const w of pool.splice(0)){clearTimeout(w.idle);w.child.kill();}};
  return convert;
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
