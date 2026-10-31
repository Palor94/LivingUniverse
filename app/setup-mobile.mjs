import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
const exec=promisify(execFile);
try{
  const installed=path.join(process.env.ProgramFiles||'C:\\Program Files','Tailscale','tailscale.exe');
  const executable=await fs.access(installed).then(()=>installed,()=> 'tailscale');
  const {stdout}=await exec(executable,['status','--json'],{windowsHide:true,timeout:15000}),status=JSON.parse(stdout);
  if(status.BackendState!=='Running')throw Error('Open Tailscale and sign in first.');
  const login=status.User?.[String(status.Self?.UserID)]?.LoginName,hostname=status.Self?.DNSName?.replace(/\.$/,'');
  if(!login||!hostname?.endsWith('.ts.net'))throw Error('Could not verify your Tailscale identity and DNS name.');
  const dataDir=process.env.LIVING_UNIVERSE_DATA;if(!dataDir||!path.isAbsolute(dataDir))throw Error('Run Enable Mobile Access.cmd so the existing desktop catalogue folder is selected.');
  const file=path.join(dataDir,'mobile-access.json'),config={enabled:true,origin:'https://'+hostname,login,port:4318};
  await fs.access(path.join(dataDir,'universe.sqlite'));await fs.mkdir(dataDir,{recursive:true});
  try{await fs.copyFile(file,file+'.before-'+Date.now(),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(file,JSON.stringify(config,null,2)+'\n');
  console.log('Mobile configuration saved outside OneDrive: '+file);
  console.log('Allowed Tailscale login: '+login+'\nPrivate HTTPS address: '+config.origin);
  console.log('Restart Living Universe to load the restricted editor. Port 4317 remains desktop-only.');
  console.log('No Tailscale routing was changed. Configure the restricted access policy before enabling Serve.');
}catch(e){console.error('Mobile setup could not finish: '+e.message);process.exitCode=1;}
