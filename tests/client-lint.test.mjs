import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';

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
