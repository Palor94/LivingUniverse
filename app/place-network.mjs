// Reads the place names of the location tree and links them into a living network:
// what kind of place each one is, which town it belongs to, which places are branches of
// the same chain in different towns, the route between two places, where a vehicle parks,
// and small encounters on the way. Pure functions: no database, no AI call.

// Order matters: the first matching kind wins ("Max háza - Garázs" is a room, not a home).
const KINDS=[
  ['vehicle',/autója|furgon|kamion|kocsija|\bastra\b|scania|\bdaf\b/i],
  ['transit',/utca|\bút\b|útja|körút|\btér\b|\bköz\b|\bhíd\b|pályaudvar|állomás|megálló|metró|\bmetro\b|\bstreet\b|villamos|vonat|peron|pihenő|autópálya|\bm\d+\b|parkoló/i],
  ['room',/szob|nappali|háló|konyha|fürdő|\bwc\b|mosdó|erkély|garázs|udvar|pince|padlás|előszoba|zuhany|öltöző|terasz|cella|referáló/i],
  ['home',/háza|lakása|\blakás|\bház\b|otthon|albérlet|tanya|kollégium|\bkoli\b|szállás|szálló|konténer|(?<!ünnepi )sát(?:or|ra)|rejtekhely/i],
  ['shop',/bolt|\bspar|interspar|tesco|lidl|aldi|penny|\bcoop|ikea|pláza|plaza|áruház|supermarket|szupermarket|piac|trafik|benzinkút|pékség/i],
  ['public',/rendőrség|fogda|iskola|gimnázium|egyetem|könyvtár|hivatal|templom|posta|önkormányzat/i],
  ['work',/kórház|osztály|klinika|rendelő|iroda|építkezés|üzem|gyár|szerviz|műhely|raktár|ügyelet|\bzárt\b|szolgálat|fotózás/i],
  ['leisure',/edzőterem|fitness|wellness|kávézó|presszó|kocsma|\bbár\b|klub|disco|diszkó|étterem|csárda|büfé|strand|beach|nudi|uszoda|szauna|\bpark\b|liget|mozi|koncert|színpad|stadion|kilátó|ünnepi/i],
  ['nature',/erdő|\btó\b|^tó$|tópart|folyó|duna|tisza|balaton|mező|\brét\b|hegy|mountain|határa|természet/i]
];
export const KIND_LABEL={vehicle:'jármű',transit:'utca / útvonal',room:'helyiség',home:'otthon',shop:'bolt',public:'intézmény',work:'munkahely',leisure:'szórakozóhely',nature:'természet',town:'település',area:'környék',place:'hely'};
// Tree layers above the places ("Living Universe" world, "Települések és környékük" collection)
// group places; they are not places themselves.
const isPlace=n=>!!n&&(!n.kind||n.kind==='place');
export function kindOf(node){
  if(!isPlace(node))return 'area';
  const short=node.short_name||node.name||'';
  for(const [kind,re] of KINDS)if(re.test(short))return kind;
  for(const [kind,re] of KINDS)if(kind!=='room'&&re.test(node.name||''))return kind;
  return 'place';
}

const up=(byId,id)=>{const out=[];for(let n=byId.get(id);n;n=n.parent_id?byId.get(n.parent_id):null)out.push(n);return out;};
// The chain of real places from this one upwards, stopping at the grouping layers.
const placeChain=(byId,id)=>{const out=[];for(const n of up(byId,id)){if(!isPlace(n))break;out.push(n);}return out;};
// The town a place belongs to: its highest place ancestor (Budapest for "Budapest - bolt").
export const townOf=(byId,id)=>placeChain(byId,id).at(-1)||null;
// The building or site a place belongs to: the place right below the town. A car parked
// at "Feri háza" is "here" when Palor is in any room of Feri's house.
export function anchorOf(byId,id){const chain=placeChain(byId,id);return chain.length>=2?chain.at(-2):chain[0]||null;}

// Branches of the same chain: same kind of public place, same short name, different towns
// (e.g. "Interspar" in Székesfehérvár and in Budapest). Staff is per branch.
const CHAIN_KINDS=new Set(['shop','work','leisure']);
const chainKeyOf=n=>String(n.short_name||n.name||'').toLocaleLowerCase('hu').replace(/\s+/g,' ').trim();
export function chains(nodes){
  const byId=new Map(nodes.map(n=>[n.id,n])),groups=new Map();
  for(const n of nodes){if(!CHAIN_KINDS.has(kindOf(n))||townOf(byId,n.id)?.id===n.id)continue;const k=chainKeyOf(n);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n);}
  const out=new Map();
  for(const list of groups.values()){
    const towns=new Set(list.map(n=>townOf(byId,n.id)?.id));if(towns.size<2)continue;
    for(const n of list)out.set(n.id,list.filter(x=>x.id!==n.id&&townOf(byId,x.id)?.id!==townOf(byId,n.id)?.id).map(x=>({id:x.id,short_name:x.short_name,town:townOf(byId,x.id)?.short_name||townOf(byId,x.id)?.name||''})));
  }
  return out;
}

// The way from one place to another through the tree: up to the common ancestor, then down.
export function route(byId,fromId,toId){
  const a=up(byId,fromId),b=up(byId,toId),inB=new Set(b.map(n=>n.id));
  const meet=a.findIndex(n=>inB.has(n.id));
  if(meet<0)return [...a,...b.reverse()];
  return [...a.slice(0,meet+1),...b.slice(0,b.findIndex(n=>n.id===a[meet].id)).reverse()];
}
// Real positions of the towns in the tree (lon, lat; the same points as the play map), so a
// trip takes about as long as it would in Hungary. size: how long crossing the town takes.
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
const TOWNS={
  'budapest':{at:[19.040,47.497],size:'city'},
  'szekesfehervar':{at:[18.410,47.190],size:'town'},
  'pecs':{at:[18.230,46.070],size:'town'},
  'gardony':{at:[18.620,47.200]},
  'kaloz':{at:[18.485,46.955]},
  'sarbogard':{at:[18.620,46.887]},
  'balaton':{at:[17.900,46.840]},
  'm7-es autopalya':{at:[18.880,47.378]}
};
// Across town: by car / on foot and public transport.
const IN_TOWN={city:[25,35],town:[12,20],village:[5,10]};
const geoOf=node=>node?TOWNS[fold(node.short_name||node.name)]||null:null;
// A settlement or region with a known place on the map (Budapest, Káloz, Balaton, M7…), as
// opposed to a standalone place at the top of the tree (a house, a van, a forest): only
// settlements get a drawn town map (2026-11-13).
export const isSettlement=node=>!!geoOf(node);

// ---- regions, passages and entry rooms (owner, 2026-11-14) --------------------------------
// A region is an area inside a town's bounds with its own drawn map: "Káloz határa" holds the
// lake (Tó with its shore) and the forest (car park → forest → mountain). It opens like a town.
const REGIONS=new Set(['kaloz hatara']);
export const isRegion=node=>!!node&&REGIONS.has(fold(node.short_name||node.name));
// Passages are walked through, never visited: a town's street ("Utca", "Budapest - street") and
// the stairwell of a block of flats. Their pictures and happenings belong to the whole town;
// they are not pins on the town map and not places of their own.
const PASSAGE=/^(utca|street)$|lépcsőház/i;
export const isPassage=node=>!!node&&(!node.kind||node.kind==='place')&&PASSAGE.test(String(node.short_name||node.name||'').trim());
// The room one arrives in: the living room of a home, the common room of a dormitory or
// workers' hostel, the shore of the lake ("Nagyszoba" is the living room of a village house).
// "Nézőtér" is the stadium's way in (owner, 2026-11-14).
const ORIGIN=/(^|\s)(nappali|közösségi tér|tópart|nagyszoba|nézőtér)$/i;
export const isOriginName=node=>ORIGIN.test(String(node?.short_name||node?.name||'').trim());
// The entry room of a place: a direct child with an entry-room name (first by tree order).
// index (optional, from originIndex): the same answer without scanning the tree (2026-11-14).
export function originChild(nodes,id,index=null){
  if(index)return index.get(id)||null;
  return nodes.find(n=>n.parent_id===id&&!n.archived&&n.placed!==false&&isOriginName(n))||null;
}
// Every place's entry room in one pass (parent id -> first entry-room child), 2026-11-14.
export function originIndex(nodes){
  const out=new Map();
  for(const n of nodes)if(!n.archived&&n.placed!==false&&!out.has(n.parent_id)&&isOriginName(n))out.set(n.parent_id,n);
  return out;
}
// A flat in a block (not a family house): reached through the stairwell.
export const isFlat=node=>/lakás|albérlet|garzon/i.test(String(node?.short_name||node?.name||''));
const insideOf=(byId,id,ancestorId)=>{for(let n=byId.get(id);n;n=n.parent_id?byId.get(n.parent_id):null)if(n.id===ancestorId)return true;return false;};
// Where a trip really ends: a place with an entry room is entered there, unless Palor is already
// inside it (from the lake shore he can go into the water itself).
export function arrivalOf(nodes,byId,fromId,toId,index=null){
  const o=originChild(nodes,toId,index);if(!o)return toId;
  return fromId&&insideOf(byId,fromId,toId)?toId:o.id;
}
// The passages a trip walks through, in order: out of a flat by its stairwell, along the town's
// street (between two buildings, or out of or into town), into a flat by its stairwell.
export function passagesOf(nodes,byId,fromId,toId){
  if(!fromId||!toId||fromId===toId)return [];
  const a=anchorOf(byId,fromId),b=anchorOf(byId,toId);if(a?.id&&a.id===b?.id)return [];
  const ta=townOf(byId,fromId),tb=townOf(byId,toId),out=[];
  const shared=nodes.find(n=>isPassage(n)&&/emeletes/i.test(n.name)&&!n.archived)||null;
  const stairs=anchor=>{if(!anchor||!isFlat(anchor))return null;return nodes.find(n=>n.parent_id===anchor.id&&isPassage(n)&&!n.archived)||shared;};
  const street=town=>town?nodes.find(n=>n.parent_id===town.id&&isPassage(n)&&!n.archived)||null:null;
  const s1=stairs(a),s2=stairs(b),st1=street(ta),st2=street(tb);
  if(s1)out.push(s1);
  if(st1&&fromId!==ta.id)out.push(st1);
  if(st2&&toId!==tb.id&&!out.includes(st2))out.push(st2);
  if(s2&&!out.includes(s2))out.push(s2);
  return out;
}

// ---- getting from town to town (owner, 2026-11-14) -----------------------------------------
// Bicycle, car or (where a direct line runs) train. Direct lines after MÁV's real network:
//   30a  Budapest – Gárdony (Velencei-tó) – Székesfehérvár – Balaton (Siófok)
//   40   Budapest – Sárbogárd – Pécs (Mecsek InterCity; the only train to Pécs)
//   45   Székesfehérvár – Sárbogárd (local train)
// Káloz has no station (its line 45 neighbours are Belsőbáránd/Sárbogárd); the M7 is a motorway.
// Minutes are the timetable's rough running times from the first station of the line.
export const TRAIN_LINES=[
  {id:'30a',name:'Budapest – Székesfehérvár – Balaton',stops:[['budapest',0],['gardony',45],['szekesfehervar',65],['balaton',110]]},
  {id:'40',name:'Mecsek InterCity: Budapest – Sárbogárd – Pécs',stops:[['budapest',0],['sarbogard',70],['pecs',175]]},
  {id:'45',name:'Székesfehérvár – Sárbogárd személyvonat',stops:[['szekesfehervar',0],['sarbogard',50]]}
];
export const TRAVEL_MODES=['bike','car','train'];
// Inside Káloz one walks (owner, 2026-11-14): the car stays parked, even to the lake and forest.
const WALK_ONLY=new Set(['kaloz']);
export const walkOnly=town=>!!town&&WALK_ONLY.has(fold(town.short_name||town.name));
// Pécs is reached by car or train only, never by bicycle (owner, 2026-11-14).
const NO_BIKE=new Set(['pecs']);
export const bikeAllowed=(a,b)=>![a,b].some(t=>t&&NO_BIKE.has(fold(t.short_name||t.name)));
const townKey=node=>fold(node?.short_name||node?.name);
// The direct line between two towns, if any: {line, minutes} (running time only).
export function trainBetween(a,b){
  const ka=townKey(a),kb=townKey(b);if(!ka||!kb||ka===kb)return null;
  for(const line of TRAIN_LINES){const x=line.stops.find(s=>s[0]===ka),y=line.stops.find(s=>s[0]===kb);if(x&&y)return {line:line.id,name:line.name,minutes:Math.abs(y[1]-x[1])};}
  return null;
}
// Road distance ≈ 1.25 × straight line.
function roadKm([lon1,lat1],[lon2,lat2]){
  const r=Math.PI/180,dLat=(lat2-lat1)*r,dLon=(lon2-lon1)*r;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return 1.25*2*6371*Math.asin(Math.sqrt(a));
}
// Walking legs inside the countryside around Káloz: reaching each of these places from the one
// above it takes this long (the mountain is a long hike from the forest car park).
const LEGS={'kaloz hatara':10,'to':12,'topart':2,'erdei parkolo':15,'erdo':25,'mountain':110,'hegy':110,'kirandulo hely a hegyekben':25};
const legOf=n=>{for(const s of [n?.short_name,n?.name]){const k=fold(s);const v=LEGS[k]??LEGS[k.split(/\s+[–-]\s+/)[0]];if(v!==undefined)return v;}return 0;};
// Travel time; the game clock advances by it. mode: 'foot' (default inside a town), 'bike',
// 'car' or 'train' between towns. vehicle:true is the older spelling of mode 'car'.
export function travelMinutes(byId,fromId,toId,{vehicle=false,mode=null}={}){
  if(!fromId||fromId===toId)return 0;
  mode=mode||(vehicle?'car':'foot');
  const a=townOf(byId,fromId),b=townOf(byId,toId);
  if(a&&a.id===b?.id&&walkOnly(a))mode='foot';
  // Countryside legs (lake, forest, mountain): walked, whatever brought Palor to the town.
  // Each step down costs the leg of the place entered, each step up the leg of the place left.
  const path=route(byId,fromId,toId);let legs=0;
  for(let i=1;i<path.length;i++)legs+=path[i].parent_id===path[i-1].id?legOf(path[i]):legOf(path[i-1]);
  if(anchorOf(byId,fromId)?.id===anchorOf(byId,toId)?.id)return Math.max(1,legs);
  // The town's own node is its street: stepping out of a building onto it takes a moment.
  if(a&&a.id===b?.id&&toId===a.id)return 2+legs;
  if(a&&a.id===b?.id){const [car,foot]=IN_TOWN[geoOf(a)?.size||'village'];return (mode==='car'?car:mode==='bike'?Math.round((car+foot)/2):foot)+legs;}
  const ga=geoOf(a),gb=geoOf(b);
  if(!ga||!gb)return (mode==='car'?40:mode==='bike'?90:75)+legs;// a place outside the known towns
  const km=roadKm(ga.at,gb.at);
  if(mode==='train'){const t=trainBetween(a,b);if(t)return t.minutes+25+legs;}// to the station, waiting, from the station
  if(mode==='bike')return Math.round(km/16*60+5)+legs;
  if(mode==='car')return Math.round(km/80*60+10)+legs;
  return Math.round(km/70*60+20)+legs;
}
// The ways to go from one town to another, for the small "how do you travel?" window.
// No trains between midnight and 4 am (owner, 2026-11-14); hour is the game clock's hour.
export const trainRunsAt=hour=>!(Number.isFinite(hour)&&hour>=0&&hour<4);
// rides: [{id,name,vehicle}] people with a car who are with Palor (ridesWith); each is one more
// car option "<name> autójával" (owner, 2026-11-14).
export function travelOptions(byId,fromId,toId,{car=null,hour=null,rides=[]}={}){
  const a=townOf(byId,fromId),b=townOf(byId,toId);
  if(!fromId||!a||!b||a.id===b.id)return [];
  const t=trainBetween(a,b),carMinutes=travelMinutes(byId,fromId,toId,{mode:'car'});
  return [
    ...(bikeAllowed(a,b)?[{mode:'bike',minutes:travelMinutes(byId,fromId,toId,{mode:'bike'})}]:[]),
    {mode:'car',minutes:carMinutes,...(car?{vehicle:car}:{})},
    ...rides.map(r=>({mode:'car',minutes:carMinutes,ride_with:{id:r.id,name:r.name,vehicle:r.vehicle}})),
    ...(t?[{mode:'train',minutes:travelMinutes(byId,fromId,toId,{mode:'train'}),line:t.name,...(trainRunsAt(hour)?{}:{unavailable:'night'})}]:[])
  ];
}

// The owner of a vehicle place ("Domi autója", "Lakatos Sándor fehér furgonja").
export function vehicleOwner(node,people){
  if(kindOf(node)!=='vehicle')return null;
  const text=String(node.short_name||node.name).toLocaleLowerCase('hu');
  let best=null;for(const p of people){const name=String(p.name).toLocaleLowerCase('hu').split(' - ')[0].trim();if(name.length>=3&&text.startsWith(name)&&(!best||name.length>best.len))best={id:p.id,len:name.length};}
  return best?.id||null;
}

// ---- rides, trip pictures, roadside stops (owner, 2026-11-14) -------------------------------
// Cars are vehicles, not rooms: a character's car place is a ride when its owner is with Palor.
// people: the cast [{id,name}]; presentIds: who is with Palor now. One ride per person.
export function ridesWith(nodes,people,presentIds){
  const present=new Set(presentIds||[]),out=[];
  for(const n of nodes){if(n.archived||kindOf(n)!=='vehicle')continue;
    const owner=vehicleOwner(n,people);if(!owner||!present.has(owner)||out.some(r=>r.id===owner))continue;
    out.push({id:owner,name:people.find(p=>p.id===owner).name,vehicle:n.short_name||n.name,node_id:n.id});}
  return out;
}
// A transport place by its exact name ("Vonat", "Vasútállomás", "Benzinkút"), with a location.
export const transportPlace=(nodes,name)=>nodes.find(n=>!n.archived&&n.location_id&&fold(n.short_name||n.name)===fold(name))||null;
// The road happening was a fuel stop.
export const isFuelStop=text=>/tankol|benzinkút/i.test(String(text||''));
// The places whose pictures show on a trip between towns, in order: the station, then the train;
// the friend's car; a petrol station only when the happening was a fuel stop. Bike: none.
// Items are {name} (a transport place) or {node_id} (the car place of the ride).
export function tripScenePlaces({mode,crossTown=true,rideNodeId=null,encounterText=null}){
  if(!crossTown)return [];
  if(mode==='train')return [{name:'Vasútállomás'},{name:'Vonat'}];
  if(mode!=='car')return [];
  return [...(rideNodeId?[{node_id:rideNodeId}]:[]),...(isFuelStop(encounterText)?[{name:'Benzinkút'}]:[])];
}
// Someone by the road on a car trip without a story: Palor may stop (one A/B choice). Adults
// only, no gender words: who it is comes from the story picked when he stops.
export const ROADSIDE=['Valaki integet az út szélén.','Egy alak stoppol a kanyar után.','Egy lerobbant kocsi mellett valaki a karját lengeti.','A buszmegálló mellett valaki feltartott hüvelykujjal áll.'];
export const ROADSIDE_CHANCE=0.25;
export function rollRoadside({mode,crossTown,story,rand=Math.random}){
  if(!crossTown||mode!=='car'||story||rand()>=ROADSIDE_CHANCE)return null;
  return pick(ROADSIDE,rand);
}

// Small happenings on the way. Flavour only: no named strangers, nothing that changes canon.
const EVENTS={
  street:['Egy futár a bringáján majdnem elsodor a sarkon.','A sarkon valaki hangosan veszekszik a telefonjába.','Elered az eső; egy eresz alatt vársz egy percet.','Egy utcazenész gitározik a sarkon, páran megállnak.','Egy kutya elkísér egy saroknyit, aztán elkocog.'],
  street_night:['Üres az utca, csak a lámpák zúgnak.','Egy részeg társaság dalolva megy el melletted.','Egy taxi lelassít melletted, aztán továbbhajt.','Valaki egy kapualjban cigizik, és hosszan utánad néz.'],
  metro:['A szerelvény öt percre megáll az alagútban.','A tömegben valaki a kelleténél közelebb áll hozzád.','Ellenőrök szállnak fel a következő megállóban.'],
  train:['A vonat tíz percet késik, a peronon toporogsz.','A kalauz kétszer is elkéri a jegyed.','A kocsiban egy társaság hangosan sörözik.','Az állomáson a hangosbemondó vágányváltozást jelent; futsz a másik peronra.','A vonat egy kis megállóban áll egy ideig; az ablakon át a mezőket nézed.'],
  // By car it is hard to stop Palor, but he can pull over whenever he sees someone by the road.
  road:['Dugó van az úton, lépésben haladtok.','Megállsz tankolni egy benzinkútnál; a kávé pocsék.','A pihenőben kamionok sorakoznak, a mosdó előtt valaki cigizik és utánad néz.','Valaki stoppol az út szélén; lassítasz, végül továbbhajtasz.','Egy alak integet az út közepén, de nem állsz meg: kikerülöd, és a visszapillantóból nézed, ahogy eltűnik.'],
  // On a bicycle anyone can stop him.
  bike:['Egy kutya kilométereken át kerget, mire lemarad.','Defektet kapsz; az árokparton foltozod a kereket.','Szembeszél van, minden méterért megküzdesz.','Egy traktoros rád dudál, aztán int, hogy bocs.','Egy férfi kilép eléd az útra és megállít: útbaigazítást kér, de túl sokáig méreget.','Ketten állják el az utat a földút elején; végül csak egy cigit kérnek tőled.']
};
const pick=(list,rand)=>list[Math.min(list.length-1,Math.floor(rand()*list.length))];
function eventFor(path,{night,crossTown,mode},rand){
  const text=path.map(n=>(n.short_name||'')+' '+(n.name||'')).join(' ');
  if(crossTown&&mode==='train')return pick(EVENTS.train,rand);
  if(crossTown&&mode==='bike')return pick(EVENTS.bike,rand);
  if(/metró|villamos/i.test(text))return pick(EVENTS.metro,rand);
  if(crossTown||/pihenő|autópálya|\bm\d+\b/i.test(text))return pick(EVENTS.road,rand);
  return pick(night?EVENTS.street_night:EVENTS.street,rand);
}
// How likely something happens on a trip between towns, by the way of travelling.
const CROSS_CHANCE={bike:0.55,foot:0.4,train:0.4,car:0.25};
// Rolls an encounter for one trip. people: [{id,name,location_id,node_id,level}] of the
// living cast with their current place. Moving between buildings or towns can bring a chance
// meeting (the person comes along) or a small happening; moving between rooms never does.
export function rollEncounter({byId,fromId,toId,people,slotIndex=1,rand=Math.random,mode='foot'}){
  if(!fromId||!toId||fromId===toId)return null;
  const path=route(byId,fromId,toId);
  const crossTown=townOf(byId,fromId)?.id!==townOf(byId,toId)?.id;
  const throughStreet=path.some(n=>kindOf(n)==='transit');
  if(!crossTown&&!throughStreet&&anchorOf(byId,fromId)?.id===anchorOf(byId,toId)?.id)return null;
  if(rand()>=(crossTown?CROSS_CHANCE[mode]??0.4:0.3))return null;
  const towns=new Set([townOf(byId,fromId)?.id,townOf(byId,toId)?.id]),night=slotIndex===3,destination=byId.get(toId);
  const out=people.filter(p=>{
    if(!p.node_id||p.location_id===destination?.location_id||!towns.has(townOf(byId,p.node_id)?.id))return false;
    const kind=kindOf(byId.get(p.node_id)||{});
    return night?['transit','leisure'].includes(kind):!['room','home'].includes(kind)||slotIndex===2;
  });
  // People Palor knows are twice as likely to cross his way.
  const weighted=out.flatMap(p=>(p.level??0)>=1?[p,p]:[p]);
  if(weighted.length&&rand()<0.6){const p=pick(weighted,rand);return {kind:'person',character_id:p.id,name:p.name,text:`Útközben összefutsz vele: ${p.name}. Egy darabig együtt mentek.`};}
  return {kind:'event',text:eventFor(path,{night,crossTown,mode},rand)};
}
