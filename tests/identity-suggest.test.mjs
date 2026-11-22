import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {createApp} from '../app/server.mjs';
import {approveCanon} from './canon-client.mjs';

// Synthetic faces: each "person" is a fixed direction in 512-d space. A fixture file's text lists
// who is in it ("faces:A,B"); the fake analyser returns one face per letter, left to right.
const PEOPLE={A:1,B:2,C:3,D:4};
function vector(letter,noise=0.05){
  const v=new Float32Array(512);v[PEOPLE[letter]*7]=1;for(let i=0;i<512;i++)v[i]+=noise*Math.sin(i*PEOPLE[letter]+1);
  let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n);return Float32Array.from(v,x=>x/n);
}
const lookalike=()=>{const a=vector('A'),b=vector('B'),v=Float32Array.from(a,(x,i)=>x*0.7+b[i]*0.7);let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n);return Float32Array.from(v,x=>x/n);};
// Real (tiny, synthetic) PNGs, because a cropped reference must be a decodable picture.
function png(seed){const w=16,h=16,raw=Buffer.alloc((w*3+1)*h);for(let i=0;i<raw.length;i++)raw[i]=i%(w*3+1)===0?0:(i*seed)%251;
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const WHO=new Map();
async function fakeAnalyse(file){
  const letters=(WHO.get(path.basename(file))||'').split(',').filter(Boolean);
  return {ok:true,faces:letters.map((l,i)=>{const v=l==='~'?lookalike():vector(l);return {box:{x:0.1+i*0.4,y:0.2,w:0.2,h:0.3},score:0.9,px:120,embedding:Buffer.from(v.buffer).toString('base64')};})};
}
fakeAnalyse.available=()=>true;

test('face identity: suggestions only above the margin, likely wrong links, reference checks; never canon',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-identity-')),root=path.join(temp,'resources');await fs.mkdir(root);let app;
  try{
    const files={'ref-a.png':'faces:A','ref-a2.png':'faces:A','ref-a-odd.png':'faces:D','ref-b.png':'faces:B','ref-b-crop.png':'faces:C,B','solo-a.png':'faces:A','pair.png':'faces:A,B','stranger.png':'faces:C','none.png':'faces:','unclear.png':'faces:~','wrong-link.png':'faces:A'};
    let seed=3;for(const [n,c] of Object.entries(files)){WHO.set(n,c.slice(6));await fs.writeFile(path.join(root,n),png(seed++));}
    app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,identityAnalyser:fakeAnalyse});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(route,body,method)=>{const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;};
    await api('/api/scan',{});const media=(await api('/api/media')).items,id=n=>media.find(m=>m.relative_path===n).id;
    const a=await api('/api/characters',{name:'Teszt Ádám'}),b=await api('/api/characters',{name:'Teszt Béla'});
    for(const [c,refs] of [[a,['ref-a.png','ref-a2.png','ref-a-odd.png']],[b,['ref-b.png','ref-b-crop.png']]])
      await api('/api/media/bulk',{operation:'assign',media_ids:refs.map(id),character_ids:[c.id]});
    await approveCanon(api,a.id,{appearance:'Teszt',references:['ref-a.png','ref-a2.png','ref-a-odd.png'].map(n=>({media_id:id(n),role:'face'}))});
    // Béla's second reference is cropped to the right-hand face (B), next to a stranger.
    await approveCanon(api,b.id,{appearance:'Teszt',references:[{media_id:id('ref-b.png'),role:'face'},{media_id:id('ref-b-crop.png'),role:'face',crop:{x:0.45,y:0.1,w:0.4,h:0.6}}]});
    await api('/api/media/bulk',{operation:'assign',media_ids:[id('wrong-link.png')],character_ids:[b.id]});
    const canonBefore=JSON.stringify(app.db.prepare('SELECT * FROM canon ORDER BY rowid').all()),linksBefore=app.db.prepare('SELECT count(*) n FROM depictions').get().n;

    const started=await api('/api/identity/scan',{scope:'unsorted'});assert.equal(started.running,true);
    await assert.rejects(api('/api/identity/scan',{scope:'unsorted'}),{status:409});
    await app.identity.wait();
    let r=await api('/api/identity');
    assert.equal(r.status.errors,0);
    const sug=r.report.suggestions.map(s=>`${s.media_id===id('solo-a.png')?'solo':s.media_id===id('pair.png')?'pair':s.media_id===id('stranger.png')?'stranger':s.media_id===id('unclear.png')?'unclear':'other'}:${s.name}`).sort();
    assert.deepEqual(sug,['pair:Teszt Béla','pair:Teszt Ádám','solo:Teszt Ádám'],'a stranger and a face between two people get no suggestion');
    assert.ok(r.report.suggestions.every(s=>s.score>=0.35));
    // Linked pictures are not scanned in the "unsorted" scope; the reference pictures are.
    assert.equal(r.report.mismatches.length,0);
    const ada=r.report.references.find(c=>c.name==='Teszt Ádám'),bela=r.report.references.find(c=>c.name==='Teszt Béla');
    assert.deepEqual(ada.items.map(i=>i.status).sort(),['ok','ok','outlier'],'the reference showing someone else stands out');
    assert.deepEqual(bela.items.map(i=>i.status),['ok','ok'],'the crop picks the face inside it');
    assert.equal(r.report.lookalikes.length,0);
    const screened=await app.identity.checkGenerated(a.id,id('solo-a.png'));assert.equal(screened.face_verdict,'matches');assert.equal(screened.body_verdict,'unknown');assert.equal(screened.canon_changed,false);
    assert.equal((await app.identity.checkGenerated(a.id,id('pair.png'))).reason,'MULTIPLE_FACES');
    // The owner says no: that suggestion disappears. Yes goes through the ordinary link route.
    const pairA=r.report.suggestions.find(s=>s.media_id===id('pair.png')&&s.name==='Teszt Ádám');
    await api('/api/identity/feedback',{media_id:pairA.media_id,character_id:pairA.character_id,verdict:'no'});
    const solo=r.report.suggestions.find(s=>s.media_id===id('solo-a.png'));
    await api('/api/media/bulk',{operation:'assign',media_ids:[solo.media_id],character_ids:[solo.character_id]});
    r=await api('/api/identity');
    assert.deepEqual(r.report.suggestions.map(s=>s.name),['Teszt Béla']);
    // Whole library: the picture linked to Béla that shows Ádám is reported.
    await api('/api/identity/scan',{scope:'all'});await app.identity.wait();r=await api('/api/identity');
    assert.ok(r.report.mismatches.some(m=>m.media_id===id('wrong-link.png')&&m.linked.name==='Teszt Béla'&&m.looks_like.name==='Teszt Ádám'));
    // Unchanged files are not analysed again.
    const scannedBefore=r.status.scanned;let calls=0;const counting=async f=>{calls++;return fakeAnalyse(f);};void counting;
    await api('/api/identity/scan',{scope:'all'});await app.identity.wait();assert.equal((await api('/api/identity/status')).scanned,scannedBefore);
    // Cover suggestions use only fresh, character-bound approved face references.
    const coverRoute='/api/identity/cover/'+b.id+'/'+id('ref-b-crop.png');let cover=await api(coverRoute);assert.equal(cover.face_count,2);assert.ok(cover.suggestion);assert.ok(Math.abs(cover.suggestion.crop.x+cover.suggestion.crop.w/2-.6)<1e-6);
    app.db.prepare('UPDATE characters SET cover_id=? WHERE id=?').run(id('ref-b-crop.png'),b.id);assert.ok((await api('/api/tidy')).group_covers.some(c=>c.id===b.id));
    await api('/api/characters/'+b.id+'/cover-crop',{media_id:id('ref-b-crop.png'),crop:cover.suggestion.crop});assert.ok(!(await api('/api/tidy')).group_covers.some(c=>c.id===b.id));
    app.db.prepare("UPDATE identity_faces SET file_key='stale' WHERE media_id=?").run(id('ref-b.png'));assert.equal((await api(coverRoute)).reason,'SCAN_REQUIRED');cover=await api(coverRoute,{});assert.ok(cover.suggestion,'an explicit bounded local scan refreshes the stale reference');
    assert.equal(JSON.stringify(app.db.prepare('SELECT * FROM canon ORDER BY rowid').all()),canonBefore,'canon is never written');
    assert.equal(app.db.prepare('SELECT count(*) n FROM depictions').get().n,linksBefore+1,'only the owner-clicked link was added');
    await assert.rejects(api('/api/identity/feedback',{media_id:solo.media_id,character_id:solo.character_id,verdict:'yes'}),{status:400});
  }finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
});
