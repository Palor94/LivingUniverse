import path from 'node:path';
import {analysisTables} from './media-analysis.mjs';
import {analysisCategories,validateAnalysisResult,analysisError as error} from './analysis-model.mjs';

export function createAnalysisRestore({one,all,run,transaction}){
  const tables=Object.keys(analysisTables),bad=()=>{throw error('INVALID_BACKUP','Hiányos vagy érvénytelen elemzési adat a mentésben.');};
  const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
  function prepare(body){
    if(body.analysis_schema_version!==undefined&&body.analysis_schema_version!==1)bad();
    if((body.analysis_schema_version!==undefined||tables.some(t=>body[t]!==undefined))&&tables.some(t=>!Array.isArray(body[t])))bad();
    for(const table of [...tables].reverse())run('DELETE FROM '+table);
  }
  function validate(){
    try{
      for(const job of all('SELECT * FROM media_analysis_jobs')){
        const provider=JSON.parse(job.provider_json),goals=JSON.parse(job.goals_json);if(!provider||typeof provider.id!=='string'||typeof provider.version!=='string'||!Array.isArray(goals)||!goals.length||goals.some(g=>!analysisCategories.includes(g)))bad();
        if(provider.id==='openai'){
          const approval=provider.transfer_approval,items=all('SELECT media_id,source_json FROM media_analysis_items WHERE job_id=? ORDER BY ordinal',job.id);
          if(provider.local!==false||provider.mock!==false||!approval||!sha(approval.preview_hash)||approval.actor!=='local-creator'||typeof approval.approved_at!=='string'||!Number.isFinite(Date.parse(approval.approved_at))||approval.transfer?.provider!=='openai'||approval.transfer?.model!==provider.model||JSON.stringify(approval.transfer.purpose)!==JSON.stringify(goals)||!Array.isArray(approval.items)||approval.items.length!==items.length||!items.length)bad();
          for(const [i,item]of items.entries()){
            const a=approval.items[i],d=a?.derivative;if(a?.media_id!==item.media_id||a.source_sha256!==JSON.parse(item.source_json).sha256||!sha(a.request_sha256)||!d||!sha(d.sha256)||d.mime_type!=='image/jpeg'||!Number.isInteger(d.size)||d.size<1||d.size>3*1024*1024||!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<1||d.height<1||Math.max(d.width,d.height)>2048)bad();
          }
        }
      }
      for(const item of all('SELECT * FROM media_analysis_items')){
        const source=JSON.parse(item.source_json);if(source.media_id!==item.media_id||!sha(source.sha256)||typeof source.relative_path!=='string'||path.isAbsolute(source.relative_path)||path.win32.isAbsolute(source.relative_path)||source.relative_path.split(/[\\/]/u).some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||!Number.isFinite(source.size)||source.size<1||source.size>20*1024*1024)bad();
        if(item.result_json)validateAnalysisResult(JSON.parse(item.result_json));
        if(item.status==='succeeded'&&(!item.result_json||!sha(item.match_hash)||!item.context_json))bad();
        if(item.context_json){const c=JSON.parse(item.context_json);if(!sha(c.vocabulary_hash)||!sha(c.tree_hash)||!sha(c.media_binding))bad();}
      }
      for(const cache of all('SELECT * FROM media_analysis_cache')){if(!sha(cache.cache_key)||!sha(cache.source_sha256)||!sha(cache.derivative_sha256))bad();validateAnalysisResult(JSON.parse(cache.result_json));}
      for(const proposal of all('SELECT * FROM media_analysis_proposals')){
        const p=JSON.parse(proposal.payload_json);if(!sha(proposal.match_hash)||!['tag','location'].includes(p.kind)||typeof p.hu!=='string'||p.hu.length>100||typeof p.en!=='string'||p.en.length>100||typeof p.uncertain!=='boolean'||!['matched','unknown','ambiguous','choose_place','excluded'].includes(p.resolution)||!Array.isArray(p.candidate_ids)||p.candidate_ids.some(id=>typeof id!=='string')||!(p.target_id===null||typeof p.target_id==='string')||!sha(p.key))bad();
      }
      for(const decision of all('SELECT * FROM media_analysis_decisions')){
        const selection=JSON.parse(decision.selection_json);if(!sha(decision.request_hash)||!sha(decision.preview_hash)||!selection||!Array.isArray(selection.actions)||!selection.actions.length||selection.actions.length>200)bad();
        for(const action of selection.actions){const p=one('SELECT i.media_id,p.item_id FROM media_analysis_proposals p JOIN media_analysis_items i ON i.id=p.item_id WHERE p.id=?',action.proposal_id);if(!p||p.media_id!==action.media_id||p.item_id!==action.item_id)bad();}
      }
      if(one("SELECT 1 FROM media_analysis_tag_links l JOIN media_analysis_decisions d ON d.id=l.decision_id WHERE d.status<>'applied' OR d.operation<>'accept' LIMIT 1"))bad();
      for(const [table,kind,column]of [['media_analysis_tag_links','tag','tag_id'],['media_analysis_place_links','location','location_id']]){
        for(const link of all(`SELECT l.*,d.selection_json FROM ${table} l JOIN media_analysis_decisions d ON d.id=l.decision_id`)){
          if(!JSON.parse(link.selection_json).actions.some(a=>a.kind===kind&&a.media_id===link.media_id&&a.target_id===link[column]))bad();
        }
      }
      for(const link of all('SELECT l.*,d.status,d.operation FROM media_analysis_place_links l JOIN media_analysis_decisions d ON d.id=l.decision_id')){
        if(link.status!=='applied'||link.operation!=='accept'||!one(`SELECT 1 FROM ${link.is_primary?'media_locations':'media_location_links'} WHERE media_id=? AND location_id=?`,link.media_id,link.location_id))bad();
      }
    }catch{bad();}
  }
  function afterRestore(){
    validate();run("UPDATE media_analysis_items SET status='failed',error_code='PROVIDER_OUTCOME_UNKNOWN' WHERE status='running' AND job_id IN (SELECT id FROM media_analysis_jobs WHERE json_extract(provider_json,'$.local')=0)");run("UPDATE media_analysis_jobs SET status='paused',revision=revision+1,pause_reason='restore' WHERE status IN ('queued','running')");run("UPDATE media_analysis_items SET status='queued' WHERE status='running'");
  }
  return {prepare,validate,afterRestore};
}
