// Deliberately bounded morphology. Unknown/compound suffixes require manual review.
const lower=s=>s.toLocaleLowerCase('hu');
const lengthen=s=>s.replace(/a$/u,'á').replace(/e$/u,'é');
export function nameForms(name){
  const word=name.split(/\s+/u).at(-1),vowels=[...lower(word)].filter(c=>'aáeéiíoóöőuúüű'.includes(c));
  if(!/^[a-záéíóöőúüű]+$/iu.test(word)||/[qwx]$/iu.test(word)||/y$/iu.test(word)&&!/(gy|ly|ny|ty)$/iu.test(word))return new Map([[name,'base']]);
  const last=vowels.filter(c=>!'ií'.includes(c)).at(-1)||'e';
  const back='aáoóuú'.includes(last),rounded='öőüű'.includes(last),vowel=/[aáeéiíoóöőuúüű]$/iu.test(word);
  const stem=lengthen(name),two=(b,f)=>back?b:f,three=(b,f,r)=>back?b:rounded?r:f;
  const forms=new Map([[name,'base']]);
  const add=(form,label)=>forms.set(form,label);
  for(const [label,suffix] of Object.entries({dative:two('nak','nek'),allative:three('hoz','hez','höz'),inessive:two('ban','ben'),illative:two('ba','be'),elative:two('ból','ből'),delative:two('ról','ről'),ablative:two('tól','től'),adessive:two('nál','nél'),sublative:two('ra','re'),terminative:'ig',causal:'ért',essive:'ként'}))add(stem+suffix,label);
  add(stem+(vowel?'n':three('on','en','ön')),'superessive');
  const bareAccusative=vowel||/[lnrj]$/iu.test(word)||/[aáeéiíoóöőuúüű](?:s|sz|z|zs)$/iu.test(word);
  add(stem+(bareAccusative?'t':three('ot','et','öt')),'accusative');
  const digraph=lower(word).match(/(dzs|dz|cs|gy|ly|ny|sz|ty|zs)$/u)?.[0];
  const doubled=vowel?stem+'v':digraph?stem.slice(0,-digraph.length)+digraph[0]+digraph:/([bcdfghjklmnpqrstvwxyz])\1$/iu.test(word)?stem:stem+stem.at(-1);
  add(doubled+two('al','el'),'instrumental');
  add(doubled+two('á','é'),'translative');
  add(stem+'é','possessive');add(stem+'ék','group');
  return forms;
}
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function findNameMentions(text,oldName,newName){
  const oldForms=nameForms(oldName),newForms=new Map([...nameForms(newName)].map(([f,k])=>[k,f]));
  // Match known inflections first, then retain unknown suffixes as unresolved hits.
  const variants=s=>[s.normalize('NFC'),s.normalize('NFD')];
  const alternatives=[...new Set([...oldForms.keys()].flatMap(variants))].sort((a,b)=>b.length-a.length).map(escaped).join('|');
  const stems=[...new Set([oldName,lengthen(oldName)].flatMap(variants))].map(escaped).join('|');
  const re=new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])('+alternatives+')(?![\\p{L}\\p{M}\\p{N}_])|(?<![\\p{L}\\p{M}\\p{N}_])('+stems+')[\\p{L}\\p{M}-]+','giu');
  return [...text.matchAll(re)].map(m=>{
    const canonical=[...oldForms.keys()].find(f=>lower(f.normalize('NFC'))===lower(m[0].normalize('NFC')));
    let replacement=canonical?newForms.get(oldForms.get(canonical))??null:null;
    if(replacement&&m[0]===m[0].toLocaleUpperCase('hu'))replacement=replacement.toLocaleUpperCase('hu');
    else if(replacement&&m[0][0]===lower(m[0][0]))replacement=lower(replacement);
    return {start:m.index,end:m.index+m[0].length,before:m[0],after:replacement,grammar:canonical?oldForms.get(canonical):'unknown_suffix'};
  });
}
