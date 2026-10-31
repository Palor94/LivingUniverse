import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createApp} from './server.mjs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {readRuntimeConfig,servicePort} from './runtime-config.mjs';

// Service startup for this installation: never bootstrap, restore or substitute a catalogue.
export async function startExisting({configFile,port=process.env.PORT}={}){
 const config=await readRuntimeConfig(configFile),listenPort=servicePort(port);
 // Reject zero-length/unrelated files before createApp may install migrations.
 const probe=new DatabaseSync(config.database,{readOnly:true,allowExtension:false});
 try{for(const table of ['characters','media','depictions','canon','reviews','media_notes'])if(!probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Existing application schema required.');}
 finally{probe.close();}
 const app=await createApp({root:config.mediaRoot,dataDir:path.dirname(config.database),mediaRootId:config.mediaRootId});
 const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 try{await listen(app.server,listenPort);if(app.mobileServer)await listen(app.mobileServer,app.mobilePort);}
 catch(error){await app.close();throw error;}
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 const app=await startExisting();let closing=false;
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(closing)return;closing=true;await app.close();process.exitCode=0;});
 console.log('Existing Living Universe catalogue ready on loopback. No recovery or replacement was performed.');
}catch{console.error('EXISTING_CATALOGUE_UNAVAILABLE: Check the existing configuration, database, media root and ports. No replacement was created.');process.exitCode=1;}
