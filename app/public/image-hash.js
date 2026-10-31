// Versioned, browser-local horizontal difference hash. Never an identity score.
export const visualVersion='dhash-64-canvas-v1';
export function differenceHash(rgba){
  if(rgba.length!==9*8*4)throw Error('Expected a 9 by 8 RGBA sample');
  const gray=i=>.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2];
  let bits=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|(gray((y*9+x)*4)>gray((y*9+x+1)*4)?1n:0n);
  return bits.toString(16).padStart(16,'0');
}
