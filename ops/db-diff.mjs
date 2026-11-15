#!/usr/bin/env node
// Database diff (developer tools, cycle 3): "what did that button change?" Take a snapshot,
// do the action in the program, then diff. Read-only for the live catalogue (SQLite online
// backup for the snapshot, a read-only connection for the diff).
//
//   npm run dbdiff -- snapshot [--name before-rename]
//   npm run dbdiff -- diff [name] [--db <other universe.sqlite>] [--samples 5]
//   npm run dbdiff -- list
//
// The diff prints, per table, how many rows were added, removed and changed, which columns
// changed, and a few example keys. Never cell values: they can be private character data.
// Snapshots live in %LOCALAPPDATA%\LivingUniverse\db-snapshots (outside OneDrive).
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolveDataDir} from '../app/server.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const snapshotsDir=()=>path.join(process.env.LOCALAPPDATA||path.dirname(resolveDataDir()),'LivingUniverse','db-snapshots');
const value=v=>v instanceof Uint8Array?'x'+Buffer.from(v).toString('hex'):v;
// Only the columns both versions have: a newly added column must not mark every row as changed.
const hashRow=(row,cols)=>createHash('sha1').update(JSON.stringify(cols.map(c=>value(row[c])))).digest('base64');

// Key columns: the declared primary key, else the rowid.
function keyOf(db,table){
  const cols=db.prepare(`PRAGMA table_info("${table.replaceAll('"','""')}")`).all();
  const pk=cols.filter(c=>c.pk>0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  const withoutRowid=/WITHOUT\s+ROWID/i.test(db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table)?.sql||'');
  return {cols:cols.map(c=>c.name),key:pk.length?pk:withoutRowid?cols.map(c=>c.name):['rowid']};
}
function readTable(db,table){
  const {cols,key}=keyOf(db,table);
  const q=s=>'"'+s.replaceAll('"','""')+'"';
  const select=(key[0]==='rowid'?'rowid AS __key, ':'')+cols.map(q).join(', ');
  const rows=new Map();
  for(const row of db.prepare(`SELECT ${select} FROM ${q(table)}`).iterate()){
    const k=key[0]==='rowid'?String(row.__key):JSON.stringify(key.map(c=>value(row[c])));
    if(key[0]==='rowid')delete row.__key;
    rows.set(k,row);
  }
  return {cols,rows};
}
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);

export function diffDatabases(before,after,{samples=5}={}){
  const out=[];
  for(const table of [...new Set([...tables(before),...tables(after)])].sort()){
    const has=db=>tables(db).includes(table);
    if(!has(before)){out.push({table,created:true,added:after.prepare(`SELECT count(*) n FROM "${table.replaceAll('"','""')}"`).get().n});continue;}
    if(!has(after)){out.push({table,dropped:true});continue;}
    const a=readTable(before,table),b=readTable(after,table);
    const added=[],removed=[],changed=[],columns=new Set(),common=b.cols.filter(c=>a.cols.includes(c));
    for(const [k,row] of b.rows){
      const old=a.rows.get(k);
      if(!old){added.push(k);continue;}
      if(hashRow(old,common)!==hashRow(row,common)){changed.push(k);for(const c of common)if(JSON.stringify(value(old[c]))!==JSON.stringify(value(row[c])))columns.add(c);}
    }
    for(const k of a.rows.keys())if(!b.rows.has(k))removed.push(k);
    const newColumns=b.cols.filter(c=>!a.cols.includes(c)),droppedColumns=a.cols.filter(c=>!b.cols.includes(c));
    if(added.length||removed.length||changed.length||newColumns.length||droppedColumns.length)
      out.push({table,added:added.length,removed:removed.length,changed:changed.length,columns:[...columns],new_columns:newColumns,dropped_columns:droppedColumns,
        samples:{added:added.slice(0,samples),removed:removed.slice(0,samples),changed:changed.slice(0,samples)}});
  }
  return out;
}

async function latest(){
  const files=(await fs.readdir(snapshotsDir()).catch(()=>[])).filter(f=>f.endsWith('.sqlite'));
  const stats=await Promise.all(files.map(async f=>({f,m:(await fs.stat(path.join(snapshotsDir(),f))).mtimeMs})));
  return stats.sort((x,y)=>y.m-x.m).map(x=>x.f.replace(/\.sqlite$/,''));
}

async function main(){
  const [command='diff',name]=process.argv.slice(2).filter((a,i,all)=>!a.startsWith('--')&&!(all[i-1]||'').startsWith('--'));
  const live=arg('db',path.join(resolveDataDir(),'universe.sqlite'));
  if(command==='list'){const names=await latest();console.log(names.length?names.join('\n'):'No snapshots yet.');return;}
  if(command==='snapshot'){
    const id=(arg('name')||new Date().toISOString().replace(/[:.]/g,'-')).replace(/[^\w.-]/g,'_');
    await fs.mkdir(snapshotsDir(),{recursive:true});
    const target=path.join(snapshotsDir(),id+'.sqlite');
    if(await fs.stat(target).catch(()=>null))throw Error('A snapshot with this name exists: '+id);
    const source=new DatabaseSync(live,{readOnly:true});
    try{await backup(source,target);}finally{source.close();}
    console.log('Snapshot saved: '+id+'\nNow do the action in the program, then run: npm run dbdiff -- diff '+id);
    return;
  }
  if(command==='diff'){
    const id=name||(await latest())[0];
    if(!id)throw Error('No snapshot yet. Run: npm run dbdiff -- snapshot');
    if(!await fs.stat(path.join(snapshotsDir(),id+'.sqlite')).catch(()=>null))throw Error('No snapshot named '+id+'. See: npm run dbdiff -- list');
    const before=new DatabaseSync(path.join(snapshotsDir(),id+'.sqlite'),{readOnly:true}),after=new DatabaseSync(live,{readOnly:true});
    try{
      const changes=diffDatabases(before,after,{samples:Number(arg('samples',5))});
      if(!changes.length){console.log(`No difference since snapshot ${id}.`);return;}
      console.log(`Changes since snapshot ${id}:`);
      for(const c of changes){
        if(c.created){console.log(`  + ${c.table}: new table, ${c.added} rows`);continue;}
        if(c.dropped){console.log(`  - ${c.table}: table removed`);continue;}
        console.log(`  ${c.table}: +${c.added} −${c.removed} ~${c.changed}${c.columns.length?'  columns: '+c.columns.join(', '):''}${c.new_columns.length?'  new columns: '+c.new_columns.join(', '):''}${c.dropped_columns.length?'  removed columns: '+c.dropped_columns.join(', '):''}`);
        for(const kind of ['added','removed','changed'])if(c.samples[kind].length)console.log(`      ${kind}: ${c.samples[kind].join('  ')}`);
      }
    }finally{before.close();after.close();}
    return;
  }
  throw Error('Unknown command: '+command+' (snapshot, diff, list)');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
