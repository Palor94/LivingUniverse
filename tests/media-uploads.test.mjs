import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Readable,PassThrough} from 'node:stream';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {serve} from '../mcp/server.mjs';
import {importTools} from '../mcp/imports.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {UPLOAD_CHUNK_BYTES as CHUNK} from '../app/media-uploads.mjs';
import {ImportError} from '../app/safe-download.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
function crc(bytes){let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function box(type,data){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function largePng(){const w=1024,h=1024,head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;const pixels=randomBytes((1+w*3)*h);for(let y=0;y<h;y++)pixels[y*(1+w*3)]=0;return Buffer.concat([png.subarray(0,8),box('IHDR',head),box('IDAT',deflateSync(pixels,{level:0})),box('IEND',Buffer.alloc(0))]);}
async function fixture(mode='trusted'){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-uploads-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),writeConfig=path.join(dataDir,'mcp-writes.json');
  let time=Date.now(),downloads=0;const config={enabled:true,token:randomBytes(32).toString('hex'),approval_mode:mode,origin:'https://fixture.example.ts.net',login:'fixture@example.test',database_id:databaseIdentity(database)};
  const f={temp,root,dataDir,database,config,writeConfig,downloads:()=>downloads,advance:ms=>{time+=ms;}};
  const sources=new Map([['https://files.example/good',png],['https://files.example/bad',Buffer.from('not an image')]]);f.sources=sources;
  f.boot=async()=>{
    f.app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login},importTestOptions:{clock:()=>time,download:async(url)=>{downloads++;if(!sources.has(url))throw new ImportError('DOWNLOAD_FAILED','Fixture download unavailable.',502);return {stream:f.downloadStream?await f.downloadStream():Readable.from([sources.get(url)]),contentType:'image/png',source:{kind:'url',source_origin:'https://files.example',source_path:'/fixture'}};}}});
    await new Promise(r=>f.app.server.listen(0,'127.0.0.1',r));await new Promise(r=>f.app.mobileServer.listen(0,'127.0.0.1',r));
    f.base='http://127.0.0.1:'+f.app.server.address().port;f.remote='http://127.0.0.1:'+f.app.mobileServer.address().port;
    await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:f.base}));f.writer=await createWriteClient({database,writeConfig});f.reader=await createCatalogue({database,mediaRoot:root});
  };
  f.stop=async()=>{f.reader.close();await f.app.close();};f.close=async()=>{await f.stop();await fs.rm(temp,{recursive:true,force:true});};await f.boot();
  f.characters=[randomUUID(),randomUUID()];for(const [i,id] of f.characters.entries())f.app.db.prepare('INSERT INTO characters(id,name,biography,appearance,created_at) VALUES(?,?,?,?,?)').run(id,'Disposable adult '+i,'Preserved biography','Working appearance',new Date().toISOString());
  f.app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(randomUUID(),f.characters[0],null,'Preserved approved appearance','[]','Explicit fixture approval',new Date().toISOString());
  f.app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),...f.characters,'Preserved directed relationship');
  f.protected=()=>JSON.stringify({characters:f.app.db.prepare('SELECT * FROM characters ORDER BY id').all(),canon:f.app.db.prepare('SELECT * FROM canon').all(),relationships:f.app.db.prepare('SELECT * FROM relationships').all()});
  f.call=async(name,args)=>(await f.writer.call(name,args)).data;
  f.begin=async(key='upload_import_01',extra={})=>f.call('begin_media_import',{request_key:key,character_ids:f.characters,...extra});
  f.start=async(importId,slot,bytes,extra={})=>f.call('begin_media_upload',{import_id:importId,slot_key:slot,filename:'chosen.png',content_type:'image/png',size_bytes:bytes.length,sha256:sha(bytes),...extra});
  f.send=async(u,bytes)=>{while(u.received_bytes<bytes.length)u=await f.call('upload_media_chunk',{upload_id:u.upload_id,offset:u.received_bytes,data_base64:bytes.subarray(u.received_bytes,u.received_bytes+CHUNK).toString('base64')});return u;};
  return f;
}

test('multi-megabyte image resumes after service restart; shared associations, receipts, thumbnail, search and immutable canon',async()=>{
  const f=await fixture();try{
    const original=f.protected(),bytes=largePng();assert.ok(bytes.length>3*1024*1024);
    const pending=await f.begin('large_resume_001',{title:'Unique portrait title',description:'Selected description',reference_candidate:true});
    let u=await f.start(pending.import_id,'large_picture_01',bytes,{filename:'../../arbitrary.png'});
    const chunk={upload_id:u.upload_id,offset:0,data_base64:bytes.subarray(0,CHUNK).toString('base64')};
    u=await f.call('upload_media_chunk',chunk);assert.equal(u.received_bytes,CHUNK);assert.equal((await f.call('upload_media_chunk',chunk)).received_bytes,CHUNK);
    await assert.rejects(f.call('upload_media_chunk',{...chunk,data_base64:Buffer.alloc(CHUNK,42).toString('base64')}),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(f.call('finalize_media_upload',{upload_id:u.upload_id}),{code:'UPLOAD_INCOMPLETE'});
    await f.stop();await f.boot();u=await f.call('get_media_upload',{upload_id:u.upload_id});assert.equal(u.received_bytes,CHUNK);
    await f.send(u,bytes);const saved=await f.call('finalize_media_upload',{upload_id:u.upload_id});assert.equal(saved.status,'committed');assert.equal(saved.receipt.sha256,sha(bytes));assert.equal(saved.receipt.size,bytes.length);assert.equal(saved.receipt.associations.length,2);assert.ok(saved.receipt.associations.every(a=>a.linked));
    assert.deepEqual(await f.call('finalize_media_upload',{upload_id:u.upload_id}),saved);
    const mid=saved.receipt.media_id,stored=f.app.db.prepare('SELECT * FROM media WHERE id=?').get(mid);assert.equal(stored.relative_path,path.join('Imported media',sha(bytes)+'.png'));assert.equal(sha(await fs.readFile(path.join(f.root,stored.relative_path))),sha(bytes));
    assert.ok((await fs.stat(path.join(f.dataDir,'import-thumbnails',sha(bytes)+'.jpg'))).size>0);assert.deepEqual(await fs.readdir(path.join(f.dataDir,'upload-staging')),[]);
    const read=await f.reader.call('get_media',{media_id:mid,include_image:true,image_quality:'original'});assert.equal(read.image.mimeType,'image/png');assert.deepEqual(Buffer.from(read.image.data,'base64'),bytes);assert.equal(read.data.image_info.sha256,sha(bytes));assert.equal(read.data.characters.length,2);assert.equal(read.data.notes,'Selected description');assert.equal(read.data.provenance[0].reference_candidate,true);
    for(const cid of f.characters)assert.equal((await f.reader.call('search_media',{character_id:cid,search:'Unique portrait title'})).data.media[0].id,mid);
    assert.equal(f.protected(),original);
    // A later character is ordinary data, with no code/config change.
    const third=randomUUID();f.app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(third,'Later adult',new Date().toISOString());
    const next=await f.begin('same_bytes_new_target',{character_ids:[third]});const nextUpload=await f.start(next.import_id,'same_bytes_slot',bytes);await f.send(nextUpload,bytes);assert.equal((await f.call('finalize_media_upload',{upload_id:nextUpload.upload_id})).receipt.media_id,mid);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,3);
  }finally{await f.close();}
});

test('ChatGPT stdio fileParams supports real retrieved bytes, independent batch failures and renewed URLs without duplicates',async()=>{
  const f=await fixture();try{
    const tool=importTools.find(t=>t.name==='import_media_files');assert.deepEqual(tool._meta['openai/fileParams'],['files']);assert.deepEqual(tool.inputSchema.properties.files.items.required,['download_url','file_id']);for(const k of ['file_id','download_url','mime_type','file_name'])assert.ok(tool.inputSchema.properties.files.items.properties[k]);
    const rpc=async(name,args)=>{const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);const done=serve({catalogue:f.reader,writer:f.writer,input,output});input.end([JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'}),JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}})].join('\n')+'\n');await done;return JSON.parse(wire.trim().split('\n').at(-1)).result;};
    const original=f.protected(),args={request_key:'native_batch_001',character_ids:f.characters,title:'Native title',files:[{file_id:'file-one',download_url:'https://files.example/good',file_name:'one.png'},{file_id:'file-two',download_url:'https://files.example/bad',file_name:'two.png'}]};
    const first=await rpc('import_media_files',args);assert.equal(first.isError,false);assert.deepEqual(first.structuredContent.results.map(i=>i.status),['committed','failed']);const mid=first.structuredContent.results[0].media_id;
    const secondPng=largePng();f.sources.set('https://files.example/renewed',secondPng);args.files[0].download_url='https://files.example/expired';args.files[1].download_url='https://files.example/renewed';const second=await rpc('import_media_files',args);
    assert.deepEqual(second.structuredContent.results.map(i=>i.status),['committed','committed']);assert.equal(second.structuredContent.results[0].media_id,mid);assert.equal(f.downloads(),3);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,2);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,4);
    const retry=await rpc('import_media_files',args);assert.equal(f.downloads(),3);assert.deepEqual(retry.structuredContent.results,second.structuredContent.results);assert.equal(f.protected(),original);
    const changed=await rpc('import_media_files',{...args,files:[...args.files].reverse()});assert.equal(changed.isError,true);assert.match(changed.content[0].text,/IDEMPOTENCY_CONFLICT/);
    assert.equal(JSON.stringify(second).includes('https://files.example/renewed'),false);
  }finally{await f.close();}
});

test('invalid IDs, sizes, base64, offsets, image formats and hashes are rejected; target validity is rechecked',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.begin('invalid_target_01',{character_ids:[f.characters[0],randomUUID()]}),{code:'NOT_FOUND'});
    const p=await f.begin();await assert.rejects(f.start(p.import_id,'oversize_slot',png,{size_bytes:20971521}),{code:'MEDIA_LIMIT'});
    await assert.rejects(f.start(p.import_id,'invalid_format',png,{content_type:'image/svg+xml'}),{code:'INVALID_MEDIA'});
    const u=await f.start(p.import_id,'valid_slot_01',png);
    await assert.rejects(f.call('upload_media_chunk',{upload_id:u.upload_id,offset:0,data_base64:'%%%='}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(f.call('upload_media_chunk',{upload_id:u.upload_id,offset:1,data_base64:png.toString('base64')}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(f.call('begin_media_upload',{import_id:p.import_id,slot_key:'path_slot_001',filename:'x.png',content_type:'image/png',size_bytes:png.length,sha256:sha(png),path:'C:\\private'}),{code:'INVALID_ARGUMENT'});
    f.app.db.prepare('INSERT INTO character_ui(character_id,merged_into) VALUES(?,?)').run(f.characters[1],f.characters[0]);
    await assert.rejects(f.send(u,png),{code:'NOT_FOUND'});f.app.db.prepare('DELETE FROM character_ui WHERE character_id=?').run(f.characters[1]);
    await f.send(u,png);f.app.db.prepare('INSERT INTO character_ui(character_id,merged_into) VALUES(?,?)').run(f.characters[1],f.characters[0]);await assert.rejects(f.call('finalize_media_upload',{upload_id:u.upload_id}),{code:'NOT_FOUND'});f.app.db.prepare('DELETE FROM character_ui WHERE character_id=?').run(f.characters[1]);
    const bad=Buffer.from('corrupt image'),v=await f.start(p.import_id,'bad_image_slot',bad);await f.send(v,bad);await assert.rejects(f.call('finalize_media_upload',{upload_id:v.upload_id}),{code:'INVALID_MEDIA'});
    const wrong=await f.start(p.import_id,'wrong_hash_slot',png,{sha256:'0'.repeat(64)});await f.send(wrong,png);await assert.rejects(f.call('finalize_media_upload',{upload_id:wrong.upload_id}),{code:'HASH_MISMATCH'});
    assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  }finally{await f.close();}
});

test('expired staged bytes are cleaned; quota and slot bounds remain bounded',async()=>{
  const f=await fixture();try{
    const p=await f.begin(),u=await f.start(p.import_id,'expired_slot_01',png);await f.send(u,png);f.advance(24*60*60*1000+1);
    assert.equal((await f.call('get_media_upload',{upload_id:u.upload_id})).status,'expired');await assert.rejects(f.call('finalize_media_upload',{upload_id:u.upload_id}),{code:'IMPORT_EXPIRED'});
    const next=await f.begin('next_import_001');await f.start(next.import_id,'next_slot_001',png);await assert.rejects(fs.access(path.join(f.dataDir,'upload-staging',u.upload_id)));
    for(let i=0;i<19;i++)await f.start(next.import_id,'many_slots_'+i,png);
    await assert.rejects(f.start(next.import_id,'twenty_first_slot',png),{code:'IMPORT_LIMIT'});
    await assert.rejects(f.call('import_media_url',{import_id:next.import_id,slot_key:'url_excess_slot',url:'https://files.example/good'}),{code:'IMPORT_LIMIT'});
    assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  }finally{await f.close();}
});

test('logical export restores targets and committed receipts but expires unfinished uploads without staging',async()=>{
  const f=await fixture();let restored;try{
    const p=await f.begin('restore_upload_001',{title:'Restorable image',reference_candidate:true}),u=await f.start(p.import_id,'restore_slot_01',png);await f.send(u,png);await f.call('finalize_media_upload',{upload_id:u.upload_id});
    const unfinished=await f.start(p.import_id,'unfinished_slot',png);await f.send(unfinished,png);
    const snapshot=await (await fetch(f.base+'/api/export')).json(),dataDir=path.join(f.temp,'restored');restored=await createApp({root:f.root,dataDir});await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));
    const response=await fetch('http://127.0.0.1:'+restored.server.address().port+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});assert.equal(response.status,200,await response.clone().text());
    for(const table of ['media_import_targets','media_import_metadata','media_import_items','depictions','canon'])assert.deepEqual(restored.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),f.app.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all());
    assert.equal(restored.db.prepare('SELECT status FROM media_uploads WHERE id=?').get(u.upload_id).status,'committed');assert.equal(restored.db.prepare('SELECT status FROM media_uploads WHERE id=?').get(unfinished.upload_id).status,'expired');assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await restored?.close();await f.close();}
});

test('global staging reservation is bounded and malformed PNGs cannot become media',async()=>{
  const f=await fixture();try{
    const p=await f.begin('quota_import_001');for(let i=0;i<12;i++)await f.start(p.import_id,'quota_slot_'+i,png,{size_bytes:20*1024*1024});await assert.rejects(f.start(p.import_id,'quota_slot_extra',png,{size_bytes:20*1024*1024}),{code:'STAGING_LIMIT'});
    const invalid=Buffer.from(png);invalid.writeUInt32BE(0xffffffff,16);const u=await f.start(p.import_id,'huge_dimensions',invalid);await f.send(u,invalid);await assert.rejects(f.call('finalize_media_upload',{upload_id:u.upload_id}),{code:'INVALID_MEDIA'});assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
  }finally{await f.close();}
});

test('commit failure is recoverable and shared links are atomic; cache and originals are never overwritten',async()=>{
  const f=await fixture();try{
    const p=await f.begin(),u=await f.start(p.import_id,'commit_slot_01',png);await f.send(u,png);
    f.app.db.exec("CREATE TRIGGER stop_import BEFORE INSERT ON depictions WHEN NEW.character_id='"+f.characters[1]+"' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    await assert.rejects(f.call('finalize_media_upload',{upload_id:u.upload_id}),{code:'IMPORT_FAILED'});assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,0);
    f.app.db.exec('DROP TRIGGER stop_import');const done=await f.call('finalize_media_upload',{upload_id:u.upload_id});assert.equal(done.status,'committed');assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM depictions').get().n,2);assert.equal((await fs.readdir(path.join(f.root,'Imported media'))).length,1);
  }finally{await f.close();}
});

test('authentication and review policy cover new operations; private page uses identity, Origin, CSRF and import binding',async()=>{
  const f=await fixture('review');try{
    const p=await f.begin(),args={import_id:p.import_id,slot_key:'private_slot_01',filename:'chosen.png',content_type:'image/png',size_bytes:png.length,sha256:sha(png)};
    for(const [operation,a] of [['upload_begin',args],['upload_chunk',{upload_id:randomUUID(),offset:0,data_base64:png.toString('base64')}],['upload_finalize',{upload_id:randomUUID()}],['files',{}]]){
      assert.equal((await fetch(f.base+'/api/mcp-imports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,arguments:a})})).status,403);
      assert.equal((await fetch(f.base+'/api/mcp-imports',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.config.token},body:JSON.stringify({operation,arguments:a})})).status,403);
    }
    const identity={'Tailscale-User-Login':f.config.login},session=await (await fetch(f.remote+'/api/session',{headers:identity})).json(),url=f.remote+'/api/media-imports/'+p.import_id+'/uploads';
    const headers={...identity,Origin:f.config.origin,'X-LU-CSRF':session.csrf,'Content-Type':'application/json'};
    const mobile=async(operation,a,h=headers,route=url)=>{const response=await fetch(route,{method:'PUT',headers:h,body:JSON.stringify({operation,arguments:a})});return {status:response.status,data:await response.json()};};
    const {import_id,...a}=args;assert.equal((await mobile('begin',a,{...headers,'X-LU-CSRF':'wrong'})).status,403);assert.equal((await mobile('begin',a,{...headers,Origin:'https://evil.example'})).status,403);assert.equal((await mobile('begin',a,{...headers,'Tailscale-User-Login':'other'})).status,403);
    const u=(await mobile('begin',a)).data;assert.ok(u.upload_id);
    const other=await f.begin('other_private_import');assert.equal((await mobile('chunk',{upload_id:u.upload_id,offset:0,data_base64:png.toString('base64')},headers,f.remote+'/api/media-imports/'+other.import_id+'/uploads')).status,403);
    assert.equal((await mobile('chunk',{upload_id:u.upload_id,offset:0,data_base64:png.toString('base64')})).status,200);assert.equal((await mobile('finalize',{upload_id:u.upload_id})).data.status,'committed');
  }finally{await f.close();}
});

test('import management releases a full 50-session quota, lists bounded pages and retains cancellation across restart',async()=>{
  const f=await fixture();try{
    const original=f.protected(),sessions=[];for(let i=0;i<50;i++)sessions.push(await f.begin('capacity_import_'+i));
    await assert.rejects(f.begin('capacity_overflow'),{code:'IMPORT_LIMIT'});
    const page=await f.call('list_media_imports',{limit:7,character_id:f.characters[1]});assert.equal(page.total,50);assert.equal(page.imports.length,7);assert.equal(page.next_offset,7);assert.equal(page.capacity.active_imports,50);
    const second=await f.call('list_media_imports',{limit:7,offset:7});assert.ok(second.imports.every(s=>!page.imports.some(p=>p.import_id===s.import_id)));
    await assert.rejects(f.call('list_media_imports',{limit:51}),{code:'INVALID_ARGUMENT'});await assert.rejects(f.call('cancel_media_import',{import_id:'../../private'}),{code:'INVALID_ID'});await assert.rejects(f.call('cancel_media_import',{import_id:randomUUID()}),{code:'NOT_FOUND'});
    const id=sessions[0].import_id,cancel=await f.call('cancel_media_import',{import_id:id});assert.equal(cancel.status,'cancelled');assert.equal(cancel.cleanup_complete,true);assert.equal(cancel.capacity.active_imports,49);
    assert.deepEqual(await f.call('cancel_media_import',{import_id:id}),cancel);assert.equal((await f.begin('capacity_import_0')).status,'cancelled');await f.begin('capacity_after_cancel');
    await f.stop();await f.boot();assert.equal((await f.call('get_media_import',{import_id:id})).status,'cancelled');assert.equal((await f.call('list_media_imports',{status:'cancelled'})).total,1);
    assert.equal(f.app.db.prepare("SELECT COUNT(*) n FROM media_import_events WHERE event='cancelled'").get().n,1);assert.equal(f.protected(),original);
  }finally{await f.close();}
});

test('cancellation removes chunks and reservations, preserves partial success and prevents stale/native/URL writes',async()=>{
  const f=await fixture();try{
    const original=f.protected(),p=await f.begin('cancel_partial_batch'),savedUpload=await f.start(p.import_id,'saved_picture_01',png);await f.send(savedUpload,png);
    const saved=await f.call('finalize_media_upload',{upload_id:savedUpload.upload_id}),media=await f.reader.call('get_media',{media_id:saved.receipt.media_id,include_image:true,image_quality:'original'});
    const pending=await f.start(p.import_id,'pending_picture_01',png);await f.send(pending,png);
    const bad=Buffer.from('broken'),failed=await f.start(p.import_id,'failed_picture_01',bad);await f.send(failed,bad);await assert.rejects(f.call('finalize_media_upload',{upload_id:failed.upload_id}),{code:'INVALID_MEDIA'});
    const list=await f.call('list_media_imports',{});assert.equal(list.imports[0].items.committed,1);assert.equal(list.imports[0].items.failed,1);assert.equal(list.capacity.reserved_upload_bytes,png.length+bad.length);
    const result=await f.call('cancel_media_import',{import_id:p.import_id});assert.equal(result.capacity.reserved_upload_bytes,0);assert.equal(result.items.committed,1);assert.equal(result.cleanup_complete,true);
    assert.deepEqual(await fs.readdir(path.join(f.dataDir,'upload-staging')),[]);
    assert.equal((await f.call('get_media_upload',{upload_id:pending.upload_id})).status,'cancelled');assert.equal((await f.call('finalize_media_upload',{upload_id:savedUpload.upload_id})).receipt.media_id,saved.receipt.media_id);
    await assert.rejects(f.call('finalize_media_upload',{upload_id:pending.upload_id}),{code:'IMPORT_CANCELLED'});await assert.rejects(f.send(pending,png),{code:'IMPORT_CANCELLED'});await assert.rejects(f.start(p.import_id,'new_picture_01',png),{code:'IMPORT_CANCELLED'});
    await assert.rejects(f.call('import_media_url',{import_id:p.import_id,slot_key:'after_cancel_01',url:'https://files.example/good'}),{code:'IMPORT_CANCELLED'});
    assert.deepEqual(await f.reader.call('get_media',{media_id:saved.receipt.media_id,include_image:true,image_quality:'original'}),media);assert.equal(f.protected(),original);
    const native={request_key:'cancel_native_01',character_ids:f.characters,files:[{file_id:'selected-file',download_url:'https://files.example/bad'}]},first=await f.call('import_media_files',native);
    await f.call('cancel_media_import',{import_id:first.import_id});native.files[0].download_url='https://files.example/good';const retry=await f.call('import_media_files',native);assert.equal(retry.results[0].error_code,'IMPORT_CANCELLED');assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,1);
  }finally{await f.close();}
});

test('cancelled imports release the byte quota and cleanup failures stay visible, safe and retryable',async()=>{
  const f=await fixture();try{
    const p=await f.begin('reserved_import_01');for(let i=0;i<12;i++)await f.start(p.import_id,'reserved_slot_'+i,png,{size_bytes:20*1024*1024});
    await assert.rejects(f.start(p.import_id,'reserved_extra_slot',png,{size_bytes:20*1024*1024}),{code:'STAGING_LIMIT'});
    const separate=await f.begin('separate_import_01'),u=await f.start(separate.import_id,'separate_slot_01',png);await f.send(u,png);
    const unexpected=path.join(f.dataDir,'upload-staging',u.upload_id,'preserve.txt');await fs.writeFile(unexpected,'Must remain untouched');
    const cancel=await f.call('cancel_media_import',{import_id:separate.import_id});assert.equal(cancel.cleanup_complete,false);assert.equal(cancel.cleanup_error_code,'CLEANUP_PENDING');assert.equal(await fs.readFile(unexpected,'utf8'),'Must remain untouched');
    await f.stop();await f.boot();assert.equal((await f.call('list_media_imports',{status:'cancelled'})).imports[0].uploads.cleanup_pending,1);
    // Test fixture removes its own unexpected file; the service must never do so.
    await fs.unlink(unexpected);assert.equal((await f.call('cancel_media_import',{import_id:separate.import_id})).cleanup_complete,true);
    await f.call('cancel_media_import',{import_id:p.import_id});assert.equal((await f.call('list_media_imports',{})).capacity.reserved_upload_bytes,0);
    const fresh=await f.begin('capacity_recovered');await f.start(fresh.import_id,'fresh_capacity_01',png,{size_bytes:20*1024*1024});
    f.advance(24*60*60*1000+1);assert.equal((await f.call('get_media_upload',{upload_id:u.upload_id})).status,'cancelled');assert.equal((await f.call('list_media_imports',{status:'expired'})).total,1);await f.call('cancel_media_import',{import_id:fresh.import_id});
  }finally{await f.close();}
});

test('merged targets can still be listed and cancelled without reopening writes or changing profiles',async()=>{
  const f=await fixture();try{
    const p=await f.begin(),u=await f.start(p.import_id,'merged_target_01',png);await f.send(u,png);
    f.app.db.prepare('INSERT INTO character_ui(character_id,merged_into) VALUES(?,?)').run(f.characters[1],f.characters[0]);
    assert.equal((await f.call('list_media_imports',{})).imports[0].characters.find(c=>c.character_id===f.characters[1]).available,false);
    assert.equal((await f.call('cancel_media_import',{import_id:p.import_id})).cleanup_complete,true);
  }finally{await f.close();}
});

test('management tools obey authentication/review policy and private cancellation uses identity, Origin and CSRF',async()=>{
  const f=await fixture('review');try{
    const p=await f.begin();for(const operation of ['list','cancel'])assert.equal((await fetch(f.base+'/api/mcp-imports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,arguments:{import_id:p.import_id}})})).status,403);
    await assert.rejects(f.call('cancel_media_import',{import_id:p.import_id}));assert.equal((await f.call('list_media_imports',{})).total,1);
    const identity={'Tailscale-User-Login':f.config.login},csrf=(await (await fetch(f.remote+'/api/session',{headers:identity})).json()).csrf;
    assert.equal((await fetch(f.remote+'/media-imports')).status,403);assert.equal((await fetch(f.remote+'/api/media-imports')).status,403);
    assert.match(await (await fetch(f.remote+'/media-imports',{headers:identity})).text(),/media-imports.js/);
    const headers={...identity,Origin:f.config.origin,'X-LU-CSRF':csrf,'Content-Type':'application/json'},cancel=h=>fetch(f.remote+'/api/media-imports/'+p.import_id+'/cancel',{method:'PUT',headers:h,body:'{}'});
    for(const h of [{...headers,'X-LU-CSRF':'bad'},{...headers,Origin:'https://evil.example'},{...headers,'Tailscale-User-Login':'other'}])assert.equal((await cancel(h)).status,403);
    assert.equal((await (await cancel(headers)).json()).status,'cancelled');assert.equal((await f.call('get_media_import',{import_id:p.import_id})).status,'cancelled');
  }finally{await f.close();}
});

test('ChatGPT stdio advertises version-gated management tools and performs list/cancel on the shared service',async()=>{
  const f=await fixture();try{
    const p=await f.begin(),input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);const done=serve({catalogue:f.reader,writer:f.writer,input,output});
    input.end([{method:'initialize'},{method:'tools/list'},{method:'tools/call',params:{name:'list_media_imports',arguments:{}}},{method:'tools/call',params:{name:'cancel_media_import',arguments:{import_id:p.import_id}}}].map((r,i)=>JSON.stringify({jsonrpc:'2.0',id:i+1,...r})).join('\n')+'\n');await done;
    const responses=wire.trim().split('\n').map(JSON.parse);assert.equal(responses[2].result.structuredContent.total,1);assert.equal(responses[3].result.structuredContent.cleanup_complete,true);
    const advertised=responses[1].result.tools;assert.equal(advertised.find(t=>t.name==='list_media_imports').annotations.readOnlyHint,true);assert.equal(advertised.find(t=>t.name==='cancel_media_import').annotations.destructiveHint,true);
    const oldInput=new PassThrough(),oldOutput=new PassThrough();let oldWire='';oldOutput.on('data',b=>oldWire+=b);const oldDone=serve({catalogue:f.reader,writer:{...f.writer,uploadVersion:2},input:oldInput,output:oldOutput});oldInput.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');await oldDone;
    assert.ok(!JSON.parse(oldWire.trim().split('\n').at(-1)).result.tools.some(t=>t.name==='cancel_media_import'));
  }finally{await f.close();}
});

test('cancellation blocks delayed downloads; an active receiver is busy and retains a committed result',async()=>{
  const f=await fixture();try{
    const p=await f.begin('delayed_download_01');let release,started;
    const seen=new Promise(r=>started=r);f.downloadStream=()=>new Promise(resolve=>{release=()=>resolve(Readable.from([png]));started();});
    const request=f.call('import_media_url',{import_id:p.import_id,slot_key:'delayed_slot_01',url:'https://files.example/good'});const outcome=assert.rejects(request,{code:'IMPORT_CANCELLED'});await seen;
    assert.equal((await f.call('cancel_media_import',{import_id:p.import_id})).cleanup_complete,true);release();await outcome;assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM media').get().n,0);
    const active=await f.begin('active_receiver_01'),stream=new PassThrough();f.downloadStream=async()=>stream;
    const saving=f.call('import_media_url',{import_id:active.import_id,slot_key:'active_receive_01',url:'https://files.example/good'});stream.write(png);
    // Wait for the service's staging file, proving receive has acquired its lock.
    let processing=false;for(let i=0;i<100;i++){try{processing=(await fs.readdir(path.join(f.dataDir,'import-staging'))).length>0;}catch{}if(processing)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(processing,true);await assert.rejects(f.call('cancel_media_import',{import_id:active.import_id}),{code:'BUSY'});
    stream.end();const saved=await saving;assert.equal(saved.items[0].status,'committed');assert.equal((await f.call('cancel_media_import',{import_id:active.import_id})).items.committed,1);
  }finally{await f.close();}
});
