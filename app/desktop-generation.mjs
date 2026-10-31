import {randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {GenerationError} from './image-providers.mjs';

// Desktop-only creator controls. MCP callers retain their separate bearer routes.
export function installDesktopGeneration({imageGeneration,one,all}){
  const csrf=randomBytes(32).toString('hex');
  const fail=(code,message,status=400)=>{throw new GenerationError(code,message,status);};
  const shape=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))fail('INVALID_ARGUMENT','Unexpected generation fields.');};
  function view(cid,rid){const plan=imageGeneration.view(rid);if(plan.manifest.provider!=='sogni'||!plan.manifest.characters.some(c=>c.character_id===cid))fail('NOT_FOUND','Generation not found for this character.',404);return plan;}
  function context(cid){
    let capabilities;try{capabilities=imageGeneration.capabilities();}catch(error){if(error.code!=='GENERATION_DISABLED')throw error;capabilities={enabled:false,providers:[]};}
    const canon=one('SELECT * FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
    const references=canon?JSON.parse(canon.references_json).map(ref=>{
      const media=one('SELECT relative_path,kind FROM active_media WHERE id=?',ref.media_id);
      const supported=!!media&&['.png','.jpg','.jpeg'].includes(path.extname(media.relative_path).toLowerCase());
      return {...ref,name:media?path.basename(media.relative_path):'Unavailable reference',available:!!media&&media.kind==='image'&&supported&&/^[a-f0-9]{64}$/.test(ref.sha256||''),unavailable_reason:media&&!supported?'Ehhez a kapcsolathoz PNG vagy JPEG referencia szükséges.':null};
    }):[];
    const runs=(capabilities.enabled?all("SELECT r.id FROM image_generation_runs r WHERE json_extract(r.manifest_json,'$.provider')='sogni' AND EXISTS(SELECT 1 FROM json_each(json_extract(r.manifest_json,'$.characters')) c WHERE json_extract(c.value,'$.character_id')=?) ORDER BY r.rowid DESC LIMIT 30",cid):[]).map(row=>{
      const plan=view(cid,row.id);return {run_id:plan.run_id,status:plan.status,created_at:plan.created_at,prompt:plan.manifest.prompt,provider:plan.manifest.provider,model:plan.manifest.model,output:plan.output};
    });
    return {csrf,...capabilities,canon:canon?{revision_id:canon.id,appearance:canon.appearance,references}:null,runs};
  }
  return {async handle({p,body,req,json}){
    const match=p.match(/^\/api\/characters\/([a-f0-9-]{36})\/generation(?:\/([a-f0-9-]{36})(?:\/(decision|execute))?)?$/i);if(!match)return false;
    try{
      const [,cid,rid,operation]=match;
      if(!one('SELECT c.id FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',cid))fail('NOT_FOUND','Character not found.',404);
      if(req.method==='GET'&&!operation){json(rid?view(cid,rid):context(cid));return true;}
      if(req.method!=='POST')fail('METHOD_NOT_ALLOWED','Use a supported generation action.',405);
      const supplied=req.headers['x-lu-generation-csrf'];
      if(req.headers.origin!=='http://'+req.headers.host||typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(csrf)))fail('FORBIDDEN','Reload the generation panel before making this change.',403);
      if(!rid){
        shape(body,['request_key','prompt','size','revision_id','reference_ids']);
        json(await imageGeneration.prepare({request_key:body.request_key,provider:'sogni',prompt:body.prompt,size:body.size,characters:[{character_id:cid,revision_id:body.revision_id,reference_ids:body.reference_ids}]}));return true;
      }
      const plan=view(cid,rid);
      if(operation==='decision'){json(await imageGeneration.decide(rid,body,'local-creator'));return true;}
      if(operation==='execute'){
        shape(body,['manifest_hash']);if(body.manifest_hash!==plan.manifest_hash)fail('STALE_PLAN','Review the exact stored plan before starting.',409);
        json(await imageGeneration.execute(rid));return true;
      }
      fail('INVALID_ARGUMENT','Choose a supported generation action.');
    }catch(error){json({code:error.code||'GENERATION_UNAVAILABLE',error:error.status?error.message:'Generation could not be processed.'},error.status||500);return true;}
  }};
}
