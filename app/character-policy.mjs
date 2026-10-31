import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const policyMessage='A Living Universe nem hozhat létre, generálhat vagy fogadhat el női karaktert. Ismeretlen nem esetén előbb add meg a karakter nemét. Új profil életrajzában használd a „Nem: férfi.” vagy „Nem: nem-bináris.” sort.';
export const identityHash=value=>createHash('sha256').update(String(value).normalize('NFKC').trim().toLocaleLowerCase('hu').replace(/\s+/g,' ')).digest('hex');
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('hu');
export function genderClass(value){
  const v=normalize(value).replace(/\[[^\]]*\]/g,'').trim();
  if(/(?:^|[^\p{L}])(?:nő|női|nőként|female|woman|women|girl|feminine)(?:$|[^\p{L}])/u.test(v))return 'female';
  if(/^(?:férfi|male|man|nonbinary|non-binary|nem-bináris)(?:$|[^\p{L}])/u.test(v))return 'non_female';
  return 'unknown';
}
function declaredGender(c){
  for(const field of ['biography','appearance']){
    const text=String(c[field]??'');
    const markers=[...text.matchAll(/(?:^|\n)\s*(?:nem|gender)\s*:\s*([^\n]+)/giu)].map(m=>genderClass(m[1]));
    if(markers.includes('female'))return 'female';
    const firstSentence=text.split(/[.\n]/u)[0];
    if(genderClass(firstSentence)==='female')return 'female';
    if(markers.length)return markers.every(v=>v==='non_female')?'non_female':'unknown';
    const first=genderClass(text);if(first!=='unknown')return first;
  }
  return 'unknown';
}
export function installCharacterPolicy({db,dataDir,config,one}){
  if(config===undefined){try{config=JSON.parse(readFileSync(path.join(dataDir,'character-policy.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;config={};}}
  const enabled=config?.reject_female_characters===true;
  const deny=()=>{throw Object.assign(new Error(policyMessage),{status:400,code:'CHARACTER_POLICY_REJECTED'});};
  const blocked=new Set(config?.blocked_identity_hashes??[]),blockedIds=new Set(config?.blocked_character_ids??[]);
  function assertProfile(c,{create=false}={}){
    if(!enabled)return;
    if(blockedIds.has(c.id)||[c.name,...String(c.aliases??'').split(',')].filter(Boolean).some(n=>blocked.has(identityHash(n))))deny();
    const gender=declaredGender(c);if(gender==='female'||create&&gender!=='non_female')deny();
  }
  function assertValues(values,cid,{requireKnown=false}={}){
    if(!enabled)return;
    const proposed=values?.gender?.value;
    if(proposed!==undefined&&genderClass(proposed)!=='non_female')deny();
    if(requireKnown){
      const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)deny();assertProfile(c);
      const saved=one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+cid);
      const gender=proposed??(saved?JSON.parse(saved.value).values?.gender?.value:undefined);
      if(gender!==undefined?genderClass(gender)!=='non_female':declaredGender(c)!=='non_female')deny();
    }
    for(const key of ['identity','appearance_summary'])if(values?.[key]?.value)assertProfile({biography:values[key].value});
  }
  function assertGeneration(cid){assertValues({},cid,{requireKnown:true});}
  function assertPrompt(prompt){if(enabled&&/(?:^|[^\p{L}])(?:nő|nők|női|lány|lányok|woman|women|female|girl|girls)(?:$|[^\p{L}])/iu.test(prompt))deny();}
  const description=enabled?{reject_female_characters:true,unknown_gender_requires_review:true,instructions:policyMessage}:null;
  if(enabled){
    // Connection-local triggers cover all application writers, including restore,
    // reconciliation, mobile, MCP and any future SQL path in this process.
    db.function('lu_profile_policy',(id,name,aliases,biography,appearance,create)=>{assertProfile({id,name,aliases,biography,appearance},{create:!!create});return 1;});
    db.function('lu_ghost_policy',(key,value)=>{if(key.startsWith('ghost:character:')){const record=JSON.parse(value);assertValues(record.values);for(const p of record.proposals??[])if(p.status==='pending')assertValues(p.values);}return 1;});
    for(const operation of ['INSERT','UPDATE']){
      db.exec(`CREATE TEMP TRIGGER lu_policy_character_${operation} BEFORE ${operation} ON main.characters BEGIN SELECT lu_profile_policy(NEW.id,NEW.name,NEW.aliases,NEW.biography,NEW.appearance,${operation==='INSERT'?1:0}); END;`);
      db.exec(`CREATE TEMP TRIGGER lu_policy_ghost_${operation} BEFORE ${operation} ON main.application_settings BEGIN SELECT lu_ghost_policy(NEW.key,NEW.value); END;`);
    }
  }
  return {enabled,description,assertProfile,assertValues,assertGeneration,assertPrompt};
}
