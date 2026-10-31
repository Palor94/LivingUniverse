import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
export const equalSecret=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);};
export class OAuthError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export function createAuthorization({file,publicOrigin,privateOrigin,redirectHosts=['grok.com'],clock=()=>Date.now(),secureCookies=true}){
  const resource=publicOrigin+'/mcp',scope='living-universe';
  let state={clients:{},flows:{},codes:{},tokens:{},refresh:{}};
  try{state=JSON.parse(readFileSync(file,'utf8'));for(const key of ['clients','flows','codes','tokens','refresh'])if(!state[key]||typeof state[key]!=='object')throw Error();}catch(error){if(error.code!=='ENOENT')throw Error('OAuth state is unreadable; refusing to reset authorization.');}
  function save(){
    for(const kind of ['flows','codes','tokens','refresh'])for(const [key,value] of Object.entries(state[kind]))if(value.expires<=clock())delete state[kind][key];
    mkdirSync(path.dirname(file),{recursive:true});const next=file+'.next';writeFileSync(next,JSON.stringify(state),{mode:0o600});renameSync(next,file);
  }
  function client(id){if(typeof id!=='string'||!Object.hasOwn(state.clients,id))throw new OAuthError('invalid_client');return state.clients[id];}
  function redirect(uri){let url;try{url=new URL(uri);}catch{throw new OAuthError('invalid_redirect_uri');}if(url.protocol!=='https:'||url.username||url.password||url.hash||!redirectHosts.includes(url.hostname)||url.port)throw new OAuthError('invalid_redirect_uri');return url.href;}
  function flow(id){if(!/^[a-f0-9]{32}$/.test(id)||!Object.hasOwn(state.flows,id)||state.flows[id].expires<=clock())throw new OAuthError('expired_authorization',410);return state.flows[id];}
  const metadata={issuer:publicOrigin,authorization_endpoint:publicOrigin+'/oauth/authorize',token_endpoint:publicOrigin+'/oauth/token',registration_endpoint:publicOrigin+'/oauth/register',revocation_endpoint:publicOrigin+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:[scope]};
  function register(body){
    if(Object.keys(state.clients).length>=100)throw new OAuthError('registration_limit',429);
    if(!Array.isArray(body.redirect_uris)||!body.redirect_uris.length||body.redirect_uris.length>5||body.token_endpoint_auth_method&&body.token_endpoint_auth_method!=='none')throw new OAuthError('invalid_client_metadata');
    if(body.client_name!==undefined&&(typeof body.client_name!=='string'||body.client_name.length>120))throw new OAuthError('invalid_client_metadata');
    const callbacks=[],unusedLoopbacks=[];
    for(const uri of body.redirect_uris){
      try{callbacks.push(redirect(uri));}
      catch(error){
        let target;try{target=new URL(uri);}catch{throw error;}
        // Cursor registers an optional desktop loopback beside its cloud callback.
        // RFC 7591 3.2.1 permits returning restricted registration metadata. Keep
        // only the allowed HTTPS callback; localhost remains invalid at authorize.
        if(target.protocol==='http:'&&target.hostname==='localhost'&&target.port&&!target.username&&!target.password&&!target.hash)unusedLoopbacks.push(uri);
        else throw error;
      }
    }
    if(!callbacks.length||unusedLoopbacks.length&&!callbacks.some(uri=>new URL(uri).hostname==='www.cursor.com'))throw new OAuthError('invalid_redirect_uri');
    const id=randomUUID(),record={client_id:id,client_name:body.client_name||'Grok connector',redirect_uris:[...new Set(callbacks)],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],created:clock()};
    state.clients[id]=record;save();return record;
  }
  function authorize(params){
    const c=client(params.client_id),callback=redirect(params.redirect_uri);
    if(!c.redirect_uris.includes(callback)||params.response_type!=='code'||params.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''))throw new OAuthError('invalid_request');
    if(params.resource&&params.resource!==resource)throw new OAuthError('invalid_target');
    if(params.scope&&params.scope!==scope)throw new OAuthError('invalid_scope');
    if(typeof params.state!=='string'||params.state.length<8||params.state.length>2048)throw new OAuthError('invalid_state');
    if(Object.values(state.flows).filter(f=>f.expires>clock()).length>=100)throw new OAuthError('authorization_limit',429);
    const id=randomBytes(16).toString('hex'),cookie=secret();state.flows[id]={client_id:c.client_id,redirect_uri:callback,state:params.state,challenge:params.code_challenge,cookie_hash:hash(cookie),decision:'pending',expires:clock()+10*60*1000};save();
    return {location:privateOrigin+'/grok-connect/'+id,cookie:`lu_oauth_${id}=${cookie}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600${secureCookies?'; Secure':''}`};
  }
  function view(id){const f=flow(id),c=client(f.client_id);return {connection_id:id,client_name:c.client_name,redirect_uri:f.redirect_uri,decision:f.decision,expires_at:new Date(f.expires).toISOString(),access:'Read catalogue and approved references; perform text edits under existing local policy; import selected media. No canon approval, deletion or administrator-note editing.',continue_url:publicOrigin+'/oauth/continue?id='+id};}
  function decide(id,decision,actor){const f=flow(id);if(f.decision!=='pending'||!['approve','deny'].includes(decision)||typeof actor!=='string'||!actor)throw new OAuthError('invalid_decision',409);f.decision=decision;f.actor=actor;save();return view(id);}
  function continueFlow(id,cookieHeader){
    const f=flow(id),cookies=Object.fromEntries(String(cookieHeader||'').split(';').map(x=>x.trim().split('=')));
    if(!equalSecret(hash(cookies['lu_oauth_'+id]||''),f.cookie_hash))throw new OAuthError('authorization_browser_mismatch',403);
    if(!['approve','deny'].includes(f.decision))throw new OAuthError('approval_required',403);
    const target=new URL(f.redirect_uri);target.searchParams.set('state',f.state);
    if(f.decision==='deny')target.searchParams.set('error','access_denied');
    else{const code=secret();state.codes[hash(code)]={client_id:f.client_id,redirect_uri:f.redirect_uri,challenge:f.challenge,expires:clock()+5*60*1000};target.searchParams.set('code',code);}
    delete state.flows[id];save();return {location:target.href,cookie:`lu_oauth_${id}=; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=0${secureCookies?'; Secure':''}`};
  }
  function issue(clientId,grantId=randomUUID()){const access=secret(),refresh=secret();state.tokens[hash(access)]={client_id:clientId,grant_id:grantId,audience:resource,expires:clock()+60*60*1000};state.refresh[hash(refresh)]={client_id:clientId,grant_id:grantId,audience:resource,expires:clock()+30*24*60*60*1000};save();return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope};}
  function token(body){
    client(body.client_id);if(body.resource&&body.resource!==resource)throw new OAuthError('invalid_target');
    if(body.grant_type==='authorization_code'){
      const code=state.codes[hash(body.code||'')];
      if(!code||code.expires<=clock()||code.client_id!==body.client_id||code.redirect_uri!==body.redirect_uri||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier||'')||createHash('sha256').update(body.code_verifier).digest('base64url')!==code.challenge)throw new OAuthError('invalid_grant');
      delete state.codes[hash(body.code)];return issue(body.client_id);
    }
    if(body.grant_type==='refresh_token'){
      const refresh=state.refresh[hash(body.refresh_token||'')];if(!refresh||refresh.expires<=clock()||refresh.client_id!==body.client_id||refresh.audience!==resource)throw new OAuthError('invalid_grant');delete state.refresh[hash(body.refresh_token)];return issue(body.client_id,refresh.grant_id);
    }
    throw new OAuthError('unsupported_grant_type');
  }
  function authenticate(header){const value=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';const token=state.tokens[hash(value)];if(!token||token.expires<=clock()||token.audience!==resource)throw new OAuthError('invalid_token',401);return {client_id:token.client_id,scope};}
  function revoke(body){if(typeof body.token!=='string'||body.token.length>1000)throw new OAuthError('invalid_request');const h=hash(body.token),record=state.tokens[h]||state.refresh[h];if(record?.grant_id){for(const kind of ['tokens','refresh'])for(const [key,value] of Object.entries(state[kind]))if(value.grant_id===record.grant_id)delete state[kind][key];}else{delete state.tokens[h];delete state.refresh[h];}save();return {};}
  return {metadata,protectedResource:{resource,authorization_servers:[publicOrigin],scopes_supported:[scope],bearer_methods_supported:['header']},register,authorize,view,decide,continueFlow,token,authenticate,revoke};
}
