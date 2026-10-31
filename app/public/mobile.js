import {installGhostProfile} from './ghost-profile.js';
import {installLocationEditor} from './location-editor.js';
import {initMobileSorting} from './mobile-sorting.js';
import {nameCreator} from './mobile-create.js';
const $=s=>document.querySelector(s);
let session,characters=[],records=[],epoch=0;
const ghostEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ghostProfile=installGhostProfile({$:(s,root=document)=>root.querySelector(s),esc:ghostEsc,api:(url,body,method)=>api(url,body,method||(body?'POST':'GET')),action:fn=>async e=>{try{await fn(e);}catch(error){message(error.message,true);}},toast:text=>message(text)});
const alphabet='a á b c cs d dz dzs e é f g gy h i í j k l ly m n ny o ó ö ő p q r s sz t ty u ú ü ű v w x y z zs'.split(' ');
function compare(a,b){const letters=s=>s.normalize('NFC').toLocaleLowerCase('hu').match(/dzs|cs|dz|gy|ly|ny|sz|ty|zs|./gu)||[];const l=letters(a),r=letters(b),rank=c=>alphabet.includes(c)?alphabet.indexOf(c):100+c.codePointAt(0);for(let i=0;i<Math.min(l.length,r.length);i++){const d=rank(l[i])-rank(r[i]);if(d)return d;}return l.length-r.length;}
function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function message(text,error=false){$('#connection').textContent=text;$('#connection').className=error?'error':'';}
async function api(route,body,method='GET'){
  const res=await fetch(route,{method,cache:'no-store',headers:body?{'Content-Type':'application/json','X-LU-CSRF':session.csrf}:{},body:body?JSON.stringify(body):undefined});
  const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'Unable to connect.'),{status:res.status});return data;
}
function draftKey(id,key){return 'lu-mobile-v1:'+session.login+':'+id+':'+key;}
function readDraft(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function remember(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));return true;}catch{message('Browser draft storage is unavailable. Keep this page open and use Save while connected.',true);return false;}}
function field({id,key,title,current,max=30000,send,latest,relationship=false}){
  const keyStorage=draftKey(id,key),saved=readDraft(keyStorage),section=node('section');section.className='field';
  const label=node('label',title),input=node('textarea'),status=node('p'),save=node('button','Save this field');input.maxLength=max;input.value=saved?.value??current??'';label.append(input);status.setAttribute('role','status');section.append(label,status,save);
  let baseline=saved&&Object.hasOwn(saved,'expected')?saved.expected:current,busy=false,blocked=false,timer=null,conflict=null,storageOK=true,disposed=false;
  const record={dirty:()=>input.value!==(baseline??''),save:()=>saveField(true),dispose:()=>{disposed=true;clearTimeout(timer);}};records.push(record);section._record=record;
  function persist(){storageOK=remember(keyStorage,record.dirty()?{value:input.value,expected:baseline}:null);return storageOK;}
  function show(text,error=false){status.textContent=text;status.className=error?'error':text==='Saved'?'saved':'';}
  function showConflict(serverValue){
    blocked=true;clearTimeout(timer);conflict?.remove();conflict=node('div');conflict.className='conflict';
    const text=node('pre',serverValue??'(No relationship saved)'),useServer=node('button','Use latest saved text'),keep=node('button','Keep my draft & save');
    conflict.append(node('strong','This text changed on another device.'),node('p','Latest saved version:'),text,useServer,keep);section.append(conflict);show('Your draft is kept below the same field until you choose a version.',true);
    useServer.onclick=()=>{baseline=serverValue;input.value=serverValue??'';blocked=false;conflict.remove();persist();show('Saved');};
    keep.onclick=()=>{baseline=serverValue;blocked=false;conflict.remove();persist();saveField(true);};
  }
  async function saveField(explicit=false){
    clearTimeout(timer);if(disposed||busy||blocked||!record.dirty())return;
    const value=input.value;
    if(relationship&&!value&&baseline){if(!explicit){show('Draft retained. Use Save this field to confirm removing this relationship.');return;}if(!confirm('Remove this relationship?'))return;}
    busy=true;save.disabled=true;show('Saving…');let succeeded=false;
    try{
      await send(value,baseline);baseline=relationship?(value||null):value;succeeded=true;
      const stored=readDraft(keyStorage);if(stored?.value===value)remember(keyStorage,null);
      if(record.dirty()){persist();show('Newer draft awaiting save.');}else show('Saved');
    }catch(err){
      persist();show(err.status===409?err.message:'Not saved · '+err.message,true);
      if(err.status===409){try{showConflict(await latest());}catch{show('Could not load the latest version. Draft retained; reconnect and reopen this character.',true);}}
    }finally{busy=false;save.disabled=false;if(succeeded&&!disposed&&record.dirty()&&!blocked)timer=setTimeout(()=>saveField(),700);}
  }
  input.oninput=()=>{persist();show(storageOK?'Draft kept on this device · waiting to save':'Draft storage unavailable · save while connected',!storageOK);clearTimeout(timer);timer=setTimeout(()=>saveField(),900);};
  input.onblur=()=>{if(record.dirty()&&!blocked)saveField();};save.onclick=()=>saveField(true);
  if(saved&&saved.value!==(current??'')&&baseline!==current)showConflict(current);
  else if(saved&&saved.value===(current??'')){baseline=current;remember(keyStorage,null);show('Saved');}
  else show(saved?'Recovered draft · not yet saved to laptop':'Saved');
  return section;
}
async function openCharacter(id){
  const request=++epoch;message('Loading character…');
  try{
    const c=await api('/api/characters/'+encodeURIComponent(id));if(request!==epoch)return;
    for(const record of records)record.dispose();records=[];const editor=$('#editor');editor.replaceChildren(node('h2',c.name));editor.append(node('h3','Profil és alapadatok'));
    for(const b of $('#characters').children)b.setAttribute('aria-current',String(b.dataset.id===id));
    const specs=[['aliases','Aliases',1000],['biography','Biography',30000],['appearance','Appearance · working notes',30000],['personality','Personality',30000],['speech_style','Speech style & dialogue examples',30000],['sexuality','Sexuality',30000],['notes','Private administrator notes',30000]];
    for(const [key,title,max] of specs)editor.append(field({id,key,title,max,current:c[key],send:(value,expected)=>api('/api/characters/'+encodeURIComponent(id)+'/fields',{fields:{[key]:value},expected:{[key]:expected}},'PATCH'),latest:async()=>(await api('/api/characters/'+encodeURIComponent(id)))[key]}));
    editor.append(node('h3','Relationships'));
    const picker=node('label','Relationship towards'),select=node('select'),area=node('div');picker.className='relationship-picker';
    const other=characters.filter(x=>x.id!==id),primary=other.find(x=>x.name.toLocaleLowerCase('hu')==='palor');
    for(const item of other){const option=node('option',item.name);option.value=item.id;select.append(option);}if(primary)select.value=primary.id;
    picker.append(select);editor.append(picker,area);
    function relationship(){
      const previous=area.firstElementChild?._record;previous?.dispose();records=records.filter(record=>record!==previous);
      const target=select.value;if(!target){area.replaceChildren(node('p','Add another character from the desktop application first.'));return;}
      const existing=c.relationships.find(r=>r.target_id===target)?.description??null;
      area.replaceChildren(field({id,key:'relationship:'+target,title:'Relationship towards '+select.selectedOptions[0].textContent,max:10000,current:existing,relationship:true,
        send:async(value,expected)=>{const updated=await api('/api/relationships/'+encodeURIComponent(id)+'/'+encodeURIComponent(target),{description:value,expected},'PUT');c.relationships=updated.relationships;},
        latest:async()=>(await api('/api/characters/'+encodeURIComponent(id))).relationships.find(r=>r.target_id===target)?.description??null}));
    }
    select.onchange=relationship;relationship();const structured=node('div');structured.id='structured-profile';editor.append(structured);await ghostProfile.render(c,null,structured);if(request!==epoch)return;message('Connected · edits save to your laptop. Names are managed on the desktop.');
  }catch(err){if(request===epoch)message('Connection unavailable · '+err.message+'. Existing drafts are retained on this device.',true);}
}
async function openTemplateCharacter(){++epoch;for(const record of records)record.dispose();records=[];const editor=$('#editor');editor.replaceChildren();try{await ghostProfile.renderTemplate(editor,()=>{editor.replaceChildren(node('p','Válassz karaktert a listából.'));});}catch(error){message(error.message,true);}}
function list(){const query=$('#search').value.toLocaleLowerCase('hu');$('#characters').replaceChildren();for(const c of characters.filter(c=>(c.name+' '+c.aliases).toLocaleLowerCase('hu').includes(query))){const button=node('button',c.name);button.dataset.id=c.id;button.onclick=()=>openCharacter(c.id);$('#characters').append(button);}}
$('#search').oninput=list;
$('#save-all').onclick=async()=>{for(const record of records)if(record.dirty())await record.save();if(records.some(r=>r.dirty()))message('Some drafts still need saving or conflict review.',true);else message('All displayed edits are saved to your laptop.');};
window.addEventListener('offline',()=>message('Offline · drafts stay on this device. Save after reconnecting.',true));
window.addEventListener('online',()=>message('Network available · use Save drafts to retry pending edits.'));
window.addEventListener('beforeunload',e=>{if(records.some(r=>r.dirty())){e.preventDefault();e.returnValue='';}});
try{session=await api('/api/session');characters=(await api('/api/characters')).characters.sort((a,b)=>compare(a.name,b.name));list();const templateButton=node('button','◇ Szellemprofil · sablonkarakter');templateButton.id='open-template-character';templateButton.onclick=openTemplateCharacter;$('#characters').before(templateButton);const addCharacter=c=>{if(!characters.some(x=>x.id===c.id))characters.push({id:c.id,name:c.name,aliases:c.aliases||''});characters.sort((a,b)=>compare(a.name,b.name));list();};$('#characters').before(nameCreator({kind:'character',storageKey:'lu-mobile-create:'+session.login+':character',request:(name,id)=>api('/api/characters/'+id+'/create',{name},'PUT'),onCreated:async c=>{addCharacter(c);await openCharacter(c.id);}}));const sorting=initMobileSorting({host:$('#sorting-workspace'),api,characters,login:session.login,message,onCharacterCreated:addCharacter});const locationEditor=installLocationEditor({host:$('#locations-workspace'),api});function mode(next){$('#profile-workspace').hidden=next!=='characters';$('#sorting-workspace').hidden=next!=='sorting';$('#locations-workspace').hidden=next!=='locations';$('#save-all').hidden=next!=='characters';for(const key of ['characters','sorting','locations'])$('#mode-'+key).setAttribute('aria-pressed',String(next===key));if(next==='sorting')sorting.open();if(next==='locations')locationEditor.open();}$('#mode-characters').onclick=()=>mode('characters');$('#mode-sorting').onclick=()=>mode('sorting');$('#mode-locations').onclick=()=>mode('locations');message('Connected privately · choose a character.');}catch(err){message('Cannot open the private editor: '+err.message,true);}
