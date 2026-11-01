// Explicit disposable-Linux acceptance helper. Never discovers a live catalogue.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../../app/server.mjs';
import {createBackup,restoreSnapshot} from '../backup/backup.mjs';
import sharp from 'sharp';

const [command,provided]=process.argv.slice(2),root=path.resolve(provided||'');
if(process.platform!=='linux'||process.env.LU_DISPOSABLE_LINUX_LAB!=='synthetic-only'||!/^\/opt\/lu-native-[A-Za-z0-9]+$/u.test(root))throw Error('A dedicated disposable Linux lab root and explicit acknowledgement are required.');
const json=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const media=path.join(root,'media'),state=path.join(root,'state'),database=path.join(state,'universe.sqlite'),proof=path.join(root,'disposable-lab.json');
const dbInfo=(file=database)=>{const db=new DatabaseSync(file,{readOnly:true});try{return {integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,fk:db.prepare('PRAGMA foreign_key_check').all().length,media:db.prepare('SELECT id,relative_path FROM active_media ORDER BY id').all().map(r=>({...r})),canon:db.prepare('SELECT count(*) n FROM canon').get().n};}finally{db.close();}};
async function record(stage,details={}){const f=path.join(root,'acceptance-results.json');let result=await json(f).catch(()=>({kind:'synthetic-native-linux-acceptance',node:process.version,sqlite:process.versions.sqlite,real_provider_calls:0,checks:[]}));result.checks.push({stage,passed:true,...details});await fs.writeFile(f,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({stage,passed:true,...details}));}

if(command==='seed'){
 if(await fs.stat(proof).catch(()=>null))throw Error('Refusing to seed an existing lab.');
 await fs.writeFile(proof,JSON.stringify({kind:'living-universe-disposable-linux-lab',root}),{flag:'wx',mode:0o600});
 sharp.cache(false);sharp.concurrency(1);
 const original=await sharp({create:{width:64,height:48,channels:3,background:'#336699'}}).png().toBuffer(),cropped=await sharp(original).extract({left:16,top:12,width:32,height:24}).png().toBuffer();
 await fs.writeFile(path.join(media,'fixture.png'),original,{flag:'wx'});await fs.writeFile(path.join(media,'.living-universe-storage.json'),JSON.stringify({storage_id:'synthetic-native-lab'}),{flag:'wx',mode:0o600});
 const app=await createApp({root:media,dataDir:state,mobile:{enabled:false},mcpWrites:null,mediaRootId:'synthetic-native-lab'}),id=randomUUID(),at=new Date().toISOString();
 try{app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(id,'fixture.png','','image',original.length,at,at);}finally{await app.close();}
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 await fs.writeFile(path.join(root,'config/mcp-config.json'),JSON.stringify({database,mediaRoot:media,mediaRootId:'synthetic-native-lab'}),{flag:'wx',mode:0o600});
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({id,port,original:original.toString('base64'),cropped:cropped.toString('base64'),sha256:hash(original)}),{flag:'wx',mode:0o600});
 await record('seed',{media_id:id});
}else{
 const marker=await json(proof);if(marker.kind!=='living-universe-disposable-linux-lab'||marker.root!==root)throw Error('Lab ownership proof mismatch.');
 const fixture=await json(path.join(root,'fixture.json')),url='http://127.0.0.1:'+fixture.port;
 const request=async(route,body)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});return {ok:r.ok,status:r.status,data:await r.json()};};
 const checkDb=()=>{const info=dbInfo();assert.equal(info.integrity,'ok');assert.equal(info.fk,0);assert.deepEqual(info.media,[{id:fixture.id,relative_path:'fixture.png'}]);assert.equal(info.canon,0);return info;};
 if(command==='port')console.log(fixture.port);
 else if(command==='ready'){
  let ready=false;for(let n=0;n<120;n++){try{const r=await request('/api/storage');if(r.ok&&r.data.resource_root===media){ready=true;break;}}catch{}await delay(250);}assert.ok(ready,'Lab service did not become ready.');checkDb();await record('service-ready');
 }else if(command==='cross-device-crop'){
  assert.notEqual((await fs.stat(media)).dev,(await fs.stat(state)).dev,'Real distinct filesystems are required.');
  const edit_id=randomUUID(),payload={edit_id,source_sha256:fixture.sha256,crop:{x:.25,y:.25,w:.5,h:.5},image_data:'data:image/png;base64,'+fixture.cropped};
  const applied=await request('/api/media/'+fixture.id+'/image-crop',payload);assert.equal(applied.status,200,JSON.stringify(applied.data));assert.equal(applied.data.status,'applied');
  assert.equal(hash(await fs.readFile(path.join(media,'fixture.png'))),hash(Buffer.from(fixture.cropped,'base64')));assert.equal(hash(await fs.readFile(path.join(state,'image-originals',edit_id+'.original'))),fixture.sha256);
  const restored=await request('/api/media/'+fixture.id+'/image-crop/restore',{edit_id,source_sha256:hash(Buffer.from(fixture.cropped,'base64'))});assert.equal(restored.status,200,JSON.stringify(restored.data));assert.equal(hash(await fs.readFile(path.join(media,'fixture.png'))),fixture.sha256);checkDb();await record('cross-device-crop-and-restore',{distinct_devices:true});
 }else if(command==='case-sensitive'){
  const upper=path.join(media,'Case.bin'),lower=path.join(media,'case.bin');try{await fs.writeFile(upper,'upper',{flag:'wx'});await fs.writeFile(lower,'lower',{flag:'wx'});assert.notEqual((await fs.stat(upper)).ino,(await fs.stat(lower)).ino);assert.equal(await fs.readFile(upper,'utf8'),'upper');assert.equal(await fs.readFile(lower,'utf8'),'lower');}finally{await fs.unlink(upper).catch(()=>{});await fs.unlink(lower).catch(()=>{});}await record('posix-case-sensitive-files');
 }else if(command==='marker-loss'){
  const markerFile=path.join(media,'.living-universe-storage.json'),held=markerFile+'.held';await fs.rename(markerFile,held);try{const r=await request('/api/scan',{});assert.equal(r.ok,false);checkDb();}finally{await fs.rename(held,markerFile);}await record('missing-marker-fails-before-scan');
 }else if(command==='mount-loss'){
  await assert.rejects(fs.stat(path.join(media,'.living-universe-storage.json')),e=>e.code==='ENOENT');let outcome;try{const r=await request('/api/scan',{});assert.equal(r.ok,false);outcome='scan-blocked';}catch(e){if(e instanceof assert.AssertionError)throw e;outcome='service-unreachable-after-mount-loss';}checkDb();await record('actual-bind-mount-loss-preserves-catalogue',{outcome});
 }else if(command==='stopped-database'){
  checkDb();await record('clean-stop-database-integrity');
 }else if(command==='crash-recovered'){
  checkDb();await record('systemd-crash-restart-preserves-id');
 }else if(command==='backup-restore'){
  const result=await createBackup({root:path.join(root,'source'),mediaRoot:media,database,destination:path.join(root,'checkpoints'),stageParent:path.join(root,'staging'),privateRuntime:false});
  const restored=await restoreSnapshot(result.snapshot,path.join(root,'restored'));assert.equal(restored.integrity,'ok');assert.equal(restored.foreign_key_violations,0);const info=dbInfo(path.join(root,'restored/data/universe.sqlite'));assert.deepEqual(info.media,[{id:fixture.id,relative_path:'fixture.png'}]);assert.equal(info.canon,0);await record('linux-private-runtime-omit-backup-restore',{credentials_included:false});
 }else if(command==='report')console.log(JSON.stringify(await json(path.join(root,'acceptance-results.json'))));
 else throw Error('Unknown explicit native lab command.');
}
