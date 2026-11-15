import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {analyzeReferenceCoverage} from '../mcp/reference-coverage.mjs';
import {databaseIdentity,profileVersion} from '../app/character-edit.mjs';
import {installLivingWorld} from '../app/living-world.mjs';

test('reference coverage advisor separates face and body roles',()=>{
  const coverage=analyzeReferenceCoverage([{media_id:randomUUID(),role:'body',sha256:'a'.repeat(64)}]);
  assert.deepEqual(coverage.present_roles,['body']);
  assert.deepEqual(coverage.missing_required_roles,['face']);
  assert.equal(coverage.angle_coverage_known,false);
});

test('MCP living-world streak tools preserve canon and fill only empty fields',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'living-universe-streak-')),root=path.join(temp,'resources');await fs.mkdir(root);
  const dataDir=path.join(temp,'data'),token='b'.repeat(64),origin='https://laptop.ts.net';
  const database=path.join(dataDir,'universe.sqlite');
  const writes={enabled:true,token,origin,login:'tibor',approval_mode:'trusted',database_id:databaseIdentity(database)};
  await fs.mkdir(dataDir,{recursive:true});
  await fs.writeFile(path.join(dataDir,'mcp-writes.json'),JSON.stringify(writes));
  const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:writes});
  const cid=randomUUID(),other=randomUUID(),mid=randomUUID(),bytes=Buffer.from('fixture');
  await fs.writeFile(path.join(root,'shot.bin'),bytes);
  const hash=createHash('sha256').update(bytes).digest('hex'),stat=await fs.stat(path.join(root,'shot.bin'));
  app.db.prepare('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)').run(cid,'Palor','','2026-11-06');
  app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(other,'Friend','2026-11-06');
  app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'shot.bin','','image',stat.size,stat.mtime.toISOString(),'2026-11-06');
  app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);
  app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),cid,other,'Knows Friend');
  const revision=randomUUID();
  app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,cid,null,'Approved look',JSON.stringify([{media_id:mid,role:'face',sha256:hash},{media_id:mid,role:'body',sha256:hash}]),'approval','2026-11-06');
  const one=(q,...a)=>app.db.prepare(q).get(...a),all=(q,...a)=>app.db.prepare(q).all(...a),run=(q,...a)=>app.db.prepare(q).run(...a);
  const transaction=fn=>{app.db.exec('BEGIN');try{const v=fn();app.db.exec('COMMIT');return v;}catch(e){app.db.exec('ROLLBACK');throw e;}};
  const fail=(m,s=400)=>Object.assign(new Error(m),{status:s});
  let catalogue;
  try{
    catalogue=await createCatalogue({database,mediaRoot:root,availability:async()=>'local'});
    const coverage=(await catalogue.call('get_reference_coverage',{character_id:cid})).data.coverage;
    assert.deepEqual(coverage.missing_required_roles,[]);
    assert.ok(coverage.present_roles.includes('face')&&coverage.present_roles.includes('body'));
    const pack=(await catalogue.call('get_scene_pack',{perspective_character_id:cid})).data;
    assert.equal(pack.approved_appearance,'Approved look');
    assert.equal(pack.administrator_notes_included,false);
    assert.ok(pack.empty_fields.includes('personality'));

    const auth='Bearer '+token;
    async function mcpChange(operation,args){
      let status=200,payload;
      const ok=await app; // ensure app stays referenced
      void ok;
      const res=await fetch('data:application/json,',{method:'GET'}).catch(()=>null);void res;
      // Use the installed change service through the same module pattern as production.
      const {installMcpChanges}=await import('../app/mcp-changes.mjs');
      const changes=installMcpChanges({db:app.db,one,all,run,transaction,fail,config:writes});
      await changes.service({p:'/api/mcp-changes',body:{operation,arguments:args},req:{method:'POST',headers:{authorization:auth}},json:(v,s=200)=>{status=s;payload=v;}});
      return {status,payload};
    }
    const version=()=>profileVersion(one('SELECT * FROM characters WHERE id=?',cid));
    const fill=await mcpChange('character_update',{request_key:'fill-'+randomUUID().slice(0,8),character_id:cid,expected_version:version(),fields:{personality:'Calm'},fill_gaps_only:true});
    assert.equal(fill.status,200);
    assert.equal(fill.payload.approval_required,false);
    const applied=await mcpChange('apply',{change_id:fill.payload.change_id});
    assert.equal(applied.status,200);
    assert.equal(one('SELECT personality FROM characters WHERE id=?',cid).personality,'Calm');
    const blocked=await mcpChange('character_update',{request_key:'fill-'+randomUUID().slice(0,8),character_id:cid,expected_version:version(),fields:{personality:'Overwrite'},fill_gaps_only:true});
    assert.equal(blocked.status,400);
    assert.equal(blocked.payload.code,'FIELD_NOT_EMPTY');

    const living=installLivingWorld({db:app.db,one,all,run,transaction,fail,writeConfig:writes,storyEvents:{create:body=>({id:randomUUID(),status:body.status||'proposed'}),reader:null}});
    const memory=living.proposeMemory({request_key:'mem-'+randomUUID().slice(0,8),character_id:cid,kind:'memory',text:'Remembers the lake',visibility:'participants'});
    assert.equal(memory.approval_required,false);
    assert.equal(living.applyMemory(memory.change_id).memory_status,'approved');
    assert.equal((await catalogue.call('list_character_memories',{character_id:cid})).data.memories[0].text,'Remembers the lake');
    const clock=living.proposeClock({request_key:'clk-'+randomUUID().slice(0,8),kind:'exact',label:'Day one',iso_date:'2026-11-06'});
    assert.equal(living.applyClock(clock.change_id).clock.iso_date,'2026-11-06');
    assert.equal((await catalogue.call('get_story_clock',{})).data.story_clock.iso_date,'2026-11-06');
    const next=(await catalogue.call('get_next_scene_candidates',{perspective_character_id:cid})).data;
    assert.equal(next.invented,false);
    assert.ok(next.candidates.length>=1);
    assert.equal(one('SELECT appearance FROM canon WHERE id=?',revision).appearance,'Approved look');
  }finally{catalogue?.close();await app.close();await fs.rm(temp,{recursive:true,force:true});}
});
