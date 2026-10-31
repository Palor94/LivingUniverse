// Small reusable inline creator. Browser drafts and a stable request UUID make
// retries safe without adding another database or a general administration API.
export function nameCreator({kind,storageKey,request,onCreated}){
  const character=kind==='character',title=character?'Új karakter hozzáadása':'Új helyszíncímke hozzáadása';
  const box=document.createElement('details');box.className='mobile-create';
  const summary=document.createElement('summary');summary.textContent=title;
  const label=document.createElement('label');label.textContent=character?'Új karakter neve':'Új helyszíncímke neve';
  const input=document.createElement('input');input.type='text';input.maxLength=character?200:100;input.autocomplete='off';label.append(input);
  const save=document.createElement('button');save.type='button';save.textContent=character?'Karakter létrehozása':'Helyszíncímke létrehozása';
  const status=document.createElement('p');status.setAttribute('role','status');box.append(summary,label);if(character){const hint=document.createElement('p');hint.textContent='A karakter nevével azonos OneDrive-mappa is létrejön. A meglévő mappa fájljai megmaradnak.';box.append(hint);}box.append(save,status);
  let draft=null;try{draft=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}input.value=draft?.value||'';if(input.value)status.textContent='Korábbi névpiszkozat visszatöltve.';
  function remember(){try{localStorage.setItem(storageKey,JSON.stringify(draft));return true;}catch{status.textContent='A névpiszkozat tárolása nem sikerült. Tartsd nyitva az oldalt.';return false;}}
  input.oninput=()=>{draft={...draft,value:input.value,request_id:draft?.request_id||crypto.randomUUID()};if(remember())status.textContent='Névpiszkozat megőrizve ezen az eszközön.';};
  save.onclick=()=>{const task=(async()=>{
    const name=input.value.trim();if(!name){status.textContent='Adj meg egy nevet.';input.focus();return false;}
    if(!draft||draft.sent_name&&draft.sent_name!==name)draft={value:input.value,request_id:crypto.randomUUID()};draft={...draft,value:input.value,sent_name:name};remember();save.disabled=true;input.disabled=true;status.textContent='Létrehozás…';
    try{const result=await request(name,draft.request_id);await onCreated(result);try{const stored=JSON.parse(localStorage.getItem(storageKey)||'null');if(stored?.request_id===draft.request_id)localStorage.removeItem(storageKey);}catch{}draft=null;input.value='';status.textContent='Létrehozva: '+result.name+(result.folder?' · OneDrive-mappa: '+result.folder:'');status.className='';box.open=false;return true;}
    catch(err){status.textContent='Nem sikerült létrehozni: '+err.message+' A név megmaradt; újrapróbálhatod.';status.className='error';return false;}
    finally{save.disabled=false;input.disabled=false;}
  })().finally(()=>{if(box.pending===task)box.pending=null;});box.pending=task;return task;};
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(!save.disabled)save.click();}};
  return box;
}
