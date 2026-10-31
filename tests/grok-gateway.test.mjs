import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createAuthorization} from '../mcp/oauth.mjs';
import {createGateway,createDispatcher} from '../mcp/http-gateway.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';

test('OAuth requires private human authorization, S256 PKCE, exact redirect, audience, expiry and single-use credentials',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-oauth-'));let time=Date.now();const file=path.join(temp,'oauth.json');
 const options={file,publicOrigin:'https://gateway.example',privateOrigin:'https://laptop.example.ts.net',clock:()=>time};
 try{
  const auth=createAuthorization(options),callback='https://grok.com/test-callback';
  assert.throws(()=>auth.register({redirect_uris:['https://evil.example/callback']}),{code:'invalid_redirect_uri'});
  const client=auth.register({client_name:'Grok fixture',redirect_uris:[callback]});
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const params={client_id:client.client_id,redirect_uri:callback,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'fixture_state_12345',resource:options.publicOrigin+'/mcp'};
  assert.throws(()=>auth.authorize({...params,code_challenge_method:'plain'}));assert.throws(()=>auth.authorize({...params,resource:'https://evil.example/mcp'}));
  const begin=auth.authorize(params),id=begin.location.split('/').at(-1),cookie=begin.cookie.split(';')[0];
  assert.throws(()=>auth.continueFlow(id,cookie),{code:'approval_required'});assert.equal(auth.view(id).decision,'pending');auth.decide(id,'approve','fixture@example');
  assert.throws(()=>auth.continueFlow(id,'wrong=cookie'),{code:'authorization_browser_mismatch'});
  const approved=auth.continueFlow(id,cookie),code=new URL(approved.location).searchParams.get('code');
  const exchange={grant_type:'authorization_code',code,code_verifier:verifier,client_id:client.client_id,redirect_uri:callback};
  assert.throws(()=>auth.token({...exchange,code_verifier:'x'.repeat(43)}),{code:'invalid_grant'});
  const issued=auth.token(exchange);assert.throws(()=>auth.token(exchange),{code:'invalid_grant'});assert.equal(auth.authenticate('Bearer '+issued.access_token).client_id,client.client_id);
  const persisted=await fs.readFile(file,'utf8');for(const value of [issued.access_token,issued.refresh_token,code,cookie.split('=')[1]])assert.equal(persisted.includes(value),false);
  const reloaded=createAuthorization(options);assert.equal(reloaded.authenticate('Bearer '+issued.access_token).client_id,client.client_id);
  assert.throws(()=>createAuthorization({...options,publicOrigin:'https://other.example'}).authenticate('Bearer '+issued.access_token),{code:'invalid_token'});
  const fresh=auth.token({grant_type:'refresh_token',client_id:client.client_id,refresh_token:issued.refresh_token});assert.throws(()=>auth.token({grant_type:'refresh_token',client_id:client.client_id,refresh_token:issued.refresh_token}),{code:'invalid_grant'});
  auth.revoke({token:fresh.access_token});assert.throws(()=>auth.authenticate('Bearer '+fresh.access_token),{code:'invalid_token'});
  assert.throws(()=>auth.authenticate('Bearer '+issued.access_token),{code:'invalid_token'});
  time+=3600001;assert.throws(()=>auth.authenticate('Bearer '+issued.access_token),{code:'invalid_token'});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('Grok Bot registration returns only its allowed HTTPS callback and never authorizes the optional localhost redirect',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-bot-oauth-'));
 try{
  const auth=createAuthorization({file:path.join(temp,'oauth.json'),publicOrigin:'https://gateway.example',privateOrigin:'https://laptop.example.ts.net',redirectHosts:['grok.com','www.cursor.com']});
  const https='https://www.cursor.com/fixture-callback',loopback='http://localhost:54321/fixture-callback';
  const client=auth.register({client_name:'Grok Bot fixture',redirect_uris:[https,loopback]});assert.deepEqual(client.redirect_uris,[https]);
  const verifier=randomBytes(32).toString('base64url'),params={client_id:client.client_id,redirect_uri:https,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'bot_fixture_state_123'};
  assert.match(auth.authorize(params).location,/\/grok-connect\//);
  assert.throws(()=>auth.authorize({...params,redirect_uri:loopback}),{code:'invalid_redirect_uri'});
  assert.throws(()=>auth.register({redirect_uris:[loopback]}),{code:'invalid_redirect_uri'});
  assert.throws(()=>auth.register({redirect_uris:['https://grok.com/callback',loopback]}),{code:'invalid_redirect_uri'});
  assert.throws(()=>auth.register({redirect_uris:[https,'https://evil.example/callback']}),{code:'invalid_redirect_uri'});
  assert.throws(()=>auth.register({redirect_uris:[https,'http://127.0.0.1:54321/callback']}),{code:'invalid_redirect_uri'});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('authenticated Streamable HTTP reuses existing tools and private approval without exposing desktop APIs',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-gateway-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
 const database=path.join(dataDir,'universe.sqlite'),writeConfig=path.join(dataDir,'mcp-writes.json');const local={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://laptop.example.ts.net',login:'fixture@example.test',approval_mode:'trusted',database_id:databaseIdentity(database)};
 const config={enabled:true,public_origin:'https://gateway.example',private_origin:local.origin,control_token:randomBytes(32).toString('hex'),state_file:path.join(temp,'oauth.json'),redirect_hosts:['grok.com'],port:4320};
 let app,reader,gateway;
 try{
  const stub={call:async()=>({data:{}})};
  const events=[];
  gateway=createGateway({config,dispatch:async request=>dispatcher(request),onEvent:event=>events.push(event)});await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r));config.port=gateway.server.address().port;
  app=await createApp({root,dataDir,mcpWrites:local,mobile:{enabled:true,origin:local.origin,login:local.login},grokConfig:config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>app.mobileServer.listen(0,'127.0.0.1',r));
  const appUrl='http://127.0.0.1:'+app.server.address().port,remote='http://127.0.0.1:'+app.mobileServer.address().port,base='http://127.0.0.1:'+gateway.server.address().port;
  await fs.writeFile(writeConfig,JSON.stringify({...local,app_url:appUrl}));reader=await createCatalogue({database,mediaRoot:root});const dispatcher=createDispatcher({catalogue:reader,refreshWriter:()=>createWriteClient({database,writeConfig})});
  const request=async(route,body,headers={},method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,redirect:'manual',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,headers:r.headers,body:r.status===302?null:await r.json()};};
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
  assert.equal((await request('/api/state')).status,404);assert.equal((await request('/media-import/anything')).status,404);
  assert.equal((await request('/.well-known/oauth-protected-resource')).body.resource,config.public_origin+'/mcp');
  const client=(await request('/oauth/register',{client_name:'Grok fixture',redirect_uris:['https://grok.com/test-callback']})).body;
  assert.equal((await request('/oauth/register',{redirect_uris:['https://evil.example/private-secret-path?token=secret_query_8f73']})).body.error,'invalid_redirect_uri');
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const params=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'fixture-state-12345'});
  const invalidParams=new URLSearchParams(params);invalidParams.set('scope','private-scope-marker');
  assert.equal((await request('/oauth/authorize?'+invalidParams)).body.error,'invalid_scope');
  const begin=await request('/oauth/authorize?'+params),connectionId=begin.headers.get('location').split('/').at(-1),cookie=begin.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(remote+'/grok-connect/'+connectionId)).status,403);
  const identity={'Tailscale-User-Login':local.login},session=await (await fetch(remote+'/api/session',{headers:identity})).json();
  const approveRoute=remote+'/api/grok-connections/'+connectionId;
  assert.equal((await fetch(approveRoute,{method:'PUT',headers:{...identity,'Content-Type':'application/json',Origin:local.origin,'X-LU-CSRF':'wrong'},body:JSON.stringify({decision:'approve'})})).status,403);
  const approval=await fetch(approveRoute,{method:'PUT',headers:{...identity,'Content-Type':'application/json',Origin:local.origin,'X-LU-CSRF':session.csrf},body:JSON.stringify({decision:'approve'})});assert.equal(approval.status,200,await approval.clone().text());
  const resumed=await request('/oauth/continue?id='+connectionId,null,{Cookie:cookie}),code=new URL(resumed.headers.get('location')).searchParams.get('code');
  const issued=(await request('/oauth/token',{grant_type:'authorization_code',code,code_verifier:verifier,client_id:client.client_id,redirect_uri:client.redirect_uris[0]})).body;
  const headers={Authorization:'Bearer '+issued.access_token};let id=0;const rpc=async(method,params)=>(await request('/mcp',{jsonrpc:'2.0',id:++id,method,params},headers)).body;
  const initialized=await rpc('initialize',{protocolVersion:'2025-06-18'});assert.match(initialized.result.instructions,/Trusted text editing/);
  const list=await rpc('tools/list');assert.ok(list.result.tools.some(t=>t.name==='propose_ghost_profile'));assert.ok(list.result.tools.some(t=>t.name==='begin_media_import'));assert.ok(list.result.tools.some(t=>t.name==='prepare_image_generation'));
  const proposed=(await rpc('tools/call',{name:'propose_character_create',arguments:{request_key:'gateway_create_fixture',fields:{name:'Gateway adult, 38',biography:'Generated client text'}}})).result.structuredContent;
  const committed=(await rpc('tools/call',{name:'apply_approved_change',arguments:{change_id:proposed.change_id}})).result.structuredContent;assert.ok(committed.character_id);
  assert.equal((await reader.call('get_character',{character_id:committed.character_id})).data.name,'Gateway adult, 38');
  // Independently exercise Grok's authenticated HTTP transport. This uses no
  // OpenAI file metadata and does not pretend to be a consumer chat attachment.
  const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoaGgAAAMEAYEezv+mAAAAAElFTkSuQmCC','base64');
  const digest=createHash('sha256').update(picture).digest('hex');
  const toolCall=async(name,args)=>{const response=(await rpc('tools/call',{name,arguments:args})).result;assert.equal(response.isError,false,JSON.stringify(response));return response.structuredContent;};
  assert.ok(list.result.tools.some(t=>t.name==='get_profile_template'));assert.ok(list.result.tools.some(t=>t.name==='update_profile_template'));
  const shared=await toolCall('get_profile_template',{field_ids:['goals']});
  const sharedEdit={request_key:'grok_shared_template',expected_version:shared.template_version,field_updates:[{id:'goals',guidance:'Use retrieved context; leave unknown information unspecified.'}]};
  const edited=await toolCall('update_profile_template',sharedEdit);assert.equal(edited.template_version,shared.template_version+1);assert.equal(edited.character_values_unchanged,true);
  assert.deepEqual(await toolCall('update_profile_template',sharedEdit),edited);
  assert.equal((await toolCall('get_profile_template',{field_ids:['goals']})).fields[0].guidance,sharedEdit.field_updates[0].guidance);
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:190,method:'tools/call',params:{name:'update_profile_template',arguments:sharedEdit}})).status,401);
  const pending=await toolCall('begin_media_import',{request_key:'grok_http_upload_001',character_ids:[committed.character_id]});
  const upload=await toolCall('begin_media_upload',{import_id:pending.import_id,slot_key:'grok_image_001',filename:'grok-fixture.png',content_type:'image/png',size_bytes:picture.length,sha256:digest});
  await toolCall('upload_media_chunk',{upload_id:upload.upload_id,offset:0,data_base64:picture.toString('base64')});
  const finished=await toolCall('finalize_media_upload',{upload_id:upload.upload_id});assert.equal(finished.receipt.sha256,digest);assert.equal(finished.receipt.associations[0].linked,true);
  assert.deepEqual(await toolCall('finalize_media_upload',{upload_id:upload.upload_id}),finished);
  assert.equal((await toolCall('get_media',{media_id:finished.receipt.media_id})).characters[0].id,committed.character_id);
  assert.ok(list.result.tools.some(t=>t.name==='list_media_imports'));assert.ok(list.result.tools.some(t=>t.name==='cancel_media_import'));
  assert.equal((await toolCall('list_media_imports',{})).imports[0].import_id,pending.import_id);
  const cancelled=await toolCall('cancel_media_import',{import_id:pending.import_id});assert.equal(cancelled.cleanup_complete,true);assert.equal(cancelled.capacity.active_imports,0);
  assert.equal((await toolCall('get_media',{media_id:finished.receipt.media_id})).characters[0].id,committed.character_id);
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:99,method:'tools/call',params:{name:'cancel_media_import',arguments:{import_id:pending.import_id}}})).status,401);
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:98,method:'tools/call',params:{name:'upload_media_chunk',arguments:{upload_id:upload.upload_id,offset:0,data_base64:picture.toString('base64')}}})).status,401);
  assert.equal((await request('/mcp',{jsonrpc:'2.0',id:9,method:'tools/list'},{...headers,Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/internal/connections/'+connectionId,null,headers)).status,403);
  assert.equal((await request('/mcp',null,headers,'GET')).status,405);
  const notification=await fetch(base+'/mcp',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});assert.equal(notification.status,202);
  assert.ok(events.some(e=>e.operation==='/oauth/authorize'&&e.error==='invalid_scope'));
  assert.ok(events.some(e=>e.phase==='request_shape'&&e.scope_present&&!e.scope_matches));
  assert.ok(events.some(e=>e.phase==='callback_hosts'&&e.callbacks.some(c=>c.host==='evil.example')));
  const diagnostic=JSON.stringify(events);for(const sensitive of [verifier,challenge,'fixture-state-12345','private-scope-marker','private-secret-path','secret_query_8f73',issued.access_token,issued.refresh_token,code,cookie])assert.equal(diagnostic.includes(sensitive),false);
 }finally{reader?.close();if(gateway)await new Promise(r=>{gateway.server.close(r);gateway.server.closeAllConnections();});await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
