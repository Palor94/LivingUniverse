import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {serve} from '../mcp/server.mjs';
test('late app startup restores tools; unavailable or revoked authorization drops them again',async()=>{
  let available=false,calls=0;
  const input=new PassThrough(),output=new PassThrough();let buffer='';const pending=new Map();
  output.on('data',chunk=>{buffer+=chunk;for(let end;(end=buffer.indexOf('\n'))>=0;){const response=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(response.id)?.(response);pending.delete(response.id);}});
  const running=serve({input,output,catalogue:{call:async()=>{throw Error('Read-only fallback');}},refreshWriter:async()=>{if(!available)throw Error('Service offline');return {approvalMode:'trusted',call:async()=>{calls++;return {data:{status:'fixture'}};}};}});
  let id=0;const rpc=(method,params)=>new Promise(resolve=>{pending.set(++id,resolve);input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try{
    assert.match((await rpc('initialize',{})).result.instructions,/Read-only mode/);
    assert.equal((await rpc('tools/list')).result.tools.length,10);
    available=true;
    assert.equal((await rpc('tools/list')).result.tools.length,16);
    assert.match((await rpc('initialize',{})).result.instructions,/Trusted text editing/);
    assert.equal((await rpc('tools/call',{name:'get_pending_change',arguments:{change_id:'fixture'}})).result.isError,false);
    assert.equal(calls,1);
    available=false;
    assert.equal((await rpc('tools/call',{name:'get_pending_change',arguments:{change_id:'fixture'}})).result.isError,true);
    assert.equal(calls,1);
    assert.equal((await rpc('tools/list')).result.tools.length,10);
  }finally{input.end();await running;}
});

