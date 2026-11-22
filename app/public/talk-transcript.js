// Full transcript of one saved play talk (2026-11-22). Shared by the profile's talk log
// (story-events.js) and the relationship panel in play mode (play.js), so a talk reads the
// same wherever it is opened. Lines come from GET /api/play/talk-log/talk/:id:
// {speaker:'palor'|'character', speaker_id?:'guest:<id>'|<character id>, name, text, created_at}.

// Which side of the conversation a line belongs to, for styling: Palor, the main character
// of the talk, or someone else in the scene (a guest such as Feri, or a group member).
export function lineRole(line,mainName){
  if(line.speaker==='palor')return 'palor';
  if(String(line.speaker_id||'').startsWith('guest:')||(mainName&&line.name!==mainName))return 'other';
  return 'main';
}

// Actions the model writes as *sóhajt* or (közelebb lép) read as narration, in italics.
// Runs on already escaped text, so the markers are plain characters and no HTML can slip in.
const actions=html=>html.replace(/\*([^*\n]+)\*/g,'<em class="talk-act">$1</em>').replace(/\(([^()\n]+)\)/g,'<em class="talk-act">($1)</em>');

// One line of the transcript as HTML. `role` is lineRole(); `esc` escapes text for HTML.
// Palor's own bubbles carry no name: the right-hand side already says it is him.
export function renderLine(line,role,esc){
  const who=role==='palor'?'':`<span class="talk-who">${esc(line.name)}</span>`;
  return `<div class="talk-line ${role}">${who}${actions(esc(line.text))}</div>`;
}

export function transcriptHtml(lines,esc){
  if(!lines?.length)return '';
  // The talk's main character is whoever speaks first on the character side.
  const mainName=lines.find(l=>l.speaker!=='palor')?.name||'';
  return `<div class="talk-transcript">${lines.map(l=>renderLine(l,lineRole(l,mainName),esc)).join('')}</div>`;
}
