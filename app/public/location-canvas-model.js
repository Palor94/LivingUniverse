// Shared, dependency-free layout model. Hierarchy is never a travel connection.
export const WORLD_ROOT='world:living-universe';
export const copy=value=>structuredClone(value);
const bad=message=>{throw Object.assign(new Error(message),{status:400});};
const identifier=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_:-]{1,160}$/.test(value))bad('Érvénytelen helyazonosító.');return value;};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)||required&&!value.trim())bad('Hiányzó vagy túl hosszú helyszínadat.');return value.normalize('NFC');};
export function normalizeCanvas(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['schema','nodes','types'].includes(k))||value.schema!==1||!Array.isArray(value.nodes)||value.nodes.length<1||value.nodes.length>5000||!Array.isArray(value.types)||value.types.length>300)bad('Érvénytelen vagy túl nagy helyszínterv.');
  const types=value.types.map(t=>{if(!t||Object.keys(t).some(k=>!['id','name'].includes(k)))bad('Érvénytelen típus.');return{id:identifier(t.id),name:text(t.name,100,true).trim()};});
  if(new Set(types.map(t=>t.id)).size!==types.length||new Set(types.map(t=>t.name.toLocaleLowerCase('hu'))).size!==types.length)bad('A helyszíntípusoknak egyedinek kell lenniük.');
  const typeIds=new Set(types.map(t=>t.id));
  const nodes=value.nodes.map(n=>{
    if(!n||Object.keys(n).some(k=>!['id','name','parent_id','kind','source_id','type_ids','placed','archived','order','note','x','y'].includes(k)))bad('Ismeretlen csomópontmező.');
    if(!['world','place','collection','type-source'].includes(n.kind)||typeof n.placed!=='boolean'||typeof n.archived!=='boolean'||!Array.isArray(n.type_ids)||n.type_ids.length>20||n.type_ids.some(t=>!typeIds.has(t))||!Number.isSafeInteger(n.order)||n.order<0)bad('Érvénytelen helyszíncsomópont.');
    const out={id:identifier(n.id),name:text(n.name,100,true).trim(),parent_id:n.parent_id===null?null:identifier(n.parent_id),kind:n.kind,source_id:n.source_id===null?null:identifier(n.source_id),type_ids:[...new Set(n.type_ids)],placed:n.placed,archived:n.archived,order:n.order,note:text(n.note||'',3000)};
    for(const k of ['x','y']){const v=n[k]??null;if(v!==null&&(!Number.isFinite(v)||v<0||v>1000000))bad('A csomópont pozíciója a vásznon kívül van.');out[k]=v===null?null:Math.round(v*100)/100;}
    if(out.source_id!==null&&out.source_id!==out.id)bad('A meglévő hely azonosítója nem cserélhető ki.');
    if(out.kind==='type-source'&&(out.placed||out.parent_id!==null||!out.type_ids.length))bad('A típus nem konkrét hely a fában.');
    if(!out.placed&&out.parent_id!==null)bad('Az el nem helyezett címkének nincs szülője.');
    return out;
  });
  const byId=new Map(nodes.map(n=>[n.id,n]));if(byId.size!==nodes.length)bad('Azonosítóütközés a helyszíntervben.');
  const root=byId.get(WORLD_ROOT);
  if(!root||root.name!=='Living Universe'||root.kind!=='world'||root.parent_id!==null||!root.placed||root.archived||root.source_id!==null)bad('A Living Universe gyökér megőrzendő.');
  for(const n of nodes){
    if(n.id!==WORLD_ROOT&&n.kind==='world')bad('Csak egy világ-gyökér lehet.');
    if(n.archived||!n.placed)continue;
    const seen=new Set([n.id]);let current=n;
    while(current.id!==WORLD_ROOT){const parent=byId.get(current.parent_id);if(!parent||parent.archived||!parent.placed||parent.kind==='type-source')bad('Hiányzó vagy nem elhelyezhető szülő.');if(seen.has(parent.id))bad('A helyszínfa nem tartalmazhat kört.');seen.add(parent.id);if(seen.size>128)bad('Ez az ág túl mély. Legfeljebb 128 szint használható.');current=parent;}
  }
  return{schema:1,types:types.sort((a,b)=>a.id.localeCompare(b.id)),nodes:nodes.sort((a,b)=>a.id.localeCompare(b.id))};
}
export function canvasChildren(state,parentId){return state.nodes.filter(n=>!n.archived&&n.placed&&n.parent_id===parentId).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'hu')||a.id.localeCompare(b.id));}
// Builds the parent→children index once (linear), instead of rescanning and sorting all nodes per visited node.
export function descendants(state,id){
  const kids=new Map();
  for(const n of state.nodes){if(n.archived||!n.placed||!n.parent_id)continue;if(!kids.has(n.parent_id))kids.set(n.parent_id,[]);kids.get(n.parent_id).push(n.id);}
  const found=new Set([id]),pending=[id];
  while(pending.length){for(const child of kids.get(pending.pop())??[]){if(found.has(child))bad('Kör a helyszínfában.');found.add(child);pending.push(child);}}
  return found;
}
// Tidy-up suggestions (nothing is changed here): a place whose name starts with another place's
// full name ("Sárbogárd - Gimnázium", "Sanyi háza - nagyszoba") belongs under that place, unless
// it already sits somewhere inside it. Same-named places under one parent are listed as possible
// duplicates for the owner to look at.
export function cleanupSuggestions(state){
  const live=state.nodes.filter(n=>n.kind==='place'&&!n.archived),byId=new Map(state.nodes.map(n=>[n.id,n]));
  const key=s=>String(s).normalize('NFC').toLocaleLowerCase('hu').replace(/\s+/g,' ').trim();
  const byName=new Map();for(const n of live)if(n.placed){const k=key(n.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(n);}
  const inside=(ancestorId,id)=>{for(let x=byId.get(id),i=0;x&&i<200;x=x.parent_id?byId.get(x.parent_id):null,i++)if(x.id===ancestorId)return true;return false;};
  // Every dash-separated part is one level (owner rule 2026-11-10): "Káloz - Szomszéd ház -
  // Nappali" goes under Káloz › Szomszéd ház, not straight under Káloz. A level is found as a
  // child named by its own part ("Szomszéd ház") or by the full prefix ("Káloz - Szomszéd ház");
  // a missing level is proposed as a new place (create), shared by all rooms that need it.
  const children=new Map();for(const c of live)if(c.placed&&c.parent_id){if(!children.has(c.parent_id))children.set(c.parent_id,[]);children.get(c.parent_id).push(c);}
  const planned=new Map();// parent id → [{id,name,full}] places that suggestions will add or move there
  const childNamed=(parentId,part,full)=>{const want=[key(part),key(full)];
    const real=(children.get(parentId)||[]).filter(c=>want.includes(key(c.name)));if(real.length===1)return {id:real[0].id,name:real[0].name};if(real.length>1)return null;
    const plan=(planned.get(parentId)||[]).filter(c=>want.includes(key(c.name))||key(c.full)===key(full));return plan.length===1?plan[0]:undefined;};
  const plan=(parentId,entry)=>{if(!planned.has(parentId))planned.set(parentId,[]);planned.get(parentId).push(entry);};
  const suggestions=[];let fresh=0;
  // Shorter names first, so a place placed by a suggestion can take its own rooms
  // ("Budapest - Milán lakása" before "Budapest - Milán lakása - Erkély").
  for(const n of [...live].sort((a,b)=>a.name.split(/\s+-\s+/).length-b.name.split(/\s+-\s+/).length)){
    const parts=n.name.split(/\s+-\s+/);if(parts.length<2)continue;
    // Anchor: the longest prefix that is a place's full name ("Káloz", or "Budapest - Milán lakása").
    let anchor=null,depth=0;
    for(let i=parts.length-1;i>=1&&!anchor;i--){const hits=(byName.get(key(parts.slice(0,i).join(' - ')))||[]).filter(p=>p.id!==n.id&&!inside(n.id,p.id));if(hits.length===1){anchor=hits[0];depth=i;}}
    if(!anchor)continue;
    // Walk down the remaining middle parts; a level that does not exist is created.
    let target={id:anchor.id,name:anchor.name},path=[anchor.name],create=[],unclear=false;
    for(let j=depth;j<parts.length-1;j++){
      const found=childNamed(target.id,parts[j],parts.slice(0,j+1).join(' - '));
      if(found===null){unclear=true;break;}
      // A level another suggestion creates is part of this one too (made once when applied).
      if(found){if(found.create)create.push(found);target=found;path.push(found.name+(found.create?' (új)':''));continue;}
      const made={id:'tidy-new-'+(++fresh),name:parts[j],full:parts.slice(0,j+1).join(' - '),parent_id:target.id,create:true};plan(target.id,made);create.push(made);target=made;path.push(made.name+' (új)');
    }
    if(unclear)continue;// two same-named children: the owner decides by hand
    // A place the owner already put somewhere inside the anchor keeps that home: no new levels
    // are invented beside a differently named existing one ("Kálozi cigánytelep").
    if(create.length&&n.placed&&n.parent_id&&inside(anchor.id,n.parent_id))continue;
    if(target.id===n.id||(!create.length&&n.placed&&n.parent_id&&(n.parent_id===target.id||inside(target.id,n.parent_id))))continue;// already there
    // Placing a lost place is safe (ticked); moving a placed one is the owner's call (unticked).
    suggestions.push({node_id:n.id,name:n.name,from:n.placed?byId.get(n.parent_id)?.name||null:null,to_id:target.id,to:path.join(' › '),create:create.map(({id,name,parent_id})=>({id,name,parent_id})),unplaced:!n.placed,recommended:!n.placed});
    plan(target.id,{id:n.id,name:n.name,full:n.name});
    if(!n.placed){const k=key(n.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(n);}
  }
  const duplicates=[];
  for(const list of byName.values()){const groups=new Map();for(const n of list)groups.set(n.parent_id||'',[...(groups.get(n.parent_id||'')||[]),n]);for(const g of groups.values())if(g.length>1)duplicates.push({name:g[0].name,node_ids:g.map(n=>n.id),parent:byId.get(g[0].parent_id)?.name||null});}
  return {suggestions,duplicates};
}
// Applies the chosen tidy-up suggestions to a plan copy: first the new middle places they need
// (each made once, even when several rooms share it), then the moves. Returns the counts.
export function applyTidy(state,chosen,newId=()=>'place-'+crypto.randomUUID()){
  const made=new Map();let created=0,moved=0;
  const real=id=>made.get(id)||id;
  for(const s of chosen){
    for(const c of s.create||[]){if(made.has(c.id))continue;const parent=real(c.parent_id),id=newId();
      state.nodes.push({id,name:c.name,parent_id:parent,kind:'place',source_id:null,type_ids:[],placed:true,archived:false,order:Math.max(-1,...canvasChildren(state,parent).map(n=>n.order))+1,note:'Rendrakás: a kötőjeles helynevekből létrehozott szint.',x:null,y:null});
      made.set(c.id,id);created++;}
    try{reparentCanvas(state,s.node_id,real(s.to_id));moved++;}catch{}
  }
  return {created,moved};
}
// Merging same-named duplicates (2026-11-11): one place is kept, the others' sub-places move
// under it and the others are archived (never deleted, so their IDs and history stay).
// The kept one: a place still in the catalogue, then the one with most sub-places, then the first.
export function pickDuplicateKeeper(state,nodeIds,catalogueIds=new Set()){
  const nodes=nodeIds.map(id=>state.nodes.find(n=>n.id===id)).filter(Boolean);
  const kids=id=>state.nodes.filter(n=>n.parent_id===id&&!n.archived).length;
  return [...nodes].sort((a,b)=>(catalogueIds.has(b.source_id)-catalogueIds.has(a.source_id))||(kids(b.id)-kids(a.id)))[0]?.id||null;
}
export function mergeDuplicates(state,nodeIds,keepId){
  if(!nodeIds.includes(keepId))bad('A megtartott hely nincs az ismétlődések között.');
  let moved=0,archived=0;
  for(const id of nodeIds){if(id===keepId)continue;
    for(const child of state.nodes.filter(n=>n.parent_id===id&&!n.archived)){reparentCanvas(state,child.id,keepId);moved++;}
    const n=state.nodes.find(x=>x.id===id);if(n&&!n.archived){n.archived=true;n.placed=false;n.parent_id=null;n.x=null;n.y=null;archived++;}}
  return {moved,archived};
}
export function reparentCanvas(state,childId,parentId){
  if(childId===WORLD_ROOT)bad('A világ gyökere nem mozgatható más hely alá.');
  const child=state.nodes.find(n=>n.id===childId),parent=state.nodes.find(n=>n.id===parentId);
  if(!child||child.archived||child.kind==='type-source'||!parent||parent.archived||!parent.placed||parent.kind==='type-source')bad('Válassz egy elhelyezhető helyet és egy szülőt.');
  if(descendants(state,childId).has(parentId))bad('Saját maga vagy leszármazottja alá nem kapcsolható.');
  child.parent_id=parentId;child.placed=true;child.order=Math.max(-1,...canvasChildren(state,parentId).filter(n=>n.id!==childId).map(n=>n.order))+1;
  const branch=descendants(state,childId);for(const n of state.nodes)if(branch.has(n.id)){n.x=null;n.y=null;}
  return normalizeCanvas(state);
}
export function retireCanvas(state,id){if(id===WORLD_ROOT)bad('A gyökér nem archiválható.');if(canvasChildren(state,id).length)bad('Előbb rendezd át a gyermekhelyszíneket.');const n=state.nodes.find(n=>n.id===id);if(!n)bad('Nincs ilyen hely.');n.archived=true;return normalizeCanvas(state);}
export function catalogueCanvas(catalogue,suggestion=null){
  const root={id:WORLD_ROOT,name:'Living Universe',parent_id:null,kind:'world',source_id:null,type_ids:[],placed:true,archived:false,order:0,note:'A világod helyszínfájának gyökere.',x:null,y:null};
  const available=new Map(catalogue.map(n=>[n.id,n]));
  let nodes=[root],types=[];
  if(suggestion?.initial?.nodes&&suggestion.initial.types){
    types=suggestion.initial.types.map(t=>({id:t.id,name:t.name}));
    for(const n of suggestion.initial.nodes){
      if(n.source_id&&!available.has(n.source_id))continue;
      nodes.push({id:n.id,name:n.source_id?available.get(n.source_id).name:n.name,parent_id:n.placed?(n.parent_id||WORLD_ROOT):null,kind:n.interpretation==='type'?'type-source':n.kind==='collection'?'collection':'place',source_id:n.source_id||null,type_ids:n.type_ids||[],placed:n.placed,archived:!!n.archived,order:n.order||0,note:(n.user_note||n.reason||'').slice(0,3000),x:null,y:null});
    }
  }
  const used=new Set(nodes.map(n=>n.id));
  for(const item of catalogue)if(!used.has(item.id))nodes.push({id:item.id,name:item.name,parent_id:item.parent_id&&available.has(item.parent_id)?item.parent_id:WORLD_ROOT,kind:'place',source_id:item.id,type_ids:[],placed:true,archived:false,order:nodes.length,note:item.category?'Korábbi típusmegjelölés: '+item.category:'',x:null,y:null});
  const placed=new Set(nodes.filter(n=>n.placed).map(n=>n.id));
  for(const n of nodes)if(n.placed&&n.id!==WORLD_ROOT&&!placed.has(n.parent_id)){n.parent_id=WORLD_ROOT;n.note+=' A korábbi szülő hiányzik; ellenőrizendő.';}
  return normalizeCanvas({schema:1,nodes,types});
}
export function canvasLayout(state,collapsed=new Set(),{width=208,height=116,gap=36,level=472,padding=80}={}){
  const spans=new Map(),positions=new Map(),visible=[],edges=[];
  const childMap=new Map();for(const n of state.nodes)if(n.placed&&!n.archived&&n.parent_id){if(!childMap.has(n.parent_id))childMap.set(n.parent_id,[]);childMap.get(n.parent_id).push(n);}for(const list of childMap.values())list.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'hu'));
  const kids=id=>collapsed.has(id)?[]:childMap.get(id)||[];
  function measure(id){const children=kids(id);const span=Math.max(width,children.reduce((sum,n)=>sum+measure(n.id),0)+Math.max(0,children.length-1)*gap);spans.set(id,span);return span;}
  function place(n,left,depth){const span=spans.get(n.id),x=n.x??left+(span-width)/2,y=n.y??padding+depth*level;positions.set(n.id,{x,y,width,height});visible.push(n);const children=kids(n.id);let at=left+(span-(children.reduce((sum,n)=>sum+spans.get(n.id),0)+Math.max(0,children.length-1)*gap))/2;for(const child of children){place(child,at,depth+1);edges.push({parent:n.id,child:child.id});at+=spans.get(child.id)+gap;}}
  measure(WORLD_ROOT);place(state.nodes.find(n=>n.id===WORLD_ROOT),padding,0);
  const bounds={width:Math.max(700,...[...positions.values()].map(p=>p.x+p.width+padding)),height:Math.max(500,...[...positions.values()].map(p=>p.y+p.height+padding))};
  return{positions,visible,edges,bounds};
}
export function moveCanvasBranch(state,id,layout,dx,dy){const ids=descendants(state,id);for(const n of state.nodes)if(ids.has(n.id)){const p=layout.positions.get(n.id);if(p){n.x=Math.max(0,p.x+dx);n.y=Math.max(0,p.y+dy);}else{n.x=null;n.y=null;}}return normalizeCanvas(state);}
export function zoomCanvas(camera,zoom,point){const z=Math.min(2.5,Math.max(.025,zoom)),ratio=z/camera.z;return{x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio,z};}
