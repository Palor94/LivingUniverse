import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),m=JSON.parse(await readFile(path.join(root,'SOURCE_BACKUP_MANIFEST.json'),'utf8'));
let count=0;for(const f of m.files){if(typeof f.path!=='string'||path.isAbsolute(f.path)||path.win32.isAbsolute(f.path)||f.path.split(/[\\/]/).some(p=>p==='..'||p==='.')||f.path.includes(':'))throw Error('Unsafe manifest entry');const b=await readFile(path.join(root,f.path));if(b.length!==f.size_bytes||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Verification failed: '+f.path);count++;}
console.log(JSON.stringify({verified_source_files:count,captured_at_utc:m.captured_at_utc,component:m.component}));
