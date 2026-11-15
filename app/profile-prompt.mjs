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

// Numbers that steer mechanics (null = unknown → the engine's defaults).
export function profileScale(p,id){const v=p?.values?.[id]?.value;return Number.isFinite(v)?v:null;}
