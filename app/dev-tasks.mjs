import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {dimensions} from '../mcp/images.mjs';

// One shared, versioned document in the existing SQLite settings/backup system.
// This is creator development data; it never enters character prompts or canon.
export function installDevTasks({one,run,transaction,authenticate}){
  const key='development:tasks',csrf=randomBytes(32).toString('hex');
  const fail=(message,status=400,code='INVALID_ARGUMENT')=>{throw Object.assign(Error(message),{status,code});};
  const load=()=>{const row=one('SELECT value FROM application_settings WHERE key=?',key);return row?JSON.parse(row.value):{version:0,nodes:[],active_id:null,previous_ids:[],intents:[]};};
  const shape=(args,keys)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!keys.includes(key)))fail('Érvénytelen feladatmezők.');};
  const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail('A feladat szövege hiányzik vagy túl hosszú.');return value.trim();};
  const imageKey=id=>'development:task-image:'+id;
  function image(args){
    shape(args,['task_id','attachment_id']);const node=load().nodes.find(node=>node.id===args.task_id),meta=node?.attachments?.find(item=>item.id===args.attachment_id);
    if(!meta)fail('A képmelléklet nem található.',404,'NOT_FOUND');
    const row=one('SELECT value FROM application_settings WHERE key=?',imageKey(meta.id));if(!row)fail('A képmelléklet nem található.',404,'NOT_FOUND');
    const stored=JSON.parse(row.value);if(createHash('sha256').update(Buffer.from(stored.data,'base64')).digest('hex')!==meta.sha256)fail('A képmelléklet sérült.',409,'IMAGE_INTEGRITY');return {...meta,data:stored.data};
  }
  function view(state=load()){
    const children=new Map();for(const node of state.nodes){const list=children.get(node.parent_id)||[];list.push(node);children.set(node.parent_id,list);}
    const branch=parent=>(children.get(parent)||[]).map(node=>{const nested=branch(node.id),done=nested.length?nested.every(child=>child.done):node.done,partial=nested.some(child=>child.done||child.partial)&&!done;return {...node,done,partial,children:nested};});
    const tree=branch(null),find=id=>state.nodes.find(node=>node.id===id)||null;
    return {version:state.version,tree,active_task:find(state.active_id),previous_tasks:state.previous_ids.map(find).filter(node=>node&&!node.done),csrf};
  }
  function apply(operation,args){
    if(operation==='image')return image(args);
    if(operation==='read'||operation==='active'||operation==='capabilities'){shape(args,[]);return operation==='capabilities'?{enabled:true,version:1}:operation==='active'?{active_task:view().active_task,previous_tasks:view().previous_tasks}:view();}
    const allowed={attach:['task_id','name','mime_type','data'],remove_attachment:['task_id','attachment_id'],create:['parent_id','text','note','index'],update:['task_id','text','note','done'],move:['task_id','parent_id','index'],delete:['task_id'],set_active:['task_id']};if(!allowed[operation])fail('Ismeretlen feladatművelet.');shape(args,['request_key','expected_version',...allowed[operation]]);
    if(typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(args.request_key)||!Number.isSafeInteger(args.expected_version)||args.expected_version<0)fail('Kérésazonosító és a fa aktuális verziója szükséges.');
    const fingerprint=createHash('sha256').update(JSON.stringify([operation,args])).digest('hex');
    return transaction(()=>{const state=load(),prior=state.intents.find(item=>item.key===args.request_key);if(prior){if(prior.hash!==fingerprint)fail('Ez a kérésazonosító másik művelethez tartozik.',409,'IDEMPOTENCY_CONFLICT');return {...view(state),changed_task_id:prior.task_id};}if(state.version!==args.expected_version)fail('Közben más is módosította a feladatokat. Frissítsd a listát, majd próbáld újra.',409,'STALE_TASKS');
      const find=id=>{const node=state.nodes.find(node=>node.id===id);if(!node)fail('A feladat nem található.',404,'NOT_FOUND');return node;};
      const descendants=id=>{const ids=new Set([id]);for(let changed=true;changed;){changed=false;for(const node of state.nodes)if(ids.has(node.parent_id)&&!ids.has(node.id)){ids.add(node.id);changed=true;}}return ids;};
      const parent=id=>{if(id!==null)find(id);};
      let changedId=args.task_id||null;
      if(operation==='attach'){
        const node=find(args.task_id);if((node.attachments||[]).length>=12)fail('Egy feladathoz legfeljebb 12 kép csatolható.');
        if(!['image/png','image/jpeg'].includes(args.mime_type)||typeof args.data!=='string'||args.data.length>5592408||!args.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(args.data))fail('PNG vagy JPEG kép szükséges, legfeljebb 4 MiB méretben.');
        const bytes=Buffer.from(args.data,'base64');if(bytes.length>4*1024*1024||bytes.toString('base64')!==args.data)fail('Érvénytelen vagy túl nagy kép.');
        let size;try{size=dimensions(bytes);}catch{fail('Érvénytelen kép.');}
        if(!(size.width>0&&size.height>0)||size.width*size.height>40000000||!(args.mime_type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216))fail('Érvénytelen képformátum vagy túl nagy képméret.');
        const total=one("SELECT COALESCE(SUM(length(value)),0) n FROM application_settings WHERE key LIKE 'development:task-image:%'").n;if(total+args.data.length>24*1024*1024)fail('A feladatok képtára megtelt (18 MiB). Távolíts el felesleges mellékleteket.');
        const meta={id:randomUUID(),name:text(args.name||'screenshot.png',180,true),mime_type:args.mime_type,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...size,created_at:new Date().toISOString()};
        run('INSERT INTO application_settings(key,value) VALUES(?,?)',imageKey(meta.id),JSON.stringify({data:args.data}));node.attachments=[...(node.attachments||[]),meta];
      }else if(operation==='remove_attachment'){
        const node=find(args.task_id);if(!node.attachments?.some(item=>item.id===args.attachment_id))fail('A képmelléklet nem található.',404,'NOT_FOUND');node.attachments=node.attachments.filter(item=>item.id!==args.attachment_id);run('DELETE FROM application_settings WHERE key=?',imageKey(args.attachment_id));
      }else if(operation==='create'){
        const parentId=args.parent_id??null;parent(parentId);if(state.nodes.length>=1000)fail('Legfeljebb ezer feladat tárolható.');changedId=randomUUID();state.nodes.push({id:changedId,parent_id:parentId,text:text(args.text,300,true),note:text(args.note??'',2000),done:false});
      }else if(operation==='update'){
        const node=find(args.task_id);if(args.text!==undefined)node.text=text(args.text,300,true);if(args.note!==undefined)node.note=text(args.note,2000);if(args.done!==undefined){if(typeof args.done!=='boolean')fail('A kész állapot csak igen vagy nem lehet.');const ids=descendants(node.id);for(const item of state.nodes)if(ids.has(item.id))item.done=args.done;}
      }else if(operation==='move'){
        const node=find(args.task_id);if(args.parent_id===undefined)fail('Válaszd ki a célágat.');parent(args.parent_id);if(descendants(node.id).has(args.parent_id))fail('A feladat nem helyezhető saját maga alá.',409,'TASK_CYCLE');node.parent_id=args.parent_id;
      }else if(operation==='delete'){
        for(const node of state.nodes.filter(node=>descendants(args.task_id).has(node.id)))for(const item of node.attachments||[])run('DELETE FROM application_settings WHERE key=?',imageKey(item.id));
        find(args.task_id);const ids=descendants(args.task_id);state.nodes=state.nodes.filter(node=>!ids.has(node.id));if(ids.has(state.active_id))state.active_id=null;state.previous_ids=state.previous_ids.filter(id=>!ids.has(id));
      }else{
        if(args.task_id!==null){find(args.task_id);state.previous_ids=state.previous_ids.filter(id=>id!==args.task_id);}if(state.active_id&&state.active_id!==args.task_id)state.previous_ids=[state.active_id,...state.previous_ids.filter(id=>id!==state.active_id)].slice(0,30);state.active_id=args.task_id;
      }
      if(operation==='move'||operation==='create'){
        const node=find(changedId),siblings=state.nodes.filter(item=>item.parent_id===node.parent_id&&item.id!==node.id),index=args.index??siblings.length;if(!Number.isInteger(index)||index<0||index>siblings.length)fail('Érvénytelen sorrendi hely.');state.nodes=state.nodes.filter(item=>item.id!==node.id);const before=siblings[index];state.nodes.splice(before?state.nodes.findIndex(item=>item.id===before.id):state.nodes.length,0,node);
      }
      for(const node of state.nodes){let depth=0,current=node;while(current.parent_id!==null){current=find(current.parent_id);if(++depth>32)fail('Legfeljebb 32 szintű feladatfa használható.');}}
      // Keep stored branch status consistent with the checkbox aggregate.
      const normalize=nodes=>{for(const node of nodes){normalize(node.children);find(node.id).done=node.done;}};normalize(view(state).tree);
      if(state.active_id&&find(state.active_id).done)state.active_id=null;state.previous_ids=state.previous_ids.filter(id=>!find(id).done);state.version++;state.intents=[...state.intents,{key:args.request_key,hash:fingerprint,task_id:changedId}].slice(-100);
      if(Buffer.byteLength(JSON.stringify(state))>350000)fail('A feladatlista túl nagy; rövidítsd a jegyzeteket.');run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(state));return {...view(state),changed_task_id:changedId};
    });
  }
  async function handle({p,req,res,body,json}){
    const match=p.match(/^\/api\/dev-tasks\/([^/]+)\/images\/([^/]+)$/);
    if(match&&req.method==='GET'){try{const value=image({task_id:match[1],attachment_id:match[2]});res.writeHead(200,{'Content-Type':value.mime_type,'Content-Length':value.bytes,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(value.data,'base64'));}catch(error){json({error:error.message},error.status||500);}return true;}
    if(!['/api/dev-tasks','/api/mcp-tasks'].includes(p))return false;
    try{if(p==='/api/mcp-tasks'){authenticate(req.headers.authorization);if(req.method!=='POST')fail('POST művelet szükséges.',405);shape(body,['operation','arguments']);const result=apply(body.operation,body.arguments);delete result.csrf;json(result);return true;}
      if(req.method==='GET'){json(view());return true;}const token=req.headers['x-lu-tasks-csrf'];if(req.method!=='POST'||req.headers.origin!=='http://'+req.headers.host||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(csrf)))fail('Frissítsd a feladatlistát a módosítás előtt.',403,'FORBIDDEN');shape(body,['operation','arguments']);json(apply(body.operation,body.arguments));return true;
    }catch(error){json({code:error.code||'TASKS_UNAVAILABLE',error:error.status?error.message:'A feladatlista nem érhető el.'},error.status||500);return true;}
  }
  return {view,apply,handle};
}
