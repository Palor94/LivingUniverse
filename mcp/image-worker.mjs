import sharp from 'sharp';
import {decodeBmp} from './bmp.mjs';
import {referenceCrop} from '../app/reference-crop.mjs';
import {pixelCrop} from '../app/public/crop-selection.js';

sharp.cache(false);sharp.concurrency(1);
try{
  const reference=process.argv[2]==='reference',crop=referenceCrop(JSON.parse(process.argv[3]||'null'));
  let length=0;const chunks=[];
  for await(const chunk of process.stdin){length+=chunk.length;if(length>20*1024*1024)throw Error();chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),options={limitInputPixels:40000000,failOn:'error',sequentialRead:true,animated:false};
  const bmp=bytes.toString('ascii',0,2)==='BM'?decodeBmp(bytes):null;
  let pipeline=bmp?sharp(bmp.data,{...options,raw:bmp.raw}):sharp(bytes,options);
  if(reference)pipeline=pipeline.autoOrient();
  // Materialize only the selected first frame, within the prechecked pixel cap.
  // This also validates pixels when an original byte-preserving read is requested.
  const decoded=await pipeline.flatten({background:'#ffffff'}).toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=decoded.info;
  if(!width||!height||width*height>40000000)throw Error();
  const region=crop?pixelCrop(width,height,crop):{x:0,y:0,w:width,h:height};
  if(region.x+region.w>width||region.y+region.h>height)throw Error();
  let edge=reference?2048:768;
  const limit=reference?3145728:196608,qualities=reference?[90,88,85]:[85,65,45,25];
  let output;
  while(edge>=48){
    const scale=Math.min(1,edge/Math.max(region.w,region.h));
    const resized=sharp(decoded.data,{raw:{width,height,channels}}).extract({left:region.x,top:region.y,width:region.w,height:region.h}).resize(Math.max(1,Math.round(region.w*scale)),Math.max(1,Math.round(region.h*scale)),{fit:'fill',kernel:'cubic'});
    for(const quality of qualities){const encoded=await resized.clone().jpeg({quality,chromaSubsampling:'4:4:4'}).toBuffer();if(encoded.length<=limit){output=encoded;break;}}
    if(output)break;
    if(reference){if(edge<=1024)break;edge=Math.max(1024,Math.floor(edge*.75));}else edge=Math.floor(edge/2);
  }
  if(!output)throw Error();
  process.stdout.write(output);
}catch{process.stderr.write('Image conversion unavailable.');process.exitCode=1;}
