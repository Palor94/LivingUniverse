import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

// Smoke test for the browser side (2026-11-12). Three slips that broke screens before without
// any failing test: a new client module missing from the server's static list (404 → blank
// page), a syntax error in a client file, and a t('key') with no Hungarian text.
const pub=new URL('../app/public/',import.meta.url);

test('every client file parses',async()=>{
  for(const f of (await fs.readdir(pub)).filter(f=>f.endsWith('.js'))){
    const r=spawnSync(process.execPath,['--check',new URL(f,pub).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8'});
    assert.equal(r.status,0,f+': '+r.stderr);
  }
});

test('the main page and every module it imports are served',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-smoke-'));
  const app=await createApp({root:path.join(base,'media'),dataDir:path.join(base,'data'),mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,
    systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const html=await (await fetch(origin+'/')).text();
  const queue=[...html.matchAll(/(?:src|href)="\/?([^"?#:]+\.(?:js|css))/g)].map(m=>m[1]);
  const seen=new Set();
  while(queue.length){
    const file=queue.shift();if(seen.has(file))continue;seen.add(file);
    const r=await fetch(origin+'/'+file);
    assert.equal(r.status,200,'/'+file+' is not served (add it to the static list in server.mjs)');
    if(file.endsWith('.js'))for(const m of (await r.text()).matchAll(/\bimport\s*(?:\(\s*|[^'"\n]*?from\s*)['"]\.\/([^'"?]+)/g))queue.push(m[1]);
  }
  assert.ok(seen.has('client.js')&&seen.has('dev-tools.js')&&seen.size>20,'walked the module graph');
});

test('every literal text key used by the client exists',async()=>{
  const i18n=await fs.readFile(new URL('i18n.js',pub),'utf8');
  const missing=[];let used=0;
  for(const f of (await fs.readdir(pub)).filter(f=>f.endsWith('.js')&&f!=='i18n.js')){
    const src=await fs.readFile(new URL(f,pub),'utf8');
    for(const m of src.matchAll(/\bt\('([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)){used++;
      if(!i18n.includes(`'${m[1]}':`)&&!i18n.includes(`"${m[1]}":`))missing.push(f+': '+m[1]);
    }
  }
  assert.ok(used>500,'the key scan found the client texts ('+used+')');
  assert.deepEqual([...new Set(missing)],[],'texts missing from i18n.js');
});
