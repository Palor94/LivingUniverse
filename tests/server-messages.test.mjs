import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {translateServerMessage,serverPatterns} from '../app/public/i18n.js';

// Every English error a player or the owner can see on screen needs a Hungarian text,
// otherwise the UI shows English. Messages only machines read (MCP tools for Grok/ChatGPT,
// the mobile protocol) stay English on purpose.
const MACHINE_ONLY_FILES=new Set(['play-assets.mjs','mobile.mjs','mobile-sorting.mjs','character-reference-crops.mjs','mcp-changes.mjs']);
const MACHINE_ONLY_MESSAGES=new Set([
  'Provide expected_revision_id from the current character, or null for its first approval.',
  'Provide expected_references from the current character, or [] for its first approval.',
  'Use the private upload page in review mode.','Use a scoped generation operation.','Unexpected capability arguments.',
  'Use one generation run ID.','This generation operation is unavailable.','Use a scoped media import operation.',
  'Use the private import management page in review mode.','Use one import ID.','Use one upload ID.',
  'This import operation is unavailable.','Unexpected fields: allowed are kind, limit, offset.','New identity references must be active pictures. ','Use a scoped ghost-profile operation.','Use a ghost-profile proposal or supported template operation.'
]);

test('every on-screen English server error has a Hungarian translation',()=>{
  const app=fileURLToPath(new URL('../app/',import.meta.url));
  const files=[...readdirSync(app).filter(f=>f.endsWith('.mjs')).map(f=>[f,app+f]),...readdirSync(app+'play').map(f=>[f,app+'play/'+f])];
  const missing=[];
  for(const [name,file] of files){
    if(MACHINE_ONLY_FILES.has(name))continue;
    for(const m of readFileSync(file,'utf8').matchAll(/fail\(\s*'((?:[^'\\]|\\.)*)'(\s*\+)?/g)){
      const msg=m[1].replace(/\\'/g,"'");
      if(/^[A-Z_]+$/.test(msg)||/[áéíóöőúüű]/i.test(msg)||MACHINE_ONLY_MESSAGES.has(msg))continue;
      if(m[2]){
        if(/: $/.test(msg))continue; // technical detail appended after a colon
        // Built messages ("…name "+x+"…") need a pattern that starts with the fixed part.
        const start='^'+msg.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(!serverPatterns.some(([p])=>p.source.startsWith(start)))missing.push(name+': '+msg);
        continue;
      }
      if(translateServerMessage(msg)===msg)missing.push(name+': '+msg);
    }
  }
  assert.deepEqual(missing,[]);
});
