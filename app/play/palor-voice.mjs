// Palor's voice for the suggested lines (2026-11-15). His Szellemprofil speech text is long
// (general style, then one section per person he talks to, then flirting, intimacy…). A talk
// prompt gets the general style, the section(s) about the people in the scene, and his flirting
// and attraction sections (owner, 2026-11-15: these may go in). The intimacy sections ("Intim
// kommunikáció", "Intimitás után") go in only inside an intimate scene, like the explicit profile
// fields. Nothing is invented; with no speech text the block is left out.

// A heading: a short line of its own, no quotes, no sentence end, not a bullet.
const isHeading=line=>{const t=line.trim();return t.length>0&&t.length<=60&&!/[“”"„.!?…]$/.test(t)&&!/[“”"„]/.test(t)&&!t.startsWith('*')&&!t.startsWith('-');};
const fold=s=>String(s||'').toLocaleLowerCase('hu');
// Does a heading word name this person? Hungarian adds a case ending ("Attilával", "Márkkal"),
// and a final a/e lengthens (Attila → Attilá-). "Márkóval" must not match "Márk".
// "-val/-vel" assimilates to a final consonant: Márk → Márkkal, Aladár → Aladárral.
const SUFFIX=/^(nak|nek|ról|ről|hoz|hez|höz)?$/;
function namesPerson(word,token){
  const w=fold(word).replace(/[^\p{L}]/gu,''),t=fold(token);if(t.length<3||!w)return false;
  for(const stem of [t,t.replace(/a$/,'á').replace(/e$/,'é')]){
    if(!w.startsWith(stem))continue;const rest=w.slice(stem.length),lastCh=stem.slice(-1);
    if(SUFFIX.test(rest))return true;
    if(['v'+'al','v'+'el',lastCh+'al',lastCh+'el'].includes(rest))return true;
  }
  return false;
}
const FLIRT=/flört|vonzalom|puhatolóz/i,INTIMATE=/intim/i;

function sections(text){
  const out=[];let cur={heading:'',lines:[]};
  for(const line of String(text).split(/\r?\n/)){
    if(isHeading(line)){if(cur.heading||cur.lines.some(l=>l.trim()))out.push(cur);cur={heading:line.trim(),lines:[]};}
    else cur.lines.push(line);
  }
  out.push(cur);
  return out.map(s=>({heading:s.heading,body:s.lines.map(l=>l.trim()).filter(Boolean).join('\n')}));
}

export function palorVoice(text,characterName,{intimate=false,max=intimate?4200:3400}={}){
  const src=String(text||'').trim();if(!src)return '';
  const tokens=String(characterName||'').split(/[\s-]+/).filter(t=>t.length>=3);
  const parts=sections(src),picked=[],used=new Set();
  // The general style, with the sub-headings right after it ("Gyakori fordulatai:").
  const gi=parts.findIndex(s=>/általános/i.test(s.heading));
  if(gi>=0){let body=parts[gi].body;used.add(gi);
    for(let i=gi+1;i<parts.length&&parts[i].heading.endsWith(':');i++){body+='\n'+parts[i].heading+'\n'+parts[i].body;used.add(i);}
    if(body.trim())picked.push(body.slice(0,1100));}
  let personal=0;const topics=[];
  parts.forEach((s,i)=>{
    if(!s.heading||used.has(i)||!s.body)return;
    const head=s.heading.replace(/:$/,'');
    if(INTIMATE.test(s.heading)){if(intimate)topics.push(head+':\n'+s.body.slice(0,700));return;}
    if(s.heading.split(/[\s:,]+/).some(w=>tokens.some(t=>namesPerson(w,t)))){picked.push(head+':\n'+s.body.slice(0,700));personal++;return;}
    if(FLIRT.test(s.heading))topics.push(head+':\n'+s.body.slice(0,700));
  });
  // Nobody named: his everyday talk instead.
  if(!personal){const daily=parts.find(s=>/hétköznapi/i.test(s.heading));if(daily?.body)picked.push(daily.heading+':\n'+daily.body.slice(0,500));}
  // The short per-person summary lines ("* Attila: Contempt, …").
  for(const line of src.split(/\r?\n/)){const m=line.match(/^\s*[*-]\s*([^:]{2,40}):\s*(.+)$/);
    if(m&&m[1].split(/\s+/).some(w=>tokens.some(t=>namesPerson(w,t))))picked.push(m[1].trim()+': '+m[2].trim());}
  // Flirting / attraction (and intimacy in an intimate scene) after the personal parts, so a
  // cut at the limit takes from these first.
  picked.push(...topics);
  if(!picked.length)return '';
  const joined=picked.join('\n\n');return joined.length>max?joined.slice(0,max)+'…':joined;
}

export const PALOR_VOICE_HEAD='PALOR BESZÉDMÓDJA (ahhoz, hogy a "choices" Palor saját hangján szóljon):\n';

// The suggested lines (owner, 2026-11-15): one direct reaction, two that move the scene on in
// clearly different directions. Pose and sexual-mood examples only inside an intimate scene.
export function CHOICE_RULES(intimate,{group=false}={}){
  return `"choices": három rövid javaslat arra, mit mondhatna vagy tehetne Palor most${group?' a társaságban':''}, Palor szájából, a saját beszédmódján (ha meg van adva), magyarul, legfeljebb 18 szó; lehet mondat, *cselekvés csillagok között*, vagy a kettő együtt. Az 1. közvetlen reakció arra, amit ${group?'az előbb mondtak vagy tettek':'te épp mondtál vagy tettél'}. A 2. és a 3. a jelenet mostani állására építve viszi előre a jelenetet, de két egymástól jól eltérő irányba (például ${intimate?'két különböző pózváltás, két különböző hangulatváltás – az egyik vadabb, indulatosabb, a másik érzékibb –, ':'két különböző hangulatváltás, '}két különböző fejlemény, vagy az egyik a helyzetből következik, a másik egy váratlan történeti csavar); ezek csak példák, főként saját, a helyzethez illő ötleteid legyenek. Ne ismételd a korábbi javaslatokat, és Palor korábbi mondatait se.`;
}

// The speech text of a Szellemprofil: the filled "speech" field, else the older speech text.
export function speechOf(profile){
  const v=profile?.values?.speech?.value;if(typeof v==='string'&&v.trim())return v;
  if(profile?.values&&Object.hasOwn(profile.values,'speech'))return '';
  return String(profile?.legacy?.speech_style||'');
}
