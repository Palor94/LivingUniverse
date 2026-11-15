// The creator's location tree (approved location canvas), shared by Play mode and the
// world engine. Read-only; parsed once and reused until the file changes.
// Every place gets a short name for the game (parent names repeated in the child's name
// are dropped: "Káloz - Cigánytelep - Sanyi háza - nagyszoba" under Sanyi háza →
// "Nagyszoba") and a full path for AI prompts ("Káloz › Cigánytelep › Sanyi háza").
import {promises as fs} from 'node:fs';
import path from 'node:path';

const fold=s=>String(s).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('hu').trim();
// "Kálozi" ≈ "Káloz", "albérlet" ≈ "albérlete" (short suffix), and "szerelő" ≈
// "szerelőműhely" (start of a compound word, at least five letters).
const sameWord=(a,b)=>{a=fold(a);b=fold(b);if(a===b)return true;const [s,l]=a.length<b.length?[a,b]:[b,a];return s.length>=4&&l.startsWith(s)&&(l.length-s.length<=2||s.length>=5);};
const words=s=>String(s).split(/[\s,]+/).filter(Boolean);
// Possessive leftovers that only make sense with their owner ("Káloz határa").
const NEEDS_OWNER=new Set(['hatara','kornyeke','szele','vege','utcaja','kozepe']);
const capital=s=>s?s[0].toLocaleUpperCase('hu')+s.slice(1):s;

export function shortName(name,ancestorNames){
  const known=ancestorNames.flatMap(words);
  const matches=part=>words(part).length&&words(part).every(w=>known.some(k=>sameWord(w,k)));
  const parts=String(name).split(/\s*[-–]\s+|\s+[-–]\s*/).map(s=>s.trim()).filter(Boolean);
  let rest=parts,stripped=false;
  if(parts.length>1){while(rest.length>1&&matches(rest[0])){rest=rest.slice(1);stripped=true;}}
  else{
    // No separators: drop leading words that repeat an ancestor ("Pákozdi háza hálószoba").
    const all=words(name);let ws=all;while(ws.length>1&&known.some(k=>sameWord(ws[0],k)))ws=ws.slice(1);
    stripped=ws.length<all.length;rest=[ws.join(' ')];
    // A lone possessive keeps its owner: "Domi autója", not "Autója".
    if(stripped&&ws.length===1&&/(j[ae]|ája|éje)$/i.test(ws[0]))return name;
  }
  const result=rest.join(' - ').trim();
  if(!stripped||!result)return name;
  if(rest.length===1&&words(result).length===1&&NEEDS_OWNER.has(fold(result)))return name;
  return capital(result);
}

export function createLocationTree(dataDir){
  const file=path.join(dataDir,'location-canvas.json');
  let cache={stamp:null,tree:empty()};
  function empty(){return {nodes:[],byId:new Map(),children:new Map(),byLocation:new Map(),typeSources:new Set(),archivedSources:new Set()};}
  async function load(){
    let stat;try{stat=await fs.stat(file);}catch{return empty();}
    const stamp=stat.size+':'+stat.mtimeMs;if(cache.stamp===stamp)return cache.tree;
    let value;try{value=JSON.parse(await fs.readFile(file,'utf8'));}catch{return cache.tree;}
    const rev=value.revisions?.find(r=>r.id===value.approved_head)||value.revisions?.at(-1);
    const raw=(rev?.state?.nodes||[]).filter(n=>!n.archived&&n.kind!=='type-source');
    // Catalogue places the owner marked as a type ("Beach" = a kind of place, not one place).
    const typeSources=new Set((rev?.state?.nodes||[]).filter(n=>!n.archived&&n.kind==='type-source'&&n.source_id).map(n=>n.source_id));
    // Catalogue places whose tree node was archived (owner, 2026-11-14: ZIP import must not place into them).
    const archivedSources=new Set((rev?.state?.nodes||[]).filter(n=>n.archived&&n.source_id).map(n=>n.source_id));
    const rawById=new Map(raw.map(n=>[n.id,n]));
    // Ancestors that are real places (not the world root or a thematic collection).
    const ancestors=n=>{const out=[];let p=rawById.get(n.parent_id);while(p){if(p.kind!=='world'&&p.kind!=='collection')out.unshift(p);p=rawById.get(p.parent_id);}return out;};
    const nodes=raw.map(n=>{const anc=ancestors(n),short=shortName(n.name,anc.map(a=>a.name));
      return {id:n.id,name:n.name,short_name:short,parent_id:n.parent_id,kind:n.kind,location_id:n.source_id||null,order:n.order??0,placed:n.placed!==false,x:Number.isFinite(n.x)?n.x:null,y:Number.isFinite(n.y)?n.y:null,_anc:anc};});
    const byId=new Map(nodes.map(n=>[n.id,n]));
    for(const n of nodes){n.path=[...n._anc.map(a=>byId.get(a.id)?.short_name||a.name),n.short_name].join(' › ');delete n._anc;Object.freeze(n);}
    const children=new Map();for(const n of nodes){if(!children.has(n.parent_id))children.set(n.parent_id,[]);children.get(n.parent_id).push(n);}
    for(const list of children.values())list.sort((a,b)=>a.order-b.order);
    const byLocation=new Map(nodes.filter(n=>n.location_id).map(n=>[n.location_id,n]));
    cache={stamp,tree:{nodes,byId,children,byLocation,typeSources,archivedSources}};
    return cache.tree;
  }
  // Full path of a catalogue location for prompts, or its plain name when not in the tree.
  async function pathOf(locationId,fallback){const t=await load();return t.byLocation.get(locationId)?.path||fallback||null;}
  return {load,pathOf};
}
