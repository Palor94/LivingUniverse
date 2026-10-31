import {promises as fs} from 'node:fs';
import path from 'node:path';
// Serve only explicitly selected local artifacts; no wildcard directory, forms, scripts or external resources.
export async function writePrivateReviewServer(output,files){
  for(const [route,file]of Object.entries(files))if(!route.startsWith('/')||path.isAbsolute(file)||file.split(/[\\/]/u).some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe private artifact route');
  const source=`import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),files=${JSON.stringify(files)};
const server=http.createServer((req,res)=>{
res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
if(req.headers.host!=='127.0.0.1:'+server.address().port||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
const relative=Object.hasOwn(files,req.url)?files[req.url]:null;if(!relative){res.writeHead(404).end();return;}
res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.bmp':'image/bmp','.gif':'image/gif','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(relative)]||'application/octet-stream');
if(req.method==='HEAD'){res.end();return;}fs.createReadStream(path.join(root,relative)).on('error',()=>res.destroy()).pipe(res);
});server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(root,'server-receipt.json'),JSON.stringify({pid:process.pid,url:'http://127.0.0.1:'+server.address().port,expires_at:new Date(Date.now()+30*60*1000).toISOString()})));
setTimeout(()=>{server.closeAllConnections();server.close();},30*60*1000).unref();`;
  await fs.writeFile(path.join(output,'serve-review.mjs'),source,{flag:'wx'});
}
