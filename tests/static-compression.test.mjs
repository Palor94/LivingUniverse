import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {createApp} from '../app/server.mjs';

// fetch() decompresses on its own; a raw request shows what is really sent.
const raw=(port,route,headers={})=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:route,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});

test('interface files are sent compressed, with a version tag, and a repeat visit gets 304',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-static-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  try{
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
    const original=await fs.readFile(new URL('../app/public/i18n.js',import.meta.url));
    const br=await raw(port,'/i18n.js',{'accept-encoding':'gzip, deflate, br'});
    assert.equal(br.status,200);assert.equal(br.headers['content-encoding'],'br');assert.ok(br.body.length<original.length/3,'much smaller on the wire');assert.deepEqual(brotliDecompressSync(br.body),original);
    assert.match(br.headers['content-security-policy'],/default-src 'self'/,'security headers stay');assert.equal(br.headers.vary,'Accept-Encoding');
    const gz=await raw(port,'/i18n.js',{'accept-encoding':'gzip'});assert.equal(gz.headers['content-encoding'],'gzip');assert.deepEqual(gunzipSync(gz.body),original);
    const plain=await raw(port,'/i18n.js');assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(plain.body,original);
    const again=await raw(port,'/i18n.js',{'if-none-match':br.headers.etag,'accept-encoding':'br'});assert.equal(again.status,304);assert.equal(again.body.length,0);
    assert.equal((await raw(port,'/')).status,200);
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
