import {promises as fs,readFileSync} from 'node:fs';

export function decodeCoverJpeg(value){
  if(typeof value!=='string'||value.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Use a JPEG cover frame smaller than 300 KB.');
  const bytes=Buffer.from(value.slice('data:image/jpeg;base64,'.length),'base64');
  if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('Invalid JPEG cover frame.');
  let pos=2,dimensions;
  while(pos+4<bytes.length){if(bytes[pos++]!==255)break;while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===218||marker===217)break;const length=bytes.readUInt16BE(pos);if(length<2||pos+length>bytes.length)break;if([192,193,194].includes(marker)&&length>=8){dimensions={height:bytes.readUInt16BE(pos+3),width:bytes.readUInt16BE(pos+5)};break;}pos+=length;}
  if(!dimensions||!dimensions.width||!dimensions.height||dimensions.width>1200||dimensions.height>1200)throw Error('Cover frame dimensions must be between 1 and 1200 pixels.');
  return {bytes,...dimensions};
}
export function installVideoCovers({db,all,one,run,transaction,fail,safeFile}){
  db.exec(readFileSync(new URL('./migrations/009-video-cover-frames.up.sql',import.meta.url),'utf8'));
  const details=(cid,mid)=>one('SELECT media_id,time_seconds,captured_at FROM character_cover_frames WHERE character_id=? AND media_id=?',cid,mid||'')||null;
  async function handle({p,body,req,res,json}){
    let match=p.match(/^\/api\/characters\/([^/]+)\/video-cover$/);
    if(match&&req.method==='POST'){
      const cid=match[1],character=one('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid),m=one("SELECT * FROM active_media WHERE id=? AND kind='video'",body.media_id);
      if(!character||!m||!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',m.id,cid))throw fail('Choose a character assigned to this video.');
      if(!Number.isFinite(body.time_seconds)||body.time_seconds<0)throw fail('Choose a valid video-frame time.');
      const r=body.crop;if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<.01||r.h<.01||r.x+r.w>1.001||r.y+r.h>1.001)throw fail('Choose a crop within the frame.');
      try{decodeCoverJpeg(body.image_data);}catch(e){throw fail(e.message);}
      const stat=await fs.stat(await safeFile(m));if(body.source_size!==stat.size||body.source_mtime!==stat.mtime.toISOString())throw fail('The source video changed. Rescan and capture its frame again.',409);
      const captured=new Date().toISOString();
      transaction(()=>{run('INSERT INTO character_cover_frames VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(character_id) DO UPDATE SET media_id=excluded.media_id,time_seconds=excluded.time_seconds,data_url=excluded.data_url,source_crop_json=excluded.source_crop_json,source_size=excluded.source_size,source_mtime=excluded.source_mtime,captured_at=excluded.captured_at',cid,m.id,body.time_seconds,body.image_data,JSON.stringify(r),stat.size,stat.mtime.toISOString(),captured);run('UPDATE characters SET cover_id=? WHERE id=?',m.id,cid);run('INSERT INTO character_ui(character_id,cover_crop) VALUES(?,?) ON CONFLICT(character_id) DO UPDATE SET cover_crop=excluded.cover_crop',cid,JSON.stringify({media_id:m.id,x:0,y:0,w:1,h:1}));});
      json({ok:true,cover_frame:details(cid,m.id)});return true;
    }
    match=p.match(/^\/api\/characters\/([^/]+)\/cover-frame$/);
    if(match&&['GET','HEAD'].includes(req.method)){
      const row=one('SELECT f.data_url FROM character_cover_frames f JOIN characters c ON c.id=f.character_id WHERE c.id=? AND c.cover_id=f.media_id',match[1]);if(!row)throw fail('No current video cover frame.',404);let bytes;try{bytes=decodeCoverJpeg(row.data_url).bytes;}catch{throw fail('Stored cover frame is unavailable.',404);}
      res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return true;
    }
    return false;
  }
  return {handle,details};
}
