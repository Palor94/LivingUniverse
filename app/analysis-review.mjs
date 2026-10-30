import {randomUUID} from 'node:crypto';
import {analysisDigest as digest,analysisError as error} from './analysis-model.mjs';

const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw error('INVALID_ARGUMENT','Ismeretlen jóváhagyási mező.');};
const key=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{8,100}$/u.test(v))throw error('INVALID_ARGUMENT','Adj meg stabil jóváhagyási azonosítót.');return v;};
export function createAnalysisReview({analysis,one,all,run,transaction,isBusy=()=>false}){
  function selection(body){
    if(!['accept','reject'].includes(body.operation)||!Array.isArray(body.actions)||!body.actions.length||body.actions.length>200)throw error('INVALID_ARGUMENT','Válassz 1–200 javaslatot és elfogadás/elvetés műveletet.');
    const seen=new Set();return body.actions.map(action=>{
      shape(action,['proposal_id','target_id','ack_uncertain']);if(typeof action.proposal_id!=='string'||seen.has(action.proposal_id)||action.target_id!==undefined&&typeof action.target_id!=='string'||action.ack_uncertain!==undefined&&typeof action.ack_uncertain!=='boolean')throw error('INVALID_ARGUMENT','Érvénytelen vagy ismétlődő javaslat.');seen.add(action.proposal_id);
      return {proposal_id:action.proposal_id,...(action.target_id!==undefined?{target_id:action.target_id}:{}),ack_uncertain:action.ack_uncertain===true};
    }).sort((a,b)=>a.proposal_id.localeCompare(b.proposal_id));
  }
  function resolve(action,operation,context){
    const proposal=one('SELECT * FROM media_analysis_proposals WHERE id=?',action.proposal_id);if(!proposal)throw error('NOT_FOUND','A javaslat nem található.',404);
    const item=analysis.getItem(proposal.item_id),payload=JSON.parse(proposal.payload_json);
    if(proposal.status!=='pending'||proposal.match_hash!==item.match_hash)throw error('STALE_PROPOSAL','A javaslat már elbírált vagy elavult. Töltsd újra.',409);
    const resolved={proposal_id:proposal.id,item_id:item.id,media_id:item.media_id,kind:payload.kind,hu:payload.hu,en:payload.en,uncertain:payload.uncertain,evidence:payload.evidence,match_hash:item.match_hash,payload_hash:digest(payload),target_id:action.target_id||payload.target_id||null,ack_uncertain:action.ack_uncertain};
    if(operation==='reject')return resolved;
    if(item.status!=='succeeded'||payload.resolution==='excluded')throw error('INVALID_TARGET','Ez a javaslat nem alkalmazható.',400);
    if(payload.uncertain&&!action.ack_uncertain)throw error('UNCERTAINTY_REVIEW','A bizonytalan javaslat elfogadását külön jelöld.',400);
    const target=payload.kind==='tag'?context.vocabulary.find(t=>t.id===resolved.target_id&&!t.exact_location):context.places.find(p=>p.id===resolved.target_id);
    if(!target)throw error('VOCABULARY_REVIEW','Válassz meglévő leíró címkét vagy pontos helyszínt. Új szótári elemet/helyet külön kell jóváhagyni.',400);
    resolved.target_label=target.breadcrumb||target.hu_name||target.name;
    return resolved;
  }
  async function preview(body){
    shape(body,['operation','actions']);if(isBusy())throw error('BUSY','Más katalógusművelet fut.',409);
    const actions=selection(body),context=analysis.catalogueContext(),resolved=actions.map(a=>resolve(a,body.operation,context)),items=new Map();
    for(const action of resolved)if(!items.has(action.item_id)){
      const item=analysis.getItem(action.item_id);
      if(body.operation==='accept'){
        await analysis.source.read(item.media_id,JSON.parse(item.source_json));
        const current=analysis.binding(item.media_id,context);if(digest(current)!==digest(JSON.parse(item.context_json)))throw error('STALE_CONTEXT','A kép, a szótár, a helyszínfa vagy a hozzárendelés változott. Előbb illeszd újra az eredményt.',409);
        items.set(item.id,{item_id:item.id,media_id:item.media_id,source_hash:digest(JSON.parse(item.source_json)),context:current});
      }else items.set(item.id,{item_id:item.id,media_id:item.media_id,match_hash:item.match_hash});
    }
    const bound={operation:body.operation,actions:resolved,items:[...items.values()]};return {...bound,preview_hash:digest(bound),notes_changed:false,sorting_changed:false,canon_changed:false};
  }
  async function apply(body){
    shape(body,['operation','actions','preview_hash','request_key']);key(body.request_key);
    const actions=selection(body),requestHash=digest({operation:body.operation,actions,preview_hash:body.preview_hash}),prior=one('SELECT * FROM media_analysis_decisions WHERE request_key=?',body.request_key);
    if(prior){if(prior.request_hash!==requestHash)throw error('CONFLICT','Ez a műveleti azonosító más jóváhagyáshoz tartozik.',409);return {...JSON.parse(prior.result_json),replayed:true,status:prior.status};}
    const plan=await preview({operation:body.operation,actions});if(plan.preview_hash!==body.preview_hash)throw error('STALE_PREVIEW','A jóváhagyási előnézet megváltozott. Ellenőrizd újra.',409);
    const id=randomUUID(),result={decision_id:id,added_tags:0,added_locations:0,reviewed:plan.actions.length};
    transaction(()=>{
      if(isBusy())throw error('BUSY','Más katalógusművelet fut.',409);
      const current=analysis.catalogueContext();for(const bound of plan.items){const item=analysis.getItem(bound.item_id);if(body.operation==='accept'&&digest(analysis.binding(item.media_id,current))!==digest(bound.context))throw error('STALE_CONTEXT','A katalógus megváltozott. Készíts új előnézetet.',409);}
      for(const action of plan.actions){const live=one('SELECT * FROM media_analysis_proposals WHERE id=?',action.proposal_id);if(live.status!=='pending'||live.match_hash!==action.match_hash||digest(JSON.parse(live.payload_json))!==action.payload_hash)throw error('STALE_PROPOSAL','A javaslat közben megváltozott.',409);}
      run("INSERT INTO media_analysis_decisions VALUES(?,?,?,?,?,'applied',?,?,?)",id,body.request_key,requestHash,plan.preview_hash,body.operation,JSON.stringify(plan),JSON.stringify(result),new Date().toISOString());
      for(const action of plan.actions){
        if(body.operation==='accept'){
          if(action.kind==='tag'){
            if(Number(run('INSERT OR IGNORE INTO media_tags VALUES(?,?)',action.media_id,action.target_id).changes)){run('INSERT INTO media_analysis_tag_links VALUES(?,?,?)',action.media_id,action.target_id,id);result.added_tags++;}
          }else{
            const existing=one('SELECT 1 FROM media_locations WHERE media_id=? AND location_id=? UNION ALL SELECT 1 FROM media_location_links WHERE media_id=? AND location_id=?',action.media_id,action.target_id,action.media_id,action.target_id);
            if(!existing){const primary=!one('SELECT 1 FROM media_locations WHERE media_id=?',action.media_id);run(primary?'INSERT INTO media_locations VALUES(?,?)':'INSERT INTO media_location_links VALUES(?,?)',action.media_id,action.target_id);run('INSERT INTO media_analysis_place_links VALUES(?,?,?,?)',action.media_id,action.target_id,id,primary?1:0);result.added_locations++;}
          }
        }
        run('UPDATE media_analysis_proposals SET status=? WHERE id=?',body.operation==='accept'?'accepted':'rejected',action.proposal_id);
      }
      run('UPDATE media_analysis_decisions SET result_json=? WHERE id=?',JSON.stringify(result),id);
    });return result;
  }
  function rollback(body){
    shape(body,['decision_id']);if(typeof body.decision_id!=='string')throw error('INVALID_ARGUMENT','Válassz jóváhagyási műveletet.');
    if(isBusy())throw error('BUSY','Más katalógusművelet fut.',409);
    return transaction(()=>{
      const decision=one('SELECT * FROM media_analysis_decisions WHERE id=?',body.decision_id);if(!decision)throw error('NOT_FOUND','A művelet nem található.',404);
      if(decision.status==='rolled_back')return {...JSON.parse(decision.result_json),replayed:true};
      const result={decision_id:decision.id,removed_tags:0,removed_locations:0,preserved_conflicts:0};
      for(const link of all('SELECT * FROM media_analysis_tag_links WHERE decision_id=?',decision.id))result.removed_tags+=Number(run('DELETE FROM media_tags WHERE media_id=? AND tag_id=?',link.media_id,link.tag_id).changes);
      for(const link of all('SELECT * FROM media_analysis_place_links WHERE decision_id=? ORDER BY is_primary',decision.id)){
        const table=link.is_primary?'media_locations':'media_location_links';
        if(link.is_primary&&one('SELECT 1 FROM media_location_links WHERE media_id=? LIMIT 1',link.media_id)){result.preserved_conflicts++;run('DELETE FROM media_analysis_place_links WHERE media_id=? AND location_id=?',link.media_id,link.location_id);continue;}
        result.removed_locations+=Number(run(`DELETE FROM ${table} WHERE media_id=? AND location_id=?`,link.media_id,link.location_id).changes);
      }
      for(const action of JSON.parse(decision.selection_json).actions){const proposal=one('SELECT * FROM media_analysis_proposals WHERE id=?',action.proposal_id);if(!proposal)continue;const item=analysis.getItem(proposal.item_id);if(proposal.status===(decision.operation==='accept'?'accepted':'rejected'))run('UPDATE media_analysis_proposals SET status=? WHERE id=?',item.match_hash===proposal.match_hash?'pending':'stale',proposal.id);else result.preserved_conflicts++;}
      run("UPDATE media_analysis_decisions SET status='rolled_back',result_json=? WHERE id=?",JSON.stringify(result),decision.id);return result;
    });
  }
  return {preview,apply,rollback,history:()=>all('SELECT id,operation,status,result_json,created_at FROM media_analysis_decisions ORDER BY rowid DESC LIMIT 100').map(d=>({...d,result:JSON.parse(d.result_json),result_json:undefined}))};
}
