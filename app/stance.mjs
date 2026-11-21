// Permission to disagree (E5, 2026-11-21, owner: living, different characters). Language
// models make everyone pleasant and agreeable, which is the main reason characters sound alike.
// Each character gets an explicit permission and his own reasons to refuse, dodge, contradict,
// stay cold or have a bad day – from his profile and current state. Deterministic, no model
// call. The owner's rules (consent, no forced romance, adults only, closeness stages) are not
// touched: this only removes the default eagerness to please.
const val=(p,id)=>{const v=p?.values?.[id]?.value;return Number.isFinite(v)?v:null;};
const NEGATIVE=/megbánt|sért|düh|ingerül|mérges|szomor|fáradt|feszült|csalód|nyugtalan|szorong|keser|irigy|féltékeny|rosszkedv|elkesered|bizalmatlan/i;

export function stanceLines(p,{inner=null,effective=0,level=0,person='te'}={}){
  const you=person==='te',out=[];
  out.push(you
    ?'NEM KELL EGYETÉRTENED, ÉS NEM KELL KEDVESNEK LENNED: a saját véleményed, hangulatod és érdeked szerint válaszolj. Mondhatsz nemet, kitérhetsz, másra terelheted a szót, ha ez illik hozzád; ne igazodj automatikusan Palorhoz.'
    :'Nem kell egyetértenie Palorral és kedvesnek lennie: a saját véleménye, hangulata és érdeke szerint válaszol.');
  const ag=val(p,'agreeableness'),bl=val(p,'bluntness'),gr=val(p,'grievances');
  if(ag!==null&&ag<=3)out.push(you?'Gyakran ellentmondasz, nem engedsz könnyen, és ha valami nem tetszik, vitatkozol.':'Gyakran ellentmond, nem enged könnyen.');
  else if(ag!==null&&ag>=7)out.push(you?'Inkább engedékeny vagy, de a saját határaidat akkor is tartod, és ami nem tetszik, nem tetteted, hogy tetszik.':'Engedékeny, de a határait tartja.');
  if(bl!==null&&bl>=7)out.push(you?'Ha nem tetszik valami, kertelés nélkül kimondod.':'Ha nem tetszik valami, kimondja.');
  const hurt=inner&&effective>=1&&NEGATIVE.test(inner.mood||'');
  if(hurt&&gr!==null&&gr>=3)out.push(you?'Megbántottak: nem oldódsz fel egy kedves mondattól, napokig hűvös maradhatsz, amíg nem kapsz valódi jóvátételt.':'Megbántották: nem oldódik fel egy kedves mondattól.');
  else if(hurt&&effective>=2)out.push(you?'Rossz napod van: lehetsz kurta, türelmetlen vagy ingerült, akkor is, ha Palor kedves.':'Rossz napja van: kurta, türelmetlen lehet.');
  if(typeof p?.values?.secrets?.value==='string'&&p.values.secrets.value.trim())out.push(you?'A titkaidat véded: kitérhetsz, témát válthatsz, és ha szorul a hurok, hazudhatsz is róluk.':'A titkait védi, kitérhet, hazudhat is róluk.');
  if(level<=-1)out.push(you?'Rosszban vagytok: gyanakvó vagy, nem adod könnyen magad.':'Rosszban vannak: gyanakvó.');
  return out;
}
