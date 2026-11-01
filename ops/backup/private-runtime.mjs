// Explicit operator-selected Linux files only. No discovery, activation or DPAPI conversion.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const fileLimit=1024*1024,totalLimit=8*1024*1024,payloadLimit=12*1024*1024;
const fail=message=>Error('PRIVATE_RUNTIME: '+message);
const digest=data=>createHash('sha256').update(data).digest('hex');
function parse(bytes){try{return JSON.parse(bytes.toString('utf8'));}catch{throw fail('Invalid private JSON document.');}}
function linux(){if(process.platform!=='linux')throw fail('This encrypted file workflow requires Linux.');}
function absolute(file){if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw fail('Explicit absolute paths required.');return path.resolve(file);}
function logical(name){
 if(typeof name!=='string'||name.length>240||! /^(config|credentials|policy|network)\/[A-Za-z0-9_. /-]+$/u.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||p.trim()!==p))throw fail('Unsafe private entry.');
 return name;
}
async function parents(file){
 let current=path.dirname(absolute(file));
 for(;;){const st=await fs.lstat(current);if(!st.isDirectory()||st.isSymbolicLink()||![0,process.getuid()].includes(st.uid)||((st.mode&0o022)!==0&&!((st.mode&0o1000)!==0&&st.uid===0)))throw fail('Unsafe parent directory.');if(current===path.dirname(current))break;current=path.dirname(current);}
}
async function privateParent(file){await parents(file);const st=await fs.lstat(path.dirname(file));if(st.uid!==process.getuid()||(st.mode&0o077)!==0)throw fail('Output parent must be private and owned by this user.');}
async function read(file,limit,{privateFile=true}={}){
 file=absolute(file);await parents(file);
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await handle.stat({bigint:true});if(!st.isFile()||st.nlink!==1n||st.size<1n||st.size>BigInt(limit)||st.uid!==BigInt(process.getuid())||(privateFile&&(st.mode&0o077n)!==0n))throw fail('File ownership, type, size or permissions rejected.');
 const bytes=await handle.readFile();const after=await handle.stat({bigint:true});if(bytes.length!==Number(st.size)||st.size!==after.size||st.mtimeNs!==after.mtimeNs||st.ctimeNs!==after.ctimeNs){bytes.fill(0);throw fail('Private file changed during capture.');}return bytes;
 }finally{await handle.close();}
}
const lines=bytes=>bytes.toString('utf8').split(/\r?\n/u).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
async function age(args,input,identityFd){
 return new Promise((resolve,reject)=>{
  // The fixed system binary and empty service environment cannot load provider keys or plugins.
  const child=spawn('/usr/bin/age',args,{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:Number.isInteger(identityFd)?['pipe','pipe','pipe',identityFd]:['pipe','pipe','pipe']});
  const chunks=[];let size=0,failed=false;
  const stop=()=>{failed=true;child.kill('SIGKILL');};const timer=setTimeout(stop,30000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>payloadLimit)stop();else chunks.push(chunk);});
  child.stderr.on('data',()=>{}); // Never expose age diagnostics containing private content.
  child.stdin.on('error',()=>{});
  child.once('error',()=>{clearTimeout(timer);reject(fail('age unavailable; install the distribution age package.'));});
  child.once('close',code=>{clearTimeout(timer);if(code!==0||failed){for(const chunk of chunks)chunk.fill(0);reject(fail('Encryption/decryption failed; no recovered files activated.'));}else resolve(Buffer.concat(chunks));});
  child.stdin.end(input);
 });
}
export async function protectPrivateRuntime({inventoryFile,recipientsFile,output}={}){
 linux();output=absolute(output);await privateParent(output);
 let payload,cipher;const sensitive=[];
 try{
  const inventoryBytes=await read(inventoryFile,65536);sensitive.push(inventoryBytes);
  const inventory=parse(inventoryBytes);
  if(inventory.format!==1||!Array.isArray(inventory.files)||!inventory.files.length||inventory.files.length>128)throw fail('Invalid explicit inventory.');
  const recipientBytes=await read(recipientsFile,16384,{privateFile:false});const recipients=lines(recipientBytes);
  if(!recipients.length||recipients.length>8||new Set(recipients).size!==recipients.length||recipients.some(r=>!/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/u.test(r)))throw fail('Use one to eight distinct native X25519 age recipients; plugins and interactive keys are unsupported.');
  const files=[],seen=new Set();let total=0;
  for(const entry of inventory.files){const name=logical(entry.path);if(seen.has(name))throw fail('Duplicate private entry.');seen.add(name);
   const bytes=await read(entry.source,fileLimit);sensitive.push(bytes);if(bytes.includes(Buffer.from('AGE-SECRET-KEY-')))throw fail('Recovery identities must remain outside the selected backup.');total+=bytes.length;if(total>totalLimit)throw fail('Private inventory exceeds the bounded payload.');files.push({path:name,bytes:bytes.toString('base64'),sha256:digest(bytes)});
  }
  for(const name of seen)if([...seen].some(other=>other.startsWith(name+'/')))throw fail('Conflicting file and directory entries.');
  payload=Buffer.from(JSON.stringify({format:1,kind:'living-universe-private-runtime',captured_at:new Date().toISOString(),files}));
  cipher=await age(['--encrypt',...recipients.flatMap(r=>['--recipient',r])],payload);
  // wx prevents overwriting an earlier encrypted recovery point.
  await fs.writeFile(output,cipher,{flag:'wx',mode:0o600});
  return {encrypted_files:files.length,protection:'age X25519; separately held recovery identity required',sha256:digest(cipher),activated:false};
 }finally{payload?.fill(0);for(const bytes of sensitive)bytes.fill(0);}
}
export async function restorePrivateRuntime({input,identityFile,target,expectedSha256}={}){
 linux();target=absolute(target);await privateParent(target);
 if(!/^[0-9a-f]{64}$/u.test(expectedSha256||''))throw fail('A trusted ciphertext SHA-256 is required.');
 let identity,plain;const recovered=[];
 try{
  const cipher=await read(input,payloadLimit);if(digest(cipher)!==expectedSha256)throw fail('Ciphertext checksum mismatch.');
  identity=await read(identityFile,16384);
  const keys=lines(identity);if(!keys.length||keys.length>8||keys.some(k=>!/^AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}$/u.test(k)))throw fail('Only native unencrypted X25519 identities are supported; no interactive or plugin execution.');
  // age reopens /dev/fd/3; a Node 'pipe' is a socket and cannot be reopened there.
  // Pass an already opened regular file, never a secret value or mutable path argument.
  const identityHandle=await fs.open(absolute(identityFile),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const held=await identityHandle.readFile();try{if(!held.equals(identity))throw fail('Identity changed before decryption.');}finally{held.fill(0);}plain=await age(['--decrypt','--identity','/dev/fd/3'],cipher,identityHandle.fd);}finally{await identityHandle.close();}
  const payload=parse(plain);if(payload.format!==1||payload.kind!=='living-universe-private-runtime'||!Array.isArray(payload.files)||!payload.files.length||payload.files.length>128)throw fail('Invalid private archive.');
  let total=0;const seen=new Set();
  for(const entry of payload.files){const name=logical(entry.path);if(seen.has(name))throw fail('Duplicate private entry.');seen.add(name);
   if(typeof entry.bytes!=='string'||entry.bytes.length>Math.ceil(fileLimit/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(entry.bytes))throw fail('Invalid private file encoding.');
   const bytes=Buffer.from(entry.bytes,'base64');recovered.push({name,bytes});total+=bytes.length;if(!bytes.length||bytes.length>fileLimit||total>totalLimit||digest(bytes)!==entry.sha256)throw fail('Private file integrity or size mismatch.');
  }
  for(const name of seen)if([...seen].some(other=>other.startsWith(name+'/')))throw fail('Conflicting file and directory entries.');
  // All authentication and entry checks finish before the first plaintext filesystem write.
  await fs.mkdir(target,{mode:0o700});
  for(const {name,bytes} of recovered){const file=path.join(target,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});}
  return {restored_files:recovered.length,activated:false,requires_operator_review:true};
 }finally{identity?.fill(0);plain?.fill(0);for(const item of recovered)item.bytes.fill(0);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [command,...args]=process.argv.slice(2),options={};const allowed=new Set(['--inventory','--recipients','--output','--input','--identity','--target','--sha256']);
  for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||options[args[i]])throw fail('Expected explicit unique options.');options[args[i]]=args[i+1];}
  const result=command==='protect'?await protectPrivateRuntime({inventoryFile:options['--inventory'],recipientsFile:options['--recipients'],output:options['--output']}):command==='restore'?await restorePrivateRuntime({input:options['--input'],identityFile:options['--identity'],target:options['--target'],expectedSha256:options['--sha256']}):null;
  if(!result)throw fail('Use protect or restore.');console.log(JSON.stringify(result));
 }catch{console.error('PRIVATE_RUNTIME_FAILED: Check explicit paths, permissions, age installation, trusted checksum and recovery identity. No service was activated.');process.exitCode=1;}
}
