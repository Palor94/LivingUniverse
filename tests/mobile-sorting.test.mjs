import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';

test('private mobile sorting shares catalogue, detects conflicts, retries safely and preserves identity/history/files',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-mobile-sort-')),root=path.join(temp,'media');await fs.mkdir(root);
  const origin='https://laptop.example.ts.net',login='fixture@github',offline=new Set();let conversions=0,oversized=false,changeOnce=false,lastSource=null;
  const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login},mobileAvailability:async file=>{if(changeOnce){changeOnce=false;await fs.writeFile(file,'updated local image bytes');}return offline.has(file)?'online':'local';},mobileThumbnail:async source=>{conversions++;lastSource=source.toString();const bytes=Buffer.from('ffd8ffc0000b080001000101011100ffd9','hex');return {mimeType:'image/jpeg',data:(oversized?Buffer.concat([bytes,Buffer.alloc(196608)]):bytes).toString('base64')};}});
  await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));const port=app.mobileServer.address().port;
  const auth={'Tailscale-User-Login':login};let write;
  function request(route,body,method=body?'PUT':'GET',headers=body?write:auth){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,data:res.headers['content-type']?.includes('json')?JSON.parse(bytes):bytes});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
  const get=id=>request('/api/sorting/images/'+id);
  const save=(item,fields)=>request('/api/sorting/images/'+item.id,{expected_version:item.version,fields:{...item.fields,...fields}});
  const mid=randomUUID(),second=randomUUID(),third=randomUUID(),a=randomUUID(),b=randomUUID(),canonId=randomUUID(),reviewId=randomUUID(),locationId=randomUUID();
  try{
    for(const[id,name]of[[a,'Ádám'],[b,'Palor']])app.db.prepare('INSERT INTO characters(id,name,notes,created_at) VALUES(?,?,?,?)').run(id,name,'Private notes','2026-10-27');
    for(const[id,name]of[[mid,'01.png'],[second,'02.png'],[third,'03.png']]){await fs.writeFile(path.join(root,name),'original image bytes');app.db.prepare("INSERT INTO media VALUES(?,?,?,'image',?,?,?)").run(id,name,'',20,'2026-10-27','2026-10-27');}
    app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,a);
    app.db.prepare('INSERT INTO media_notes VALUES(?,?,?)').run(mid,'keep tag','Original note');
    app.db.prepare("INSERT INTO reviews VALUES(?,?,?,'approve',5,'Keep review',?)").run(reviewId,mid,a,'2026-10-27');
    app.db.prepare('INSERT INTO canon VALUES(?,?,NULL,?,?,?,?)').run(canonId,a,'Approved description',JSON.stringify([{media_id:mid,role:'face',sha256:'a'.repeat(64)}]),'Approved','2026-10-27');
    app.db.prepare("INSERT INTO structured_tags VALUES('group-setting-test','group-setting','M7 truckstop','m7 truckstop')").run();
    app.db.prepare('INSERT INTO locations(id,name,name_key,tag_id,folder,created_at) VALUES(?,?,?,?,NULL,?)').run(locationId,'M7 truckstop','m7 truckstop','group-setting-test','2026-10-27');
    assert.equal((await request('/api/sorting/images',null,'GET',{})).status,403);
    const session=await request('/api/session');write={...auth,Origin:origin,'X-LU-CSRF':session.data.csrf};
    assert.equal((await request('/api/sorting/images')).data.total,3);
    const original=(await get(mid)).data;
    assert.equal((await request('/api/sorting/images/'+mid,{expected_version:original.version,fields:original.fields},'PUT',auth)).status,403);
    assert.equal((await request('/api/sorting/images/'+mid,{expected_version:original.version,fields:original.fields},'PUT',{...write,Origin:'https://evil.example'})).status,403);
    const payload={character_ids:[a,b,b],structured_tag_ids:['group-reference-body'],tags:'keep tag, shared',notes:'Két szereplő\nMultiline',categorization_complete:true};
    const saved=await save(original,payload);assert.equal(saved.status,200);assert.equal(saved.data.fields.character_ids.length,2);assert.equal(saved.data.fields.categorization_complete,true);
    assert.equal((await request('/api/sorting/images')).data.total,2);
    const receipt=await save(original,payload);assert.equal(receipt.status,200);assert.equal(receipt.data.version,saved.data.version);
    assert.equal((await save(original,{notes:'Stale phone edit'})).status,409);
    assert.equal(app.db.prepare('SELECT notes FROM media_notes WHERE media_id=?').get(mid).notes,'Két szereplő\nMultiline');
    assert.equal((await save(saved.data,{character_ids:[b]})).status,409);
    const invalid=await save(saved.data,{character_ids:[a,b],structured_tag_ids:['missing'],notes:'must not partly save'});assert.equal(invalid.status,400);
    assert.equal((await save(saved.data,{notes:'x'.repeat(30001)})).status,400);
    const later=await save(saved.data,{categorization_complete:false});assert.equal(later.status,200);assert.equal((await request('/api/sorting/images')).data.total,3);
    const place=await save((await get(second)).data,{location_reference:true,location_id:locationId});assert.equal(place.status,200);assert.ok(place.data.fields.structured_tag_ids.includes('group-setting-test'));assert.equal((await request('/api/sorting/images')).data.total,2);
    assert.equal((await request('/api/sorting/images?scope=all')).data.total,3);
    const cleared=await save(place.data,{location_reference:false,location_id:null});assert.equal(cleared.status,200);assert.equal((await request('/api/sorting/images')).data.total,3);
    assert.equal((await request('/api/sorting/images/not-an-id')).status,400);
    app.db.prepare("INSERT INTO media_hidden VALUES(?,'03.png',0,?)").run(third,'2026-10-27');
    assert.equal((await get(third)).status,404);
    assert.equal((await request('/api/sorting/images/'+third+'/preview')).status,404);
    const preview=await request('/api/sorting/images/'+mid+'/preview');assert.equal(preview.status,200);assert.equal(preview.headers['content-type'],'image/jpeg');assert.equal(preview.headers['cache-control'],'no-store');assert(preview.data.length<=196608);
    assert.equal((await request('/api/sorting/images/'+mid+'/preview')).status,200);assert.equal(conversions,1);
    offline.add(path.join(root,'02.png'));assert.equal((await request('/api/sorting/images/'+second+'/preview')).status,409);assert.equal(conversions,1);
    offline.clear();oversized=true;assert.equal((await request('/api/sorting/images/'+second+'/preview')).status,413);oversized=false;
    changeOnce=true;assert.equal((await request('/api/sorting/images/'+second+'/preview')).status,200);assert.equal(lastSource,'updated local image bytes');
    app.db.prepare("UPDATE media SET relative_path='../outside.png' WHERE id=?").run(second);assert.equal((await request('/api/sorting/images/'+second+'/preview')).status,403);
    app.db.prepare("UPDATE media SET relative_path='missing.png' WHERE id=?").run(second);assert.equal((await request('/api/sorting/images/'+second+'/preview')).status,404);
    for(const route of ['/api/storage','/api/export','/api/removed','/media/'+mid])assert.equal((await request(route)).status,404);
    assert.equal((await request('/api/media/'+mid+'/move',{},'PUT')).status,404);
    assert.equal((await request('/api/sorting/images/'+mid,null,'DELETE',write)).status,405);
    const after=app.db.prepare('SELECT * FROM canon WHERE id=?').get(canonId);assert.equal(after.appearance,'Approved description');assert.equal(JSON.parse(after.references_json)[0].role,'face');assert.equal(app.db.prepare('SELECT COUNT(*) n FROM reviews WHERE id=?').get(reviewId).n,1);
    assert.equal(app.db.prepare('SELECT notes FROM characters WHERE id=?').get(a).notes,'Private notes');assert.equal(await fs.readFile(path.join(root,'01.png'),'utf8'),'original image bytes');assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);
    // External OneDrive moves/deletions are observations, never automatic relinks
    // or destructive record cleanup. The phone can explicitly request a scan.
    assert.equal((await request('/api/sorting/scan',{},'PUT',auth)).status,403);
    assert.equal((await request('/api/sorting/scan',{root:'anywhere'},'PUT')).status,400);
    const real=await fs.stat(path.join(root,'01.png'));app.db.prepare('UPDATE media SET size=?,modified_at=? WHERE id=?').run(real.size,real.mtime.toISOString(),mid);
    await fs.mkdir(path.join(root,'Moved'));await fs.rename(path.join(root,'01.png'),path.join(root,'Moved','01.png'));await fs.unlink(path.join(root,'02.png'));await fs.writeFile(path.join(root,'04.png'),'new image');
    const scan=await request('/api/sorting/scan',{},'PUT');assert.equal(scan.status,200);assert.equal(scan.data.running,false);assert.equal(scan.data.report.potentially_moved,1);assert.equal(scan.data.pending,1);assert.equal(scan.data.report.new,1);assert.equal(JSON.stringify(scan.data).includes('relative_path'),false);
    const filtered=await request('/api/sorting/images?scope=all');assert.equal(filtered.data.total,1);assert.equal(filtered.data.unavailable_total,2);
    assert.equal((await request('/api/sorting/images?scope=all&include_unavailable=1')).data.total,3);
    assert.equal(app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(mid).relative_path,'01.png');assert.equal(app.db.prepare('SELECT COUNT(*) n FROM depictions WHERE media_id=?').get(mid).n,2);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon WHERE id=?').get(canonId).n,1);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM file_moves').get().n,0);
    await fs.writeFile(path.join(root,'missing.png'),'file available again');assert.equal((await request('/api/sorting/scan',{},'PUT')).status,200);assert.equal((await request('/api/sorting/images?scope=all')).data.total,2);
    assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});

test('mobile cursor pages do not skip images when completed items leave Needs sorting',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-mobile-pages-')),root=path.join(temp,'media');await fs.mkdir(root);const app=await createApp({root,dataDir:path.join(temp,'data')});
  try{
    const {createMobileSorting}=await import('../app/mobile-sorting.mjs'),{installCatalogueActions}=await import('../app/catalogue-actions.mjs'),{installTaxonomy}=await import('../app/taxonomy.mjs'),{installLocations}=await import('../app/locations.mjs');
    const db=app.db,all=(q,...a)=>db.prepare(q).all(...a),one=(q,...a)=>db.prepare(q).get(...a),run=(q,...a)=>db.prepare(q).run(...a),transaction=fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},fail=m=>Error(m);
    const catalogue=installCatalogueActions({all,one,run,transaction,fail}),taxonomy=installTaxonomy({db,all,one,run,transaction,fail}),locations=installLocations({db,root,all,one,run,transaction,fail,setLocation:catalogue.setLocation}),sorting=createMobileSorting({root,all,one,run,transaction,catalogue,taxonomy,locations});
    for(let i=0;i<27;i++)run("INSERT INTO media VALUES(?,?,?,'image',1,'now','now')",randomUUID(),String(i).padStart(2,'0')+'.png','');
    const first=sorting.list(new URL('http://test/?scope=needs'));assert.equal(first.items.length,24);for(const m of first.items)catalogue.setComplete(m.id,true);
    const second=sorting.list(new URL('http://test/?scope=needs&after='+first.next));assert.equal(second.items.length,3);assert.equal(second.items[0].filename,'24.png');assert.equal(second.next,null);
    const target=first.items[0].id;await fs.writeFile(path.join(temp,'outside.png'),'outside');
    try{await fs.symlink(temp,path.join(root,'link'),'junction');run("UPDATE media SET relative_path='link/outside.png' WHERE id=?",target);await assert.rejects(sorting.preview(target),e=>e.status===403);}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
  }finally{await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
