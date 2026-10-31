import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app/server.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-rename-preview-'));
const root=path.join(temp,'media');await fs.mkdir(root);
const app=await createApp({root,dataDir:path.join(temp,'data'),mobile:{enabled:false},mcpWrites:null});
const c=randomUUID(),other=randomUUID();
app.db.prepare('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)').run(c,'Áron','Áronnal és Áronhoz. Ez kizárólag mesterséges tesztadat.',new Date().toISOString());
app.db.prepare('INSERT INTO characters(id,name,biography,created_at) VALUES(?,?,?,?)').run(other,'Béla','Áronnal találkozik.',new Date().toISOString());
app.db.prepare('INSERT INTO relationships VALUES(?,?,?,?)').run(randomUUID(),c,other,'Áronhoz barátság köti.');
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
console.log('Synthetic preview: http://127.0.0.1:'+app.server.address().port+'/character-rename.html?character='+c);
let closing=false;async function close(){if(closing)return;closing=true;await app.close();if(path.dirname(temp)!==os.tmpdir())throw Error('Unsafe temp directory');await fs.rm(temp,{recursive:true,force:true});process.exit(0);}
process.stdin.on('data',b=>{if(b.toString().trim()==='close')void close();});process.on('SIGINT',()=>void close());
