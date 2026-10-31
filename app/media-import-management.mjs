import {randomUUID} from 'node:crypto';
import {ImportError} from './safe-download.mjs';

// Cancellation is an append-only receipt in the existing, exported event journal.
// Neither import receipts nor saved media/character links are deleted.
export function installImportManagement({one,all,run,transaction,uploads,load,enabled,isBusy,clock,origin}){
  const now=()=>new Date(clock()).toISOString();
  const fail=(code,message,status=400)=>{throw new ImportError(code,message,status);};
  const cancelled=id=>one("SELECT created_at FROM media_import_events WHERE import_id=? AND event='cancelled' ORDER BY rowid LIMIT 1",id)?.created_at??null;
  function capacity(){return {
    active_imports:one("SELECT COUNT(*) n FROM media_imports i WHERE expires_at>? AND NOT EXISTS(SELECT 1 FROM media_import_events e WHERE e.import_id=i.id AND e.event='cancelled')",now()).n,
    active_import_limit:50,
    reserved_upload_bytes:one("SELECT COALESCE(SUM(size),0) n FROM media_uploads WHERE status='uploading' AND expires_at>?",now()).n,
    reserved_upload_limit_bytes:256*1024*1024
  };}
  function summary(s){
    const cancelledAt=cancelled(s.id),expired=Date.parse(s.expires_at)<=clock();
    const ids=all('SELECT character_id FROM media_import_targets WHERE import_id=? ORDER BY character_id',s.id).map(r=>r.character_id);
    const characters=(ids.length?ids:[s.character_id]).map(id=>{const c=one('SELECT c.name,u.merged_into FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=?',id);return {character_id:id,name:c?.name??null,available:!!c&&!c.merged_into};});
    const items=one("SELECT COUNT(*) total,COALESCE(SUM(status='committed'),0) committed,COALESCE(SUM(status='failed'),0) failed FROM media_import_items WHERE import_id=?",s.id);
    const staged=one("SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status='uploading' AND expires_at>? THEN size ELSE 0 END),0) reserved_bytes,COALESCE(SUM(CASE WHEN status='uploading' THEN received_bytes ELSE 0 END),0) received_bytes,COALESCE(SUM(error_code='CLEANUP_PENDING'),0) cleanup_pending FROM media_uploads WHERE import_id=?",now(),s.id);
    return {import_id:s.id,status:cancelledAt?'cancelled':expired?'expired':'open',created_at:s.created_at,expires_at:s.expires_at,cancelled_at:cancelledAt,characters,items,uploads:staged,can_cancel:!cancelledAt||staged.cleanup_pending>0,review_url:origin+'/media-imports'};
  }
  function list(args={}){
    enabled();if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['status','character_id','limit','offset'].includes(k)))fail('INVALID_ARGUMENT','Use status, character_id, limit and offset.');
    const {status='open',character_id,limit=20,offset=0}=args;
    if(!['open','expired','cancelled','all'].includes(status)||!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('INVALID_ARGUMENT','Use a valid status, limit 1–50 and offset 0–100000.');
    if(character_id!==undefined&&(typeof character_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(character_id)))fail('INVALID_ID','Use a character UUID.');
    const cancellation="EXISTS(SELECT 1 FROM media_import_events e WHERE e.import_id=i.id AND e.event='cancelled')";
    const where=[],params=[];
    if(status==='cancelled')where.push(cancellation);
    if(status==='open'||status==='expired'){where.push('NOT '+cancellation,`expires_at${status==='open'?'>':'<='}?`);params.push(now());}
    if(character_id!==undefined){where.push('(i.character_id=? OR EXISTS(SELECT 1 FROM media_import_targets t WHERE t.import_id=i.id AND t.character_id=?))');params.push(character_id,character_id);}
    const filter=where.length?' WHERE '+where.join(' AND '):'',total=one('SELECT COUNT(*) n FROM media_imports i'+filter,...params).n;
    const imports=all('SELECT i.* FROM media_imports i'+filter+' ORDER BY i.created_at,i.id LIMIT ? OFFSET ?',...params,limit,offset).map(summary);
    return {imports,total,limit,offset,next_offset:offset+imports.length<total?offset+imports.length:null,capacity:capacity(),review_url:origin+'/media-imports'};
  }
  async function cancel(args){
    enabled();if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==1||!Object.hasOwn(args,'import_id'))fail('INVALID_ARGUMENT','Select exactly one import_id to cancel.');
    const s=load(args.import_id);
    if(isBusy())fail('BUSY','An import or catalogue file operation is running. Retry this same cancellation shortly.',409);
    const cleanup=await uploads.cancelImport(s.id,()=>transaction(()=>{
      if(!cancelled(s.id))run('INSERT INTO media_import_events VALUES(?,?,?,?,?,?)',randomUUID(),s.id,'import_cancelled','cancelled',null,now());
    }));
    return {...summary(s),...cleanup,capacity:capacity(),saved_media_preserved:true};
  }
  return {cancelled,capacity,list,cancel};
}
