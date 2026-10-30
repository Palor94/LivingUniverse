import {appearanceFieldGuidance} from './public/profile-appearance-guide.js';
import {normalizeGhostValues} from './public/ghost-import.js';
import {randomUUID} from 'node:crypto';
import {digest,profileVersion} from './character-edit.mjs';
import {validateTemplatePatch,applyTemplatePatch} from './profile-template.mjs';

const text=(id,label,group,source)=>({id,label,group,type:'text',...(source?{source}:{})});
const scale=(id,label,group,max=10)=>({id,label,group,type:'scale',max});
const appearanceGuidance=appearanceFieldGuidance();
export const templateCharacter={id:'system:ghost-profile',name:'Szellemprofil',playable:false,role:'profile_template'};
export const sexualPreferenceFields=[
  text('sexual_penis_use','Pénisz használatával kapcsolatos preferenciák','Szexuális preferenciák'),
  text('sexual_anal_use','Végbéltájék használatával kapcsolatos preferenciák','Szexuális preferenciák'),
  text('sexual_tongue_use','Nyelv használatával kapcsolatos preferenciák','Szexuális preferenciák'),
  text('sexual_hand_use','Kéz használatával kapcsolatos preferenciák','Szexuális preferenciák')
];
export const defaultTemplate={version:1,fields:[
  text('birth_date','Születési dátum (ha ismert)','Alapok'),text('gender','Nem / önmeghatározás','Alapok'),text('occupation','Foglalkozás','Alapok'),text('residence','Lakóhely','Alapok'),text('origin','Technikai eredet és proveniencia','Alapok'),
  text('identity','Életrajz és életkörülmények','Alapok','biography'),text('appearance_summary','Rövid megjelenés','Megjelenés','appearance'),text('appearance_detail','Részletes megjelenés','Megjelenés'),text('anatomy','Részletes anatómiai alprofil','Megjelenés'),
  text('personality','Személyiség összefoglaló','Személyiség','personality'),
  ...[['extraversion','Extraverzió'],['agreeableness','Együttműködés'],['conscientiousness','Lelkiismeretesség'],['emotional_stability','Érzelmi stabilitás'],['openness','Nyitottság']].map(([id,label])=>scale(id,label,'Big Five')),
  ...[['security','Biztonság / önfenntartás'],['attachment','Kapcsolódás / kötődés'],['reward','Öröm / jutalomkeresés'],['autonomy','Autonómia / kompetencia'],['recognition','Önértékelés / elismerés']].map(([id,label])=>scale(id,label,'Motiváció')),
  text('goals','Tudatos célok és belső késztetések','Motiváció'),text('conflicts','Belső konfliktusok','Motiváció'),text('fears','Félelmek és elkerülések','Motiváció'),text('coping','Megküzdés','Motiváció'),
  text('speech','Kommunikáció és konkrét párbeszédpéldák','Kommunikáció','speech_style'),text('relationship_speech','Kapcsolatspecifikus kommunikáció','Kommunikáció'),
  ...[['bluntness','Nyersesség'],['attentiveness','Figyelmesség'],['directness','Közvetlenség'],['sarcasm','Szarkazmus'],['expressiveness','Érzelmi kifejezés']].map(([id,label])=>scale(id,label,'Kommunikáció')),
  text('sexuality','Szexualitás és intimitás','Intimitás','sexuality'),
  text('orientation','Orientáció / önmeghatározás','Intimitás'),text('attraction','Megélt vonzalmak és ambivalencia','Intimitás'),text('presented_sexuality','Mások felé mutatott önkép','Intimitás'),text('intimacy','Preferenciák és intimitáshoz való hozzáállás','Intimitás'),
  ...sexualPreferenceFields,
  scale('mood_reactivity','Hangulati reaktivitás','Érzelmi működés'),text('emotional_traits','Érzelmi / viselkedési sajátosságok','Érzelmi működés'),
  scale('emotional_memory','Érzelmi emlékek tartóssága','Memóriahajlam',5),scale('grievances','Sérelmek megőrzése','Memóriahajlam',5),scale('memory_bias','Emlékezeti torzítás','Memóriahajlam',5),
  text('memory_traits','Emlékezeti sajátosságok','Memóriahajlam'),text('weekly_routine','Rugalmas heti rutin','Életvitel'),text('habits','Személyes szokások','Életvitel') ].map(f=>({...f,...(appearanceGuidance[f.id]?{guidance:appearanceGuidance[f.id]}:{})}))};
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateTemplate(t){
  if(!object(t)||!Array.isArray(t.fields)||!t.fields.length||t.fields.length>100)throw error('A sablon 1–100 mezőt tartalmazhat.');
  const ids=new Set();for(const f of t.fields){if(!object(f)||Object.keys(f).some(k=>!['id','label','group','type','max','source','guidance'].includes(k))||!(/^[a-z][a-z0-9_]{0,63}$/).test(f.id)||ids.has(f.id)||!['text','scale'].includes(f.type)||typeof f.label!=='string'||!f.label.trim()||f.label.length>150||typeof f.group!=='string'||f.group.length>100||f.type==='scale'&&![5,10].includes(f.max)||f.source&&!['biography','personality','appearance','speech_style','sexuality'].includes(f.source))throw error('Érvénytelen vagy ismétlődő sablonmező.');if(f.guidance!==undefined&&(typeof f.guidance!=='string'||f.guidance.length>20000))throw error('A kitöltési útmutató legfeljebb 20000 karakteres szöveg lehet.');ids.add(f.id);}
  return t;
}
export function validateEntry(e,f){
  const prefix=(f?.label||f?.id||'Ismeretlen mező')+': ';
  if(!object(e))throw error(prefix+'a mező értéke nem objektum.');
  const unknown=Object.keys(e).filter(k=>!['value','interpretation','kind','source','visibility'].includes(k));if(unknown.length)throw error(prefix+'ismeretlen tulajdonság: '+unknown.join(', '));
  if(!['fact','impression','hypothesis'].includes(e.kind))throw error(prefix+'az állítástípus (kind/type) fact, impression vagy hypothesis lehet.');
  if(!['creator','public'].includes(e.visibility))throw error(prefix+'a visibility creator vagy public lehet.');
  for(const key of ['source','interpretation'])if(typeof e[key]!=='string'||e[key].length>4000)throw error(prefix+'a '+key+' mező szövegként szükséges (legfeljebb 4000 karakter).');
  if(f.type==='scale'?(e.value!==null&&(!Number.isFinite(e.value)||e.value<0||e.value>f.max)):(typeof e.value!=='string'||e.value.length>30000))throw error(prefix+(f.type==='scale'?'a value 0–'+f.max+' közötti szám vagy null lehet.':'a value szöveg lehet (legfeljebb 30000 karakter).'));
  return e;
}
// Additive, portable records use the existing backed-up settings table. No character
// columns, media, relationships or appearance-canon records are rewritten.
export function installGhostProfiles({one,run,transaction}){
  const read=(key,fallback)=>{const row=one('SELECT value FROM application_settings WHERE key=?',key);return row?JSON.parse(row.value):structuredClone(fallback);};
  const write=(key,value)=>run('INSERT INTO application_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
  const template=()=>({...read('ghost:template',defaultTemplate),character:templateCharacter});
  function get(cid){const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)throw error('Nincs ilyen karakter.',404);const record=read('ghost:character:'+cid,{version:0,values:{},history:[],proposals:[]});return {...record,template:template(),character_id:cid,profile_version:profileVersion(c),legacy:Object.fromEntries(['biography','appearance','personality','speech_style','sexuality'].map(k=>[k,c[k]||'']))};}
  function persistTemplate(body,actor='local-creator'){
    const old=template();if(body.expected_version!==old.version)throw error('A sablon közben megváltozott.',409);
    const next=validateTemplate({version:old.version+1,fields:body.fields});
    for(const f of old.fields){const n=next.fields.find(n=>n.id===f.id);if(!n||n.type!==f.type||n.max!==f.max)throw error('A meglévő mezők azonosítója, típusa és skálája megőrzendő.');}
    write('ghost:template-history:'+next.version,{previous:old,next,actor,at:new Date().toISOString()});write('ghost:template',next);return next;
  }
  function saveTemplate(body,actor='local-creator'){return transaction(()=>persistTemplate(body,actor));}
  function updateTemplate(args,actor='mcp-trusted'){
    const requestHash=validateTemplatePatch(args);
    return transaction(()=>{
      const key='ghost:template-request:'+args.request_key,prior=read(key,null);
      if(prior){if(prior.request_hash!==requestHash)throw Object.assign(error('This request_key belongs to a different template edit.',409),{code:'IDEMPOTENCY_CONFLICT'});return prior.receipt;}
      const old=template(),patch=applyTemplatePatch(old,args);
      // Reuse the same validator, version history and persistence as the creator UI.
      const next=patch.changed?persistTemplate({expected_version:args.expected_version,fields:patch.fields},actor):old;
      const receipt={applied:true,changed:patch.changed,template_version:next.version,previous_version:old.version,request_key:args.request_key,scope:'shared_all_characters',updated_field_ids:patch.updated,added_field_ids:patch.added,reordered:patch.reordered,field_count:next.fields.length,character_values_unchanged:true,canon_unchanged:true};
      write(key,{request_hash:requestHash,receipt,actor,at:new Date().toISOString()});return receipt;
    });
  }
  function propose(cid,body){return transaction(()=>{const current=get(cid);if(body.expected_version!==current.version||body.template_version!==current.template.version||body.profile_version!==current.profile_version)throw error('A profil vagy sablon közben megváltozott. Töltsd újra.',409);
    let values=normalizeGhostValues(body.values,current.template.fields);
    if(body.from_legacy===true){values={};for(const f of current.template.fields)if(f.source&&current.legacy[f.source]&&!current.values[f.id])values[f.id]={value:current.legacy[f.source],interpretation:'Változtatás nélkül átvett meglévő munkaszöveg.',kind:'hypothesis',source:'Meglévő profil: '+f.source,visibility:'creator'};}
    if(!object(values)||!Object.keys(values).length||Object.keys(values).length>100||typeof body.model!=='string'||!body.model.trim()||body.model.length>200)throw error('Adj meg javaslatokat és forrásmodell-nevet.');
    for(const [id,e] of Object.entries(values)){const f=current.template.fields.find(f=>f.id===id);if(!f)throw error('Ismeretlen sablonmező.');validateEntry(e,f);}
    const duplicate=current.proposals.find(p=>p.status==='pending'&&p.base_version===current.version&&p.template_version===current.template.version&&p.profile_version===current.profile_version&&p.model===body.model&&digest(p.values)===digest(values));if(duplicate)return duplicate;
    const p={id:randomUUID(),base_version:current.version,template_version:current.template.version,profile_version:current.profile_version,values,model:body.model,status:'pending',at:new Date().toISOString()};
    const {template:t,character_id,profile_version,legacy,...record}=current;record.proposals.push(p);write('ghost:character:'+cid,record);return p;});}
  function decide(cid,pid,body,actor='local-creator'){return transaction(()=>{const current=get(cid),p=current.proposals.find(p=>p.id===pid);if(!p)throw error('Nincs ilyen javaslat.',404);if(p.status!=='pending')throw error('A javaslat már elbírált.',409);if(!['accept','reject'].includes(body.decision))throw error('Válassz elfogadást vagy elutasítást.');
    const {template:t,character_id,profile_version,legacy,...record}=current;
    if(body.decision==='accept'){
      if(body.expected_version!==current.version||p.base_version!==current.version||p.template_version!==t.version||p.profile_version!==profile_version)throw error('A javaslat alapjául szolgáló adat megváltozott. Készíts friss javaslatot.',409);
      if(!object(body.values)||!Object.keys(body.values).length)throw error('Válassz legalább egy mezőt.');
      for(const [id,e] of Object.entries(body.values)){if(!Object.hasOwn(p.values,id))throw error('Csak a javasolt mezők fogadhatók el.');validateEntry(e,t.fields.find(f=>f.id===id));}
      record.history.push({version:current.version,values:current.values,actor,proposal_id:pid,at:new Date().toISOString()});record.values={...record.values,...body.values};record.version++;p.accepted_values=body.values;
    }
    p.status=body.decision==='accept'?'accepted':'rejected';p.decided_at=new Date().toISOString();p.actor=actor;write('ghost:character:'+cid,record);return get(cid);});}
  return {get,template,saveTemplate,updateTemplate,propose,decide,handle({p,req,body,json}){
    if(p==='/api/ghost-template'){if(req.method==='GET'){json(template());return true;}if(req.method==='PUT'){json(saveTemplate(body));return true;}}
    const m=p.match(/^\/api\/characters\/([a-f0-9-]{36})\/ghost(?:\/proposals(?:\/([a-f0-9-]{36})\/decision)?)?$/i);if(!m)return false;
    if(req.method==='GET'&&!p.endsWith('/proposals')&&!m[2])json(get(m[1]));else if(req.method==='POST'&&m[2])json(decide(m[1],m[2],body));else if(req.method==='POST'&&p.endsWith('/proposals'))json(propose(m[1],body));else throw error('Nem támogatott művelet.',405);return true;
  }};
}
