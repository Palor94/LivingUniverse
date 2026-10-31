export const locationSearchKey=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu');
export function locationDescendants(items,id){
  const found=new Set(),pending=[id];while(pending.length){const current=pending.pop();if(found.has(current))throw Error('Kör a helyszínfában.');found.add(current);for(const item of items)if(!item.tag_only&&item.parent_id===current)pending.push(item.id);}return found;
}
export function locationTreeRows(items,query='',expanded=new Set()){
  const places=items.filter(p=>!p.tag_only),byId=new Map(places.map(p=>[p.id,p])),keep=new Set(),q=locationSearchKey(query).trim();
  if(byId.size!==places.length)throw Error('Ismétlődő helyszínazonosító.');
  for(const p of places){let current=p,seen=new Set();while(current){if(seen.has(current.id)||seen.size>=128)throw Error('Kör vagy túl mély helyszínfa.');seen.add(current.id);if(current.parent_id&&!byId.has(current.parent_id))throw Error('Hiányzó szülőhelyszín.');current=byId.get(current.parent_id);}}
  if(q)for(const p of places)if(locationSearchKey([p.name,p.english_name,p.category,p.breadcrumb].join(' ')).includes(q)){let current=p;while(current){keep.add(current.id);current=byId.get(current.parent_id);}}
  const children=new Map();for(const p of places){const list=children.get(p.parent_id)||[];list.push(p);children.set(p.parent_id,list);}for(const list of children.values())list.sort((a,b)=>a.name.localeCompare(b.name,'hu')||a.id.localeCompare(b.id));
  const result=[];function visit(parent,depth){for(const p of children.get(parent)||[]){if(q&&!keep.has(p.id))continue;const count=(children.get(p.id)||[]).length,open=count>0&&(!!q||expanded.has(p.id));result.push({...p,depth,child_count:count,expanded:open});if(open)visit(p.id,depth+1);}}visit(null,0);return result;
}
