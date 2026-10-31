// Manual bounded cloud trial. Preparation never loads a secret or calls an external endpoint.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../app/server.mjs';
import {createAnalysisSource} from '../app/analysis-source.mjs';
import {createAnalysisProvider} from '../app/analysis-providers.mjs';
import {pilotCredentialEnvironment} from '../app/analysis-credentials.mjs';
import {analysisDigest,analysisDefaultGoals,analysisHash} from '../app/analysis-model.mjs';
import {renderCloudSceneReport} from './render-cloud-scene-report.mjs';
import {writePrivateReviewServer} from './private-review-server.mjs';
import {pilotComparisonConfigs,pilotUsageCost,pilotPlanHash,validatePilotApproval} from './cloud-scene-pilot-support.mjs';

const args=process.argv.slice(2),opts={},keys=['--config','--selection','--output','--approval','--suite'];let execute=false;
for(let i=0;i<args.length;i++){if(args[i]==='--execute')execute=true;else if(keys.includes(args[i])&&args[i+1])opts[args[i]]=args[++i];else throw Error('Unknown pilot argument');}
if(!opts['--output']||!execute&&(!opts['--config']||!opts['--selection']))throw Error('Explicit selection/config/output required for preparation');
if(execute&&opts['--suite'])throw Error('Execution uses only the prepared comparison');
const output=path.resolve(opts['--output']);if(output===path.parse(output).root||output.toLowerCase().includes('onedrive'))throw Error('Private output must stay outside OneDrive');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const save=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2));
let live,app,plan,report,phase='initialize';
function liveState(ids){
  const placeholders=ids.map(()=>'?').join(','),tables=new Set(live.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name)),state={};
  for(const table of ['media','media_notes','depictions','media_tags','media_roles','media_categorization','media_locations','media_location_links','reviews'])if(tables.has(table))state[table]=live.prepare(`SELECT * FROM ${table} WHERE ${table==='media'?'id':'media_id'} IN (${placeholders}) ORDER BY rowid`).all(...ids);
  const chars=live.prepare(`SELECT DISTINCT character_id FROM depictions WHERE media_id IN (${placeholders}) ORDER BY character_id`).all(...ids).map(r=>r.character_id);
  if(chars.length){const p=chars.map(()=>'?').join(',');state.characters=live.prepare(`SELECT * FROM characters WHERE id IN (${p}) ORDER BY id`).all(...chars);state.canon=live.prepare(`SELECT * FROM canon WHERE character_id IN (${p}) ORDER BY rowid`).all(...chars);state.profiles=chars.map(id=>live.prepare('SELECT value FROM application_settings WHERE key=?').get('ghost:character:'+id)?.value??null);}
  return analysisDigest(state);
}
async function openStage(index,config,env={},onReceipt){
  const provider=createAnalysisProvider('openai',config,{env,onReceipt,fetchImpl:execute?fetch:async()=>{throw Error('PREPARATION_EXTERNAL_TRANSPORT_FORBIDDEN');}});
  const instance=await createApp({root:path.join(output,'media'),dataDir:path.join(output,'catalogue-'+index),mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:{providers:{}},mediaAnalysisTestOptions:{provider,providers:[provider]}});
  return {instance,provider};
}
function previewHTML(value){
  const rows=value.items.map(item=>`<section><h2>${esc(item.label)} · ${esc(item.partner)}</h2><img src="media/${esc(item.staging_name)}" alt="Kiválasztott privát tesztkép"><p>Mindkét modell ugyanezt az ellenőrzött JPEG-származékot kapja.</p><code>${esc(item.original.sha256)}</code></section>`).join('');
  return '<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Képelemzési összehasonlítás: adatátadási előnézet</title><style>body{font:17px system-ui;max-width:1100px;margin:35px auto;padding:0 24px;background:#17191d;color:#eee}section{border-top:1px solid #555;margin:25px 0;padding:20px 0}img{width:100%;max-height:600px;object-fit:contain}code{font-size:12px;overflow-wrap:anywhere}a{color:#8ecaff}li{margin:9px 0}</style><h1>Öt kép × két modell: felhős próba előnézete</h1><p>Állapot: helyben előkészítve. Modellhívás még nem történt.</p><ul><li>Szolgáltató: OpenAI, kizárólag https://api.openai.com/v1/responses.</li><li>Modellek: '+value.models.map(c=>esc(c.model)+' / '+esc(c.reasoning_effort)).join('; ')+'; 10 kérés, képenként/modellenként egy kísérlet.</li><li>Képrészletesség: high; a fent megadott gondolkodási szinttel. Legfeljebb 8192 kimeneti token/kérés, a gondolkodással együtt.</li><li>Küldött adatok: a kijelölt intim képek legfeljebb 2048 px / 3 MiB JPEG-származékai, rögzített utasítás és eredményséma. A látható személyek külső feldolgozásba kerülnek.</li><li>Nevek, profilok, jegyzetek, fájlutak és katalógushelyek nem részei a modellkérésnek. A résztvevők p1/p2 jelölést kapnak.</li><li>Az API-kérés store:false beállítást használ; ez nem nulla szolgáltatói adatmegőrzési garancia.</li><li>Nincs automatikus újrapróbálkozás, más modellre váltás, címke- vagy kánonelfogadás, éles katalógusírás.</li></ul><p><strong>Óvatos tokenkerettel számolt becslés: '+value.estimated_total_usd.toFixed(4)+' USD összesen.</strong> A helyi futási keret 2 USD; a következő kérés becslésével együtt ellenőrizzük. A teljes kimeneti keretet kihasználó összes kérés becslése ezt meghaladhatja; ilyenkor a futás korábban megáll. A bemeneti tokenek becslésen alapulnak; ez nem szolgáltatói kemény számlázási plafon. Az egyenleg, adók és a szolgáltató számlája külön ellenőrizendők. Ismeretlen kimenetel vagy hiányzó fogyasztási adat után a futtató megáll.</p><p><a href="/prompt.txt">A tényleges utasítás</a> · <a href="/schema.json">A tényleges eredményséma</a></p><p>A következő jóváhagyásnak erre az öt konkrét képre, mindkét modellre, az adatátadásra és a költségbecslés korlátaira kell vonatkoznia. Csak felnőtteket ábrázoló jelenetek szerepelhetnek.</p><p>Előnézet-azonosító: <code>'+esc(value.plan_hash)+'</code></p>'+rows+'</html>';
}
async function resultHTML(){await fs.writeFile(path.join(output,'results.html'),renderCloudSceneReport(plan,report));}

try{
  if(!execute){
    phase='prepare_selection';const selection=await read(opts['--selection']),cfg=await read(opts['--config']);
    if(selection.kind!=='user-selected-private-scene-pilot'||selection.items.length!==5||selection.items.some(i=>!i.user_selected)||new Set(selection.items.map(i=>i.media_id)).size!==5)throw Error('EXPLICIT_FIVE_IMAGE_SELECTION_REQUIRED');
    await fs.mkdir(output);await fs.mkdir(path.join(output,'media'));
    live=new DatabaseSync(cfg.database,{readOnly:true,allowExtension:false});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
    const source=createAnalysisSource({root:cfg.mediaRoot,one:(sql,...p)=>live.prepare(sql).get(...p)}),ids=selection.items.map(i=>i.media_id);
    plan={kind:'private-cloud-scene-pilot-preview',suite:opts['--suite']||'terra-sol-low',prepared_at:new Date().toISOString(),database:cfg.database,media_root:cfg.mediaRoot,selection_file:path.resolve(opts['--selection']),live_baseline_hash:liveState(ids),budget_usd:2,models:pilotComparisonConfigs(opts['--suite']),goals:analysisDefaultGoals,items:[],requests:[],estimated_total_usd:0,external_calls:0};
    for(const item of selection.items){const input=await source.read(item.media_id,item.source),ext={'image/jpeg':'.jpg','image/png':'.png','image/bmp':'.bmp','image/gif':'.gif'}[input.manifest.mime_type];if(!ext)throw Error('UNSUPPORTED_IMAGE');const name=item.media_id+ext;await fs.writeFile(path.join(output,'media',name),input.bytes,{flag:'wx'});plan.items.push({label:item.label,media_id:item.media_id,partner:item.partner,staging_name:name,original:input.manifest});}
    for(const [index,config]of plan.models.entries()){
      phase='prepare_model_'+index;const stage=await openStage(index,config);app=stage.instance;
      for(const item of plan.items){const at=new Date().toISOString();app.db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?)").run(item.media_id,item.staging_name,item.original.size,at,at);const preview=await app.mediaAnalysis.previewJob({media_ids:[item.media_id],provider_id:'openai',goals:plan.goals});if(preview.items[0].source.sha256!==item.original.sha256)throw Error('STAGING_COPY_CHANGED');plan.requests.push({model:config.model,media_id:item.media_id,label:item.label,preview});plan.estimated_total_usd+=preview.cost.estimated_usd;}
      if(index===0){await fs.writeFile(path.join(output,'prompt.txt'),stage.provider.disclosure.prompt);await save(path.join(output,'schema.json'),stage.provider.disclosure.output_schema);}
      await app.close();app=null;
    }
    if(liveState(ids)!==plan.live_baseline_hash)throw Error('LIVE_CONTEXT_CHANGED');
    plan.plan_hash=pilotPlanHash(plan);await fs.writeFile(path.join(output,'plan.json'),JSON.stringify(plan,null,2),{flag:'wx'});await fs.writeFile(path.join(output,'preview.html'),previewHTML(plan),{flag:'wx'});
    const routes={'/':'preview.html','/preview.html':'preview.html','/prompt.txt':'prompt.txt','/schema.json':'schema.json','/results.html':'results.html'};for(const item of plan.items)routes['/media/'+item.staging_name]='media/'+item.staging_name;await writePrivateReviewServer(output,routes);
    console.log(JSON.stringify({event:'private_cloud_preview_ready',output,images:5,requests:10,models:plan.models.map(c=>({model:c.model,reasoning_effort:c.reasoning_effort})),estimated_total_usd:plan.estimated_total_usd,budget_usd:plan.budget_usd,plan_hash:plan.plan_hash,external_calls:0}));
  }else{
    phase='validate_approval';plan=await read(path.join(output,'plan.json'));if(!opts['--approval'])throw Error('EXACT_CLOUD_APPROVAL_REQUIRED');const approval=await read(opts['--approval']);validatePilotApproval(plan,approval);
    live=new DatabaseSync(plan.database,{readOnly:true,allowExtension:false});live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');const ids=plan.items.map(i=>i.media_id),source=createAnalysisSource({root:plan.media_root,one:(sql,...p)=>live.prepare(sql).get(...p)});
    if(liveState(ids)!==plan.live_baseline_hash)throw Error('LIVE_CONTEXT_CHANGED');for(const item of plan.items)await source.read(item.media_id,item.original);
    const env=await pilotCredentialEnvironment();await fs.writeFile(path.join(output,'execution-started.json'),JSON.stringify({started_at:new Date().toISOString(),plan_hash:plan.plan_hash}),{flag:'wx'});
    report={kind:'private-cloud-scene-pilot-results',started_at:new Date().toISOString(),plan_hash:plan.plan_hash,approval,attempts:[],receipts:[],calculated_cost_usd:0,stopped_reason:null};
    const persist=async()=>{await save(path.join(output,'report.json'),report);await resultHTML();};let stop=false;
    for(const [index,config]of plan.models.entries()){
      if(stop)break;phase='execute_model_'+index;let current;
      const stage=await openStage(index,config,env,async receipt=>{if(!current||receipt.request_sha256!==current.request_sha256)throw Error('RECEIPT_BINDING_CHANGED');const saved={...receipt,model:config.model,label:current.label,received_at:new Date().toISOString()};report.receipts.push(saved);current.receipt=saved;if(receipt.usage&&receipt.model_matches){current.cost_usd=pilotUsageCost(receipt.usage,config.model);report.calculated_cost_usd+=current.cost_usd;}await persist();});app=stage.instance;
      for(const item of plan.items){
        if(liveState(ids)!==plan.live_baseline_hash)throw Error('LIVE_CONTEXT_CHANGED');await source.read(item.media_id,item.original);
        const expected=plan.requests.find(r=>r.model===config.model&&r.media_id===item.media_id),preview=await app.mediaAnalysis.previewJob({media_ids:[item.media_id],provider_id:'openai',goals:plan.goals});
        if(preview.preview_hash!==expected.preview.preview_hash)throw Error('PREVIEW_CHANGED');if(report.calculated_cost_usd+preview.cost.estimated_usd>plan.budget_usd){report.stopped_reason='LOCAL_BUDGET_GUARD';stop=true;break;}
        current={model:config.model,media_id:item.media_id,label:item.label,request_sha256:preview.items[0].request_sha256,status:'started',cost_usd:null};report.attempts.push(current);await persist();const started=performance.now();
        const job=await app.mediaAnalysis.createJob({media_ids:[item.media_id],provider_id:'openai',goals:plan.goals,preview_hash:preview.preview_hash,request_key:randomUUID(),transfer_approval:{preview_hash:preview.preview_hash,ack_upload:true,ack_cost:true}});await app.mediaAnalysis.settle();const saved=app.mediaAnalysis.view(job.id).items[0];
        Object.assign(current,{status:saved.status,error_code:saved.error_code,result:saved.result,cache_hit:saved.cache_hit,elapsed_ms:Math.round(performance.now()-started),job_id:job.id});await source.read(item.media_id,item.original);await persist();
        console.log(JSON.stringify({event:'private_cloud_item_finished',label:item.label,model:config.model,status:current.status,error_code:current.error_code}));
        if(!current.receipt?.usage||!current.receipt.model_matches||current.status==='failed'&&current.error_code==='PROVIDER_OUTCOME_UNKNOWN'){report.stopped_reason='UNVERIFIED_USAGE_OR_OUTCOME';stop=true;break;}
      }
      await app.close();app=null;
    }
    report.live_selected_records_unchanged=liveState(ids)===plan.live_baseline_hash;report.finished_at=new Date().toISOString();report.complete=report.attempts.length===10&&report.attempts.every(a=>a.status==='succeeded')&&report.live_selected_records_unchanged;await persist();console.log(JSON.stringify({event:'private_cloud_pilot_finished',complete:report.complete,attempts:report.attempts.length,calculated_cost_usd:report.calculated_cost_usd,live_selected_records_unchanged:report.live_selected_records_unchanged}));
  }
}catch(e){if(report){report.stopped_reason='PILOT_STOPPED_'+phase;report.finished_at=new Date().toISOString();await save(path.join(output,'report.json'),report);}console.error(JSON.stringify({event:'private_cloud_pilot_failed',phase,code:e.code||'PILOT_FAILED'}));process.exitCode=1;}
finally{if(app)await app.close();live?.close();}
