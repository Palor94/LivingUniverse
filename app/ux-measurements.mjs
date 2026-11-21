// B7: bounded, local diagnostic metadata only. No labels, entered text or character IDs.
import {appendFileSync,mkdirSync,readFileSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';

export function validMeasurement(v){
  return v&&typeof v==='object'&&!Array.isArray(v)&&
    Object.keys(v).every(k=>['id','task','surface','clicks','ms'].includes(k))&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)&&
    ['talk','background','other'].includes(v.task)&&['desktop','phone'].includes(v.surface)&&
    Number.isInteger(v.clicks)&&v.clicks>=0&&v.clicks<=1000000&&Number.isInteger(v.ms)&&v.ms>=0&&v.ms<=86400000;
}
export function readMeasurements(dataDir){
  const entries=[];
  for(const name of ['ux-measurements.1.log','ux-measurements.log']){
    let text;try{text=readFileSync(path.join(dataDir,'logs',name),'utf8');}catch{continue;}
    for(const line of text.split('\n'))try{
      const {at,...record}=JSON.parse(line);
      if(validMeasurement(record)&&Number.isFinite(Date.parse(at)))entries.push({at,...record});
    }catch{}
  }
  return [...new Map(entries.map(e=>[e.id,e])).values()];
}
export function saveMeasurement(dataDir,record,{now=()=>Date.now(),maxBytes=1024*1024}={}){
  if(!validMeasurement(record))throw Object.assign(Error('Érvénytelen feladatmérés.'),{status:400});
  if(readMeasurements(dataDir).some(e=>e.id===record.id))return {saved:true,duplicate:true};
  const dir=path.join(dataDir,'logs'),file=path.join(dir,'ux-measurements.log');mkdirSync(dir,{recursive:true});
  try{if(statSync(file).size>=maxBytes)renameSync(file,path.join(dir,'ux-measurements.1.log'));}catch(e){if(e.code!=='ENOENT')throw e;}
  appendFileSync(file,JSON.stringify({...record,at:new Date(now()).toISOString()})+'\n');
  return {saved:true};
}
export function measurementSummary(entries,{since,to}){
  const groups=new Map();
  for(const e of entries){
    if(e.at<since||e.at>to)continue;
    const key=e.task+':'+e.surface,g=groups.get(key)||{task:e.task,surface:e.surface,runs:0,clicks:0,ms:0};
    g.runs++;g.clicks+=e.clicks;g.ms+=e.ms;groups.set(key,g);
  }
  return [...groups.values()].map(g=>({...g,avg_clicks:+(g.clicks/g.runs).toFixed(1),avg_ms:Math.round(g.ms/g.runs)}));
}
