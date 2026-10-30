export const searchKey=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
export function remainingMatches(items,query){const q=searchKey(query);return q?items.filter(item=>!item.checked&&searchKey(item.search||item.name).includes(q)):[];}
export function selectedOrder(items,primaryId){return items.filter(i=>i.checked).sort((a,b)=>Number(a.id===primaryId)-Number(b.id===primaryId));}

function tokenPicker({form,panel,list,id,placeholder,getItems,onChange,primaryId}){
  const box=document.createElement('div');box.className='sorting-token-search';
  const chips=document.createElement('div');chips.className='sorting-chips';const input=document.createElement('input');input.id=id;input.type='search';input.autocomplete='off';input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);
  const status=document.createElement('span');status.className='sr-only';status.setAttribute('aria-live','polite');box.append(chips,input,status);panel.prepend(box);
  let timer=null,composing=false;
  function render(){const items=getItems(),q=searchKey(input.value);chips.replaceChildren();for(const item of selectedOrder(items,primaryId)){
      const chip=document.createElement('button');chip.type='button';chip.className='sorting-chip';chip.textContent=item.name+' ×';chip.setAttribute('aria-label','Remove '+item.name);chip.onclick=()=>{item.input.checked=false;onChange?.();render();input.focus();};chips.append(chip);
    }for(const item of items)item.label.hidden=!!q&&(item.checked||!searchKey(item.search||item.name).includes(q));status.textContent=items.filter(i=>i.checked).length+' selected';
  }
  function choose(item){if(!form.isConnected)return;item.input.checked=true;input.value='';onChange?.();render();}
  input.oninput=()=>{clearTimeout(timer);render();if(!composing&&searchKey(input.value))timer=setTimeout(()=>{const matches=remainingMatches(getItems(),input.value);if(matches.length===1)choose(matches[0]);},180);};
  input.oncompositionstart=()=>{composing=true;clearTimeout(timer);};input.oncompositionend=()=>{composing=false;input.oninput();};
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);const matches=remainingMatches(getItems(),input.value);if(matches.length===1)choose(matches[0]);}else if(e.key==='Escape'){e.preventDefault();input.value='';render();}};
  list.addEventListener('change',()=>{onChange?.();render();});
  const observer=new MutationObserver(render);observer.observe(list,{childList:true,subtree:true});
  const lifecycle=new MutationObserver(()=>{if(!form.isConnected){clearTimeout(timer);observer.disconnect();lifecycle.disconnect();}});lifecycle.observe(document.querySelector('#dialog'),{childList:true,subtree:true});render();return {render,input};
}

export function installSortingPickers({form,m,getState}){
  const list=form.querySelector('.checks'),locationChoice=form.querySelector('.location-choice'),select=form.querySelector('#media-location-place');if(!list||!select)return;
  const grid=document.createElement('div');grid.className='sorting-picker-columns';form.prepend(grid);
  const characterPanel=document.createElement('section'),locationPanel=document.createElement('section');characterPanel.className='sorting-picker-panel character-panel';locationPanel.className='sorting-picker-panel location-panel';grid.append(characterPanel,locationPanel);
  const title=document.createElement('h3');title.textContent='Who appears here?';const oldLabel=list.previousElementSibling;if(oldLabel?.tagName==='LABEL')oldLabel.remove();const creator=form.querySelector('.inline-character-create');characterPanel.append(title);if(creator)characterPanel.append(creator);characterPanel.append(list);list.classList.add('vertical-picker');
  tokenPicker({form,panel:characterPanel,list,id:'quick-character-search',placeholder:'Quick character search…',primaryId:getState().protagonist?.id||getState().characters.find(c=>searchKey(c.name)==='palor')?.id,getItems:()=>[...list.querySelectorAll('label')].map(label=>{const input=label.querySelector('input[name="character"]'),c=getState().characters.find(c=>c.id===input?.value);return {id:input?.value,name:c?.name||label.textContent.trim(),search:label.textContent+' '+(c?.aliases||''),checked:input?.checked,input,label};}).filter(i=>i.input)});
  const heading=document.createElement('h3');heading.textContent='Where is this?';locationPanel.append(heading);
  const choices=document.createElement('div');choices.className='vertical-picker location-picker-list';
  const selected=new Set((m.locations?.length?m.locations:m.location?[m.location]:[]).map(p=>p.id));
  const marker=document.createElement('input');marker.type='hidden';marker.name='location_multi';marker.value='1';
  const unspecified=document.createElement('label'),flag=document.createElement('input');flag.type='checkbox';flag.name='location_reference';flag.checked=!!m.location_reference;unspecified.className='location-unspecified';unspecified.append(flag,document.createTextNode('Location reference'));
  const oldLabelLocation=select.closest('label');oldLabelLocation.hidden=true;const locationCreator=locationChoice.querySelector('.location-create');if(locationCreator)locationPanel.append(locationCreator);locationPanel.append(choices,unspecified,marker,locationChoice);
  for(const small of locationChoice.querySelectorAll(':scope > small'))small.hidden=true;
  let picker,primary=select.value;
  function sync(){selected.clear();for(const check of choices.querySelectorAll('input:checked'))selected.add(check.value);if(selected.size)flag.checked=true;primary=selected.has(primary)?primary:[...selected][0];select.value=primary||(flag.checked?'__unspecified__':'');select.dispatchEvent(new Event('change'));}
  function rebuild(){const incoming=select.value;if(incoming&&incoming!=='__unspecified__')selected.add(incoming);choices.replaceChildren();for(const option of select.options){if(!option.value||option.value==='__unspecified__')continue;const label=document.createElement('label'),check=document.createElement('input');label.dataset.search=option.dataset.search||option.textContent;check.type='checkbox';check.name='location_ids';check.value=option.value;check.checked=selected.has(option.value);label.append(check,document.createTextNode(option.textContent.replace(/ · tag$/,'')));choices.append(label);}if(selected.size)flag.checked=true;primary=selected.has(primary)?primary:[...selected][0];select.value=primary||(flag.checked?'__unspecified__':'');picker?.render();}
  rebuild();picker=tokenPicker({form,panel:locationPanel,list:choices,id:'quick-location-search',placeholder:'Quick location search…',onChange:sync,getItems:()=>[...choices.querySelectorAll('label')].map(label=>{const input=label.querySelector('input');return{id:input.value,name:label.textContent,search:label.dataset.search,checked:input.checked,input,label};})});
  flag.onchange=()=>{if(!flag.checked){for(const input of choices.querySelectorAll('input'))input.checked=false;selected.clear();}sync();picker.render();};
  const optionsObserver=new MutationObserver(rebuild);optionsObserver.observe(select,{childList:true,subtree:true});const lifecycle=new MutationObserver(()=>{if(!form.isConnected){optionsObserver.disconnect();lifecycle.disconnect();}});lifecycle.observe(document.querySelector('#dialog'),{childList:true,subtree:true});
  form._sortingPickers=true;
}
