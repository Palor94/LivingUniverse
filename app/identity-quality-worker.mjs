// Bounded, offline face/body measurement; existing installed models only. No writes/network.
import {createLocalIdentity} from './local-identity.mjs';
let engine;
process.on('message',async m=>{
  try{
    engine??=await createLocalIdentity();const img=await engine.load(m.file);
    const crop=m.crop,inside=f=>{if(!crop)return true;const cx=(f.box[0]+f.box[2])/2/img.width,cy=(f.box[1]+f.box[3])/2/img.height;return cx>=crop.x&&cx<=crop.x+crop.w&&cy>=crop.y&&cy<=crop.y+crop.h;};
    const faces=(await engine.faces(img)).filter(inside);
    const f=faces[0],clear=faces.length===1&&f.score>=0.6&&Math.min(f.box[2]-f.box[0],f.box[3]-f.box[1])>=40;
    const face=clear?await engine.faceEmbedding(img,f):null;
    const body=m.body===true?await engine.bodyEmbedding(img,crop?{x:crop.x,y:crop.y,width:crop.w,height:crop.h}:null,{preserveAspect:true}):null;
    process.send({ok:true,faces:faces.length,face:face?Array.from(face):null,body:body?Array.from(body):null});
  }catch(e){process.send({ok:false,code:e.code||'QUALITY_ANALYSIS_FAILED'});}
});
