// Polling observes durable runs. It can never prepare, approve, execute or retry one.
export function createGenerationWatcher({read,onUpdate=()=>{},onComplete=()=>{},onError=()=>{},schedule=setTimeout,unschedule=clearTimeout}){
  const states=new Map();let initialized=false,timer=null,reading=null,stopped=false;
  const active=status=>['running','generated'].includes(status);
  async function poll(){
    if(stopped)return;if(reading)return reading;unschedule(timer);
    reading=(async()=>{try{const {jobs}=await read();if(stopped)return;const list=Array.isArray(jobs)?jobs:[];
      for(const job of list){if(initialized&&job.status==='succeeded'&&job.output?.active&&states.get(job.run_id)!=='succeeded')onComplete(job);states.set(job.run_id,job.status);}
      initialized=true;onUpdate(list);timer=schedule(()=>void poll(),list.some(job=>active(job.status))?3000:30000);
    }catch(error){onError(error);if(!stopped)timer=schedule(()=>void poll(),30000);}finally{reading=null;}})();return reading;
  }
  return {poll,start:poll,stop(){stopped=true;unschedule(timer);},resume(){stopped=false;return poll();}};
}
