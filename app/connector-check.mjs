// Connector self-test (debugging package, 2026-11-13): what ChatGPT and Grok can see and what
// they did, on one page (Rendszerállapot › Csatlakozó).
//  - every tool and its schema lint result (a single rejected schema breaks the whole connector);
//  - the connector processes' code version against the files on disk: a process that still runs
//    older code needs a restart (vezérlő [2]);
//  - the last 50 tool calls (name, outcome, time; never arguments or results), the last tool-list
//    refresh per client, and calls for tools the current list does not have (an old chat).
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {lintAll} from '../mcp/schema-lint.mjs';
import {codeVersion} from '../mcp/call-log.mjs';

function readLog(file,limit){
  const out=[];
  for(const f of [file.replace(/\.log$/,'.1.log'),file]){
    let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
    for(const l of text.split('\n')){if(!l)continue;try{out.push(JSON.parse(l));}catch{}}
  }
  return out.slice(-limit);
}

export function connectorView({dataDir,projectRoot}){
  const lint=lintAll();
  const now=codeVersion(path.join(projectRoot,'mcp'));
  const entries=readLog(path.join(dataDir,'logs','mcp-calls.log'),2000);
  const clients=new Map();
  for(const e of entries){
    const c=clients.get(e.client)||{client:e.client,last_at:null,version:null,pid:null,last_list:null,listed:null,calls:0,errors:0,stale_calls:0};
    c.last_at=e.at;c.version=e.version;c.pid=e.pid;
    if(e.kind==='list'){c.last_list=e.at;c.listed=e.count;}
    if(e.kind==='call'){c.calls++;if(!e.ok)c.errors++;if(e.code==='UNKNOWN_TOOL')c.stale_calls++;}
    clients.set(e.client,c);
  }
  const list=[...clients.values()].map(c=>({...c,old_code:!!c.version&&c.version!=='unknown'&&c.version<now}));
  const calls=entries.filter(e=>e.kind==='call').slice(-50).reverse().map(({at,client,tool,ok,code,ms})=>({at,client,tool,ok,code,ms}));
  const problems=[];
  if(lint.errors.length)problems.push('schema');
  if(list.some(c=>c.old_code))problems.push('old_code');
  if(entries.some(e=>e.code==='UNKNOWN_TOOL'&&Date.parse(e.at)>Date.now()-24*3600e3))problems.push('old_chat');
  return {code_version:now,tool_count:lint.count,schema_errors:lint.errors,schema_warnings:lint.warnings,tools:lint.tools,clients:list,calls,problems};
}
