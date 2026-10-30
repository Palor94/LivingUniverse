import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {createApp} from '../app/server.mjs';
import {createCatalogue,openReadOnlyDatabase} from '../mcp/catalogue.mjs';
import {serve,tools} from '../mcp/server.mjs';
import {thumbnail,dimensions,MAX_IMAGE_BYTES} from '../mcp/images.mjs';

function bmp(w=1600,h=900){const row=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+row*h,137);b.fill(0,0,54);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);return b;}
test('MCP catalogue is read-only, ID-bound, canon-aware, path-safe, bounded and stdio-only',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false}}),database=path.join(temp,'data','universe.sqlite');
  const cid=randomUUID(),other=randomUUID(),mid=randomUUID(),video=randomUUID(),revision=randomUUID(),older=randomUUID();
  const bytes=bmp();await fs.writeFile(path.join(root,'reference.bmp'),bytes);await fs.writeFile(path.join(root,'clip.mp4'),'video never downloaded');
  const hash=createHash('sha256').update(bytes).digest('hex');
  app.db.prepare('INSERT INTO characters(id,name,appearance,notes,created_at) VALUES(?,?,?,?,?)').run(cid,'Pákozdi','Working draft','Private creator knowledge','2026-10-25');
  app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(other,'Palor','2026-10-25');
  const stat=await fs.stat(path.join(root,'reference.bmp')),vstat=await fs.stat(path.join(root,'clip.mp4'));
  app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'reference.bmp','','image',stat.size,stat.mtime.toISOString(),'2026-10-25');
  app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(video,'clip.mp4','','video',vstat.size,vstat.mtime.toISOString(),'2026-10-25');
  for(const person of [cid,other])app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,person);
  app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(video,cid);
  app.db.prepare('INSERT INTO media_notes VALUES(?,?,?)').run(mid,'body, white tank top','Keep proportions. C:\\Users\\private\\secret.png');
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),cid,other,'Friend of Palor');
  const group=randomUUID(),tag=randomUUID();app.db.prepare('INSERT INTO tag_groups VALUES(?,?,?)').run(group,'Clothing','clothing');app.db.prepare('INSERT INTO structured_tags VALUES(?,?,?,?)').run(tag,group,'white tank top','white tank top');app.db.prepare('INSERT INTO media_tags VALUES(?,?)').run(mid,tag);
  // Revision order follows the application’s rowid semantics, not timestamp sorting.
  app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(older,cid,null,'Older approved appearance',JSON.stringify([{media_id:mid,role:'face',sha256:hash}]),'Old approval','2099-01-01');
  app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,cid,older,'Approved body proportions',JSON.stringify([{media_id:mid,role:'body',sha256:hash}]),'Explicit approval','2026-10-25');
  const before=app.db.prepare('SELECT * FROM canon ORDER BY rowid').all();
  let catalogue;
  try{
    const readonly=await openReadOnlyDatabase(database);assert.throws(()=>readonly.prepare('UPDATE characters SET name=? WHERE id=?').run('Changed',cid),/readonly|read.only/i);assert.throws(()=>readonly.exec('CREATE TABLE forbidden(x)'));readonly.close();
    catalogue=await createCatalogue({database,mediaRoot:root,availability:async()=> 'local'});
    assert.equal((await catalogue.call('list_characters',{limit:1})).data.next_offset,1);
    const c=(await catalogue.call('get_character',{character_id:cid})).data;assert.equal(c.notes,undefined);assert.equal(c.approved_canon.id,revision);assert.equal(c.approved_canon.appearance,'Approved body proportions');assert.equal(c.appearance,'Working draft');assert.equal(c.relationships[0].target_id,other);assert.equal(c.canon_history[1].id,older);
    await assert.rejects(catalogue.call('get_character',{character_id:cid,include_admin_notes:true}),{code:'ADMIN_NOTES_DISABLED'});
    const m=(await catalogue.call('get_media',{media_id:mid})).data;assert.equal(m.characters.length,2);assert.equal(m.structured_tags[0].id,tag);assert.match(m.notes,/private location/);assert.equal(JSON.stringify(m).includes(root),false);assert.equal(m.relative_path,undefined);assert.equal(m.folder,undefined);
    assert.equal((await catalogue.call('search_media',{search:'white tank top'})).data.media[0].id,mid);
    assert.equal((await catalogue.call('get_approved_references',{character_id:cid,revision_id:older})).data.references[0].role,'face');
    await assert.rejects(catalogue.call('get_approved_references',{character_id:other,revision_id:revision}),{code:'NOT_FOUND'});
    await assert.rejects(catalogue.call('get_approved_references',{character_id:cid,media_id:video,include_image:true,image_quality:'original'}),{code:'NOT_APPROVED'});
    for(const input of ['../reference.bmp','C:\\private.png','file:///private','not-a-uuid'])await assert.rejects(catalogue.call('get_media',{media_id:input}),{code:'INVALID_ID'});
    await assert.rejects(catalogue.call('get_media',{media_id:mid,path:'../secret'}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(catalogue.call('search_media',{limit:10000}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(catalogue.call('delete_media',{media_id:mid}),{code:'UNKNOWN_TOOL'});
    const addUnsafe=rel=>{const id=randomUUID();app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(id,rel,'','image',10,null,'2026-10-25');return id;};
    for(const rel of ['../outside.png','C:\\private.png','nested/../../outside.png','backups/secret.bmp','app/secret.bmp'])await assert.rejects(catalogue.call('get_media',{media_id:addUnsafe(rel),include_image:true,image_quality:'original'}),{code:'UNSAFE_MEDIA'});
    await assert.rejects(catalogue.call('get_media',{media_id:addUnsafe('missing.bmp'),include_image:true,image_quality:'original'}),{code:'MEDIA_UNAVAILABLE',recoverable:true});
    await fs.mkdir(path.join(temp,'outside'));await fs.writeFile(path.join(temp,'outside','secret.bmp'),bytes);
    await fs.symlink(path.join(temp,'outside'),path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(catalogue.call('get_media',{media_id:addUnsafe('linked/secret.bmp'),include_image:true,image_quality:'original'}),{code:'UNSAFE_MEDIA'});
    const offline=await createCatalogue({database,mediaRoot:root,availability:async()=> 'online'});try{await assert.rejects(offline.call('get_media',{media_id:mid,include_image:true,image_quality:'original'}),{code:'MEDIA_OFFLINE',recoverable:true});}finally{offline.close();}
    if(process.platform==='win32'){
      const approved=await catalogue.call('get_approved_references',{character_id:cid,media_id:mid,include_image:true,image_quality:'original'});assert.equal(approved.image.type,'image');assert.deepEqual(Buffer.from(approved.image.data,'base64'),bytes);assert.equal(approved.image.mimeType,'image/bmp');assert.equal(approved.data.image_info.width,1600);assert.equal(approved.data.image_info.sha256,hash);const preview=await thumbnail(bytes);
      app.db.prepare('INSERT INTO character_cover_frames VALUES(?,?,?,?,?,?,?,?)').run(cid,video,5,'data:image/jpeg;base64,'+preview.data,'{}',vstat.size,vstat.mtime.toISOString(),'2026-10-25');
      const still=await catalogue.call('get_media',{media_id:video,include_image:true,image_quality:'original',frame_character_id:cid});assert.equal(still.data.video_download_available,false);assert.equal(still.data.selected_still.time_seconds,5);assert.equal(still.data.selected_still.canonical_reference,false);assert.ok(Buffer.from(still.image.data,'base64').length<=MAX_IMAGE_BYTES);
    }else t.diagnostic('Windows thumbnail converter not available on this platform; metadata/safety tests still run.');
    await fs.writeFile(path.join(root,'reference.bmp'),bmp(100,100));await assert.rejects(catalogue.call('get_approved_references',{character_id:cid,media_id:mid,include_image:true,image_quality:'original'}),{code:'CANON_MISMATCH'});
    const unbounded=await createCatalogue({database,mediaRoot:root,availability:async()=> 'local',makeThumbnail:async()=>({type:'image',mimeType:'image/jpeg',data:Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64')})});try{await assert.rejects(unbounded.call('get_media',{media_id:mid,include_image:true,image_quality:'original'}),{code:'IMAGE_UNAVAILABLE'});}finally{unbounded.close();}
    const input=new PassThrough(),output=new PassThrough();let wire='';output.on('data',b=>wire+=b);const running=serve({catalogue,input,output});
    input.end([JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}),JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'}),JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_characters',arguments:{limit:1}}}),JSON.stringify({jsonrpc:'2.0',id:4,method:'resources/read',params:{uri:'file:///secret'}}),'x'.repeat(33000)].join('\n')+'\n');await running;
    const replies=wire.trim().split('\n').map(JSON.parse);assert.equal(replies[1].result.tools.length,10);assert.ok(tools.every(tool=>tool.annotations.readOnlyHint&&!tool.annotations.destructiveHint&&!tool.annotations.openWorldHint));assert.equal(replies[2].result.isError,false);assert.equal(replies[3].error.code,-32601);assert.equal(replies[4].error.code,-32600);assert.equal(wire.includes(database),false);assert.equal(wire.includes(root),false);
    assert.deepEqual(app.db.prepare('SELECT * FROM canon ORDER BY rowid').all(),before);assert.equal(app.db.prepare('SELECT name FROM characters WHERE id=?').get(cid).name,'Pákozdi');assert.equal(await fs.readFile(path.join(root,'clip.mp4'),'utf8'),'video never downloaded');
  }finally{catalogue?.close();await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
