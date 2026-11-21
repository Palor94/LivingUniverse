import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {checkTextKeys,literalTextKeys} from './helpers/i18n-keys.mjs';

// Guards against a real slip: `$` returns ONE element, `$$` a list. Looping over `$(…)` or
// rendering an i18n key that does not exist breaks the screen at runtime without any
// syntax error, so these are checked statically.
test('play screens loop over $$ lists and use only existing texts',async()=>{
  const dir=new URL('../app/public/',import.meta.url);
  const i18n=await fs.readFile(new URL('i18n.js',dir),'utf8');
  for(const file of ['play.js','world-engine.js']){
    const src=await fs.readFile(new URL(file,dir),'utf8');
    assert.ok(!/of \$\('/.test(src),`${file}: "for … of $(" must be "$$("`);
    assert.ok(!/\{\$,\$,/.test(src),`${file}: duplicated $ parameter`);
    const keys=[...src.matchAll(/\bt\('((?:play|we|world)\.[A-Za-z0-9_.]+)'/g)].map(m=>m[1]);
    // Keys ending in "." are prefixes completed at runtime (t('play.mark.'+level)).
    const missing=[...new Set(keys)].filter(k=>!k.endsWith('.')&&!i18n.includes(`'${k}':`));
    assert.deepEqual(missing,[],`${file}: missing Hungarian texts`);
  }
});

test('all client modules use defined Hungarian text keys; unused keys are warnings',async t=>{
  const dir=new URL('../app/public/',import.meta.url),sources={};
  for(const file of (await fs.readdir(dir)).filter(f=>/\.(js|html)$/.test(f)&&f!=='i18n.js'))sources[file]=await fs.readFile(new URL(file,dir),'utf8');
  const i18n=await fs.readFile(new URL('i18n.js',dir),'utf8');
  const defined=new Set(vm.runInNewContext(i18n.replace(/\bexport\s+(?=(?:const|function)\b)/g,'')+';Object.keys(hu)'));
  const result=checkTextKeys(sources,defined);
  assert.ok(result.used.size>500,'scanned literal calls across every module');
  assert.deepEqual(result.missing,[],'missing Hungarian texts');
  for(const [file,source] of Object.entries(sources).filter(([file])=>file.endsWith('.js')))
    assert.ok(literalTextKeys(source+`\nt('lint.intentional_missing');`).has('lint.intentional_missing'),file+': a new typo must be detected even after the module\'s existing syntax');
  if(result.unused.length)t.diagnostic(`Figyelmeztetés: ${result.unused.length} szövegkulcsnak nincs felismert használata (nem hiba): ${result.unused.join(', ')}`);
});

test('text-key lint catches typos in any module, both quote styles, and handles runtime prefixes',()=>{
  const defined=new Set(['screen.ok','screen.dynamic.one','orphan']);
  const result=checkTextKeys({'new-screen.js':`t("screen.typo"); t('screen.ok'); t('screen.dynamic.'+kind);`},defined);
  assert.deepEqual(result.missing,['new-screen.js: screen.typo']);
  assert.deepEqual(result.unused,['orphan']);
  assert.deepEqual([...literalTextKeys('// t("comment")\n/* t("block") */ const a="t(\'text\')"; const html=`${t("inside")}`;')],['inside']);
  assert.deepEqual([...literalTextKeys(`const esc=s=>s.replace(/"/g,''); t('after.regex'); const a=1/2; t("after.division");`)],['after.regex','after.division']);
  assert.deepEqual(checkTextKeys({'play.js':`topHelp('play.top.typo');`},defined).missing,['play.js: play.top.typo']);
});
