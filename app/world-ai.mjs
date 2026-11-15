// Swappable chat provider for the world engine. Grok (xAI) first; a local model can
// be added later behind the same complete() contract. Every call is priced before it
// is sent and refused when it could exceed the daily cap. Billed calls are never
// retried automatically: an uncertain failure stops the run.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

// USD per million tokens. Check https://docs.x.ai/docs/pricing; values can be
// overridden in the world settings when xAI changes prices.
export const DEFAULT_MODEL='grok-4-1-fast-non-reasoning';
export const DEFAULT_PRICES={input:0.20,cached_input:0.05,output:0.50};
// Text models the owner may choose (2026-11-13), with xAI's own prices (USD / 1M tokens) read
// from /v1/language-models on 2026-11-13. The first is the old cheap default.
export const TEXT_MODELS=Object.freeze({
  'grok-4-1-fast-non-reasoning':{label:'Grok 4.1 Fast – eddigi, a legolcsóbb',prices:DEFAULT_PRICES},
  'grok-4.20-non-reasoning':{label:'Grok 4.20 – gyors',prices:{input:1.25,cached_input:0.20,output:2.50}},
  'grok-4.3':{label:'Grok 4.3',prices:{input:1.25,cached_input:0.20,output:2.50}},
  'grok-4.7':{label:'Grok 4.7 – a legújabb',prices:{input:2.00,cached_input:0.50,output:6.00}}
});
export const pricesFor=(model,fallback=DEFAULT_PRICES)=>TEXT_MODELS[model]?.prices||fallback;

export const estimateTokens=text=>Math.ceil(String(text).length/3);
export function priceOf({input=0,cached=0,output=0},prices=DEFAULT_PRICES){
  const fresh=Math.max(0,input-cached);
  return (fresh*prices.input+cached*prices.cached_input+output*prices.output)/1e6;
}

// DPAPI ciphertext lives next to the catalogue in Windows local storage, never in OneDrive.
export async function readXaiKey(dataDir,env=process.env,{platform=process.platform,run=promisify(execFile)}={}){
  if(env.XAI_API_KEY)return env.XAI_API_KEY;
  if(platform!=='win32')return null;
  try{const stat=await fs.lstat(path.join(dataDir,'xai-key.dpapi'));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)return null;}catch{return null;}
  try{
    const psRoot=path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0');
    const {stdout}=await run(path.join(psRoot,'powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./xai-key.ps1',import.meta.url)),'-Mode','Read','-DataDir',path.resolve(dataDir)],{windowsHide:true,timeout:15000,maxBuffer:32768,env:{...env,PSModulePath:path.join(psRoot,'Modules')}});
    const key=stdout.trim();return key.length>=8&&key.length<=8192&&!/[\s\x00-\x1f]/.test(key)?key:null;
  }catch{console.error('xAI key unavailable: run Connect Grok again under the Windows account that saved it.');return null;}
}

export function createXaiProvider({key,model=DEFAULT_MODEL,fetchImpl=fetch,timeoutMs=60000}){
  if(!key)return null;
  return {
    name:'xai',model,
    // onDelta (2026-11-11): stream the answer and report the text received so far, so the
    // player sees the reply being written instead of waiting up to a minute.
    async complete({system,user,maxTokens=600,onDelta=null}){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      const uncertain=()=>Object.assign(new Error('The Grok request did not complete; it may still be billed. Not retried automatically.'),{code:'AI_UNCERTAIN'});
      const usageOf=u=>({input:u?.prompt_tokens||0,cached:u?.prompt_tokens_details?.cached_tokens||0,output:u?.completion_tokens||0});
      let response;
      try{
        response=await fetchImpl('https://api.x.ai/v1/chat/completions',{method:'POST',signal:controller.signal,
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
          body:JSON.stringify({model,max_tokens:maxTokens,temperature:0.9,response_format:{type:'json_object'},
            messages:[{role:'system',content:system},{role:'user',content:user}],...(onDelta?{stream:true,stream_options:{include_usage:true}}:{})})});
        if(!response.ok){const data=await response.json().catch(()=>null);throw Object.assign(new Error('Grok refused the request ('+response.status+'): '+String(data?.error?.message||data?.error||'').slice(0,200)),{code:response.status===401||response.status===403?'AI_KEY':'AI_FAILED'});}
        // finish: 'length' when the answer hit maxTokens (its JSON is then cut short).
        if(!onDelta){const data=await response.json().catch(()=>null);return {text:String(data?.choices?.[0]?.message?.content||''),usage:usageOf(data?.usage),finish:data?.choices?.[0]?.finish_reason||null};}
        // Server-sent events: "data: {...}" lines, ending with "data: [DONE]".
        const decoder=new TextDecoder();let buffer='',text='',usage=null,done=false,finish=null;
        const handleLine=raw=>{
          const line=raw.trim();if(!line.startsWith('data:'))return;const payload=line.slice(5).trim();
          if(payload==='[DONE]'){done=true;return;}
          let event;try{event=JSON.parse(payload);}catch{return;}
          if(event.usage)usage=event.usage;
          if(event.choices?.[0]?.finish_reason)finish=event.choices[0].finish_reason;
          const piece=event.choices?.[0]?.delta?.content;
          if(piece){text+=piece;try{onDelta(text);}catch{}}
        };
        for await(const chunk of response.body){
          buffer+=decoder.decode(chunk,{stream:true});let nl;
          while((nl=buffer.indexOf('\n'))>=0){handleLine(buffer.slice(0,nl));buffer=buffer.slice(nl+1);}
        }
        // The last event may arrive without a closing newline: it still counts.
        buffer+=decoder.decode();if(buffer.trim())handleLine(buffer);
        // A stream cut before [DONE] may be incomplete (and billed): never use it silently.
        if(!done)throw uncertain();
        return {text,usage:usageOf(usage),finish};
      }catch(e){if(e.code==='AI_KEY'||e.code==='AI_FAILED')throw e;
        // No connection was ever made (offline, DNS, refused): nothing reached Grok, so it is a
        // plain failure, not a possibly billed one counted against the cap (2026-11-12).
        if(!response&&['ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(e?.cause?.code))throw Object.assign(new Error('Grok could not be reached (no connection).'),{code:'AI_FAILED'});
        throw uncertain();}
      finally{clearTimeout(timer);}
    }
  };
}

// Deterministic stand-in for tests and dry runs: no network, no cost.
export function createMockProvider(respond){
  return {name:'mock',model:'mock',async complete(request){const value=await respond(request),text=typeof value==='string'?value:JSON.stringify(value);
    // Streaming callers get the text in a few growing pieces, like a real stream.
    if(request.onDelta)for(const n of [8,24,48,text.length])request.onDelta(text.slice(0,Math.min(n,text.length)));
    return {text,usage:{input:estimateTokens(request.system+request.user),cached:0,output:50}};}};
}

// The value of one string field read from a JSON object that is still arriving, e.g.
// partialJsonString('{"reply":"Szia, mi u', 'reply') → 'Szia, mi u'. Returns null until the
// field starts. An escape cut in half is left for the next piece.
export function partialJsonString(text,key){
  const start=String(text).match(new RegExp('"'+key+'"\\s*:\\s*"'));if(!start)return null;
  const ESC={n:'\n',t:'\t',r:'\r',b:'\b',f:'\f','"':'"','\\':'\\','/':'/'};
  let out='';
  for(let i=start.index+start[0].length;i<text.length;i++){
    const ch=text[i];
    if(ch==='"')return out;
    if(ch!=='\\'){out+=ch;continue;}
    const next=text[i+1];if(next===undefined)return out;
    if(next==='u'){const hex=text.slice(i+2,i+6);if(hex.length<4)return out;out+=String.fromCharCode(parseInt(hex,16)||32);i+=5;continue;}
    out+=ESC[next]??next;i++;
  }
  return out;
}

export function parseJson(text){
  const trimmed=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'');
  try{return JSON.parse(trimmed);}catch{const m=trimmed.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0]);}catch{}}
  return null;
}
