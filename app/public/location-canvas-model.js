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
export function descendants(state,id){const found=new Set([id]),pending=[id];while(pending.length){const parent=pending.pop();for(const n of canvasChildren(state,parent)){if(found.has(n.id))bad('Kör a helyszínfában.');found.add(n.id);pending.push(n.id);}}return found;}
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
