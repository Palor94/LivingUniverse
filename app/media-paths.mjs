import path from 'node:path';

// Catalogue locations are data, never host-absolute paths. Historical journals
// retain their spelling; resolve both separators only at an explicit I/O boundary.
export function relativeParts(value,{empty=false}={}){
  if(empty&&value==='')return [];
  if(typeof value!=='string'||!value||path.posix.isAbsolute(value)||path.win32.isAbsolute(value)||/[\x00-\x1f:]/u.test(value))throw Error('Unsafe catalogue path.');
  const parts=value.split(/[\\/]/u);
  if(parts.some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe catalogue path.');
  return parts;
}
export const portablePath=(value,options)=>relativeParts(value,options).join('/');
export function resolveMediaPath(root,value){
  const result=path.resolve(root,...relativeParts(value)),rel=path.relative(path.resolve(root),result);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Catalogue path escapes media root.');
  return result;
}
export const samePhysicalPath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
