// Presentation suggestion only; an ambiguous face never becomes a crop.
export function coverFocus(faces,vectors,{threshold=.5,margin=.05}={}){
  const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
  const ranked=faces.filter(face=>face.face_px>=40&&face.det_score>=.6).map(face=>({...face,score:Math.max(...vectors.map(vector=>dot(face.vector,vector)))})).sort((a,b)=>b.score-a.score);
  const best=ranked[0];if(!best||best.score<threshold||ranked[1]&&best.score-ranked[1].score<margin)return null;
  const box=best.box,w=Math.min(1,box.w*2.4),h=Math.min(1,box.h*2.4);
  return {crop:{x:Math.max(0,Math.min(1-w,box.x+box.w/2-w/2)),y:Math.max(0,Math.min(1-h,box.y+box.h/2-h/2)),w,h},score:Math.round(best.score*1000)/1000};
}
