import {mcpConfigPath} from '../app/runtime-config.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';

const args=process.argv.slice(2);if(args.some(a=>!['--enable','--preview'].includes(a)))throw Error('Use --preview or --enable; no secrets are accepted as arguments.');
const mcpFile=mcpConfigPath();
const mcp=JSON.parse(await fs.readFile(mcpFile,'utf8')),dataDir=path.dirname(mcp.database);
if(!(await fs.stat(mcp.database)).isFile())throw Error('Existing catalogue required. No replacement will be created.');
const mobile=JSON.parse(await fs.readFile(path.join(dataDir,'mobile-access.json'),'utf8'));
const writes=JSON.parse(await fs.readFile(mcp.writeConfig,'utf8'));
if(mobile.enabled!==true||writes.enabled!==true||writes.origin!==mobile.origin||writes.login!==mobile.login.toLowerCase())throw Error('The existing private mobile editor and authenticated write configuration must match.');
const privateUrl=new URL(mobile.origin);if(privateUrl.protocol!=='https:'||!privateUrl.hostname.endsWith('.ts.net')||privateUrl.port)throw Error('Use the existing private Tailscale origin.');
const publicUrl=new URL(privateUrl);publicUrl.port='8443';
const file=process.env.LU_GROK_CONFIG||path.join(dataDir,'grok-gateway.json'),runtime=path.join(dataDir,'grok-runtime');
const plan={enabled:true,public_origin:publicUrl.origin,private_origin:privateUrl.origin,port:4320,redirect_hosts:['grok.com','www.cursor.com'],state_file:path.join(runtime,'oauth-state.json')};
if(!args.includes('--enable')){console.log(JSON.stringify({mode:'preview',...plan,mcp_url:plan.public_origin+'/mcp',changes:'New protected gateway only; no public route, catalogue writes or existing credential changes.'},null,2));}
else{
  const config={...plan,control_token:randomBytes(32).toString('hex')};
  await fs.mkdir(runtime,{recursive:true,mode:0o700});
  await fs.writeFile(file,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  if(process.platform==='win32')for(const target of [runtime,file]){const flags=target===runtime?'(OI)(CI)(F)':'(F)';execFileSync(path.join(process.env.SystemRoot,'System32','icacls.exe'),[target,'/inheritance:r','/grant:r',os.userInfo().username+':'+flags,'SYSTEM:'+flags],{windowsHide:true,stdio:'pipe'});}
  console.log('Protected local Grok configuration created. No database or public network route was changed. Restart the existing app, then start the gateway.');
}
