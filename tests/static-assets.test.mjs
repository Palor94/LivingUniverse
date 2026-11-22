import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStaticAssets} from '../app/static-assets.mjs';

test('one build versions the complete module graph; changed dependencies invalidate it, private URLs stay untouched',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-public-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'index.html'),'<script src="/client.js?v=old"></script><img src="/media/private">');
  await fs.writeFile(path.join(dir,'client.js'),"import {x} from './child.js';const load=()=>import('./child.js');const secret='/api/state';");
  await fs.writeFile(path.join(dir,'child.js'),'export const x=1;');
  const before=await createStaticAssets(dir),html=before.get('index.html').raw.toString();assert.match(html,new RegExp('client.js\\?v='+before.version));assert.match(html,/\/media\/private/);
  assert.equal(before.get('client.js').raw.toString().includes('?v='),false,'legacy unversioned endpoint stays unmodified');
  const js=before.get('client.js',{versioned:true}).raw.toString();assert.equal(js.split('?v='+before.version).length,3,'static and deferred imports versioned');assert.match(js,/'\/api\/state'/);
  await fs.writeFile(path.join(dir,'child.js'),'export const x=2;');const after=await createStaticAssets(dir);assert.notEqual(after.version,before.version);assert.equal(before.get('child.js',{versioned:true}).raw.toString(),'export const x=1;','old snapshot cannot change under an immutable URL');
});
