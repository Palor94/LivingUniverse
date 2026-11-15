// API robustness (debugging package, 2026-11-13): every route found in the server code gets
// wrong input (empty body, unknown fields, wrong types). The answer must be a handled error
// (status below 500, nothing in errors.log), and its message must reach the screen in Hungarian.
// Routes with a regex (…/:id/…) are filled with a well-formed id that does not exist.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {translateServerMessage} from '../app/public/i18n.js';

const appDir=new URL('../app/',import.meta.url);
// Actions that start a process, touch the whole disk or take minutes; covered by their own tests.
const SKIP=/restart|restore|backup|\/scan$|erase|permanent|purge|bug-report|sandbox/;
const ID='00000000-0000-4000-8000-000000000000';

export function discoverRoutes(){
  const files=[...readdirSync(appDir).filter(f=>f.endsWith('.mjs')).map(f=>new URL(f,appDir)),...readdirSync(new URL('play/',appDir)).map(f=>new URL('play/'+f,appDir))];
  const routes=new Set();
  for(const f of files){
    const s=readFileSync(f,'utf8');
    for(const m of s.matchAll(/p\s*===\s*'(\/api\/[^']+)'/g))routes.add(m[1]);
    // Regex routes: read the literal up to its closing slash, then fill each group.
    for(let at=s.indexOf('/^\\/api\\/');at>=0;at=s.indexOf('/^\\/api\\/',at+1)){
      let i=at+1,src='';while(i<s.length&&s[i]!=='/'&&s[i]!=='\n'){if(s[i]==='\\'){src+=s[i]+s[i+1];i+=2;}else src+=s[i++];}
      if(!src.endsWith('$'))src+='$';let re;try{re=new RegExp(src,'i');}catch{continue;}
      const fill=v=>src.slice(1,-1).replace(/\((?:\?:)?[^()]*\)\??/g,v).replace(/\\\//g,'/').replace(/\\([-.])/g,'$1').replace(/\[[^\]]*\]\{?\d*,?\d*\}?[+*]?/g,'').replace(/[?+*]/g,'');
      for(const v of [ID,'bogus','12']){const c=fill(v);if(re.test(c)){routes.add(c);break;}}
    }
  }
  return [...routes].filter(r=>!SKIP.test(r)).sort();
}

const hungarian=s=>/[áéíóöőúüű]/i.test(s);

test('every API route answers wrong input with a handled, Hungarian error',{timeout:600_000},async()=>{
  const routes=discoverRoutes();
  assert.ok(routes.length>=150,'routes found: '+routes.length);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-robust-'));let app;
  try{
    app=await createApp({root:temp,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,imageGeneration:{},worldProvider:createMockProvider(()=>({reply:'x',mood:'alap'}))});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+app.server.address().port;
    const crashes=[],english=new Set();
    for(const route of routes)for(const [method,body] of [['GET',null],['POST',{}],['POST',{bogus:[1]}],['POST',{id:5,character_id:{},name:[],text:null,confirm:'yes'}]]){
      const res=await fetch(origin+route,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
      const text=await res.text();
      if(res.status>=500){crashes.push(`${res.status} ${method} ${route} ${text.slice(0,100)}`);continue;}
      if(res.status>=400){let msg='';try{msg=JSON.parse(text).error||'';}catch{}
        if(msg&&!hungarian(msg)&&translateServerMessage(msg)===msg&&!['Not found','Method not allowed'].includes(msg))english.add(msg);}
    }
    assert.deepEqual(crashes,[]);
    const log=await fs.readFile(path.join(temp,'data','logs','errors.log'),'utf8').catch(()=>'');
    // Browser-error reports are logged on purpose (that route's job); only server errors count.
    const serverErrors=log.trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(e=>e.source!=='client');
    assert.deepEqual(serverErrors,[],'no unexpected server error was logged');
    assert.deepEqual([...english].sort(),[],'add a Hungarian serverMessages entry');
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
