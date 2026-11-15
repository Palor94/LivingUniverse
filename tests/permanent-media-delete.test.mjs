import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {approveCanon} from './canon-client.mjs';

// Permanent delete of a single picture (2026-11-12: the erase flow had no test at all).
test('permanent delete: only from the app itself, only the current version, never a canon reference; a failed attempt can be retried',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-perm-delete-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  let failUnlink=false;
  try{
    for(const n of ['doomed.png','keep.png','reference.png','retry.png'])await fs.writeFile(path.join(root,n),'synthetic '+n);
    await fs.writeFile(path.join(root,'clip.mp4'),'synthetic video');
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,permanentDeleteTestOptions:{unlink:async file=>{if(failUnlink)throw Object.assign(Error('locked'),{code:'EBUSY'});await fs.unlink(file);}}});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const host='127.0.0.1:'+app.server.address().port,base='http://'+host;
    const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
    const api=async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw Error(v.error);return v;};
    await api('/api/scan',{});const media=(await api('/api/media?kind=all')).items,id=n=>media.find(m=>m.relative_path===n)?.id;
    const c=await api('/api/characters',{name:'Teszt Dénes'});
    await api('/api/media/'+id('doomed.png'),{character_ids:[c.id],tags:'tag',notes:'note'},'PUT');
    await api('/api/media/bulk',{operation:'assign',media_ids:[id('reference.png')],character_ids:[c.id]});
    await approveCanon(api,c.id,{appearance:'Teszt',references:[{media_id:id('reference.png'),role:'face'}]});
    const del=n=>`/api/media/${id(n)}/permanent-delete`;
    const d=(await call(del('doomed.png'))).data;assert.equal(d.protected,false);assert.match(d.csrf,/^[a-f0-9]{64}$/);
    const ok={'X-LU-Delete-CSRF':d.csrf,Origin:base};

    // Only the app's own page, with its token.
    assert.equal((await call(del('doomed.png'),{expected_version:d.version})).status,403);
    assert.equal((await call(del('doomed.png'),{expected_version:d.version},{...ok,Origin:'http://evil.test'})).status,403);
    assert.equal((await call(del('doomed.png'),{expected_version:d.version},{...ok,'X-LU-Delete-CSRF':'0'.repeat(64)})).status,403);
    // Stale selection and malformed requests.
    let r=await call(del('doomed.png'),{expected_version:'x'.repeat(64)},ok);assert.equal(r.status,409);assert.equal(r.data.code,'STALE_MEDIA');
    assert.equal((await call(del('doomed.png'),{expected_version:d.version,extra:1},ok)).status,400);
    // Approved canon references and videos are refused; files stay.
    const ref=(await call(del('reference.png'))).data;assert.equal(ref.protected,true);
    r=await call(del('reference.png'),{expected_version:ref.version},ok);assert.equal(r.data.code,'CANON_REFERENCE_PROTECTED');
    assert.equal(await fs.readFile(path.join(root,'reference.png'),'utf8'),'synthetic reference.png');
    const vid=await call(del('clip.mp4'));assert.equal(vid.status,400);assert.equal(vid.data.code,'IMAGE_REQUIRED');
    assert.equal((await call('/api/media/not-a-uuid-at-all-but-36-characters/permanent-delete')).status,404);

    // Success: the file, the record and its links are gone; nothing else is touched.
    r=await call(del('doomed.png'),{expected_version:d.version},ok);assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.original_deleted,true);assert.equal(r.data.catalogue_deleted,true);
    await assert.rejects(fs.access(path.join(root,'doomed.png')));
    assert.equal(app.db.prepare('SELECT count(*) n FROM media WHERE id=?').get(d.media_id).n,0);
    assert.equal(app.db.prepare('SELECT count(*) n FROM depictions WHERE media_id=?').get(d.media_id).n,0);
    assert.equal(app.db.prepare('SELECT count(*) n FROM media_notes WHERE media_id=?').get(d.media_id).n,0);
    assert.equal(await fs.readFile(path.join(root,'keep.png'),'utf8'),'synthetic keep.png');
    // Asking again is answered from the journal, not an error.
    r=await call(`/api/media/${d.media_id}/permanent-delete`,{expected_version:d.version},ok);assert.equal(r.data.already_deleted,true);

    // A failed unlink keeps the record and an incomplete journal; an explicit retry finishes.
    const t=(await call(del('retry.png'))).data;failUnlink=true;
    r=await call(del('retry.png'),{expected_version:t.version},ok);assert.equal(r.data.complete,false);assert.equal(r.data.partial,false);
    assert.equal(await fs.readFile(path.join(root,'retry.png'),'utf8'),'synthetic retry.png');
    assert.equal((await call(del('retry.png'))).data.incomplete,true);
    failUnlink=false;r=await call(del('retry.png'),{expected_version:t.version},ok);assert.equal(r.data.complete,true);
    await assert.rejects(fs.access(path.join(root,'retry.png')));
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
