// E7 (2026-11-21): recall weighs importance, rare shared words (BM25) and reinforcement.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {bm25} from '../app/world-text-rank.mjs';

test('bm25: a rare shared term outweighs a common one; no shared term scores 0',()=>{
  const docs=[['kávéz','adóss'],...Array.from({length:10},()=>['kávéz','reggel'.slice(0,5)]),['munka']];
  const s=bm25(['kávéz','adóss'],docs);
  assert.ok(s[0]>s[1]*2,'the rare word decides');assert.equal(s.at(-1),0);
  assert.deepEqual(bm25([],docs),docs.map(()=>0));
});

test('recall: importance and reinforcement, earlier behaviour without them',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-recall-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  let clock=new Date('2026-11-12T10:00:00');
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>clock});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const a=await (await fetch('http://127.0.0.1:'+app.server.address().port+'/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Teszt Aladár',gender:'férfi'})})).json();
  const i=app.worldEngine.internals;
  const big=i.remember(a.id,'Szakítottunk Katával a vasútállomáson.','e-0',{importance:5});
  const small=i.remember(a.id,'Ittunk egy teát a sarkon.','e-1',{importance:1});
  for(let n=2;n<=30;n++)i.remember(a.id,`Hétköznapi dolog ${n}.`,'e-'+n);
  const got=i.recallMemories(a.id,{limit:6});
  assert.ok(got.includes('Szakítottunk Katával a vasútállomáson.'),'a turning point comes back unasked');
  assert.ok(!got.includes('Ittunk egy teát a sarkon.'),'a trivial one does not');
  // Reinforcement: counted once per world day, not on every prompt.
  const sal=id=>app.db.prepare('SELECT recall_count,last_recalled_day FROM memory_salience WHERE memory_id=?').get(id);
  assert.equal(sal(big).recall_count,1);i.recallMemories(a.id,{limit:6});assert.equal(sal(big).recall_count,1);
  clock=new Date('2026-11-13T10:00:00');i.recallMemories(a.id,{limit:6});assert.equal(sal(big).recall_count,2);
  assert.equal(sal(small).recall_count,0);
  // Rare words of the moment: the one memory about the debt beats the many about coffee.
  for(let n=0;n<12;n++)i.remember(a.id,`Kávéztunk reggel ${n}.`,'k-'+n);
  i.remember(a.id,'Kávé mellett szóba került Sanyi adóssága.','k-x');
  for(let n=0;n<5;n++)i.remember(a.id,`Újabb hétköznap ${n}.`,'u-'+n);
  const now=i.recallMemories(a.id,{text:'Kávézás közben eszembe jutott az adósság.',limit:5});
  assert.ok(now.includes('Kávé mellett szóba került Sanyi adóssága.'),now.join(' | '));
});
