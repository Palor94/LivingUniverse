const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function moveCrop(start,handle,dx,dy,min=.01){
  if(handle==='move')return {...start,x:clamp(start.x+dx,0,1-start.w),y:clamp(start.y+dy,0,1-start.h)};
  let left=start.x,top=start.y,right=start.x+start.w,bottom=start.y+start.h;
  if(handle.includes('w'))left=clamp(left+dx,0,right-min);
  if(handle.includes('e'))right=clamp(right+dx,left+min,1);
  if(handle.includes('n'))top=clamp(top+dy,0,bottom-min);
  if(handle.includes('s'))bottom=clamp(bottom+dy,top+min,1);
  return {x:handle.includes('w')?left:start.x,y:handle.includes('n')?top:start.y,w:/[we]/.test(handle)?right-left:start.w,h:/[ns]/.test(handle)?bottom-top:start.h};
}
export function pixelCrop(width,height,crop){
  const x=Math.round(crop.x*width),y=Math.round(crop.y*height);
  return {x,y,w:Math.max(1,Math.round((crop.x+crop.w)*width)-x),h:Math.max(1,Math.round((crop.y+crop.h)*height)-y)};
}
// DOM handles are separate from the image: each edge changes one boundary only.
export function createCropSelection(host,image,{crop={x:.05,y:.05,w:.9,h:.9},onChange=()=>{}}={}){
  const stage=document.createElement('div');stage.className='picture-crop-stage';
  const canvas=document.createElement('canvas'),box=document.createElement('div');box.className='picture-crop-box';box.tabIndex=0;box.setAttribute('aria-label','Move crop selection with arrow keys');
  const names={n:'top',e:'right',s:'bottom',w:'left',nw:'top left',ne:'top right',sw:'bottom left',se:'bottom right'};
  for(const [handle,name]of Object.entries(names)){const b=document.createElement('button');b.type='button';b.dataset.handle=handle;b.className='picture-crop-handle '+handle;b.title='Drag '+name+' edge';b.setAttribute('aria-label','Resize '+name+' crop edge');box.append(b);}
  stage.append(canvas,box);host.append(stage);let current={...crop},drag=null;
  function draw(){const scale=Math.min(1,900/image.naturalWidth,window.innerHeight*.62/image.naturalHeight,Math.max(1,host.clientWidth)/image.naturalWidth);canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));stage.style.width=canvas.width+'px';canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);Object.assign(box.style,{left:current.x*100+'%',top:current.y*100+'%',width:current.w*100+'%',height:current.h*100+'%'});onChange({...current},pixelCrop(image.naturalWidth,image.naturalHeight,current));}
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
  stage.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const p=point(e),handle=e.target.dataset.handle||(box.contains(e.target)?'move':'new');drag={pointer:e.pointerId,start:{...current},p,handle};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!drag||drag.pointer!==e.pointerId)return;const p=point(e);if(drag.handle==='new'){const a={x:clamp(drag.p.x,0,1),y:clamp(drag.p.y,0,1)},b={x:clamp(p.x,0,1),y:clamp(p.y,0,1)};if(Math.abs(a.x-b.x)<.01||Math.abs(a.y-b.y)<.01)return;current={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}else current=moveCrop(drag.start,drag.handle,p.x-drag.p.x,p.y-drag.p.y);draw();};
  function end(e){if(drag?.pointer!==e.pointerId)return;drag=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);}
  stage.onpointerup=end;stage.onpointercancel=end;stage.onlostpointercapture=()=>{drag=null;};
  stage.onkeydown=e=>{const delta={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]}[e.key];if(!delta)return;e.preventDefault();const factor=e.shiftKey?10:1;current=moveCrop(current,e.target.dataset.handle||'move',delta[0]*factor,delta[1]*factor);draw();};
  const observer=new ResizeObserver(draw);observer.observe(host);draw();
  return {getCrop:()=>({...current}),reset(){current={x:0,y:0,w:1,h:1};draw();},destroy(){observer.disconnect();stage.remove();}};
}
