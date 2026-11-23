// Pose/silhouette measurements, independent of facial identity and appearance embeddings.
// Advisory only: clothing, camera and posture affect 2D measurements. Never an identity pass.
export const BODY_PROPORTIONS_METHOD='local-mediapipe-pose-full-1-silhouette-v1';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function bodyProportions({landmarks,width,height,mask=null}){
  const abstain=reason=>({method:BODY_PROPORTIONS_METHOD,verdict:'unknown',reason,features:null});
  if(!Array.isArray(landmarks)||landmarks.length!==1)return abstain('SINGLE_PERSON_REQUIRED');
  const p=landmarks[0],needed=[11,12,23,24];
  if(!needed.every(i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)&&(p[i].visibility??0)>=0.75&&p[i].x>=0&&p[i].x<=1&&p[i].y>=0&&p[i].y<=1))return abstain('TORSO_NOT_CLEAR');
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return abstain('INVALID_IMAGE');
  const at=i=>({x:p[i].x*width,y:p[i].y*height}),ls=at(11),rs=at(12),lh=at(23),rh=at(24),shoulder=mid(ls,rs),hip=mid(lh,rh),torso=dist(shoulder,hip),sw=dist(ls,rs),hw=dist(lh,rh);
  if(torso<40||hip.y<=shoulder.y||sw<torso*0.4||hw<torso*0.15||Math.abs(ls.y-rs.y)>sw*0.25||Math.abs(lh.y-rh.y)>hw*0.25||Math.abs(hip.x-shoulder.x)>torso*0.25)return abstain('VIEW_OR_POSTURE_UNSUITABLE');
  const features={shoulder_to_torso:sw/torso,hip_to_torso:hw/torso};
  if(mask){
    if(!Number.isInteger(mask.width)||!Number.isInteger(mask.height)||mask.width<1||mask.height<1||mask.data?.length!==mask.width*mask.height)return abstain('INVALID_MASK');
    for(const i of [15,16])if(p[i]&&(p[i].visibility??0)>=0.75){const wrist=at(i);if(wrist.y>shoulder.y+torso*0.3&&wrist.y<hip.y+torso*0.05&&Math.abs(wrist.x-hip.x)<sw*0.8)return abstain('ARMS_OCCLUDE_TORSO');}
    const span=fraction=>{
      const center={x:shoulder.x+(hip.x-shoulder.x)*fraction,y:shoulder.y+(hip.y-shoulder.y)*fraction},y=Math.round(center.y/height*(mask.height-1)),cx=Math.round(center.x/width*(mask.width-1));
      if(y<0||y>=mask.height||cx<0||cx>=mask.width||mask.data[y*mask.width+cx]<0.6)return null;
      let l=cx,r=cx;while(l>0&&mask.data[y*mask.width+l-1]>=0.6)l--;while(r<mask.width-1&&mask.data[y*mask.width+r+1]>=0.6)r++;
      if(l===0||r===mask.width-1)return null;return (r-l+1)/mask.width*width/torso;
    };
    const waist=span(0.65),hips=span(0.95);if(!waist||!hips)return abstain('SILHOUETTE_NOT_CLEAR');features.waist_to_torso=waist;features.silhouette_hip_to_torso=hips;
  }
  return {method:BODY_PROPORTIONS_METHOD,verdict:'needs_review',reason:'VIEW_AND_CLOTHING_DEPENDENT',features,identity_verified:false,canon_changed:false};
}
export function proportionSimilarity(a,b){
  if(!a?.features||!b?.features)return null;const keys=Object.keys(a.features).filter(k=>Number.isFinite(b.features[k])&&a.features[k]>0&&b.features[k]>0);if(keys.length<2)return null;
  const distance=keys.reduce((n,k)=>n+Math.abs(a.features[k]-b.features[k])/Math.max(a.features[k],b.features[k]),0)/keys.length;
  return 1-distance;
}
