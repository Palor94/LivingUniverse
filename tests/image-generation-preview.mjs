// Synthetic loopback-only visual fixture; no production catalogue or paid API.
import http from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-generation-preview-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
const origin='https://preview.example.ts.net',login='fixture@example.test',config={enabled:true,token:randomBytes(32).toString('hex'),database_id:databaseIdentity(path.join(dataDir,'universe.sqlite')),origin,login,approval_mode:'trusted'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoaGgAAAMEAYEezv+mAAAAAElFTkSuQmCC','base64'),sha=createHash('sha256').update(png).digest('hex');
const app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:true,origin,login},imageGeneration:{providers:{xai:{enabled:true,model:'grok-imagine-image-2.0',estimated_cost_usd:0.1}}},generationTestOptions:{env:{XAI_API_KEY:'synthetic-key'},availability:async()=> 'local',generate:async()=>({bytes:png,request_id:'synthetic_request',usage:null,revised_prompt:null})}});
const cid=randomUUID(),mid=randomUUID(),revision=randomUUID();await fs.writeFile(path.join(root,'fixture.png'),png);const created=new Date().toISOString();
app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Synthetic adult character',created);app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'fixture.png','','image',png.length,created,created);app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,cid,null,'Approved synthetic appearance only.',JSON.stringify([{media_id:mid,role:'general',sha256:sha}]),'Synthetic approval',created);
const plan=await app.imageGeneration.prepare({request_key:'browser_preview_fixture',provider:'xai',prompt:'The adult character reads beside a window in morning light.',characters:[{character_id:cid,revision_id:revision,reference_ids:[mid]}]});
await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const target=app.mobileServer.address().port;
const proxy=http.createServer((req,res)=>{
  if(req.url==='/phone-preview'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><meta charset="utf-8"><title>Synthetic phone preview</title><style>body{background:#252b35;color:white;font:16px system-ui}iframe{display:block;margin:auto;width:390px;height:844px;border:1px solid #777;border-radius:18px}p{text-align:center}</style><p>Synthetic phone viewport · 390 pixels · no production data or paid calls</p><iframe title="Phone review page" src="/image-generation/'+plan.run_id+'"></iframe>');}
  const headers={...req.headers,host:'127.0.0.1:'+target,'tailscale-user-login':login};if(headers.origin==='http://127.0.0.1:'+proxy.address().port)headers.origin=origin;
  const upstream=http.request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers},response=>{const outputHeaders={...response.headers};/* Synthetic local fixture only: allow its 390px test iframe. */delete outputHeaders['x-frame-options'];if(outputHeaders['content-security-policy'])outputHeaders['content-security-policy']=outputHeaders['content-security-policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'");res.writeHead(response.statusCode,outputHeaders);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));console.log('Synthetic generation preview: http://127.0.0.1:'+proxy.address().port+'/image-generation/'+plan.run_id);
const expiry=setTimeout(close,15*60*1000);let closing=false;async function close(){if(closing)return;closing=true;clearTimeout(expiry);await new Promise(r=>{proxy.close(r);proxy.closeIdleConnections();});await app.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture cleanup');await fs.rm(temp,{recursive:true,force:true});}process.once('SIGINT',close);process.once('SIGTERM',close);
