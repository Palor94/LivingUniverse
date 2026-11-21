// Character distinctness measurement (E1, 2026-11-21, owner: "living, different characters").
// Offline and deterministic: no model call. It measures what reaches the model for each person
// in the same situation:
//  - innerCoverage: which of the person's filled inner-life fields (goals, fears, motives,
//    speech…) actually appear in the prompt built for him;
//  - characterOnly + distinctness: the part of each prompt that differs between people, and
//    how different those parts are from each other (1 = nothing shared, 0 = identical).
// The same distinctness() works on real replies; a live run against a paid provider is a
// separate, owner-approved step and is not done here.

// The fields that make a person who he is in a scene (Szellemprofil ids).
export const INNER_TEXT=['play_voice','play_rules','play_contradiction','personality','goals','conflicts','fears','coping','emotional_traits','speech','habits'];
export const INNER_SCALES=['security','attachment','reward','autonomy','recognition','agreeableness','extraversion','emotional_stability','bluntness','sarcasm','directness','expressiveness'];

const filled=(p,id)=>{const v=p?.values?.[id]?.value;return v!==undefined&&v!==null&&String(v).trim()!=='';};
const norm=s=>String(s||'').toLocaleLowerCase('hu').replace(/\s+/g,' ').trim();

// A text field counts as present when the first words of its value are in the prompt
// (prompts clip long values, so the start is what survives); a scale when "label: n/max" is.
export function innerCoverage(prompt,profile){
  const text=norm(prompt),fields=new Map((profile?.template?.fields||[]).map(f=>[f.id,f])),present=[],missing=[];
  for(const id of [...INNER_TEXT,...INNER_SCALES]){
    if(!filled(profile,id))continue;const f=fields.get(id),v=profile.values[id].value;
    const probe=f?.type==='scale'?norm(`${f.label}: ${v}/`):norm(String(v)).split(' ').slice(0,4).join(' ');
    (probe&&text.includes(probe)?present:missing).push(id);
  }
  const total=present.length+missing.length;
  return {present,missing,ratio:total?present.length/total:1};
}

// Lines that every prompt shares are the scene and the rules, not the person.
export function characterOnly(texts){
  const sets=texts.map(t=>new Set(String(t).split('\n').map(l=>l.trim()).filter(Boolean)));
  const shared=new Set([...sets[0]||[]].filter(l=>sets.every(s=>s.has(l))));
  return texts.map(t=>String(t).split('\n').map(l=>l.trim()).filter(l=>l&&!shared.has(l)).join('\n'));
}

const words=(t,drop)=>new Set(norm(t).replace(/[^\p{L}\p{N} ]+/gu,' ').split(' ').filter(w=>w.length>2&&!drop.has(w)));
export function similarity(a,b,drop=new Set()){
  const x=words(a,drop),y=words(b,drop);if(!x.size&&!y.size)return 1;
  let both=0;for(const w of x)if(y.has(w))both++;return both/(x.size+y.size-both);
}

// Mean pairwise difference (1 − Jaccard of word sets), names removed so "Béla" ≠ "Aladár" is
// not counted as character. Returns the mean, the most similar pair and every pair.
export function distinctness(texts,{names=[]}={}){
  const drop=new Set(names.flatMap(n=>norm(n).split(' ')));const pairs=[];
  for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++)pairs.push({i,j,difference:1-similarity(texts[i],texts[j],drop)});
  const mean=pairs.length?pairs.reduce((s,p)=>s+p.difference,0)/pairs.length:1;
  return {mean,closest:pairs.reduce((m,p)=>!m||p.difference<m.difference?p:m,null),pairs};
}
