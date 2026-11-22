import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const entry=value=>({value,interpretation:'',kind:'hypothesis',source:'fixture',visibility:'creator'});

test('organized figures use only owned-folder pictures, block missing inputs, preserve outfit through saving and regeneration',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-folder-figures-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.mkdir(dataDir);
  await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),JSON.stringify({layout_version:1}));
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),
    assetDownload:async()=>({stream:(async function*(){yield png;})()})});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args={})=>call('/api/mcp-backgrounds',{operation,arguments:args},{Authorization:'Bearer '+config.token});
  const mk=async name=>{const c=(await call('/api/characters',{name,gender:'férfi'})).data;
    app.db.prepare('INSERT INTO application_settings(key,value) VALUES(?,?)').run('ghost:character:'+c.id,JSON.stringify({version:1,values:{goals:entry('Cél'),weekly_routine:entry('Rutin')},history:[],proposals:[]}));return c;};
  const c=await mk('Teszt Aladár'),empty=await mk('Teszt Üres'),other=await mk('Teszt Másik');
  for(const [folder,files] of [['10_CHARACTERS/Teszt Aladár',['a.png','b.png','shared.png']],['10_CHARACTERS/Teszt Aladár extra',['prefix.png']],['20_SHARED_MEDIA/Scenes',['outside.png']]]){
    await fs.mkdir(path.join(root,folder),{recursive:true});for(const f of files)await fs.writeFile(path.join(root,folder,f),png);
  }
  await call('/api/scan',{});
  const media=Object.fromEntries(app.db.prepare('SELECT id,relative_path FROM media').all().map(m=>[path.basename(m.relative_path),m.id]));
  // A folder image with an explicit second character must not be used without a bound crop.
  app.db.prepare('INSERT OR IGNORE INTO depictions VALUES(?,?)').run(media['shared.png'],other.id);
  const before=app.db.prepare('SELECT count(*) n FROM canon').get().n;
  let pack=(await mcp('visual_pack',{character_id:c.id})).data;
  assert.equal(pack.reference_policy,'character_folder');assert.equal(pack.generation_ready,true);
  assert.equal(pack.available_reference_count,2);
  assert.deepEqual(new Set(pack.references.map(r=>r.media_id)),new Set([media['a.png'],media['b.png']]));
  assert.ok(pack.references.every(r=>r.fetch_with==='get_media'&&r.canon_approved===false));
  assert.equal(app.db.prepare('SELECT count(*) n FROM canon').get().n,before,'generation access never approves canon');

  const revision=randomUUID(),referenceId=randomUUID();
  app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,c.id,null,'Approved fixture',JSON.stringify([
    {media_id:media['outside.png'],role:'face'},
    {media_id:media['b.png'],reference_id:referenceId,role:'body',crop:{x:0,y:0,w:1,h:1}}
  ]),'fixture',new Date().toISOString());
  pack=(await mcp('visual_pack',{character_id:c.id})).data;
  assert.equal(pack.references[0].media_id,media['b.png']);assert.equal(pack.references[0].reference_id,referenceId);
  assert.equal(pack.references[0].fetch_with,'get_approved_references');assert.equal(pack.references[0].revision_id,revision);
  assert.ok(!pack.references.some(r=>r.media_id===media['outside.png']),'even approved images outside the selected folder are excluded');
  const missing=(await mcp('visual_pack',{character_id:empty.id})).data;
  assert.equal(missing.generation_ready,false);assert.deepEqual(missing.references,[]);
  const blocked=await mcp('job_start',{target:'figure',character_id:empty.id});
  assert.equal(blocked.status,409);assert.equal(blocked.data.code,'FIGURE_REFERENCE_MISSING');
  assert.equal(app.db.prepare('SELECT count(*) n FROM play_generation_jobs WHERE character_id=?').get(empty.id).n,0);
  assert.ok((await mcp('needs',{target:'figure'})).data.blocked_figures.some(x=>x.character_id===empty.id));
  assert.equal((await mcp('list_figures')).data.characters.find(x=>x.character_id===empty.id).base_prompt,null);

  const args={target:'figure',character_id:c.id,expression:'alap'};
  const dressed=(await mcp('job_start',{...args,outfit:'dressed'})).data;
  const bare=(await mcp('job_start',{...args,outfit:'shirtless'})).data;
  assert.notEqual(dressed.job_id,bare.job_id);assert.equal(bare.outfit,'shirtless');
  assert.match(bare.prompt,/Clothing: shirtless/);assert.match(bare.prompt,/use the supplied pictures to preserve the same person/);
  assert.equal(path.basename(bare.save.folder),'felmeztelen');assert.deepEqual(bare.references,dressed.references);
  for(const j of [dressed,bare]){
    const response=await mcp('job_finish',{job_id:j.job_id,outcome:'done',url:'https://fixture.example/figure.png',model:'fixture'});
    assert.equal(response.status,200,JSON.stringify(response.data));const finished=response.data;
    assert.equal(finished.status,'done');assert.equal(finished.placed.outfit,j.outfit);
  }
  pack=(await mcp('visual_pack',{character_id:c.id})).data;
  assert.ok(pack.figures.have.includes('alap'));assert.ok(pack.figures.shirtless.have.includes('alap'));
  const fig=(await mcp('list_figures')).data.characters.find(x=>x.character_id===c.id);
  assert.deepEqual(fig.expressions,['alap']);assert.deepEqual(fig.shirtless.expressions,['alap']);
  const brief=(await call('/api/workshop/generation/brief?'+new URLSearchParams({...args,outfit:'shirtless',expression:'mosoly'}))).data;
  assert.equal(brief.outfit,'shirtless');
  const opened=(await call('/api/workshop/generation/open',{...args,outfit:'shirtless',expression:'mosoly'})).data;
  assert.equal(opened.outfit,'shirtless');
  const done=(await mcp('job_finish',{job_id:opened.job_id,outcome:'done',url:'https://fixture.example/figure.png'})).data;
  const rejected=(await call('/api/workshop/checks',{item_key:'sprite:'+done.placed.sprite_id,verdict:'regenerate',face:'unsure',body:'unsure',note:'Fixture retry'})).data;
  const retry=(await mcp('jobs',{status:'open'})).data.jobs.find(j=>j.id===rejected.job_id);
  assert.equal(retry.outfit,'shirtless');assert.equal(retry.brief.outfit,'shirtless');
  assert.equal(path.basename(retry.brief.save.folder),'felmeztelen');
  assert.deepEqual((await mcp('visual_pack',{character_id:c.id})).data.figures.have,['alap'],'regenerating the shirtless row leaves the dressed row intact');
  assert.equal((await mcp('job_start',{...args,outfit:'naked'})).status,400);
  assert.equal(app.db.prepare('SELECT count(*) n FROM canon').get().n,before+1,'briefs, jobs and placements leave canon alone');
});
