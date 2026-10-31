// Synthetic loopback UI fixture. Identity is simulated ONLY by this test proxy;
// production still uses authenticated Tailscale Serve and exact Origin + CSRF.
import http from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {picture} from './character-crops-fixture.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-oneclick-preview-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);await fs.writeFile(path.join(root,'shared-test.png'),picture());
const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://synthetic.example.ts.net',login:'synthetic-admin@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
const app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const desktopPort=app.server.address().port,adminPort=app.mobileServer.address().port,desktop='http://127.0.0.1:'+desktopPort;
async function call(route,body,method){const r=await fetch(desktop+route,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(await r.text());return r.json();}
await call('/api/scan',{});const mid=(await call('/api/media')).items[0].id,cids=[];for(const name of ['Teszt bal oldali karakter','Teszt jobb oldali karakter'])cids.push((await call('/api/characters',{name})).id);await call('/api/media/'+mid,{character_ids:cids},'PUT');for(const cid of cids)await call('/api/characters/'+cid+'/canon',{appearance:'Mesterséges tesztazonosság',references:[{media_id:mid,role:'face'}],expected_revision_id:null,expected_references:[]});
const proxy=http.createServer((req,res)=>{
 const proxyOrigin='http://127.0.0.1:'+proxy.address().port;if(req.headers.origin&&req.headers.origin!==proxyOrigin){res.writeHead(403);return res.end();}
 const admin=req.url.startsWith('/__fixture_admin/'),route=admin?req.url.slice('/__fixture_admin'.length):req.url,headers={...req.headers,host:'127.0.0.1:'+(admin?adminPort:desktopPort)};if(headers.origin||admin)headers.origin=desktop;if(admin)headers['tailscale-user-login']=config.login;
 const upstream=http.request({hostname:'127.0.0.1',port:admin?adminPort:desktopPort,path:route,method:req.method,headers},response=>{
  if(route==='/character-reference-crops.js'){const chunks=[];response.on('data',b=>chunks.push(b));response.on('end',()=>{const adapter=`const fixtureFetch=(url,options)=>fetch(String(url).startsWith(${JSON.stringify(config.origin)})?'/__fixture_admin'+new URL(url).pathname:url,options);\n`,code=adapter+Buffer.concat(chunks).toString('utf8').replace('request=fetch','request=fixtureFetch');res.writeHead(response.statusCode,{...response.headers,'content-length':Buffer.byteLength(code)});res.end(code);});}
  else{res.writeHead(response.statusCode,response.headers);response.pipe(res);}
 });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));console.log('Synthetic one-click preview: http://127.0.0.1:'+proxy.address().port);
let closing=false;const expiry=setTimeout(close,15*60*1000);async function close(){if(closing)return;closing=true;clearTimeout(expiry);await new Promise(r=>{proxy.close(r);proxy.closeIdleConnections();});await app.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup');await fs.rm(temp,{recursive:true,force:true});}process.once('SIGINT',close);process.once('SIGTERM',close);
