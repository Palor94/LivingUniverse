import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {forgetRemovedReferences,cleanExistingReferenceHistory} from '../app/reference-retention.mjs';
import {digest} from '../app/character-edit.mjs';

test('reference removal deletes old membership, associated explanations, proposal copies and matching evidence only for that character',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`CREATE TABLE characters(id TEXT);
      INSERT INTO characters VALUES('a'),('b');
      CREATE TABLE canon(id TEXT,character_id TEXT,references_json TEXT,reason TEXT,appearance TEXT);
      CREATE TABLE mcp_reference_changes(id TEXT,character_id TEXT,payload_json TEXT,change_hash TEXT,result_json TEXT,status TEXT);
      CREATE TABLE sorting_suggestions(id TEXT,character_id TEXT,evidence_json TEXT);
      CREATE TABLE suggestion_feedback(suggestion_id TEXT);
      CREATE TABLE image_generation_runs(manifest_json TEXT);`);
    const all=(q,...args)=>db.prepare(q).all(...args),run=(q,...args)=>db.prepare(q).run(...args);
    const refs=[{media_id:'removed',sha256:'old',role:'face'},{media_id:'kept',sha256:'keep',role:'body'}];
    run('INSERT INTO canon VALUES(?,?,?,?,?)','r1','a',JSON.stringify(refs),'Old reference explanation','Approved physique');
    run('INSERT INTO canon VALUES(?,?,?,?,?)','r2','a',JSON.stringify([refs[1]]),'Unrelated current note','Approved physique');
    run('INSERT INTO canon VALUES(?,?,?,?,?)','other','b',JSON.stringify(refs),'Other character note','Other physique');
    const p={before:refs,after:refs,reason:'Old reference explanation'};
    for(const status of ['pending','approved','applied'])run('INSERT INTO mcp_reference_changes VALUES(?,?,?,?,?,?)',status,'a',JSON.stringify(p),digest(p),JSON.stringify({references:refs}),status);
    run('INSERT INTO sorting_suggestions VALUES(?,?,?)','s1','a',JSON.stringify({references:refs}));run('INSERT INTO suggestion_feedback VALUES(?)','s1');
    const manifest=JSON.stringify({characters:[{character_id:'a',references:refs}]});run('INSERT INTO image_generation_runs VALUES(?)',manifest);
    const result=forgetRemovedReferences({all,run,characterId:'a',retainedIds:['kept']});assert.equal(result.revisions,1);assert.equal(result.proposals,3);
    const history=all('SELECT * FROM canon WHERE character_id=?','a');assert.deepEqual(JSON.parse(history[0].references_json),[refs[1]]);assert.equal(history[0].appearance,'Approved physique');assert.equal(history[0].reason,'Reference data removed by creator');assert.equal(history[1].reason,'Unrelated current note');
    for(const row of all('SELECT * FROM mcp_reference_changes')){const p=JSON.parse(row.payload_json);assert.deepEqual(p.before,[refs[1]]);assert.deepEqual(p.after,[refs[1]]);assert.equal(p.reason,'');assert.equal(row.change_hash,digest(p));assert.deepEqual(JSON.parse(row.result_json).references,[refs[1]]);assert.equal(row.status,row.id==='applied'?'applied':'conflict');}
    assert.equal(all('SELECT * FROM suggestion_feedback').length,0);assert.equal(all('SELECT * FROM sorting_suggestions').length,0);
    assert.equal(all('SELECT * FROM canon WHERE character_id=?','b')[0].reason,'Other character note');assert.equal(all('SELECT * FROM image_generation_runs')[0].manifest_json,manifest);
    assert.deepEqual(forgetRemovedReferences({all,run,characterId:'a',retainedIds:['kept']}),{revisions:0,proposals:0});
    run('INSERT INTO canon(rowid,id,character_id,references_json,reason,appearance) VALUES(0,?,?,?,?,?)','r0','a',JSON.stringify([refs[1]]),'Appearance revision rationale','Approved physique');
    const beforeCurrent=all('SELECT id,appearance,references_json FROM canon WHERE id IN (?,?)','r2','other');
    const oldPayload={before:[],after:[refs[1]],reason:'Old narrative without retired reference IDs'};
    run('INSERT INTO mcp_reference_changes VALUES(?,?,?,?,?,?)','legacy','a',JSON.stringify(oldPayload),digest(oldPayload),JSON.stringify({revision_id:'r1'}),'applied');
    const batch=cleanExistingReferenceHistory({all,run});assert.equal(batch.profiles,2);assert.equal(batch.explanations,1);assert.equal(batch.proposal_explanations,1);
    assert.equal(all("SELECT reason FROM canon WHERE id='r1'")[0].reason,'');assert.equal(all("SELECT reason FROM canon WHERE id='r0'")[0].reason,'Appearance revision rationale');
    assert.equal(all("SELECT status FROM mcp_reference_changes WHERE id='legacy'")[0].status,'applied');
    assert.deepEqual(all('SELECT id,appearance,references_json FROM canon WHERE id IN (?,?)','r2','other'),beforeCurrent);
    const again=cleanExistingReferenceHistory({all,run});assert.equal(again.explanations,0);assert.equal(again.proposal_explanations,0);
  }finally{db.close();}
});
