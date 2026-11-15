// Background picture packages (owner, 2026-11-14): Grok or ChatGPT (or the owner by hand) hands
// over ONE ZIP whose folders are place names; the program puts every picture into its place.
//  - readZip: a minimal reader (stored + deflate, central directory). ZIP64, encrypted entries,
//    path escapes and unknown methods are refused; nothing is ever extracted by entry path.
//  - placeIndex / matchPlace: which catalogue place a folder name means. Exact name first, then
//    accent/case/dash-insensitive names, short names and tree paths (with or without the town).
//    No match or more than one match: no guess, the caller sets the picture aside for review.
import {inflateRawSync,crc32} from 'node:zlib';

export const MAX_ZIP_BYTES=300*1024*1024;
const MAX_ENTRY_BYTES=20*1024*1024,MAX_ENTRIES=5000;
const CP437='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const zipError=(message,code='ZIP_INVALID')=>Object.assign(new Error(message),{status:400,code});

function decodeName(raw,utf8Flag,extra){
  if(utf8Flag)return raw.toString('utf8');
  // Info-ZIP Unicode Path extra field (0x7075) wins over the legacy name.
  for(let p=0;p+4<=extra.length;){const id=extra.readUInt16LE(p),n=extra.readUInt16LE(p+2);if(id===0x7075&&n>5&&p+4+n<=extra.length&&extra[p+4]===1)return extra.subarray(p+9,p+4+n).toString('utf8');p+=4+n;}
  // Many tools write UTF-8 without the flag; valid non-ASCII UTF-8 is taken as UTF-8.
  if(raw.some(b=>b>127)){try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{}}
  let s='';for(const b of raw)s+=b<128?String.fromCharCode(b):CP437[b-128];return s;
}

// Returns {entries:[{name, size, encrypted, method, read()}]}; read() inflates and checks the CRC.
export function readZip(buf){
  if(!Buffer.isBuffer(buf)||buf.length<22)throw zipError('This is not a ZIP file.');
  if(buf.length>MAX_ZIP_BYTES)throw zipError('The ZIP file is too large (at most 300 MB).','ZIP_LIMIT');
  let eocd=-1;for(let p=buf.length-22;p>=Math.max(0,buf.length-22-65535);p--)if(buf.readUInt32LE(p)===0x06054b50){eocd=p;break;}
  if(eocd<0)throw zipError('This is not a ZIP file.');
  if(eocd>=20&&buf.readUInt32LE(eocd-20)===0x07064b50)throw zipError('ZIP64 files are not supported; make a normal ZIP (under 4 GB).','ZIP64');
  const count=buf.readUInt16LE(eocd+10),cdSize=buf.readUInt32LE(eocd+12),cdOffset=buf.readUInt32LE(eocd+16);
  if(count===0xffff||cdOffset===0xffffffff||cdSize===0xffffffff)throw zipError('ZIP64 files are not supported; make a normal ZIP (under 4 GB).','ZIP64');
  if(count>MAX_ENTRIES)throw zipError('The ZIP has too many files (at most 5000).','ZIP_LIMIT');
  if(cdOffset+cdSize>eocd)throw zipError('The ZIP file is damaged.');
  const entries=[],offsets=new Set();let p=cdOffset;
  for(let i=0;i<count;i++){
    if(p+46>buf.length||buf.readUInt32LE(p)!==0x02014b50)throw zipError('The ZIP file is damaged.');
    const flags=buf.readUInt16LE(p+8),method=buf.readUInt16LE(p+10),crc=buf.readUInt32LE(p+16),csize=buf.readUInt32LE(p+20),size=buf.readUInt32LE(p+24);
    const nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commentLen=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
    if(p+46+nameLen+extraLen>buf.length)throw zipError('The ZIP file is damaged.');
    const name=decodeName(buf.subarray(p+46,p+46+nameLen),!!(flags&0x800),buf.subarray(p+46+nameLen,p+46+nameLen+extraLen)).replace(/\\/g,'/');
    if(csize===0xffffffff||size===0xffffffff||local===0xffffffff)throw zipError('ZIP64 files are not supported; make a normal ZIP (under 4 GB).','ZIP64');
    // Owner, 2026-11-14: two records sharing one data block is a ZIP-bomb trick, never a real package.
    if(offsets.has(local))throw zipError('The ZIP file is damaged.');offsets.add(local);
    const entry={name,size,compressed_size:csize,method,encrypted:!!(flags&1),directory:name.endsWith('/'),
      read(){
        if(this.encrypted)throw zipError('Encrypted ZIP entries are refused.','ZIP_ENCRYPTED');
        if(size>MAX_ENTRY_BYTES)throw zipError('Pictures must be at most 20 MiB.','ZIP_LIMIT');
        // Real PNG/JPEG barely compresses; a huge ratio means filler, not a picture (owner, 2026-11-14).
        if(size>1024*1024&&csize*100<size)throw zipError('This file is compressed suspiciously well; it is not a real picture.','ZIP_LIMIT');
        if(local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)throw zipError('The ZIP file is damaged.');
        const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
        if(start+csize>buf.length)throw zipError('The ZIP file is damaged.');
        const raw=buf.subarray(start,start+csize);let data;
        if(method===0)data=Buffer.from(raw);
        else if(method===8){try{data=inflateRawSync(raw,{maxOutputLength:Math.max(1,size)});}catch{throw zipError('The ZIP file is damaged.');}}
        else throw zipError('This ZIP compression method is not supported (only stored and deflate).','ZIP_METHOD');
        if(data.length!==size||(crc32(data)>>>0)!==crc)throw zipError('The ZIP file is damaged.');
        return data;
      }};
    entries.push(entry);p+=46+nameLen+extraLen+commentLen;
  }
  return {entries};
}

// Safe relative parts of an entry name, or null when it tries to leave the package.
export function entryParts(name){
  const s=String(name);
  if(/^([a-z]:|\/)/i.test(s)||s.includes('\0'))return null;
  const parts=s.split('/').filter(x=>x!==''&&x!=='.');
  if(!parts.length||parts.some(x=>x==='..'))return null;
  return parts;
}
// __MACOSX, dot files and dot folders are packaging leftovers.
export const ignoredEntry=parts=>parts.some(x=>x==='__MACOSX'||x.startsWith('.'));

// Picture type from the first bytes; null for anything else.
export function imageKind(b){
  if(b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'jpg';
  if(b.length>12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}

// Same rule as the watched folder of a place (location-backgrounds locationDir).
export const safeName=s=>String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80)||'Helyszín';
// Names for set-aside copies: also avoids Windows device names (CON, NUL, COM1…), owner 2026-11-14.
export const zipPart=s=>{const v=safeName(s);return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(v.split('.')[0])?v+'_':v;};
export const foldKey=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').replace(/[-–—_›>,.()'"]+/g,' ').replace(/\s+/g,' ').trim();
const wordCount=k=>k.split(' ').filter(Boolean).length;

// locations: [{id,name}] from the catalogue; nodes: location tree nodes (location_id, short_name, path).
// archived: location ids whose tree node is archived (and that have no live node).
// keys place a picture; aliases (short names, bare one-word paths) never place one, they only make
// a folder ambiguous or suggest candidates (owner, 2026-11-14: "Kert" must not mean one garden).
export function placeIndex(locations,nodes=[],archived=new Set()){
  const byLocation=new Map(nodes.filter(n=>n.location_id).map(n=>[n.location_id,n]));
  return locations.map(l=>{
    const n=byLocation.get(l.id),parts=n?.path?String(n.path).split(' › '):[];
    const tree=[parts.length>1&&parts.join(' - '),parts.length>2&&parts.slice(1).join(' - ')].filter(Boolean).map(foldKey);
    const keys=new Set([foldKey(l.name),...tree.filter(k=>wordCount(k)>=2)].filter(Boolean));
    const aliases=new Set([...keys,...[n?.short_name,n?.name,parts.join(' - '),parts.slice(1).join(' - '),parts.at(-1)].filter(Boolean).map(foldKey)].filter(Boolean));
    return {location_id:l.id,name:l.name,path:n?.path||null,exact:safeName(l.name),keys,aliases,archived:!n&&archived.has(l.id)};
  });
}

// {location_id,name,how:'exact'|'tolerant'} or {location_id:null,ambiguous,archived?,candidates:[name…]}.
export function matchPlace(folder,index){
  const key=foldKey(folder),exact=index.filter(x=>x.exact===safeName(folder)),hits=key?index.filter(x=>x.keys.has(key)):[];
  const clashes=x=>index.filter(o=>o!==x&&!o.archived&&o.location_id!==x.location_id&&o.aliases.has(key));
  const names=list=>[...new Set(list.map(x=>x.name))].slice(0,3);
  const accept=(x,how)=>{
    const other=clashes(x);
    if(other.length)return {location_id:null,ambiguous:true,candidates:names([x,...other])};
    if(x.archived)return {location_id:null,ambiguous:false,archived:true,candidates:[x.name]};
    return {location_id:x.location_id,name:x.name,how};
  };
  if(exact.length===1)return accept(exact[0],'exact');
  if(exact.length>1)return {location_id:null,ambiguous:true,candidates:names(exact)};
  if(hits.length===1)return accept(hits[0],'tolerant');
  if(hits.length>1)return {location_id:null,ambiguous:true,candidates:names(hits)};
  // A bare short name ("Konyha", "Kert") is never enough on its own.
  const weak=key?index.filter(x=>x.aliases.has(key)):[];
  if(weak.length)return {location_id:null,ambiguous:weak.length>1,candidates:names(weak)};
  // "Káloz - Nappali": the last part names several rooms; the named town's ones come first.
  const segs=String(folder).split(/\s*[-–—›]\s*/).map(foldKey).filter(Boolean),last=segs.at(-1),town=segs.length>1?segs[0]:null;
  const byLast=last?index.filter(x=>x.aliases.has(last)):[];
  if(byLast.length){
    const inTown=x=>town&&x.path&&foldKey(String(x.path).split(' › ')[0])===town?0:1;
    return {location_id:null,ambiguous:byLast.length>1,candidates:names([...byLast].sort((a,b)=>inTown(a)-inTown(b)||a.name.localeCompare(b.name,'hu')))};
  }
  const words=new Set(key.split(' ').filter(Boolean));
  const score=x=>{let best=0;for(const k of x.keys){const w=k.split(' ');const common=w.filter(t=>words.has(t)).length;best=Math.max(best,common/(new Set([...w,...words]).size||1));}return best;};
  const candidates=index.map(x=>({name:x.name,s:score(x)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.name.localeCompare(b.name,'hu')).slice(0,3).map(x=>x.name);
  return {location_id:null,ambiguous:false,candidates};
}
