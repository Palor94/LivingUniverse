import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {benchmark} from '../app/run-identity-gates-benchmark.mjs';

// Synthetic directions in 512-d space stand for people.
const v=(k,noise=0)=>{const a=new Float32Array(512);a[k]=1;if(noise)a[(k+50)%512]=noise;let n=0;for(const x of a)n+=x*x;n=Math.sqrt(n);return Buffer.from(Float32Array.from(a,x=>x/n).buffer);};

test('gate benchmark: leave-one-out on references, linked one-face pictures and unknowns; counts wrong acceptances',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(id TEXT,name TEXT);CREATE TABLE character_ui(character_id TEXT,merged_into TEXT);
    CREATE TABLE canon(character_id TEXT,references_json TEXT);CREATE TABLE active_media(id TEXT,kind TEXT,relative_path TEXT);
    CREATE TABLE depictions(media_id TEXT,character_id TEXT);
    CREATE TABLE identity_faces(media_id TEXT,method TEXT,file_key TEXT,face_index INTEGER,box_json TEXT,det_score REAL,face_px INTEGER,embedding BLOB,created_at TEXT)`);
  const face=(mid,emb,i=0)=>db.prepare("INSERT INTO identity_faces VALUES(?,'m','k',?,?,0.9,100,?,'t')").run(mid,i,JSON.stringify({x:0.1+i*0.4,y:0.1,w:0.2,h:0.3}),emb);
  const media=(id,who=[])=>{db.prepare("INSERT INTO active_media VALUES(?,'image',?)").run(id,'chars/'+id+'.jpg');for(const c of who)db.prepare('INSERT INTO depictions VALUES(?,?)').run(id,c);};
  for(const [id,name] of [['a','Ádám'],['b','Béla'],['c','Csaba']])db.prepare('INSERT INTO characters VALUES(?,?)').run(id,name);
  // Ádám: three references (one is really Béla); Béla: two; Csaba: none.
  const refs={a:['ra1','ra2','ra3'],b:['rb1','rb2']};
  for(const [c,list] of Object.entries(refs)){db.prepare('INSERT INTO canon VALUES(?,?)').run(c,JSON.stringify(list.map(m=>({media_id:m,role:'face'}))));for(const m of list){media(m,[c]);face(m,m==='ra3'?v(2):v(c==='a'?1:2,0.1));}}
  media('p1',['a']);face('p1',v(1,0.2));media('p2',['b']);face('p2',v(2,0.2));media('p3',['c']);face('p3',v(3));
  media('p4',['a']);face('p4',v(2,0.2)); // linked to Ádám but shows Béla
  media('group',['a','b']);face('group',v(1),0);face('group',v(2),1); // two links: not in set B
  const r=benchmark(db,{method:'m',thresholds:[0.5],margins:[0.05]});
  assert.equal(r.references,5);assert.deepEqual(r.cases,{references:5,linked:3,unknown:1});
  const row=r.table[0];
  assert.equal(row.unknown.cases,1);assert.equal(row.unknown.accepted,0,'a face unlike every reference is not accepted');
  // Ádám's contaminated reference (Béla's face) makes every Béla-like face ambiguous: those abstain
  // instead of being accepted wrongly; only the clear Ádám picture is accepted.
  assert.deepEqual([row.linked.accepted,row.linked.wrong],[1,0]);
  assert.ok(row.references.wrong>=1,'the reference showing someone else is caught by leave-one-out');
  assert.ok(r.pairs.same.n>0&&r.pairs.different.n>0);
});
