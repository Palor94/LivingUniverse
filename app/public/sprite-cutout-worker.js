import {keyBackground} from './sprite-cutout-pixels.js';

let queue=Promise.resolve();
self.onmessage=({data:{id,url}})=>{
  queue=queue.then(async()=>{
    let image;
    try{
      const src=new URL(url,self.location.href);
      if(src.origin!==self.location.origin||!/^\/api\/sprites\/[^/]+$/.test(src.pathname)||src.pathname==='/api/sprites/scan')throw Error('Invalid sprite URL');
      const response=await fetch(src,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Sprite unavailable');
      image=await createImageBitmap(await response.blob());
      const scale=Math.min(1,1600/image.width,1600/image.height),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
      const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
      const frame=ctx.getImageData(0,0,w,h),bounds=keyBackground(frame,w,h);ctx.putImageData(frame,0,0);
      const out=new OffscreenCanvas(bounds.width,bounds.height);out.getContext('2d').drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
      const blob=await out.convertToBlob({type:'image/webp',quality:1});
      self.postMessage({id,blob});
    }catch{self.postMessage({id,error:true});}
    finally{image?.close();}
  });
};
