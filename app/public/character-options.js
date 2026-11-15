import {t,translateServerMessage} from './i18n.js';
// Stored race keys stay English; the second entry is only the displayed label.
export const races=['human','orc','goblin','troll','minotaur','centaur','satyr_faun','werewolf','lizardfolk_dragonborn','dwarf','ogre','bearfolk_bullfolk'].map(key=>[key,t('race.'+key)]);
export function raceOptions(selected='human'){
  return races.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
export function bindNameSuggestion({input,button,status,api,createButton,raceInput}){
  const seen=new Set();let revision=0,requestId=0;
  input.addEventListener('input',()=>revision++);
  async function suggest(){
    const request=++requestId,before=input.value,version=revision,race=raceInput?.value||'human';
    button.disabled=true;if(createButton)createButton.disabled=true;
    status.className='muted';status.textContent=race==='human'?t('names.findingHuman'):t('names.findingFantasy');
    try{
      const result=await api('/api/character-name-suggestion',{race,exclude:[...seen,before]});
      if(request!==requestId||!input.isConnected||!button.isConnected)return;
      if(result.name)seen.add(result.name);
      if(revision!==version||input.value!==before){status.textContent=t('names.editKept');return;}
      if(result.name){input.value=result.name;input.dispatchEvent(new Event('input',{bubbles:true}));}
      status.textContent=translateServerMessage(result.message);
    }catch(error){if(request===requestId&&status.isConnected){status.className='error';status.textContent=error.message;}}
    finally{if(request===requestId){button.disabled=false;if(createButton)createButton.disabled=false;}}
  }
  button.onclick=()=>{if(!button.disabled)return suggest();};
  // Race changes start immediately and supersede any earlier suggestion request.
  raceInput?.addEventListener('change',()=>{suggest();});
}
