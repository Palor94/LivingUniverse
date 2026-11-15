// Bug report bundles (debugging package, 2026-11-13). "Hiba jelentése" saves everything needed to
// look into a problem later into one folder on this computer (outside OneDrive):
//   %LOCALAPPDATA%\LivingUniverse\diagnostics\hiba-<time>\
//     report.json   the owner's note, what the browser saw (state, steps, requests, errors,
//                   layout check) and the server side (doctor, errors, requests, AI calls and
//                   statistics, background jobs, data audit, connector)
//     universe.sqlite + location tree + character policy   only when asked (snapshot), made with
//                   SQLite's online backup, so the problem can be replayed in a sandbox
//     OLVASS-EL.txt what is inside and how to replay it
// The owner sends only the folder name. Nothing leaves the computer from here.
//
//   POST /api/dev/bug-report {note, snapshot, client}
//   GET  /api/dev/bug-reports
//   POST /api/dev/bug-reports/<name>/sandbox {confirm:true}   replay in a sandbox (real service only)
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';

export const REPORT_NAME=/^hiba-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d(?:-\d+)?$/;
const MAX_CLIENT=600_000;

// The real catalogue lives under %LOCALAPPDATA%\LivingUniverse: its reports go next to the doctor
// reports. Any other catalogue (tests, sandboxes, copies) keeps them in its own folder.
export function diagnosticsDir(dataDir){
  const home=process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'LivingUniverse'):null;
  // path.relative across drives returns an absolute path, which is "outside" too.
  const rel=home?path.relative(home,path.resolve(dataDir)):'';
  const inside=home&&!rel.startsWith('..')&&!path.isAbsolute(rel)&&!rel.includes('sandbox');
  return inside?path.join(home,'diagnostics'):path.join(dataDir,'diagnostics');
}

export async function snapshotCatalogue(dataDir,target){
  const source=new DatabaseSync(path.join(dataDir,'universe.sqlite'),{readOnly:true});
  try{await backup(source,path.join(target,'universe.sqlite'));}finally{source.close();}
  for(const f of ['location-canvas.json','location-canvas-suggestions.json','character-policy.json'])
    await fs.copyFile(path.join(dataDir,f),path.join(target,f)).catch(e=>{if(e.code!=='ENOENT')throw e;});
}

// Replay for the real service: a separate sandbox process on the first free port 4330–4339, on a
// copy of the report's database, read-only media and the mock AI (ops/sandbox.mjs). Detached, so
// it is not stopped with this process; it stops when its window/process is closed.
export function processSandboxLauncher({projectRoot,dir}){
  return async name=>{
    const {spawn}=await import('node:child_process');const net=await import('node:net');
    const free=port=>new Promise(ok=>{const s=net.createServer();s.once('error',()=>ok(false));s.listen(port,'127.0.0.1',()=>s.close(()=>ok(true)));});
    let port=null;for(let p=4330;p<=4339;p++)if(await free(p)){port=p;break;}
    if(!port)throw Object.assign(Error('No free sandbox port (4330–4339). Close a running sandbox and retry.'),{status:409});
    const child=spawn(process.execPath,[path.join(projectRoot,'ops','sandbox.mjs'),'--from-report',name,'--reports',dir,'--port',String(port)],{cwd:projectRoot,detached:true,stdio:'ignore',windowsHide:true});
    child.unref();
    return {started:true,port,url:'http://127.0.0.1:'+port};
  };
}

export function installBugReports({dataDir,fail,collect,dir=diagnosticsDir(dataDir),sandboxLauncher=()=>null,now=()=>new Date()}){
  async function create({note='',snapshot=false,client=null}={}){
    await fs.mkdir(dir,{recursive:true});
    // Local time (the owner's clock), same shape as before: YYYY-MM-DDTHH-MM-SS.
    const d=now(),p2=v=>String(v).padStart(2,'0'),stamp=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
    let name='hiba-'+stamp,target=path.join(dir,name);
    for(let i=2;;i++){try{await fs.mkdir(target);break;}catch(e){if(e.code!=='EEXIST')throw e;name='hiba-'+stamp+'-'+i;target=path.join(dir,name);}}
    let clientText=null;try{clientText=client?JSON.stringify(client):null;}catch{}
    if(clientText&&clientText.length>MAX_CLIENT)clientText=JSON.stringify({truncated:true,size:clientText.length});
    const server=await collect().catch(e=>({error:String(e.message||e)}));
    const report={name,created_at:now().toISOString(),note:String(note||'').slice(0,2000),snapshot:!!snapshot,client:clientText?JSON.parse(clientText):null,server};
    await fs.writeFile(path.join(target,'report.json'),JSON.stringify(report,null,1),{flag:'wx'});
    if(snapshot)await snapshotCatalogue(dataDir,target);
    await fs.writeFile(path.join(target,'OLVASS-EL.txt'),[
      'Living Universe hibajelentés: '+name,'',
      'Megjegyzés: '+(report.note||'(nincs)'),'',
      'report.json: a böngésző állapota, az utolsó lépések, kérések és hibák, valamint a szerver naplói.',
      snapshot?'universe.sqlite: az adatbázis másolata a hiba pillanatából (csak ezen a gépen).':'Adatbázis-másolat nem készült.','',
      snapshot?'Visszajátszás homokozóban (a valódi adatokat nem érinti):\n  npm run sandbox -- --from-report '+name:'',
    ].join('\r\n'),{flag:'wx'});
    return {name,folder:target,snapshot:!!snapshot};
  }

  async function list(){
    let names=[];try{names=(await fs.readdir(dir)).filter(n=>REPORT_NAME.test(n));}catch{return [];}
    const out=[];
    for(const name of names.sort().reverse().slice(0,50)){
      let note='',snapshot=false;
      try{const r=JSON.parse(await fs.readFile(path.join(dir,name,'report.json'),'utf8'));note=r.note;snapshot=r.snapshot;}catch{}
      out.push({name,note,snapshot});
    }
    return out;
  }

  async function handle({p,req,body,json}){
    if(p==='/api/dev/bug-report'&&req.method==='POST'){json(await create(body||{}),201);return true;}
    if(p==='/api/dev/bug-reports'&&req.method==='GET'){json({folder:dir,reports:await list()});return true;}
    const m=p.match(/^\/api\/dev\/bug-reports\/([^/]+)\/sandbox$/);
    if(m&&req.method==='POST'){
      let name;try{name=decodeURIComponent(m[1]);}catch{throw fail('Report not found.',404);}
      if(!REPORT_NAME.test(name))throw fail('Report not found.',404);
      if(body?.confirm!==true)throw fail('Confirm the repair.',400);
      try{await fs.access(path.join(dir,name,'universe.sqlite'));}catch{throw fail('Report not found.',404);}
      const launch=sandboxLauncher();
      if(!launch)throw fail('This copy of the program cannot start a sandbox.',409);
      json(await launch(name),202);return true;
    }
    return false;
  }
  return {create,list,handle,dir};
}
