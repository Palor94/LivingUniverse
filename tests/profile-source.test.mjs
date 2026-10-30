import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {refreshTunnelProfileSource} from '../mcp/profile-source.mjs';
test('service profile repair changes only the legacy source command and retains an exact backup',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-profile-path-')),root=path.join(temp,'resources'),project=path.join(root,'00_SYSTEM','project'),profileDirectory=path.join(temp,'profiles');await fs.mkdir(path.join(root,'00_SYSTEM','config'),{recursive:true});await fs.mkdir(profileDirectory);await fs.writeFile(path.join(root,'00_SYSTEM','config','storage-layout.json'),'{"layout_version":1}');const legacy=path.join(root,'mcp','server.mjs').replaceAll('\\','/'),current=path.join(project,'mcp','server.mjs').replaceAll('\\','/');const before='tunnel_id: existing\napi_key: env:CONTROL_PLANE_API_KEY\ncommand: "'+legacy+'"\n';const file=path.join(profileDirectory,'living-universe.yaml');await fs.writeFile(file,before);
 try{const result=await refreshTunnelProfileSource({project,profileDirectory});assert.equal(result.changed,true);assert.equal(await fs.readFile(result.backup,'utf8'),before);assert.equal(await fs.readFile(file,'utf8'),before.replace(legacy,current));assert.equal((await refreshTunnelProfileSource({project,profileDirectory})).changed,false);}finally{assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});}
});
