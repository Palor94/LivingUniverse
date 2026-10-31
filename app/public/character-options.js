export const races=[
  ['human','Human'],['orc','Orcs'],['goblin','Goblins'],['troll','Trolls'],
  ['minotaur','Minotaurs'],['centaur','Centaurs'],['satyr_faun','Satyrs and Fauns'],
  ['werewolf','Werewolves'],['lizardfolk_dragonborn','Lizardfolk and Dragonborn'],
  ['dwarf','Dwarves'],['ogre','Ogres'],['bearfolk_bullfolk','Bearfolk and Bullfolk']
];
export function raceOptions(selected='human'){
  return races.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
export function bindNameSuggestion({input,button,status,api,createButton}){
  const seen=new Set();let revision=0;
  input.addEventListener('input',()=>revision++);
  button.onclick=async()=>{
    if(button.disabled)return;
    const before=input.value,version=revision;
    button.disabled=true;if(createButton)createButton.disabled=true;
    status.className='muted';status.textContent='Finding an unused male name…';
    try{
      const result=await api('/api/character-name-suggestion',{exclude:[...seen,before]});
      if(!input.isConnected||!button.isConnected)return;
      if(result.name)seen.add(result.name);
      if(revision!==version||input.value!==before){status.textContent='Your manual edit was kept. Click Suggest name for another suggestion.';return;}
      if(result.name){input.value=result.name;input.dispatchEvent(new Event('input',{bubbles:true}));}
      status.textContent=result.message;
    }catch(error){if(status.isConnected){status.className='error';status.textContent=error.message;}}
    finally{button.disabled=false;if(createButton)createButton.disabled=false;}
  };
}
