import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app/server.mjs';

// Isolated browser fixture. Never opens the installed catalogue or user media.
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-character-browser-')),root=path.join(temp,'resources');
await fs.mkdir(root);await fs.writeFile(path.join(root,'sorting-fixture.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null,characterPolicy:{reject_female_characters:true}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
await fetch(origin+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});console.log('BROWSER_FIXTURE '+origin);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await app.close();await fs.rm(temp,{recursive:true,force:true});process.exit(0);});
