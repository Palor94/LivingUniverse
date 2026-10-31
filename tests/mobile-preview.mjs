// Synthetic, loopback-only browser fixture. Never uses the desktop database.
import http from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-mobile-preview-')),root=path.join(temp,'media');await fs.mkdir(root);
const origin='https://preview.example.ts.net',login='fixture@github';
const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login}});
for(const name of ['Ádám · test character','Palor'])app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(randomUUID(),name,new Date().toISOString());
if(process.argv.includes('--desktop'))for(const name of ['Pákozdi Péter','Dezső','Márkó'])app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(randomUUID(),name,new Date().toISOString());
const width=320,height=240,row=width*3,bytes=Buffer.alloc(54+row*height);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(width,18);bytes.writeInt32LE(height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(24,28);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=54+y*row+x*3;bytes[p]=60+x/3;bytes[p+1]=70+y/2;bytes[p+2]=160;}
for(const name of ['01-studio.bmp','02-garden.bmp','03-meeting.bmp']){await fs.writeFile(path.join(root,name),bytes);app.db.prepare("INSERT INTO media VALUES(?,?,?,'image',?,?,?)").run(randomUUID(),name,'Sample folder',bytes.length,new Date().toISOString(),new Date().toISOString());}
app.db.prepare("INSERT INTO locations(id,name,name_key,tag_id,folder,created_at) VALUES(?,?,?,NULL,NULL,?)").run(randomUUID(),'M7 truckstop','m7 truckstop',new Date().toISOString());
if(process.argv.includes('--desktop')){for(const name of ['Balaton','Fenyves'])app.db.prepare('INSERT INTO locations(id,name,name_key,tag_id,folder,created_at) VALUES(?,?,?,NULL,NULL,?)').run(randomUUID(),name,name.toLowerCase(),new Date().toISOString());const m=app.db.prepare('SELECT id FROM media LIMIT 1').get();app.db.prepare("INSERT INTO media_scan_state VALUES(?,'new',NULL,NULL,?,NULL)").run(m.id,new Date().toISOString());await new Promise(r=>app.server.listen(0,'127.0.0.1',r));console.log('Synthetic desktop preview: http://127.0.0.1:'+app.server.address().port);}
if(process.argv.includes('--hierarchy')){const parent=app.db.prepare('SELECT id FROM locations WHERE name=?').get('Fenyves').id,second=randomUUID();app.db.prepare('INSERT INTO locations(id,name,name_key,created_at) VALUES(?,?,?,?)').run(second,'Kőváros','kőváros','now');for(const parent_id of [parent,second]){const id=randomUUID();app.db.prepare('INSERT INTO locations(id,name,name_key,parent_id,created_at) VALUES(?,?,?,?,?)').run(id,'Strand','strand',parent_id,'now');app.db.prepare("INSERT INTO location_profiles VALUES(?,'Beach','strand','Szintetikus teszthely.',?)").run(id,parent_id);}}
if(process.argv.includes('--relink')){const m=app.db.prepare('SELECT * FROM media WHERE relative_path=?').get('01-studio.bmp');app.db.prepare('UPDATE media SET relative_path=?,folder=? WHERE id=?').run(path.join('Old folder','01-studio.bmp'),'Old folder',m.id);app.db.prepare('INSERT INTO scan_candidates VALUES(?,?,?,?,?,?)').run(m.relative_path,'',m.kind,m.size,m.modified_at,JSON.stringify([m.id]));app.db.prepare("INSERT INTO media_scan_state VALUES(?,'missing',NULL,NULL,?,NULL)").run(m.id,new Date().toISOString());app.db.prepare("INSERT INTO application_settings VALUES('last_scan_report',?)").run(JSON.stringify({found:3,new:0,modified:0,missing:1,unavailable:0,potentially_moved:1,checked_at:new Date().toISOString()}));}
await new Promise(resolve=>app.mobileServer.listen(0,'127.0.0.1',resolve));
const target=app.mobileServer.address().port;
if(process.argv.includes('--cleanup')){for(let i=1;i<=2;i++){const id=randomUUID();app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)").run(id,'missing-example-'+i+'.png',i,new Date().toISOString(),new Date().toISOString());app.db.prepare("INSERT INTO media_scan_state VALUES(?,'missing',NULL,NULL,?,NULL)").run(id,new Date().toISOString());}app.db.prepare("INSERT INTO application_settings VALUES('last_scan_report',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({found:3,new:0,unchanged:3,modified:0,missing:2,unavailable:0,potentially_moved:0,errors:[],checked_at:new Date().toISOString()}));}
if(process.argv.includes('--places')){app.db.prepare("INSERT INTO structured_tags VALUES('fixture-beach','group-setting','Beach','beach')").run();const media=app.db.prepare('SELECT id FROM media LIMIT 1').get();app.db.prepare("INSERT INTO media_tags VALUES(?,'fixture-beach')").run(media.id);}
const proxy=http.createServer((req,res)=>{
  const headers={...req.headers,host:'127.0.0.1:'+target,'tailscale-user-login':login};
  if(headers.origin==='http://127.0.0.1:'+proxy.address().port)headers.origin=origin;
  const upstream=http.request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));console.log('Synthetic mobile preview: http://127.0.0.1:'+proxy.address().port);
let closing=false;async function close(){if(closing)return;closing=true;clearTimeout(expiry);await new Promise(resolve=>{proxy.close(resolve);proxy.closeIdleConnections();});await app.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unexpected fixture path');await fs.rm(temp,{recursive:true,force:true});}
const expiry=setTimeout(close,15*60*1000);process.on('SIGINT',close);process.on('SIGTERM',close);
