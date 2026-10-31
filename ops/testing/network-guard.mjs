import net from 'node:net';
import tls from 'node:tls';
const allowed=host=>['localhost','127.0.0.1','::1','[::1]'].includes(String(host||'localhost').toLowerCase());
const blocked=()=>Object.assign(Error('External network disabled in the synthetic test runner.'),{code:'TEST_EGRESS_BLOCKED'});
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  // Node may pass normalized [options, callback] internally.
  const values=Array.isArray(args[0])?args[0]:args,first=values[0];
  const host=typeof first==='object'?first.host:typeof values[1]==='string'?values[1]:undefined;
  if(!allowed(host))throw blocked();
  return connect.apply(this,args);
};
const secure=tls.connect;
tls.connect=function(...args){const first=args[0],host=typeof first==='object'?first.host:typeof args[1]==='string'?args[1]:undefined;if(!allowed(host))throw blocked();return secure(...args);};
const request=globalThis.fetch;
globalThis.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!allowed(url.hostname))return Promise.reject(blocked());return request(input,...args);};
