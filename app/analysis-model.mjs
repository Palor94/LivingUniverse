import {createHash} from 'node:crypto';
import {hashtagKey} from './note-tags.mjs';
import {validateSceneDetails} from './analysis-scene.mjs';
import {validateWorldDetails} from './analysis-world.mjs';

export const analysisCategories=['angle','framing','expression','pose','clothing','lighting','background','action','reference_use'];
export const analysisDefaultGoals=['background','action','angle','framing','reference_use'];
export const analysisVersions=Object.freeze({prompt:'media-analysis-3',preprocess:'reference-2048-jpeg-1',schema:1});
export const analysisDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const analysisHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const analysisError=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const bad=()=>{throw analysisError('INVALID_RESULT','A provider eredménye nem felel meg az elemzési sémának.');};
const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))bad();};
const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v))bad();return v.normalize('NFC').trim();};
const uuid=v=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))bad();return v;};
function evidence(v){
  if(typeof v.uncertain!=='boolean')bad();const out={hu:text(v.hu,100),en:text(v.en,100),evidence:text(v.evidence,1000),uncertain:v.uncertain};if(!out.hu||!out.en)bad();
  if(v.region!==undefined&&v.region!==null){object(v.region,['x','y','width','height']);for(const k of ['x','y','width','height'])if(!Number.isFinite(v.region[k])||v.region[k]<0||v.region[k]>1)bad();if(!v.region.width||!v.region.height||v.region.x+v.region.width>1||v.region.y+v.region.height>1)bad();out.region={...v.region};}
  return out;
}
export function validateAnalysisResult(value){
  let size;try{size=Buffer.byteLength(JSON.stringify(value));}catch{bad();}if(size>65536)bad();
  object(value,['schema','description','background','observations','tags','locations','scene_details','world_details','usage']);if(value.schema!==1)bad();
  object(value.description,['hu','en']);object(value.background,['kind','hu','en']);if(!['neutral','scene','mixed','uncertain'].includes(value.background.kind))bad();
  const result={schema:1,description:{hu:text(value.description.hu,4000),en:text(value.description.en,4000)},background:{kind:value.background.kind,hu:text(value.background.hu,100),en:text(value.background.en,100)}};
  for(const [key,max]of [['observations',30],['tags',60],['locations',20]]){
    if(!Array.isArray(value[key])||value[key].length>max)bad();result[key]=value[key].map(v=>{
      object(v,key==='locations'?['hu','en','evidence','uncertain','region','location_id']:['category','hu','en','evidence','uncertain','region',...(key==='tags'?['tag_id']:[])]);
      const out=evidence(v);if(key!=='locations'){if(!analysisCategories.includes(v.category))bad();out.category=v.category;}
      if(v.tag_id!==undefined&&v.tag_id!==null)out.tag_id=text(v.tag_id,200);if(v.location_id!==undefined&&v.location_id!==null)out.location_id=uuid(v.location_id);return out;
    });
  }
  if(value.scene_details!==undefined)result.scene_details=validateSceneDetails(value.scene_details,result.background.kind);
  if(value.world_details!==undefined)result.world_details=validateWorldDetails(value.world_details,result.scene_details);
  if(value.usage!==undefined){object(value.usage,['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_output_tokens']);const u=value.usage;if(Object.keys(u).length!==5||Object.values(u).some(n=>!Number.isSafeInteger(n)||n<0)||u.total_tokens!==u.input_tokens+u.output_tokens||u.cached_input_tokens>u.input_tokens||u.reasoning_output_tokens>u.output_tokens)bad();result.usage={...u};}
  return result;
}
const preferredGroups={angle:'group-angle',framing:'group-framing',expression:'group-expression',pose:'group-pose',action:'group-pose',reference_use:'group-reference',clothing:'group-clothing',background:'group-setting'};
export function matchAnalysisResult(result,vocabulary,places,goals=analysisCategories){
  const proposals=[],seen=new Set();
  const push=p=>{const key=analysisDigest([p.kind,p.target_id||null,p.target_id?null:p.category||null,p.target_id?null:[hashtagKey(p.hu),hashtagKey(p.en)]]);if(seen.has(key)){const old=proposals.find(p=>p.key===key);old.uncertain=old.uncertain||p.uncertain;return;}seen.add(key);proposals.push({...p,key});};
  const tags=result.tags.filter(t=>goals.includes(t.category));
  if(goals.includes('background')&&result.background.kind!=='neutral'&&!tags.some(t=>t.category==='background')&&(result.background.hu||result.background.en))tags.push({category:'background',hu:result.background.hu,en:result.background.en,evidence:'A provider háttérkategóriája.',uncertain:result.background.kind!=='scene'});
  for(const tag of tags){
    if(tag.category==='background'&&result.background.kind==='neutral'){push({...tag,kind:'tag',target_id:null,candidate_ids:[],resolution:'excluded',reason:'neutral_background'});continue;}
    const keys=new Set([tag.hu,tag.en].filter(Boolean).map(hashtagKey));
    const explicit=tag.tag_id?vocabulary.filter(t=>t.id===tag.tag_id):[];let candidates=explicit;
    if(!candidates.length)candidates=vocabulary.filter(t=>[t.name,t.hu_name||'',t.en_name||'',...t.aliases.map(a=>a.alias)].some(v=>keys.has(hashtagKey(v))));
    const preferred=candidates.filter(t=>t.group_id===preferredGroups[tag.category]);if(!explicit.length&&preferred.length)candidates=preferred;
    const valid=candidates.filter(t=>!t.exact_location),unique=candidates.length===1&&valid.length===1;
    push({...tag,kind:'tag',uncertain:tag.uncertain||tag.category==='background'&&result.background.kind!=='scene',target_id:unique?valid[0].id:null,candidate_ids:valid.map(t=>t.id),resolution:unique?'matched':candidates.length?'ambiguous':'unknown',reason:candidates.some(t=>t.exact_location)?'exact_place_label':unique?'existing_tag':'vocabulary_review'});
  }
  for(const place of goals.includes('background')?result.locations:[]){
    const keys=new Set([place.hu,place.en].filter(Boolean).map(hashtagKey));
    const candidates=places.filter(p=>place.location_id?p.id===place.location_id:[p.name,p.english_name,p.breadcrumb].some(v=>keys.has(hashtagKey(v||''))));
    const exact=!!place.location_id&&candidates.length===1;
    push({...place,kind:'location',target_id:exact?candidates[0].id:null,candidate_ids:candidates.map(p=>p.id),uncertain:place.uncertain||!exact||result.background.kind!=='scene',resolution:exact?'matched':candidates.length?'choose_place':'unknown',reason:exact?'existing_place':candidates.length?'qualified_place_required':'new_place_review'});
  }
  return proposals;
}

export function createMockAnalysisProvider(){
  return {id:'mock',version:'1',model:'deterministic-fixture',local:true,mock:true,
    async analyzeImage({goals,signal}){
      signal.throwIfAborted();const fixture=(category,hu,en,uncertain=false)=>({category,hu,en,evidence:'MOCK tesztérték; nem a kép tartalmának felismerése.',uncertain});
      const observations=[fixture('angle','Szemből','frontal'),fixture('framing','Portré','portrait'),fixture('expression','Semleges','neutral'),fixture('pose','Álló testhelyzet','standing',true),fixture('clothing','Tesztöltözet','fixture clothing',true),fixture('lighting','Szórt fény','diffuse lighting',true),fixture('background','Kertes környezet','garden setting',true),fixture('action','Áll','standing',true),fixture('reference_use','Testarány-referencia','body',true)].filter(t=>goals.includes(t.category));
      return {schema:1,description:{hu:'MOCK — rögzített teszteredmény. A képet valódi AI nem elemezte.',en:'MOCK — fixed fixture output. No actual visual recognition.'},background:{kind:'scene',hu:'Kertes környezet',en:'garden setting'},observations,tags:observations,locations:goals.includes('background')?[{hu:'Tesztkert',en:'Fixture garden',evidence:'MOCK helyszínjavaslat, nem felismerés.',uncertain:true}]:[]};
    }
  };
}
