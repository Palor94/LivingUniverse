import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createApp} from '../app/server.mjs';
import {createMobileServer} from '../app/mobile.mjs';

test('remote editor requires exact identity/origin, restricts actions, shares SQLite and detects stale edits',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-test-')),root=path.join(temp,'resources');await fs.mkdir(root);
  const origin='https://laptop.example.ts.net',login='Palor94@github';
  const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>app.mobileServer.listen(0,'127.0.0.1',resolve));
  const local='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port;
  function request(base,route,body,method='GET',headers={}){return new Promise((resolve,reject)=>{const req=http.request(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8'),type=res.headers['content-type'];resolve({status:res.statusCode,headers:new Headers(res.headers),data:type?.includes('json')?JSON.parse(text):text});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
  async function desktop(route,body,method=body?'POST':'GET'){const r=await request(local,route,body,method);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  try{
    const c=await desktop('/api/characters',{name:'Ádám'}),p=await desktop('/api/characters',{name:'Palor'});
    assert.equal((await request(remote,'/')).status,403);
    assert.equal((await request(remote,'/',null,'GET',{'Tailscale-User-Login':'someone@github'})).status,403);
    const auth={'Tailscale-User-Login':login};
    assert.equal((await request(remote,'/api/characters',null,'GET',{...auth,Host:'evil.ts.net'})).status,403);
    assert.equal((await request(remote,'/api/characters',null,'GET',{...auth,Host:'127.0.0.1:'+app.server.address().port})).status,403);
    assert.equal((await request(remote,'/api/characters',null,'GET',{...auth,Origin:'https://evil.test','X-Forwarded-Host':'laptop.example.ts.net'})).status,403);
    assert.equal((await request(remote,'/api/characters',null,'GET',{...auth,'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await request(remote,'/',null,'GET',{...auth,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})).status,200);
    const session=await request(remote,'/api/session',null,'GET',auth);assert.equal(session.status,200);assert.ok(session.data.csrf);
    const write={...auth,Origin:origin,'X-LU-CSRF':session.data.csrf};
    const edit={fields:{biography:'Written on iPad',notes:'Private admin notes',sexuality:'User-written sexuality',speech_style:'Direct. Example: Szia!'},expected:{biography:'',notes:'',sexuality:'',speech_style:''}};
    assert.equal((await request(remote,'/api/characters/'+c.id+'/fields',edit,'PATCH',auth)).status,403);
    assert.equal((await request(remote,'/api/characters/'+c.id+'/fields',edit,'PATCH',{...write,Origin:'https://other.ts.net'})).status,403);
    assert.equal((await request(remote,'/api/characters/'+c.id+'/fields',edit,'PATCH',write)).status,200);
    assert.equal((await desktop('/api/characters/'+c.id)).biography,'Written on iPad');assert.equal((await desktop('/api/characters/'+c.id)).sexuality,'User-written sexuality');assert.equal((await desktop('/api/characters/'+c.id)).speech_style,'Direct. Example: Szia!');
    assert.equal((await request(local,'/api/characters/'+c.id+'/profile-field',{field:'biography',value:'Stale desktop draft',expected:''},'POST')).status,409);
    assert.equal((await request(local,'/api/characters/'+c.id,{name:c.name,biography:'Old desktop full form',expected:{biography:''}},'PUT')).status,409);
    await desktop('/api/characters/'+c.id+'/profile-field',{field:'biography',value:'New desktop version'});
    const stale=await request(remote,'/api/characters/'+c.id+'/fields',{fields:{biography:'Stale phone edit',notes:'Do not partly apply'},expected:{biography:'Written on iPad',notes:'Private admin notes'}},'PATCH',write);
    assert.equal(stale.status,409);assert.equal((await desktop('/api/characters/'+c.id)).notes,'Private admin notes');
    assert.equal((await request(remote,'/api/characters/'+c.id+'/fields',{fields:{name:'Rename folder'},expected:{name:c.name}},'PATCH',write)).status,400);
    const relation='/api/relationships/'+c.id+'/'+p.id;
    assert.equal((await request(remote,relation,{description:'Friend of Palor',expected:null},'PUT',write)).status,200);
    assert.equal((await desktop('/api/characters/'+c.id)).relationships[0].description,'Friend of Palor');
    assert.equal((await request(local,'/api/relationships',{source_id:c.id,target_id:p.id,description:'Old desktop relationship',expected:null},'POST')).status,409);
    assert.equal((await request(remote,relation,{description:'Overwrite',expected:null},'PUT',write)).status,409);
    assert.equal((await request(remote,relation,{description:'',expected:'Friend of Palor'},'PUT',write)).status,200);
    for(const route of ['/api/export','/api/storage','/api/state','/api/removed','/client.js','/media/test'])assert.equal((await request(remote,route,null,'GET',auth)).status,404);
    for(const route of ['/api/restore','/api/media/test/remove','/api/media/test/move','/api/characters/'+c.id+'/canon'])assert.equal((await request(remote,route,{},'POST',write)).status,405);
    assert.equal((await request(remote,'/api/characters/'+c.id,null,'DELETE',write)).status,405);
    assert.equal((await request(remote,'/api/characters/'+c.id+'/fields',edit,'PATCH',{...write,'Content-Type':'text/plain'})).status,415);
    const html=await request(remote,'/',null,'GET',{...auth,Host:'laptop.example.ts.net'});assert.equal(html.status,200);assert.equal(html.headers.get('cache-control'),'no-store');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await request(local,'/api/state',null,'GET',{Origin:origin})).status,403);
    assert.equal((await request(local,'/api/state',null,'GET',{Host:'laptop.example.ts.net'})).status,403);
    assert.throws(()=>createMobileServer({config:{enabled:true,origin:'http://laptop.example.ts.net',login}}));
    assert.throws(()=>createMobileServer({config:{enabled:true,origin,login:''}}));
  }finally{await app.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
