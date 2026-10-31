// Static presentation only: this resource has no filesystem, network or tool-call API.
export const REFERENCE_VIEW_URI='ui://living-universe/reference-quality-v5.html';
// Existing conversations can retain a descriptor from an earlier refresh.
export const REFERENCE_VIEW_URIS=new Set([REFERENCE_VIEW_URI,'ui://living-universe/reference-original-v4.html','ui://living-universe/reference-preview-v1.html','ui://living-universe/reference-preview-v2.html','ui://living-universe/reference-preview-v3.html']);
export function mountReferencePreview(){
  const picture=document.getElementById('reference'),status=document.getElementById('status'),details=document.getElementById('details');
  let connected=false;
  const notify=(method,params={})=>window.parent.postMessage({jsonrpc:'2.0',method,params},'*');
  function render(result){
    if(!result)return;
    const meta=result._meta?.referencePreview||result.referencePreview,info=result.structuredContent?.image_info;
    const content=result.content?.find(item=>item.type==='image');
    const preview=content?{...meta,data:content.data,mimeType:content.mimeType}:meta?.data?meta:null;
    if(result.isError){picture.hidden=true;picture.removeAttribute('src');status.textContent='Reference unavailable. Check the tool error and retry when the original is available.';details.textContent='';return;}
    if(!preview){
      if(result.structuredContent){picture.hidden=true;picture.removeAttribute('src');status.textContent=info?.delivery==='chunks_required'?'Original exceeds inline transport size. Use original byte chunks or the private original download; no thumbnail was substituted.':'Approved references listed. Request one media ID with include_image: true to display a high-quality reference.';details.textContent='';}
      return;
    }
    // The one model-visible image is reused; never duplicate full base64 in _meta.
    // No remote URL, SVG, HTML, network request or tool invocation is accepted.
    const mime=preview.mimeType||'image/jpeg',prefix={'image/jpeg':'/9j/','image/png':'iVBORw0KGgo','image/gif':'R0lGOD','image/bmp':'Qk'}[mime];
    if(!prefix||typeof preview.data!=='string'||preview.data.length>8388608||preview.data.length%4||!preview.data.startsWith(prefix)||!/^[A-Za-z0-9+/]+={0,2}$/.test(preview.data)){
      picture.hidden=true;picture.removeAttribute('src');status.textContent='The image preview was invalid.';details.textContent='';return;
    }
    picture.src='data:'+mime+';base64,'+preview.data;picture.hidden=false;
    picture.alt='Approved character reference — '+String(preview.role||'general');
    status.textContent=(info?.representation==='original'||preview.representation==='original'?'Approved original reference · ':info?.representation==='reference'||info?.representation==='character_crop'||preview.representation==='reference'?'Approved high-quality reference · ':'Approved reference preview · ')+String(preview.role||'general');
    details.textContent='Original fingerprint verified · Canon revision '+String(preview.revision_id||'unknown')+(info?.sha256?' · Delivered SHA-256 '+info.sha256:'')+(info?.source?.sha256?' · Original SHA-256 '+info.source.sha256:'');
  }
  function compatibility(globals){
    const meta=globals?.toolResponseMetadata;
    render(meta?.mcp_tool_result||meta?.call_tool_result||meta);
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent)return;
    const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
    if(message.id===1&&!message.error){connected=true;notify('ui/notifications/initialized');}
    if(message.method==='ui/notifications/tool-result')render(message.params);
  });
  window.addEventListener('openai:set_globals',event=>compatibility(event.detail?.globals));
  compatibility(window.openai);
  window.parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'Living Universe reference',version:'2.1.0'},appCapabilities:{}}},'*');
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(connected)notify('ui/notifications/size-changed',{height:document.documentElement.scrollHeight});}).observe(document.body);
}
export const REFERENCE_VIEW_HTML=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approved character reference</title><style>
:root{color-scheme:light dark;font:14px system-ui,sans-serif}body{margin:0;padding:16px}figure{margin:0}img{display:block;max-width:100%;width:auto;height:auto;max-height:520px;margin:12px auto;border-radius:10px;object-fit:contain}img[hidden]{display:none}#status{font-weight:600}#details{font-size:12px;opacity:.7;overflow-wrap:anywhere;margin-top:10px}
</style></head><body><figure><figcaption id="status" role="status">Loading approved reference…</figcaption><img id="reference" hidden alt="Approved character reference"><div id="details"></div></figure><script>(${mountReferencePreview.toString()})();</script></body></html>`;
export const referenceViewResource={uri:REFERENCE_VIEW_URI,name:'Approved character reference',mimeType:'text/html;profile=mcp-app'};
export function readReferenceView(uri=REFERENCE_VIEW_URI){return {contents:[{uri,mimeType:referenceViewResource.mimeType,text:REFERENCE_VIEW_HTML,_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}},'openai/widgetPrefersBorder':true,'openai/widgetCSP':{connect_domains:[],resource_domains:[]}}}]};}
