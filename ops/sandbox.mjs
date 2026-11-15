#!/usr/bin/env node
// Sandbox (2026-11-12): the real program on a fresh copy of the live catalogue, for trying and
// debugging changes without touching the owner's data. One command instead of assembling it by
// hand each time.
//
//   npm run sandbox [-- --port 4327] [--empty-media] [--keep]
//   npm run sandbox -- --from-report hiba-2026-11-13T12-00-00   replay a bug report's database
//   npm run sandbox -- --seed 42     fixed randomness: the same encounters and stories each time
//
// --from-report (debugging package, 2026-11-13) copies the database saved with "Hiba jelentése"
// (diagnostics folder, or --reports <folder>) instead of the live one.
// --seed makes Play's random choices (road encounters, stories) repeatable, so a problem that
// depends on them can be reproduced step by step.
//
// - The catalogue is copied with SQLite's online backup API (safe while the program runs) into
//   %LOCALAPPDATA%\LivingUniverse\sandbox\<time>\ together with the location tree and the
//   character policy. Keys, mobile, MCP, Grok gateway and image generation configs are NOT copied:
//   no paid call, no upload, no MCP write can happen from the sandbox. Play talk uses a mock AI.
// - Media: by default the real media folder, READ ONLY: every request that could change a file
//   is refused (only GET, and writes to an allowlist of database-only routes, pass). With
//   --empty-media an empty folder is used instead and every action is allowed.
// - No watchers, world-engine scheduler or automatic snapshots run. The copy is deleted when
//   the sandbox stops, unless --keep is given.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {createApp,resolveDataDir} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {resourceRoot} from '../app/storage-layout.mjs';
import {REPORT_NAME,diagnosticsDir} from '../app/bug-report.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const flag=name=>process.argv.includes('--'+name);

// Writes that only change the database copy (never a media file). Everything else that is not
// a GET is refused while the real media folder is attached.
export const DB_ONLY_WRITES=[/^\/api\/play\//,/^\/api\/world-engine\//,/^\/api\/dev\//,/^\/api\/quick-tag\/sync$/,/^\/api\/workshop\/ideas\/note$/,/^\/api\/tidy\/collection-folder$/];
export function readOnlyGuard(handler,{allow=DB_ONLY_WRITES}={}){
  return (req,res)=>{
    const route=String(req.url||'').split('?')[0];
    if(['GET','HEAD','OPTIONS'].includes(req.method)||allow.some(r=>r.test(route)))return handler(req,res);
    req.resume();
    res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'Homokozó: ez a művelet a valódi médiafájlokat érinthetné, ezért itt tiltott. Indítsd --empty-media kapcsolóval, ha ki akarod próbálni.'}));
  };
}

export async function copyCatalogue({liveDir,target}){
  await fs.mkdir(target,{recursive:true});
  const source=new DatabaseSync(path.join(liveDir,'universe.sqlite'),{readOnly:true});
  try{await backup(source,path.join(target,'universe.sqlite'));}finally{source.close();}
  for(const f of ['location-canvas.json','location-canvas-suggestions.json','character-policy.json'])
    await fs.copyFile(path.join(liveDir,f),path.join(target,f)).catch(e=>{if(e.code!=='ENOENT')throw e;});
}

// A small seeded generator (mulberry32): the same seed gives the same sequence in [0,1).
export function seededRandom(seed){
  let a=(Number(seed)>>>0)||1;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

// Deletes one sandbox copy, only inside a "sandbox" folder (never anything else by mistake).
export async function removeCopy(dir,{retries=10}={}){
  if(path.basename(path.dirname(path.resolve(dir)))!=='sandbox')throw Error('Not a sandbox copy: '+dir);
  try{await fs.rm(dir,{recursive:true,force:true,maxRetries:retries,retryDelay:200});return true;}
  catch(e){if(retries)console.error(`The copy could not be deleted (${e.code||e.message}); the next start removes it.`);return false;}
}

async function main(){
  const port=Number(arg('port',4327));
  const report=arg('from-report',null);
  if(report&&!REPORT_NAME.test(report))throw Error('Unknown report name: '+report);
  const liveDir=report?path.join(arg('reports',diagnosticsDir(resolveDataDir())),report):resolveDataDir();
  await fs.access(path.join(liveDir,'universe.sqlite'));
  const base=path.join(process.env.LOCALAPPDATA||path.dirname(liveDir),'LivingUniverse','sandbox');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const dataDir=path.join(base,stamp);
  // A sandbox that was killed (closed window, stopped preview) cannot delete its copy. Here only
  // the two newest earlier copies stay, and none older than a day; a copy still in use is
  // locked by its process, and that rm fails harmlessly.
  const earlier=(await fs.readdir(base).catch(()=>[])).filter(n=>/^\d{4}-\d\d-\d\dT/.test(n)).sort().reverse();
  for(const [i,old] of earlier.entries()){
    const dir=path.join(base,old);const st=await fs.stat(dir).catch(()=>null);
    if(st?.isDirectory()&&(i>=2||Date.now()-st.mtimeMs>24*3600e3))await removeCopy(dir,{retries:0});
  }
  process.stdout.write('Copying the catalogue… ');
  await copyCatalogue({liveDir,target:dataDir});console.log('done.');
  const empty=flag('empty-media');
  const root=empty?path.join(dataDir,'media'):resourceRoot(project);
  if(empty)await fs.mkdir(root,{recursive:true});
  const seed=arg('seed',null);
  const app=await createApp({root,dataDir,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,
    ...(seed!==null?{playRandom:seededRandom(seed)}:{}),
    worldProvider:createMockProvider(req=>({reply:'(homokozó: ez egy próbaválasz, nem valódi AI)',mood:'alap',answer:'(homokozó: a Rendszer próbaválasza, nem valódi AI)'}))});
  if(!empty){const [handler]=app.server.listeners('request');app.server.removeAllListeners('request');app.server.on('request',readOnlyGuard(handler));}
  await new Promise((ok,fail)=>{app.server.once('error',fail);app.server.listen(port,'127.0.0.1',ok);});
  console.log(`Sandbox ready: http://127.0.0.1:${port}\n  catalogue copy: ${dataDir}${report?' (from report '+report+')':''}${seed!==null?'\n  fixed randomness: seed '+seed:''}\n  media: ${empty?'empty folder (all actions allowed)':'real folder, READ ONLY'}\n  AI: mock (no paid calls). Ctrl+C stops it${flag('keep')?'':' and deletes the copy'}.`);
  let stopping=false;
  // Windows releases the SQLite file a moment after close: without retries the rm hit EBUSY and
  // the copy stayed behind. A failing close must still end the process.
  const stop=async()=>{if(stopping)return;stopping=true;
    try{await app.close();}catch(e){console.error('Close failed: '+e.message);}
    if(!flag('keep'))await removeCopy(dataDir);
    process.exit(0);};
  for(const s of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.once(s,stop);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('Sandbox could not start: '+e.message);process.exitCode=1;});
