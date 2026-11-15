import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');

test('location backgrounds: Grok saves by URL through MCP, desktop upload, Play uses them',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-backgrounds-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const config={enabled:true,approval_mode:'trusted',token:randomBytes(32).toString('hex'),origin:'https://fixture.example.ts.net',login:'creator@example.test',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
  const fetched=[];
  // Stand-in for the safe public-HTTPS downloader: no network in tests.
  const download=async url=>{fetched.push(url);if(url.includes('broken'))throw Object.assign(new Error('Not a public HTTPS image.'),{status:400});return {stream:Readable.from([url.includes('text')?Buffer.from('not an image'):png]),contentType:'image/png',source:{}};};
  const app=await createApp({root,dataDir,mcpWrites:config,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null,backgroundTestOptions:{download}});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const mcp=(operation,args)=>call('/api/mcp-backgrounds',{operation,arguments:args},{Authorization:'Bearer '+config.token});

  const park=(await call('/api/locations',{name:'Budapest - Városliget',kind:'tag'})).data;
  assert.equal((await call('/api/mcp-backgrounds',{operation:'capabilities',arguments:{}})).status,403,'MCP token required');
  assert.equal((await mcp('capabilities',{})).data.enabled,true);
  const listed=(await mcp('list_locations',{search:'Város'})).data.locations;
  assert.deepEqual(listed.map(l=>[l.name,l.background_count]),[['Budapest - Városliget',0]]);

  const saved=(await mcp('import_url',{location_id:park.id,url:'https://imgen.example/park.png',prompt:'Városliget, Vajdahunyad vára, ősz',title:'Városliget ősszel'})).data;
  assert.equal(saved.saved,true);assert.equal(saved.canon_changed,false);
  const media=app.db.prepare('SELECT relative_path FROM media WHERE id=?').get(saved.media_id);
  assert.ok(media.relative_path.startsWith(path.join('Helyszín hátterek','Budapest - Városliget')));
  assert.deepEqual(await fs.readFile(path.join(root,media.relative_path)),png);
  assert.equal(app.db.prepare("SELECT role FROM media_roles WHERE media_id=?").get(saved.media_id).role,'location');
  assert.ok(app.db.prepare('SELECT notes FROM media_notes WHERE media_id=?').get(saved.media_id).notes.includes('Vajdahunyad'));
  assert.equal((await mcp('list_locations',{search:'Város'})).data.locations[0].background_count,1);
  // Same bytes again: same media, nothing overwritten.
  assert.equal((await mcp('import_url',{location_id:park.id,url:'https://imgen.example/again.png',prompt:'x'})).data.media_id,saved.media_id);
  // Not an image / bad URL / unknown place are refused.
  assert.equal((await mcp('import_url',{location_id:park.id,url:'https://imgen.example/text',prompt:'x'})).status,400);
  assert.equal((await mcp('import_url',{location_id:park.id,url:'https://broken.example/x.png',prompt:'x'})).status,400);
  assert.equal((await mcp('import_url',{location_id:'00000000-0000-4000-8000-000000000000',url:'https://imgen.example/p.png',prompt:'x'})).status,404);

  // The MCP client used by the Grok gateway discovers and routes the new tools.
  const writeConfig=path.join(dataDir,'mcp-writes.json');
  await fs.writeFile(writeConfig,JSON.stringify({enabled:true,approval_mode:'trusted',app_url:base,token:config.token,database_id:config.database_id,origin:config.origin}));
  const {createWriteClient}=await import('../mcp/writes.mjs');
  const writer=await createWriteClient({database:path.join(dataDir,'universe.sqlite'),writeConfig});
  assert.equal(writer.backgroundsAvailable,true);
  assert.equal((await writer.call('list_locations',{search:'Város'})).data.locations[0].background_count,1);

  // Free folder route: folders are created per location; a picture saved there is picked up.
  let scan=(await call('/api/backgrounds/scan',{})).data;
  assert.equal(scan.added,0);assert.ok(scan.folders_created>=0);
  const folder=path.join(root,'Helyszín hátterek','Budapest - Városliget');
  assert.ok((await fs.stat(folder)).isDirectory());
  await fs.writeFile(path.join(folder,'grok-varosliget.png'),Buffer.concat([png]));
  await fs.writeFile(path.join(folder,'notes.png'),'not an image');
  scan=(await call('/api/backgrounds/scan',{})).data;
  assert.equal(scan.added,1);assert.equal(scan.errors.length,1);
  const picked=app.db.prepare('SELECT id FROM media WHERE relative_path=?').get(path.join('Helyszín hátterek','Budapest - Városliget','grok-varosliget.png'));
  assert.equal(app.db.prepare("SELECT role FROM media_roles WHERE media_id=?").get(picked.id).role,'location');
  assert.equal(app.db.prepare('SELECT complete FROM media_categorization WHERE media_id=?').get(picked.id).complete,1);
  assert.equal((await call('/api/backgrounds/scan',{})).data.added,0,'second scan adds nothing');
  assert.deepEqual(await fs.readFile(path.join(folder,'grok-varosliget.png')),png,'files are never moved or changed');

  // Desktop fallback upload (image saved from the Grok app by hand).
  const lake=(await call('/api/locations',{name:'Tópart',kind:'tag'})).data;
  const up=(await call('/api/backgrounds/upload',{location_id:lake.id,data_url:'data:image/png;base64,'+png.toString('base64'),filename:'grok.png'})).data;
  assert.equal(up.saved,true);
  assert.equal((await call('/api/backgrounds/upload',{location_id:lake.id,data_url:'data:text/plain;base64,aGk='})).status,400);
});
