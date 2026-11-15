import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {deflateRawSync,crc32} from 'node:zlib';
import {readZip,entryParts,ignoredEntry,imageKind,placeIndex,matchPlace} from '../app/background-zip.mjs';
import {createApp} from '../app/server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
const png2=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');

// Small ZIP writer for tests: {name, data, deflate, flags, rawName}.
function makeZip(items){
  const locals=[],central=[];let offset=0;
  for(const it of items){
    const name=it.rawName||Buffer.from(it.name,'utf8'),data=it.data,body=it.deflate?deflateRawSync(data):data,flags=it.flags??(it.rawName?0:0x800);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(flags,6);l.writeUInt16LE(it.deflate?8:0,8);
    l.writeUInt32LE(crc32(data)>>>0,14);l.writeUInt32LE(body.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(it.deflate?8:0,10);
    c.writeUInt32LE(crc32(data)>>>0,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
    locals.push(l,name,body);central.push(c,name);offset+=30+name.length+body.length;
  }
  const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(items.length,8);e.writeUInt16LE(items.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,e]);
}

test('background zip reader: stored, deflate, names, escapes, encrypted, damage',()=>{
  const zip=makeZip([{name:'Péter háza - konyha/konyha-nappal.png',data:png},{name:'Tópart/to.png',data:png2,deflate:true},{name:'../x.png',data:png},{name:'notes/readme.txt',data:Buffer.from('hello')},{name:'titkos/a.png',data:png,flags:0x801},{rawName:Buffer.from([0x82,0x6c,0x65,0x74,0x2f,0x61,0x2e,0x70,0x6e,0x67]),data:png}]);
  const {entries}=readZip(zip);
  assert.deepEqual(entries.map(e=>e.name),['Péter háza - konyha/konyha-nappal.png','Tópart/to.png','../x.png','notes/readme.txt','titkos/a.png','élet/a.png'],'UTF-8 flag and the CP437 fallback');
  assert.deepEqual(entries[0].read(),png);assert.deepEqual(entries[1].read(),png2,'deflate');
  assert.equal(entryParts('../x.png'),null);assert.equal(entryParts('/abs.png'),null);assert.equal(entryParts('C:/x.png'),null);assert.equal(entryParts('a/../../b.png'),null);
  assert.deepEqual(entryParts('a/./b.png'),['a','b.png']);
  assert.equal(ignoredEntry(['__MACOSX','a','._b.png']),true);assert.equal(ignoredEntry(['.git','x']),true);assert.equal(ignoredEntry(['a','b.png']),false);
  assert.equal(imageKind(entries[3].read()),null);assert.equal(imageKind(png),'png');
  assert.equal(entries[4].encrypted,true);assert.throws(()=>entries[4].read(),/Encrypted/);
  const broken=Buffer.from(zip);broken[30+Buffer.byteLength(entries[0].name)+40]^=0xff;
  assert.throws(()=>readZip(broken).entries[0].read(),/damaged/,'CRC checked');
  assert.throws(()=>readZip(Buffer.from('not a zip at all, definitely not')),/not a ZIP/);
  const z64=Buffer.concat([Buffer.alloc(20),makeZip([])]);z64.writeUInt32LE(0x07064b50,0);
  assert.throws(()=>readZip(z64),/ZIP64/);
  // Two central records pointing at one data block (ZIP-bomb trick) are refused.
  const twin=makeZip([{name:'x/a1.png',data:png},{name:'x/a2.png',data:png}]),cd=twin.readUInt32LE(twin.length-6);
  twin.writeUInt32LE(0,cd+46+'x/a1.png'.length+42);
  assert.throws(()=>readZip(twin),/damaged/);
});

test('background zip matcher: exact, tolerant, town prefix, ambiguous, candidates',()=>{
  const locations=[{id:'k',name:'Péter háza - konyha'},{id:'n',name:'Péter háza - nappali'},{id:'s',name:'Sanyi háza - Konyha'},{id:'t',name:'Tópart'},{id:'h1',name:'Ház'},{id:'h2',name:'Ház '}];
  const nodes=[{location_id:'k',name:'Péter háza - konyha',short_name:'Konyha',path:'Káloz › Péter háza › Konyha'},{location_id:'n',name:'Péter háza - nappali',short_name:'Nappali',path:'Káloz › Péter háza › Nappali'},{location_id:'s',name:'Sanyi háza - Konyha',short_name:'Konyha',path:'Káloz › Sanyi háza › Konyha'}];
  const index=placeIndex(locations,nodes);
  assert.deepEqual(matchPlace('Péter háza - konyha',index),{location_id:'k',name:'Péter háza - konyha',how:'exact'});
  assert.equal(matchPlace('peter haza konyha',index).location_id,'k');
  assert.equal(matchPlace('Káloz - Péter háza - Konyha',index).location_id,'k','tree path with town');
  assert.equal(matchPlace('Péter_háza – Konyha',index).how,'tolerant');
  assert.equal(matchPlace('TÓPART',index).location_id,'t');
  const konyha=matchPlace('Konyha',index);assert.equal(konyha.location_id,null);assert.equal(konyha.ambiguous,true);assert.deepEqual([...konyha.candidates].sort(),['Péter háza - konyha','Sanyi háza - Konyha']);
  const invented=matchPlace('Sárbogárd - Ház',index);assert.equal(invented.location_id,null,'no guess');assert.ok(invented.candidates.length<=3&&invented.candidates.length>0);
  assert.equal(matchPlace('Ház',index).location_id,null,'two catalogue names with the same folder: no guess');
});

test('background zip matcher: exact name clashing with a short name, archived place, bare words, town hint',()=>{
  const locations=[{id:'bg',name:'Edzőterem'},{id:'kg',name:'Káloz - Edzőterem'},{id:'u',name:'Utca'},{id:'ku',name:'Káloz  street'},{id:'gk',name:'Pákozdi háza kert'},{id:'bb',name:'Budapest  - bolt'},
    {id:'an',name:'András háza - Nappali'},{id:'bn',name:'Bálint háza - Nappali'},{id:'kh',name:'Káloz határa'},{id:'old',name:'Régi pajta'}];
  const nodes=[{location_id:'bg',name:'Edzőterem',short_name:'Edzőterem',path:'Budapest › Edzőterem'},{location_id:'kg',name:'Káloz - Edzőterem',short_name:'Edzőterem',path:'Káloz › Edzőterem'},
    {location_id:'ku',name:'Káloz  street',short_name:'Utca',path:'Káloz › Utca'},{location_id:'gk',name:'Pákozdi háza kert',short_name:'Kert',path:'Pákozd › Pákozdi háza › Kert'},
    {location_id:'bb',name:'Budapest  - bolt',short_name:'Bolt',path:'Budapest › Bolt'},{location_id:'an',name:'András háza - Nappali',short_name:'Nappali',path:'Káloz › András háza › Nappali'},
    {location_id:'bn',name:'Bálint háza - Nappali',short_name:'Nappali',path:'Sárbogárd › Bálint háza › Nappali'},{location_id:'kh',name:'Káloz határa',short_name:'Káloz határa',path:'Káloz › Káloz határa'}];
  const index=placeIndex(locations,nodes,new Set(['u','old']));
  const gym=matchPlace('Edzőterem',index);assert.equal(gym.location_id,null,'exact name is also another place\'s short name');assert.equal(gym.ambiguous,true);assert.deepEqual([...gym.candidates].sort(),['Edzőterem','Káloz - Edzőterem']);
  const street=matchPlace('Utca',index);assert.equal(street.location_id,null,'archived place never wins over a live short name');assert.equal(street.ambiguous,true);
  const barn=matchPlace('Régi pajta',index);assert.equal(barn.location_id,null,'archived place is not placed into');assert.equal(barn.archived,true);
  assert.equal(matchPlace('Kert',index).location_id,null,'bare word');assert.equal(matchPlace('Bolt',index).location_id,null,'bare word');
  assert.equal(matchPlace('Budapest - Bolt',index).location_id,'bb','full tree path still places');
  const living=matchPlace('Káloz - Nappali',index);assert.equal(living.location_id,null);assert.equal(living.ambiguous,true);assert.deepEqual(living.candidates,['András háza - Nappali','Bálint háza - Nappali'],'the named town first, no town-border guess');
});

test('background zip import over HTTP: placed, duplicate, unmatched, refused, no overwrite, journal',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-bgzip-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');
  await fs.mkdir(root);await fs.mkdir(dataDir);
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:null});
  t.after(async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const call=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const send=async(zip,name='hatterek.zip',type='application/zip')=>{const r=await fetch(base+'/api/backgrounds/zip',{method:'POST',headers:{'Content-Type':type,'X-LU-Filename':encodeURIComponent(name)},body:zip});return {status:r.status,data:await r.json()};};
  const kitchen=(await call('/api/locations',{name:'Péter háza - konyha',kind:'tag'})).data;
  await call('/api/locations',{name:'Tópart',kind:'tag'});
  await call('/api/backgrounds/scan',{});
  const folder=path.join(root,'Helyszín hátterek','Péter háza - konyha');
  // A different picture with the same name is already there: it must stay untouched.
  await fs.writeFile(path.join(folder,'konyha-nappal.png'),png2);
  const zip=makeZip([
    {name:'Péter háza - konyha/konyha-nappal.png',data:png,deflate:true},
    {name:'tópart/to-nappal.png',data:png},
    {name:'Tópart/again.png',data:png},
    {name:'Sárbogárd - Ház/haz.png',data:png2},
    {name:'../escape.png',data:png},
    {name:'Tópart/notes.png',data:Buffer.from('not an image')},
    {name:'Tópart/secret.png',data:png,flags:0x801},
    {name:'__MACOSX/Tópart/._to.png',data:Buffer.from('x')},
    {name:'Tópart/x.webp',data:Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(8)])},
    {name:'root.png',data:png},
  ]);
  assert.equal((await send(zip,'x.zip','application/json')).status,415,'raw zip route still needs a zip type');
  assert.equal((await send(Buffer.from('nope'))).status,400);
  const r=(await send(zip,'Grok hátterek.zip')).data;
  assert.deepEqual(r.placed.map(x=>[x.entry,x.location,x.match]),[['Péter háza - konyha/konyha-nappal.png','Péter háza - konyha','exact'],['tópart/to-nappal.png','Tópart','tolerant']]);
  assert.equal(r.placed[0].file,path.join('Helyszín hátterek','Péter háza - konyha','konyha-nappal (2).png'),'name clash gets (2)');
  assert.deepEqual(await fs.readFile(path.join(folder,'konyha-nappal.png')),png2,'never overwritten');
  assert.deepEqual(r.duplicates.map(x=>x.entry),['Tópart/again.png']);
  assert.deepEqual(r.unmatched.map(x=>x.entry),['Sárbogárd - Ház/haz.png','root.png'],'a picture at the ZIP root is not guessed');
  assert.deepEqual(r.refused.map(x=>x.entry).sort(),['../escape.png','Tópart/notes.png','Tópart/secret.png','Tópart/x.webp'].sort());
  const webp=r.refused.find(x=>x.entry==='Tópart/x.webp');assert.ok(webp.set_aside.startsWith(r.set_aside_folder),'WebP kept for review, not placed');
  assert.equal(path.dirname(r.unmatched[1].set_aside),r.set_aside_folder);
  assert.ok(r.set_aside_folder.startsWith('Háttércsomagok'));assert.ok(r.set_aside_folder.endsWith(' - Grok hátterek'));
  assert.deepEqual(await fs.readFile(path.join(root,r.unmatched[0].set_aside)),png2);
  await assert.rejects(fs.stat(path.join(temp,'escape.png')));await assert.rejects(fs.stat(path.join(root,'escape.png')));
  const placedMedia=app.db.prepare('SELECT m.id FROM media m JOIN media_roles r ON r.media_id=m.id AND r.role=\'location\' WHERE m.relative_path=?').get(r.placed[0].file);
  assert.ok(placedMedia,'registered as a background');
  assert.ok(app.db.prepare('SELECT 1 FROM media_tags WHERE media_id=? AND tag_id=(SELECT tag_id FROM locations WHERE id=?)').get(placedMedia.id,kitchen.id));
  const journal=JSON.parse(await fs.readFile(path.join(dataDir,'backups',r.journal),'utf8'));
  assert.equal(journal.zip,'Grok hátterek.zip');assert.equal(journal.entries.find(e=>e.entry==='Péter háza - konyha/konyha-nappal.png').target,r.placed[0].file);
  assert.ok(journal.entries.every(e=>!e.sha256||/^[0-9a-f]{64}$/.test(e.sha256)));
  // Second import: everything placed earlier is a duplicate now.
  const again=(await send(zip)).data;assert.equal(again.placed.length,0);assert.equal(again.duplicates.length,3);
  // The plain scan reports a tolerantly named folder without moving it.
  await fs.mkdir(path.join(root,'Helyszín hátterek','peter haza konyha'));
  const scan=(await call('/api/backgrounds/scan',{})).data;
  assert.deepEqual(scan.misnamed_folders.map(x=>[x.folder,x.expected_folder]),[['peter haza konyha','Péter háza - konyha']]);
  assert.ok((await fs.stat(path.join(root,'Helyszín hátterek','peter haza konyha'))).isDirectory());
  assert.equal(journal.status,'completed');
  // A case-only difference is the same folder on Windows: not misnamed. A stray folder is listed.
  await fs.rename(path.join(root,'Helyszín hátterek','Tópart'),path.join(root,'Helyszín hátterek','TÓPART'));
  await fs.mkdir(path.join(root,'Helyszín hátterek','Sárbogárd - Ház'));
  const scan2=(await call('/api/backgrounds/scan',{})).data;
  assert.ok(!scan2.misnamed_folders.some(x=>x.folder==='TÓPART'));
  assert.deepEqual(scan2.unmatched_folders.map(x=>x.folder),['Sárbogárd - Ház']);
});
