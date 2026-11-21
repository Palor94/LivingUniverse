// URL state contains stable IDs and view names only; it never initiates a game action.
const views=new Set(['tasks','home','characters','ghost-template','world','play','factory','library','inbox','quick-tag','media-review','image-workshop','location-catalogue','locations','system','identity']);
const tabs=new Set(['profile','media','canon','events','generation']);
const placeTabs=new Set(['tree','map','backgrounds','doors']);
export function parseAppRoute(hash){
  if(hash==='#locations')return {view:'location-catalogue',cid:null,tab:'profile'};
  try{
    const parts=String(hash||'').replace(/^#\/?/,'').split('/').map(decodeURIComponent);
    if(parts[0]==='location-catalogue'&&placeTabs.has(parts[1])&&parts.length<=3&&(!parts[2]||/^[A-Za-z0-9_:-]{1,160}$/.test(parts[2])))return {view:'location-catalogue',cid:null,tab:'profile',placeTab:parts[1],placeId:parts[2]||null};
    if(parts[0]==='profile'&&/^[a-f0-9-]{36}$/i.test(parts[1])&&parts.length<=3&&(!parts[2]||tabs.has(parts[2])))return {view:'profile',cid:parts[1],tab:parts[2]||'profile'};
    if(parts.length===1&&views.has(parts[0]))return {view:parts[0],cid:null,tab:'profile'};
  }catch{}
  return null;
}
export function appRouteHash({view,cid=null,tab='profile',placeTab=null,placeId=null}){
  if(view==='location-catalogue'&&placeTabs.has(placeTab))return '#/location-catalogue/'+placeTab+(placeId?'/'+encodeURIComponent(placeId):'');
  if(view==='profile')return '#/profile/'+encodeURIComponent(cid)+'/'+(tabs.has(tab)?tab:'profile');
  return '#/'+(views.has(view)?view:'home');
}
export function startupRoute(hash,preference){return parseAppRoute(hash)||{view:!hash&&preference==='play'?'play':'home',cid:null,tab:'profile'};}
export function readStartupPreference(storage){try{return storage.getItem('lu-start-screen')==='play'?'play':'home';}catch{return 'home';}}
