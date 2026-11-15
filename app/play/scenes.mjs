// Scene pictures, photo lists, the album and phone pictures for play mode, all chosen by the
// media director (split from play-mode.mjs, 2026-11-11).
import {clip} from '../world-common.mjs';
import {STAGE_ALLOW,BEATS,BEAT_WANT,PHONE_MOODS,anchorOf} from './rules.mjs';

export function createPlayScenes({one,all,fail,w,director,intimacyStage,clock,tree,currentNode}){
  const daypart=()=>clock().slot_index>=2?'night':'day';
  // How far an open intimate scene with him has gone (0..1, by the number of lines).
  const sceneProgress=cid=>{const c=one("SELECT id FROM play_conversations WHERE character_id=? AND status='open' AND mode='intimate' AND rewound_at IS NULL ORDER BY rowid DESC LIMIT 1",cid);return c?Math.min(1,one('SELECT count(*) n FROM play_lines WHERE conversation_id=?',c.id).n/12):null;};
  // Scene photos, chosen by the media director (scene panel): he must be in it, Palor with
  // him ranks higher, this place first, at the level the moment wants and the stage allows.
  // context: the recent conversation text; intimateWanted: an intimate scene is going on;
  // after: the picture shown just before (the next one continues the same shoot).
  async function sceneFor({cid,conv,beat,context,here,company=null}){
    const pid=w.palor()?.id,stage=company?'none':intimacyStage(cid);
    const prev=conv?one('SELECT sc.media_id,sc.beat,l.rowid r FROM play_line_scene sc JOIN play_lines l ON l.id=sc.line_id WHERE l.conversation_id=? ORDER BY l.rowid DESC LIMIT 1',conv.id):null;
    const since=prev?one("SELECT count(*) n FROM play_lines WHERE conversation_id=? AND speaker='character' AND rowid>?",conv.id,prev.r).n:0;
    if(prev&&prev.beat===beat&&since<3)return null;
    const used=conv?all('SELECT sc.media_id FROM play_line_scene sc JOIN play_lines l ON l.id=sc.line_id WHERE l.conversation_id=?',conv.id).map(r=>r.media_id):[];
    const cast=company?[cid,...company.filter(x=>x!==cid),...(pid?[pid]:[])]:pid&&pid!==cid?[cid,pid]:[cid];
    // The beat is also the ceiling: a flirt or a kiss never shows nudity, even when no everyday
    // picture is left (then the previous picture simply stays).
    const LV=['non_intimate','nudity','sexual_activity'],allow=LV[Math.min(BEAT_WANT[beat],LV.indexOf(STAGE_ALLOW[stage]))];
    const r=await director.pick({panel:'scene',characters:cast,location_id:here?.location_id||null,mood:BEAT_WANT[beat]?'intimate':'everyday',want:BEAT_WANT[beat],
      allow,context,daypart:daypart(),after:prev?.media_id||null,exclude:used,limit:1,onlyCast:true,samePlace:true});
    const i=r.items.find(x=>x.complete||!pid)||r.items[0];if(!i)return null;
    let doc=null;try{doc=JSON.parse(one('SELECT d.document_json FROM world_review_sources s JOIN world_review_documents d ON d.source_id=s.id WHERE s.media_id=? ORDER BY s.rowid DESC LIMIT 1',i.media_id)?.document_json||'null');}catch{}
    return {media_id:i.media_id,kind:i.kind,level:i.level,start_at:i.start_at,cast,
      display:{at_place:i.at_place,fit:i.fit,description:i.description?clip(i.description,300):null,anchor:anchorOf(doc?.participants,cid),palor_anchor:pid?anchorOf(doc?.participants,pid):null}};
  }
  async function photos(cid,nodeId,{context='',intimateWanted=false,after=null,beat=null}={}){
    if(!one('SELECT 1 FROM characters WHERE id=?',cid))throw fail('Character not found',404);
    const nodes=await tree(),byId=new Map(nodes.map(n=>[n.id,n])),here=byId.get(nodeId)||currentNode(nodes);
    const pid=w.palor()?.id,stage=intimacyStage(cid);
    // With a beat (the moment of the conversation) the list wants that level and never exceeds it.
    const LV=['non_intimate','nudity','sexual_activity'],beatCap=BEATS.includes(beat)?LV[Math.min(BEAT_WANT[beat],LV.indexOf(STAGE_ALLOW[stage]))]:STAGE_ALLOW[stage];
    const r=await director.pick({panel:'scene',characters:pid&&pid!==cid?[cid,pid]:[cid],location_id:here?.location_id||null,mood:intimateWanted?'intimate':'everyday',...(BEATS.includes(beat)?{want:BEAT_WANT[beat]}:{}),
      allow:beatCap,progress:intimateWanted?sceneProgress(cid):null,context,daypart:daypart(),after,limit:30,onlyCast:true,samePlace:true});
    const list=r.items.map(i=>{let doc=null;try{doc=JSON.parse(one('SELECT d.document_json FROM world_review_sources s JOIN world_review_documents d ON d.source_id=s.id WHERE s.media_id=? ORDER BY s.rowid DESC LIMIT 1',i.media_id)?.document_json||'null');}catch{}
      return {media_id:i.media_id,kind:i.kind,at_place:i.at_place,with_palor:!!(pid&&one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',i.media_id,pid)),intimate:i.level!=='non_intimate',level:i.level,
        seen:!!one('SELECT 1 FROM play_seen WHERE media_id=? AND character_id=?',i.media_id,cid),description:i.description?clip(i.description,300):null,reasons:i.reasons,confidence:i.confidence,start_at:i.start_at,fit:i.fit,
        anchor:anchorOf(doc?.participants,cid),palor_anchor:pid?anchorOf(doc?.participants,pid):null};});
    return {place:here?.short_name||null,stage,hidden:r.hidden,want_level:r.want_level,photos:list};
  }
  // Shared photos: the creator's pictures with both Palor and this character on them
  // (media director, memory panel): everyday ones first, intimate ones only when the stage
  // allows them, with the analysis description so a conversation can refer to it.
  // Album (2026-11-11): the scene pictures and videos Palor has seen with him, newest first,
  // and how many more the current stage would allow (locked, counted by level, never shown).
  async function album(cid){
    if(!one('SELECT 1 FROM characters WHERE id=?',cid))throw fail('Character not found',404);
    const pid=w.palor()?.id,stage=intimacyStage(cid);
    const r=await director.pick({panel:'scene',characters:pid&&pid!==cid?[cid,pid]:[cid],mood:'intimate',allow:STAGE_ALLOW[stage],limit:400,diverse:false});
    const seen=new Map(all('SELECT media_id,seen_at FROM play_seen WHERE character_id=?',cid).map(x=>[x.media_id,x.seen_at]));
    const unlocked=r.items.filter(i=>seen.has(i.media_id)).map(i=>({media_id:i.media_id,kind:i.kind,level:i.level,seen_at:seen.get(i.media_id),blur:i.level!=='non_intimate'})).sort((a,b)=>b.seen_at.localeCompare(a.seen_at));
    const locked={non_intimate:0,nudity:0,sexual_activity:0};for(const i of r.items)if(!seen.has(i.media_id))locked[i.level]++;
    return {character_id:cid,stage,unlocked,total:r.items.length,locked,hidden_by_stage:r.hidden};
  }
  async function sharedPhotos(cid,limit=24){
    const pid=w.palor()?.id;if(!pid||pid===cid||!one('SELECT 1 FROM characters WHERE id=?',cid))return [];
    const r=await director.pick({panel:'memory',characters:[cid,pid],mood:'everyday',allow:STAGE_ALLOW[intimacyStage(cid)],limit});
    return r.items.map(i=>({media_id:i.media_id,description:i.description?clip(i.description,400):null,intimate:i.level!=='non_intimate',level:i.level}));
  }
  async function phonePhoto(cid,wish,context,conversationId){
    if(!PHONE_MOODS[intimacyStage(cid)].includes(wish))return null;
    const sent=all('SELECT pm.media_id FROM play_line_media pm JOIN play_lines l ON l.id=pm.line_id JOIN play_conversations p ON p.id=l.conversation_id WHERE p.character_id=?',cid).map(r=>r.media_id);
    const last=conversationId?one('SELECT pm.media_id FROM play_line_media pm JOIN play_lines l ON l.id=pm.line_id WHERE l.conversation_id=? ORDER BY l.rowid DESC LIMIT 1',conversationId)?.media_id:null;
    const r=await director.pick({panel:'phone',characters:[cid],mood:wish,allow:STAGE_ALLOW[intimacyStage(cid)],progress:wish==='intimate'?1:null,context,daypart:daypart(),after:last,exclude:sent,limit:1});
    return r.items.find(i=>i.complete)||null;
  }
  return {daypart,sceneProgress,sceneFor,photos,album,sharedPhotos,phonePhoto};
}
