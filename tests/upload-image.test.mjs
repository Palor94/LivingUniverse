import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {uploadImage} from '../app/public/upload-image.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
test('A22 sends the original File once, reports real byte progress and retains uncertainty on lost responses',async()=>{
 const requests=[];class XHR{constructor(){this.upload={};this.headers={};requests.push(this);}open(method,url){this.method=method;this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(file){this.body=file;}}
 const file={type:'image/png',size:4,name:'árvíz.png'},progress=[];const done=uploadImage({url:'/api/backgrounds/upload',file,fields:{location_id:'fixture'},headers:{'X-LU-CSRF':'token'},onProgress:p=>progress.push(p),XHR});
 const r=requests[0];assert.equal(r.body,file);assert.equal(r.headers['Content-Type'],'image/png');assert.equal(r.headers['X-LU-CSRF'],'token');assert.ok(r.url.endsWith('location_id=fixture'));r.upload.onprogress({lengthComputable:true,loaded:2,total:4});r.status=200;r.responseText='{"saved":true}';r.onload();assert.deepEqual(await done,{saved:true});assert.deepEqual(progress,[50,100]);
 const failed=uploadImage({url:'/api/backgrounds/upload',file,XHR});requests[1].onerror();await assert.rejects(failed,{transport:true,status:0});assert.equal(requests.length,2,'no retry');
 await assert.rejects(uploadImage({url:'/',file:{...file,size:21*1024*1024},XHR}));assert.equal(requests.length,2);
});
test('A22 binary background and scene uploads preserve decoded original bytes and deduplicate repeated files',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-binary-upload-')),root=path.join(temp,'media');await fs.mkdir(root);const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:null});t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 const json=async(route,body)=>(await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 const location=await json('/api/locations',{name:'Synthetic upload room',kind:'tag'}),character=await json('/api/characters',{name:'Synthetic upload man'});
 const upload=async(route,bytes=png,type='image/png')=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':type,'X-LU-Filename':encodeURIComponent('teszt.png')},body:bytes});return {status:response.status,value:await response.json()};};
 const background=await upload('/api/backgrounds/upload?location_id='+location.id);assert.equal(background.status,200);const media=app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(background.value.media_id);assert.deepEqual(await fs.readFile(path.join(root,media.relative_path)),png);
 const sceneRoute='/api/play/scenes/upload?character_id='+character.id+'&location_id='+location.id,scene=await upload(sceneRoute);assert.equal(scene.status,200);assert.equal((await upload(sceneRoute)).value.media_id,scene.value.media_id);
 assert.equal((await upload('/api/backgrounds/upload?location_id='+location.id,Buffer.from('not an image'))).status,400);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
});
