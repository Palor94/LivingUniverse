// Play mode rules and prompt wording that do not depend on the database (split from
// play-mode.mjs, 2026-11-11). Hungarian texts go to Grok as they are.
import {clip} from '../world-common.mjs';

export const ROLE_TEXT={work:'Dolgozik.',home:'Otthon van.',routine:'Itt tölti az idejét.',other:'Éppen itt van.'};
// Mood of the day from today's events: a light word count, shown on arrival and given to
// the conversation so he is not cheerful after a fight.
export const GOOD=/örül|nevet|jó|kellemes|sikerül|boldog|ünnep|barátság|segít|mosoly|élvez/i,BAD=/veszeked|dühös|ideges|fáradt|szomorú|bántó|sérül|feszült|csalód|vitatkoz|kudarc|stressz/i;
export function moodOf(events){
  let g=0,b=0;for(const e of events){const s=(e.title||'')+' '+(e.summary||'');if(GOOD.test(s))g++;if(BAD.test(s))b++;}
  return b>g?{key:'bad',text:'rosszkedvű, feszült vagy fáradt'}:g>b?{key:'good',text:'jókedvű'}:{key:'neutral',text:'átlagos'};
}
// How someone at a given closeness level talks to Palor (keeps the voice believable).
export const LEVEL_STYLE={'-2':'ellenséges: hideg, gyanakvó vagy támadó, nem kedveskedik','-1':'feszült: kurta, ingerült, óvatos','0':'idegen: udvarias, de távolságtartó, nem mesél magáról sokat','1':'ismerős: barátságos, de még kicsit tartózkodó','2':'barátságos: közvetlen, szívesen beszélget','3':'barát: laza, nyílt, ugrat, megosztja a gondjait','4':'bizalmas: őszinte, személyes, figyel Palorra','5':'szerető: gyengéd, közeli, kívánja Palor társaságát'};
// What closeness allows in a conversation. Consent is always the character's own choice.
export const CLOSENESS_RULES={
  none:'Most rosszban vagytok: ha Palor közeledik, a jellemed szerint reagálj.',
  flirt:'A beszélgetés lehet nyíltan szexuális töltetű, flörtölhettek; hogy meddig mész, a jellemed és a vágyaid döntik el.',
  intimate:'Szexuális jelenet két beleegyező felnőtt között: írd nyíltan, kendőzetlenül, a saját hangodon. A vágyaid és a profilodban leírt szexuális preferenciáid szerint cselekedj, kezdeményezhetsz is; ha nem akarod, nemet mondhatsz.',
  // Owner decision 2026-11-15: from open hostility too, but then angry and rough in tone.
  hostile:'Köztetek nyílt ellenségesség van. Ebből is kialakulhat szexuális jelenet két beleegyező felnőtt között, de akkor annak hangulata dühös, indulattal teli és durva: gyűlölködő vágy, csípős, sértő szavak, hevesség, erőfitogtatás. Írd nyíltan, kendőzetlenül, a saját hangodon. Csak akkor történik meg, ha te is akarod; kezdeményezhetsz is, nemet is mondhatsz, és ha Palor megáll vagy nemet mond, azt tiszteletben tartod.'
};
export const TIME_MOOD=['reggel van: még ébredezik, siet vagy kávézik','délután van: a nap közepén jár, a teendőivel van elfoglalva','este van: lazábban, fáradtabban, kötetlenebbül beszél','késő éjszaka van: fáradt, álmos vagy éppen ébren tartja valami'];
// Photo scenes: the creator's own pictures of this character, preferably at the current
// place and with Palor in them, with where the character stands in the picture (exact
// box when confirmed, else left/centre/right) so a speech bubble can point at him.
// Collages, generation plans, reference shots and backgrounds are never scenes.
export function anchorOf(participants,cid){
  const p=(participants||[]).find(x=>x.character_id===cid&&!x.ignored);if(!p)return null;
  const r=p.region,side=/bal/i.test(p.description||'')?'left':/jobb/i.test(p.description||'')?'right':'center';
  return r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)?{x:r.x,y:r.y,width:r.width,height:r.height,side}:{side};
}
// The highest content level each intimacy stage allows: none → everyday only, flirt →
// nudity, intimate → explicit (analysis levels: non_intimate / nudity / sexual_activity).
export const STAGE_ALLOW={none:'non_intimate',flirt:'nudity',intimate:'sexual_activity'};
// Scene beats of an in-person conversation and the content level each one wants (0 everyday,
// 1 nudity, 2 explicit); the stage still caps what may be shown.
export const BEATS=['talk','flirt','kiss','undress','sex','after'],BEAT_WANT={talk:0,flirt:0,kiss:0,undress:1,sex:2,after:1};
export const MAX_DAILY_RISES=3;
export const PACES=['slower','continue','stop'],PACE_TEXT={slower:'*Palor lassít, és csak gyengéden közel marad hozzád.*',continue:'*Palor közelebb húz, és folytatná.*',stop:'*Palor megáll, és megkérdezi, minden rendben van-e.*'};
export const cleanChoices=v=>(Array.isArray(v)?v:[]).filter(x=>typeof x==='string').map(x=>clip(x.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,'').trim(),160)).filter(Boolean).slice(0,3);
// Pictures he sends by phone: the reply says what kind ("everyday" / "flirt" / "intimate"),
// capped by the intimacy stage; the director picks one of his own (phone panel: him alone,
// portrait format), not one he already sent in this chat.
export const PHONE_MOODS={none:['everyday'],flirt:['everyday','flirt'],intimate:['everyday','flirt','intimate']};
