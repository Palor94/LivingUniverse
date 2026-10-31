// Manual local-only pilot. Private IDs/configuration/results belong outside Git.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {createAnalysisSource} from '../app/analysis-source.mjs';
import {analysisDefaultGoals,analysisDigest,matchAnalysisResult} from '../app/analysis-model.mjs';
import {declaredNudity} from './pilot-selection-labels.mjs';

const args=process.argv.slice(2),opts={},keys=new Set(['--output','--config','--ids','--endpoint','--model','--digest']);
for(let i=0;i<args.length;i++){if(args[i]==='--ack-private-local')opts.ack=true;else if(args[i]==='--require-full-nudity-label')opts.requireFull=true;else if(keys.has(args[i])&&args[i+1])opts[args[i]]=args[++i];else throw Error('Unknown or incomplete private-pilot argument.');}
if(!opts.ack||[...keys].some(k=>!opts[k]))throw Error('Explicit local-private acknowledgement, selection, configuration and output are required.');
const ids=opts['--ids'].split(',').sort(),uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
if(ids.length<1||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw Error('Choose one to three distinct stable media IDs.');
const output=path.resolve(opts['--output']);if(output.toLowerCase().includes('onedrive')||output===path.parse(output).root)throw Error('Private trial output must stay outside OneDrive.');
try{await fs.access(output);throw Error('Choose a fresh directory; private trial history is never overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
const cfg=JSON.parse(await fs.readFile(opts['--config'],'utf8')),endpoint=new URL(opts['--endpoint']);
if(endpoint.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(endpoint.hostname)||endpoint.pathname!=='/api/chat'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!/^sha256:[a-f0-9]{64}$/u.test(opts['--digest']))throw Error('Explicit pinned loopback model configuration required.');
const live=new DatabaseSync(cfg.database,{readOnly:true,allowExtension:false,timeout:1500});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
if(live.prepare('PRAGMA query_only').get().query_only!==1)throw Error('Live catalogue must be query-only.');
const tables=new Set(live.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
const all=(sql,...p)=>live.prepare(sql).all(...p),one=(sql,...p)=>live.prepare(sql).get(...p);
const source=createAnalysisSource({root:cfg.mediaRoot,one}),placeholders=list=>list.map(()=>'?').join(',');
const people=all(`SELECT DISTINCT c.id,c.name,c.biography FROM characters c JOIN depictions d ON d.character_id=c.id WHERE d.media_id IN (${placeholders(ids)}) ORDER BY c.id`,...ids);
const adultMetadata=people.map(c=>{const age=Number(c.biography.match(/(\d{1,3})\s*éves/iu)?.[1]);if(!Number.isInteger(age)||age<18)throw Error('Selected character needs an explicit adult age statement in the catalogue.');return {character_id:c.id,name:c.name,catalogue_age_statement:age};});
const selectionLabels=new Map();
for(const id of ids){if(!one('SELECT 1 FROM depictions WHERE media_id=?',id))throw Error('Unassigned media requires separate selection review.');const n=one('SELECT tags,notes FROM media_notes WHERE media_id=?',id),text=(n?.tags??'')+' '+(n?.notes??'');for(const m of text.matchAll(/(\d{1,3})\s*éves/giu))if(Number(m[1])<18)throw Error('Selected image has an incompatible age statement.');const label=declaredNudity(text);if(opts.requireFull&&label!=='full')throw Error('Selected metadata does not declare full nudity; substring matches are insufficient.');selectionLabels.set(id,label);}
const characterIds=people.map(c=>c.id);
function liveSnapshot(){
  const state={};for(const table of ['media','media_notes','depictions','media_tags','media_roles','media_categorization','media_locations','media_location_links','reviews'])if(tables.has(table))state[table]=all(`SELECT * FROM ${table} WHERE ${table==='media'?'id':'media_id'} IN (${placeholders(ids)}) ORDER BY rowid`,...ids);
  state.characters=all(`SELECT id,name,aliases,biography,personality,appearance FROM characters WHERE id IN (${placeholders(characterIds)}) ORDER BY id`,...characterIds);
  state.canon=all(`SELECT * FROM canon WHERE character_id IN (${placeholders(characterIds)}) ORDER BY rowid`,...characterIds);
  const tags=all('SELECT t.*,EXISTS(SELECT 1 FROM locations l WHERE l.tag_id=t.id) exact_location FROM structured_tags t ORDER BY t.id');
  const localizations=tables.has('tag_localizations')?all('SELECT * FROM tag_localizations ORDER BY tag_id'):[],aliases=tables.has('tag_aliases')?all('SELECT * FROM tag_aliases ORDER BY tag_id,alias_key'):[];
  state.vocabulary={tags,localizations,aliases};return {hash:analysisDigest(state),vocabulary:tags.map(t=>({...t,hu_name:localizations.find(l=>l.tag_id===t.id)?.hu_name||'',en_name:localizations.find(l=>l.tag_id===t.id)?.en_name||'',aliases:aliases.filter(a=>a.tag_id===t.id)}))};
}
const baseline=liveSnapshot(),mediaDir=path.join(output,'media'),goals=analysisDefaultGoals;
await fs.mkdir(mediaDir,{recursive:true});const selected=[];
for(const id of ids){const input=await source.read(id);const ext={'image/jpeg':'.jpg','image/png':'.png','image/bmp':'.bmp','image/gif':'.gif'}[input.manifest.mime_type];if(!ext)throw Error('Unsupported private image type.');const name=id+ext;await fs.writeFile(path.join(mediaDir,name),input.bytes,{flag:'wx'});selected.push({media_id:id,staging_name:name,original:input.manifest,declared_nudity:selectionLabels.get(id),character_ids:all('SELECT character_id FROM depictions WHERE media_id=? ORDER BY character_id',id).map(r=>r.character_id)});}
const provider={enabled:true,endpoint:endpoint.href,model:opts['--model'],model_revision:opts['--digest'],local_only_confirmed:true,timeout_ms:300000,max_response_bytes:131072,max_output_tokens:2048};
const report={kind:'private-real-media-local-pilot',private:true,synthetic:false,started_at:new Date().toISOString(),live_database_mode:'readOnly/query_only',live_database:cfg.database,live_media_root:cfg.mediaRoot,live_baseline_hash:baseline.hash,adult_catalogue_metadata:adultMetadata,model:provider.model,model_revision:provider.model_revision,endpoint:provider.endpoint,goals,paid_api:false,automatic_acceptance:false,items:[]};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const categories={background:'Helyszín / környezet',action:'Akció',angle:'Kameraállás',framing:'Kivágás',reference_use:'Képgenerálási referenciahasználat'};
const resolutions={matched:'Meglévő címkéhez illesztve',unknown:'Új címkejavaslat',ambiguous:'Többértelmű',excluded:'Nem alkalmazható'};
function tagList(item,wanted){const tags=item.live_vocabulary_matches?.filter(p=>wanted.includes(p.category))??[];return tags.length?'<ul>'+tags.map(p=>`<li><strong>${esc(categories[p.category])}: ${esc(p.hu)}</strong> · ${esc(p.en)}<br><small>${esc(resolutions[p.resolution]||p.resolution)}${p.uncertain?' · bizonytalan':''}<br>${esc(p.evidence)}</small></li>`).join('')+'</ul>':'<p>Nincs megalapozott javaslat.</p>';}
async function save(){
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  const rows=report.items.map(i=>`<section><h2>${esc(i.label)} · ${esc(i.status)}</h2><div class="pair"><img src="media/${esc(i.staging_name)}" alt="Kijelölt privát kép"><div><p>${esc(i.result?.description?.hu||i.error_code||'')}</p><p lang="en">${esc(i.result?.description?.en||'')}</p><p>${esc(i.wall_time_ms/1000)} másodperc · ${i.cache_hit?'cache':'valódi helyi modellhívás'}</p><p>Katalógusjelölés: ${esc({partial:"félmeztelen",full:"meztelen",not_declared:"nincs egyértelmű jelölés"}[i.declared_nudity]||"nincs jelölés")}</p><h3>Helyszín / környezet</h3><p>Háttér jellege: ${esc(i.result?.background?.hu)}</p>${tagList(i,["background"])}<h3>Akció / tevékenység</h3>${tagList(i,["action"])}<h3>Felvétel és referenciahasználat</h3>${tagList(i,["angle","framing","reference_use"])}<p>Változatlan forrás: ${i.original_unchanged?'igen':'ellenőrizendő'}</p><code>${esc(i.media_id)}</code></div></div></section>`).join('');
  await fs.writeFile(path.join(output,'review.html'),'<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src &#39;self&#39; file:; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Privát helyi képelemzési próba</title><style>body{font:17px system-ui;max-width:1200px;margin:40px auto;padding:0 20px;background:#f4f4f4;color:#222}section{background:white;padding:24px;margin:24px 0;border-radius:12px}.pair{display:grid;grid-template-columns:minmax(250px,1fr) 1fr;gap:24px}img{width:100%;max-height:650px;object-fit:contain}code{font-size:12px}li{margin:12px 0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Privát helyi képelemzési próba</h1><p>Kizárólag helyi Ollama. Az eredmény ellenőrizendő modelljavaslat; az éles katalógus nem kapott írást. A képek, leírások és ez az eredménylap privát helyi anyagok.</p>'+rows+'</html>');
}
let app,base,csrf;
async function call(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',signal:AbortSignal.timeout(60000),headers:body?{'Content-Type':'application/json',Origin:base,'X-LU-Analysis-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.code||'PILOT_API_FAILED');return value;}
try{
  app=await createApp({root:mediaDir,dataDir:path.join(output,'catalogue'),mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:{providers:{ollama:provider,openai:{enabled:false}}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;csrf=(await call('/api/media-analysis')).csrf;
  for(const input of selected){
    if(liveSnapshot().hash!==baseline.hash)throw Error('SELECTED_LIVE_CONTEXT_CHANGED');await source.read(input.media_id,input.original);
    const at=new Date().toISOString();app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)").run(input.media_id,input.staging_name,input.original.size,at,at);
    const chosen={media_ids:[input.media_id],provider_id:'ollama',goals},plan=await call('/api/media-analysis/jobs/preview',chosen),started=performance.now();
    if(plan.items[0].source.sha256!==input.original.sha256)throw Error('STAGING_SOURCE_MISMATCH');console.log(JSON.stringify({event:'private_inference_start',item:report.items.length+1,total:ids.length}));
    const job=await call('/api/media-analysis/jobs',{...chosen,preview_hash:plan.preview_hash,request_key:randomUUID()});await app.mediaAnalysis.settle();const saved=await call('/api/media-analysis/jobs/'+job.id),item=saved.items[0],current=liveSnapshot();await source.read(input.media_id,input.original);
    const entry={...input,label:input.character_ids.map(id=>adultMetadata.find(c=>c.character_id===id)?.name).join(', '),status:item.status,error_code:item.error_code,wall_time_ms:Math.round(performance.now()-started),cache_hit:item.cache_hit,job_id:job.id,provider:saved.provider,input:plan.items[0],result:item.result,live_vocabulary_hash:analysisDigest(current.vocabulary),live_vocabulary_matches:item.result?matchAnalysisResult(item.result,current.vocabulary,[],goals):[],original_unchanged:true};report.items.push(entry);await save();
    console.log(JSON.stringify({event:'private_inference_end',item:report.items.length,status:item.status,error_code:item.error_code,wall_time_ms:entry.wall_time_ms}));if(current.hash!==baseline.hash)throw Error('SELECTED_LIVE_CONTEXT_CHANGED');
  }
  report.staging_integrity=app.db.prepare('PRAGMA integrity_check').get().integrity_check;
}catch(e){report.failure=String(e.code||e.message||'PILOT_FAILED').slice(0,200);process.exitCode=1;}
finally{if(app)await app.close();report.live_final_hash=liveSnapshot().hash;report.live_selected_records_unchanged=report.live_final_hash===baseline.hash;live.close();report.finished_at=new Date().toISOString();report.complete=report.items.length===ids.length&&report.items.every(i=>i.status==='succeeded'&&i.original_unchanged)&&report.live_selected_records_unchanged;if(!report.complete)process.exitCode=1;await save();console.log(JSON.stringify({event:'private_pilot_finished',complete:report.complete,processed:report.items.length,live_selected_records_unchanged:report.live_selected_records_unchanged,review:path.join(output,'review.html')}));}
