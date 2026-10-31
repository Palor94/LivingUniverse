// Manual, local-only candidate review. Never calls an AI provider or writes the live catalogue.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createAnalysisSource} from '../app/analysis-source.mjs';

const args=process.argv.slice(2),opts={},keys=['--config','--manifest','--output'];
for(let i=0;i<args.length;i+=2){if(!keys.includes(args[i])||!args[i+1])throw Error('Expected config, manifest and fresh output paths.');opts[args[i]]=args[i+1];}
if(keys.some(k=>!opts[k]))throw Error('Missing local review arguments.');
const output=path.resolve(opts['--output']);
if(output===path.parse(output).root||output.toLowerCase().includes('onedrive'))throw Error('Private review must stay outside OneDrive.');
const cfg=JSON.parse(await fs.readFile(opts['--config'],'utf8')),plan=JSON.parse(await fs.readFile(opts['--manifest'],'utf8'));
if(plan.status!=='draft_not_submitted'||!Array.isArray(plan.pairs)||plan.pairs.length>5||plan.pairs.some(p=>!Array.isArray(p.candidates)||p.candidates.length>3))throw Error('Expected a bounded draft candidate list.');
await fs.mkdir(output);await fs.mkdir(path.join(output,'media'));
const db=new DatabaseSync(cfg.database,{readOnly:true,allowExtension:false});db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
const one=(sql,...params)=>db.prepare(sql).get(...params),source=createAnalysisSource({root:cfg.mediaRoot,one});
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const receipt={created_at:new Date().toISOString(),live_catalogue_mode:'readOnly/query_only',external_calls:0,uploaded_images:0,items:[]},groups=[];
const files={'/':'review.html','/review.html':'review.html'};
try{
  for(const [g,pair] of plan.pairs.entries()){
    const figures=[];
    for(const [n,candidate] of pair.candidates.entries()){
      const label=String.fromCharCode(65+g)+(n+1),entry={label,media_id:candidate.media_id,partner:pair.partner,visual_content_verified:false};
      try{
        if(!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',candidate.media_id,pair.partner_id))throw Error('ASSIGNMENT_CHANGED');
        const input=await source.read(candidate.media_id);
        if(input.manifest.relative_path!==candidate.relative_path||input.manifest.size!==candidate.size)throw Error('SOURCE_CHANGED');
        const ext={'image/jpeg':'.jpg','image/png':'.png','image/bmp':'.bmp','image/gif':'.gif'}[input.manifest.mime_type];if(!ext)throw Error('UNSUPPORTED_IMAGE');
        const relative='media/'+label+ext;await fs.writeFile(path.join(output,relative),input.bytes,{flag:'wx'});await source.read(candidate.media_id,input.manifest);
        files['/'+relative]=relative;entry.source=input.manifest;entry.copy=relative;entry.status='ready';
        figures.push(`<figure><h3>${label}${candidate.proposed_first?' · első jelölt':''}</h3><a href="${relative}" target="_blank" rel="noreferrer"><img src="${relative}" alt="${label} privát tesztjelölt" loading="lazy"></a><figcaption>${esc(candidate.filename)}<br>Metaadat alapján jelölt; a jelenet és a képbeli személyek még ellenőrzendők.</figcaption></figure>`);
      }catch(e){entry.status='unavailable';entry.error_code=e.code||'LOCAL_SOURCE_CHECK_FAILED';figures.push(`<figure><h3>${label}</h3><p>A kép helyben nem érhető el vagy megváltozott. Automatikus letöltés nem indult.</p></figure>`);}
      receipt.items.push(entry);
    }
    groups.push(`<section><h2>${esc(pair.partner)}</h2><div class="grid">${figures.join('')}</div></section>`);
  }
}finally{db.close();}
const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Helyi képkiválasztás</title><style>body{font:17px system-ui;max-width:1500px;margin:32px auto;padding:0 24px;background:#17191d;color:#eee}section{border-top:1px solid #444;margin-top:32px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}figure{margin:0;padding:16px;background:#252830;border-radius:12px}img{width:100%;height:430px;object-fit:contain;background:#111}figcaption{font-size:13px;overflow-wrap:anywhere;color:#ccc}li{margin:8px 0}@media(max-width:800px){.grid{grid-template-columns:1fr}}</style><h1>Terra–Sol próba: képkiválasztás</h1><p>Ez kizárólag helyi előnézet. A képek nem kerültek AI-szolgáltatáshoz, és az éles katalógus nem változott.</p><ol><li>Válassz egy megfelelő képet minden szereplőhöz a három jelölt közül. A nagyításhoz kattints a képre.</li><li>Írd meg a chatben a kódokat, például A2, B1, C3, D1, E2. Ez csak a tesztképek kijelölése.</li><li>Jelezd, ha egy csoportban egyik kép sem jó. A képek kiválasztása után készül a pontos felhős adatátadási és költség-előnézet.</li></ol><p>A háttérre és a szerepekre vonatkozó modellválaszok majd külön jelennek meg. Ez az oldal sem API-kulcsot, sem felhős indítást nem kér.</p>'+groups.join('')+'</html>';
await fs.writeFile(path.join(output,'review.html'),html,{flag:'wx'});
await fs.writeFile(path.join(output,'review-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
const serverSource=`import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=${JSON.stringify(files)};
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.headers.host!=='127.0.0.1:'+server.address().port||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
  const file=Object.hasOwn(files,req.url)?files[req.url]:null;if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.bmp':'image/bmp','.gif':'image/gif'})[path.extname(file)]);
  if(req.method==='HEAD'){res.end();return;}fs.createReadStream(path.join(root,file)).on('error',()=>res.destroy()).pipe(res);
});
server.listen(0,'127.0.0.1',()=>{fs.writeFileSync(path.join(root,'server-receipt.json'),JSON.stringify({pid:process.pid,url:'http://127.0.0.1:'+server.address().port,expires_at:new Date(Date.now()+30*60*1000).toISOString()}));});
setTimeout(()=>server.closeAllConnections()||server.close(),30*60*1000).unref();
`;
await fs.writeFile(path.join(output,'serve-review.mjs'),serverSource,{flag:'wx'});
console.log(JSON.stringify({output,ready:receipt.items.filter(i=>i.status==='ready').length,unavailable:receipt.items.filter(i=>i.status!=='ready').length,external_calls:0,uploaded_images:0}));
