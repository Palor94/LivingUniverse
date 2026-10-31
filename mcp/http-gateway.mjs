import http from 'node:http';
import {PassThrough} from 'node:stream';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthorization,equalSecret,OAuthError} from './oauth.mjs';
import {serve} from './server.mjs';
import {MAX_MCP_RESPONSE_BYTES} from './original-images.mjs';
import {createCatalogue} from './catalogue.mjs';
import {createWriteClient} from './writes.mjs';

export function createDispatcher({catalogue,refreshWriter}){
  return async request=>{
    const input=new PassThrough(),output=new PassThrough();let bytes=0,wire='';
    output.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_MCP_RESPONSE_BYTES+65536){input.destroy();throw Error('Response bound');}wire+=chunk;});
    const running=serve({catalogue,refreshWriter,input,output});
    const lines=[];if(request?.method!=='initialize')lines.push({jsonrpc:'2.0',id:'_gateway_initialize',method:'initialize',params:{protocolVersion:'2025-06-18'}});lines.push(request);
    input.end(lines.map(JSON.stringify).join('\n')+'\n');await running;
    return wire.trim().split('\n').filter(Boolean).map(JSON.parse).find(item=>item.id!=='_gateway_initialize')??null;
  };
}
export function createGateway({config,dispatch,authorization=null,clock=()=>Date.now(),secureCookies=true,onEvent=()=>{}}){
  const publicUrl=new URL(config.public_origin),privateUrl=new URL(config.private_origin);
  if(publicUrl.protocol!=='https:'||publicUrl.origin!==config.public_origin||privateUrl.protocol!=='https:'||privateUrl.origin!==config.private_origin||!privateUrl.hostname.endsWith('.ts.net')||!/^[a-f0-9]{64}$/.test(config.control_token))throw Error('Invalid gateway configuration.');
  const auth=authorization||createAuthorization({file:config.state_file,publicOrigin:config.public_origin,privateOrigin:config.private_origin,redirectHosts:config.redirect_hosts||['grok.com'],clock,secureCookies});
  let active=0,windowStart=clock(),requests=0;
  const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
  const server=http.createServer(async(req,res)=>{
    let operation='other',failure;
    const record=event=>{try{onEvent({time:new Date(clock()).toISOString(),...event});}catch{}};
    res.once('finish',()=>record({operation,status:res.statusCode,...(failure?{error:failure}:{})}));
    const json=(value,status=200,headers={})=>{res.writeHead(status,{...security,...headers,'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(active>=16){req.resume();return json({error:'server_busy'},429);}active++;
    try{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw new OAuthError('untrusted_peer',403);
      if(![publicUrl.host,'127.0.0.1:'+server.address().port].includes(req.headers.host))throw new OAuthError('untrusted_host',403);
      if(req.headers.origin&&req.headers.origin!==publicUrl.origin)throw new OAuthError('untrusted_origin',403);
      if(clock()-windowStart>60000){windowStart=clock();requests=0;}if(++requests>300)throw new OAuthError('rate_limited',429);
      const url=new URL(req.url,publicUrl),p=url.pathname;
      operation=['/healthz','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/oauth/authorize','/oauth/continue','/oauth/register','/oauth/token','/oauth/revoke','/mcp'].includes(p)?p:/^\/internal\/connections\/[a-f0-9]{32}$/.test(p)?'private_approval':'other';
      if(req.method==='GET'&&p==='/healthz')return json({ok:true});
      if(req.method==='GET'&&p==='/.well-known/oauth-authorization-server')return json(auth.metadata);
      if(req.method==='GET'&&(p==='/.well-known/oauth-protected-resource'||p==='/.well-known/oauth-protected-resource/mcp'))return json(auth.protectedResource);
      if(p==='/oauth/authorize'&&req.method==='GET'){
        const params=Object.fromEntries(url.searchParams);
        // Structural diagnostics only: never emit query values, codes, state, cookies or tokens.
        record({operation,phase:'request_shape',response_type_code:params.response_type==='code',s256:params.code_challenge_method==='S256',challenge_valid:/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''),state_length:typeof params.state==='string'?params.state.length:0,resource_present:!!params.resource,resource_matches:params.resource===config.public_origin+'/mcp',scope_present:!!params.scope,scope_matches:params.scope==='living-universe'});
        const result=auth.authorize(params);res.writeHead(302,{...security,Location:result.location,'Set-Cookie':result.cookie});return res.end();
      }
      if(p==='/oauth/continue'&&req.method==='GET'){const result=auth.continueFlow(url.searchParams.get('id'),req.headers.cookie);res.writeHead(302,{...security,Location:result.location,'Set-Cookie':result.cookie});return res.end();}
      const control=/^\/internal\/connections\/([a-f0-9]{32})$/.exec(p);
      if(control){if(!equalSecret(req.headers.authorization,'Bearer '+config.control_token))throw new OAuthError('invalid_control_authorization',403);}
      else if(p==='/mcp')auth.authenticate(req.headers.authorization);
      else if(!['/oauth/register','/oauth/token','/oauth/revoke'].includes(p))throw new OAuthError('not_found',404);
      if(control&&req.method==='GET')return json(auth.view(control[1]));
      if(req.method!=='POST')return json({error:'method_not_allowed'},405,{Allow:'POST'});
      const max=p==='/mcp'?1048576:16384;let size=0,chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>max)throw new OAuthError('request_too_large',413);chunks.push(chunk);}
      let body;const raw=Buffer.concat(chunks).toString('utf8'),type=String(req.headers['content-type']||'');
      try{if(/^application\/json(?:;|$)/i.test(type))body=JSON.parse(raw);else if(p.startsWith('/oauth/')&&/^application\/x-www-form-urlencoded(?:;|$)/i.test(type))body=Object.fromEntries(new URLSearchParams(raw));else throw Error();}catch{throw new OAuthError('invalid_request');}
      if(!body||Array.isArray(body)||typeof body!=='object')throw new OAuthError('invalid_request');
      if(control){if(Object.keys(body).some(k=>!['decision','actor'].includes(k)))throw new OAuthError('invalid_request');return json(auth.decide(control[1],body.decision,body.actor));}
      if(p==='/oauth/register'){
        // Host-only callback diagnostics help identify a new supported client without
        // retaining paths, query credentials, client names or other request content.
        if(Array.isArray(body.redirect_uris))record({operation,phase:'callback_hosts',callbacks:body.redirect_uris.slice(0,5).map(value=>{
          try{const target=new URL(value);return {scheme:target.protocol,host:/^[a-z0-9.-]{1,253}$/i.test(target.hostname)?target.hostname:'other',has_port:!!target.port};}catch{return {invalid_url:true};}
        })});
        return json(auth.register(body),201);
      }
      if(p==='/oauth/token')return json(auth.token(body));
      if(p==='/oauth/revoke')return json(auth.revoke(body));
      if(p==='/mcp'){
        const protocol=req.headers['mcp-protocol-version'];if(protocol&&!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(protocol))throw new OAuthError('unsupported_protocol');
        const result=await dispatch(body);if(!result){res.writeHead(202,security);return res.end();}return json(result);
      }
    }catch(error){failure=error instanceof OAuthError?error.code:'request_failed';if(!res.headersSent)json({error:failure},error.status||500,error.status===401?{'WWW-Authenticate':`Bearer resource_metadata="${config.public_origin}/.well-known/oauth-protected-resource"`}:{});}
    finally{active--;if(!req.complete)req.resume();}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;
  return {server,authorization:auth};
}
export async function startGateway({configFile=process.env.LU_GROK_CONFIG,mcpConfigFile=process.env.LU_MCP_CONFIG}={}){
  const local=process.env.LOCALAPPDATA||'';
  const mcpFile=mcpConfigFile||path.join(local,'LivingUniverse','mcp-config.json'),mcp=JSON.parse(await readFile(mcpFile,'utf8'));
  const file=configFile||path.join(path.dirname(mcp.database),'grok-gateway.json');
  const config=JSON.parse(await readFile(file,'utf8'));if(config.enabled!==true)throw Error('Gateway disabled.');
  const catalogue=await createCatalogue({database:mcp.database,mediaRoot:mcp.mediaRoot,allowAdminNotes:false});
  const refreshWriter=async()=>{const latest=JSON.parse(await readFile(mcpFile,'utf8'));if(path.resolve(latest.database)!==path.resolve(mcp.database))throw Error('Catalogue changed.');return createWriteClient({...mcp,writeConfig:latest.writeConfig});};
  const gateway=createGateway({config,dispatch:createDispatcher({catalogue,refreshWriter}),onEvent:event=>console.log('GATEWAY_EVENT '+JSON.stringify(event))});
  const port=config.port??4320;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid gateway port.');
  await new Promise((resolve,reject)=>{gateway.server.once('error',reject);gateway.server.listen(port,'127.0.0.1',resolve);});
  return {...gateway,close:()=>new Promise(resolve=>gateway.server.close(()=>{catalogue.close();resolve();}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const gateway=await startGateway();console.log('Living Universe Grok gateway ready on loopback. Public exposure is configured separately.');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await gateway.close();process.exit(0);});}
  catch{console.error('GROK_GATEWAY_UNAVAILABLE: Check the protected local configuration and existing catalogue. No database was created.');process.exitCode=1;}
}
