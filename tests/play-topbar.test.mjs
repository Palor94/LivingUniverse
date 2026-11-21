import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {t} from '../app/public/i18n.js';
import {icon} from '../app/public/play-icons.js';

const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  const topHelp='),source.indexOf('  let synced='));
const meter=source.slice(source.indexOf('  function aiMeter(){'),source.indexOf('  // Guided tour:'));
const markup=source.slice(source.indexOf('    const car=(data.items||[])'),source.indexOf("    for(const b of $$('.play-top [data-play-mode]'))"));
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function fixture({car={kind:'vehicle',here:true},mode='map',ai={spent:1,cap:4},unread=10}={}){
  const town={id:'test-town',name:'Teszt "település"'},here={id:'test-place',name:'Teszt hely'};
  const ctx={studio:false,fast:[],favourites:[],t,icon,esc,mode,slot:0,here,townId:town.id,current:{node:here},node:()=>town,townOf:()=>town,label:n=>n.name,
    drive:true,aiWarned:false,SLOT_ICON:['☀'],setTimeout(){},showNotice(){},host:{innerHTML:''},
    data:{items:car?[car]:[],ai,unread_messages:unread,clock:{day:'2026-11-16',weekday:'hétfő',slot:'reggel',time:'09:00'}}};
  vm.createContext(ctx);vm.runInContext(helpers+meter+markup,ctx);return ctx;
}

test('V13 every top-bar control has a descriptive title and accessible name in all travel states',()=>{
  for(const car of [null,{kind:'vehicle',here:true},{kind:'vehicle',here:false,name:'Teszt autó',place:'Teszt garázs'}]){
    for(const mode of ['map','town','place']){
      const {host}=fixture({car,mode});const tags=host.innerHTML.match(/<(?:button|summary|meter)\b[^>]*>/g);
      assert.ok(tags.length>=14);
      for(const tag of tags){assert.match(tag,/title="[^"]{10,}"/);assert.match(tag,/aria-label="[^"]{10,}"/);}
      assert.match(host.innerHTML,/15 perc várakozás/);
      assert.match(host.innerHTML,/Napló megnyitása.*\(N\)/);
      assert.match(host.innerHTML,/title="10 olvasatlan üzenet"/);
      if(mode==='town')assert.match(host.innerHTML,/Teszt &quot;település&quot;/);
    }
  }
});

test('V13 AI meter explains spend, currency and percentage, and stays absent without a positive cap',()=>{
  const {host}=fixture();assert.match(host.innerHTML,/AI-keret/);
  assert.match(host.innerHTML,/aria-valuetext="Mai AI-költés: 1.00 USD \/ 4.00 USD – a napi keret 25%-a elfogyott"/);
  assert.match(fixture({ai:{spent:6,cap:4}}).host.innerHTML,/<meter[^>]*value="100"/);
  assert.ok(!fixture({ai:null}).host.innerHTML.includes('<meter'));
  assert.ok(!fixture({ai:{spent:0,cap:0}}).host.innerHTML.includes('<meter'));
});

test('V13 polled unread counts update both menu labels and badges, including clearing the last unread',()=>{
  const parents=[{},{}].map(()=>({title:'',attrs:{},html:'',querySelector(){return {remove:()=>{this.html='';}};},insertAdjacentHTML(_where,html){this.html=html;},setAttribute(k,v){this.attrs[k]=v;}}));
  const ctx={$:s=>s.includes('summary')?parents[0]:parents[1],t,esc};vm.createContext(ctx);vm.runInContext(helpers,ctx);
  for(const count of [10,3,0]){
    ctx.paintUnread(count);
    for(const parent of parents){assert.equal(parent.title,parent.attrs['aria-label']);assert.ok(parent.title.includes(count?`${count} olvasatlan üzenet`:'nincs olvasatlan üzenet'));assert.equal(parent.html.includes('play-menu-badge'),count>0);}
  }
});

test('A10 sleep is a single explicit choice inside the initially closed wait menu',()=>{
  const {host}=fixture();
  const wait=host.innerHTML.match(/<details class="play-menu play-wait-menu">[\s\S]*?<\/details>/)?.[0];
  assert.ok(wait);assert.ok(!wait.startsWith('<details open'));
  assert.match(wait,/data-play-wait="morning"[^>]*>[\s\S]*?Alszom reggelig/);
  assert.match(wait,/Várakozás vagy alvás/);
  assert.equal((wait.match(/data-play-wait="morning"/g)||[]).length,1);
  assert.ok(!host.innerHTML.replace(wait,'').includes('data-play-wait="morning"'));
  for(const value of ['data-minutes="15"','data-minutes="60"','data-play-wait="next_slot"'])assert.ok(wait.includes(value));
});

test('A10/B25 sleeping retains its away confirmation and cancellation prevents every time/AI request',async()=>{
  const binding=source.slice(source.indexOf('    let waitPending=false;'),source.indexOf("    for(const b of $$('.play-top [data-play-town]'))"));
  for(const [atHome,confirmed,undone,expectedCalls] of [[true,false,false,1],[false,false,false,0],[false,true,false,1],[true,true,true,0],[false,true,true,0]]){
    const button={dataset:{playWait:'morning'}},calls=[],prompts=[];
    const ctx={$$:()=>[button],wrap:fn=>fn,sleepable:()=>atHome,confirmBox:async question=>{prompts.push(question);return confirmed;},undoWindow:async()=>!undone,data:{node_id:'synthetic-home'},node:()=>({name:'Teszt hely'}),label:n=>n.name,t,
      document:{body:{classList:{add(){},remove(){}}}},talk:null,talkCharacter:null,mode:'map',current:null,root:{},render:async()=>{},toast(){},
      api:async(route,body)=>{calls.push({route,body});return {clock:{weekday:'kedd',slot:'reggel'}};}};
    vm.createContext(ctx);vm.runInContext(binding,ctx);await button.onclick();
    assert.equal(calls.length,expectedCalls);assert.equal(prompts.length,atHome?0:1);
    if(calls.length){assert.equal(calls[0].route,'/api/play/wait');assert.equal(calls[0].body.until,'morning');}
  }
});

test('B25 duplicate sleep clicks cannot start parallel deferrals or writes',async()=>{
  const binding=source.slice(source.indexOf('    let waitPending=false;'),source.indexOf("    for(const b of $$('.play-top [data-play-town]'))"));
  let finish,windows=0,calls=0;const button={dataset:{playWait:'morning'}};
  const ctx={$$:()=>[button],wrap:fn=>fn,sleepable:()=>true,undoWindow:()=>{windows++;return new Promise(resolve=>{finish=resolve;});},data:{node_id:'home'},t,api:async()=>{calls++;}};
  vm.createContext(ctx);vm.runInContext(binding,ctx);const first=button.onclick();await button.onclick();assert.equal(windows,1);assert.equal(calls,0);finish(false);await first;assert.equal(calls,0);assert.equal(button.disabled,false);
});
