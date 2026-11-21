export function compactCharacterSubtitle(aliases='',occupation=''){
  const names=[...new Set(String(aliases).split(/[;,\n]/).map(part=>part.split(/[.(]/)[0].trim()).filter(part=>part&&part.split(/\s+/).length<=3))].slice(0,3);
  const job=String(occupation).split(/[;,\n.(]/)[0].trim();
  return [names.join(' · '),job].filter(Boolean).join(' — ');
}
export function matchesReadiness(status,filter){
  if(filter==='all')return true;if(!status)return false;
  return {empty:status.profile_filled===0,figure:status.figures===0,routine:status.has_routine===false,home:status.has_home===false,known:status.knows_palor===true,unknown:!status.is_palor&&status.knows_palor===false}[filter]===true;
}
export function sortReadyCharacters(characters,statuses,order){
  const name=(a,b)=>a.name.localeCompare(b.name,'hu'),missing=status=>status?[status.profile_filled===0,status.figures===0,!status.has_routine,!status.has_home].filter(Boolean).length:-1;
  return [...characters].sort((a,b)=>{
    const x=statuses.get(a.id),y=statuses.get(b.id);
    if(order==='profile-desc')return ((y?.profile_percent??-1)-(x?.profile_percent??-1))||name(a,b);
    if(order==='profile-asc')return ((x?.profile_percent??Infinity)-(y?.profile_percent??Infinity))||name(a,b);
    if(order==='missing')return (missing(y)-missing(x))||name(a,b);
    return name(a,b);
  });
}
