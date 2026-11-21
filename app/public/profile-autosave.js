// Serialized autosave. An unconfirmed/failed write blocks automatic retries until
// the caller explicitly reconciles the saved state.
export function createProfileAutosave({snapshot,write,onSaved,onError=()=>{},onStatus=()=>{},delay=650}){
  let timer=null,pending=null,blocked=null,stopped=false;
  const cancel=()=>{clearTimeout(timer);timer=null;};
  function run(){
    cancel();if(pending)return pending;if(blocked)return Promise.reject(blocked);if(stopped)return Promise.resolve();
    const body=snapshot();if(!body)return Promise.resolve();const sent=structuredClone(body);onStatus('saving');
    pending=(async()=>{try{const result=await write(sent);await onSaved(result,sent);onStatus('saved');return result;}
      catch(error){blocked=error;onError(error,sent);onStatus('error',error);throw error;}
      finally{pending=null;if(!blocked&&!stopped&&snapshot())schedule();}})();return pending;
  }
  function schedule(){cancel();if(stopped||blocked)return;onStatus('pending');timer=setTimeout(()=>{timer=null;void run().catch(()=>{});},delay);}
  async function flush(){cancel();if(blocked)throw blocked;if(stopped)return;await run();if(snapshot())await flush();}
  return {schedule,flush,cancel,settle:async()=>{cancel();if(pending)await pending;},stop:()=>{cancel();stopped=true;},pause:error=>{cancel();blocked=error;onStatus('error',error);},resume:()=>{blocked=null;onStatus('saved');},get error(){return blocked;},get saving(){return !!pending;}};
}
