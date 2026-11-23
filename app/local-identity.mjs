// Local, offline character comparison (owner decision 2026-11-10): nothing leaves the laptop.
//  face: InsightFace buffalo_l, SCRFD detector (det_10g) + ArcFace (w600k_r50), 512-d embedding
//        of each face aligned on its five landmarks;
//  body: DINOv2-small CLS embedding (384-d) of the person crop or of a single-person picture.
// The runtime (onnxruntime-node, sharp) and the model files live outside OneDrive and Git in
// %LOCALAPPDATA%\LivingUniverse\vision-local. This module only measures similarity: it never
// names anyone and never writes the catalogue. (The package's gender/age model was not kept;
// characters are male by default, AGENTS.md 2026-11-10.) Scores are cosine similarities;
// thresholds belong to the owner (AUTO_CANON.md).
import path from 'node:path';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';

export const LOCAL_IDENTITY_METHOD='local-insightface-buffalo_l+dinov2-small-v1';
export const localDir=()=>path.join(process.env.LOCALAPPDATA||'',"LivingUniverse",'vision-local');
const ARC_TEMPLATE=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];

export function localIdentityAvailable(dir=localDir()){
  return ['node/node_modules/onnxruntime-node','node/node_modules/sharp','models/buffalo_l/det_10g.onnx','models/buffalo_l/w600k_r50.onnx','models/dinov2-small.onnx'].every(p=>existsSync(path.join(dir,p)));
}

const cosine=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const normalize=v=>{let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;return Float32Array.from(v,x=>x/n);};
function iou(a,b){const w=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1])),i=w*h;return i/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i||1);}

// Non-reflective similarity transform src→dst by least squares (as skimage/insightface).
export function similarity(src,dst){
  const N=Array.from({length:4},()=>[0,0,0,0]),v=[0,0,0,0];
  const add=(row,y)=>{for(let i=0;i<4;i++){v[i]+=row[i]*y;for(let j=0;j<4;j++)N[i][j]+=row[i]*row[j];}};
  src.forEach(([x,y],k)=>{add([x,-y,1,0],dst[k][0]);add([y,x,0,1],dst[k][1]);});
  // Gaussian elimination on the 4×4 normal equations.
  const A=N.map((r,i)=>[...r,v[i]]);
  for(let c=0;c<4;c++){let p=c;for(let r=c+1;r<4;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];
    for(let r=0;r<4;r++)if(r!==c){const f=A[r][c]/A[c][c];for(let k=c;k<5;k++)A[r][k]-=f*A[c][k];}}
  const [a,b,tx,ty]=A.map((r,i)=>r[4]/r[i]);return {a,b,tx,ty};
}

export async function createLocalIdentity(dir=localDir()){
  if(!localIdentityAvailable(dir))throw Object.assign(Error('Local identity models are not installed.'),{code:'LOCAL_IDENTITY_UNAVAILABLE'});
  const req=createRequire(path.join(dir,'node','package.json'));
  const ort=req('onnxruntime-node'),sharp=req('sharp');
  const opts={executionProviders:['cpu'],graphOptimizationLevel:'all'};
  const det=await ort.InferenceSession.create(path.join(dir,'models','buffalo_l','det_10g.onnx'),opts);
  const arc=await ort.InferenceSession.create(path.join(dir,'models','buffalo_l','w600k_r50.onnx'),opts);
  const dino=await ort.InferenceSession.create(path.join(dir,'models','dinov2-small.onnx'),opts);

  async function load(source){
    const {data,info}=await sharp(source,{limitInputPixels:40e6}).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    return {data,width:info.width,height:info.height};
  }
  // SCRFD at 640×640 (letterboxed), strides 8/16/32 with two anchors each, NMS 0.4.
  async function faces(img,{threshold=0.5}={}){
    const S=640,scale=Math.min(S/img.width,S/img.height),nw=Math.max(1,Math.round(img.width*scale)),nh=Math.max(1,Math.round(img.height*scale));
    const small=await sharp(img.data,{raw:{width:img.width,height:img.height,channels:3}}).resize(nw,nh,{fit:'fill'}).raw().toBuffer();
    const input=new Float32Array(3*S*S).fill(-127.5/128);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const s=(y*nw+x)*3;for(let c=0;c<3;c++)input[c*S*S+y*S+x]=(small[s+c]-127.5)/128;}
    const out=await det.run({[det.inputNames[0]]:new ort.Tensor('float32',input,[1,3,S,S])}),names=det.outputNames,found=[];
    [8,16,32].forEach((stride,i)=>{const sc=out[names[i]].data,bb=out[names[i+3]].data,kp=out[names[i+6]].data,fw=Math.ceil(S/stride);
      for(let k=0;k<sc.length;k++){if(sc[k]<threshold)continue;const loc=Math.floor(k/2),cx=(loc%fw)*stride,cy=Math.floor(loc/fw)*stride;
        const box=[cx-bb[k*4]*stride,cy-bb[k*4+1]*stride,cx+bb[k*4+2]*stride,cy+bb[k*4+3]*stride].map(v=>v/scale);
        const kps=Array.from({length:5},(_,j)=>[(cx+kp[k*10+j*2]*stride)/scale,(cy+kp[k*10+j*2+1]*stride)/scale]);found.push({score:sc[k],box,kps});}});
    found.sort((a,b)=>b.score-a.score);const keep=[];for(const f of found)if(keep.every(k=>iou(k.box,f.box)<0.4))keep.push(f);
    return keep;
  }
  // Aligned 112×112 face (bilinear) → ArcFace embedding.
  async function faceEmbedding(img,face){
    const {a,b,tx,ty}=similarity(face.kps,ARC_TEMPLATE),d=a*a+b*b,input=new Float32Array(3*112*112);
    for(let y=0;y<112;y++)for(let x=0;x<112;x++){const u=x-tx,w=y-ty,sx=(a*u+b*w)/d,sy=(-b*u+a*w)/d;
      const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
      for(let c=0;c<3;c++){const px=(xx,yy)=>xx<0||yy<0||xx>=img.width||yy>=img.height?0:img.data[(yy*img.width+xx)*3+c];
        const v=px(x0,y0)*(1-fx)*(1-fy)+px(x0+1,y0)*fx*(1-fy)+px(x0,y0+1)*(1-fx)*fy+px(x0+1,y0+1)*fx*fy;input[c*112*112+y*112+x]=(v-127.5)/127.5;}}
    const out=await arc.run({[arc.inputNames[0]]:new ort.Tensor('float32',input,[1,3,112,112])});
    return normalize(out[arc.outputNames[0]].data);
  }
  // DINOv2 CLS embedding of a region (normalised 0..1) or of the whole picture.
  async function bodyEmbedding(img,region=null,{preserveAspect=false}={}){
    let left=0,top=0,width=img.width,height=img.height;
    if(region){left=Math.max(0,Math.floor(region.x*img.width));top=Math.max(0,Math.floor(region.y*img.height));width=Math.max(8,Math.min(img.width-left,Math.round(region.width*img.width)));height=Math.max(8,Math.min(img.height-top,Math.round(region.height*img.height)));}
    const px=await sharp(img.data,{raw:{width:img.width,height:img.height,channels:3}}).extract({left,top,width,height}).resize(224,224,preserveAspect?{fit:'contain',background:{r:124,g:116,b:104}}:{fit:'fill'}).raw().toBuffer();
    const mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225],input=new Float32Array(3*224*224);
    for(let i=0;i<224*224;i++)for(let c=0;c<3;c++)input[c*224*224+i]=(px[i*3+c]/255-mean[c])/std[c];
    const out=await dino.run({[dino.inputNames[0]]:new ort.Tensor('float32',input,[1,3,224,224])}),h=out[dino.outputNames[0]];
    return normalize(h.data.slice(0,h.dims[2]));
  }
  // The biggest clear face of a reference picture (a reference shows one person).
  async function referenceFace(img){const f=(await faces(img)).sort((p,q)=>(q.box[2]-q.box[0])*(q.box[3]-q.box[1])-(p.box[2]-p.box[0])*(p.box[3]-p.box[1]))[0];return f?faceEmbedding(img,f):null;}
  return {load,faces,faceEmbedding,bodyEmbedding,referenceFace,cosine,method:LOCAL_IDENTITY_METHOD};
}
