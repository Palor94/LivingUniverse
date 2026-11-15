#!/usr/bin/env node
// Performance baseline (Phase 0.7, docs/NEXT_GEN_PLAN_2026-11-11.md). Read-only for the owner's
// data: the live catalogue is copied with SQLite's online backup API into a temporary folder,
// and the app runs against that copy. No watchers, no world engine, no AI call (a mock
// provider), no thumbnail or duplicate scans that would read or download OneDrive files.
//
//   node ops/perf-baseline.mjs [--runs 10] [--out docs/PERF_BASELINE.md] [--explain]
//
// Reports warm median and p95 per endpoint, the first (cold) call separately, and the static
// bytes the main page loads, raw and gzip-compressed.
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {DatabaseSync,backup} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {createApp,resolveDataDir} from '../app/server.mjs';
import {createMockProvider} from '../app/world-ai.mjs';
import {resourceRoot} from '../app/storage-layout.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const RUNS=Math.max(3,Number(arg('runs',10))||10);
const OUT=path.resolve(project,arg('out','docs/PERF_BASELINE.md'));
const EXPLAIN=process.argv.includes('--explain');

const pct=(values,p)=>{const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)];};
const ms=v=>v.toFixed(1);

async function main(){
  const liveDir=resolveDataDir(),live=path.join(liveDir,'universe.sqlite');
  await fs.access(live);
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'lu-perf-'));
  const source=new DatabaseSync(live,{readOnly:true});
  try{await backup(source,path.join(work,'universe.sqlite'));}finally{source.close();}
  // The location tree lives beside the catalogue; the copy needs it for Play routes.
  for(const f of ['location-canvas.json'])await fs.copyFile(path.join(liveDir,f),path.join(work,f)).catch(()=>{});
  const app=await createApp({root:resourceRoot(project),dataDir:work,mcpWrites:null,mobile:null,imageGeneration:{},grokConfig:null,
    worldProvider:createMockProvider(()=>({reply:'…'})),systemStatus:{readTasks:async()=>[],probe:async()=>true,tunnelRunning:async()=>true}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const get=async route=>{const t=performance.now();const r=await fetch(origin+route);const body=await r.arrayBuffer();return {ms:performance.now()-t,status:r.status,bytes:body.byteLength,body};};
  const rows=[];
  try{
    const play=JSON.parse(Buffer.from((await get('/api/play')).body).toString('utf8'));
    const firstCharacter=(play.people||[])[0]?.id;
    const routes=[
      ['/api/state','App shell: characters, counts'],
      ['/api/media?offset=0','Library, first page'],
      ['/api/media?inbox=1&offset=0','Rendezésre vár, first page'],
      ['/api/locations','Locations'],
      ['/api/world-review','Media review list'],
      ['/api/play','Play overview (map)'],
      ...(play.node_id?[['/api/play/place/'+encodeURIComponent(play.node_id),'Play place (current)']]:[]),
      ['/api/play/unread','Play unread check'],
      ['/api/play/journal','Play journal'],
      ['/api/play/relationships','Play relationships'],
      ...(firstCharacter?[['/api/play/relationship/'+firstCharacter,'Play relationship detail']]:[]),
      ['/api/world-engine','World engine page'],
    ];
    for(const [route,label] of routes){
      const cold=await get(route);const warm=[];
      for(let i=0;i<RUNS;i++)warm.push((await get(route)).ms);
      rows.push({route,label,status:cold.status,bytes:cold.bytes,cold:cold.ms,median:pct(warm,50),p95:pct(warm,95)});
      process.stdout.write('.');
    }
    // Play step (2026-11-14): one trip to a nearby place and back, alternating, on the copy.
    // "travel + GET /api/play" is what the client did before C1; "travel only" is the step now.
    const post=async(route,body)=>{const t=performance.now();const r=await fetch(origin+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const b=await r.arrayBuffer();return {ms:performance.now()-t,status:r.status,bytes:b.byteLength};};
    const here=(play.nodes||[]).find(n=>n.id===play.node_id);
    const other=here&&((play.nodes||[]).find(n=>n.id!==here.id&&n.parent_id===here.parent_id&&n.location_id&&!n.archived&&!n.passage)||(play.nodes||[]).find(n=>n.id!==here.id&&n.location_id&&!n.archived&&!n.passage));
    if(here&&other){
      for(const [withOverview,label] of [[true,'Play step: travel + GET /api/play (client before C1)'],[false,'Play step: travel only (client after C1)']]){
        const times=[];let status=0,bytes=0;
        for(let i=0;i<=RUNS;i++){const target=i%2?here.id:other.id;const t=await post('/api/play/travel',{node_id:target});let total=t.ms;status=t.status;bytes=t.bytes;
          if(withOverview){const g=await get('/api/play');total+=g.ms;bytes+=g.bytes;}times.push(total);}
        const [cold,...warm]=times;rows.push({route:'POST /api/play/travel'+(withOverview?' + GET /api/play':''),label,status,bytes,cold,median:pct(warm,50),p95:pct(warm,95)});
        process.stdout.write('.');
      }
    }
  }finally{await app.close();}
  // Static bytes of the main page: what index.html and client.js pull in, raw and gzip.
  const pub=path.join(project,'app','public'),statics=[];
  for(const f of (await fs.readdir(pub)).filter(f=>/\.(js|css|html)$/.test(f))){const data=await fs.readFile(path.join(pub,f));statics.push({file:f,raw:data.length,gzip:zlib.gzipSync(data,{level:9}).length});}
  statics.sort((a,b)=>b.raw-a.raw);
  const total=statics.reduce((s,x)=>({raw:s.raw+x.raw,gzip:s.gzip+x.gzip}),{raw:0,gzip:0});
  let explain='';
  if(EXPLAIN){const db=new DatabaseSync(path.join(work,'universe.sqlite'),{readOnly:true});try{
    const q=["SELECT folder,COUNT(*) FROM active_media GROUP BY folder","SELECT m.id FROM active_media m ORDER BY m.relative_path LIMIT 48"];
    explain='\n## Query plans (--explain)\n\n'+q.map(s=>'```\n'+s+'\n'+db.prepare('EXPLAIN QUERY PLAN '+s).all().map(r=>r.detail).join('\n')+'\n```').join('\n\n')+'\n';
  }finally{db.close();}}
  await fs.rm(work,{recursive:true,force:true});

  const counts=new DatabaseSync(live,{readOnly:true});let size;try{size=['characters','media','world_events','play_lines','character_memories'].map(t=>{try{return t+' '+counts.prepare('SELECT count(*) n FROM '+t).get().n;}catch{return t+' –';}}).join(', ');}finally{counts.close();}
  const md=`# Performance baseline

Measured ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC with \`node ops/perf-baseline.mjs\` on ${os.cpus()[0]?.model?.trim()||'this PC'}, Node ${process.version}.
A copy of the live catalogue (${size}); ${RUNS} warm runs per endpoint after one cold call.
No AI call, no thumbnail or duplicate scan. Re-run after each optimisation step and compare.

## Endpoints

| Endpoint | What | Status | Size | Cold ms | Warm median ms | Warm p95 ms |
|---|---|---|---|---|---|---|
${rows.map(r=>`| \`${r.route.replace(/[0-9a-f-]{36}/g,'<id>').replace(/place\/[^|]+$/,'place/<current>')}\` | ${r.label} | ${r.status} | ${(r.bytes/1024).toFixed(1)} KB | ${ms(r.cold)} | ${ms(r.median)} | ${ms(r.p95)} |`).join('\n')}

## Static files (app/public)

Total ${(total.raw/1024).toFixed(0)} KB raw, ${(total.gzip/1024).toFixed(0)} KB if gzip-compressed (served uncompressed today).

| File | Raw KB | Gzip KB |
|---|---|---|
${statics.slice(0,12).map(s=>`| ${s.file} | ${(s.raw/1024).toFixed(1)} | ${(s.gzip/1024).toFixed(1)} |`).join('\n')}
${explain}`;
  await fs.writeFile(OUT,md);
  console.log('\nWrote '+path.relative(project,OUT));
}
main().catch(e=>{console.error('Baseline failed: '+e.message);process.exitCode=1;});
