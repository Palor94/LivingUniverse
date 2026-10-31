import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createApp} from './server.mjs';

// Service startup for this installation: never bootstrap, restore or substitute a catalogue.
try{
 const config=JSON.parse(await fs.readFile(process.env.LU_MCP_CONFIG||path.join(process.env.LOCALAPPDATA,'LivingUniverse','mcp-config.json'),'utf8'));
 if(!path.isAbsolute(config.database)||!path.isAbsolute(config.mediaRoot)||(await fs.stat(config.database)).isFile()!==true)throw Error();
 const app=await createApp({root:config.mediaRoot,dataDir:path.dirname(config.database)});
 const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 try{await listen(app.server,4317);if(app.mobileServer)await listen(app.mobileServer,app.mobilePort);}
 catch(error){await app.close();throw error;}
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
 console.log('Existing Living Universe catalogue ready on loopback. No recovery or replacement was performed.');
}catch{console.error('EXISTING_CATALOGUE_UNAVAILABLE: Check the existing configuration, database and ports. No replacement was created.');process.exitCode=1;}
