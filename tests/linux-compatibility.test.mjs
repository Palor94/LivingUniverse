import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createApp} from '../app/server.mjs';
import {runtimeHome,mcpConfigPath,readRuntimeConfig,servicePort,verifyMediaRoot} from '../app/runtime-config.mjs';
import {resolveMediaPath,portablePath,samePhysicalPath} from '../app/media-paths.mjs';
import {planPathMigration,applyPathMigration,assertNativeCataloguePaths} from '../app/path-migration.mjs';
import {startExisting} from '../app/start-existing.mjs';
import {thumbnail,referenceImage,dimensions,decoderEnvironment} from '../mcp/images.mjs';
import {decodeBmp} from '../mcp/bmp.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {sourceFiles,safeEntry} from '../ops/backup/backup.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-linux-fixture-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root);
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  return {base,root,dataDir,database:path.join(dataDir,'universe.sqlite')};
}
test('configuration has absolute Linux/XDG and explicit overrides without a working-directory fallback',()=>{
  const absolute=path.resolve(os.tmpdir(),'synthetic-xdg');
  assert.equal(runtimeHome({XDG_DATA_HOME:absolute}),path.join(absolute,'LivingUniverse'));
  assert.equal(runtimeHome({LU_RUNTIME_HOME:absolute}),absolute);
  assert.equal(mcpConfigPath({LU_RUNTIME_HOME:absolute}),path.join(absolute,'mcp-config.json'));
  assert.throws(()=>mcpConfigPath({LU_MCP_CONFIG:'relative.json'}),/absolute/);
  assert.throws(()=>runtimeHome({XDG_DATA_HOME:'relative'}),/absolute/);
  for(const invalid of ['',0,80,65536,'no'])assert.throws(()=>servicePort(invalid),/port/);
});
test('service startup fails closed on absent media, absent/wrong-name/empty database, and permits synthetic restart',async t=>{
  const f=await fixture(t),configFile=path.join(f.base,'config.json');
  await fs.writeFile(path.join(f.root,'.living-universe-storage.json'),'{"storage_id":"synthetic-lab-root"}');
  const save=extra=>fs.writeFile(configFile,JSON.stringify({database:f.database,mediaRoot:f.root,mediaRootId:'synthetic-lab-root',...extra}));
  await save();await assert.rejects(startExisting({configFile,port:15371}));await assert.rejects(fs.stat(f.dataDir),{code:'ENOENT'});
  await fs.mkdir(f.dataDir);await fs.writeFile(f.database,Buffer.alloc(0));
  await assert.rejects(startExisting({configFile,port:15371}),/schema/);assert.equal((await fs.stat(f.database)).size,0);
  await save({database:path.join(f.dataDir,'other.sqlite')});await assert.rejects(readRuntimeConfig(configFile),/universe.sqlite/);
  await save({mediaRoot:path.join(f.base,'absent')});await assert.rejects(startExisting({configFile,port:15371}));
  await save();const seed=await createApp({root:f.root,dataDir:f.dataDir,mobile:{enabled:false},imageGeneration:{}});await seed.close();
  // Use a test-owned ephemeral port to avoid all Windows production listeners.
  const net=await import('node:net'),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const app=await startExisting({configFile,port});try{assert.equal((await fetch('http://127.0.0.1:'+port+'/api/storage')).status,200);assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{await app.close();}
  const again=await startExisting({configFile,port});await again.close();
});
test('media root identity detects an absent mount marker before a scan can mark records missing',async t=>{
  const f=await fixture(t),marker=path.join(f.root,'.living-universe-storage.json');await fs.writeFile(marker,'{"storage_id":"synthetic-storage"}');
  const app=await createApp({root:f.root,dataDir:f.dataDir,mediaRootId:'synthetic-storage',mobile:{enabled:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  try{await verifyMediaRoot(f.root,'synthetic-storage');await fs.unlink(marker);const before=app.db.prepare('SELECT * FROM media_scan_state').all();const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.ok(response.status>=400);assert.deepEqual(app.db.prepare('SELECT * FROM media_scan_state').all(),before);await assert.rejects(verifyMediaRoot(f.root,'synthetic-storage'));}finally{await app.close();}
});
test('portable path resolution rejects foreign absolutes and traversal and preserves case on POSIX',()=>{
  const root=path.resolve(os.tmpdir(),'synthetic-root');
  assert.equal(resolveMediaPath(root,'10_CHARACTERS\\Ábel\\kép.jpg'),path.join(root,'10_CHARACTERS','Ábel','kép.jpg'));
  assert.equal(safeEntry(root,'one\\two.mjs'),path.join(root,'one','two.mjs'));
  assert.equal(portablePath('a\\b/c'),'a/b/c');
  for(const p of ['../escape','a/../b','C:\\private','C:relative','\\\\server\\share','/etc/passwd','a//b','a\0b'])assert.throws(()=>resolveMediaPath(root,p));
  if(process.platform!=='win32')assert.equal(samePhysicalPath('/tmp/Test','/tmp/test'),false);
});
test('explicit path migration preserves IDs, canon, journals and shared file bytes; scan and restart create no duplicates',async t=>{
  const f=await fixture(t),dir=path.join(f.root,'10_CHARACTERS','Ábel');await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(f.root,'00_SYSTEM','config'),{recursive:true});await fs.writeFile(path.join(f.root,'00_SYSTEM','config','storage-layout.json'),'{"layout_version":1}');
  const bytes=await sharp({create:{width:16,height:8,channels:3,background:'red'}}).png().toBuffer();await fs.writeFile(path.join(dir,'test.png'),bytes);
  const options={root:f.root,dataDir:f.dataDir,mobile:{enabled:false},imageGeneration:{},characterPolicy:{reject_female_characters:true}};
  const app=await createApp(options);const mid=randomUUID(),cid=randomUUID(),other=randomUUID(),rid=randomUUID(),journal=randomUUID(),stamp=(await fs.stat(path.join(dir,'test.png'))).mtime.toISOString();
  for(const id of [cid,other])app.db.prepare('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)').run(id,id,'Nem: férfi. Fiktív tesztkarakter.',stamp);
  app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'10_CHARACTERS\\Ábel\\test.png','10_CHARACTERS\\Ábel','image',bytes.length,stamp,stamp);
  for(const id of [cid,other])app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,id);
  app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(rid,cid,null,'Approved fixture',JSON.stringify([{media_id:mid,role:'face',sha256:sha(bytes)}]),'Synthetic approval',stamp);
  app.db.prepare('INSERT INTO file_moves VALUES(?,?,?,?,?,?,?)').run(journal,mid,'old\\test.png','10_CHARACTERS\\Ábel\\test.png','complete',sha(bytes),stamp);
  const protectedRows=app.db.prepare('SELECT * FROM canon').all(),history=app.db.prepare('SELECT * FROM file_moves').all();
  const plan=planPathMigration(app.db,{platform:'linux'});assert.equal(plan.blockers.length,0);assert.equal(plan.changes.length,1);
  assert.throws(()=>assertNativeCataloguePaths(app.db,'linux'),/explicit offline/);
  applyPathMigration(app.db,plan);assert.equal(planPathMigration(app.db,{platform:'linux'}).changes.length,0);
  assert.deepEqual(app.db.prepare('SELECT * FROM canon').all(),protectedRows);assert.deepEqual(app.db.prepare('SELECT * FROM file_moves').all(),history);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,2);
  await app.close();
  const restarted=await createApp(options);await new Promise(r=>restarted.server.listen(0,'127.0.0.1',r));
  try{const base='http://127.0.0.1:'+restarted.server.address().port;const scan=await(await fetch(base+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();assert.equal(scan.added,0);assert.equal(scan.missing,0);assert.equal(restarted.db.prepare('SELECT id FROM media').get().id,mid);assert.equal(sha(await fs.readFile(path.join(dir,'test.png'))),sha(bytes));}
  finally{await restarted.close();}
});
test('path migration refuses stale plans, unsafe locations and normalization collisions without partial updates',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT UNIQUE,folder TEXT)');db.prepare('INSERT INTO media VALUES(?,?,?)').run('one','a\\b.png','a');
    const plan=planPathMigration(db,{platform:'linux'});db.prepare('UPDATE media SET folder=?').run('changed');assert.throws(()=>applyPathMigration(db,plan),/Stale/);assert.equal(db.prepare('SELECT relative_path FROM media').get().relative_path,'a\\b.png');
    db.prepare('INSERT INTO media VALUES(?,?,?)').run('two','a/b.png','a');const collision=planPathMigration(db,{platform:'linux'});assert.equal(collision.blockers[0].code,'PATH_COLLISION');assert.throws(()=>applyPathMigration(db,collision),/blocked/);
    db.prepare('UPDATE media SET relative_path=? WHERE id=?').run('../escape','two');assert.ok(planPathMigration(db,{platform:'linux'}).blockers.some(b=>b.code==='UNSAFE_PATH'));
  }finally{db.close();}
});
test('new decoder credentials are allowlisted and external network attempts are blocked by the runner',async()=>{
  assert.deepEqual(decoderEnvironment({PATH:'fixture',OPENAI_API_KEY:'synthetic',CONTROL_PLANE_API_KEY:'synthetic',LU_MCP_CONFIG:'private',NODE_OPTIONS:'private'}),{PATH:'fixture'});
  await assert.rejects(fetch('https://example.invalid'),{code:'TEST_EGRESS_BLOCKED'});
});
test('portable decoder validates real pixels, limits, alpha, BMP and original byte identity',async t=>{
  const f=await fixture(t),png=await sharp({create:{width:20,height:12,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toBuffer();
  const image=await thumbnail(png),raw=await sharp(Buffer.from(image.data,'base64')).raw().toBuffer();assert.ok(raw.every(n=>n>245));assert.deepEqual(dimensions(Buffer.from(image.data,'base64')),{height:12,width:20});
  const gif=await sharp({create:{width:14,height:9,channels:3,background:'blue'}}).gif().toBuffer();assert.deepEqual(dimensions(Buffer.from((await thumbnail(gif)).data,'base64')),{height:9,width:14});
  const bmp=Buffer.alloc(54+8*3);bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(3,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);assert.equal(decodeBmp(bmp).data.length,18);assert.equal((await thumbnail(bmp)).mimeType,'image/jpeg');await assert.rejects(thumbnail(bmp.subarray(0,-1)));await assert.rejects(thumbnail(png.subarray(0,35)));
  const huge=Buffer.from(png);huge.writeUInt32BE(100000000,16);await assert.rejects(thumbnail(huge),/safe limits/);
  const app=await createApp({root:f.root,dataDir:f.dataDir,mobile:{enabled:false}});const mid=randomUUID(),at=new Date().toISOString();await fs.writeFile(path.join(f.root,'alpha.png'),png);app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'alpha.png','','image',png.length,at,at);const reader=await createCatalogue({database:f.database,mediaRoot:f.root,availability:async()=> 'local'});
  try{const result=await reader.call('get_media',{media_id:mid,include_image:true,image_quality:'original'});assert.deepEqual(Buffer.from(result.image.data,'base64'),png);assert.equal(result.data.image_info.sha256,sha(png));}finally{reader.close();await app.close();}
});
test('portable reference crops use oriented geometry for all eight EXIF orientations',async()=>{
  const raw=Buffer.alloc(80*40*3);for(let y=0;y<40;y++)for(let x=0;x<80;x++){const at=(y*80+x)*3;raw[at]=x<40?240:10;raw[at+1]=y<20?240:10;raw[at+2]=40;}
  for(let orientation=1;orientation<=8;orientation++){
    const jpeg=await sharp(raw,{raw:{width:80,height:40,channels:3}}).jpeg({quality:100}).withMetadata({orientation}).toBuffer();
    const oriented=await sharp(jpeg).autoOrient().raw().toBuffer({resolveWithObject:true});
    const result=Buffer.from((await referenceImage(jpeg,{x:0,y:0,w:.5,h:.5})).data,'base64'),got=await sharp(result).raw().toBuffer({resolveWithObject:true});
    assert.equal(got.info.width,oriented.info.width/2);assert.equal(got.info.height,oriented.info.height/2);
    const middle=((Math.floor(oriented.info.height/4)*oriented.info.width)+Math.floor(oriented.info.width/4))*3;const actual=(Math.floor(got.info.height/2)*got.info.width+Math.floor(got.info.width/2))*3;
    for(let c=0;c<3;c++)assert.ok(Math.abs(got.data[actual+c]-oriented.data[middle+c])<15,'orientation '+orientation);
  }
});
test('backup source selection retains new Linux launchers and lockfile but excludes private files',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.base,'ops','linux'),{recursive:true});
  for(const name of ['app.service','run.sh','Dockerfile'])await fs.writeFile(path.join(f.base,'ops','linux',name),'synthetic source');
  for(const name of ['package.json','pnpm-lock.yaml','.node-version','.env'])await fs.writeFile(path.join(f.base,name),'synthetic');
  await fs.writeFile(path.join(f.base,'ops','linux','secret.json'),'synthetic private value');
  const files=await sourceFiles(f.base);for(const name of ['ops/linux/app.service','ops/linux/run.sh','ops/linux/Dockerfile','pnpm-lock.yaml','.node-version'])assert.ok(files.includes(name),name);assert.ok(!files.includes('.env'));assert.ok(!files.includes('ops/linux/secret.json'));
});
