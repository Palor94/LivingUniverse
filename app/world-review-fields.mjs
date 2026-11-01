import {createHash} from 'node:crypto';
import {validateSceneDetails,sceneRoles} from './analysis-scene.mjs';
import {validateWorldDetails,worldDetailsSchema} from './analysis-world.mjs';

export const reviewDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const reviewError=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const bad=()=>{throw reviewError('INVALID_REVIEW','Érvénytelen ellenőrzési adat.');};
const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))bad();};
const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v))bad();return v.normalize('NFC').trim();};
const pair=v=>{object(v,['hu','en']);const out={hu:text(v.hu,200),en:text(v.en,200)};if(!out.hu||!out.en)bad();return out;};
export const cameraOptions=Object.fromEntries(['direction','elevation','framing'].map(k=>[k,worldDetailsSchema.properties.camera.properties[k].enum]));
export function reviewRegion(region){if(region===null)return null;object(region,['x','y','width','height']);if(['x','y','width','height'].some(k=>!Number.isFinite(region[k])||region[k]<0||region[k]>1)||region.width<=0||region.height<=0||region.x+region.width>1.000001||region.y+region.height>1.000001)bad();return {...region};}
export function reviewRaw(value){
 if(!value||Buffer.byteLength(JSON.stringify(value))>65536||value.schema!==1||!value.description||!value.background||!['neutral','scene','mixed','uncertain'].includes(value.background.kind)||!Array.isArray(value.tags)||value.tags.length>60)bad();
 object(value.description,['hu','en']);text(value.description.hu,4000);text(value.description.en,4000);
 validateSceneDetails(value.scene_details,value.background.kind);validateWorldDetails(value.world_details,value.scene_details);
 for(const tag of value.tags){text(tag.category,50);pair({hu:tag.hu,en:tag.en});if(typeof tag.uncertain!=='boolean')bad();text(tag.evidence,1000);}
 return structuredClone(value);
}
export function reviewFields(raw,document={fields:{}}){
 const out=[],scene=raw.scene_details,world=raw.world_details;
 const add=(id,group,kind,value,evidence='',uncertain=false,extra={})=>out.push({id,group,kind,original_value:structuredClone(value),value:structuredClone(value),state:'pending',evidence,uncertain,...extra});
 add('environment','environment','bilingual',scene.environment.observed_function,scene.environment.evidence,scene.environment.uncertain);
 scene.compatible_settings.forEach((s,i)=>add('setting:'+i,'compatible_setting','bilingual',s.label,s.evidence,s.uncertain,{basis:s.basis}));
 for(const a of scene.activities){add('activity:'+a.id,'activity','bilingual',a.activity,a.evidence,a.uncertain,{activity_id:a.id});add('position:'+a.id,'position','bilingual',a.position,a.evidence,a.uncertain,{activity_id:a.id});a.roles.forEach((r,i)=>add('role:'+a.id+':'+i,'role','role',{role:r.role,participant_id:r.participant_id,activity_id:a.id},r.evidence,r.uncertain||a.uncertain));}
 for(const k of ['direction','elevation','framing'])add('camera:'+k,'camera',k,world.camera[k],world.camera.evidence,world.camera.uncertain);
 world.reference_coverage.forEach(r=>add('coverage:'+r.participant_id,'reference','coverage',r,r.limitations,r.uncertain,{participant_id:r.participant_id}));
 world.scene_requirements.visible_features.forEach((v,i)=>add('feature:'+i,'visible_feature','bilingual',v,world.scene_requirements.evidence,world.scene_requirements.uncertain));
 world.scene_requirements.incompatible_uses.forEach((v,i)=>add('conflict:'+i,'incompatible_use','bilingual',v,world.scene_requirements.evidence,true));
 add('simulation','simulation','simulation',{scope:scene.simulation_use.suggested_scope,narration_only:scene.simulation_use.narration_only},scene.simulation_use.evidence,scene.simulation_use.uncertain);
 raw.tags.forEach((t,i)=>add('tag:'+i,'tag:'+t.category,'bilingual',{hu:t.hu,en:t.en},t.evidence,t.uncertain,{suggested_tag_id:t.tag_id||null}));
 for(const [id,edit]of Object.entries(document.fields||{}))if(/^user-setting:[a-f0-9-]{36}$/u.test(id))add(id,'compatible_setting','bilingual',edit.value,'Alkotó által hozzáadott helyszínlehetőség.',false,{basis:'creator_observation',manual:true});
 return out;
}
export function defaultReview(raw){return {fields:{},participants:raw.scene_details.participants.map(p=>({id:p.id,region:p.region,character_id:null,identity_state:'unreviewed',ignored:false,description:p.screen_position.hu})),identity_reviewed:false};}
export function validateReviewDocument(raw,document,{characterExists=()=>true,planning=false}={}){
 object(document,['fields','participants','identity_reviewed']);if(!document.fields||typeof document.fields!=='object'||Array.isArray(document.fields)||!Array.isArray(document.participants)||document.participants.length>24||typeof document.identity_reviewed!=='boolean')bad();
 const original=new Map(reviewFields(raw,document).map(f=>[f.id,f])),ids=new Set(),participants=document.participants.map(p=>{
  object(p,['id','region','character_id','identity_state','ignored','description']);if(typeof p.id!=='string'||!(/^(p[1-8]|u[1-9][0-9]?)$/u.test(p.id))||ids.has(p.id)||typeof p.ignored!=='boolean'||!['unreviewed','reviewed','unknown','not_character'].includes(p.identity_state)||!(p.character_id===null||typeof p.character_id==='string'&&characterExists(p.character_id)))bad();
  if(p.identity_state==='reviewed'&&!p.character_id||['unknown','not_character'].includes(p.identity_state)&&p.character_id!==null||p.ignored&&p.character_id!==null||!document.identity_reviewed&&p.identity_state==='reviewed')bad();
  ids.add(p.id);return {...p,description:text(p.description,200),region:reviewRegion(p.region)};
 });
 for(const p of raw.scene_details.participants)if(!ids.has(p.id))bad();
 const fields={};if(Object.keys(document.fields).length>200)bad();
 for(const [id,edit]of Object.entries(document.fields)){
  const field=original.get(id);if(!field)bad();object(edit,['state','value','ack_uncertain','target_id']);if(!['pending','accepted','rejected'].includes(edit.state)||typeof edit.ack_uncertain!=='boolean'||edit.state==='accepted'&&field.uncertain&&!edit.ack_uncertain)bad();
  let value=edit.value;
  if(field.kind==='bilingual')value=pair(value);
  else if(cameraOptions[field.kind]){if(!cameraOptions[field.kind].includes(value))bad();}
  else if(field.kind==='role'){
   object(value,['role','participant_id','activity_id']);if(!sceneRoles.includes(value.role)||!ids.has(value.participant_id)||value.activity_id!==field.original_value.activity_id)bad();value={...value};
  }else if(field.kind==='coverage'){
   object(value,['participant_id','face_visibility','body_coverage','occlusion','usable_for','limitations','uncertain']);
   if(value.participant_id!==field.participant_id||!ids.has(value.participant_id)||!['clear','partial','hidden','unclear'].includes(value.face_visibility)||!['full','partial','hidden','unclear'].includes(value.body_coverage)||!['none','partial','heavy','unclear'].includes(value.occlusion)||!Array.isArray(value.usable_for)||value.usable_for.length>3||new Set(value.usable_for).size!==value.usable_for.length||value.usable_for.some(u=>!['face_reference','body_reference','pose_reference'].includes(u))||typeof value.uncertain!=='boolean')bad();
   if(value.usable_for.includes('face_reference')&&!['clear','partial'].includes(value.face_visibility)||value.usable_for.some(u=>['body_reference','pose_reference'].includes(u))&&!['full','partial'].includes(value.body_coverage))bad();value={...value,limitations:text(value.limitations,500)};
  }else if(field.kind==='simulation'){
   object(value,['scope','narration_only']);if(!['scene_illustration','character_introduction','review_required'].includes(value.scope)||typeof value.narration_only!=='boolean'||raw.background.kind==='neutral'&&(value.scope!=='character_introduction'||!value.narration_only))bad();
   // Planning purpose is enforced independently by retrieval; reviewing a visual
   // usage observation must not prevent saving a neutral illustrated plan.
   value={...value};
  }else bad();
  if(edit.target_id!==undefined&&edit.target_id!==null&&typeof edit.target_id!=='string')bad();fields[id]={state:edit.state,value,ack_uncertain:edit.ack_uncertain,target_id:edit.target_id||null};
 }
 return {fields,participants,identity_reviewed:document.identity_reviewed};
}
export function effectiveReviewFields(raw,document){return reviewFields(raw,document).map(field=>{const edit=document.fields[field.id];return edit?{...field,...edit,value:edit.state==='pending'?field.original_value:edit.value,draft_value:edit.value}:field;});}
export function factText(field){const v=field.value;if(field.kind==='bilingual')return v;if(field.kind==='role')return {hu:v.role,en:v.role};if(field.kind==='coverage')return {hu:v.usable_for.join(' '),en:v.usable_for.join(' ')};if(field.kind==='simulation')return {hu:v.scope,en:v.scope};return {hu:String(v),en:String(v)};}
