// Rolling automatic catalogue snapshots: a safety net between the creator's deliberate
// backups (Backup Living Universe.cmd). Once a day while the app runs, the live SQLite
// catalogue is copied with SQLite's online backup API into <dataDir>/auto-snapshots
// (outside OneDrive), checked with integrity_check, and only the newest KEEP automatic
// snapshots are kept. Only files this module made (auto-*.sqlite) are ever removed; the
// creator's own backups and the live database are never touched.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';

export const KEEP=7;
const NAME=/^auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/;
const DAY=24*3600e3;

export function installAutoSnapshots({db,dataDir,fail,now=()=>new Date()}){
  const dir=path.join(dataDir,'auto-snapshots');
  let running=null,timer=null,lastError=null;
  async function list(){
    const names=(await fs.readdir(dir).catch(()=>[])).filter(n=>NAME.test(n)).sort().reverse();
    return Promise.all(names.map(async n=>{const s=await fs.stat(path.join(dir,n));return {name:n,size:s.size,created_at:s.mtime.toISOString()};}));
  }
  // SQLite side files of this module's own snapshots. An empty "-wal" and its "-shm" carry no
  // data; a non-empty "-wal" is kept (it could hold pages of a copy someone has open).
  async function removeCompanions(file){
    const wal=await fs.stat(file+'-wal').catch(()=>null);
    if(wal&&wal.size>0)return;
    for(const s of ['-wal','-shm'])await fs.rm(file+s,{force:true}).catch(()=>{});
  }
  // Leftovers from snapshots taken before the fix: companions of automatic snapshots only.
  // Called at the end of take(), when this module has no copy of its own open.
  async function tidy(){
    for(const n of await fs.readdir(dir).catch(()=>[])){
      const m=n.match(/^(auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite(?:\.partial)?)-(?:wal|shm)$/);
      if(m)await removeCompanions(path.join(dir,m[1]));
    }
  }
  async function take(){
    if(running)return running;
    running=(async()=>{
      await fs.mkdir(dir,{recursive:true});
      const name='auto-'+now().toISOString().slice(0,19).replace(/:/g,'-')+'.sqlite',file=path.join(dir,name),tmp=file+'.partial';
      try{
        await backup(db,tmp);
        // The copy is made self-contained (rollback journal, not WAL) before checking it: a WAL
        // copy left "-wal"/"-shm" companions behind after every snapshot (2026-11-12).
        const copy=new DatabaseSync(tmp);let ok;
        try{copy.exec('PRAGMA journal_mode=DELETE');ok=copy.prepare('PRAGMA integrity_check').get()?.integrity_check==='ok';}finally{copy.close();}
        if(!ok)throw Error('The snapshot failed its integrity check.');
        await removeCompanions(tmp);
        await fs.rename(tmp,file);
        // Rotation: only older automatic snapshots beyond the newest KEEP.
        for(const old of (await list()).slice(KEEP)){await fs.rm(path.join(dir,old.name),{force:true});await removeCompanions(path.join(dir,old.name));}
        await tidy();
        lastError=null;return {name};
      }catch(e){await fs.rm(tmp,{force:true});await removeCompanions(tmp);lastError=e.message;throw e;}
    })().finally(()=>{running=null;});
    return running;
  }
  // Take one when the newest is older than 20 hours; check every hour.
  async function tick(){const [last]=await list();if(!last||now()-Date.parse(last.created_at)>DAY*20/24)await take().catch(e=>console.error('Auto snapshot: '+e.message));}
  function start(){if(timer)return;setTimeout(tick,120_000).unref?.();timer=setInterval(tick,3600e3);timer.unref?.();}
  function stop(){if(timer)clearInterval(timer);timer=null;}
  async function handle({p,req,json}){
    if(p==='/api/auto-snapshots'&&req.method==='GET')return json({folder:dir,keep:KEEP,last_error:lastError,snapshots:await list()}),true;
    if(p==='/api/auto-snapshots'&&req.method==='POST'){try{return json(await take()),true;}catch(e){throw fail('Snapshot failed: '+e.message,500);}}
    return false;
  }
  return {take,list,start,stop,handle,dir};
}
