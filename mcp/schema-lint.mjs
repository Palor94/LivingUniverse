// Connector schema lint (2026-11-13): tool input schemas that ChatGPT's strict tool validator
// rejects. One bad schema makes the WHOLE connector answer {"detail":"Bad Request"}, so a single
// tool can take every tool down; on 2026-11-13 this was found only by hand. Used by the test
// suite and by the Rendszerállapot › Csatlakozó tab.
//
// Rejected (seen in practice): additionalProperties given as a schema, an array without items, a
// property without any type information. Also checked: required names must exist, names must be
// valid tool names, and the description must not be empty or too long.
// Warned (marked "warn:"): a plain free-form object ({type:'object'}). ChatGPT accepted the two
// existing ones (propose_ghost_profile.values, propose_story_event.event), so they are listed in
// the test as known; a NEW free-form object must be looked at before it ships.
import {tools as readTools} from './server.mjs';
import {writeTools} from './writes.mjs';
import {importTools} from './imports.mjs';
import {generationTools} from './generation.mjs';
import {backgroundTools} from './backgrounds.mjs';

export const MAX_DESCRIPTION=4000;

export function lintSchema(schema,where,issues=[]){
  if(!schema||typeof schema!=='object'){issues.push(where+': missing schema');return issues;}
  const typed=schema.type||schema.enum||schema.const!==undefined||schema.anyOf||schema.oneOf||schema.$ref;
  if(!typed)issues.push(where+': no type');
  if(schema.type==='object'){
    const props=schema.properties&&Object.keys(schema.properties).length;
    if(!props&&schema.additionalProperties!==false)issues.push('warn: '+where+': object without properties (free-form)');
    for(const name of schema.required||[])if(!schema.properties?.[name])issues.push(where+': required "'+name+'" is not a property');
  }
  if(schema.additionalProperties&&typeof schema.additionalProperties==='object')issues.push(where+': additionalProperties is a schema');
  if(schema.type==='array'&&!schema.items)issues.push(where+': array without items');
  for(const [k,v] of Object.entries(schema.properties||{}))lintSchema(v,where+'.'+k,issues);
  if(schema.items)lintSchema(schema.items,where+'[]',issues);
  for(const key of ['anyOf','oneOf'])for(const [i,v] of (schema[key]||[]).entries())lintSchema(v,where+'|'+key+i,issues);
  return issues;
}

export function lintTool(tool){
  const issues=[];
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(tool?.name||''))issues.push((tool?.name||'?')+': invalid tool name');
  const d=String(tool?.description||'');
  if(!d.trim())issues.push(tool.name+': empty description');
  if(d.length>MAX_DESCRIPTION)issues.push(tool.name+': description longer than '+MAX_DESCRIPTION);
  if(tool?.inputSchema?.type!=='object')issues.push(tool.name+': input schema must be an object');
  lintSchema(tool?.inputSchema,tool?.name||'?',issues);
  return issues;
}

// Every tool any connector can offer (read, write, rename, living world, imports, generation,
// backgrounds), each name once.
export function allTools(){
  const seen=new Map();
  for(const [group,list] of [['read',readTools],['write',writeTools],['import',importTools],['generation',generationTools],['backgrounds',backgroundTools]])
    for(const t of list)if(!seen.has(t.name))seen.set(t.name,{group,tool:t});
  return [...seen.values()];
}

export function lintAll(){
  const tools=allTools(),names=new Map();
  const issues=[];
  for(const {tool} of tools){issues.push(...lintTool(tool));names.set(tool.name,(names.get(tool.name)||0)+1);}
  return {count:tools.length,issues,errors:issues.filter(i=>!i.startsWith('warn: ')),warnings:issues.filter(i=>i.startsWith('warn: ')).map(i=>i.slice(6)),tools:tools.map(({group,tool})=>({name:tool.name,group,read_only:!!tool.annotations?.readOnlyHint,issues:lintTool(tool)}))};
}
