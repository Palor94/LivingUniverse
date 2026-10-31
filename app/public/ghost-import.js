// Transport compatibility only: never infer facts, sources or visibility.
export function normalizeGhostValues(values,fields=[]){
  if(!values||typeof values!=='object'||Array.isArray(values))return values;
  return Object.fromEntries(Object.entries(values).map(([id,input])=>{
    if(!input||typeof input!=='object'||Array.isArray(input))return [id,input];
    const e={...input};
    if(Object.hasOwn(e,'type')){
      if(e.kind!==undefined&&e.kind!==e.type)throw Error(id+': a type és kind eltérő állítástípust tartalmaz.');
      e.kind=e.type;delete e.type;
    }
    if(e.value===null&&fields.find(f=>f.id===id)?.type==='text')e.value='';
    return [id,e];
  }));
}
