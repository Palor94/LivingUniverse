// Play mode rules and prompt wording that do not depend on the database (split from
// play-mode.mjs, 2026-11-11). Hungarian texts go to Grok as they are.
import {clip} from '../world-common.mjs';

export const ROLE_TEXT={work:'Dolgozik.',home:'Otthon van.',routine:'Itt tölti az idejét.',other:'Éppen itt van.'};
// What the player reads about someone at a place (owner, 2026-11-21, "Magyarázatok"): "Dolgozik."
// alone is no information. The line is built from what is already known, without AI: the place
// link's own note (job, habit) and the sentence of his weekly routine that fits this place and
// time. For the screen only; character prompts keep ROLE_TEXT (creator data stays out of them).
const BOILERPLATE=/^(profil alapján|profil-rutin alapján|automatikus|javasolt|\d{4}-\d\d-\d\d)|tulajdonosi kérés/i;
const OWNER_STAMP=/\s*\((?:tulajdonos|owner)[^)]*\)\s*|^\s*tulajdonos:\s*|\s*\(\d{4}-\d\d-\d\d\)\s*/gi;
const WORK=/munk|műszak|dolgoz|üzem|iroda|meló|szolgálat|rendel|ügyel|brigád|osztály/i;
// At home only sentences about home life count; the day part breaks ties.
const HOME=/otthon|alsz|tévé|pihen|vacsor|reggeliz|ébred|főz|zuhany/i,AWAY=/kocsm|edz|pláza|bolt|munk|műszak|szolgálat|metró/i;
const HOME_TIME=[/reggel|korán/i,/délután|napközben/i,/este/i,/éj|hajnal|késő/i];
// A regular haunt: what people do at such a place (an edzőterem is for "edzés", a kocsma for a drink).
const THEMES=[[/edző|terem|sport|stadion|uszod|focipály/i,/edz|foci|sport|fut|úsz|meccs/i],[/kocsm|bár|pub|söröz|borozó|présház|pince/i,/kocsm|sör|fröccs|bor|iszik|ital/i],
  [/kávé|cukrász|presszó/i,/kávé|presszó|újság|sütemény/i],[/park|erdő|tó|liget|kert/i,/park|séta|fut|kutyá|természet|járőr|kirándul/i],
  [/pláza|bolt|piac|market|üzlet/i,/vásárol|bolt|pláza|piac|szünet|dohány|cigaret/i],[/templom|kápolna/i,/mise|templom|imádkoz/i],
  [/műhely|szerelő|garázs/i,/műhely|szerel|javít|autó/i],[/metró|állomás|megálló/i,/metró|vonat|busz|jár/i]];
// Remarks about the data itself ("(a fában ennek csak … része van meg)") are not for the player;
// a quoted full place name keeps only its last part („Káloz - Kocsma”-ban → „Kocsma”-ban).
const tidy=s=>s.replace(/\s*\([^)]*\)/g,'').replace(/„([^”]*)”/g,(m,name)=>'„'+name.split(/\s+-\s+/).at(-1)+'”').replace(/\s+([.,;:])/g,'$1').replace(/\s+/g,' ').trim();
const overlap=(a,b)=>{const w=s=>new Set(s.toLocaleLowerCase('hu').split(/[^a-záéíóöőúüű]+/).filter(x=>x.length>=4).map(x=>x.slice(0,5)));const x=w(a),y=w(b);if(!x.size)return 0;let n=0;for(const v of x)if(y.has(v))n++;return n/x.size;};
const NOW={work:['Reggeli műszakban dolgozik.','Dolgozik.','Még dolgozik.','Éjszakai műszakban dolgozik.'],
  home:['Otthon van, reggel.','Otthon van.','Otthon van, esti pihenő.','Otthon van, éjszaka.'],
  routine:['Szokott helyén, reggel.','Szokott helyén.','Szokott helyén, este.','Szokott helyén, késő éjjel.'],
  other:['Éppen itt van.','Éppen itt van.','Éppen itt van.','Éppen itt van.']};
const cap=s=>s?s[0].toLocaleUpperCase('hu')+s.slice(1):s;
const stems=place=>String(place||'').toLocaleLowerCase('hu').split(/[^a-záéíóöőúüű]+/).filter(w=>w.length>=4).map(w=>w.slice(0,5));
export function describeActivity({role,slotIndex=1,note='',routine='',place=''}={}){
  const r=NOW[role]?role:'other',slot=Math.min(3,Math.max(0,Number(slotIndex)||0));
  const own=BOILERPLATE.test(String(note).trim())?'':tidy(String(note).replace(OWNER_STAMP,' ')).replace(/[.;]+$/,'');
  // The routine sentence that fits: the place's own words first, then the role's (and for home, the day part's).
  const sentences=String(routine).replace(/\[[^\]]*\]|\((?:legacy)\)/gi,' ').split(/(?<=[.;!?])\s+/).map(s=>tidy(s).replace(/[;]$/,'.')).filter(s=>s.length>8);
  const words=stems(place),shortPlace=String(place).split(/\s+-\s+/).at(-1),theme=THEMES.find(([p])=>p.test(shortPlace))?.[1];
  // Work: a sentence about work. Home: about home life, not about the pub. A regular haunt: one
  // that names the place or what people do there. Never a sentence that fits nothing.
  const score=s=>{const low=s.toLocaleLowerCase('hu'),near=words.filter(w=>low.includes(w)).length;
    if(r==='work')return WORK.test(s)?2+near:0;
    // A sentence that names another day part only ("Éjszaka otthon." in the evening) does not fit.
    if(r==='home'){if(!HOME.test(s)||AWAY.test(s)&&!/otthon/i.test(s))return 0;const now=HOME_TIME[slot].test(s),other=HOME_TIME.some((t,i)=>i!==slot&&t.test(s));return now?3:other?0:2;}
    if(r==='routine')return near*2+(theme?.test(s)?2:0);
    return near;};
  const best=sentences.map(s=>({s,n:score(s)})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n)[0]?.s||'';
  const head=own?(r==='work'?`${cap(own)}, ${NOW.work[slot].toLocaleLowerCase('hu')}`:`${NOW[r][slot]} ${cap(own)}.`):NOW[r][slot];
  // A routine sentence that already says what the note says replaces the note ("Biztonsági őr" +
  // "Műszakokban dolgozik biztonsági őrként…" → only the sentence).
  const repeats=own&&best&&(best.toLocaleLowerCase('hu').includes(own.toLocaleLowerCase('hu').slice(0,Math.max(4,own.length-2)))||overlap(own,best)>=0.6);
  const line=!best?head:repeats?cap(best):`${head} ${cap(best)}`;
  return clip(line.replace(/\.\./g,'.'),220);
}
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
// shirtless and nudity, intimate → explicit (levels: content-levels.mjs).
export const STAGE_ALLOW={none:'non_intimate',flirt:'nudity',intimate:'sexual_activity'};
// Scene beats of an in-person conversation and the content level each one wants, as a rank of
// LEVELS (0 everyday, 1 shirtless, 2 nudity, 3 explicit); the stage still caps what may be shown.
// A kiss wants a shirtless picture (owner, 2026-11-22), so the scene warms up step by step.
export const BEATS=['talk','flirt','kiss','undress','sex','after'],BEAT_WANT={talk:0,flirt:0,kiss:1,undress:2,sex:3,after:2};
export const MAX_DAILY_RISES=3;
export const PACES=['slower','continue','stop'],PACE_TEXT={slower:'*Palor lassít, és csak gyengéden közel marad hozzád.*',continue:'*Palor közelebb húz, és folytatná.*',stop:'*Palor megáll, és megkérdezi, minden rendben van-e.*'};
export const cleanChoices=v=>(Array.isArray(v)?v:[]).filter(x=>typeof x==='string').map(x=>clip(x.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/<[^>]{1,200}>/g,'').trim(),160)).filter(Boolean).slice(0,3);
// Pictures he sends by phone: the reply says what kind ("everyday" / "flirt" / "intimate"),
// capped by the intimacy stage; the director picks one of his own (phone panel: him alone,
// portrait format), not one he already sent in this chat.
export const PHONE_MOODS={none:['everyday'],flirt:['everyday','flirt'],intimate:['everyday','flirt','intimate']};
