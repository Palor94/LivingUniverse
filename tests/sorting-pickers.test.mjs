import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';
import {remainingMatches,selectedOrder} from '../app/public/sorting-pickers.js';
import {mediaFormValues} from '../app/public/media-form.js';

test('quick pickers match accents/aliases, exclude selected options and always put Palor last',()=>{
  const items=[{id:'palor',name:'Palor',checked:true},{id:'peter',name:'Pákozdi Péter',search:'Pákozdi Péter Pako',checked:false},{id:'attila',name:'Attila',checked:true}];
  assert.deepEqual(remainingMatches(items,'pako').map(i=>i.id),['peter']);assert.equal(remainingMatches(items,'').length,0);assert.equal(remainingMatches(items,'Palor').length,0);assert.deepEqual(selectedOrder(items,'palor').map(i=>i.id),['attila','palor']);
  items[1].checked=true;assert.deepEqual(selectedOrder(items,'palor').map(i=>i.id),['peter','attila','palor']);assert.equal(remainingMatches(items,'pako').length,0);
  const data=new FormData();data.set('location_multi','1');data.append('location_ids','first');data.append('location_ids','second');data.append('character','palor');data.append('character','peter');data.set('notes','Preserve notes');assert.deepEqual(mediaFormValues(data,true).location_ids,['first','second']);assert.equal(mediaFormValues(data,true).location_reference,false);data.delete('location_ids');assert.equal(mediaFormValues(data,false).location_reference,false);data.set('location_reference','on');assert.equal(mediaFormValues(data,false).location_reference,true);
});

test('multiple named locations preserve primary movement, characters, canon and backups; single-location clients remain compatible',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-multiple-locations-')),root=path.join(temp,'media');await fs.mkdir(root);const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false}});let restored;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  async function request(route,body,method=body?'POST':'GET',origin=base){const r=await fetch(origin+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function call(...args){const r=await request(...args);assert(r.status<300,JSON.stringify(r));return r.data;}
  try{
    await fs.writeFile(path.join(root,'image.png'),'reference bytes');await call('/api/scan',{});const mid=(await call('/api/media')).items[0].id,c=await call('/api/characters',{name:'Palor'}),p=await call('/api/characters',{name:'Pákozdi'}),a=await call('/api/locations',{name:'M7 truckstop'}),b=await call('/api/locations',{name:'Balaton'});
    const fields={character_ids:[c.id,p.id],tags:'original tags',notes:'Preserved notes',structured_tag_ids:[],categorization_complete:true,location_reference:true};await call('/api/media/'+mid,{...fields,location_id:a.id},'PUT');const canon=await call('/api/characters/'+c.id+'/canon',{appearance:'Approved',references:[{media_id:mid,role:'body'}]});
    const multiple=await call('/api/media/'+mid,{...fields,location_ids:[b.id,a.id]},'PUT');assert.equal(multiple.locations.length,2);assert.equal(multiple.location.id,a.id);assert.equal(multiple.characters.length,2);assert.equal(multiple.notes,fields.notes);assert(multiple.structured_tags.some(t=>t.id===b.tag_id));assert.equal((await call('/api/media?location_id='+b.id)).total,1);
    const invalid=await request('/api/media/'+mid,{...fields,notes:'Must not save partly',location_ids:[a.id,'not-a-location']},'PUT');assert.equal(invalid.status,400);assert.equal((await call('/api/media/'+mid)).notes,fields.notes);assert.equal((await call('/api/media/'+mid)).locations.length,2);
    await call('/api/media/'+mid,{...fields,location_id:a.id},'PUT');assert.equal((await call('/api/media/'+mid)).locations.length,2);
    const snapshot=await call('/api/export');assert.equal(snapshot.media_location_links.length,1);restored=await createApp({root,dataDir:path.join(temp,'restored'),mobile:{enabled:false}});await new Promise(r=>restored.server.listen(0,'127.0.0.1',r));const restoredBase='http://127.0.0.1:'+restored.server.address().port;await call('/api/restore',snapshot,'POST',restoredBase);const copy=await call('/api/media/'+mid,undefined,'GET',restoredBase);assert.equal(copy.locations.length,2);assert.equal(copy.location.id,a.id);assert.equal((await call('/api/characters/'+c.id)).canon.id,canon.id);
    await call('/api/media/bulk',{operation:'unlocation',media_ids:[mid]});const cleared=await call('/api/media/'+mid);assert.equal(cleared.locations.length,2);assert.equal(cleared.location_reference,false);assert.equal(cleared.characters.length,2);
    restored.db.exec(readFileSync(new URL('../app/migrations/015-multiple-locations.down.sql',import.meta.url),'utf8'));assert.equal(restored.db.prepare('SELECT location_id FROM media_locations WHERE media_id=?').get(mid).location_id,a.id);assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await restored?.close();await app.close();assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
