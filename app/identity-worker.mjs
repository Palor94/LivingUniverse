// Child process for app/identity-suggest.mjs: runs the local face method (app/local-identity.mjs)
// outside the application's main thread, so a scan never freezes the program. It reads the
// picture, finds faces and returns boxes (normalised 0..1), detector scores and embeddings.
// It never writes anything and makes no network call.
import {createLocalIdentity,LOCAL_IDENTITY_METHOD} from './local-identity.mjs';

let engine=null;
process.on('message',async msg=>{
  if(!msg||typeof msg!=='object')return;
  try{
    engine??=await createLocalIdentity();
    const img=await engine.load(msg.file),faces=await engine.faces(img),out=[];
    for(const f of faces){
      const emb=await engine.faceEmbedding(img,f),[x0,y0,x1,y1]=f.box;
      out.push({box:{x:x0/img.width,y:y0/img.height,w:(x1-x0)/img.width,h:(y1-y0)/img.height},score:f.score,px:Math.round(Math.min(x1-x0,y1-y0)),embedding:Buffer.from(emb.buffer,emb.byteOffset,emb.byteLength).toString('base64')});
    }
    process.send({id:msg.id,ok:true,method:LOCAL_IDENTITY_METHOD,faces:out});
  }catch(e){process.send({id:msg.id,ok:false,code:e.code||'ANALYSIS_FAILED'});}
});
process.send?.({ready:true});
