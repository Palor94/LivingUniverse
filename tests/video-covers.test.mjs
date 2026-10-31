import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';
import {decodeCoverJpeg} from '../app/video-covers.mjs';
import {coverSourceRectangle} from '../app/public/enhancements.js';

// A generated 16x16 solid-colour JPEG; no private media is used in tests.
const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDq6KKK/os/Kj//2Q==';

test('cover image validation bounds JPEG bytes/dimensions and crop coordinates use source resolution',()=>{
  assert.equal(decodeCoverJpeg(jpeg).width,16);assert.equal(decodeCoverJpeg(jpeg).height,16);assert.throws(()=>decodeCoverJpeg('data:image/svg+xml;base64,PHN2Zz4='));assert.throws(()=>decodeCoverJpeg('data:image/jpeg;base64,'+'A'.repeat(400000)));
  assert.deepEqual(coverSourceRectangle(1920,1080,{x:.25,y:.1,w:.5,h:.5}),{x:480,y:108,w:960,h:540});
});

test('video frame covers preserve source IDs, canon and sorting, survive backups, and can return to image covers',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);let app,base;
  async function start(dir){app=await createApp({root,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
  async function request(route,body,method){const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  await start(path.join(temp,'data'));
  try{
    await fs.writeFile(path.join(root,'clip.mp4'),'video bytes fixture');await fs.writeFile(path.join(root,'reference.jpg'),decodeCoverJpeg(jpeg).bytes);await call('/api/scan',{});const items=(await call('/api/media')).items,video=items.find(m=>m.kind==='video'),image=items.find(m=>m.kind==='image');const c=await call('/api/characters',{name:'Kristóf'}),other=await call('/api/characters',{name:'Palor'});
    for(const m of items)await call('/api/media/'+m.id,{character_ids:[c.id],notes:'Keep source notes',tags:'original'},'PUT');const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Preserved',references:[{media_id:image.id,role:'face'}]});const before=await call('/api/export');
    const payload={media_id:video.id,time_seconds:5.05,image_data:jpeg,crop:{x:.1,y:.2,w:.3,h:.4},source_size:video.size,source_mtime:video.modified_at};
    assert.equal((await request('/api/characters/'+other.id+'/video-cover',payload)).status,400);assert.equal((await request('/api/characters/'+c.id+'/video-cover',{...payload,source_size:0})).status,409);assert.equal((await request('/api/characters/'+c.id+'/video-cover',{...payload,time_seconds:-1})).status,400);assert.equal((await request('/api/characters/'+c.id+'/video-cover',{...payload,crop:{x:.9,y:0,w:.5,h:1}})).status,400);
    await call('/api/characters/'+c.id+'/video-cover',payload);const profile=await call('/api/characters/'+c.id);assert.equal(profile.cover_id,video.id);assert.equal(profile.cover_frame.time_seconds,5.05);assert.equal(profile.canon.id,canon.id);assert.equal(JSON.parse(profile.cover_crop).w,1);assert.ok((await call('/api/state')).characters.find(x=>x.id===c.id).cover_frame);
    const asset=await fetch(base+'/api/characters/'+c.id+'/cover-frame');assert.equal(asset.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await asset.arrayBuffer()),decodeCoverJpeg(jpeg).bytes);const head=await fetch(base+'/api/characters/'+c.id+'/cover-frame',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
    const backup=await call('/api/export');assert.equal(backup.media.length,before.media.length);assert.deepEqual(backup.canon,before.canon);assert.deepEqual(backup.media_notes,before.media_notes);assert.deepEqual(backup.depictions,before.depictions);assert.deepEqual(backup.media_categorization,before.media_categorization);assert.deepEqual(JSON.parse(backup.character_cover_frames[0].source_crop_json),payload.crop);
    await app.close();await start(path.join(temp,'restored'));await call('/api/restore',backup);assert.equal((await call('/api/characters/'+c.id)).cover_frame.time_seconds,5.05);assert.equal((await fetch(base+'/api/characters/'+c.id+'/cover-frame')).status,200);
    await fs.writeFile(path.join(root,'clip.mp4'),'Changed source outside app');assert.equal((await request('/api/characters/'+c.id+'/video-cover',payload)).status,409);assert.equal((await fetch(base+'/api/characters/'+c.id+'/cover-frame')).status,200);
    await call('/api/characters/'+c.id+'/cover-crop',{media_id:image.id,crop:{x:0,y:0,w:1,h:1}});assert.equal((await call('/api/characters/'+c.id)).cover_frame,null);assert.equal((await fetch(base+'/api/characters/'+c.id+'/cover-frame')).status,404);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);assert.equal((await call('/api/export')).character_cover_frames.length,0);
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('living-universe-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
