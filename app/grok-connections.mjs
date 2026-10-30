import {equalSecret} from '../mcp/oauth.mjs';

export function createGrokConnections(config,mobile){
  if(config?.enabled!==true)return null;
  if(config.private_origin!==mobile?.origin||!/^[a-f0-9]{64}$/.test(config.control_token)||!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw Error('Invalid private gateway approval configuration.');
  const base='http://127.0.0.1:'+config.port;
  async function request(id,decision,actor){
    if(!/^[a-f0-9]{32}$/.test(id))throw Object.assign(Error('Invalid connection ID.'),{status:400});
    const response=await fetch(base+'/internal/connections/'+id,{method:decision?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+config.control_token,...(decision?{'Content-Type':'application/json'}:{})},...(decision?{body:JSON.stringify({decision,actor})}:{})});
    const text=await response.text();if(text.length>16384)throw Error('Invalid gateway response.');const result=JSON.parse(text);
    if(!response.ok)throw Object.assign(Error('Connection approval is unavailable or expired. Start connecting again from Grok.'),{status:response.status});return result;
  }
  return {view:id=>request(id),decide:(id,body,actor)=>{if(!body||Object.keys(body).some(k=>k!=='decision')||!['approve','deny'].includes(body.decision)||!equalSecret(actor,mobile.login.toLowerCase()))throw Object.assign(Error('Invalid connection approval.'),{status:403});return request(id,body.decision,actor);}};
}
