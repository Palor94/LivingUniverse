// Temporary synthetic browser fixture; no real catalogue or external API.
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {picture} from './character-crops-fixture.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-crop-preview-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.writeFile(path.join(root,'shared-test.png'),picture());
const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const call=async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(await r.text());return r.json();};
await call('/api/scan',{});const mid=(await call('/api/media')).items[0].id,cids=[];for(const name of ['Teszt bal oldali karakter','Teszt jobb oldali karakter'])cids.push((await call('/api/characters',{name})).id);await call('/api/media/'+mid,{character_ids:cids},'PUT');
for(let i=0;i<2;i++){const cid=cids[i],route='/api/media/'+mid+'/character-crops/'+cid+'/face',info=await call(route);await call(route,{expected_version:0,source_sha256:info.source_sha256,crop:{x:i*.5,y:0,w:.5,h:1}});await call('/api/characters/'+cid+'/canon',{appearance:'Mesterséges tesztadat',references:[{media_id:mid,role:'face'}],expected_revision_id:null,expected_references:[]});}
console.log('Synthetic crop preview: '+base);
let closing=false;const expiry=setTimeout(close,15*60*1000);async function close(){if(closing)return;closing=true;clearTimeout(expiry);await app.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup');await fs.rm(temp,{recursive:true,force:true});}process.once('SIGINT',close);process.once('SIGTERM',close);
