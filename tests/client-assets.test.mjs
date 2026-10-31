import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';

test('every browser entry-point import is served as JavaScript by the restricted asset allowlist',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-assets-'));let app;
  try{
    app=await createApp({root:temp,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+app.server.address().port,seen=new Set(),pending=['/client.js'];
    while(pending.length){const route=pending.pop();if(seen.has(route))continue;seen.add(route);const response=await fetch(origin+route);assert.equal(response.status,200,route+' must load before the catalogue can render');assert.match(response.headers.get('content-type'),/javascript/,route);const source=await response.text();
      for(const match of source.matchAll(/\bimport\s+(?:[^'";]*?\sfrom\s*)?['"](\.\/[^'"]+)['"]/g)){const url=new URL(match[1],origin+route);assert.equal(url.origin,origin);pending.push(url.pathname);}
    }
    assert.ok(seen.has('/picture-crop.js'));assert.ok(seen.has('/crop-selection.js'));assert.equal((await fetch(origin+'/server.mjs')).status,404);assert.equal((await fetch(origin+'/universe.sqlite')).status,404);
  }finally{await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
});
