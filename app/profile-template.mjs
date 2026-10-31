import {digest} from './character-edit.mjs';

const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(v);
const fail=(code,message,status=400)=>{throw Object.assign(new Error(message),{code,status});};
function shape(v,keys){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_ARGUMENT','Unexpected template fields.');}

// Return bounded field definitions, never character values or private notes.
export function readProfileTemplate(template,args={}){
  shape(args,['field_ids','limit','offset']);const {field_ids,limit=20,offset=0}=args;
  if(!Number.isSafeInteger(limit)||limit<1||limit>20||!Number.isSafeInteger(offset)||offset<0||offset>100)fail('INVALID_ARGUMENT','Use limit 1–20 and offset 0–100.');
  if(field_ids!==undefined&&(!Array.isArray(field_ids)||!field_ids.length||field_ids.length>20||field_ids.some(v=>!id(v))||new Set(field_ids).size!==field_ids.length))fail('INVALID_ARGUMENT','Select 1–20 distinct field IDs.');
  if(field_ids?.some(id=>!template.fields.some(f=>f.id===id)))fail('UNKNOWN_FIELD','A selected field is not in the current shared template.',404);
  const selected=field_ids?template.fields.filter(f=>field_ids.includes(f.id)):template.fields;
  return {template_version:template.version,scope:'shared_all_characters',field_count:template.fields.length,
    field_index:template.fields.map(({id,label,group,type,max})=>({id,label,group,type,...(max===undefined?{}:{max})})),
    fields:structuredClone(selected.slice(offset,offset+limit)),next_offset:offset+limit<selected.length?offset+limit:null,
    selected_count:selected.length,editing:{existing_fields:['label','group','guidance'],add_fields:true,reorder:true,remove_fields:false,change_existing_id_type_scale_source:false,character_values_unchanged:true}};
}

export function validateTemplatePatch(args){
  shape(args,['request_key','expected_version','field_updates','add_fields','field_order']);
  if(typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(args.request_key))fail('INVALID_ARGUMENT','Reuse an 8–128 character request_key for this exact edit.');
  if(!Number.isSafeInteger(args.expected_version)||args.expected_version<1)fail('INVALID_ARGUMENT','Read get_profile_template and supply its current template_version as expected_version.');
  if(Buffer.byteLength(JSON.stringify(args),'utf8')>200000)fail('TEMPLATE_LIMIT','Split this template edit into requests of at most 200000 UTF-8 bytes; read the new version between edits.',413);
  const updates=args.field_updates??[],additions=args.add_fields??[];
  for(const rows of [updates,additions])if(!Array.isArray(rows)||rows.length>20)fail('INVALID_ARGUMENT','Use at most 20 field updates and 20 new fields per request.');
  const seen=new Set();
  for(const f of updates){shape(f,['id','label','group','guidance']);if(!id(f.id)||seen.has(f.id)||Object.keys(f).length<2)fail('INVALID_ARGUMENT','Use distinct field IDs and at least one changed property.');seen.add(f.id);}
  for(const f of additions){shape(f,['id','label','group','type','max','source','guidance']);if(!id(f.id)||seen.has(f.id)||!['text','scale'].includes(f.type)||f.type==='text'&&Object.hasOwn(f,'max')||f.source!==undefined&&(typeof f.source!=='string'||!['biography','personality','appearance','speech_style','sexuality'].includes(f.source)))fail('INVALID_ARGUMENT','Invalid new field definition or duplicate ID.');seen.add(f.id);}
  if(args.field_order!==undefined&&(!Array.isArray(args.field_order)||!args.field_order.length||args.field_order.length>100||args.field_order.some(v=>!id(v))||new Set(args.field_order).size!==args.field_order.length))fail('INVALID_ARGUMENT','field_order must contain each field ID exactly once.');
  if(!updates.length&&!additions.length&&!args.field_order)fail('INVALID_ARGUMENT','Specify field_updates, add_fields or field_order.');
  return digest(args);
}

export function applyTemplatePatch(current,args){
  if(current.version!==args.expected_version)fail('STALE_TEMPLATE','The shared template changed. Read it again and prepare a new request key.',409);
  let fields=structuredClone(current.fields);const updated=[],added=[];
  for(const patch of args.field_updates??[]){const index=fields.findIndex(f=>f.id===patch.id);if(index<0)fail('UNKNOWN_FIELD','An updated field does not exist.',404);const next={...fields[index],...patch};if(digest(next)!==digest(fields[index]))updated.push(patch.id);fields[index]=next;}
  for(const f of args.add_fields??[]){if(fields.some(old=>old.id===f.id))fail('FIELD_EXISTS','A new field already exists. Update its label/group/guidance instead.',409);fields.push(structuredClone(f));added.push(f.id);}
  if(args.field_order){if(args.field_order.length!==fields.length||args.field_order.some(id=>!fields.some(f=>f.id===id)))fail('INVALID_ARGUMENT','field_order must include every existing and newly added field exactly once.');fields=args.field_order.map(id=>fields.find(f=>f.id===id));}
  return {fields,updated,added,changed:digest(current.fields)!==digest(fields),reordered:!!args.field_order&&digest(current.fields.map(f=>f.id))!==digest(args.field_order)};
}
