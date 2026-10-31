import {createHash} from 'node:crypto';
import path from 'node:path';

// Working profile text only. Primary-name changes and private admin notes are
// deliberately absent from the MCP update scope.
export const editableProfileFields={aliases:1000,biography:30000,personality:30000,appearance:30000,sexuality:30000,speech_style:30000};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const databaseIdentity=file=>digest(process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file));
export function profileVersion(record){
  return digest(Object.fromEntries(['id','name','race',...Object.keys(editableProfileFields),'notes','cover_id','created_at'].map(key=>[key,record[key]??null])));
}
