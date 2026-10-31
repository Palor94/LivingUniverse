// Synthetic local UI fixture. No production data, credentials or external calls.
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createApp} from '../app/server.mjs';
import {databaseIdentity} from '../app/character-edit.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lu-desktop-generation-preview-')),root=path.join(temp,'media'),dataDir=path.join(temp,'data');await fs.mkdir(root);await fs.mkdir(dataDir);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoaGgAAAMEAYEezv+mAAAAAElFTkSuQmCC','base64'),sha=createHash('sha256').update(png).digest('hex');
const config={enabled:true,token:randomBytes(32).toString('hex'),origin:'https://preview.example.ts.net',login:'synthetic@example.test',approval_mode:'trusted',database_id:databaseIdentity(path.join(dataDir,'universe.sqlite'))};
const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:config,imageGeneration:{providers:{sogni:{enabled:true,model:'krea-identity-edit'}}},generationTestOptions:{env:{SOGNI_API_KEY:'synthetic-not-a-key'},availability:async()=> 'local',generate:async()=>({bytes:png,request_id:'synthetic_sogni_result',usage:null,revised_prompt:null})}});
const cid=randomUUID(),revision=randomUUID(),refs=[],created=new Date().toISOString();
app.db.prepare('INSERT INTO characters(id,name,created_at) VALUES(?,?,?)').run(cid,'Próba karakter · csak tesztadat',created);
for(const role of ['face','body']){const mid=randomUUID();await fs.writeFile(path.join(root,role+'.png'),png);app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,role+'.png','','image',png.length,created,created);app.db.prepare('INSERT INTO depictions VALUES(?,?)').run(mid,cid);refs.push({media_id:mid,role,sha256:sha});}
app.db.prepare('INSERT INTO canon VALUES(?,?,?,?,?,?,?)').run(revision,cid,null,'Synthetic approved identity for interface tests only.',JSON.stringify(refs),'Synthetic test approval',created);
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));console.log('Synthetic desktop preview: http://127.0.0.1:'+app.server.address().port);
let closing=false;const timer=setTimeout(close,15*60*1000);async function close(){if(closing)return;closing=true;clearTimeout(timer);await app.close();if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()))throw Error('Unsafe cleanup');await fs.rm(temp,{recursive:true,force:true});}process.once('SIGINT',close);process.once('SIGTERM',close);
