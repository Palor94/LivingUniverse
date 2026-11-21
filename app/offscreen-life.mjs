// Off-screen life (E9, 2026-11-21, owner: two levels of detail). Characters who rest in a world
// round (not near Palor this time) still live: two who know each other and are at the same
// place in this part of the day may run into each other. Rules and a seeded draw, no AI call:
// the result is a one-line record that both remember and that travels as news through the
// existing meetings (world-social spread), so Palor may hear it later. Deterministic per world
// day, day part and pair, so a rewound round replays the same way. Ideas after Covel
// story-events ("conditions, no model call", MIT), AI Town's invitation acceptance
// probability (MIT) and Generative Agents' per-pair chat buffer (Apache-2.0).
export const MAX_OFFSCREEN=4;
// Which of his places he may be at in each part of the day.
export const SLOT_ROLES={reggel:['work','routine'],delutan:['work','routine','other'],este:['routine','other'],ejszaka:[],nap:['work','routine','other']};

const hash=s=>{let h=2166136261;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
export const draw=key=>hash(key)/4294967296;
// Closer people meet a bit more often; strained pairs still cross paths sometimes.
export const chance=level=>Math.max(0.15,Math.min(0.8,0.35+0.08*(level??0)));

export function plan({resting,day,slot,placesOf,levelOf,known,pairKey,metToday=new Set(),max=MAX_OFFSCREEN}){
  const roles=SLOT_ROLES[slot]??[];if(!roles.length||resting.length<2)return [];
  const where=new Map(resting.map(c=>[c.id,placesOf(c.id).filter(p=>roles.includes(p.role))]));
  const pairs=[];
  for(let i=0;i<resting.length;i++)for(let j=i+1;j<resting.length;j++){
    const a=resting[i],b=resting[j],key=pairKey(a.id,b.id);if(!known.has(key)||metToday.has(key))continue;
    const shared=where.get(a.id).find(p=>where.get(b.id).some(q=>q.location_id===p.location_id));if(!shared)continue;
    const level=Math.min(levelOf(a.id,b.id)??0,levelOf(b.id,a.id)??0);
    const roll=draw(`${day}|${slot}|${key}`);if(roll>=chance(level))continue;
    pairs.push({a,b,location_id:shared.location_id,location_name:shared.location_name,level,roll});
  }
  // Each person once per part of the day; the most likely meetings first; a cap per round.
  const busy=new Set(),out=[];
  for(const p of pairs.sort((x,y)=>x.roll-y.roll)){if(busy.has(p.a.id)||busy.has(p.b.id))continue;busy.add(p.a.id);busy.add(p.b.id);out.push(p);if(out.length>=max)break;}
  return out;
}

const MOOD=level=>level>=3?['jót beszélgettek','jót beszélgettünk']:level>=1?['váltottak pár szót','váltottunk pár szót']:level<=-1?['feszült volt köztük a hangulat','feszült volt köztünk a hangulat']:['röviden köszöntek egymásnak','röviden köszöntünk egymásnak'];
// The record: event title/summary and each one's own memory.
export function record(p,slotLabel){
  const [they,we]=MOOD(p.level);
  return {title:`${p.a.name} és ${p.b.name} összefutott (${p.location_name})`,summary:`${p.a.name} és ${p.b.name} ${slotLabel} összefutott itt: ${p.location_name}; ${they}.`,
    memories:[[p.a,p.b],[p.b,p.a]].map(([me,other])=>({character_id:me.id,text:`${slotLabel[0].toLocaleUpperCase('hu')+slotLabel.slice(1)} összefutottam ${other.name} ismerősömmel itt: ${p.location_name}; ${we}.`}))};
}
