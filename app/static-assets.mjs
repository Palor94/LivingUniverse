import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';

// One immutable source snapshot per application start. Only shipped interface
// files participate; catalogue data and media never enter this cache.
export async function createStaticAssets(directory){
  const files=new Map(),cache=new Map(),hash=createHash('sha256');
  for(const name of (await fs.readdir(directory)).sort()){
    if(!/^[\w.-]+\.(?:js|css|html|webmanifest|svg|png)$/.test(name))continue;
    const bytes=await fs.readFile(path.join(directory,name));files.set(name,bytes);hash.update(name+'\0').update(bytes);
  }
  const version=hash.digest('hex').slice(0,24);
  const rewrite=(source)=>source.replace(/(["'])(\.?\/?[\w./-]+\.(?:js|css|webmanifest|svg|png))(?:\?[^"']*)?\1/g,(match,quote,url)=>{
    const name=url.replace(/^(?:\.\/|\/)/,'');return files.has(name)?quote+url+'?v='+version+quote:match;
  });
  function get(name,{versioned=false}={}){
    const key=name+':'+versioned;if(cache.has(key))return cache.get(key);
    const original=files.get(name);if(!original)return null;
    const raw=/\.(?:html|webmanifest)$/.test(name)||versioned&&/\.(?:js|css)$/.test(name)?Buffer.from(rewrite(original.toString('utf8'))):original;
    const value={raw,etag:'"s'+createHash('sha256').update(raw).digest('hex').slice(0,24)+'"',br:brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:5}}),gzip:gzipSync(raw)};
    cache.set(key,value);return value;
  }
  return {version,get};
}
