import {createHash} from 'node:crypto';
import {readFileSync,promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {referenceCrop} from './reference-crop.mjs';
import {referenceImage,MAX_SOURCE_BYTES} from '../mcp/images.mjs';
import {imageInfo} from './image-crops.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const roles=['face','body','detail','general'];
export async function backupBeforeCharacterCrops(db,dataDir){
  const exists=name=>db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name);
  if(exists('character_reference_crops')||!exists('media')||!db.prepare('SELECT 1 FROM media LIMIT 1').get())return null;
  const folder=path.join(dataDir,'backups');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'before-character-reference-crops-'+randomUUID()+'.sqlite');await backup(db,file);
  const copy=new DatabaseSync(file,{readOnly:true});try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Reference crop migration backup failed verification.');}finally{copy.close();}return file;
}
export function installCharacterReferenceCrops({db,one,all,run,transaction,asset,safeFile,fingerprint,isBusy,fail}){
  db.exec(readFileSync(new URL('./migrations/021-character-reference-crops.up.sql',import.meta.url),'utf8'));
  function assigned(mid,cid){
    if(!uuid.test(mid)||!uuid.test(cid))throw fail('Invalid character or media ID.');
    const m=asset(mid);
    if(m.kind!=='image'||!one('SELECT 1 FROM active_media WHERE id=?',mid)||!one('SELECT 1 FROM depictions d JOIN characters c ON c.id=d.character_id LEFT JOIN character_ui u ON u.character_id=c.id WHERE d.media_id=? AND d.character_id=? AND u.merged_into IS NULL',mid,cid))throw fail('Choose an active image assigned to this character.',409);
    return m;
  }
  function drafts(mid){return all('SELECT character_id,role,crop_json,source_sha256,version,updated_at FROM character_reference_crops WHERE media_id=? AND EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=character_reference_crops.media_id AND d.character_id=character_reference_crops.character_id)',mid).map(({crop_json,...r})=>({...r,crop:referenceCrop(JSON.parse(crop_json))}));}
  async function source(m,cropRequired=true){
    const file=await safeFile(m),stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_SOURCE_BYTES)throw fail('Reference crop sources must be images up to 20 MiB.');
    const bytes=await fs.readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');if(await fingerprint(file)!==sha256)throw fail('The source changed while reading. Reopen the editor.',409);if(bytes.length>MAX_SOURCE_BYTES)throw fail('Image is too large.');
    const mimeType={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.bmp':'image/bmp'}[path.extname(m.relative_path).toLowerCase()];if(!mimeType)throw fail('Unsupported reference image format.');
    let info=null;if(cropRequired){if(!['image/jpeg','image/png'].includes(mimeType))throw fail('Use a still JPEG or PNG reference.');try{info=imageInfo(bytes);}catch{throw fail('This source cannot be opened in the reference crop editor.',409);}if(!['jpeg','png'].includes(info.format)||info.animated)throw fail('Use a still JPEG or PNG reference.');}
    return {bytes,sha256,info,mimeType};
  }
  async function preview(mid,ref){const m=asset(mid),s=await source(m,!!ref.crop);if(!ref.sha256||s.sha256!==ref.sha256)throw fail('The source no longer matches the approved fingerprint. Restore it or review the reference again.',409);if(ref.crop){const image=await referenceImage(s.bytes,referenceCrop(ref.crop));return {bytes:Buffer.from(image.data,'base64'),mimeType:image.mimeType};}return {bytes:s.bytes,mimeType:s.mimeType};}
  async function validateSelection(ref){if(ref.crop){referenceCrop(ref.crop);const s=await source(asset(ref.media_id));if(s.sha256!==ref.sha256)throw fail('The selected crop source changed during approval.',409);}}
  async function handle({p,url,body,req,json,res}){
    const approved=p.match(/^\/api\/characters\/([^/]+)\/references\/([^/]+)\/image$/);
    if(approved&&req.method==='GET'){
      const [,cid,mid]=approved;assigned(mid,cid);const rid=url.searchParams.get('revision_id'),row=rid?one('SELECT * FROM canon WHERE character_id=? AND id=?',cid,rid):one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid),ref=row&&JSON.parse(row.references_json).find(r=>r.media_id===mid);
      if(!ref)throw fail('Approved reference not found.',404);const output=await preview(mid,ref);res.writeHead(200,{'Content-Type':output.mimeType,'Cache-Control':'no-store'});res.end(output.bytes);return true;
    }
    const route=p.match(/^\/api\/media\/([^/]+)\/character-crops\/([^/]+)\/([^/]+)$/);if(!route)return false;
    const [,mid,cid,role]=route,m=assigned(mid,cid);if(!roles.includes(role))throw fail('Choose face, body, detail or general.');
    const row=()=>one('SELECT * FROM character_reference_crops WHERE media_id=? AND character_id=? AND role=?',mid,cid,role);
    const s=await source(m,req.method!=='GET'),old=row();
    if(req.method==='GET'){let info;try{info=imageInfo(s.bytes);}catch{}json({media_id:mid,character_id:cid,role,crop:old?referenceCrop(JSON.parse(old.crop_json)):null,version:old?.version??0,source_sha256:s.sha256,stale:!!old&&old.source_sha256!==s.sha256,crop_supported:!!info&&['jpeg','png'].includes(info.format)&&!info.animated,width:info?.width??null,height:info?.height??null});return true;}
    if(req.method!=='POST')throw fail('Use GET or POST for reference crop drafts.',405);
    if(isBusy())throw fail('Wait until the current file or generation operation finishes.',409);
    if(!body||Object.keys(body).some(k=>!['crop','source_sha256','expected_version'].includes(k))||!Object.hasOwn(body,'crop')||!Number.isInteger(body.expected_version)||body.expected_version<0)throw fail('Reload this crop before saving.');
    const crop=referenceCrop(body.crop);if(body.source_sha256!==s.sha256)throw fail('The source image changed. Reopen the crop editor.',409);
    transaction(()=>{assigned(mid,cid);const latest=row();if((latest?.version??0)!==body.expected_version)throw fail('This character crop changed elsewhere. Reopen it before saving.',409);run('INSERT INTO character_reference_crops VALUES(?,?,?,?,?,?,?) ON CONFLICT(media_id,character_id,role) DO UPDATE SET crop_json=excluded.crop_json,source_sha256=excluded.source_sha256,version=excluded.version,updated_at=excluded.updated_at',mid,cid,role,JSON.stringify(crop),s.sha256,(latest?.version??0)+1,new Date().toISOString());});
    json({ok:true,version:row().version,crop,canon_changed:false});return true;
  }
  function validateRestore(){
    for(const row of all('SELECT * FROM character_reference_crops')){
      referenceCrop(JSON.parse(row.crop_json));if(!/^[a-f0-9]{64}$/.test(row.source_sha256)||!Number.isInteger(row.version)||row.version<1)throw fail('Invalid reference crop in backup.');
    }
    for(const row of all('SELECT references_json FROM canon'))for(const ref of JSON.parse(row.references_json))if(Object.hasOwn(ref,'crop'))referenceCrop(ref.crop);
  }
  return {handle,drafts,preview,validateRestore,validateSelection};
}
