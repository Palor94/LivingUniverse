// Content levels of a picture or video, from tamest to most intimate (owner, 2026-11-22: a
// separate "félmeztelen" level between everyday and nude). One list for the whole program:
//   non_intimate  – hétköznapi (dressed, everyday)
//   shirtless     – félmeztelen (bare upper body, trousers or shorts on, nothing intimate)
//   nudity        – meztelen (nude, no sex)
//   sexual_activity – szex
// Order matters: the rank is the index, and every "never above" ceiling compares ranks.
export const LEVELS=['non_intimate','shirtless','nudity','sexual_activity'];
export const RANK=Object.fromEntries(LEVELS.map((l,i)=>[l,i]));
export const isLevel=v=>LEVELS.includes(v);
// The word a file name carries for each level ("Norbi - Kávézó - felmeztelen - 1.png").
export const CONTENT_WORD={non_intimate:'hetkoznapi',shirtless:'felmeztelen',nudity:'meztelen',sexual_activity:'szex'};
// Words read back from a file name (accents already folded away; "félmeztelen" → "felmeztelen").
export const WORD_LEVEL={hetkoznapi:'non_intimate',felmeztelen:'shirtless',meztelen:'nudity',szex:'sexual_activity',szexualis:'sexual_activity'};
export const LEVELS_TEXT='non_intimate, shirtless, nudity or sexual_activity';
// SQL: the most intimate analysed still of a video, as a level (NULL when none is analysed).
export const videoFrameLevelSql=mediaId=>`(SELECT CASE max(CASE f.level ${LEVELS.map((l,i)=>`WHEN '${l}' THEN ${i}`).join(' ')} END) ${LEVELS.map((l,i)=>`WHEN ${i} THEN '${l}'`).join(' ')} END FROM media_video_frames f WHERE f.media_id=${mediaId})`;
// The AI analysis (world-v1) has no shirtless level: a bare chest comes back as non_intimate with
// evidence such as "A bare chest is visible…". Owner rule (2026-11-22): every AI result whose
// evidence names a bare chest or bare torso counts as shirtless. Only upward: a nude or explicit
// result stays nude or explicit. The stored analysis is not rewritten; the owner's own label wins.
const BARE=['bare chest','bare-chest','bare torso','bare-torso'];
export const isBareTorso=evidence=>{const e=String(evidence||'').toLowerCase();return BARE.some(w=>e.includes(w));};
export const aiLevelOf=content=>content?.level==='non_intimate'&&isBareTorso(content.evidence)?'shirtless':content?.level;
// The same rule in SQL, for a raw_json column (e.g. aiLevelSql('s.raw_json')).
export const aiLevelSql=raw=>{const lvl=`json_extract(${raw},'$.world_details.content.level')`,ev=`lower(coalesce(json_extract(${raw},'$.world_details.content.evidence'),''))`;
  return `(CASE WHEN ${lvl}='non_intimate' AND (${BARE.map(w=>`${ev} LIKE '%${w}%'`).join(' OR ')}) THEN 'shirtless' ELSE ${lvl} END)`;};
