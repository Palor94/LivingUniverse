export const groupNames={reference:'Referencia szerepe',angle:'Kameranézet',framing:'Képkivágás',expression:'Arckifejezés',clothing:'Ruházat és kiegészítők',pose:'Testtartás és tevékenység',setting:'Környezet leírása',source:'Forrás',quality:'Vizuális minőség'};
const originalGroups={reference:'Reference role (media label)',angle:'Camera angle',framing:'Framing',expression:'Expression',clothing:'Clothing & accessories',pose:'Pose & activity',setting:'Setting & location',source:'Source / generation provider',quality:'Visual quality & fidelity'};
export const groupName=g=>{const key=g.id?.replace('group-','');return g.name===originalGroups[key]?groupNames[key]:g.name;};
export const tagName=t=>t.display_name||t.name;
export const aliasLines=tag=>(tag.aliases||[]).map(a=>`${a.language}: ${a.alias}`).join('\n');
export function parseAliasLines(value){
  return value.split('\n').map(v=>v.trim()).filter(Boolean).map(line=>{
    const m=line.match(/^(hu|en|und):\s*(.+)$/u);if(!m)throw Error('Az alias formátuma: hu: címke vagy en: label (soronként egy).');
    return {language:m[1],alias:m[2]};
  });
}
export function installNoteTagsUI({$,esc,api,action,toast,openDialog,refresh,reload}){
  const reasons={matched:'Meglévő címke',unknown:'Ismeretlen — új címke javaslata',ambiguous:'Többértelmű — válassz pontosabb aliast',location:'Konkrét helyhez kötött — válaszd ki a Helyszínek mezőben'};
  function render(plan,tags){
    const byId=new Map(tags.map(t=>[t.id,t]));
    return plan.items.map(item=>`<div class="panel"><small>${esc(item.media_id)}</small>${item.matches.length?'<ul>'+item.matches.map(m=>`<li><b>#${esc(m.token)}</b> · ${esc(reasons[m.status])}${m.tag_id?` → ${esc(tagName(byId.get(m.tag_id)||{name:m.tag_id}))}${item.existing.includes(m.tag_id)?' (már hozzárendelve)':''}`:''}${m.status==='ambiguous'?` (${m.candidate_ids.map(id=>esc(tagName(byId.get(id)||{name:id}))).join(', ')})`:''}</li>`).join('')+'</ul>':'<p>Nincs hashtag.</p>'}</div>`).join('');
  }
  function viewer(m){
    const note=$('#media-form textarea[name="notes"]');if(!note)return;
    note.closest('label').insertAdjacentHTML('afterend','<div class="panel"><p>A jegyzet #címkéi mentéskor hozzáadódnak. Példa: #mosolygó #full_body. Ismeretlen vagy többértelmű címke javaslat marad. Pontos helyszínt külön válassz.</p><button type="button" id="note-tags-preview">Hashtagek előnézete</button><div id="note-tags-result" aria-live="polite"></div></div>');
    $('#note-tags-preview').onclick=action(async()=>{
      const text=note.value,[plan,taxonomy]=await Promise.all([api('/api/taxonomy/notes/preview',{media_ids:[m.id],notes:text}),api('/api/taxonomy')]);
      if(note.isConnected&&note.value===text)$('#note-tags-result').innerHTML=render(plan,taxonomy.tags);
    });
  }
  async function review(){
    const [state,taxonomy]=await Promise.all([api('/api/taxonomy/notes/review'),api('/api/taxonomy')]);
    openDialog('Jegyzetcímkék áttekintése',`<p>Az előnézet nem ír adatot. Csak egyértelmű leíró címkéket adunk hozzá. A jegyzet, régi címkék és helyszínek megmaradnak. A szótárban megadott magyar/angol nevekkel és aliasokkal oldhatók fel a javaslatok.</p><form id="note-backfill"><label>Médiaazonosítók (legfeljebb 1000, szóközzel vagy vesszővel elválasztva)<textarea id="note-media-ids" rows="4">${esc([...new Set(state.proposals.map(p=>p.media_id))].join('\n'))}</textarea></label><button>Száraz próba</button><button type="button" id="note-current-page">Aktuális galériaoldal azonosítói</button></form><div id="note-backfill-result"></div><h3>Javaslatok (legfeljebb 1000)</h3>${state.proposals.length?'<ul>'+state.proposals.map(p=>`<li>#${esc(p.token)} · ${esc(reasons[p.reason])} · <small>${esc(p.media_id)}</small></li>`).join('')+'</ul>':'<p>Nincs függő javaslat.</p>'}<h3>Legutóbbi műveletek (100)</h3>${state.runs.map(r=>`<p><small>${esc(r.created_at)} · ${esc(r.source)} · ${esc(r.id)}</small> ${r.status==='applied'?`<button type="button" data-note-rollback="${esc(r.id)}">Visszavonás…</button>`:'Visszavonva'}</p>`).join('')}`);
    $('#note-current-page').onclick=()=>{
      const ids=[...document.querySelectorAll('.media-card[data-media]')].map(n=>n.dataset.media);
      if(!ids.length){toast('Nyiss meg egy galériaoldalt, vagy másold be az azonosítókat.');return;}
      $('#note-media-ids').value=ids.join('\n');
    };
    $('#note-backfill').onsubmit=action(async e=>{
      e.preventDefault();const media_ids=$('#note-media-ids').value.split(/[\s,]+/u).filter(Boolean);
      const plan=await api('/api/taxonomy/notes/preview',{media_ids});
      $('#note-backfill-result').innerHTML=render(plan,taxonomy.tags)+'<button type="button" id="note-backfill-apply">Előnézet alkalmazása</button>';
      $('#note-backfill-apply').onclick=action(async()=>{
        const r=await api('/api/taxonomy/notes/apply',{media_ids,preview_hash:plan.preview_hash});await refresh();await reload();await review();toast(`${r.added} címke hozzáadva; ${r.proposed} javaslat.`);
      });
    });
    for(const button of document.querySelectorAll('[data-note-rollback]'))button.onclick=()=>{
      const run_id=button.dataset.noteRollback;
      openDialog('Címkekinyerés visszavonása',`<p>Csak ennek a műveletnek a még automatikusként nyilvántartott hozzárendeléseit és változatlan javaslatait vonjuk vissza. Későbbi kézi címkézés megmarad.</p><p><small>${esc(run_id)}</small></p><button id="note-rollback-confirm">Visszavonás</button>`);
      $('#note-rollback-confirm').onclick=action(async()=>{const r=await api('/api/taxonomy/notes/rollback',{run_id});await refresh();await reload();await review();toast(`${r.removed} hozzárendelés visszavonva; ${r.conflicts} későbbi változás megőrizve.`);});
    };
  }
  return {viewer,review};
}
