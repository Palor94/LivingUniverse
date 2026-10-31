// Prepare a new immutable active-image scope in the existing paused run. No credentials or external calls.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAnalysisSource} from '../app/analysis-source.mjs';
import {cloudAvailabilityMany} from '../app/duplicates.mjs';
import {analysisHash} from '../app/analysis-model.mjs';
import {describeMediaPurpose} from '../app/media-purpose.mjs';
import {indexWorldResult} from '../app/analysis-world-index.mjs';
import {libraryPlanHash,libraryProviderConfig,effectiveLibraryBudget,libraryScope} from './library-run-support.mjs';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw Error('Explicit private paused run required');const output=path.resolve(args[1]);if(output.toLowerCase().includes('onedrive'))throw Error('Private run required');
const read=async file=>JSON.parse(await fs.readFile(path.join(output,file),'utf8'));
const old=await read('plan.json'),status=await read('status.json'),amendment=await read('budget-amendment.json').catch(e=>{if(e.code==='ENOENT')return null;throw e;});assert.equal(old.plan_hash,libraryPlanHash(old));assert.equal(status.state,'paused');assert.equal(effectiveLibraryBudget(old,amendment),35);
try{await fs.access(path.join(output,'worker.lock'));throw Error('WORKER_STILL_ACTIVE');}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync(path.join(output,'catalogue','universe.sqlite')),live=new DatabaseSync(old.database,{readOnly:true,allowExtension:false});db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');live.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
try{
  assert.equal(db.prepare("SELECT count(*) n FROM library_attempts WHERE state IN ('started','unknown')").get().n,0);
  const archive=path.join(output,'before-expanded-scope-'+Date.now());await fs.mkdir(archive);
  for(const file of ['plan.json','approval.json','budget-amendment.json','planning-supplement.json','needs-sorting-supplement.json']){try{await fs.copyFile(path.join(output,file),path.join(archive,file));}catch(e){if(e.code!=='ENOENT')throw e;}}
  // No new result backup is made: an image removal must also remove its visual observations.
  const rows=live.prepare("SELECT * FROM active_media WHERE kind='image' ORDER BY id").all(),root=await fs.realpath(old.media_root),previous=new Map(old.items.map(i=>[i.media_id,i])),retired=new Set(db.prepare('SELECT media_id FROM library_redactions').all().map(i=>i.media_id)),attempted=new Set(db.prepare('SELECT media_id FROM library_attempts').all().map(i=>i.media_id));
  const next={...old,prepared_at:new Date().toISOString(),previous_plan_hash:old.plan_hash,scope:'all-active-character-images-and-explicit-generation-plans-at-resume',active_images:rows.length,budget_usd:35,provider:libraryProviderConfig(),items:[],excluded:[],external_calls:0};delete next.refreshed_at;delete next.plan_hash;
  const characters=live.prepare('SELECT c.id,c.name FROM depictions d JOIN characters c ON c.id=d.character_id WHERE d.media_id=? ORDER BY c.id');let added=0,reused=0;
  for(let offset=0;offset<rows.length;offset+=16){
    const batch=rows.slice(offset,offset+16),states=await cloudAvailabilityMany(batch.map(r=>path.join(root,r.relative_path))),source=createAnalysisSource({root,one:(sql,...p)=>live.prepare(sql).get(...p),availability:async file=>states.get(file)||'unknown'});
    for(const row of batch){
      if(retired.has(row.id)){next.excluded.push({media_id:row.id,relative_path:row.relative_path,code:'PREVIOUSLY_RETIRED_RUN_COPY'});continue;}
      try{
        let input;for(let n=0;n<3;n++){try{input=await source.read(row.id);break;}catch(e){if(e.code!=='SOURCE_CHANGED'||n===2)throw e;}}
        const ext={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/bmp':'.bmp'}[input.manifest.mime_type];if(!ext)throw Error('UNSUPPORTED_IMAGE');
        const before=previous.get(row.id),name=row.id+ext,file=path.join(output,'media',name);
        if(before&&before.original.sha256!==input.manifest.sha256)throw Object.assign(Error('Version changed'),{code:attempted.has(row.id)?'PAID_SOURCE_VERSION_CHANGED':'STAGED_SOURCE_VERSION_CHANGED'});
        let copy;try{copy=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(copy){if(analysisHash(copy)!==input.manifest.sha256)throw Object.assign(Error('Copy changed'),{code:'STAGED_COPY_CHANGED'});}else await fs.writeFile(file,input.bytes,{flag:'wx'});
        const item={media_id:row.id,staging_name:name,original:input.manifest,characters:characters.all(row.id)};next.items.push(item);
        const at=new Date().toISOString();db.prepare("INSERT INTO media VALUES(?,?,'','image',?,?,?) ON CONFLICT(id) DO UPDATE SET relative_path=excluded.relative_path,size=excluded.size").run(row.id,name,input.manifest.size,at,at);
        if(!db.prepare('SELECT 1 FROM library_items WHERE media_id=?').get(row.id)){db.prepare("INSERT INTO library_items(media_id,status) VALUES(?,'queued')").run(row.id);added++;}
        if(db.prepare("SELECT 1 FROM library_items WHERE media_id=? AND status='succeeded'").get(row.id)){
          const saved=db.prepare("SELECT id,result_json FROM media_analysis_items WHERE media_id=? AND status='succeeded' AND result_json IS NOT NULL ORDER BY rowid DESC LIMIT 1").get(row.id);if(saved){indexWorldResult(db,{media_id:row.id,source_sha256:item.original.sha256,result_item_id:saved.id,result:JSON.parse(saved.result_json),characters:item.characters,source_relative_path:item.original.relative_path});reused++;}
        }
      }catch(e){next.excluded.push({media_id:row.id,relative_path:row.relative_path,code:e.code||'UNSUPPORTED_OR_UNAVAILABLE_IMAGE'});}
    }
    await fs.writeFile(path.join(output,'expansion-status.json'),JSON.stringify({checked:Math.min(offset+16,rows.length),total:rows.length,prepared:next.items.length,excluded:next.excluded.length,new_model_calls:0}));
  }
  const selected=new Set(next.items.map(i=>i.media_id));next.retained_items=[...new Map([...(old.retained_items||[]),...old.items].filter(i=>!selected.has(i.media_id)).map(i=>[i.media_id,i])).values()];
  for(const item of next.retained_items)for(const table of ['world_labels','world_asset_characters','world_search','world_assets','world_asset_purposes'])db.prepare(`DELETE FROM ${table} WHERE media_id=?`).run(item.media_id);
  next.plan_hash=libraryPlanHash(next);const scope=libraryScope(next),cost=db.prepare('SELECT coalesce(sum(cost_usd),0) n FROM library_attempts').get().n,counts=Object.fromEntries(db.prepare('SELECT status,count(*) n FROM library_items WHERE '+scope.sql+' GROUP BY status').all(...scope.ids).map(r=>[r.status,r.n]));
  await fs.writeFile(path.join(output,'plan.json.tmp'),JSON.stringify(next,null,2));await fs.rename(path.join(output,'plan.json.tmp'),path.join(output,'plan.json'));
  // Old approvals stay archived; they do not authorize this expanded exact scope.
  for(const file of ['approval.json','budget-amendment.json'])try{await fs.rename(path.join(output,file),path.join(archive,'active-'+file));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const file of ['planning-supplement.json','needs-sorting-supplement.json']){try{const value=await read(file);value.state='included';value.included_plan_hash=next.plan_hash;value.included_at=new Date().toISOString();await fs.writeFile(path.join(output,file),JSON.stringify(value,null,2));}catch(e){if(e.code!=='ENOENT')throw e;}}
  const summary={event:'expanded_world_library_ready',images:next.items.length,excluded:next.excluded.length,added,reused_results:reused,planning_images:next.items.filter(i=>describeMediaPurpose(i.original.relative_path).kind==='generation_plan').length,budget_usd:35,spent_usd:cost,counts,plan_hash:next.plan_hash,new_model_calls:0};
  await fs.writeFile(path.join(output,'expanded-scope-summary.json'),JSON.stringify(summary,null,2));await fs.writeFile(path.join(output,'status.json'),JSON.stringify({...status,plan_hash:next.plan_hash,state:'paused',stop_reason:'EXPANDED_SCOPE_READY_FOR_APPROVED_START',updated_at:new Date().toISOString(),counts,total:next.items.length,budget_usd:35},null,2));console.log(JSON.stringify(summary));
}finally{db.close();live.close();}
