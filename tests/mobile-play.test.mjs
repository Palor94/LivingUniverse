import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createApp} from '../app/server.mjs';
import {isPlayRoute} from '../app/mobile.mjs';

test('play routes the phone may reach: play, pictures and decisions yes; uploads, scans and the catalogue no',()=>{
  for(const [p,m] of [['/api/play','GET'],['/api/play/talk','POST'],['/api/play/settings','POST'],['/api/world-engine/levels','POST'],['/api/world-engine/events/abc','POST'],['/thumb/x','GET'],['/media/x','GET'],['/api/sprites/abc','GET'],['/play.js','GET'],['/style.css','GET']])assert.equal(isPlayRoute(p,m),true,m+' '+p);
  for(const [p,m] of [['/api/play/scenes/upload','POST'],['/api/play/scenes/scan','POST'],['/api/sprites/scan','POST'],['/api/backgrounds/scan','POST'],['/api/backgrounds/upload','POST'],['/media/x','DELETE'],['/api/state','GET'],['/api/export','GET'],['/api/characters','POST'],['/api/dev/restart','POST'],['/client.js','GET'],['/api/world-engine/run','POST']])assert.equal(isPlayRoute(p,m),false,m+' '+p);
});

test('phone play: same identity and origin rules, CSRF on changes, answers come from the desktop app',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-mobile-play-')),root=path.join(temp,'resources');await fs.mkdir(root);
  const origin='https://laptop.example.ts.net',login='owner@example';
  const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:true,origin,login}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
  const remote='http://127.0.0.1:'+app.mobileServer.address().port,local='http://127.0.0.1:'+app.server.address().port;
  const request=(base,route,body,method='GET',headers={})=>new Promise((resolve,reject)=>{const req=http.request(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,headers:res.headers,text,data:(res.headers['content-type']||'').includes('json')?JSON.parse(text):null});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
  try{
    const auth={'Tailscale-User-Login':login};
    assert.equal((await request(remote,'/play')).status,403,'no Tailscale identity, no play');
    const page=await request(remote,'/play',null,'GET',auth);assert.equal(page.status,200);assert.match(page.text,/play-mobile\.js/);assert.match(page.headers['content-security-policy'],/script-src 'self'/);
    assert.equal((await request(remote,'/play-mobile.js',null,'GET',auth)).status,200);
    const script=await request(remote,'/play.js',null,'GET',auth);assert.equal(script.status,200);assert.match(script.text,/installPlayUI/);
    assert.equal((await request(remote,'/client.js',null,'GET',auth)).status,404,'the desktop studio is not exposed');
    // Everything the phone page loads, followed import by import through the phone listener
    // (debugging package, 2026-11-13: a module missing here leaves the phone screen blank).
    const assets=[...page.text.matchAll(/(?:src|href)="\/?([\w.-]+\.(?:js|css))/g)].map(m=>'/'+m[1]),seen=new Set();
    while(assets.length){const route=assets.pop();if(seen.has(route))continue;seen.add(route);
      const res=await request(remote,route,null,'GET',auth);assert.equal(res.status,200,'phone cannot load '+route);
      assert.match(res.headers['content-type'],route.endsWith('.css')?/css/:/javascript/,route);
      if(route.endsWith('.js'))for(const m of res.text.matchAll(/\bimport\s*(?:[^'";]*?\sfrom\s*)?\(?\s*['"]\.\/([^'"?]+)/g))assets.push('/'+m[1]);}
    for(const f of ['/play.js','/debug-trail.js','/play-debug.js','/layout-check.js','/i18n.js'])assert.ok(seen.has(f),f+' reached');
    const settings=await request(remote,'/api/play/settings',null,'GET',auth);assert.equal(settings.status,200);assert.deepEqual(settings.data,(await request(local,'/api/play/settings')).data);
    assert.equal((await request(remote,'/api/play/settings',{adult:false},'POST',auth)).status,403,'a change needs the session token');
    const csrf=(await request(remote,'/api/session',null,'GET',auth)).data.csrf;
    assert.equal((await request(remote,'/api/play/settings',{adult:false},'POST',{...auth,Origin:'https://evil.ts.net','X-LU-CSRF':csrf})).status,403);
    const saved=await request(remote,'/api/play/settings',{text_speed:'fast'},'POST',{...auth,Origin:origin,'X-LU-CSRF':csrf});assert.equal(saved.status,200,saved.text);
    assert.equal((await request(local,'/api/play/settings')).data.text_speed,'fast','written through the desktop app');
    assert.equal((await request(remote,'/api/play/scenes/upload',{},'POST',{...auth,Origin:origin,'X-LU-CSRF':csrf})).status,405,'uploads stay on the desktop');
    assert.equal((await request(remote,'/api/play/settings',null,'GET',{...auth,'Sec-Fetch-Site':'cross-site'})).status,403);
  }finally{await app.close();await fs.rm(temp,{recursive:true,force:true});}
});
