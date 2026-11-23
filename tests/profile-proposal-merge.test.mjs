import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const entry=value=>({value,kind:'hypothesis',source:'Synthetic fixture',visibility:'creator',interpretation:'Fixture meaning'});
async function fixture(t,respond,{mobile=false,noProvider=false}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-proposal-merge-')),calls=[];
  const provider=noProvider?null:createMockProvider(async request=>{calls.push(request);return await respond(request);});
  const login='creator@example.test',origin='https://fixture.example.ts.net';
  const app=await createApp({root:path.join(dir,'media'),dataDir:path.join(dir,'data'),mobile:mobile?{enabled:true,origin,login}:null,mcpWrites:null,grokConfig:null,worldProvider:provider});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+app.server.address().port;
  const req=async(route,body)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const character=(await req('/api/characters',{name:'Synthetic merger'})).data,base='/api/characters/'+character.id+'/ghost';
  const propose=async(values,model='Synthetic model')=>{const g=(await req(base)).data;return (await req(base+'/proposals',{expected_version:g.version,profile_version:g.profile_version,template_version:g.template.version,values,model})).data;};
  const prepare=()=>req(base+'/merge/prepare',{}),execute=plan=>req(base+'/merge/execute',{plan_id:plan.plan_id,ack_upload_cost:true});
  return {app,req,base,propose,prepare,execute,calls,login,origin,character};
}
const echoNewest=request=>{const p=JSON.parse(request.user).proposals;return {value:p[0].value,included_proposal_ids:[p[0].id],excluded_proposal_ids:p.slice(1).map(x=>x.id)};};

test('merge: only overlapping fields reach Grok, newest wins, unique fields and profile/canon are preserved; receipt is idempotent',async t=>{
  const f=await fixture(t,request=>{
    const data=JSON.parse(request.user);assert.equal(data.field.id,'personality');assert.deepEqual(data.proposals.map(p=>p.value),['Új: türelmetlen, szeret kertészkedni.','Régi: mindig türelmes, kávézik.']);
    assert.match(request.system,/EGÉSZ régebbi mezőjavaslatot zárd ki/);assert.match(request.system,/legújabb javaslat teljes tartalma/);
    assert.doesNotMatch(request.user,/Egyedi lakóhely|Egyedi foglalkozás|Titkos admin/);
    return echoNewest(request);
  });
  const older=await f.propose({personality:entry('Régi: mindig türelmes, kávézik.'),occupation:entry('Egyedi foglalkozás')});
  const newer=await f.propose({personality:entry('Új: türelmetlen, szeret kertészkedni.'),residence:entry('Egyedi lakóhely')},'Newest');
  const before=(await f.req(f.base)).data,canon=f.app.db.prepare('SELECT * FROM canon').all();
  const plan=(await f.prepare()).data;assert.equal(plan.api_calls,1);assert.equal(plan.fields.length,3);assert.equal(f.calls.length,0);
  assert.equal((await f.req(f.base+'/merge/execute',{plan_id:plan.plan_id})).status,403);
  const r=await f.execute(plan);assert.equal(r.status,200);const p=r.data.proposal;
  assert.equal(p.status,'pending');assert.equal(p.values.personality.value,newer.values.personality.value);assert.deepEqual(p.values.occupation,older.values.occupation);assert.deepEqual(p.values.residence,newer.values.residence);
  assert.deepEqual(p.merge.fields[0].excluded_proposal_ids,[older.id]);
  const after=(await f.req(f.base)).data;assert.deepEqual(after.values,before.values);assert.equal(after.version,before.version);assert.deepEqual(after.history,before.history);assert.deepEqual(f.app.db.prepare('SELECT * FROM canon').all(),canon);
  assert.ok(after.proposals.slice(0,2).every(x=>x.status==='superseded'&&x.superseded_by===p.id));
  assert.deepEqual((await f.execute(plan)).data,r.data);assert.equal(f.calls.length,1);
  const exported=(await f.req('/api/export')).data;assert.ok(JSON.stringify(exported).includes(p.id));
});

test('merge: compatible older detail is retained as a hypothesis and cannot expose creator-only content',async t=>{
  const f=await fixture(t,request=>{const p=JSON.parse(request.user).proposals;return {value:'Új szöveg. Régi kiegészítés.',included_proposal_ids:p.map(x=>x.id),excluded_proposal_ids:[]};});
  await f.propose({personality:entry('Régi kiegészítés.')});await f.propose({personality:{...entry('Új szöveg.'),kind:'fact',visibility:'public'}},'New');
  const r=await f.execute((await f.prepare()).data);assert.equal(r.status,200);const e=r.data.proposal.values.personality;
  assert.equal(e.value,'Új szöveg. Régi kiegészítés.');assert.equal(e.kind,'hypothesis');assert.equal(e.visibility,'creator');
});

test('merge: disjoint fields are copied locally without a provider or API calls; manual edits exclude stale proposals',async t=>{
  const f=await fixture(t,()=>{throw Error('Must not be called');},{noProvider:true});
  await f.propose({personality:entry('Old stale personality'),occupation:entry('First unique')});
  let g=(await f.req(f.base)).data;
  assert.equal((await f.req(f.base+'/manual',{expected_version:g.version,template_version:g.template.version,expected_legacy:g.legacy,values:{personality:entry('Owner choice')}})).status,200);
  await f.propose({residence:entry('Second unique')},'New');
  const plan=(await f.prepare()).data;assert.equal(plan.api_calls,0);assert.equal(plan.skipped_fields,1);
  const result=await f.execute(plan);assert.equal(result.status,200);assert.deepEqual(Object.keys(result.data.proposal.values),['occupation','residence']);
  assert.equal((await f.req(f.base)).data.values.personality.value,'Owner choice');assert.equal(f.calls.length,0);
});

test('merge: stale plans do not dispatch; changes during a call prevent committing and retain original proposals',async t=>{
  let change;const f=await fixture(t,async request=>{await change();return echoNewest(request);});
  await f.propose({personality:entry('Old')});await f.propose({personality:entry('New')},'New');
  const plan=(await f.prepare()).data;await f.propose({residence:entry('Added after preview')},'Extra');
  assert.equal((await f.execute(plan)).status,409);assert.equal(f.calls.length,0);
  const fresh=(await f.prepare()).data;change=()=>f.propose({occupation:entry('Added during request')},'Concurrent');
  assert.equal((await f.execute(fresh)).status,409);assert.equal(f.calls.length,1);
  assert.ok((await f.req(f.base)).data.proposals.every(p=>p.status==='pending'));
  assert.equal((await f.execute(fresh)).status,409);assert.equal(f.calls.length,1);
});

test('merge: invalid or uncertain responses never consume source proposals or automatically retry',async t=>{
  for(const respond of [()=>({value:'Missing decision lists'}),()=>{throw Object.assign(Error('Uncertain billed request'),{code:'AI_UNCERTAIN'});},request=>{const r=echoNewest(request);return {...r,value:42};}]){
    const f=await fixture(t,respond);await f.propose({personality:entry('Old')});await f.propose({personality:entry('New')},'New');
    const before=(await f.req(f.base)).data,plan=(await f.prepare()).data;
    assert.ok((await f.execute(plan)).status>=400);assert.deepEqual((await f.req(f.base)).data,before);
    assert.equal((await f.execute(plan)).status,409);assert.equal(f.calls.length,1);
  }
});

test('merge: concurrent execute dispatches once and the daily cap prevents calls',async t=>{
  let unblock;const gate=new Promise(resolve=>{unblock=resolve;});let arrived;const started=new Promise(resolve=>{arrived=resolve;});
  const f=await fixture(t,async request=>{arrived();await gate;return echoNewest(request);});
  await f.propose({personality:entry('Old')});await f.propose({personality:entry('New')},'New');
  const plan=(await f.prepare()).data,first=f.execute(plan);await started;
  assert.equal((await f.execute(plan)).status,409);unblock();assert.equal((await first).status,200);assert.equal(f.calls.length,1);
  const g=await fixture(t,echoNewest);await g.propose({personality:entry('Old')});await g.propose({personality:entry('New')},'New');
  g.app.db.prepare('INSERT INTO world_usage(day,calls,input_tokens,output_tokens,cost_usd) VALUES(?,0,0,0,100)').run(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  assert.equal((await g.execute((await g.prepare()).data)).status,429);assert.equal(g.calls.length,0);
});

test('merge: private mobile routes require identity, Origin and CSRF; actor is retained',async t=>{
  const f=await fixture(t,echoNewest,{mobile:true});await f.propose({personality:entry('Old')});await f.propose({personality:entry('New')},'New');
  await new Promise(resolve=>f.app.mobileServer.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+f.app.mobileServer.address().port,route=f.base+'/merge/prepare';
  const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post(route,{})).status,403);
  const h={'Tailscale-User-Login':f.login},session=await (await fetch(url+'/api/session',{headers:h})).json();
  assert.equal((await post(route,{},h)).status,403);
  assert.equal((await post(route,{}, {...h,Origin:'https://evil.test','X-LU-CSRF':session.csrf})).status,403);
  const authorized={...h,Origin:f.origin,'X-LU-CSRF':session.csrf},r=await post(route,{},authorized);assert.equal(r.status,200);const plan=await r.json();
  const result=await post(f.base+'/merge/execute',{plan_id:plan.plan_id,ack_upload_cost:true},authorized);assert.equal(result.status,200);assert.equal((await result.json()).proposal.merge.actor,f.login);
});

test('merge: expired plans and changed model prices never dispatch; scale and explicit empty newest values remain authoritative',async t=>{
  const f=await fixture(t,request=>{const r=echoNewest(request);return {...r,value:JSON.parse(request.user).field.type==='scale'?5:'Must never fill an explicit empty value'};});
  await f.propose({extraversion:entry(2),personality:entry('Old text')});await f.propose({extraversion:entry(9),personality:entry('')},'New');
  const expired=(await f.prepare()).data,settingKey='profile-merge:'+expired.plan_id;
  const record=JSON.parse(f.app.db.prepare('SELECT value FROM application_settings WHERE key=?').get(settingKey).value);record.expires_at=0;
  f.app.db.prepare('UPDATE application_settings SET value=? WHERE key=?').run(JSON.stringify(record),settingKey);
  assert.equal((await f.execute(expired)).status,409);assert.equal(f.calls.length,0);
  const plan=(await f.prepare()).data;
  f.app.db.prepare('INSERT INTO application_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('world:engine',JSON.stringify({model:'grok-4.7'}));
  assert.equal((await f.execute(plan)).status,409);assert.equal(f.calls.length,0);
  const result=await f.execute((await f.prepare()).data);assert.equal(result.status,200);
  assert.equal(result.data.proposal.values.extraversion.value,9);assert.equal(result.data.proposal.values.personality.value,'');assert.equal(f.calls.length,2);
});
