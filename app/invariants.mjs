// Consistency checks (2026-11-23, owner: "a more stable UI with fewer bugs"). Most recent bugs were
// two parts of the game disagreeing about one fact (a map marker with nobody in the place panel,
// a street meeting following Palor home). These are rules that must always hold; the robot player
// and the click-through journeys call them after every step. Pure: play-mode gathers the facts,
// this decides. No writes, no model call.
//
// errors   = something the player can see is wrong (or will be on the next screen)
// warnings = suspicious, may be legitimate for a moment (e.g. mid-transition)

export function checkInvariants(f){
  const errors=[],warnings=[];
  const err=(code,text,ids=[])=>errors.push({code,text,ids});
  const warn=(code,text,ids=[])=>warnings.push({code,text,ids});
  const live=(f.nodes||[]).filter(n=>!n.archived);
  const byId=new Map(live.map(n=>[n.id,n]));
  const byLoc=new Map();for(const n of live)if(n.location_id){if(!byLoc.has(n.location_id))byLoc.set(n.location_id,[]);byLoc.get(n.location_id).push(n);}
  const cast=new Map((f.cast||[]).map(c=>[c.id,c]));
  const name=id=>cast.get(id)?.name||id;
  const positions=f.positions instanceof Map?f.positions:new Map(f.positions||[]);

  // Palor himself
  if(!f.palorNodeId||!byId.has(f.palorNodeId))err('PALOR_NOWHERE','Palor helye nem létezik a térképen (node: '+(f.palorNodeId||'nincs')+').');

  for(const [cid,loc] of positions){
    if(!loc)continue;
    const nodes=byLoc.get(loc)||[];
    // A position with no place on the map: the person exists for prompts but no marker shows him.
    if(!nodes.length){err('LOST_PERSON',`${name(cid)} egy olyan helyen van, ami nincs a térképen (location ${loc}).`,[cid]);continue;}
    // Two map places share one location: his marker shows twice.
    if(nodes.length>1)err('SHOWN_TWICE',`${name(cid)} két térképhelyen is látszik: ${nodes.map(n=>n.short_name||n.name).join(', ')}.`,[cid,...nodes.map(n=>n.id)]);
    for(const n of nodes){
      // Stairwells and regions are walked through, never a place to stand in. A town's own street is
      // the exception (owner 2026-11-23): Palor runs into whoever is there, in the street window.
      if(n.walk_through&&!n.town_street)err('ON_WALK_THROUGH',`${name(cid)} egy átjáróhelyen áll (${n.short_name||n.name}); ott senki nem tartózkodhat.`,[cid,n.id]);
      // A building with an entry room: someone placed on the building itself is in no room.
      if(n.has_entry_room)err('IN_NO_ROOM',`${name(cid)} az épületre (${n.short_name||n.name}) van téve, nem egy szobájára: egyik szobában sem látszik.`,[cid,n.id]);
      // Fantasy beings only in the wardrobe world (owner 2026-11-20; Fenevad excepted).
      if(cast.get(cid)?.wardrobe_only&&!n.in_wardrobe)err('WARDROBE_ESCAPE',`${name(cid)} a szekrényvilágon kívül van (${n.short_name||n.name}).`,[cid,n.id]);
    }
  }

  // Street meeting (2026-11-23): must point at a real place and a real person.
  if(f.streetMeet){
    if(!byId.has(f.streetMeet.node_id))err('STREET_MEET_BROKEN','Utcai találkozó egy nem létező helyre mutat.',[f.streetMeet.node_id]);
    if(!cast.has(f.streetMeet.character_id))err('STREET_MEET_BROKEN','Utcai találkozó egy nem találkozható szereplőre mutat.',[f.streetMeet.character_id]);
  }

  // Conversations
  const open=f.openConversations||[];
  if(open.length>1)warn('SEVERAL_OPEN_TALKS',`${open.length} beszélgetés van nyitva egyszerre.`,open.map(c=>c.id));
  const present=new Set(f.presentAtPalor||[]);
  for(const c of open){
    if(c.channel!=='in_person')continue;
    const who=c.mode==='group'?(c.participants||[]):[c.character_id];
    const away=who.filter(id=>!present.has(id));
    // The "Feri at Norbi's" family: someone talking face to face who is not where Palor is.
    if(away.length)warn('TALK_PARTNER_ABSENT',`Nyitott személyes beszélgetés, de nincs Palorral egy helyen: ${away.map(name).join(', ')}.`,[c.id,...away]);
  }
  if(f.groupLinesWithoutSpeaker>0)err('GROUP_LINE_NO_SPEAKER',`${f.groupLinesWithoutSpeaker} társasági sor nem tudja, ki mondta.`);
  for(const a of f.appointmentsWithoutPlace||[])err('APPOINTMENT_NO_PLACE',`${name(a.character_id)} mai elfogadott találkozója nem létező helyre szól.`,[a.id,a.character_id]);

  return {ok:!errors.length,errors,warnings,counts:{errors:errors.length,warnings:warnings.length,people:positions.size,places:live.length}};
}

// Checks on one character reply (robot player, and later anything that wants it). Mechanical only:
// it cannot judge whether a reply feels right.
const LEAKS=['SZEREPKÁRTYA','RÉSZLETES PROFIL','TITKAID','TITKAI (','EMLÉKEZTETŐ, MIELŐTT','PROFILOD:','EMLÉKEID:','KAPCSOLATOD PALORRAL','RENDEZŐI JELZÉS','"reply"','"choices"'];
export function checkReply(text,{previous=[],max=1500}={}){
  const s=String(text||''),issues=[];
  if(!s.trim())issues.push({code:'EMPTY_REPLY',text:'Üres válasz.'});
  if(/(^|\n)\s*\*?\s*Palor\s*:/.test(s))issues.push({code:'WROTE_PALOR',text:'A szereplő Palor szavait is megírta.'});
  for(const l of LEAKS)if(s.includes(l)){issues.push({code:'PROMPT_LEAK',text:'A válaszban a prompt szövege látszik: '+l});break;}
  if(s.length>=max-1)issues.push({code:'CUT_SHORT',text:'A válasz elérte a hosszkorlátot (valószínűleg csonka).'});
  const norm=x=>String(x).toLocaleLowerCase('hu').replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
  if(s.trim()&&previous.some(p=>norm(p)===norm(s)))issues.push({code:'REPEATED_REPLY',text:'Szó szerint ugyanazt mondta, mint korábban.'});
  return issues;
}
