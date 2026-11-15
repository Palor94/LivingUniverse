// Tibor, the admin and app owner, is not a character. Palor is a fictional
// character. They are two different, totally unrelated identities, with no
// shared backstory, and must never be merged, aliased or linked.
// Palor's deceased father (also named Tibor) is a separate in-world character
// and is not the admin.

export const ADMIN_IDENTITY=Object.freeze({
  name:'Tibor',
  role:'admin',
  isCharacter:false,
});

export const CHARACTER_ORIGINS=Object.freeze({
  Palor:Object.freeze({
    id:'6087e96d-73a6-4c27-8d7b-704339fe5f1b',
    name:'Palor',
    isCharacter:true,
    age:32,
    // Any user of the program can play as Palor; the player's real identity is never Palor's.
    playable:true,
    relatedTo:Object.freeze([]),
  }),
});

export const UNRELATED_IDENTITIES=Object.freeze({
  statement:'Tibor the admin and Palor the fictional character are separate, totally unrelated identities with no shared backstory.',
  pairs:Object.freeze([
    Object.freeze({a:ADMIN_IDENTITY,b:CHARACTER_ORIGINS.Palor}),
  ]),
});

function identityRef(value){
  if(value&&typeof value==='object')return {
    name:String(value.name??'').normalize('NFKC').trim().toLocaleLowerCase('hu'),
    role:String(value.role??'').normalize('NFKC').trim().toLocaleLowerCase('hu'),
    isCharacter:value.isCharacter,
    id:String(value.id??'').toLowerCase(),
  };
  const s=String(value??'').normalize('NFKC').trim().toLocaleLowerCase('hu');
  return {name:s,role:'',isCharacter:undefined,id:s};
}
function isPalorCharacter(value){
  const r=identityRef(value);
  return r.isCharacter!==false&&(r.name==='palor'||r.id===CHARACTER_ORIGINS.Palor.id);
}
function isAdminTibor(value){
  const r=identityRef(value);
  // An in-world character named Tibor (Palor's father) is not the admin.
  if(r.isCharacter===true||r.role==='character'||r.role==='father')return false;
  return r.name==='tibor'||value===ADMIN_IDENTITY;
}
// Throws if code tries to merge, alias or link the admin with Palor.
export function assertSeparateIdentities(a,b){
  if((isAdminTibor(a)&&isPalorCharacter(b))||(isAdminTibor(b)&&isPalorCharacter(a))){
    throw new Error('Tibor (admin) and Palor (character) are unrelated identities and must not be merged, aliased or linked.');
  }
}

// Owner declaration, 2026-11-11: existing and future collection media are AI-generated
// from fictional descriptions. Location defines the declaration's scope, not a technical proof.
// Legacy metadata/cache results remain historical and never override this declaration.
// Reference approval, byte integrity, consent, adult-content and provider rules stay separate.
import {lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {referenceSnapshot} from './reference-crop.mjs';

export const COLLECTION_ORIGIN_POLICY=Object.freeze({
  version:'2026-11-11.owner-declaration.1',
  basis:'owner_declaration',
  scope:'configured_media_root',
  media_origin:'fictional_ai_generated',
  applies_to:'existing_and_future_media',
  independently_verified:false,
  legacy_provenance_authoritative:false,
  grants_reference_approval:false,
  grants_real_person_consent:false,
  grants_provider_permission:false,
});
const DECLARED='owner_declared_fictional_ai';
const within=(parent,file)=>{const rel=path.relative(parent,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};

export function createCharacterOrigin({one,all,root=null}){
  // Metadata-only location checks: do not read media bytes, hydrate cloud files, or consult/write
  // the old media_provenance cache. Recheck each time so restored/moved files are not stuck.
  function proofOf(mediaId){
    const m=one('SELECT id,relative_path,kind FROM active_media WHERE id=?',mediaId);
    if(!m||!root)return 'missing';
    if(!['image','video'].includes(m.kind))return 'unsupported_media';
    if(typeof m.relative_path!=='string'||!m.relative_path||path.isAbsolute(m.relative_path)||path.win32.isAbsolute(m.relative_path)||/[\x00:]/.test(m.relative_path))return 'outside_collection';
    const parts=m.relative_path.split(/[\\/]/);
    if(parts.some(p=>!p||p==='.'||p==='..'))return 'outside_collection';
    try{
      const realRoot=realpathSync(root);let file=path.resolve(root),stat;
      for(const part of parts){file=path.join(file,part);stat=lstatSync(file);if(stat.isSymbolicLink())return 'outside_collection';}
      if(!stat.isFile())return 'missing';
      return within(realRoot,realpathSync(file))?DECLARED:'outside_collection';
    }catch{return 'missing';}
  }
  function approved(cid){
    const row=one('SELECT id,references_json FROM canon WHERE character_id=? ORDER BY rowid DESC LIMIT 1',cid);
    let refs=[];try{refs=JSON.parse(row?.references_json||'[]');}catch{}
    return {row,refs:Array.isArray(refs)?refs.filter(r=>r&&typeof r.media_id==='string'):[]};
  }
  function referenceProofs(cid){
    const {refs}=approved(cid);
    const counts={};for(const r of refs){const k=proofOf(r.media_id);counts[k]=(counts[k]||0)+1;}return counts;
  }
  function originOf(cid){
    const c=one('SELECT id FROM characters WHERE id=?',cid);
    const declared=!!c&&all('SELECT m.id FROM active_media m JOIN depictions d ON d.media_id=m.id WHERE d.character_id=?',cid).some(m=>proofOf(m.id)===DECLARED);
    return {origin:declared?'invented':'not_stated',
      reason:declared?'The owner declares media in this collection AI-generated from fictional descriptions.':c?'No media within the declaration scope is assigned to this character.':'no such character',
      origin_basis:declared?'owner_declaration':null,
      media_origin:declared?'fictional_ai_generated':'unknown',
      independently_verified:false,origin_policy:COLLECTION_ORIGIN_POLICY};
  }
  // These are origin-eligible approved images, not a grant of provider permission or consent.
  // Keep the exact approved crop/id/hash; the image-delivery and generation paths verify bytes.
  function allowedReferences(cid){
    const {row,refs}=approved(cid);
    return refs.filter(r=>proofOf(r.media_id)===DECLARED&&
      one("SELECT 1 FROM active_media m JOIN depictions d ON d.media_id=m.id WHERE m.id=? AND m.kind='image' AND d.character_id=?",r.media_id,cid))
      .map(r=>({...referenceSnapshot(r),character_id:cid,role:r.role||null,revision_id:row.id,proof:DECLARED}));
  }
  const mayUseReferences=cid=>allowedReferences(cid).length>0;
  // Preserve the existing separate content/provider gates. Unapproved media never becomes a
  // reference; text-only fiction requires assigned, in-scope collection media, not prose keywords.
  const intimateAllowed=cid=>mayUseReferences(cid)||originOf(cid).origin==='invented';
  const everydayReferences=allowedReferences;
  const mayUseEverydayReferences=cid=>everydayReferences(cid).length>0;
  return {policy:COLLECTION_ORIGIN_POLICY,originOf,mayUseReferences,intimateAllowed,allowedReferences,referenceProofs,proofOf,everydayReferences,mayUseEverydayReferences};
}
