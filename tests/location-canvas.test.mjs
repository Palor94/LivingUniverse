import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {WORLD_ROOT,catalogueCanvas,normalizeCanvas,canvasLayout,reparentCanvas,moveCanvasBranch,zoomCanvas,copy,retireCanvas} from '../app/public/location-canvas-model.js';

const catalogue=[{id:'one',name:'First',parent_id:null},{id:'two',name:'Second',parent_id:'one'},{id:'three',name:'Third',parent_id:null}];
test('single world root, catalogue identity, cycles and type parents',()=>{
  const s=catalogueCanvas(catalogue);assert.equal(s.nodes.find(n=>n.id==='one').parent_id,WORLD_ROOT);assert.equal(s.nodes.find(n=>n.id==='two').parent_id,'one');assert.equal(s.nodes.find(n=>n.id==='two').source_id,'two');
  assert.throws(()=>reparentCanvas(copy(s),'one','two'),/leszármazott/);assert.throws(()=>reparentCanvas(copy(s),WORLD_ROOT,'one'),/gyökere/);
  const broken=copy(s);broken.nodes.find(n=>n.id===WORLD_ROOT).name='Changed';assert.throws(()=>normalizeCanvas(broken),/gyökér/);
  const moved=copy(s);reparentCanvas(moved,'one','three');assert.equal(moved.nodes.find(n=>n.id==='two').parent_id,'one');assert.equal(moved.nodes.find(n=>n.id==='one').source_id,'one');
});
test('layout, collapsed branches, branch movement and anchored zoom',()=>{
  const s=catalogueCanvas(catalogue),layout=canvasLayout(s);assert.equal(layout.visible.length,4);assert.equal(layout.edges.length,3);assert.equal(canvasLayout(s,new Set(['one'])).visible.length,3);
  const p=layout.positions.get('one'),q=layout.positions.get('two');moveCanvasBranch(s,'one',layout,60,30);assert.equal(s.nodes.find(n=>n.id==='one').x,p.x+60);assert.equal(s.nodes.find(n=>n.id==='two').y,q.y+30);
  const camera={x:20,y:30,z:1},point={x:200,y:160},zoomed=zoomCanvas(camera,2,point);assert.equal((point.x-zoomed.x)/zoomed.z,(point.x-camera.x)/camera.z);assert.equal((point.y-zoomed.y)/zoomed.z,(point.y-camera.y)/camera.z);
  assert.throws(()=>retireCanvas(s,'one'),/gyermek/);retireCanvas(s,'two');assert.equal(s.nodes.find(n=>n.id==='two').source_id,'two');
});
test('private layout proposal seeds map to current catalogue without inventing routes or merging identities',()=>{
  const initial={types:[{id:'type-beach',name:'Strand'}],nodes:[{id:'folder',name:'Places',source_id:null,kind:'collection',interpretation:'collection',placed:true,parent_id:null,type_ids:[],order:0},{id:'one',name:'Old name',source_id:'one',kind:'source',interpretation:'type',placed:false,parent_id:null,type_ids:['type-beach'],order:1},{id:'two',name:'Second',source_id:'two',kind:'source',interpretation:'place',placed:true,parent_id:'folder',type_ids:[],order:2}]};
  const s=catalogueCanvas(catalogue,{initial});assert.equal(s.nodes.find(n=>n.id==='one').name,'First');assert.equal(s.nodes.find(n=>n.id==='one').kind,'type-source');assert.equal(s.nodes.find(n=>n.id==='one').placed,false);assert.equal(s.nodes.find(n=>n.id==='folder').parent_id,WORLD_ROOT);assert.equal(s.nodes.find(n=>n.id==='three').source_id,'three');assert.equal(s.edges,undefined);
});
test('Locations endpoints preserve SQL catalogue, require creator CSRF, refuse stale writes, retain history and roundtrip restart',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-location-canvas-'));let app;
  try{
    const root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);
    app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:null,imageGeneration:{enabled:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let origin='http://127.0.0.1:'+app.server.address().port;
    async function call(route,body,headers={}){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json()};}
    const place=(await call('/api/locations',{name:'Known place'})).body;
    const tablesBefore=app.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const profileBefore=app.db.prepare('SELECT * FROM locations ORDER BY id').all();
    let view=await call('/api/location-canvas');assert.equal(view.status,200);assert.equal(view.body.head,null);assert.equal(view.body.state.nodes.some(n=>n.source_id===place.id),true);
    await assert.rejects(fs.stat(path.join(dataDir,'location-canvas.json')),e=>e.code==='ENOENT');
    assert.deepEqual(app.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),tablesBefore);
    const state=copy(view.body.state);state.nodes.push({id:'draft:'+randomUUID(),name:'New area',parent_id:WORLD_ROOT,kind:'place',source_id:null,type_ids:[],placed:true,archived:false,order:9,note:'',x:250,y:420});
    const request={expected_head:null,catalogue_version:view.body.catalogue_version,request_key:randomUUID(),state,reason:'A draft'};
    assert.equal((await call('/api/location-canvas/draft',request)).status,403);assert.equal((await call('/api/location-canvas/draft',request,{Origin:'http://evil.test','X-LU-Location-CSRF':view.body.csrf})).status,403);
    const headers={Origin:origin,'X-LU-Location-CSRF':view.body.csrf};let result=await call('/api/location-canvas/draft',request,headers);assert.equal(result.status,200);const first=result.body.head;
    assert.equal((await call('/api/location-canvas/draft',request,headers)).body.replayed,true);
    assert.equal((await call('/api/location-canvas/draft',{...request,reason:'Different'},headers)).status,409);
    assert.equal((await call('/api/location-canvas/draft',{...request,request_key:randomUUID()},headers)).status,409);
    assert.deepEqual(app.db.prepare('SELECT * FROM locations ORDER BY id').all(),profileBefore);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
    view=await call('/api/location-canvas');const approve={expected_head:first,catalogue_version:view.body.catalogue_version,request_key:randomUUID(),state:view.body.state,reason:'Explicit approved design'};
    result=await call('/api/location-canvas/approve',approve,headers);assert.equal(result.status,200);assert.equal(result.body.approved_head,result.body.head);const approved=result.body.head;
    const archive=(await call('/api/location-canvas/export')).body;assert.equal(archive.revisions.length,2);assert.equal(archive.revisions[0].id,first);assert.equal(archive.revisions[0].kind,'draft');assert.equal(archive.revisions[1].kind,'approved');assert.equal(archive.revisions[1].actor,'local-creator');
    assert.equal((await call('/api/location-canvas/revisions/'+first)).body.id,first);
    await call('/api/locations',{name:'Another source'});view=await call('/api/location-canvas');assert.equal((await call('/api/location-canvas/draft',{...approve,expected_head:approved,request_key:randomUUID()},headers)).status,409);
    assert.equal((await fetch(origin+'/location-canvas.js')).status,200);assert.equal((await fetch(origin+'/location-canvas.css')).status,200);assert.equal((await fetch(origin+'/location-canvas.json')).status,404);
    await app.close();app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:null,imageGeneration:{enabled:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;
    view=await call('/api/location-canvas');assert.equal(view.body.approved_head,approved);assert.equal(view.body.history.length,2);assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
