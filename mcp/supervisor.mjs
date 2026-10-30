export async function supervise({run,wait,record,shouldRun=()=>true}){
  while(shouldRun()){
    try{record('CLIENT_EXIT '+await run()+'\n');}
    catch(error){record('CLIENT_START_FAILED: '+error.name+' '+(error.code||'')+' '+error.message+'\n');}
    if(shouldRun()){record('RETRY_IN_60_SECONDS\n');await wait(60000);}
  }
}
