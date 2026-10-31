import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceFiles,inside} from '../backup/backup.mjs';
import {absoluteSetting} from '../../app/runtime-config.mjs';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output')throw Error('Use --output ABSOLUTE_NEW_DIRECTORY outside the source checkout.');
const destination=absoluteSetting(args[1],'output');
if(inside(source,destination)||inside(destination,source))throw Error('Package output must not overlap source.');
const files=await sourceFiles(source);
for(const required of ['package.json','pnpm-lock.yaml','ops/linux/Dockerfile','ops/linux/run-lab.sh','ops/testing/run-tests.mjs'])if(!files.includes(required))throw Error('Missing required source '+required);
await fs.mkdir(destination,{recursive:false,mode:0o700});
const manifest=[];
for(const relative of files){
  const original=await fs.readFile(path.join(source,relative)),bytes=relative.endsWith('.sh')?Buffer.from(original.toString('utf8').replaceAll(String.fromCharCode(13,10),String.fromCharCode(10))):original,target=path.join(destination,...relative.split('/'));
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  await fs.writeFile(target,bytes,{flag:'wx',mode:relative.endsWith('.sh')?0o700:0o600});
  manifest.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(path.join(destination,'LAB-MANIFEST.json'),JSON.stringify({kind:'synthetic-linux-source-lab',baseline:'055b5ae28db7558482b60d61944bf1df72fb7014',created_at:new Date().toISOString(),production_data:false,credentials:false,git_history:false,dependencies_included:false,linux_validation:'pending',files:manifest},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output:destination,files:files.length,production_data:false,credentials:false,git_history:false}));
