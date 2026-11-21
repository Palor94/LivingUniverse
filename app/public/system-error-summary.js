import {t} from './i18n.js';
const uuid='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const reference=new RegExp('^/api/characters/('+uuid+')/references/('+uuid+')/image$','i');
export function groupSystemErrors(errors,characters=[]){
  const names=new Map(characters.map(c=>[c.id,c.name])),groups=new Map();
  for(const error of errors||[]){
    const route=String(error.route||''),match=route.match(reference),kind=match?'reference':/^\/(?:thumb|media)\//.test(route)?'media':/^\/api\/sprites\//.test(route)?'figure':'application';
    const characterId=match?.[1],key=kind==='reference'?kind+':'+characterId:kind;
    if(!groups.has(key))groups.set(key,{kind,characterId:characterId&&names.has(characterId)?characterId:null,characterName:names.get(characterId)||null,resources:new Set(),occurrences:0});
    const group=groups.get(key);group.resources.add(match?.[2]||route||error.source||'application');group.occurrences++;
  }
  return [...groups.values()].map(group=>({...group,resources:group.resources.size}));
}
export function renderSystemErrors(errors,characters,esc){
  return groupSystemErrors(errors,characters).map(group=>`<li class="system-error-group"><span>${esc(t('sys.errorGroup.'+group.kind,{count:group.resources}))}</span>${group.characterId?` — <button type="button" class="subtle" data-system-character="${esc(group.characterId)}">${esc(group.characterName)}</button>`:''}<small class="muted">${esc(t('sys.errorOccurrences',{count:group.occurrences}))}</small></li>`).join('');
}
