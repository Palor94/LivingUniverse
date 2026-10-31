import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createCatalogue} from './catalogue.mjs';
let catalogue;
try{
  const values={};const args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){if(!['--database','--media-root','--config'].includes(args[i])||!args[i+1])throw Error();values[args[i]]=args[i+1];}
  const database=values['--database']||path.join(process.env.LOCALAPPDATA||'','LivingUniverse','universe.sqlite');
  const mediaRoot=values['--media-root'];
  const target=values['--config']||path.join(process.env.LOCALAPPDATA||'','LivingUniverse','mcp-config.json');
  if(!path.isAbsolute(database)||!mediaRoot||!path.isAbsolute(mediaRoot)||!path.isAbsolute(target))throw Error();
  if(process.env.OneDrive){for(const file of [database,target]){const rel=path.relative(path.resolve(process.env.OneDrive),path.resolve(file));if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw Error();}}
  catalogue=await createCatalogue({database,mediaRoot});
  await catalogue.call('list_characters',{limit:1});
  const config={database,mediaRoot,allowAdminNotes:false};
  await fs.mkdir(path.dirname(target),{recursive:true});
  // Deliberately refuse to overwrite an existing local configuration.
  await fs.writeFile(target,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write('Read-only MCP configuration validated and saved locally. No catalogue or media was copied or modified.\n');
}catch{process.stderr.write('CONFIG_NOT_SAVED: Verify absolute local configuration/database paths and the existing media root. Existing configuration was left untouched.\n');process.exitCode=1;}finally{catalogue?.close();}
