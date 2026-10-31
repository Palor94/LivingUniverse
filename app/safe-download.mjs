import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export class ImportError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export function publicAddress(ip){
  ip=ip.toLowerCase();if(ip.startsWith('::ffff:'))return publicAddress(ip.slice(7));
  if(isIP(ip)===4){
    const n=ip.split('.').map(Number);const [a,b,c]=n;
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  // Conservative global-unicast subset; reject IPv6 transition/special ranges.
  return isIP(ip)===6&&/^[23][0-9a-f]{3}:/.test(ip)&&!/^200[12]:/.test(ip);
}
async function publicTarget(value,resolve){
  let url;try{url=new URL(value);}catch{throw new ImportError('UNSAFE_URL','Use a downloadable public HTTPS media URL.');}
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.href.length>8192||url.hash||host==='localhost'||/\.(localhost|local|internal|test|onion)$/.test(host))throw new ImportError('UNSAFE_URL','Only public HTTPS media URLs on port 443 are accepted.');
  let addresses;try{addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolve(host,{all:true,verbatim:true});}catch{throw new ImportError('DOWNLOAD_FAILED','The media host could not be resolved.',502);}
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new ImportError('UNSAFE_URL','Private, special-use and mixed public/private network targets are refused.');
  return {url,pinned:addresses[0]};
}
export async function safeUpload(value,bytes,{contentType,resolve=lookup,request=https.request,deadline=Date.now()+60000}={}){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024||!['image/png','image/jpeg'].includes(contentType))throw new ImportError('MEDIA_LIMIT','Only bounded PNG/JPEG reference bytes can be uploaded.');
  const {url,pinned}=await publicTarget(value,resolve),remaining=deadline-Date.now();
  if(remaining<=0)throw new ImportError('UPLOAD_TIMEOUT','The reference upload timed out.',504);
  await new Promise((done,reject)=>{
    const req=request(url,{method:'PUT',headers:{'Content-Type':contentType,'Content-Length':bytes.length},lookup:(_host,options,callback)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)},res=>{
      clearTimeout(timer);res.destroy();
      if(![200,204].includes(res.statusCode))reject(new ImportError('UPLOAD_FAILED','The reference upload was declined; redirects are not followed.',502));else done();
    });
    const timer=setTimeout(()=>req.destroy(new Error('deadline')),remaining);timer.unref();
    req.on('error',()=>{clearTimeout(timer);reject(new ImportError('UPLOAD_FAILED','The reference upload failed.',502));});req.end(bytes);
  });
}
export async function safeDownload(value,{resolve=lookup,request=https.request,maxBytes=100*1024*1024,deadline=Date.now()+30000,redirects=0}={}){
  const {url,pinned}=await publicTarget(value,resolve);
  const remaining=deadline-Date.now();if(remaining<=0)throw new ImportError('DOWNLOAD_TIMEOUT','The media download timed out.',504);
  const response=await new Promise((resolveResponse,reject)=>{
    const req=request(url,{method:'GET',headers:{Accept:'image/jpeg,image/png,video/mp4,video/quicktime','Accept-Encoding':'identity'},lookup:(_host,options,callback)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)},resolveResponse);
    const timer=setTimeout(()=>req.destroy(new Error('deadline')),remaining);timer.unref();
    req.on('error',()=>{clearTimeout(timer);reject(new ImportError('DOWNLOAD_FAILED','The media download failed. Use the private upload page if the URL needs a login.',502));});
    req.on('response',res=>{res.once('close',()=>clearTimeout(timer));res.on('error',()=>{});});req.end();
  });
  if([301,302,303,307,308].includes(response.statusCode)){
    const location=response.headers.location;response.destroy();
    if(!location||redirects>=3)throw new ImportError('DOWNLOAD_REDIRECT','The media URL redirected too many times.');
    return safeDownload(new URL(location,url).href,{resolve,request,maxBytes,deadline,redirects:redirects+1});
  }
  if(response.statusCode!==200){response.destroy();throw new ImportError('DOWNLOAD_FAILED','The URL did not return a downloadable media file. Use the private upload page.',502);}
  const size=response.headers['content-length'];
  if((size!==undefined&&(!/^\d+$/.test(size)||Number(size)>maxBytes))||(response.headers['content-encoding']&&!/^identity$/i.test(response.headers['content-encoding']))){response.destroy();throw new ImportError('MEDIA_LIMIT','Compressed or oversized media responses are refused.',413);}
  return {stream:response,contentType:String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase(),source:{kind:'url',source_origin:url.origin,source_path:url.pathname}};
}
