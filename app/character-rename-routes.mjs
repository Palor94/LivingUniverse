export function createRenameRoutes({rename,authenticate,privateOrigin,approvalMode}){
  const error=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
  return {async handle({p,req,body,json,url}){
    const service=p==='/api/mcp-rename',match=p.match(/^\/api\/character-renames(?:\/([a-f0-9-]{36})(?:\/(decision|undo))?)?$/i);
    if(!service&&!match)return false;
    try{
      if(service){
        authenticate(req.headers.authorization);
        if(req.method!=='POST'||!body||Object.keys(body).some(k=>!['operation','arguments'].includes(k)))error('Használj névhez kötött műveletet.',400);
        const args=body.arguments;if(!args||typeof args!=='object'||Array.isArray(args))error('Hiányzó argumentumok.',400);
        let result;
        if(body.operation==='capabilities'){if(Object.keys(args).length)error('Váratlan argumentum.',400);result={enabled:true,version:2,human_approval_required:approvalMode!=='trusted',includes_character_folder:true};}
        else if(body.operation==='prepare'||body.operation==='undo'){
          const {preview_only=false,...argumentsOnly}=args;if(typeof preview_only!=='boolean')error('Érvénytelen előnézeti kapcsoló.',400);
          result=await (body.operation==='prepare'?rename.prepare(argumentsOnly):rename.prepareUndo(argumentsOnly));
          if(approvalMode==='trusted'&&!preview_only){try{result=await rename.applyApproved({plan_id:result.plan_id,plan_hash:result.plan_hash},'mcp-trusted');}catch(e){if(e.code!=='AMBIGUOUS_MATCH')throw e;result={...result,requires_selection:true,warning:e.message};}}
        }
        else if(body.operation==='get')result=rename.get(args);
        else if(body.operation==='apply')result=await rename.applyApproved(args,approvalMode==='trusted'?'mcp-trusted':null);
        else error('Ismeretlen átnevezési művelet.',400);
        json({...result,...(result.review_path?{approval_url:privateOrigin+result.review_path}:{})});return true;
      }
      if(req.method==='GET'){
        if(match[1])json(rename.get({plan_id:match[1],offset:Number(url.searchParams.get('offset')||0),limit:100},true));
        else json({...rename.context(),history:url.searchParams.has('character_id')?rename.history(url.searchParams.get('character_id')):[]});return true;
      }
      if(req.method!=='PUT'||req.headers.origin!=='http://'+req.headers.host||req.headers['x-lu-rename-csrf']!==rename.csrf)error('Töltsd újra az átnevezési oldalt a mentéshez.');
      if(!match[1])json(await rename.prepare(body));
      else if(match[2]==='decision')json(await rename.decide(match[1],body,'local-creator'));
      else if(match[2]==='undo')json(await rename.prepareUndo({...body,plan_id:match[1]}));
      else error('Nem támogatott művelet.',405);
    }catch(e){json({code:e.code||'RENAME_REJECTED',error:e.status?e.message:'Az átnevezés nem sikerült.'},e.status||500);}return true;
  }};
}
