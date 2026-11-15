#!/usr/bin/env node
// Code checkpoints: a fast, local "undo" for the source code between development batches
// alongside Git history. Copies only the source (app/, tests/, docs/, mcp/, ops/,
// root guides and launchers) into %LOCALAPPDATA%\LivingUniverse\code-checkpoints\<id>\
// with a SHA-256 manifest. Never copies media, databases, keys or .env files, never
// deletes a checkpoint and never restores over the live folder.
//
//   node ops/code-checkpoint.mjs create [--label text]
//   node ops/code-checkpoint.mjs list
//   node ops/code-checkpoint.mjs diff <id>             what changed since that checkpoint
//   node ops/code-checkpoint.mjs restore <id> --to <new empty folder>
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const store=path.join(process.env.LOCALAPPDATA||path.join(project,'..'),'LivingUniverse','code-checkpoints');
const ROOTS=['app','tests','docs','mcp','ops'];
const ROOT_FILES=/^(?:[A-Z_]+\.md|package\.json|.*\.cmd|\.gitignore|\.env\.example)$/;
// Never copied: secrets, databases, dependencies, caches.
const SKIP=/(?:^|[\\/])(?:node_modules|__pycache__|\.git)(?:[\\/]|$)|\.(?:sqlite|sqlite-wal|sqlite-shm|db|key|pem|pfx|dpapi)$|(?:^|[\\/])\.env$|xai-key\.ps1$/i;

export async function sourceFiles(base=project){
  const out=[];
  async function walk(rel){for(const e of await fs.readdir(path.join(base,rel),{withFileTypes:true})){const r=path.join(rel,e.name);if(SKIP.test(r))continue;if(e.isDirectory())await walk(r);else if(e.isFile())out.push(r);}}
  for(const r of ROOTS)await walk(r).catch(e=>{if(e.code!=='ENOENT')throw e;});
  for(const e of await fs.readdir(base,{withFileTypes:true}))if(e.isFile()&&ROOT_FILES.test(e.name)&&!SKIP.test(e.name))out.push(e.name);
  return out.sort();
}
const sha=b=>createHash('sha256').update(b).digest('hex');

async function create(label=''){
  const id=new Date().toISOString().replace(/[:.]/g,'-')+(label?'-'+label.replace(/[^\p{L}\p{N}-]+/gu,'-').slice(0,40):'');
  const dir=path.join(store,id);await fs.mkdir(dir,{recursive:true});
  const files={};
  for(const rel of await sourceFiles()){const bytes=await fs.readFile(path.join(project,rel));const to=path.join(dir,'files',rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,bytes);files[rel.replace(/\\/g,'/')]={sha256:sha(bytes),size:bytes.length};}
  await fs.writeFile(path.join(dir,'MANIFEST.json'),JSON.stringify({id,label,created_at:new Date().toISOString(),project,files},null,1));
  return {id,files:Object.keys(files).length,dir};
}
async function manifest(id){if(typeof id!=='string'||!/^[\w\-\p{L}][\w.\-\p{L}]*$/u.test(id)||id.includes('..'))throw Error('Invalid checkpoint id.');return JSON.parse(await fs.readFile(path.join(store,id,'MANIFEST.json'),'utf8'));}
async function list(){const ids=await fs.readdir(store).catch(()=>[]);const out=[];for(const id of ids.sort()){try{const m=await manifest(id);out.push({id,label:m.label,files:Object.keys(m.files).length});}catch{}}return out;}
async function diff(id){
  const m=await manifest(id),now=new Map();for(const rel of await sourceFiles())now.set(rel.replace(/\\/g,'/'),sha(await fs.readFile(path.join(project,rel))));
  return {checkpoint:id,changed:[...now].filter(([r,h])=>m.files[r]&&m.files[r].sha256!==h).map(([r])=>r),added:[...now.keys()].filter(r=>!m.files[r]),removed:Object.keys(m.files).filter(r=>!now.has(r))};
}
async function restore(id,to){
  if(!to)throw Error('Give a new, empty target folder with --to.');
  const target=path.resolve(to);if(target===project||target.startsWith(project+path.sep))throw Error('Restore never writes into the live project folder.');
  if(await fs.stat(target).then(()=>true,()=>false))throw Error('The target folder already exists.');
  const m=await manifest(id);
  for(const rel of Object.keys(m.files)){const from=path.join(store,id,'files',rel),dest=path.join(target,rel);const bytes=await fs.readFile(from);if(sha(bytes)!==m.files[rel].sha256)throw Error('Checksum mismatch: '+rel);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);}
  return {restored:Object.keys(m.files).length,target};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [cmd,arg,...rest]=process.argv.slice(2),opt=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
  const run={create:()=>create(opt('--label')||(arg&&!arg.startsWith('--')?arg:'')),list,diff:()=>diff(arg),restore:()=>restore(arg,opt('--to'))}[cmd];
  if(!run){console.error('Usage: create [--label x] | list | diff <id> | restore <id> --to <folder>');process.exitCode=2;}
  else run().then(r=>console.log(JSON.stringify(r,null,1)),e=>{console.error(e.message);process.exitCode=1;});
  void rest;
}
