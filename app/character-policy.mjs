import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Owner decision 2026-11-10: every character is male by default; an unknown gender counts as
// male (no clarification step). Female characters remain refused.
export const policyMessage='A Living Universe nem hozhat létre, generálhat vagy fogadhat el női karaktert. Minden szereplő alapértelmezésben férfi; ha a nem nincs megadva, férfinak számít. Férfinak számít a „hím” is, és minden lény, akinek pénisze és heréi vannak, bármilyen megfogalmazásban. Új profil életrajzában a „Nem: férfi.” (vagy „Nem: hím.”, „Nem: nem-bináris.”) sor szerepel.';
export const identityHash=value=>createHash('sha256').update(String(value).normalize('NFKC').trim().toLocaleLowerCase('hu').replace(/\s+/g,' ')).digest('hex');
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('hu');
// Owner 2026-11-14: anything male counts as a man in every rule, whatever the wording: "hím",
// "hímnemű", or a description with a penis and testicles (fantasy and other non-human beings
// included). In a gender value these male markers win over female words ("hím, nőies vonásokkal").
export const MALE_START=/^(?:férfi|male|man|nonbinary|non-binary|nem-bináris|hím|hímnemű)(?:$|[^\p{L}])/u;
export const MALE_ANY=/(?:^|[^\p{L}])(?:férfi|male|hím|hímnemű|pénisz\p{L}*|hímvessző\p{L}*|herék|heréi|heréje|herezacskó\p{L}*|penis|testicles?)(?:$|[^\p{L}])/u;
const FEMALE_WORDS=/(?:^|[^\p{L}])(?:nő|női|nőként|female|woman|women|girl|feminine)(?:$|[^\p{L}])/u;
// maleFirst false: the old order (female words decide), used for the opening sentence of a life
// story, where other people are mentioned too ("férfi barátja van" must not clear a woman).
export function genderClass(value,{maleFirst=true}={}){
  const v=normalize(value).replace(/\[[^\]]*\]/g,'').trim();
  if(maleFirst&&(MALE_START.test(v)||MALE_ANY.test(v)))return 'non_female';
  if(FEMALE_WORDS.test(v))return 'female';
  if(MALE_START.test(v))return 'non_female';
  return 'unknown';
}
function declaredGender(c){
  for(const field of ['biography','appearance']){
    const text=String(c[field]??'');
    const markers=[...text.matchAll(/(?:^|\n)\s*(?:nem|gender)\s*:\s*([^\n]+)/giu)].map(m=>genderClass(m[1]));
    if(markers.includes('female'))return 'female';
    // A "Nem:" line is a gender value (male markers win there, 2026-11-14); only an opening
    // sentence that is not itself such a line is read with the life-story rule.
    const firstSentence=text.split(/[.\n]/u)[0];
    if(!/^\s*(?:nem|gender)\s*:/iu.test(firstSentence)&&genderClass(firstSentence,{maleFirst:false})==='female')return 'female';
    if(markers.length)return markers.every(v=>v==='non_female')?'non_female':'unknown';
    // Only the "Nem:" marker and the opening sentence describe the character's own gender.
    // Scanning the whole text misread mentions of other people ("női kolléga") as the
    // character being female (Pákozdi, 2026-11-11).
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
    if(blockedIds.has(c.id)||[c.name,...String(c.aliases??'').split(/[,\n]/u)].map(n=>String(n??'').trim()).filter(Boolean).some(n=>blocked.has(identityHash(n))))deny();
    if(declaredGender(c)==='female')deny();
  }
  function assertValues(values,cid,{requireKnown=false}={}){
    if(!enabled)return;
    const proposed=values?.gender?.value;
    if(proposed!==undefined&&genderClass(proposed)==='female')deny();
    if(requireKnown){
      const c=one('SELECT * FROM characters WHERE id=?',cid);if(!c)deny();assertProfile(c);
      const saved=one('SELECT value FROM application_settings WHERE key=?','ghost:character:'+cid);
      const gender=proposed??(saved?JSON.parse(saved.value).values?.gender?.value:undefined);
      if(gender!==undefined?genderClass(gender)==='female':declaredGender(c)==='female')deny();
    }
    for(const key of ['identity','appearance_summary'])if(values?.[key]?.value)assertProfile({biography:values[key].value});
  }
  function assertGeneration(cid){assertValues({},cid,{requireKnown:true});}
  // "nő" is also the verb "grows": common verb phrases ("magasra nő", "nő ki") are not a woman.
  const GROW_VERB=/(?:^|[^\p{L}])(?:magasra|nagyra|tovább|egyre|gyorsan|lassan|ki|fel|meg|benő|kinő)\s+nő(?=$|[^\p{L}])|(?:^|[^\p{L}])nő\s+(?:ki|fel|meg|tovább)(?=$|[^\p{L}])/giu;
  function assertPrompt(prompt){if(enabled&&/(?:^|[^\p{L}])(?:nő|nők|női|lány|lányok|woman|women|female|girl|girls)(?:$|[^\p{L}])/iu.test(String(prompt).replace(GROW_VERB,' ')))deny();}
  const description=enabled?{reject_female_characters:true,unknown_gender_default:'male',instructions:policyMessage}:null;
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
