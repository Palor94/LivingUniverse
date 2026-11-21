// Static checks of the browser code (debugging package, 2026-11-13). Each one catches a slip
// that broke a screen silently on 2026-11-13 or earlier, without any syntax error:
//  - inline style="" / on…="" attributes and <style> tags: the CSP (style-src 'self',
//    script-src 'self') drops them without a visible error;
//  - $('#id') for an id that no code ever creates: the button is dead (null.onclick);
//  - a client module the desktop or the phone server does not serve: the whole screen is blank;
//  - t('prefix.'+x) whose prefix has no Hungarian text at all, or a known value without text.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {isPlayRoute} from '../app/mobile.mjs';

const dir=new URL('../app/public/',import.meta.url);
const read=f=>readFileSync(new URL(f,dir),'utf8');
const files=readdirSync(dir).filter(f=>/\.(js|html)$/.test(f));
const scripts=files.filter(f=>f.endsWith('.js')&&f!=='i18n.js');

test('no inline style, inline event handler or style tag in browser code (blocked by the CSP)',()=>{
  const bad=[];
  for(const f of files){
    if(f==='i18n.js')continue;
    const src=read(f);
    for(const m of src.matchAll(/\sstyle=\\?["']|setAttribute\(\s*['"]style['"]/g))bad.push(f+': '+m[0].trim());
    for(const m of src.matchAll(/\son(?:click|change|input|submit|load|error|keydown|keyup|mouse\w+|pointer\w+)=\\?["']/g))bad.push(f+': '+m[0].trim());
    if(/<style[\s>]/.test(src))bad.push(f+': <style> tag');
  }
  assert.deepEqual(bad,[],'Use CSS classes or element.style (CSSOM) instead');
});

// An id is "created" when it appears in id="…", .id='…', or as a quoted string anywhere (helpers
// receive ids as arguments). Ids built from a prefix (`${prefix}-place`) count when the suffix
// template and the prefix literal both exist. References ending in "-" are prefixes themselves.
test('every #id the code looks up is created somewhere',()=>{
  const all=files.map(f=>[f,read(f)]);
  const text=all.map(([,s])=>s).join('\n');
  const missing=[];
  for(const [f,src] of all){
    if(f==='i18n.js')continue;
    const refs=[...src.matchAll(/(?:\$\$?|querySelector(?:All)?)\(\s*['"]#([A-Za-z][\w-]*)['"]/g),...src.matchAll(/getElementById\(\s*['"]([A-Za-z][\w-]*)['"]/g)].map(m=>m[1]);
    for(const id of new Set(refs)){
      if(id.endsWith('-'))continue;
      if(new RegExp(`id=\\\\?["']${id}\\\\?["']|\\.id\\s*=\\s*['"]${id}['"]|['"\`]${id}['"\`]`).test(text))continue;
      const cut=id.lastIndexOf('-');
      if(cut>0){const prefix=id.slice(0,cut),suffix=id.slice(cut);if(text.includes('}'+suffix)&&new RegExp(`['"]${prefix}['"]`).test(text))continue;}
      missing.push(f+': #'+id);
    }
  }
  assert.deepEqual(missing,[]);
});

// Static and dynamic imports, from each entry point.
function closure(entries){
  const seen=new Set(),pending=[...entries];
  while(pending.length){
    const f=pending.pop();if(seen.has(f))continue;seen.add(f);
    const src=read(f);
    for(const m of src.matchAll(/\bimport\s*(?:[^'";]*?\sfrom\s*)?\(?\s*['"]\.\/([^'"?]+)(?:\?[^'"]*)?['"]/g))pending.push(m[1]);
  }
  return seen;
}

test('every module the desktop pages load is on the desktop allowlist',()=>{
  const server=readFileSync(new URL('../app/server.mjs',import.meta.url),'utf8');
  const listed=new Set([...server.matchAll(/'\/([\w.-]+\.(?:js|css|html))'/g)].map(m=>m[1]));
  // The main page (index.html); the other pages belong to the phone and private-review servers.
  const entries=[...read('index.html').matchAll(/<script[^>]+src="\/?([\w.-]+\.js)/g)].map(m=>m[1]).filter(f=>files.includes(f));
  const needed=[...closure(['client.js',...entries])];
  assert.deepEqual(needed.filter(f=>!listed.has(f)),[]);
});

test('every module the phone play page loads passes the phone allowlist',()=>{
  const served=f=>isPlayRoute('/'+f,'GET')||['play-mobile.js','i18n.js'].includes(f);
  assert.deepEqual([...closure(['play-mobile.js'])].filter(f=>!served(f)),[]);
});

test('dynamic text keys have Hungarian texts',()=>{
  const i18n=read('i18n.js');
  const keys=new Set([...i18n.matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'\s*:/g)].map(m=>m[1]));
  const has=prefix=>[...keys].some(k=>k.startsWith(prefix));
  const missing=[];
  for(const f of scripts){
    for(const m of read(f).matchAll(/\bt\(\s*'([\w.-]+\.)'\s*\+/g))if(!has(m[1]))missing.push(f+': '+m[1]+'…');
  }
  // Known value sets: every value needs its own text.
  const devTools=readFileSync(new URL('../app/dev-tools.mjs',import.meta.url),'utf8');
  const checks=new Set([...devTools.matchAll(/check\(\s*'(\w+)'/g)].map(m=>m[1]));
  checks.add('disk_data');checks.add('disk_media');
  for(const id of checks){if(id==='disk_'||id.startsWith('disk_')&&id.length<6)continue;if(!keys.has('dev.check.'+id))missing.push('dev.check.'+id);}
  const status=readFileSync(new URL('../app/system-status.mjs',import.meta.url),'utf8');
  for(const m of status.matchAll(/problems\.push\(\s*'(\w+)'/g))if(!keys.has('sys.part.'+m[1])&&!keys.has('sys.problem.'+m[1]))missing.push('sys.part/problem.'+m[1]);
  assert.deepEqual([...new Set(missing)],[]);
});

// Null guards (2026-11-13): "Cannot set properties of null (setting 'onclick')" in a talk. The
// "Mégse" button exists only before the second line, its handler was set unconditionally, and the
// throw left the send form without a handler. Every lookup of an element that is drawn only
// sometimes (inside a ${…} part, a ?: branch or an && operand) must be guarded.
test('elements drawn only sometimes are never used without a check',async()=>{
  const {scan,unguarded}=await import('./helpers/null-guards.mjs');
  // The analyzer itself: it must catch the original bug and accept the guarded forms.
  const bug="const bye=(ended)=>ended?`<button id=\"play-close\">x</button>`:`<button id=\"play-end\">y</button>`;\nfunction bind(){\n  $('#play-close').onclick=()=>{};\n}";
  assert.deepEqual(unguarded(bug,scan(bug)).map(x=>x.id),['play-close']);
  const ok="const b=c?`<b id=\"x\"></b>`:'';\nif($('#x'))$('#x').onclick=f;\n$('#x')?.focus();\nif($('#x')){\n  $('#x').onclick=g;\n}";
  assert.deepEqual(unguarded(ok,scan(ok)),[]);
  const found=[];
  for(const f of scripts){const src=read(f);for(const x of unguarded(src,scan(src)))found.push(`${f}:${x.line} #${x.id}`);}
  assert.deepEqual(found,[],'guard these lookups: if($(\'#id\')) …, $(\'#id\')?.…, or keep the element in a variable and check it');
});

// A slip from a String.replace() wiring script (2026-11-14): "$$" in a replacement becomes "$",
// so {$,$$,…} turned into {$,$,…} and the Szereplőgyár page broke. Checked in every script.
test('no duplicated $ helper in any browser script',()=>{
  const bad=scripts.filter(f=>/[{(]\s*\$\s*,\s*\$\s*[,})]/.test(read(f)));
  assert.deepEqual(bad,[]);
});
