import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
import {createWriteClient} from '../mcp/writes.mjs';
import {createCatalogue} from '../mcp/catalogue.mjs';
import {createDispatcher} from '../mcp/http-gateway.mjs';

test('shared task tree: hierarchy, completion, stale/idempotent edits, movement, interruptions, MCP transports, backup and restart',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-tasks-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data'),database=path.join(dataDir,'universe.sqlite');await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'owner@fixture',database_id:databaseIdentity(database)},options={root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},worldProvider:null};let app,reader;
  const start=async()=>{app=await createApp(options);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+app.server.address().port;};
  try{let base=await start();const context=await(await fetch(base+'/api/dev-tasks')).json();let state=context;
    const post=async(operation,args={},extra={})=>{const response=await fetch(base+'/api/dev-tasks',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-LU-Tasks-CSRF':state.csrf,...extra},body:JSON.stringify({operation,arguments:{request_key:'task_'+randomUUID(),expected_version:state.version,...args}})});return {status:response.status,value:await response.json()};};
    assert.equal((await post('create',{text:'Unauthorized'},{'X-LU-Tasks-CSRF':''})).status,403);
    assert.equal((await fetch(base+'/api/mcp-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'read',arguments:{}})})).status,403);
    let result=await post('create',{text:'Fejlesztés',note:'Közös jegyzet'});assert.equal(result.status,200);state=result.value;const parent=state.changed_task_id,version=state.version;
    const intent={request_key:'repeat_task_fixture',text:'Alfeladat',parent_id:parent};result=await post('create',intent);state=result.value;const child=state.changed_task_id;result=await post('create',{...intent,expected_version:version});assert.equal(result.value.changed_task_id,child);assert.equal(result.value.tree[0].children.length,1);assert.equal((await post('create',{text:'Stale',expected_version:0})).value.code,'STALE_TASKS');
    state=(await post('create',{text:'Másik alfeladat',parent_id:parent})).value;const other=state.changed_task_id;state=(await post('update',{task_id:child,done:true})).value;assert.equal(state.tree[0].partial,true);assert.equal(state.tree[0].done,false);state=(await post('update',{task_id:other,done:true})).value;assert.equal(state.tree[0].done,true);state=(await post('update',{task_id:parent,done:false})).value;assert.ok(state.tree[0].children.every(node=>!node.done));
    state=(await post('set_active',{task_id:child})).value;state=(await post('set_active',{task_id:other})).value;assert.equal(state.active_task.id,other);assert.equal(state.previous_tasks[0].id,child);state=(await post('set_active',{task_id:child})).value;assert.equal(state.previous_tasks[0].id,other);
    assert.equal((await post('move',{task_id:parent,parent_id:child})).value.code,'TASK_CYCLE');state=(await post('move',{task_id:other,parent_id:null,index:0})).value;assert.equal(state.tree[0].id,other);state=(await post('move',{task_id:other,parent_id:parent,index:0})).value;assert.equal(state.tree[0].children[0].id,other);
    await fs.writeFile(path.join(dataDir,'mcp-writes.json'),JSON.stringify({...config,app_url:base}));const writer=await createWriteClient({database,writeConfig:path.join(dataDir,'mcp-writes.json')});assert.equal(writer.tasksAvailable,true);assert.equal((await writer.call('get_active_task',{})).data.active_task.id,child);
    state=(await writer.call('update_task',{request_key:'mcp_task_fixture',expected_version:state.version,task_id:child,text:'MCP-vel javítva',note:'ChatGPT, Claude és Grok közös adata.'})).data;assert.equal(JSON.stringify(state).includes('csrf'),false);assert.equal((await(await fetch(base+'/api/dev-tasks')).json()).active_task.text,'MCP-vel javítva');
    reader=await createCatalogue({database,mediaRoot:root});const dispatch=createDispatcher({catalogue:reader,refreshWriter:async()=>writer}),listed=await dispatch({jsonrpc:'2.0',id:1,method:'tools/list'});assert.ok(listed.result.tools.some(tool=>tool.name==='move_task'));const read=await dispatch({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_task_tree',arguments:{}}});assert.equal(read.result.structuredContent.active_task.id,child);
    state=await(await fetch(base+'/api/dev-tasks')).json();
    // Real image bytes persist separately from bounded tree metadata, with authenticated AI retrieval.
    const png=await fs.readFile(new URL('../app/public/app-icon-192.png',import.meta.url));
    assert.equal((await post('attach',{task_id:child,mime_type:'image/svg+xml',data:'PHN2Zz4='})).status,400);
    assert.equal((await post('attach',{task_id:child,mime_type:'image/png',data:Buffer.from('not an image').toString('base64')})).status,400);
    assert.equal((await post('attach',{task_id:child,mime_type:'image/png',data:png.toString('base64'),expected_version:0})).status,409);
    const imageIntent={request_key:'image_fixture_repeat',task_id:child,name:'Bug screenshot.png',mime_type:'image/png',data:png.toString('base64')},imageVersion=state.version;
    state=(await post('attach',imageIntent)).value;
    state=(await post('attach',{...imageIntent,expected_version:imageVersion})).value;
    const attachment=state.active_task.attachments[0];assert.equal(state.active_task.attachments.length,1);assert.equal(attachment.width,192);assert.ok(!JSON.stringify(state).includes(png.toString('base64')));
    const imageUrl=base+'/api/dev-tasks/'+child+'/images/'+attachment.id;
    let imageResponse=await fetch(imageUrl);assert.equal(imageResponse.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),png);
    assert.equal((await fetch(base+'/api/dev-tasks/'+other+'/images/'+attachment.id)).status,404);
    const imageCall=await dispatch({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_task_image',arguments:{task_id:child,attachment_id:attachment.id}}});
    assert.equal(imageCall.result.isError,false);assert.equal(imageCall.result.content[1].type,'image');assert.deepEqual(Buffer.from(imageCall.result.content[1].data,'base64'),png);assert.ok(!JSON.stringify(imageCall.result.structuredContent).includes(png.toString('base64')));
    const large=Buffer.concat([png,Buffer.alloc(1024*1024)]);state=(await post('attach',{task_id:child,name:'Large screenshot.png',mime_type:'image/png',data:large.toString('base64')})).value;
    const largeId=state.active_task.attachments[1].id,largeImage=await writer.call('get_task_image',{task_id:child,attachment_id:largeId});assert.deepEqual(Buffer.from(largeImage.image.data,'base64'),large);
    state=(await post('remove_attachment',{task_id:child,attachment_id:largeId})).value;
    const exported=await(await fetch(base+'/api/export')).json();assert.ok(exported.application_settings.some(row=>row.key==='development:tasks'));reader.close();reader=null;await app.close();base=await start();state=await(await fetch(base+'/api/dev-tasks')).json();assert.equal(state.active_task.id,child);assert.equal(state.active_task.attachments[0].id,attachment.id);assert.equal(state.tree[0].children[1].text,'MCP-vel javítva');
    const restored=await createApp({root,dataDir:path.join(temp,'restore'),mobile:null,mcpWrites:null,imageGeneration:{},worldProvider:null});try{await new Promise(resolve=>restored.server.listen(0,'127.0.0.1',resolve));const restoreBase='http://127.0.0.1:'+restored.server.address().port,response=await fetch(restoreBase+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(exported)});assert.equal(response.status,200);assert.equal((await(await fetch(restoreBase+'/api/dev-tasks')).json()).active_task.id,child);assert.deepEqual(Buffer.from(await(await fetch(restoreBase+'/api/dev-tasks/'+child+'/images/'+attachment.id)).arrayBuffer()),png);}finally{await restored.close();}
    state=(await post('remove_attachment',{task_id:child,attachment_id:attachment.id})).value;assert.equal((await fetch(base+'/api/dev-tasks/'+child+'/images/'+attachment.id)).status,404);assert.equal(app.db.prepare("SELECT COUNT(*) n FROM application_settings WHERE key LIKE 'development:task-image:%'").get().n,0);
    state=(await post('attach',{...imageIntent,request_key:'image_fixture_delete'})).value;
    state=(await post('delete',{task_id:parent})).value;assert.deepEqual(state.tree,[]);assert.equal(app.db.prepare("SELECT COUNT(*) n FROM application_settings WHERE key LIKE 'development:task-image:%'").get().n,0);assert.equal(state.active_task,null);assert.deepEqual(state.previous_tasks,[]);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM characters').get().n,0);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
  }finally{reader?.close();if(app?.db.isOpen)await app.close();await fs.rm(temp,{recursive:true,force:true});}
});
