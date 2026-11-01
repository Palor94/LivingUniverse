import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {protectPrivateRuntime,restorePrivateRuntime} from '../ops/backup/private-runtime.mjs';
import {createBackup,verifySnapshot,restoreSnapshot} from '../ops/backup/backup.mjs';

const options={skip:process.platform!=='linux'},sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'lu-private-fixture-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const identity=path.join(base,'identity'),recipients=path.join(base,'recipients'),source=path.join(base,'secret'),inventory=path.join(base,'inventory'),output=path.join(base,'runtime.age');
 execFileSync('/usr/bin/age-keygen',['-o',identity],{stdio:'ignore'});await fs.chmod(identity,0o600);
 const publicKey=execFileSync('/usr/bin/age-keygen',['-y',identity]);await fs.writeFile(recipients,publicKey,{mode:0o600});
 const secret='synthetic-test-credential-not-a-provider-key';await fs.writeFile(source,secret,{mode:0o600});
 const entries=[{source,path:'credentials/OPENAI_API_KEY'}];await fs.writeFile(inventory,JSON.stringify({format:1,files:entries}),{mode:0o600});
 const protect=()=>protectPrivateRuntime({inventoryFile:inventory,recipientsFile:recipients,output});
 const restore=async(extra={})=>restorePrivateRuntime({input:output,identityFile:identity,target:path.join(base,'recovered'),expectedSha256:sha(await fs.readFile(output)),...extra});
 return {base,identity,recipients,source,inventory,output,secret,entries,protect,restore};
}
test('age runtime backup uses a public recipient, restores exact private bytes into a new directory and never activates them',options,async t=>{
 const f=await fixture(t),result=await f.protect(),cipher=await fs.readFile(f.output);
 assert.equal(result.encrypted_files,1);assert.equal(result.sha256,sha(cipher));assert.equal(result.activated,false);assert.equal(cipher.includes(Buffer.from(f.secret)),false);
 const restored=await f.restore();assert.deepEqual(restored,{restored_files:1,activated:false,requires_operator_review:true});
 const target=path.join(f.base,'recovered/credentials/OPENAI_API_KEY');assert.equal(await fs.readFile(target,'utf8'),f.secret);assert.equal((await fs.stat(target)).mode&0o777,0o600);assert.equal((await fs.stat(path.join(f.base,'recovered'))).mode&0o777,0o700);
 await assert.rejects(f.protect(),{code:'EEXIST'});await assert.rejects(f.restore(),{code:'EEXIST'});assert.equal(await fs.readFile(target,'utf8'),f.secret);
});
test('wrong identities, changed ciphertext and untrusted hashes fail before any recovered directory exists',options,async t=>{
 const f=await fixture(t);await f.protect();const original=await fs.readFile(f.output),wrong=path.join(f.base,'wrong-identity');execFileSync('/usr/bin/age-keygen',['-o',wrong],{stdio:'ignore'});await fs.chmod(wrong,0o600);
 await assert.rejects(f.restore({identityFile:wrong}),/Encryption\/decryption failed/);
 await assert.rejects(f.restore({expectedSha256:'0'.repeat(64)}),/checksum mismatch/);
 const altered=Buffer.from(original);altered[altered.length-1]^=1;await fs.writeFile(f.output,altered);await assert.rejects(f.restore(),/Encryption\/decryption failed/);
 await fs.writeFile(f.output,original.subarray(0,original.length-10));await assert.rejects(f.restore(),/Encryption\/decryption failed/);
 await assert.rejects(fs.stat(path.join(f.base,'recovered')),{code:'ENOENT'});
});
test('capture rejects unsafe paths, duplicate names, links, loose permissions and plugin recipients before encryption',options,async t=>{
 const f=await fixture(t);
 for(const files of [[{source:f.source,path:'credentials/../escape'}],[...f.entries,...f.entries],[{source:'relative',path:'config/a'}]]){
  await fs.writeFile(f.inventory,JSON.stringify({format:1,files}));await assert.rejects(f.protect());
 }
 await fs.writeFile(f.inventory,JSON.stringify({format:1,files:f.entries}));await fs.chmod(f.source,0o644);await assert.rejects(f.protect(),/permissions rejected/);await fs.chmod(f.source,0o600);
 const link=path.join(f.base,'linked');await fs.symlink(f.source,link);await fs.writeFile(f.inventory,JSON.stringify({format:1,files:[{source:link,path:'config/a'}]}));await assert.rejects(f.protect());
 const dir=path.join(f.base,'real');await fs.mkdir(dir,{mode:0o700});await fs.symlink(dir,path.join(f.base,'parent-link'));await fs.writeFile(path.join(dir,'a'),'synthetic',{mode:0o600});await fs.writeFile(f.inventory,JSON.stringify({format:1,files:[{source:path.join(f.base,'parent-link/a'),path:'config/a'}]}));await assert.rejects(f.protect(),/Unsafe parent/);
 await fs.writeFile(f.inventory,JSON.stringify({format:1,files:f.entries}));await fs.writeFile(f.recipients,'age1plugin1synthetic');await assert.rejects(f.protect(),/native X25519/);
 await fs.writeFile(f.recipients,execFileSync('/usr/bin/age-keygen',['-y',f.identity]));await fs.writeFile(f.inventory,JSON.stringify({format:1,files:[{source:f.identity,path:'credentials/recovery'}]}));await assert.rejects(f.protect(),/Recovery identities/);
 await fs.writeFile(f.inventory,JSON.stringify({format:1,files:f.entries}));await fs.writeFile(f.source,Buffer.alloc(1024*1024+1));await assert.rejects(f.protect(),/size or permissions/);
 await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
});
test('authenticated but malformed private archives cannot traverse, duplicate or publish inconsistent file bytes',options,async t=>{
 const f=await fixture(t),pub=(await fs.readFile(f.recipients,'utf8')).trim(),bytes=Buffer.from('synthetic').toString('base64');
 for(const files of [[{path:'config/../../escape',bytes,sha256:sha(Buffer.from('synthetic'))}],[{path:'config/a',bytes,sha256:'0'.repeat(64)}],[{path:'config/a',bytes:'!!!!',sha256:'0'.repeat(64)}],[{path:'config/a',bytes,sha256:sha(Buffer.from('synthetic'))},{path:'config/a',bytes,sha256:sha(Buffer.from('synthetic'))}],[{path:'config/a',bytes,sha256:sha(Buffer.from('synthetic'))},{path:'config/a/b',bytes,sha256:sha(Buffer.from('synthetic'))}]]){
  const cipher=execFileSync('/usr/bin/age',['--encrypt','--recipient',pub],{input:JSON.stringify({format:1,kind:'living-universe-private-runtime',files})});await fs.writeFile(f.output,cipher,{mode:0o600});await assert.rejects(f.restore());await assert.rejects(fs.stat(path.join(f.base,'recovered')),{code:'ENOENT'});
 }
 await assert.rejects(fs.stat(path.join(f.base,'escape')),{code:'ENOENT'});
});
test('Linux catalogue backup includes selected age ciphertext; ordinary restore leaves credentials separate and inactive',options,async t=>{
 const f=await fixture(t),root=path.join(f.base,'code'),media=path.join(f.base,'media'),live=path.join(f.base,'live');for(const dir of [root,media,live])await fs.mkdir(dir);
 const database=path.join(live,'universe.sqlite'),db=new DatabaseSync(database);db.exec("CREATE TABLE characters(id TEXT PRIMARY KEY); CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT,kind TEXT,size INTEGER); INSERT INTO characters VALUES('synthetic-stable-id')");db.close();
 await assert.rejects(createBackup({root,mediaRoot:media,database,destination:path.join(f.base,'out'),stageParent:path.join(f.base,'staging')}),/configured encrypted credential/);
 const backup=await createBackup({root,mediaRoot:media,database,destination:path.join(f.base,'out'),stageParent:path.join(f.base,'staging'),privateInventory:f.inventory,ageRecipients:f.recipients});
 assert.equal(backup.credentials_included,true);assert.equal(backup.private_runtime.encrypted_files,1);await verifySnapshot(backup.snapshot);
 const restored=path.join(f.base,'catalogue-restored');await restoreSnapshot(backup.snapshot,restored);assert.equal(JSON.parse(await fs.readFile(path.join(restored,'RESTORE-RECEIPT.json'))).credentials_restored,false);
 const input=path.join(backup.snapshot,'private/runtime.age');const recovered=await restorePrivateRuntime({input,identityFile:f.identity,target:path.join(f.base,'private-restored'),expectedSha256:backup.private_runtime.sha256});assert.equal(recovered.activated,false);
 assert.equal(await fs.readFile(path.join(f.base,'private-restored/credentials/OPENAI_API_KEY'),'utf8'),f.secret);
});
