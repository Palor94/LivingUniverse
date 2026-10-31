// Bounded Windows DIB reader for the BMP inputs accepted by the catalogue.
// Uncompressed 1/4/8-bit palette and 24/32-bit BGR are supported. RLE/bitfields
// are rejected explicitly rather than guessed or sent to a shell decoder.
export function decodeBmp(b){
  if(b.length<54||b.toString('ascii',0,2)!=='BM')throw Error('Invalid BMP.');
  const header=b.readUInt32LE(14),offset=b.readUInt32LE(10),width=b.readInt32LE(18),signedHeight=b.readInt32LE(22),height=Math.abs(signedHeight),depth=b.readUInt16LE(28),compression=b.readUInt32LE(30);
  if(header<40||14+header>b.length||offset<14+header||offset>b.length||width<=0||!height||width*height>40000000||b.readUInt16LE(26)!==1||compression!==0||![1,4,8,24,32].includes(depth))throw Error('Unsupported or unsafe BMP.');
  const stride=Math.ceil(width*depth/32)*4;
  if(offset+stride*height>b.length)throw Error('Truncated BMP.');
  let colors=0;if(depth<=8){colors=b.readUInt32LE(46)||2**depth;if(colors>2**depth||14+header+colors*4>offset)throw Error('Invalid BMP palette.');}
  const data=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const row=offset+(signedHeight>0?height-1-y:y)*stride,target=(y*width+x)*3;let source;
    if(depth>=24)source=row+x*(depth/8);
    else{const index=depth===8?b[row+x]:depth===4?(b[row+(x>>1)]>>(x%2?0:4))&15:(b[row+(x>>3)]>>(7-x%8))&1;if(index>=colors)throw Error('Invalid BMP palette index.');source=14+header+index*4;}
    data[target]=b[source+2];data[target+1]=b[source+1];data[target+2]=b[source];
  }
  return {data,raw:{width,height,channels:3}};
}
