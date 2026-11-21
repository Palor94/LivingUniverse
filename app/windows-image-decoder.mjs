import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';

// One bounded NDJSON worker pool for file thumbnails and in-memory reference crops.
// The PS decoder reads originals only; destinations are supplied by the thumbnail cache.
export function imageDecoderPool({workers=2,idle=1000,timeout=30000}={}){
  const pool=[],queue=[],stats={starts:0};let script,starting=0,seq=0,closed=false;
  const ascii=value=>JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  async function start(){
    script??=await readFile(new URL('./image-decoder-worker.ps1',import.meta.url),'utf8');
    if(closed)return;
    const worker={job:null,buffer:'',stderr:'',idle:null};stats.starts++;
    const child=worker.child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    pool.push(worker);
    const failed=error=>{const index=pool.indexOf(worker);if(index<0)return;pool.splice(index,1);clearTimeout(worker.idle);if(worker.job){clearTimeout(worker.job.timer);worker.job.reject(Error('Thumbnail converter unavailable. '+String(worker.stderr||error?.message||'Worker stopped').trim().slice(0,500)));worker.job=null;}child.kill();pump();};
    child.on('error',failed);child.on('exit',()=>failed());child.stdin.on('error',failed);
    child.stderr.on('data',chunk=>{if(worker.stderr.length<1000)worker.stderr+=chunk.toString('utf8');});
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      worker.buffer+=chunk;if(worker.buffer.length>5*1024*1024){failed(Error('Decoder output exceeds safe limit'));return;}
      let lineEnd;while((lineEnd=worker.buffer.indexOf('\n'))>=0){const line=worker.buffer.slice(0,lineEnd).trim();worker.buffer=worker.buffer.slice(lineEnd+1);if(!line)continue;
        let answer;try{answer=JSON.parse(line);}catch{failed(Error('Invalid decoder response'));return;}
        const job=worker.job;if(!job||answer.id!==job.id){failed(Error('Unexpected decoder response'));return;}
        clearTimeout(job.timer);worker.job=null;answer.ok?job.resolve(answer):job.reject(Error('Thumbnail conversion unavailable. '+String(answer.error||worker.stderr||'Unknown decoder error').trim().slice(0,500)));pump();
      }
    });
  }
  function pump(){
    if(closed)return;
    for(const worker of pool){
      if(worker.job)continue;clearTimeout(worker.idle);
      const job=queue.shift();if(!job){worker.idle=setTimeout(()=>{const index=pool.indexOf(worker);if(index>=0)pool.splice(index,1);worker.child.kill();pump();},idle);continue;}
      worker.stderr='';worker.job=job;job.timer=setTimeout(()=>{worker.stderr='Image decoder timed out.';worker.child.kill();},timeout);
      worker.child.stdin.write(ascii({id:job.id,...job.request})+'\n');
    }
    if(queue.length&&pool.length+starting<workers){starting++;start().catch(error=>{for(const job of queue.splice(0))job.reject(error);}).finally(()=>{starting--;pump();});}
  }
  const decode=request=>{
    if(closed)return Promise.reject(Error('Image decoder is closed.'));
    if(process.platform!=='win32')return Promise.reject(Error('Thumbnail conversion requires the configured Windows image decoder.'));
    return new Promise((resolve,reject)=>{queue.push({id:++seq,request,resolve,reject});pump();});
  };
  decode.stats=stats;decode.close=()=>{closed=true;for(const job of queue.splice(0))job.reject(Error('Image decoder is closed.'));for(const worker of pool){clearTimeout(worker.idle);if(worker.job){clearTimeout(worker.job.timer);worker.job.reject(Error('Image decoder is closed.'));worker.job=null;}worker.child.kill();}pool.length=0;};
  return decode;
}
