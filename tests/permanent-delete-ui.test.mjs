import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPermanentDeleteUI} from '../app/public/permanent-media-delete.js';

const tick=()=>new Promise(setImmediate);
function fixture(api=async route=>({media_id:route.split('/')[3],protected:false})){
  const gallery={id:'library-permanent-delete'},viewer={id:'viewer-permanent-delete'},events={},calls=[];
  const nodes=new Map([['#library-permanent-delete',gallery],['#viewer-permanent-delete',viewer],['#dialog',{addEventListener:(name,fn)=>{events[name]=fn;}}],['.viewer-sort-nav',{insertAdjacentHTML(){}}],['.topbar',{insertAdjacentHTML(){throw Error('No global delete control is allowed.');}}]]);
  const ui=installPermanentDeleteUI({$:s=>nodes.get(s)||null,$$:()=>[gallery,viewer],api:async(...args)=>{calls.push(args);return api(...args);},toast(){},render:async()=>{}});
  ui.controls();return {ui,gallery,viewer,events,calls};
}
const pictures=[{id:'one',kind:'image'},{id:'two',kind:'image'}];

test('V2 gallery control is hidden without image selection, then shows a deduplicated count and clears',async()=>{
  const f=fixture();assert.equal(f.gallery.hidden,true);
  f.ui.selection(pictures);await tick();
  assert.equal(f.gallery.hidden,false);assert.equal(f.gallery.disabled,false);assert.equal(f.gallery.textContent,'2 kép végleges törlése');
  assert.equal(typeof f.gallery.onclick,'function');
  f.ui.selection([pictures[0],pictures[0],{id:'video',kind:'video'}]);await tick();
  assert.equal(f.gallery.textContent,'1 kép végleges törlése');
  f.ui.selection([]);await tick();assert.equal(f.gallery.hidden,true);assert.equal(f.gallery.disabled,true);
  assert.ok(f.calls.every(args=>args.length===1),'selection performs only capability reads');
});

test('V2 protected or unavailable images stay disabled; late capability answers cannot revive a cleared selection',async()=>{
  const protectedUI=fixture(async()=>({protected:true}));protectedUI.ui.selection(pictures);await tick();
  assert.equal(protectedUI.gallery.disabled,true);assert.match(protectedUI.gallery.title,/Védett/);
  const missing=fixture(async()=>{throw Error('synthetic unavailable');});missing.ui.selection(pictures);await tick();
  assert.equal(missing.gallery.disabled,true);assert.equal(missing.gallery.hidden,false);
  const pending=[];const f=fixture(()=>new Promise(resolve=>pending.push(resolve)));
  f.ui.selection(pictures);assert.equal(f.gallery.disabled,true);
  f.ui.selection([]);pending.forEach(resolve=>resolve({protected:false}));await tick();
  assert.equal(f.gallery.hidden,true);assert.equal(f.gallery.disabled,true);
});

test('V2 viewer control remains independent; closing it restores the gallery selection count',async()=>{
  const f=fixture();f.ui.selection(pictures);await tick();
  f.ui.media({id:'another',kind:'image'});await tick();
  assert.equal(f.gallery.hidden,true);assert.equal(f.viewer.textContent,'Törlés');assert.equal(f.viewer.disabled,false);
  f.events.close();await tick();
  assert.equal(f.gallery.hidden,false);assert.equal(f.gallery.textContent,'2 kép végleges törlése');
});
