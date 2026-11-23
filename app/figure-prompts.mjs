// English generation prompts for consistent character figures (visual-novel sprites).
// Built only from the character's APPROVED appearance (canon) and his approved reference
// images, which the user attaches in Grok. Identity is never invented here.
export const FIGURE_EXPRESSIONS=Object.freeze([
  {file:'alap',hu:'alap',en:'a calm, neutral, natural expression'},
  {file:'mosoly',hu:'mosoly',en:'a warm, genuine smile'},
  {file:'nevet',hu:'nevet',en:'laughing openly'},
  {file:'ideges',hu:'ideges',en:'an annoyed, irritated expression with a slight frown'},
  {file:'szomoru',hu:'szomorú',en:'a sad, downcast expression'},
  {file:'meglepett',hu:'meglepett',en:'a surprised expression, eyebrows raised'},
  {file:'flortol',hu:'flörtöl',en:'a confident, teasing half-smile'}
]);

// Background for a place: the full path tells where it is; three time-of-day versions.
export function backgroundPrompt({name,path,folder}){
  const base=`Photorealistic wide 16:9 background photo of "${name}" (${path}), Hungary, for a visual-novel game. Eye-level view, empty of people and cars in the foreground, no readable text, no logos, no watermark. Natural, believable details of a real Hungarian place; if it is a real public place, match its real look. Calm composition with free space in the lower middle where characters will stand.`;
  return {base:base+' Light: ordinary daylight.',evening:base+' Light: early evening, warm low sun and first lamps.',night:base+' Light: night, artificial lights, deep shadows.',
    save_as:`${folder}\\nappal.png · este.png · ejjel.png`,folder};
}
// A picture of Palor and one character together at a place (for photo scenes). Explicit
// wording is added only when their relationship stage is intimate.
// useReferences:false (a character not recorded as invented): no photographs of him are
// used, only his appearance notes, and the moment stays everyday.
// palorReferences:false – Palor's photos are not used either; he is drawn from his notes.
// The moment of a talk (its latest beat), never beyond what the relationship stage allows.
const BEAT_MOMENT={talk:'talking with each other',flirt:'flirting, standing close, playful looks',kiss:'kissing',undress:'undressing each other, partly undressed',sex:'having consensual sex',after:'lying together afterwards, relaxed and close'};
const BEAT_RANK={talk:0,flirt:1,kiss:1,undress:2,sex:3,after:2},STAGE_RANK={none:0,flirt:2,intimate:3};
export const beatAllowed=(beat,stage)=>!!BEAT_MOMENT[beat]&&BEAT_RANK[beat]<=(STAGE_RANK[stage]??0);
const LIGHT={reggel:'soft morning light',delutan:'daylight',este:'warm early-evening light, first lamps on',ejszaka:'night, artificial light, deep shadows'};
// talk (optional, 2026-11-13): {beat, memo, lines:[{who,text}], slot} from the open conversation, so
// the picture shows what is happening now, not only who is where.
export function scenePrompt({palor,name,place,path,stage,activity,folder,useReferences=true,appearance='',palorReferences=true,palorAppearance='',intimateAllowed=useReferences,talk=null}){
  if(!intimateAllowed)stage='none';
  const notes=(who,text)=>`${who} is drawn only from these notes, never from a photograph of a real person: ${String(text).replace(/\s+/g,' ').trim().slice(0,600)||'an ordinary adult male'}.`;
  const mood=stage==='intimate'?'an intimate, consensual moment between the two adult males, sensual and close':stage==='flirt'?'a flirty, close, playful moment between the two adult males':'an everyday friendly moment between the two adult males';
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const beat=talk&&beatAllowed(talk.beat,stage)?talk.beat:null;
  // Lines and summary go in only while the talk stays within the allowed stage.
  const inBounds=!!talk&&(!talk.beat||beatAllowed(talk.beat,stage));
  const lines=inBounds?(talk.lines||[]).filter(l=>clean(l.text)).slice(-8):[];
  return {prompt:[`Photorealistic photo of ${palor} and ${name} together at "${place}" (${path}).`,
    'Identity: '+[palorReferences?`${palor} matches his attached approved reference photos exactly (face, hair, body, body hair).`:notes(palor,palorAppearance),
      useReferences?`${name} matches his attached approved reference photos exactly (face, hair, body, body hair).`:notes(name,appearance)].join(' '),
    `Moment: ${beat?`${BEAT_MOMENT[beat]}, ${mood.replace(/^an? /,'')}`:mood}${activity&&!beat?`; ${name} is ${activity}`:''}.`,
    talk?.slot&&LIGHT[talk.slot]?`Time of day: ${LIGHT[talk.slot]}.`:'',
    inBounds&&clean(talk.memo)?`What happened so far in their conversation (Hungarian): ${clean(talk.memo).slice(0,700)}`:'',
    lines.length?`Their latest lines (Hungarian). Use them for the situation, mood, clothing, gestures, objects and the details they mention; never write any of this text into the image:\n${lines.map(l=>`${l.who}: ${clean(l.text).slice(0,260)}`).join('\n')}`:'',
    'Composition: both men clearly visible, natural poses, candid camera at eye level, believable light for the place; no text, no watermark. Both are adults.'].filter(Boolean).join('\n'),
    save_as:`${folder}\\${place} - 1.png`,folder,
    howto:`Save the image into ${folder} with a name that starts with the place ("${place} - 1.png"). Add "hetkoznapi", "felmeztelen", "meztelen" or "szex" to the file name to mark its content; otherwise it counts as intimate until you mark it in the game.`};
}

export function figurePrompt({name,appearance,referenceCount,folder,useReferences=true,folderOnly=false}){
  const identity=folderOnly
    ?`Identity: use only the listed pictures from ${name}'s character folder. Match the same adult male's face, hair, beard, skin, body hair and body proportions. These are generation inputs, not automatic canon approval. Never invent a substitute person; stop if the supplied pictures do not establish his identity.`
    :!useReferences
    ?`Identity: build him only from the appearance notes below; do not use or imitate a photograph of a real person.`
    :referenceCount
    ?`Identity: match the attached approved reference photos of ${name} exactly — same face, hair, beard, skin, body hair, height and body proportions. Do not beautify or change his age or build.`
    :`Identity: attach ${name}'s approved reference photos before generating; without them the figure will not look like him.`;
  const base=[
    `Create a photorealistic full-body character figure of ${name}, an adult male, for a visual-novel game. If his notes or pictures show a non-human or fantasy being, draw him as that being, not as a human.`,
    identity,
    appearance?`Approved appearance notes: ${appearance.replace(/\s+/g,' ').trim().slice(0,900)}`:'',
    'Pose: standing upright, full body from head to toe, facing the viewer with a slight three-quarter turn, arms relaxed at his sides, weight evenly on both feet.',
    'Clothing: his everyday clothes that fit the appearance notes; keep exactly the same outfit in every expression version.',
    folderOnly?'Continuity: use the supplied pictures to preserve the same person and visible build across the dressed and shirtless rows. Complete body areas hidden by cropping or clothing naturally and anatomically consistently with the visible proportions; do not stop because an area is covered. Keep the same chosen outfit, trousers and shoes in every expression version.':'',
    'Lighting: soft, even studio light from the front-left, no harsh shadows, no rim light, natural skin tones.',
    'Background: a completely flat, solid chroma-key green (#00B140). No floor, no shadow on the ground, no props, no text, no logo, no watermark.',
    'Framing: vertical 2:3 portrait, the whole body inside the frame with a small margin above the head and below the feet, camera at chest height, sharp focus.',
    'Expression: a calm, neutral, natural expression.'
  ].filter(Boolean).join('\n');
  const variants=FIGURE_EXPRESSIONS.slice(1).map(x=>`${x.file}.png — "Same person, same outfit, pose, light, background and framing as the previous image; change only the facial expression to ${x.en}."`).join('\n');
  return {base,variants,save_as:`${folder}\\alap.png`,folder,
    howto:`ChatGPT makes the figures (owner, 2026-11-15): paste the ChatGPT order into a chat with the Living Universe connector; it generates each picture and saves it into the app itself. Manual fallback: ${useReferences?`attach ${name}'s approved reference photos and send`:'send (without any photo)'} the base prompt, save the result as alap.png into ${folder}, then each expression in the same chat under its file name. The app picks the files up and removes the green background.`};
}
// The figure order for ChatGPT (owner, 2026-11-15: "Chatgpt csinálja az alakpromtokat"): one message
// for a chat with the Living Universe connector. ChatGPT takes the brief from the app (prompt and
// allowed references), generates natively and hands the picture back with finish_generation_job.
// missing: {dressed, shirtless, intimate} → expression file names still without a figure.
export function chatgptFigureOrder({id,name,missing}){
  const rows=[['dressed','hétköznapi ruhában, teljes alak'],['police','rendőregyenruhában, teljes alak'],['shirtless','félmeztelen, teljes alak'],['intimate','félmeztelen, derékig']].filter(([k])=>missing[k]?.length);
  if(!rows.length)return `${name}: minden alakja megvan; nincs teendő.`;
  return [`Use the Living Universe connector. Make the visual-novel figures of ${name} (character_id ${id}) yourself, inside the app. Never ask me to download or save anything.`,
    `Missing figures (outfit → expressions): ${rows.map(([k,hu])=>`${k} (${hu}): ${missing[k].join(', ')}`).join('; ')}.`,
    `For each one, dressed row first and "alap" first in every row: call start_generation_job {target:"figure", character_id:"${id}", expression, outfit}, generate the picture natively from the brief's prompt with the references it allows (same man, same outfit, pose, light, green background and framing in the whole row), then call finish_generation_job with the picture attached and outcome "done".`,
    'If the brief says the references are missing, stop and tell me. If your generator declines, call finish_generation_job with outcome "refused" and the reason, and go on; never reword a request to get around a refusal.',
    'Draw only this character. Presentation only: no canon, profile or catalogue change. Up to six pictures per answer; then report in Hungarian what was saved and what is left, and wait until I write "tovább".'].join('\n\n');
}
