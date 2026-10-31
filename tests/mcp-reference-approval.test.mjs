import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,randomBytes} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';

test('private reference approval saves canon immediately, retries safely, and enforces review and image integrity',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-reference-review-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const database=path.join(dataDir,'universe.sqlite'),config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://laptop.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(database)};
  let app;
  try{
    app=await createApp({root,dataDir,mcpWrites:config,mobile:{enabled:true,origin:config.origin,login:config.login}});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port,writeConfig=path.join(dataDir,'mcp-writes.json');
    await fs.writeFile(writeConfig,JSON.stringify({...config,app_url:base}));
    const writer=await createWriteClient({database,writeConfig}),call=async(name,args)=>(await writer.call(name,args)).data;
    const cid=randomUUID(),mid=randomUUID(),filename='reference.png',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64'),now=new Date().toISOString();
    await fs.writeFile(path.join(root,filename),png);
    app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Reference fixture',now);
    app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,filename,'','image',png.length,now,now);
    app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);
    const identity={'Tailscale-User-Login':config.login},session=await (await fetch(remote+'/api/session',{headers:identity})).json();
    const decide=async(proposal,decision='approve',extra={})=>{const r=await fetch(remote+'/api/mcp-reference-changes/'+proposal.change_id,{method:'PUT',headers:{...identity,Origin:config.origin,'X-LU-CSRF':session.csrf,'Content-Type':'application/json',...(extra.headers||{})},body:JSON.stringify({decision,expected_hash:extra.hash??proposal.change_hash})});return {status:r.status,body:await r.json()};};
    const propose=(revision,role)=>call('propose_reference_update',{request_key:randomUUID(),character_id:cid,expected_revision_id:revision,references:[{media_id:mid,role}]});
    const proposal=await propose(null,'face');
    await assert.rejects(call('apply_approved_reference_change',{change_id:proposal.change_id}),{code:'APPROVAL_REQUIRED'});
    assert.equal((await decide(proposal,'approve',{hash:'wrong'})).status,409);
    assert.equal((await decide(proposal,'approve',{headers:{'Tailscale-User-Login':'other@example.test'}})).status,403);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
    const saved=await decide(proposal);assert.equal(saved.status,200);assert.equal(saved.body.status,'applied');assert.ok(saved.body.result.revision_id);
    const canon=app.db.prepare('SELECT * FROM canon WHERE id=?').get(saved.body.result.revision_id);
    assert.equal(JSON.parse(canon.references_json)[0].media_id,mid);
    assert.equal((await decide(proposal)).body.result.revision_id,canon.id);
    assert.equal((await call('apply_approved_reference_change',{change_id:proposal.change_id})).revision_id,canon.id);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,1);

    // Recover a proposal approved with the old two-step page without approving again.
    const legacy=await propose(canon.id,'body');
    app.db.prepare("UPDATE mcp_reference_changes SET status='approved',approved_by=?,approved_at=? WHERE id=?").run(config.login,now,legacy.change_id);
    const recovered=await decide(legacy);assert.equal(recovered.status,200);assert.equal(recovered.body.status,'applied');
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,1);assert.equal(recovered.body.result.revision_id,canon.id);assert.equal(JSON.parse(app.db.prepare('SELECT references_json FROM canon WHERE id=?').get(canon.id).references_json)[0].role,'body');
    const nextRevision=recovered.body.result.revision_id;
    const rejected=await propose(nextRevision,'general');
    assert.equal((await decide(rejected,'reject')).body.status,'rejected');
    assert.equal((await decide(rejected,'reject')).body.status,'rejected');
    assert.equal((await decide(rejected)).status,409);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,1);

    const stale=await propose(nextRevision,'detail');await fs.appendFile(path.join(root,filename),'changed bytes');
    assert.equal((await decide(stale)).status,409);
    assert.equal((await call('get_pending_reference_change',{change_id:stale.change_id})).status,'conflict');
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,1);
  }finally{
    await app?.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});
  }
});
