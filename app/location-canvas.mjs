import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {normalizeCanvas,catalogueCanvas,copy,WORLD_ROOT} from './public/location-canvas-model.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const shape=(body,keys)=>{if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!keys.includes(k)))throw fail('Ismeretlen helyszínterv-mező.');};

// Design revisions deliberately live beside, not inside, the existing catalogue.
// Reading or installing this feature does not create files or run a migration.
export function installLocationCanvas({dataDir,editor,transaction}){
  const file=path.join(dataDir,'location-canvas.json'),seedFile=path.join(dataDir,'location-canvas-suggestions.json'),lockFile=path.join(dataDir,'location-canvas.lock');
  const csrf=randomBytes(32).toString('hex'),catalogueId=hash(path.resolve(dataDir)).slice(0,24);
  let queue=Promise.resolve();
  const exclusive=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  function catalogue(){return transaction(()=>{const result=editor.list();if(result.truncated)throw fail('A katalógus nagyobb a jelenlegi teljesfa-határnál. Csonkolt fát nem töltünk be.',409);const items=result.items.map(item=>{const current=editor.get(item.id);return{id:item.id,name:current.name,tag_id:current.tag_id,parent_id:current.parent_id,category:current.category,version:current.version,tag_only:current.tag_only};}).sort((a,b)=>a.id.localeCompare(b.id));return{items,version:hash(items)};});}
  async function readJson(target,optional=true){try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>128*1024*1024)throw fail('A helyszínterv tárolója nem biztonságos vagy túl nagy.',409);return JSON.parse(await fs.readFile(target,'utf8'));}catch(e){if(optional&&e.code==='ENOENT')return null;if(e.status)throw e;throw fail('A mentett helyszínterv nem olvasható. Nem írjuk felül.',409);}}
  async function read(){const value=await readJson(file);if(!value)return{schema:1,head:null,approved_head:null,revisions:[]};if(value.schema!==1||!Array.isArray(value.revisions)||value.revisions.length>300)throw fail('Ismeretlen helyszínterv-formátum.',409);
    let parent=null;const seen=new Set();for(const r of value.revisions){if(typeof r.id!=='string'||seen.has(r.id)||r.parent_id!==parent||!['draft','approved'].includes(r.kind)||r.actor!=='local-creator'||hash(normalizeCanvas(r.state))!==r.state_hash)throw fail('Sérült helyszínterv-előzmény. Nem írjuk felül.',409);seen.add(r.id);parent=r.id;}
    if(value.head!==parent||value.approved_head&&!value.revisions.some(r=>r.id===value.approved_head&&r.kind==='approved'))throw fail('A helyszínterv verziómutatója hibás.',409);return value;
  }
  async function initial(cat){const seed=await readJson(seedFile);return catalogueCanvas(cat.items,seed);}
  async function context(){await queue;const cat=catalogue(),disk=await read(),revision=disk.revisions.at(-1);return{csrf,catalogue_id:catalogueId,catalogue_version:cat.version,catalogue:cat.items,head:disk.head,approved_head:disk.approved_head,state:revision?.state||await initial(cat),history:disk.revisions.toReversed().map(({state,...meta})=>meta),saved:!!revision};}
  async function writeAtomic(value){const temporary=file+'.'+randomUUID()+'.tmp';let handle;try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;
    try{await fs.copyFile(file,path.join(dataDir,'location-canvas.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(temporary,file);
  }finally{await handle?.close();await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
  async function save(body,kind){return exclusive(async()=>{
    shape(body,['expected_head','catalogue_version','request_key','state','reason']);
    if(!(body.expected_head===null||typeof body.expected_head==='string')||typeof body.catalogue_version!=='string'||!/^[a-f0-9]{64}$/.test(body.catalogue_version)||typeof body.request_key!=='string'||!/^[a-f0-9-]{36}$/i.test(body.request_key)||typeof body.reason!=='string'||body.reason.length>1000||kind==='approved'&&!body.reason.trim())throw fail('Frissítsd az előnézetet, és adj meg megfelelő indoklást.');
    const state=normalizeCanvas(body.state),requestHash=hash({kind,...body,state});let lock;
    try{try{lock=await fs.open(lockFile,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail('A helyszínterv mentése már folyamatban van. Próbáld újra.',409);throw e;}
      const disk=await read(),receipt=disk.revisions.find(r=>r.request_key===body.request_key);
      if(receipt){if(receipt.request_hash!==requestHash)throw fail('Ez a műveleti azonosító már más változathoz tartozik.',409);return{head:receipt.id,approved_head:disk.approved_head,state:receipt.state,replayed:true};}
      const cat=catalogue();if(disk.head!==body.expected_head||cat.version!==body.catalogue_version)throw fail('A terv vagy a katalógus közben megváltozott. A saját piszkozatod megmaradt; friss összehasonlítás kell.',409);
      if(disk.revisions.length>=300)throw fail('A tervelőzmény elérte a megőrzési határt. Exportáld az előzményt; semmit nem töröltünk.',409);
      const prior=disk.revisions.at(-1)?.state,oldSources=new Map((prior?.nodes||[]).filter(n=>n.source_id).map(n=>[n.id,n.source_id])),catIds=new Set(cat.items.map(n=>n.id));
      for(const n of state.nodes)if(n.source_id&&!catIds.has(n.source_id)&&oldSources.get(n.id)!==n.source_id)throw fail('Ismeretlen forráscímke a tervben.');
      for(const [id,source]of oldSources)if(!state.nodes.some(n=>n.id===id&&n.source_id===source))throw fail('A régi forráshelyet archiváld vagy tedd félre; az azonosítóját nem töröljük.');
      const revision={id:randomUUID(),parent_id:disk.head,kind,actor:'local-creator',reason:body.reason.trim(),created_at:new Date().toISOString(),catalogue_version:cat.version,state_hash:hash(state),request_key:body.request_key,request_hash:requestHash,state};
      disk.revisions.push(revision);disk.head=revision.id;if(kind==='approved')disk.approved_head=revision.id;
      await writeAtomic(disk);return{head:disk.head,approved_head:disk.approved_head,state,revision:{...revision,state:undefined}};
    }finally{if(lock){await lock.close();await fs.unlink(lockFile);}}
  });}
  return{context,async handle({p,body,req,json}){
    if(!p.startsWith('/api/location-canvas'))return false;
    if(req.method==='GET'&&p==='/api/location-canvas'){json(await context());return true;}
    if(req.method==='GET'&&p==='/api/location-canvas/export'){await queue;json(await read());return true;}
    const revision=p.match(/^\/api\/location-canvas\/revisions\/([a-f0-9-]{36})$/i);
    if(req.method==='GET'&&revision){await queue;const item=(await read()).revisions.find(r=>r.id===revision[1]);if(!item)throw fail('A tervváltozat nem található.',404);json(copy(item));return true;}
    if(req.method!=='POST'||!['/api/location-canvas/draft','/api/location-canvas/approve'].includes(p))throw fail('Ismeretlen helyszínterv-művelet.',405);
    const supplied=req.headers['x-lu-location-csrf'];if(req.headers.origin!=='http://'+req.headers.host||typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(csrf)))throw fail('Nyisd meg újra a Locations oldalt a mentéshez.',403);
    json(await save(body,p.endsWith('/approve')?'approved':'draft'));return true;
  }};
}
