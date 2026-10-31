import {locationTreeRows,locationDescendants,locationSearchKey as key} from './location-tree-model.js';
export function installLocationEditor({host,api,onSaved=()=>{}}){
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  const prefix='lu-place-draft-v2:';let items=[],current=null,epoch=0,busy=false,treeVersion=null,creationKey=null;
  const expanded=new Set(),shell=el('div'),side=el('section'),main=el('section'),notice=el('p');shell.className='place-editor';main.className='place-main';notice.setAttribute('role','status');
  const search=el('input');search.type='search';search.placeholder='Helyszín keresése magyarul vagy angolul';search.setAttribute('aria-label','Helyszín keresése');
  const list=el('div'),controls=el('div'),history=el('details');list.className='place-list';list.setAttribute('role','tree');list.setAttribute('aria-label','Living Universe helyszínfa');
  controls.append(button('Minden ág kinyitása',()=>{for(const p of items)expanded.add(p.id);renderList();}),button('Ágak bezárása',()=>{expanded.clear();renderList();}));
  side.append(search,controls,list);shell.append(side,main);host.append(el('p','Pontos helyszínek és háttérhelyszínek. A fa átrendezése nem mozgat médiafájlt és nem változtat képrendezési besorolást.'),notice,shell);
  const create=el('details'),name=el('input'),createParent=el('select'),createEnglish=el('input'),status=el('p');create.className='place-new';name.maxLength=100;createEnglish.maxLength=200;
  for(const [title,input]of[['Új helyszín magyar neve',name],['Szülőhelyszín',createParent],['Angol megfelelő (nem kötelező)',createEnglish]]){const label=el('label',title);label.append(input);create.append(label);}
  create.prepend(el('summary','＋ Helyszín hozzáadása'));
  const createButton=button('Létrehozás',async()=>{if(busy)return;busy=true;createButton.disabled=true;for(const input of [name,createParent,createEnglish])input.disabled=true;status.textContent='Létrehozás…';try{
    creationKey??=crypto.randomUUID();const place=await api('/api/location-editor',{name:name.value,parent_id:createParent.value||null,english_name:createEnglish.value,request_key:creationKey,expected_tree_version:treeVersion},'PUT');creationKey=null;name.value='';createEnglish.value='';create.open=false;await refresh();busy=false;await choose(place.id);await onSaved();
  }catch(e){status.textContent=e.message;}finally{busy=false;createButton.disabled=false;for(const input of [name,createParent,createEnglish])input.disabled=false;}});create.append(createButton,status);side.append(create,history);
  for(const input of [name,createParent,createEnglish])input.oninput=()=>{creationKey=null;};
  function parentOptions(select,selected='',exclude=new Set()){
    select.replaceChildren();const root=el('option','Living Universe — gyökér');root.value='';select.append(root);
    for(const p of items.filter(p=>!p.tag_only&&!exclude.has(p.id)).sort((a,b)=>(a.breadcrumb||a.name).localeCompare(b.breadcrumb||b.name,'hu'))){const o=el('option',p.breadcrumb||p.name);o.value=p.id;select.append(o);}select.value=selected||'';
  }
  function draft(id){try{return JSON.parse(localStorage.getItem(prefix+id)||'null');}catch{return null;}}
  function remember(id,data){try{if(data)localStorage.setItem(prefix+id,JSON.stringify(data));else localStorage.removeItem(prefix+id);return true;}catch{notice.textContent='A piszkozatot a böngésző nem tudja tárolni.';return false;}}
  function focusPlace(id){[...list.querySelectorAll('.place-node-select')].find(b=>b.dataset.placeId===id)?.focus();}
  async function undoChange(change_id,id){if(busy)return;busy=true;try{const result=await api('/api/location-editor/undo',{change_id,expected_tree_version:treeVersion},'PUT');await refresh();busy=false;await choose(result.place?.id||id);await onSaved();}catch(e){notice.textContent=e.message;}finally{busy=false;}}
  function renderHistory(changes=[]){history.replaceChildren(el('summary','Legutóbbi helyszínmódosítások'));const undone=new Set(changes.map(c=>c.undo_of).filter(Boolean));for(const change of changes){const line=el('div'),p=items.find(p=>p.id===change.location_id);line.append(el('small',(p?.breadcrumb||change.location_id)+' · '+change.created_at));if(change.operation==='edit'&&!undone.has(change.id))line.append(button('Visszavonás…',()=>{main.replaceChildren(el('p','A módosítás visszavonása megőrzi az azonosítókat és média-hozzárendeléseket. Későbbi változást nem írunk felül.'),button('Visszavonás véglegesítése',()=>undoChange(change.id,change.location_id)));}));history.append(line);}}
  function renderList(){
    list.replaceChildren();const buttons=new Map(),visible=locationTreeRows(items,search.value,expanded);
    for(const p of visible){
      const row=el('div');row.className='place-tree-row';row.style.paddingInlineStart=(p.depth*18)+'px';row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(p.depth+1));row.setAttribute('aria-selected',String(current?.id===p.id));if(p.child_count)row.setAttribute('aria-expanded',String(p.expanded));
      const toggle=button(p.child_count?(p.expanded?'▾':'▸'):'·',()=>{if(expanded.has(p.id))expanded.delete(p.id);else expanded.add(p.id);renderList();focusPlace(p.id);});toggle.disabled=!p.child_count;toggle.setAttribute('aria-label',(p.expanded?'Ág bezárása: ':'Ág kinyitása: ')+p.breadcrumb);
      const select=button(p.name,()=>choose(p.id));select.className='place-node-select';select.dataset.placeId=p.id;select.title=p.breadcrumb;select.setAttribute('aria-label',p.breadcrumb);select.setAttribute('aria-current',String(current?.id===p.id));buttons.set(p.id,select);
      select.onkeydown=e=>{const index=visible.findIndex(n=>n.id===p.id);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons.get(visible[index+(e.key==='ArrowDown'?1:-1)]?.id)?.focus();}else if(e.key==='ArrowRight'&&p.child_count){e.preventDefault();if(!p.expanded){expanded.add(p.id);renderList();focusPlace(p.id);}else buttons.get(visible[index+1]?.id)?.focus();}else if(e.key==='ArrowLeft'){e.preventDefault();if(expanded.has(p.id)){expanded.delete(p.id);renderList();focusPlace(p.id);}else buttons.get(p.parent_id)?.focus();}};
      row.append(toggle,select);list.append(row);
    }
    if(!visible.length)list.append(el('p',search.value?'Nincs találat.':'Nincs konkrét helyszín. Adj hozzá egyet a világ gyökeréhez.'));
    const tags=items.filter(p=>p.tag_only&&key(p.name).includes(key(search.value)));if(tags.length){const legacy=el('details');legacy.append(el('summary','Környezeti címkék — még nem konkrét helyek'));for(const p of tags)legacy.append(button(p.name+' · címke',()=>choose(p.id)));list.append(legacy);}
  }
  search.oninput=renderList;
  async function refresh(){const data=await api('/api/location-editor');if(data.truncated)throw Error('A helyszínlista túl nagy; csonkolt fát nem szerkesztünk.');items=data.items;treeVersion=data.tree_version;for(const p of items)if(p.parent_id===null&&!p.tag_only)expanded.add(p.id);parentOptions(createParent,createParent.value);renderList();renderHistory(data.history);}
  async function choose(id){if(busy)return;const request=++epoch;notice.textContent='Helyszín betöltése…';try{const p=await api('/api/location-editor/'+encodeURIComponent(id));if(request!==epoch)return;current=p;for(const ancestor of p.path_ids||[])expanded.add(ancestor);draw(p);renderList();notice.textContent=p.breadcrumb;}catch(e){notice.textContent=e.message;}}
  function draw(p){
    main.replaceChildren(el('h2',p.name),el('p',p.breadcrumb));const saved=draft(p.id),values=saved?.fields||p;let expected=saved?.expected_version||p.version,expectedTree=saved?.expected_tree_version||treeVersion;
    const form=el('form'),fields={},feedback=el('p'),preview=el('div'),conflict=el('section');form.className='place-form';feedback.setAttribute('role','status');
    for(const[field,title,max]of[['name','Magyar helyszínnév',100],['english_name','Angol megfelelő (nem kötelező)',200],['category','Típus',100],['description','Leírás',30000]]){const label=el('label',title),input=el(field==='description'?'textarea':'input');input.maxLength=max;input.value=values[field]||'';fields[field]=input;label.append(input);form.append(label);}
    const parent=el('select'),label=el('label','Szülőhelyszín — áthelyezés');parentOptions(parent,values.parent_id,locationDescendants(items,p.id));fields.parent_id=parent;label.append(parent);form.append(label);
    if(!p.tag_only)form.append(button('＋ Új gyermekhelyszín',()=>{create.open=true;createParent.value=p.id;name.focus();}));
    if(p.folder)form.append(el('small','Kapcsolt mappa: '+p.folder+' — a fa módosítása nem mozgat vagy nevez át fájlt.'));
    const read=()=>Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,k==='parent_id'?(input.value||null):input.value]));
    form.oninput=form.onchange=()=>{remember(p.id,{expected_version:expected,expected_tree_version:expectedTree,fields:read()});feedback.textContent='Piszkozat megőrizve · még nincs elmentve.';preview.replaceChildren();};
    const save=el('button','Mentés');save.type='submit';save.className='primary';form.append(feedback,save,preview,conflict);main.append(form);feedback.textContent=saved?'Korábbi piszkozat visszatöltve.':'A módosítást a Mentés véglegesíti.';
    async function commit(submitted){
      if(busy)return;busy=true;save.disabled=true;for(const input of Object.values(fields))input.disabled=true;remember(p.id,{expected_version:expected,expected_tree_version:expectedTree,fields:submitted});feedback.textContent='Mentés…';
      try{const result=await api('/api/location-editor/'+encodeURIComponent(p.id),{expected_version:expected,expected_tree_version:expectedTree,fields:submitted},'PUT');remember(p.id,null);current=result;await refresh();draw(result);notice.textContent='Elmentve: '+result.breadcrumb;await onSaved();
        if(result.change_id){const undo=button('Módosítás visszavonása',()=>undoChange(result.change_id,result.id));main.append(undo);}
      }catch(err){feedback.textContent=err.message;if(err.status===409){try{const latest=await api('/api/location-editor/'+encodeURIComponent(p.id));conflict.replaceChildren(el('p','Legfrissebb: '+latest.breadcrumb),button('Mentett változat betöltése',async()=>{remember(p.id,null);await refresh();current=latest;draw(latest);}),button('Piszkozatom megtartása összehasonlítás után',async()=>{await refresh();expected=latest.version;expectedTree=treeVersion;remember(p.id,{expected_version:expected,expected_tree_version:expectedTree,fields:submitted});conflict.replaceChildren();feedback.textContent='A piszkozat megmaradt. Mentés előtt ellenőrizd újra.';}));}catch{feedback.textContent+=' A piszkozat megmaradt.';}}}
      finally{busy=false;if(save.isConnected){save.disabled=false;for(const input of Object.values(fields))input.disabled=false;}}
    }
    form.onsubmit=e=>{e.preventDefault();const submitted=read();if(submitted.parent_id!==p.parent_id){const target=items.find(i=>i.id===submitted.parent_id)?.breadcrumb||'Living Universe';preview.replaceChildren(el('p',p.breadcrumb+' → '+target+' / '+submitted.name),el('p','Az ág '+locationDescendants(items,p.id).size+' helyszínazonosítója és minden média-hozzárendelése megmarad. Fájlmozgatás nem történik.'),button('Áthelyezés és mentés',()=>commit(submitted)));}else commit(submitted);};
  }
  return {open:async()=>{try{await refresh();if(!current)main.replaceChildren(el('p','Válassz helyet a fában, vagy adj hozzá új helyszínt.'));}catch(e){notice.textContent=e.message;}}};
}
