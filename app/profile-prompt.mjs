// Szellemprofil → prompt text (2026-11-15, profile integration batch).
// - Meta fields (technical provenance) never enter a character prompt (AGENTS.md boundary).
// - Known scales are sent with a short behaviour phrase at the low and high ends, so the model
//   acts on "8/10" consistently; middle values and custom scales stay plain numbers.
// - Each use (world agent, 1:1 talk, group scene) gets the fields that matter for it.
// - A text field that was never filled falls back to the matching older profile text
//   (biography, personality, …), as the profile overview already does. An explicitly
//   accepted empty value is respected and not refilled.
import {clip} from './world-common.mjs';

export const EXPLICIT=new Set(['anatomy','appearance_detail','intimacy','sexual_penis_use','sexual_anal_use','sexual_tongue_use','sexual_hand_use']);
export const META=new Set(['origin']);
// Memory scales act through recall (world-engine recallMemories); the agent needs no text for them.
const MEMORY_SCALES=['emotional_memory','grievances','memory_bias'];
const OMIT={
  talk:new Set(),
  agent:new Set(['relationship_speech','attraction','sexuality','memory_traits',...MEMORY_SCALES]),
  group:new Set(['birth_date','residence','goals','conflicts','fears','coping','weekly_routine','habits','memory_traits','attraction','sexuality',
    'security','attachment','reward','autonomy','recognition',...MEMORY_SCALES]),
  // Intimate group scene (2026-11-15): the group set, but attraction and sexuality matter here.
  group_intimate:new Set(['birth_date','residence','goals','conflicts','fears','coping','weekly_routine','habits','memory_traits',
    'security','attachment','reward','autonomy','recognition',...MEMORY_SCALES])
};
const CLIP={talk:700,agent:700,group:300,group_intimate:300};

// [low, high] behaviour phrases; low ≤ 30 % of the scale, high ≥ 70 %.
export const SCALE_TEXT={
  extraversion:['visszahúzódó, csendes, kevés társaság is elég neki','társaságkedvelő, beszédes, az emberekből töltődik'],
  agreeableness:['nehezen enged, vitába száll, gyanakvó','együttműködő, engedékeny, kerüli a konfliktust'],
  conscientiousness:['rendetlen, halogató, spontán','rendszerető, megbízható, tartja a szavát'],
  emotional_stability:['könnyen ideges vagy szorongó, hamar kibillen','nyugodt, nehezen jön ki a sodrából'],
  openness:['a megszokotthoz ragaszkodik, gyanakszik az újra','kíváncsi, nyitott új dolgokra és ötletekre'],
  security:['keveset törődik a biztonsággal, kockáztat','a biztonság és a kiszámíthatóság nagyon fontos neki'],
  attachment:['nem keresi a szoros kötődést','erősen vágyik a közelségre és a kötődésre'],
  reward:['nem hajszolja az élvezeteket','élvezetkereső, szereti az izgalmat és a jutalmat'],
  autonomy:['szívesen rábízza magát másokra','önálló, nem szereti, ha irányítják'],
  recognition:['nem igényli az elismerést','sokat számít neki az elismerés és mások véleménye'],
  bluntness:['tapintatos, finoman fogalmaz','nyers, kertelés nélkül kimondja, amit gondol'],
  attentiveness:['kevéssé figyel a másikra','figyelmes, észreveszi a részleteket és a másik hangulatát'],
  directness:['kerülgeti a témát, célozgat','egyenes, rögtön a lényegre tér'],
  sarcasm:['ritkán ironizál','gyakran szarkasztikus, csípős a humora'],
  expressiveness:['visszafogottan mutatja az érzéseit','nyíltan, látványosan kifejezi az érzéseit'],
  mood_reactivity:['a hangulata stabil, ritkán ingadozik','a hangulata gyorsan és erősen változik'],
  emotional_memory:['az érzelmi emlékei hamar elhalványulnak','sokáig élénken emlékszik az érzelmi pillanatokra'],
  grievances:['könnyen megbocsát, nem tart haragot','sokáig emlékszik a sérelmekre, nehezen bocsát meg'],
  memory_bias:['viszonylag pontosan emlékszik','az emlékeit a saját szája íze szerint színezi']
};
export function scaleLine(f,v){
  const pair=SCALE_TEXT[f.id],r=v/f.max;
  const phrase=pair&&(r<=0.3?pair[0]:r>=0.7?pair[1]:'');
  return `${f.label}: ${v}/${f.max}${phrase?' – '+phrase:''}`;
}

const has=(p,id)=>Object.hasOwn(p?.values||{},id);
const filled=(p,id)=>{const v=p?.values?.[id]?.value;return v!==undefined&&v!==null&&String(v).trim()!=='';};

// use: 'talk' (default, the richest), 'agent' (world-engine intention), 'group' (several people
// in one prompt, shorter). explicit:true only for an intimate Play scene.
export function profileText(p,{explicit=false,use='talk'}={}){
  if(!p?.template?.fields)return '';
  const omit=OMIT[use]||OMIT.talk,max=CLIP[use]||700,lines=[];
  for(const f of p.template.fields){
    if(META.has(f.id)||omit.has(f.id)||(!explicit&&EXPLICIT.has(f.id)))continue;
    if(filled(p,f.id)){const v=p.values[f.id].value;lines.push(f.type==='scale'?scaleLine(f,v):`${f.label}: ${clip(v,max)}`);continue;}
    const legacy=f.type==='text'&&f.source&&!has(p,f.id)?String(p.legacy?.[f.source]||'').trim():'';
    if(legacy)lines.push(`${f.label}: ${clip(legacy,max)}`);
  }
  return lines.join('\n');
}

// Group scenes (E11, 2026-11-21): the inner life stays in. Before, a group prompt left out each
// person's goals, conflicts, fears, coping and all five motives, so in company only the
// surface of a person remained (E1 baseline: 38–56 % of the inner-life fields). Now every
// person in the scene gets the same detail level, the richest that fits the scene budget; the
// level drops background first and never drops the voice, the goals, the fears or the motives.
// Pattern after Covel plugins/character-blueprint/lib/roleplay-notes.js DETAIL_LEVELS (MIT,
// Covel Contributors): one level for every card, so no card's text depends on which one is
// the longest; examples and background go first, the voice line never.
const GROUP_BASE=new Set(['birth_date','residence','weekly_routine','memory_traits',...MEMORY_SCALES]);
const GROUP_INTIMATE_ONLY=['attraction','sexuality'];
export const GROUP_LEVELS=[
  {clip:300,drop:[]},
  {clip:240,drop:['habits','coping','relationship_speech']},
  {clip:180,drop:['identity','occupation','emotional_traits','appearance_summary','conscientiousness','openness','attentiveness','mood_reactivity']},
  {clip:130,drop:['conflicts','directness','expressiveness','presented_sexuality','orientation']},
  // Last level: personality, goals, fears, voice, and only the scales that are clearly high or low.
  {clip:100,drop:['personality'],extremesOnly:true}
];
const GROUP_KEEP=new Set(['speech','goals','fears','security','attachment','reward','autonomy','recognition']);
export const GROUP_BUDGET_PER_PERSON=1800,GROUP_BUDGET_MAX=7200;
function groupText(p,{explicit,intimate,level}){
  const L=GROUP_LEVELS[level],dropped=new Set(GROUP_LEVELS.slice(0,level+1).flatMap(x=>x.drop));const lines=[];
  for(const f of p?.template?.fields||[]){const id=f.id;
    if(META.has(id)||GROUP_BASE.has(id)||(!explicit&&EXPLICIT.has(id))||(!intimate&&GROUP_INTIMATE_ONLY.includes(id)))continue;
    if(dropped.has(id)&&!GROUP_KEEP.has(id))continue;
    if(filled(p,id)){const v=p.values[id].value;
      if(f.type==='scale'){const r=v/f.max;if(L.extremesOnly&&!GROUP_KEEP.has(id)&&r>0.3&&r<0.7)continue;lines.push(scaleLine(f,v));}
      else lines.push(`${f.label}: ${clip(v,L.clip)}`);continue;}
    const legacy=f.type==='text'&&f.source&&!has(p,id)?String(p.legacy?.[f.source]||'').trim():'';
    if(legacy)lines.push(`${f.label}: ${clip(legacy,L.clip)}`);
  }
  return lines.join('\n');
}
// Profiles of everyone in one group scene, at one shared level.
export function castProfileTexts(profiles,{explicit=false,intimate=false,budget}={}){
  const max=budget??Math.min(GROUP_BUDGET_MAX,GROUP_BUDGET_PER_PERSON*Math.max(1,profiles.length));
  for(let level=0;level<GROUP_LEVELS.length;level++){
    const texts=profiles.map(p=>groupText(p,{explicit,intimate,level}));
    if(level===GROUP_LEVELS.length-1||texts.reduce((n,t)=>n+t.length,0)<=max)return {level,texts};
  }
}

// Numbers that steer mechanics (null = unknown → the engine's defaults).
export function profileScale(p,id){const v=p?.values?.[id]?.value;return Number.isFinite(v)?v:null;}
