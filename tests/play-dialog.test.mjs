import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {bindGrowingInput,previousConversationHtml} from '../app/public/play-dialog.js';

test('A3/B11 textarea grows to five lines, handles Enter/Shift/IME and recalls only into an empty draft',()=>{
  let sends=0;const listeners={},input={style:{},value:'',scrollHeight:300,addEventListener:(key,fn)=>listeners[key]=fn,setSelectionRange(){}};
  bindGrowingInput(input,{submit:()=>sends++,lastLine:()=> 'Előző saját mondat.',view:{getComputedStyle:()=>({lineHeight:'22px',paddingTop:'9px',paddingBottom:'9px'})}});
  assert.equal(input.style.height,'130px');assert.equal(input.style.overflowY,'auto');
  const key=(key,extra={})=>{const event={key,preventDefault(){this.prevented=true;},...extra};input.onkeydown(event);return event;};
  assert.ok(key('Enter').prevented);assert.equal(sends,1);key('Enter',{shiftKey:true});key('Enter',{isComposing:true});assert.equal(sends,1);
  assert.ok(key('ArrowUp').prevented);assert.equal(input.value,'Előző saját mondat.');input.value='Saját piszkozat';key('ArrowUp');assert.equal(input.value,'Saját piszkozat');
  input.scrollHeight=42;listeners.input();assert.equal(input.style.height,'42px');assert.equal(input.style.overflowY,'hidden');
});
test('B11 suggestions edit by default, double-click sends once, legacy single-click is explicit',()=>{
  const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('  function bindQuickChoices('),source.indexOf('  async function startTalk('));
  for(const quick_send of [false,true]){
    let sent=0;const button={dataset:{quick:'Teszt javaslat'}},input={value:'',dispatchEvent(){},focus(){},setSelectionRange(){}};
    const ctx={settings:{quick_send},t:key=>key,$$:()=>[button],$:()=>input,Event:class{},submitWith:()=>sent++};vm.createContext(ctx);vm.runInContext(fn+';bindQuickChoices();',ctx);
    button.onclick({detail:1});assert.equal(sent,quick_send?1:0);if(!quick_send)assert.equal(input.value,'Teszt javaslat');
    button.onclick({detail:2});button.ondblclick({preventDefault(){}});assert.equal(sent,1);
  }
});
test('B14 reminder includes only the last shared talk, an open promise and a pending appointment, escaped',()=>{
  const esc=s=>String(s).replaceAll('<','&lt;');
  const html=previousConversationHtml({talks:[{world_day:'2026-11-15',title:'Könyv',summary:'<szöveg>'},{summary:'OLDER'}],threads:[{status:'kept',text:'DONE'},{status:'open',text:'<ígéret>'}],appointments:[{status:'declined',place:'NO'},{status:'accepted',world_day:'2026-11-17',slot:'este',place:'Teszt park'}],memories:['PRIVATE'],friends:['SECRET']},esc);
  assert.match(html,/&lt;szöveg>/);assert.match(html,/&lt;ígéret>/);assert.match(html,/Teszt park/);assert.doesNotMatch(html,/OLDER|DONE|PRIVATE|SECRET|NO/);
  assert.equal(previousConversationHtml(null,esc),'');
});

test('A4 Escape preserves one-to-one/group conversation identity and cast without saving or calling a model',()=>{
  const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8'),start=source.indexOf("      if(e.key==='Escape'){"),end=source.indexOf('      if(/^(INPUT|TEXTAREA|SELECT)',start);
  const handler=source.slice(start,end);
  for(const groupTalk of [false,true]){
    const talk={id:'synthetic-conversation',status:'open',participants:groupTalk?[{id:'man-a'},{id:'man-b'}]:null},person={id:'man-a'},removed=[];
    const ctx={showHistory:false,talkCharacter:person,talk,talkMinimized:false,groupTalk,photoMode:true,photoSmall:true,$:selector=>({classList:{remove:(...names)=>removed.push(...names)},remove:()=>removed.push(selector)}),renderTalk(){},refreshStage(){},api(){throw Error('No request allowed');}};
    vm.createContext(ctx);vm.runInContext('function key(e){'+handler+'};key({key:"Escape"});',ctx);
    assert.equal(ctx.talk,talk);assert.equal(ctx.talkCharacter,person);assert.equal(ctx.groupTalk,groupTalk);assert.equal(ctx.talkMinimized,true);assert.equal(ctx.photoMode,false);assert.equal(ctx.photoSmall,false);assert.ok(removed.includes('.vn-photo'));
  }
});
