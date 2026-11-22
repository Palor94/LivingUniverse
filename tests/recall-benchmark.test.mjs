// Recall benchmark (2026-11-22, follow-up of E7): 200 memories of one character, 20 of them turning
// points about distinct topics hidden among 180 everyday ones. Measures what comes back when the
// moment mentions a topic, and what comes back unasked, against the old "newest 12" behaviour.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';

const TOPICS=[['Kata','Szakítottunk Katával a vasútállomáson.'],['esküvő','Az öcsém esküvőjén összevesztünk apával.'],['kórház','Anyát bevitték a kórházba, egész éjjel ott ültem.'],['kirúgtak','Kirúgtak a raktárból, mert késtem.'],['adósság','Sanyi adósságát én fizettem ki titokban.'],
  ['költözés','Költözést terveztem Debrecenbe, aztán lefújtam.'],['baleset','Balesetet láttam az autópályán, nem tudok aludni tőle.'],['lakás','Elvesztettem a lakást, a nagybácsinál lakom.'],['verseny','Megnyertem a horgászversenyt a Tiszán.'],['hazugság','Rájöttem Béla hazugságára a hétvégéről.'],
  ['temetés','Nagyapa temetésén nem sírtam, és ez bánt.'],['vizsga','Megbuktam a mestervizsgán.'],['kutya','Elütötték a kutyámat, Bundást.'],['örökség','Örökséget kaptam, de nem szóltam róla senkinek.'],['tetoválás','Részegen tetoválást csináltattam a hátamra.'],
  ['börze','Elvesztettem a megtakarításom a börzén.'],['testvér','A testvérem nem beszél velem két éve.'],['zenekar','Kiléptem a zenekarból egy veszekedés után.'],['műtét','Térdműtétem volt tavasszal.'],['levél','Kaptam egy névtelen levelet a postaládámba.']];
const ROUTINE=['Kávéztunk reggel a sarkon.','Bevásároltam a boltban.','Dolgoztam a műhelyben.','Néztem a meccset a kocsmában.','Főztem egy levest.','Sétáltam a parkban.','Beszélgettünk a szomszéddal.','Takarítottam otthon.','Elmentem futni.'];

test('recall benchmark: 200 memories, 20 turning points – topic recall@6 and unasked recall vs newest-12',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-bench-')),root=path.join(base,'media'),dataDir=path.join(base,'data');await fs.mkdir(root,{recursive:true});
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,worldProvider:createMockProvider(()=>({})),worldClock:()=>new Date('2026-11-12T10:00:00')});
  t.after(async()=>{await app.close();await fs.rm(base,{recursive:true,force:true});});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const a=await (await fetch('http://127.0.0.1:'+app.server.address().port+'/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Teszt Aladár',gender:'férfi'})})).json();
  const i=app.worldEngine.internals;
  // Turning points spread over the oldest 150 positions; the newest 50 are everyday only.
  let k=0;for(let n=0;n<200;n++){if(n<150&&n%7===3&&k<TOPICS.length){i.remember(a.id,TOPICS[k][1],'t-'+k,{importance:4+(k%2)});k++;}else i.remember(a.id,ROUTINE[n%ROUTINE.length].replace('.',` (${n}).`),'r-'+n,{importance:1+(n%2)});}
  assert.equal(k,20);
  const started=performance.now();let hits=0;
  for(const [word,text] of TOPICS){const got=i.recallMemories(a.id,{text:'Mi van a '+word+' ügyével?',limit:6});if(got.includes(text))hits++;}
  const ms=(performance.now()-started)/TOPICS.length;
  const unasked=i.recallMemories(a.id,{limit:12}).filter(x=>TOPICS.some(([,s])=>s===x)).length;
  const newest=app.db.prepare("SELECT text FROM character_memories WHERE character_id=? ORDER BY rowid DESC LIMIT 12").all(a.id).filter(r=>TOPICS.some(([,s])=>s===r.text)).length;
  console.log(`# recall benchmark: topic recall@6 ${hits}/20, unasked turning points in 12: ${unasked} (newest-12: ${newest}), ${ms.toFixed(1)} ms/recall`);
  assert.ok(hits>=18,'a mentioned topic brings its turning point back ('+hits+'/20)');
  assert.ok(unasked>=4&&unasked>newest,'turning points come back unasked ('+unasked+')');
  assert.ok(ms<250,'fast enough for every prompt ('+ms.toFixed(1)+' ms)');
});
