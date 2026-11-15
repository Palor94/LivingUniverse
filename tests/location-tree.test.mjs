import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {shortName,createLocationTree} from '../app/location-tree.mjs';

test('short place names drop what the parents already say',()=>{
  const cases=[
    ['Sanyi háza - nagyszoba',['Káloz','Káloz cigánytelep','Sanyi háza'],'Nagyszoba'],
    ['Sanyi háza - Márkó szobája',['Káloz','Káloz cigánytelep','Sanyi háza'],'Márkó szobája'],
    ['Káloz cigánytelep',['Káloz'],'Cigánytelep'],
    ['Káloz - Cigánytelep - rejtekhely - mosdó',['Káloz','Káloz cigánytelep','Kálozi cigánytelep - rejtekhely'],'Mosdó'],
    ['Kálozi családi ház - Attila szobája',['Káloz','Káloz családi ház'],'Attila szobája'],
    ['Pákozdi háza hálószoba',['Székesfehérvár','Pákozdi háza'],'Hálószoba'],
    ['Budapest -András háza - konyha',['Budapest','András háza'],'Konyha'],
    ['Kálozi szerelő - udvar',['Káloz','Kálozi szerelőműhely'],'Udvar'],
    // Kept as written: a possessive needs its owner, and unrelated names stay.
    ['Domi autója',['Székesfehérvár','Domi és Nicolas lakása'],'Domi autója'],
    ['Káloz határa',['Káloz'],'Káloz határa'],
    ['Jonas háza',['Budapest'],'Jonas háza'],
    ['Balaton - Strand - Kocsma',['Balaton'],'Strand - Kocsma']
  ];
  for(const [name,anc,want] of cases)assert.equal(shortName(name,anc),want,name);
});

test('the tree gives short names and full paths, and reloads only when the file changes',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-tree-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const node=(id,name,parent_id,kind='place',source_id=id)=>({id,name,parent_id,kind,source_id,placed:true,archived:false,order:0});
  const nodes=[node('w','Living Universe',null,'world',null),node('k','Káloz','w','place',null),node('c','Káloz cigánytelep','k'),node('s','Sanyi háza','c'),node('m','Sanyi háza - Márkó szobája','s')];
  await fs.writeFile(path.join(dir,'location-canvas.json'),JSON.stringify({head:'r',approved_head:'r',revisions:[{id:'r',state:{nodes}}]}));
  const tree=createLocationTree(dir),loaded=await tree.load();
  assert.equal(loaded.byId.get('m').short_name,'Márkó szobája');
  assert.equal(await tree.pathOf('m'),'Káloz › Cigánytelep › Sanyi háza › Márkó szobája');
  assert.equal(await tree.load(),loaded,'cached while unchanged');
});
