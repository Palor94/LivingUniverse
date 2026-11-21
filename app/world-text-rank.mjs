// Okapi BM25 over term lists (E7, 2026-11-21). A term that few memories hold weighs much, a term
// that most hold weighs little, so a name or a rare word outweighs an everyday one. Rewritten
// from Covel packages/plugin-handlers-utils/src/text-search.ts rankTexts() (MIT, Covel
// Contributors): same K1/B constants and IDF; the terms come from the caller (here: the
// five-letter Hungarian prefixes the world engine already uses), CJK handling left out.
const K1=1.2,B=0.75;

// query: array of terms; docs: array of term arrays. Returns one score per doc (0 = no match).
export function bm25(query,docs){
  const q=[...new Set(query)];if(!q.length||!docs.length)return docs.map(()=>0);
  const counts=docs.map(d=>{const m=new Map();for(const t of d)m.set(t,(m.get(t)||0)+1);return m;});
  const avg=docs.reduce((n,d)=>n+d.length,0)/docs.length||1;
  const idf=new Map(q.map(t=>{let n=0;for(const c of counts)if(c.has(t))n++;return [t,Math.log(1+(docs.length-n+0.5)/(n+0.5))];}));
  return counts.map((c,i)=>{let s=0;for(const t of q){const f=c.get(t);if(!f)continue;s+=idf.get(t)*f*(K1+1)/(f+K1*(1-B+B*docs[i].length/avg));}return s;});
}
