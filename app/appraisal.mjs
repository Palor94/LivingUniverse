// Motive-based appraisal (E3, 2026-11-21, owner: living, different characters). The same event
// hits people differently: a cancelled meeting is rejection to someone who needs closeness, an
// insult to someone who needs recognition, a relief to someone who needs to be left alone.
// Deterministic and offline: computed from the Szellemprofil scales before the model writes a
// word; unknown scales say nothing. Inspired by the "poignancy" scoring of Generative Agents
// (Apache-2.0) – how much an event stings – made person-specific here; the chain
// event → touched motive → feeling → how it shows is this project's own.
const val=(p,id)=>{const v=p?.values?.[id]?.value;return Number.isFinite(v)?v:null;};
const high=(p,id)=>{const v=val(p,id);return v!==null&&v>=7;};
const low=(p,id)=>{const v=val(p,id);return v!==null&&v<=3;};

// How each motive colours what happens to him (high / low end).
const MOTIVES={
  attachment:{high:'Ha háttérbe szorítják, elmarad egy találkozó vagy hidegebb vele valaki, elutasításként éli meg; a figyelem és a közelség sokat jelent neki.',low:'Ha elmarad egy találkozó vagy kevesebb a figyelem, nem veszi a szívére.'},
  recognition:{high:'Ha lekezelik, nem veszik komolyan vagy elfelejtik, amit tett, sértésként éli meg; a dicséret és az elismerés erősen hat rá.',low:'A dicséret és a kritika is kevéssé hat rá.'},
  autonomy:{high:'Ha irányítják, sürgetik vagy megmondják neki, mit tegyen, tolakodásnak érzi; egy elmaradt kötelező program inkább megkönnyebbülés neki.',low:'Szívesen ráhagyja másokra a döntést, a tanácsot nem érzi tolakodásnak.'},
  security:{high:'A bizonytalanság, a hirtelen változás és a kockázat fenyegetésként hat rá; a kiszámíthatóság megnyugtatja.',low:'A bizonytalanság és a kockázat nem riasztja.'},
  reward:{high:'Az unalmat nehezen bírja; az izgalom, az élvezet és az új lehetőség felvillanyozza.',low:'Az izgalom és az élvezet kevéssé hajtja.'}
};
// How it shows (expression), from temperament and communication scales.
function expression(p){
  const out=[];
  if(low(p,'emotional_stability'))out.push('hamar kibillen, és sokáig hat rá');else if(high(p,'emotional_stability'))out.push('nehezen billen ki, gyorsan túlteszi magát');
  if(low(p,'expressiveness'))out.push('nem mutatja ki, inkább elhallgat vagy visszahúzódik');else if(high(p,'expressiveness'))out.push('látványosan kimutatja');
  if(low(p,'directness'))out.push('nem mondja ki egyenesen, célozgat vagy témát vált');else if(high(p,'directness'))out.push('egyenesen kimondja, mi bántja');
  if(high(p,'bluntness'))out.push('ha szóvá teszi, nyersen');if(high(p,'sarcasm'))out.push('gyakran gúnnyal palástolja');
  if(low(p,'agreeableness'))out.push('vitába száll, nem enged könnyen');else if(high(p,'agreeableness'))out.push('inkább elsimítja a konfliktust');
  return out;
}

// The block for his prompt: up to three motive lines (strongest first) and one line on how it shows.
export function appraisalLines(p,{person='te'}={}){
  const ranked=Object.keys(MOTIVES).map(id=>({id,v:val(p,id)})).filter(x=>x.v!==null&&(x.v>=7||x.v<=3)).sort((a,b)=>Math.abs(b.v-5)-Math.abs(a.v-5)).slice(0,3);
  const lines=ranked.map(x=>MOTIVES[x.id][x.v>=7?'high':'low']),how=expression(p);
  if(!lines.length&&!how.length)return [];
  const you=person==='te';
  return [(you?'ÍGY HAT RÁD, AMI TÖRTÉNIK (ehhez igazítsd a reakciódat, ne mondd ki):':'ÍGY HAT RÁ, AMI TÖRTÉNIK:'),...lines.map(l=>'- '+l),...(how.length?[`- Ahogy kimutatja: ${how.join(', ')}.`]:[])];
}

// One person-specific reading of a concrete event (missed date, broken promise).
export function appraiseEvent(p,kind){
  const a=val(p,'attachment'),r=val(p,'recognition'),au=val(p,'autonomy'),s=val(p,'security');
  const reading=[];
  if(kind==='missed_date'||kind==='broken_promise'){
    if(a!==null&&a>=7)reading.push('elutasításként éled meg, fáj');
    if(r!==null&&r>=7)reading.push('sértésként éled meg, mintha nem vennének komolyan');
    if(s!==null&&s>=7)reading.push('megingatja a bizalmadat, hogy lehet-e rá számítani');
    if(au!==null&&au>=7&&(a===null||a<7))reading.push(kind==='missed_date'?'őszintén szólva kicsit megkönnyebbültél':'nem lepődsz meg, nem is számítottál rá nagyon');
    if(!reading.length&&a!==null&&a<=3)reading.push('nem veszed különösebben a szívedre');
  }
  if(!reading.length)return '';
  const how=expression(p);
  return `Neked ez: ${reading.join('; ')}${how.length?'. Ahogy reagálsz: '+how.slice(0,3).join(', '):''}.`;
}
