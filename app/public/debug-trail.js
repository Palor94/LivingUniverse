// Debug trail (debugging package, 2026-11-13): what the user did just before something broke.
// Kept in the browser only (sessionStorage, survives a reload) and sent to the server only with
// an error report or an explicit "Hiba jelentése". Recorded:
//  - clicks on buttons, links, tabs and checkboxes: their label (aria-label, title or the first
//    40 characters of their text), never what was typed into a field;
//  - view changes (noted by the screens), API requests (method, path without the query string,
//    status, time, request id) and browser errors.
// Screens can register a context function (the Play screen: view, place, open talk) that the
// F9 panel and the bug report read.
// B7: explicitly started task measurements persist counters across reload. On Finish only
// preset task/surface, UUID, click count and elapsed ms go to the local diagnostic log.
const KEY='lu-trail-v1',MAX_STEPS=60,MAX_API=40,MAX_ERRORS=20;
const now=()=>new Date().toISOString();
const short=(s,n=40)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);

function load(){try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');return Array.isArray(v?.steps)?v:{steps:[],api:[],errors:[]};}catch{return {steps:[],api:[],errors:[]};}}

export function createTrail({storage=true,clock=()=>Date.now(),makeId=()=>crypto.randomUUID()}={}){
  const data=storage?load():{steps:[],api:[],errors:[]};
  const inflight=new Map(),contexts=new Map();let saveTimer=null,seq=0;
  const save=()=>{if(!storage)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{sessionStorage.setItem(KEY,JSON.stringify(data));}catch{}},200);};
  const push=(list,item,max)=>{list.push(item);if(list.length>max)list.splice(0,list.length-max);save();};
  const persistTask=()=>{if(storage)try{sessionStorage.setItem(KEY,JSON.stringify(data));}catch{}};
  const countClick=()=>{if(data.task){data.task.clicks++;persistTask();}};
  data.measurements=Array.isArray(data.measurements)?data.measurements.slice(-20):[];
  const trail={
    note(kind,text,{measure=true}={}){if(kind==='click'&&measure)countClick();push(data.steps,{at:now(),kind,text:short(text,120)},MAX_STEPS);},
    countClick,
    startTask(task,surface='desktop'){
      if(data.task||!['talk','background','other'].includes(task)||!['desktop','phone'].includes(surface))return false;
      data.task={id:makeId(),task,surface,started:clock(),clicks:0};persistTask();return true;
    },
    activeTask:()=>data.task?{...data.task,ms:Math.max(0,clock()-data.task.started)}:null,
    finishTask(){
      if(!data.task)return null;
      const {started,...task}=data.task,result={...task,ms:Math.max(0,Math.round(clock()-started))};
      data.task=null;data.measurements.push(result);data.measurements=data.measurements.slice(-20);persistTask();return {...result};
    },
    cancelTask(){data.task=null;persistTask();},
    measurements:()=>data.measurements.map(m=>({...m})),
    taskSaved(id){const m=data.measurements.find(m=>m.id===id);if(m){m.saved=true;persistTask();}},
    error(message,where=''){push(data.errors,{at:now(),message:short(message,300),where:short(where,120)},MAX_ERRORS);trail.note('error',message);},
    apiStart(method,route){const id=++seq;inflight.set(id,{method,route,started:performance.now(),at:now()});return id;},
    apiEnd(id,status,requestId){const r=inflight.get(id);if(!r)return;inflight.delete(id);
      push(data.api,{at:r.at,method:r.method,route:r.route,status,ms:Math.round(performance.now()-r.started),request_id:requestId||null},MAX_API);
      if(status>=400||status===0)trail.note('api',`${r.method} ${r.route} → ${status||'hálózati hiba'}${requestId?' #'+requestId:''}`);},
    steps:(n=20)=>data.steps.slice(-n),
    api:(n=10)=>data.api.slice(-n),
    errors:(n=10)=>data.errors.slice(-n),
    inflight:()=>[...inflight.values()].map(r=>({method:r.method,route:r.route,ms:Math.round(performance.now()-r.started)})),
    setContext(name,fn){contexts.set(name,fn);},
    context(){const out={};for(const [k,fn] of contexts){try{out[k]=fn();}catch(e){out[k]={error:String(e.message||e)};}}return out;},
    clear(){data.steps=[];data.api=[];data.errors=[];save();},
  };
  return trail;
}

// The label of a clicked control, or null when the click was not on one.
export function controlLabel(el){
  const c=el?.closest?.('button,a,[role="button"],[role="tab"],summary,label,input[type="checkbox"],input[type="radio"],select,[data-trail]');
  if(!c)return null;
  const label=c.dataset?.trail||c.getAttribute('aria-label')||c.getAttribute('title')||(c.tagName==='SELECT'||c.tagName==='INPUT'?'':c.textContent);
  const id=c.id?'#'+c.id:'';
  return short((label?short(label):'')+(id?' '+id:''),80)||c.tagName.toLowerCase();
}

// One trail per page: wraps fetch (API requests only) and listens to clicks and errors.
export function installTrail(){
  if(window.__luTrail)return window.__luTrail;
  const trail=createTrail();window.__luTrail=trail;
  const original=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    let path='';try{path=new URL(url,location.href).pathname;}catch{}
    if(!path.startsWith('/api/')||path==='/api/dev/client-error')return original(input,init);
    const id=trail.apiStart(String(init.method||'GET').toUpperCase(),path);
    try{const r=await original(input,init);trail.apiEnd(id,r.status,r.headers.get('x-request-id'));return r;}
    catch(e){trail.apiEnd(id,0,null);throw e;}
  };
  document.addEventListener('click',e=>{const label=controlLabel(e.target),measure=!e.target?.closest?.('.pdbg');if(label)trail.note('click',label,{measure});else if(measure)trail.countClick();},true);
  window.addEventListener('hashchange',()=>trail.note('view',location.hash||'/'));
  window.addEventListener('error',e=>trail.error(e.message,e.filename?String(e.filename).split('/').pop()+':'+e.lineno:''));
  window.addEventListener('unhandledrejection',e=>{const r=e.reason;if(r?.status)return;trail.error(r?.message||String(r));});
  trail.note('view','betöltés '+location.pathname+location.hash);
  return trail;
}
