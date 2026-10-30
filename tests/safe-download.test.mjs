import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {safeDownload,publicAddress} from '../app/safe-download.mjs';
test('URL downloads reject internal/special addresses, mixed DNS, private redirects, credentials and non-HTTPS',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','100.100.100.100','169.254.169.254','172.16.1.1','192.168.1.1','192.0.2.1','198.19.1.1','224.1.1.1','::1','::ffff:127.0.0.1','2001:db8::1','fc00::1','fe80::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700::1111'),true);
 let calls=0;const request=()=>{calls++;throw Error('Network must not be attempted');};
 for(const url of ['http://example.com/a.png','file:///secrets','https://user:pass@example.com/a.png','https://127.0.0.1/a.png','https://2130706433/a.png','https://[::1]/a.png','https://example.com:4317/a.png'])await assert.rejects(safeDownload(url,{request}),{code:'UNSAFE_URL'});
 await assert.rejects(safeDownload('https://example.com/a.png',{request,resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),{code:'UNSAFE_URL'});assert.equal(calls,0);
});
function fakeRequest(responses,captured){return (url,options,callback)=>{captured.push({url:String(url),options});const req=new EventEmitter();req.destroy=()=>req.emit('error',Error('fixture aborted'));req.end=()=>queueMicrotask(()=>{const response=Readable.from([Buffer.from('actual fixture bytes')]);Object.assign(response,responses.shift());req.emit('response',response);callback(response);});return req;};}
test('DNS is pinned through connection, redirects are revalidated, and credentials never reach a downloader',async()=>{
 const captured=[],resolve=async()=>[{address:'8.8.8.8',family:4}];const request=fakeRequest([{statusCode:200,headers:{'content-type':'image/png'}}],captured);
 const downloaded=await safeDownload('https://public.example/p.png?secret=redacted',{request,resolve});const bytes=[];for await(const chunk of downloaded.stream)bytes.push(chunk);assert.equal(Buffer.concat(bytes).toString(),'actual fixture bytes');
 assert.equal(JSON.stringify(downloaded.source).includes('secret'),false);assert.equal(captured[0].options.headers.Authorization,undefined);
 captured[0].options.lookup('public.example',{all:true},(error,addresses)=>{assert.equal(error,null);assert.equal(addresses[0].address,'8.8.8.8');});
 const redirectCapture=[];await assert.rejects(safeDownload('https://public.example/p.png',{resolve,request:fakeRequest([{statusCode:302,headers:{location:'https://169.254.169.254/secrets'}}],redirectCapture)}),{code:'UNSAFE_URL'});assert.equal(redirectCapture.length,1);
 await assert.rejects(safeDownload('https://public.example/p.png',{resolve,maxBytes:10,request:fakeRequest([{statusCode:200,headers:{'content-length':'1000'}}],[])}),{code:'MEDIA_LIMIT'});
});
