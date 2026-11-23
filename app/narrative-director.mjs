// Free-text scenes replace the fixed A-D graph in normal Play; old definitions stay archived.
// A run freezes existing cast/place identities. Presentation may propose facts, never commit canon.
import {randomUUID,createHash} from 'node:crypto';
const clean=(v,n=1800)=>String(v??'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b-\u001f]/g,'').trim().slice(0,n);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function installNarrativeDirector({db,one,all,run,transaction,ask,context,policy,now=()=>new Date(),onFinish=()=>null}){
  db.exec(`CREATE TABLE IF NOT EXISTS narrative_runs(id TEXT PRIMARY KEY,story_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,context_json TEXT NOT NULL,state_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,rewound_at TEXT);
    CREATE TABLE IF NOT EXISTS narrative_turns(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES narrative_runs(id),request_key TEXT NOT NULL UNIQUE,input_hash TEXT NOT NULL,expected_version INTEGER NOT NULL,input_text TEXT NOT NULL,output_json TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,rewound_at TEXT)`);
  const active=new Set(),iso=()=>now().toISOString(),fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
  const row=id=>one('SELECT * FROM narrative_runs WHERE id=? AND rewound_at IS NULL',id);
  function view(id){const r=row(id);if(!r)fail('A jelenet nem elérhető.',404);return {id:r.id,version:r.version,status:r.status,context:JSON.parse(r.context_json),state:JSON.parse(r.state_json),turns:all("SELECT id,input_text,output_json,status FROM narrative_turns WHERE run_id=? AND rewound_at IS NULL ORDER BY rowid",id).map(({output_json,...t})=>({...t,output:output_json?JSON.parse(output_json):null}))};}
  // soFar (owner, 2026-11-22): a written A–D story the player left with a free answer; the scene
  // continues from what already happened in it.
  // The written blocks still ahead of the player in an A–D story (reachable from `from`, not yet
  // visited): the free scene may lead back to one of them (owner, 2026-11-22).
  function aheadOf(story,path){
    const seen=new Set(path),out=[],queue=[...(story.nodes[path.at(-1)]?.choices||[]).map(c=>c.to)];
    while(queue.length&&out.length<30){const id=queue.shift();if(seen.has(id)||!story.nodes[id])continue;seen.add(id);const n=story.nodes[id];
      out.push({id,text:clean(n.text,220),...(n.ending?{ending:n.ending}:{})});for(const c of n.choices||[])queue.push(c.to);}
    return out;
  }
  // A free answer in a written story: does it fit one of the written choices or a later block?
  // Returns {node,bridge} to continue on the written path, or null for a free scene.
  async function matchWritten({story,path,text}){
    const here=story.nodes[path.at(-1)];if(!here||here.ending)return null;
    const ahead=aheadOf(story,path);if(!ahead.length)return null;
    const system='Egy megírt, elágazó (A–D) történet jelenetvezetője vagy. A játékos a felkínált választások helyett saját választ írt Palor nevében. Döntsd el, hogy ez a válasz lényegében megfelel-e valamelyik felkínált választásnak, vagy természetesen elvezethet-e egy későbbi megírt blokk helyzetéhez. Ha igen, add meg annak a blokknak az azonosítóját a "node" mezőben, és a "bridge" mezőben 1-3 mondatban írd le, hogyan vezet Palor saját cselekvése oda (csak a meglévő, felnőtt férfi alakokkal; új tényt ne találj ki; Palor érzéseit és beleegyezését ne írd hozzá). Ha a válasz egészen más irányba visz, "node" legyen null. JSON: {"node":"blokkazonosító vagy null","bridge":"átvezetés"}';
    const user=JSON.stringify({title:story.title,current:{text:clean(here.text,1200),choices:(here.choices||[]).map(c=>({to:c.to,text:c.text}))},ahead,player:clean(text,2000)});
    const out=await ask(system,user,300);if(!out||out.__truncated)return null;
    const node=typeof out.node==='string'&&ahead.some(a=>a.id===out.node)?out.node:null;if(!node)return null;
    const bridge=clean(out.bridge,600);policy?.assertPrompt?.(bridge);return {node,bridge};
  }
  function start({id,story,worldDay,soFar=null,path=null}){
    // A written story continued with a free answer plays in the story's own scene: the characters
    // at Palor's current place are not in it (owner, 2026-11-23).
    const now0=context(),c=soFar?{...now0,place:'',cast:[],story_scene:true}:now0,opening=[c.place?`Itt vagy: ${c.place}.`:'Útközben vagy.',...c.cast.map(p=>`${p.name}: ${p.activity||'itt van'}.`)].join(' ');
    const state={narration:opening,replies:[],options:[],stakes:'',finished:false};
    run('INSERT INTO narrative_runs VALUES(?,?,1,?,?,?,?,?,NULL)',id,story.id,'open',JSON.stringify({...c,day:worldDay||c.day,theme:clean(story.summary||story.title,300),...(soFar?{story_so_far:clean(soFar,5000)}:{}),...(soFar&&path?{story_nodes:aheadOf(story,path)}:{})}),JSON.stringify(state),iso(),iso());
    return {run_id:id,story:{...story,mode:'narrative',opening,narrative:view(id)}};
  }
  async function turn(id,body){
    const text=clean(body.text,2000),key=body.request_key;if(!text||typeof key!=='string'||key.length<8||key.length>160||!Number.isInteger(body.expected_version))fail('Szöveg, kérésazonosító és jelenetverzió szükséges.',400);
    const fingerprint=hash({id,text,version:body.expected_version}),prior=one('SELECT * FROM narrative_turns WHERE request_key=?',key);
    if(prior){if(prior.input_hash!==fingerprint)fail('A kérésazonosító már másik válaszhoz tartozik.');if(prior.status==='done')return view(id);fail('A korábbi hívás eredménye bizonytalan; nem ismételjük meg automatikusan.');}
    if(active.has(id))fail('A jelenet még válaszol.');
    const r=row(id);if(!r||r.status!=='open'||r.version!==body.expected_version)fail('A jelenet közben megváltozott.');
    const turns=all("SELECT * FROM narrative_turns WHERE run_id=? AND rewound_at IS NULL ORDER BY rowid",id);if(turns.length>=24)fail('Ez a jelenet elérte a 24 fordulós keretet. Zárd le.');
    if(turns.some(t=>['pending','uncertain'].includes(t.status)))fail('A jelenetben bizonytalan kimenetelű hívás van; zárd le, nem indítunk folytatást vagy újrapróbálást.');
    const c=JSON.parse(r.context_json),current=context();if(c.location_id!==current.location_id||c.cast.some(p=>!current.cast.some(x=>x.id===p.id)))fail('Közben megváltozott a jelenet helyszíne vagy résztvevőinek jelenléte.');
    if(c.cast.some(p=>!one('SELECT 1 FROM characters WHERE id=?',p.id)))fail('A jelenet egyik résztvevője már nem elérhető.');
    policy?.assertPrompt?.(text);
    const attempt=randomUUID();run("INSERT INTO narrative_turns VALUES(?,?,?,?,?,?,NULL,'pending',?,NULL)",attempt,id,key,fingerprint,r.version,text,iso());active.add(id);
    try{
      const system='Szabad szöveges, tartós történet jelenetvezetője vagy. Csak a megadott létező szereplők szólalhatnak meg, mind férfi és felnőtt; új szereplőt, múltbeli tényt, rokont vagy jóváhagyott külsőt nem találhatsz ki. Palor szavait, döntéseit, érzéseit és beleegyezését kizárólag a játékos adja. A helyzet tétje és következménye a tényleges eddigi mondatokból nőjön ki; ne kényszeríts romantikát. A témacím csak archivált inspiráció, nem megtörtént esemény; de ha a context story_so_far mezőt tartalmaz, az a jelenet eddig megtörtént része, és a jelenet a sztori SAJÁT helyszínén játszódik, nem Palor aktuális tartózkodási helyén; a cast ilyenkor üres, a játék más szereplői NINCSENEK jelen, ne is említsd őket; a sztori idegenei a narration-ben szólalnak meg, idézőjelben: abból folytasd, ugyanazokkal a (felnőtt férfi) alakokkal és ugyanazon a helyen, és a megnevezett idegen alakok is megszólalhatnak. Ha a context story_nodes listát is tartalmaz (a még előtte álló megírt blokkok), próbáld a játékos korábbi felkínált lehetőségeit és ezeket a blokkokat felhasználni: amint a sztori engedi, és a jelenet természetesen eljut az egyik blokk helyzetéhez, a narration vezesse oda, és a "rejoin" mezőben add meg annak azonosítóját (különben null), hogy a megírt csapáson folytatódhasson. A játékos bármilyen saját megoldást választhat; nincs A/B gráf. Ne utasítsd a programot adatbázis- vagy canonmódosításra. JSON: {"narration":"rövid látható jelenetleírás","replies":[{"character_id":"csak a résztvevő ID-ja","text":"saját megszólalás"}],"stakes":"mi a jelenetben még nyitott tét, ne új tény legyen","options":["három eltérő történeti továbbhaladás Palor szemszögéből"],"finished":false,"proposed_facts":[]}';
      const user=JSON.stringify({context:c,state:JSON.parse(r.state_json),history:turns.filter(t=>t.status==='done').slice(-6).map(t=>({player:t.input_text,response:JSON.parse(t.output_json)})),player:text});
      const out=await ask(system,user,900);if(!out||out.__truncated)fail('A válasz hiányos; a hívást nem ismételjük automatikusan.');
      const replies=(Array.isArray(out.replies)?out.replies:[]).filter(x=>c.cast.some(p=>p.id===x?.character_id)).slice(0,3).map(x=>({character_id:x.character_id,text:clean(x.text,700)})).filter(x=>x.text);
      const result={narration:clean(out.narration),replies,stakes:clean(out.stakes,300),options:[...new Set((Array.isArray(out.options)?out.options:[]).map(x=>clean(x,180)).filter(Boolean))].slice(0,3),rejoin:typeof out.rejoin==='string'&&(c.story_nodes||[]).some(x=>x.id===out.rejoin)?out.rejoin:null,finished:out.finished===true,proposed_facts:(Array.isArray(out.proposed_facts)?out.proposed_facts:[]).slice(0,6)};
      if(!result.narration&&!replies.length)fail('Nincs használható jelenetválasz.');policy?.assertPrompt?.([result.narration,...replies.map(x=>x.text),...result.options].join('\n'));
      transaction(()=>{
        if(row(id)?.version!==r.version||context().location_id!==c.location_id)fail('A jelenet közben megváltozott.');
        run("UPDATE narrative_turns SET output_json=?,status='done' WHERE id=?",JSON.stringify(result),attempt);
        run('UPDATE narrative_runs SET version=version+1,state_json=?,updated_at=? WHERE id=?',JSON.stringify(result),iso(),id);
      });return view(id);
    }catch(e){run("UPDATE narrative_turns SET status='uncertain' WHERE id=? AND status='pending'",attempt);throw e;}finally{active.delete(id);}
  }
  // resume: the scene led back to the written A–D story, so the story run itself goes on.
  function finish(id,version,{resume=false}={}){if(active.has(id))fail('A jelenet még válaszol.');return transaction(()=>{const r=row(id);if(!r)fail('A jelenet nem elérhető.',404);if(r.status==='finished')return view(id);if(r.version!==version)fail('A jelenet közben megváltozott.');run("UPDATE narrative_runs SET status='finished',version=version+1,updated_at=? WHERE id=?",iso(),id);if(!resume)run("UPDATE play_story_runs SET finished_at=?,ending_kind='narrative',path_json='[]' WHERE id=? AND finished_at IS NULL",iso(),id);onFinish(view(id));return view(id);});}
  function rewindAfter(time,at){const runs=all('SELECT id FROM narrative_runs WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id),turns=all('SELECT id FROM narrative_turns WHERE rewound_at IS NULL AND created_at>?',time).map(r=>r.id),states=[];
    for(const id of runs)run('UPDATE narrative_runs SET rewound_at=? WHERE id=?',at,id);
    for(const id of turns)run('UPDATE narrative_turns SET rewound_at=? WHERE id=?',at,id);
    for(const r of all('SELECT * FROM narrative_runs WHERE rewound_at IS NULL')){if(!turns.some(id=>one('SELECT 1 FROM narrative_turns WHERE id=? AND run_id=?',id,r.id))&&r.updated_at<=time)continue;states.push(r);const last=one("SELECT expected_version,output_json FROM narrative_turns WHERE run_id=? AND status='done' AND rewound_at IS NULL ORDER BY rowid DESC LIMIT 1",r.id);run("UPDATE narrative_runs SET version=?,status='open',state_json=?,updated_at=? WHERE id=?",last?last.expected_version+1:1,last?.output_json||JSON.stringify({narration:'',options:[],replies:[]}),time,r.id);}
    return {runs,turns,states};}
  function undoRewind(p){for(const id of p.runs||[])run('UPDATE narrative_runs SET rewound_at=NULL WHERE id=?',id);for(const id of p.turns||[])run('UPDATE narrative_turns SET rewound_at=NULL WHERE id=?',id);for(const r of p.states||[])run('UPDATE narrative_runs SET version=?,status=?,state_json=?,updated_at=? WHERE id=?',r.version,r.status,r.state_json,r.updated_at,r.id);}
  async function handle({p,m,body,json}){const x=p.match(/^\/api\/play\/narratives\/([a-f0-9-]{36})(?:\/(turn|finish))?$/);if(!x)return false;if(m==='GET'&&!x[2]){json(view(x[1]));return true;}if(m==='POST'&&x[2]==='turn'){json(await turn(x[1],body));return true;}if(m==='POST'&&x[2]==='finish'){json(finish(x[1],body.expected_version,{resume:body.resume===true&&!!JSON.parse(row(x[1])?.state_json||'{}').rejoin}));return true;}return false;}
  return {start,turn,finish,view,handle,rewindAfter,undoRewind,matchWritten,isBusy:()=>active.size>0};
}
