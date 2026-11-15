import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';

// Synthetic world-v1 analysis with the given participant ids.
function analysis(ids){
  return {schema:1,description:{hu:'Teszt',en:'Test'},background:{kind:'neutral',hu:'háttér',en:'backdrop'},tags:[],
    scene_details:{environment:{observed_function:{hu:'semleges',en:'neutral'},evidence:'plain',uncertain:false},compatible_settings:[],
      participants:ids.map((id,i)=>({id,screen_position:{hu:i?'jobbra':'balra',en:i?'right':'left'},region:null,character_id:null})),activities:[],
      simulation_use:{suggested_scope:'character_introduction',narration_only:true,evidence:'neutral',uncertain:false,approved:false}},
    world_details:{camera:{direction:'frontal',elevation:'eye_level',framing:'upper_body',evidence:'front',uncertain:false},
      reference_coverage:ids.map(id=>({participant_id:id,face_visibility:'clear',body_coverage:'partial',occlusion:'none',usable_for:['face_reference'],limitations:'cropped',uncertain:false})),
      scene_requirements:{visible_features:[],incompatible_uses:[],evidence:'none',uncertain:false},content:{level:'non_intimate',evidence:'clothed',uncertain:false}}};
}

test('quick tagging groups pictures, pre-fills only from linked characters and saves through the review service',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-quick-tag-')),root=path.join(base,'media'),dataDir=path.join(base,'data');
  await fs.mkdir(path.join(root,'Kepek'),{recursive:true});
  const files={single:'egy.png',pair:'ketto.png',other:'harom.png'};
  for(const [k,name] of Object.entries(files))await fs.writeFile(path.join(root,'Kepek',name),Buffer.from('synthetic-'+k));
  await fs.writeFile(path.join(root,'Kepek','negy-vonaton.png'),Buffer.from('synthetic-no-analysis'));
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldReviewAvailability:async()=>'local'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,method)=>{const r=await fetch(origin+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const a=(await call('/api/characters',{name:'Teszt Aladár',gender:'férfi'})).data,b=(await call('/api/characters',{name:'Teszt Béla',gender:'férfi'})).data;
    await call('/api/scan',{});
    const media=(await call('/api/media?kind=image')).data.items,byName=Object.fromEntries(media.map(m=>[path.basename(m.relative_path),m]));
    const link=async(name,ids)=>call('/api/media/bulk',{operation:'assign',media_ids:[byName[name].id],character_ids:ids});
    await link(files.single,[a.id]);await link(files.pair,[a.id,b.id]);
    const sha=async name=>createHash('sha256').update(await fs.readFile(path.join(root,'Kepek',name))).digest('hex');
    const records=[{media_id:byName[files.single].id,source_sha256:await sha(files.single),raw:analysis(['p1'])},{media_id:byName[files.pair].id,source_sha256:await sha(files.pair),raw:analysis(['p1','p2'])},{media_id:byName[files.other].id,source_sha256:await sha(files.other),raw:analysis(['p1'])}];
    const preview=await app.worldReview.previewImport(records);await app.worldReview.importRecords(records,preview.preview_hash);

    const single=(await call('/api/quick-tag?group=single')).data;
    assert.deepEqual(single.counts,{single:1,pair:1,other:1});
    assert.deepEqual(single.items[0].suggested,{p1:{state:'character',character_id:a.id}});
    const pair=(await call('/api/quick-tag?group=pair')).data.items[0],other=(await call('/api/quick-tag?group=other')).data.items[0];
    assert.deepEqual(other.suggested,{},'no guessing when no character is linked');
    const unlinkedOnly=(await call('/api/quick-tag?group=other&unlinked=1')).data;
    assert.equal(unlinkedOnly.total,1);assert.equal(unlinkedOnly.unlinked_count,1);
    assert.equal((await call('/api/quick-tag?group=other&people=3')).data.total,0,'people filter');
    assert.equal((await call('/api/quick-tag?group=other&character_id='+a.id)).data.total,0,'character filter');

    // An unknown character is refused for that picture only; the other item still saves.
    const mixed=(await call('/api/quick-tag/confirm',{items:[
      {source_id:pair.source_id,source_sha256:pair.source_sha256,expected_version:pair.version,choices:{p1:{state:'character',character_id:'00000000-0000-4000-8000-000000000000'},p2:{state:'character',character_id:a.id}}},
      {source_id:single.items[0].source_id,source_sha256:single.items[0].source_sha256,expected_version:single.items[0].version,choices:single.items[0].suggested}]})).data;
    assert.equal(mixed.confirmed,1);assert.equal(mixed.failed,1);assert.match(mixed.results[0].error,/existing active character/);

    // Swapped pair and a new character for the unlinked picture; missing link is added, none removed.
    const done=(await call('/api/quick-tag/confirm',{items:[
      {source_id:pair.source_id,source_sha256:pair.source_sha256,expected_version:pair.version,choices:{p1:{state:'character',character_id:b.id},p2:{state:'character',character_id:a.id}}},
      {source_id:other.source_id,source_sha256:other.source_sha256,expected_version:other.version,choices:{p1:{state:'character',character_id:b.id}}}]})).data;
    assert.equal(done.confirmed,2,JSON.stringify(done.results));
    assert.equal(done.results[1].links_added,1);
    const reviewed=await app.worldReview.view(pair.source_id);
    assert.equal(reviewed.document.identity_reviewed,true);
    assert.deepEqual(reviewed.document.participants.map(p=>[p.id,p.character_id,p.identity_state]),[['p1',b.id,'reviewed'],['p2',a.id,'reviewed']]);
    assert.equal((await call('/api/media/'+byName[files.pair].id)).data.characters.length,2);

    // Reviewed pictures leave the queue; a stale version is refused per item.
    assert.deepEqual((await call('/api/quick-tag?group=single')).data.counts,{single:0,pair:0,other:0});
    const stale=(await call('/api/quick-tag/confirm',{items:[{source_id:pair.source_id,source_sha256:pair.source_sha256,expected_version:pair.version,choices:{p1:{state:'unknown'},p2:{state:'not_character'}}}]})).data;
    assert.equal(stale.failed,1);

    // Outdated analysis: file replaced after analysis -> characters saved as links, analysis retired.
    const extraName='ot.png';await fs.writeFile(path.join(root,'Kepek',extraName),Buffer.from('before-edit'));await call('/api/scan',{});
    const extra=(await call('/api/media?kind=image')).data.items.find(m=>m.relative_path.endsWith(extraName));
    const extraRecords=[{media_id:extra.id,source_sha256:await sha(extraName),raw:analysis(['p1'])}];
    await app.worldReview.importRecords(extraRecords,(await app.worldReview.previewImport(extraRecords)).preview_hash);
    await fs.writeFile(path.join(root,'Kepek',extraName),Buffer.from('edited-outside-the-app'));
    const extraItem=(await call('/api/quick-tag?group=other')).data.items.find(i=>i.media_id===extra.id);
    const staleResult=(await call('/api/quick-tag/confirm',{items:[{source_id:extraItem.source_id,source_sha256:extraItem.source_sha256,expected_version:extraItem.version,choices:{p1:{state:'character',character_id:b.id}}}]})).data;
    assert.equal(staleResult.confirmed,1,JSON.stringify(staleResult.results));assert.equal(staleResult.results[0].stale,true);
    assert.ok((await call('/api/media/'+extra.id)).data.characters.some(c=>c.id===b.id),'character linked despite outdated analysis');
    assert.equal((await call('/api/quick-tag?group=other')).data.items.some(i=>i.media_id===extra.id),false,'outdated analysis leaves the queue');

    // Location tab: keyword search over AI guesses and file names, no-AI filter, additive tagging.
    const place=(await call('/api/locations',{name:'Vonat',kind:'tag'})).data;
    const hiddenByDefault=(await call('/api/quick-tag/locations?q=semleges')).data;
    assert.equal(hiddenByDefault.total,0,'neutral-background reference shots are hidden by default');assert.equal(hiddenByDefault.neutral_hidden,4);
    let found=(await call('/api/quick-tag/locations?q=semleges&neutral=1')).data;
    assert.equal(found.total,4,'AI environment guesses are searchable');
    assert.ok(found.places.some(p=>p.id===place.id&&p.tag_id));
    const noAi=(await call('/api/quick-tag/locations?noai=1')).data;
    assert.deepEqual(noAi.items.map(i=>i.filename),['negy-vonaton.png']);assert.equal(noAi.items[0].ai_label,null);
    assert.equal((await call('/api/quick-tag/locations?q=vonaton')).data.total,1,'pictures without AI analysis are found by file name');
    // Referenciakép / Kollázs: no location needed, so the picture leaves the untagged view.
    assert.equal((await call('/api/quick-tag/picture-type',{media_ids:[noAi.items[0].media_id],type:'reference'})).data.marked,1);
    assert.equal((await call('/api/quick-tag/locations?q=vonaton')).data.total,0,'reference pictures leave the untagged view');
    assert.equal((await call('/api/quick-tag/locations?q=vonaton&untagged=0')).data.total,1,'and stay findable');
    assert.equal((await call('/api/quick-tag/picture-type',{media_ids:[noAi.items[0].media_id],type:'other'})).status,400);
    const tagId=found.places.find(p=>p.id===place.id).tag_id;
    await call('/api/taxonomy/apply',{media_ids:found.items.slice(0,2).map(i=>i.media_id),tag_ids:[tagId],operation:'add'});
    assert.equal((await call('/api/quick-tag/locations?q=semleges&neutral=1')).data.total,2,'tagged pictures leave the untagged view');
    const everything=(await call('/api/quick-tag/locations?q=semleges&untagged=0&neutral=1')).data;
    assert.equal(everything.total,4);
    // Sync with "Rendezésre vár": tagged pictures that also have characters count as sorted.
    const sync=(await call('/api/quick-tag/sync',{})).data;assert.ok(sync.completed>=1,JSON.stringify(sync));
    const tagged=everything.items.filter(i=>i.locations.includes('Vonat')&&i.characters.length);
    for(const i of tagged)assert.equal((await call('/api/media/'+i.media_id)).data.categorization_complete,true);
    assert.equal((await call('/api/quick-tag/sync',{})).data.completed,0,'second sync changes nothing');assert.equal(everything.items.filter(i=>i.locations.includes('Vonat')).length,2);

    // Re-confirming a reviewed picture with its current version works (repeats are covered below).
    const collage=(await call('/api/quick-tag/confirm',{items:[{source_id:other.source_id,source_sha256:other.source_sha256,expected_version:done.results[1].version,choices:{p1:{state:'character',character_id:b.id}}}]})).data;
    assert.equal(collage.confirmed,1,JSON.stringify(collage.results));

    // Group records: may cover several people in one picture; no new approved references.
    assert.equal((await call('/api/characters/'+a.id+'/group',{group:true})).data.is_group,true);
    assert.equal((await call('/api/state')).data.characters.find(c=>c.id===a.id).is_group,1);
    const refused=await call('/api/characters/'+a.id+'/canon',{appearance:'',references:[{media_id:byName[files.single].id,role:'face'}],reason:'test',expected_revision_id:null,expected_references:[]});
    assert.equal(refused.status,409);assert.match(refused.data.error,/Groups cannot receive new approved references/);
    const crowd=byName['negy-vonaton.png'],crowdRecords=[{media_id:crowd.id,source_sha256:await sha('negy-vonaton.png'),raw:analysis(['p1','p2','p3'])}];
    await app.worldReview.importRecords(crowdRecords,(await app.worldReview.previewImport(crowdRecords)).preview_hash);
    const crowdItem=(await call('/api/quick-tag?group=other')).data.items.find(i=>i.media_id===crowd.id);
    const both=(await call('/api/quick-tag/confirm',{items:[{source_id:crowdItem.source_id,source_sha256:crowdItem.source_sha256,expected_version:crowdItem.version,choices:{p1:{state:'character',character_id:a.id},p2:{state:'character',character_id:a.id}},collage:true}]})).data;
    assert.equal(both.confirmed,1,JSON.stringify(both.results));
    // Creator exclusion retires the analysis once; repeating it changes nothing.
    assert.equal((await call('/api/quick-tag/exclude',{media_ids:[byName[files.single].id]})).data.excluded,1);
    assert.equal((await call('/api/quick-tag/exclude',{media_ids:[byName[files.single].id]})).data.excluded,0);
    assert.equal((await call('/api/quick-tag/exclude',{media_ids:[byName[files.pair].id],plan:true})).data.excluded,1);
    assert.ok((await call('/api/media/'+byName[files.pair].id)).data.structured_tags.some(t=>t.name==='Generálási terv'),'plan tag applied');
    const crowdTags=(await call('/api/media/'+crowd.id)).data.structured_tags.map(t=>t.name);
    assert.ok(crowdTags.includes('Kollázs'),'collage tag is created and applied');
    // The unpicked third person is marked as a background figure (not a character).
    const crowdDoc=(await app.worldReview.view(crowdItem.source_id)).document;
    assert.deepEqual(crowdDoc.participants.map(p=>[p.id,p.identity_state,p.character_id]),[['p1','reviewed',a.id],['p2','reviewed',a.id],['p3','not_character',null]]);
  }finally{await app.close();await fs.rm(base,{recursive:true,force:true});}
});
