import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStableSource} from '../mcp/read-stable-source.mjs';
const changed=()=>Object.assign(new Error('changed'),{code:'MEDIA_CHANGED'});
test('transient metadata change retries a complete read and returns only stable bytes',async()=>{
 let calls=0; const expected=Buffer.from('stable source');
 assert.equal(await readStableSource(async()=>{if(++calls===1)throw changed();return expected;}),expected);
 assert.equal(calls,2);
});
test('persistent changes stop after two attempts and other errors never retry',async()=>{
 let calls=0;await assert.rejects(readStableSource(async()=>{calls++;throw changed();}),{code:'MEDIA_CHANGED'});assert.equal(calls,2);
 for(const code of ['UNSAFE_MEDIA','MEDIA_OFFLINE','CANON_MISMATCH']){calls=0;await assert.rejects(readStableSource(async()=>{calls++;throw Object.assign(new Error(code),{code});}),{code});assert.equal(calls,1);}
});