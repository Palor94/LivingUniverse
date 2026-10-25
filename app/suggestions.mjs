import {promises as fs,readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {fileSignature,distance} from './duplicates.mjs';
import {visualVersion} from './public/image-hash.js';

const method='local-approved-reference-hash-v1';
export function installSuggestions({db,all,one,run,transaction,fail,safeFile}){
  db.exec(readFileSync(new URL('./migrations/006-sorting-suggestions.up.sql',import.meta.url),'utf8'));
  const currentCanon=cid=>one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
  const activeCharacter=cid=>one('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid);
  async function cached(mid){const m=one('SELECT m.*,f.signature,f.sha256,f.visual_hash,f.visual_version FROM active_media m JOIN media_fingerprints f ON f.media_id=m.id WHERE m.id=?',mid);if(!m)return null;try{if(fileSignature(await fs.stat(await safeFile(m)))!==m.signature)return null;return m;}catch{return null;}}
  async function stale(s){
    const target=await cached(s.media_id);if(!target||target.signature!==s.target_signature||target.sha256!==s.target_sha256||!activeCharacter(s.character_id)||currentCanon(s.character_id)?.id!==s.canon_id)return true;
    for(const e of JSON.parse(s.evidence_json).references){const ref=await cached(e.media_id);if(!ref||ref.sha256!==e.sha256||ref.signature!==e.signature)return true;}
    return false;
  }
  async function handle({p,body,req,url,json}){
    if(p==='/api/suggestions/capabilities'&&req.method==='GET'){json({method,ai:false,external_provider:null,uses:'Current explicitly approved canonical references and cached SHA-256/dHash only',face_identity:false,body_proportions:false,training:false});return true;}
    if(p==='/api/suggestions/generate'&&req.method==='POST'){
      if(!Array.isArray(body.media_ids)||!body.media_ids.length||body.media_ids.length>25||body.media_ids.some(id=>typeof id!=='string'||!one('SELECT 1 FROM active_media WHERE id=?',id)))throw fail('Choose 1–25 active media items per batch.');
      const threshold=body.threshold??6;if(!Number.isInteger(threshold)||threshold<0||threshold>12)throw fail('Choose a tolerance from 0 to 12 bits.');
      const referenceCharacters=[];let referenceCount=0;
      for(const c of all('SELECT c.* FROM canon c LEFT JOIN character_ui u ON u.character_id=c.character_id WHERE u.merged_into IS NULL AND c.rowid=(SELECT MAX(c2.rowid) FROM canon c2 WHERE c2.character_id=c.character_id)')){
        const refs=[];for(const r of JSON.parse(c.references_json)){const m=await cached(r.media_id);if(m&&m.kind==='image'&&r.sha256&&m.sha256===r.sha256&&m.visual_version===visualVersion&&/^[0-9a-f]{16}$/.test(m.visual_hash))refs.push({...m,role:r.role});}if(refs.length){referenceCharacters.push({canon:c,refs});referenceCount+=refs.length;}
      }
      let created=0,reused=0;const results=[];
      for(const mid of new Set(body.media_ids)){
        const target=await cached(mid);if(!target||target.kind!=='image'||target.visual_version!==visualVersion||! /^[0-9a-f]{16}$/.test(target.visual_hash)){results.push({id:mid,reason:'No current visual fingerprint. Analyze this picture in Duplicates first.'});continue;}
        const candidates=[];
        for(const {canon,refs} of referenceCharacters){if(one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',mid,canon.character_id))continue;
          const matches=refs.filter(r=>r.id!==mid).map(r=>({media_id:r.id,sha256:r.sha256,signature:r.signature,role:r.role,distance:distance(target.visual_hash,r.visual_hash),exact:target.sha256===r.sha256})).filter(r=>r.exact||r.distance<=threshold).sort((a,b)=>Number(b.exact)-Number(a.exact)||a.distance-b.distance);
          if(!matches.length)continue;const references=[...new Map([matches[0],...['face','body','detail','general'].map(role=>matches.find(r=>r.role===role)).filter(Boolean)].map(r=>[r.media_id,r])).values()];
          candidates.push({canon,evidence:{references,minimum_distance:matches[0].distance,exact:matches[0].exact,uncertainty:'Uncalibrated whole-image similarity; verify every person manually',face_identity:null,body_proportions:null}});
        }
        candidates.sort((a,b)=>Number(b.evidence.exact)-Number(a.evidence.exact)||a.evidence.minimum_distance-b.evidence.minimum_distance);
        for(const {canon,evidence} of candidates.slice(0,5)){
          const context=createHash('sha256').update(JSON.stringify([method,mid,target.signature,target.sha256,canon.id,evidence])).digest('hex');
          const n=Number(run('INSERT OR IGNORE INTO sorting_suggestions VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),mid,canon.character_id,canon.id,method,target.signature,target.sha256,JSON.stringify(evidence),context,new Date().toISOString()).changes);if(n)created++;else reused++;
        }
        results.push({id:mid,candidates:Math.min(5,candidates.length)});
      }
      json({created,reused,reference_characters:referenceCharacters.length,references:referenceCount,results});return true;
    }
    const statusSQL="COALESCE((SELECT CASE decision WHEN 'reopened' THEN 'pending' ELSE decision END FROM suggestion_feedback f WHERE f.suggestion_id=s.id ORDER BY f.rowid DESC LIMIT 1),'pending')";
    if(p==='/api/suggestions'&&req.method==='GET'){
      const state=url.searchParams.get('state')||'pending';if(!['pending','accepted','rejected'].includes(state))throw fail('Unknown suggestion state');const args=[state];let where=statusSQL+'=?';if(url.searchParams.get('media_id')){where+=' AND s.media_id=?';args.push(url.searchParams.get('media_id'));}const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
      const rows=all('SELECT s.*,c.name character_name,m.relative_path FROM sorting_suggestions s JOIN characters c ON c.id=s.character_id JOIN active_media m ON m.id=s.media_id WHERE '+where+' ORDER BY s.created_at,s.id LIMIT 25 OFFSET ?',...args,offset);
      const items=[];for(const row of rows)items.push({...row,evidence:JSON.parse(row.evidence_json),stale:await stale(row),already_assigned:!!one('SELECT 1 FROM depictions WHERE media_id=? AND character_id=?',row.media_id,row.character_id),feedback:all('SELECT * FROM suggestion_feedback WHERE suggestion_id=? ORDER BY rowid',row.id)});
      json({items,total:one('SELECT COUNT(*) n FROM sorting_suggestions s JOIN active_media m ON m.id=s.media_id WHERE '+where,...args).n});return true;
    }
    if(p==='/api/suggestions/feedback'&&req.method==='POST'){
      const s=one('SELECT * FROM sorting_suggestions WHERE id=?',body.id);if(!s)throw fail('Suggestion not found',404);if(!['accepted','rejected','reopened'].includes(body.decision))throw fail('Choose accept, reject, or reopen');
      const verdict=value=>value===undefined?'unknown':value;if(![verdict(body.face_verdict),verdict(body.body_verdict)].every(v=>['unknown','matches','mismatch','uncertain'].includes(v)))throw fail('Invalid face or body review');if(typeof (body.notes??'')!=='string'||(body.notes||'').length>5000)throw fail('Keep feedback under 5,000 characters.');
      // Rejections can record a stale proposal; accepting/reopening must be current.
      if(body.decision!=='rejected'&&await stale(s))throw fail('The file or approved references changed. Generate fresh suggestions before accepting.',409);
      transaction(()=>{if(body.decision==='accepted'){if(!activeCharacter(s.character_id)||currentCanon(s.character_id)?.id!==s.canon_id)throw fail('Character canon changed. Generate fresh suggestions.',409);run('INSERT OR IGNORE INTO depictions VALUES(?,?)',s.media_id,s.character_id);}run('INSERT INTO suggestion_feedback VALUES(?,?,?,?,?,?,?)',randomUUID(),s.id,body.decision,body.notes||'',verdict(body.face_verdict),verdict(body.body_verdict),new Date().toISOString());});json({ok:true,assigned:body.decision==='accepted'});return true;
    }
    return false;
  }
  return {handle};
}
