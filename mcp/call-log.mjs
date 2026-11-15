// Connector call log (debugging package, 2026-11-13): one line per tools/list and tools/call that
// ChatGPT or Grok sends, so the Rendszerállapot › Csatlakozó tab can show what the connector
// really received. Metadata only: tool name, outcome code, time, how many tools were listed and
// which program version answered. Never arguments, results, images or tokens.
// File: <catalogue folder>/logs/mcp-calls.log (outside OneDrive), capped at 512 KiB.
import {appendFileSync,mkdirSync,readdirSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_BYTES=512*1024;
const here=path.dirname(fileURLToPath(import.meta.url));

// The newest modification time of the connector's own code (mcp/*.mjs). The desktop program
// computes the same from the files on disk: when they differ, the connector process still runs
// older code and needs a restart.
export function codeVersion(dir=here){
  let newest=0;
  try{for(const f of readdirSync(dir))if(f.endsWith('.mjs')){const m=statSync(path.join(dir,f)).mtimeMs;if(m>newest)newest=m;}}catch{}
  return newest?new Date(Math.floor(newest/1000)*1000).toISOString().replace('.000Z','Z'):'unknown';
}
export const PROGRAM_VERSION=codeVersion();

export function createCallLog(file,{client='stdio',now=()=>new Date()}={}){
  return function record(entry){
    if(!file)return;
    try{
      mkdirSync(path.dirname(file),{recursive:true});
      try{if(statSync(file).size>MAX_BYTES)renameSync(file,file.replace(/\.log$/,'.1.log'));}catch(e){if(e.code!=='ENOENT')throw e;}
      appendFileSync(file,JSON.stringify({at:now().toISOString(),client,version:PROGRAM_VERSION,pid:process.pid,...entry})+'\n');
    }catch{/* logging must never break the connector */}
  };
}
export const callLogFile=database=>path.join(path.dirname(database),'logs','mcp-calls.log');
